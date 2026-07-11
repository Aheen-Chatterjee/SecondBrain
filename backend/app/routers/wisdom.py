import uuid
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Highlight, JournalEntry, KnowledgeItem, ReviewSchedule
from app.schemas import (
    WisdomCard,
    WisdomDigestOut,
    WisdomFeedbackIn,
    WisdomFeedbackOut,
    WisdomFeedOut,
    WisdomSearchOut,
    WisdomSearchResult,
)
from app.services import feed as feed_service
from app.services import spaced_repetition as sr

router = APIRouter(prefix="/api/wisdom", tags=["wisdom"])


@router.get("/feed", response_model=WisdomFeedOut)
async def get_feed(
    cursor: str | None = None,
    limit: int = Query(default=10, le=50),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WisdomFeedOut:
    candidates, _due = await feed_service.build_candidates(db, user_id)
    ordered = feed_service.assemble_feed(candidates, user_id)
    page, next_cursor = feed_service.paginate(ordered, cursor, limit)

    cards = [
        WisdomCard(
            card_id=c.card_id,
            kind=c.kind,
            title=c.title,
            subtitle=c.subtitle,
            text=c.text,
            image_url=c.image_url,
            item_id=c.item_id,
            object_type=c.object_type,
            object_id=c.object_id,
            due_for_review=c.due_for_review,
        )
        for c in page
    ]
    return WisdomFeedOut(cards=cards, next_cursor=next_cursor)


async def _verify_object_ownership(db: AsyncSession, user_id: uuid.UUID, object_type: str, object_id: uuid.UUID) -> None:
    if object_type == "highlight":
        obj = await db.get(Highlight, object_id)
        if obj is None or obj.user_id != user_id:
            raise HTTPException(status_code=404, detail="Highlight not found")
    else:
        obj = await db.get(KnowledgeItem, object_id)
        if obj is None or obj.user_id != user_id:
            raise HTTPException(status_code=404, detail="Item not found")


@router.post("/feedback", response_model=WisdomFeedbackOut)
async def post_feedback(
    body: WisdomFeedbackIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WisdomFeedbackOut:
    await _verify_object_ownership(db, user_id, body.object_type, body.object_id)
    next_review_at = await sr.apply_feedback(db, user_id, body.object_type, body.object_id, body.action)
    await db.commit()
    return WisdomFeedbackOut(ok=True, next_review_at=next_review_at)


def _match_score(query: str, text: str) -> float:
    if not query or not text:
        return 0.0
    return SequenceMatcher(None, query.lower(), text.lower()).ratio()


@router.get("/search", response_model=WisdomSearchOut)
async def search(
    q: str = "",
    limit: int = Query(default=20, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WisdomSearchOut:
    q = (q or "").strip()
    if not q:
        return WisdomSearchOut(results=[])

    like = f"%{q.lower()}%"

    items_result = await db.execute(
        select(KnowledgeItem).where(
            KnowledgeItem.user_id == user_id,
            (KnowledgeItem.title.ilike(like)) | (KnowledgeItem.summary.ilike(like)) | (KnowledgeItem.raw_content.ilike(like)),
        )
    )
    items = items_result.scalars().all()

    highlights_result = await db.execute(
        select(Highlight).where(Highlight.user_id == user_id, Highlight.text.ilike(like))
    )
    highlights = highlights_result.scalars().all()

    results: list[WisdomSearchResult] = []
    for item in items:
        text = item.summary or item.raw_content or item.title
        score = max(_match_score(q, item.title), _match_score(q, text))
        results.append(WisdomSearchResult(object_type="item", object_id=item.id, title=item.title, text=text[:300], score=round(score, 4)))

    for h in highlights:
        results.append(
            WisdomSearchResult(object_type="highlight", object_id=h.id, title=h.text[:60], text=h.text[:300], score=round(_match_score(q, h.text), 4))
        )

    results.sort(key=lambda r: r.score, reverse=True)
    return WisdomSearchOut(results=results[:limit])


@router.get("/digest", response_model=WisdomDigestOut)
async def digest(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WisdomDigestOut:
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())
    since_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)

    items_result = await db.execute(
        select(KnowledgeItem).where(KnowledgeItem.user_id == user_id, KnowledgeItem.captured_at >= since_dt)
    )
    captured = len(items_result.scalars().all())

    reviewed_result = await db.execute(
        select(ReviewSchedule).where(ReviewSchedule.user_id == user_id, ReviewSchedule.reviews_count > 0)
    )
    reviewed = len(reviewed_result.scalars().all())

    journal_result = await db.execute(
        select(JournalEntry).where(JournalEntry.user_id == user_id, JournalEntry.entry_date >= week_start)
    )
    journal_days = len(journal_result.scalars().all())

    summary = (
        f"This week you captured {captured} new item{'s' if captured != 1 else ''}, "
        f"reviewed {reviewed} piece{'s' if reviewed != 1 else ''} of wisdom, "
        f"and journaled on {journal_days} day{'s' if journal_days != 1 else ''}."
    )

    return WisdomDigestOut(
        week_of=week_start,
        summary=summary,
        stats={"captured": captured, "reviewed": reviewed, "journal_days": journal_days},
    )
