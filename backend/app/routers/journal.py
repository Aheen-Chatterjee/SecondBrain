import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai
from app.auth import get_current_user
from app.db import get_db
from app.models import Highlight, JournalChat, JournalEntry, KnowledgeItem, Profile
from app.schemas import (
    ChatIn,
    ChatMessageOut,
    ChatMessagesOut,
    ChatOut,
    JournalEntriesListOut,
    JournalEntryIn,
    JournalEntryOut,
    JournalEntryPreview,
    Suggestion,
)

router = APIRouter(prefix="/api/journal", tags=["journal"])


def _preview(body: str, n: int = 140) -> str:
    body = body or ""
    return body[:n]


@router.get("/entries", response_model=JournalEntriesListOut)
async def list_entries(
    year: int,
    month: int,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntriesListOut:
    result = await db.execute(
        select(JournalEntry)
        .where(
            JournalEntry.user_id == user_id,
            extract("year", JournalEntry.entry_date) == year,
            extract("month", JournalEntry.entry_date) == month,
        )
        .order_by(JournalEntry.entry_date.asc())
    )
    entries = result.scalars().all()
    return JournalEntriesListOut(
        entries=[
            JournalEntryPreview(
                id=e.id, entry_date=e.entry_date, mood=e.mood, energy=e.energy, preview=_preview(e.body)
            )
            for e in entries
        ]
    )


@router.get("/on-this-day", response_model=JournalEntriesListOut)
async def on_this_day(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntriesListOut:
    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(JournalEntry)
        .where(
            JournalEntry.user_id == user_id,
            extract("day", JournalEntry.entry_date) == today.day,
            extract("month", JournalEntry.entry_date) == today.month,
        )
        .order_by(JournalEntry.entry_date.desc())
    )
    entries = [e for e in result.scalars().all() if e.entry_date != today]
    return JournalEntriesListOut(
        entries=[
            JournalEntryPreview(
                id=e.id, entry_date=e.entry_date, mood=e.mood, energy=e.energy, preview=_preview(e.body)
            )
            for e in entries
        ]
    )


@router.get("/entries/{entry_date}", response_model=JournalEntryOut)
async def get_entry(
    entry_date: date,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntryOut:
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.user_id == user_id, JournalEntry.entry_date == entry_date)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="No entry for that date")
    return JournalEntryOut(
        id=entry.id,
        entry_date=entry.entry_date,
        body=entry.body,
        mood=entry.mood,
        energy=entry.energy,
        updated_at=entry.updated_at,
    )


@router.put("/entries/{entry_date}", response_model=JournalEntryOut)
async def upsert_entry(
    entry_date: date,
    body: JournalEntryIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntryOut:
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.user_id == user_id, JournalEntry.entry_date == entry_date)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        entry = JournalEntry(user_id=user_id, entry_date=entry_date)
        db.add(entry)
    entry.body = body.body
    entry.mood = body.mood
    entry.energy = body.energy
    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return JournalEntryOut(
        id=entry.id,
        entry_date=entry.entry_date,
        body=entry.body,
        mood=entry.mood,
        energy=entry.energy,
        updated_at=entry.updated_at,
    )


async def _get_owned_entry(db: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> JournalEntry:
    entry = await db.get(JournalEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@router.get("/entries/{entry_id}/chat", response_model=ChatMessagesOut)
async def get_chat(
    entry_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatMessagesOut:
    await _get_owned_entry(db, user_id, entry_id)
    result = await db.execute(
        select(JournalChat).where(JournalChat.entry_id == entry_id).order_by(JournalChat.created_at.asc())
    )
    messages = result.scalars().all()
    return ChatMessagesOut(
        messages=[
            ChatMessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at) for m in messages
        ]
    )


def _keyword_overlap_score(query_words: set[str], text: str) -> int:
    text_words = set(w.lower() for w in text.split() if len(w) > 3)
    return len(query_words & text_words)


@router.post("/entries/{entry_id}/chat", response_model=ChatOut)
async def post_chat(
    entry_id: uuid.UUID,
    body: ChatIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatOut:
    entry = await _get_owned_entry(db, user_id, entry_id)

    history_result = await db.execute(
        select(JournalChat).where(JournalChat.entry_id == entry_id).order_by(JournalChat.created_at.asc())
    )
    history_rows = history_result.scalars().all()

    user_message = (body.message or "").strip()
    if user_message:
        user_chat = JournalChat(entry_id=entry_id, user_id=user_id, role="user", content=user_message)
        db.add(user_chat)
        await db.flush()

    # Retrieval context: last 5 entries + top 5 highlights matching naive keyword overlap.
    recent_result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.user_id == user_id, JournalEntry.id != entry_id)
        .order_by(JournalEntry.entry_date.desc())
        .limit(5)
    )
    recent_entries = recent_result.scalars().all()

    query_text = user_message or entry.body or ""
    query_words = set(w.lower() for w in query_text.split() if len(w) > 3)

    highlights_result = await db.execute(select(Highlight).where(Highlight.user_id == user_id).limit(200))
    highlights = highlights_result.scalars().all()
    scored = sorted(
        highlights, key=lambda h: _keyword_overlap_score(query_words, h.text), reverse=True
    )
    top_highlights = [h for h in scored if _keyword_overlap_score(query_words, h.text) > 0][:5]

    context_items = [f"Past entry ({e.entry_date}): {e.body[:200]}" for e in recent_entries]
    context_items += [f"Highlight: {h.text[:200]}" for h in top_highlights]

    profile = await db.get(Profile, user_id)
    tone = profile.ai_tone if profile else "warm"

    history_for_ai = [{"role": h.role, "content": h.content} for h in history_rows]
    if user_message:
        history_for_ai.append({"role": "user", "content": user_message})

    reply_text, raw_suggestions = await ai.journal_chat(
        entry=entry.body, history=history_for_ai, tone=tone, context_items=context_items
    )

    assistant_chat = JournalChat(entry_id=entry_id, user_id=user_id, role="assistant", content=reply_text)
    db.add(assistant_chat)
    await db.commit()
    await db.refresh(assistant_chat)

    suggestions = [Suggestion(**s) for s in raw_suggestions] if raw_suggestions else []

    return ChatOut(
        reply=ChatMessageOut(
            id=assistant_chat.id,
            role="assistant",
            content=assistant_chat.content,
            created_at=assistant_chat.created_at,
        ),
        suggestions=suggestions,
    )
