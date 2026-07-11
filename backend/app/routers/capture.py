import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai
from app.auth import get_current_user
from app.config import get_settings
from app.db import get_db
from app.models import Highlight, KnowledgeItem, KnowledgeItemTag, Tag
from app.schemas import CaptureBookIn, CaptureBookOut, CaptureLinkIn, CaptureNoteIn, HighlightOut, KnowledgeItemOut
from app.services import enrichment
from app.services import spaced_repetition as sr
from app.services import storage

router = APIRouter(prefix="/api/capture", tags=["capture"])


async def _tags_for_item(db: AsyncSession, item_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(Tag.name).join(KnowledgeItemTag, KnowledgeItemTag.tag_id == Tag.id).where(
            KnowledgeItemTag.knowledge_item_id == item_id
        )
    )
    return [row[0] for row in result.all()]


async def _highlights_count(db: AsyncSession, item_id: uuid.UUID) -> int:
    result = await db.execute(select(Highlight).where(Highlight.knowledge_item_id == item_id))
    return len(result.scalars().all())


async def _item_out(db: AsyncSession, item: KnowledgeItem) -> KnowledgeItemOut:
    tags = await _tags_for_item(db, item.id)
    count = await _highlights_count(db, item.id)
    return KnowledgeItemOut(
        id=item.id,
        source=item.source,
        type=item.type,
        title=item.title,
        author=item.author,
        url=item.url,
        thumbnail_url=item.thumbnail_url,
        summary=item.summary,
        reading_time_min=item.reading_time_min,
        captured_at=item.captured_at,
        tags=tags,
        highlights_count=count,
    )


async def _apply_tags(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, tag_names: list[str]) -> None:
    for name in tag_names:
        name = name.strip().lower()
        if not name:
            continue
        result = await db.execute(select(Tag).where(Tag.user_id == user_id, Tag.name == name))
        tag = result.scalar_one_or_none()
        if tag is None:
            tag = Tag(user_id=user_id, name=name)
            db.add(tag)
            await db.flush()
        link_result = await db.execute(
            select(KnowledgeItemTag).where(
                KnowledgeItemTag.knowledge_item_id == item_id, KnowledgeItemTag.tag_id == tag.id
            )
        )
        if link_result.scalar_one_or_none() is None:
            db.add(KnowledgeItemTag(knowledge_item_id=item_id, tag_id=tag.id))


@router.post("/link", response_model=KnowledgeItemOut)
async def capture_link(
    body: CaptureLinkIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeItemOut:
    dedup_key = enrichment.normalize_url(body.url)

    existing_result = await db.execute(
        select(KnowledgeItem).where(KnowledgeItem.user_id == user_id, KnowledgeItem.dedup_key == dedup_key)
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return await _item_out(db, existing)

    enriched = await enrichment.fetch_and_extract(body.url)
    content_type = await ai.classify(body.url, enriched.raw_content or "")
    summary_source = enriched.raw_content or enriched.title
    summary = await ai.summarize(summary_source)
    tags = await ai.tag(summary_source)

    item = KnowledgeItem(
        user_id=user_id,
        source="link",
        type=content_type,
        title=enriched.title,
        author=enriched.author,
        url=body.url,
        thumbnail_url=enriched.thumbnail_url,
        raw_content=enriched.raw_content,
        summary=summary,
        reading_time_min=_estimate_reading_time(enriched.raw_content),
        dedup_key=dedup_key,
    )
    db.add(item)
    await db.flush()
    await _apply_tags(db, user_id, item.id, tags)
    await sr.ensure_schedule(db, user_id, "item", item.id)
    await db.commit()
    await db.refresh(item)
    return await _item_out(db, item)


def _estimate_reading_time(text: str | None) -> int | None:
    if not text:
        return None
    words = len(text.split())
    return max(1, round(words / 200))


@router.post("/note", response_model=KnowledgeItemOut)
async def capture_note(
    body: CaptureNoteIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeItemOut:
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="text is required")

    title = await ai.summarize(text)
    if not title:
        title = text.splitlines()[0][:120] if text.splitlines() else text[:120]
    tags = await ai.tag(text)

    item = KnowledgeItem(
        user_id=user_id,
        source="note",
        type="note",
        title=title,
        raw_content=text,
        summary=None,
        dedup_key=f"note:{uuid.uuid4()}",
    )
    db.add(item)
    await db.flush()
    await _apply_tags(db, user_id, item.id, tags)
    await sr.ensure_schedule(db, user_id, "item", item.id)
    await db.commit()
    await db.refresh(item)
    return await _item_out(db, item)


@router.post("/book", response_model=CaptureBookOut)
async def capture_book(
    body: CaptureBookIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaptureBookOut:
    dedup_key = f"book:{body.title.strip().lower()}:{(body.author or '').strip().lower()}"

    existing_result = await db.execute(
        select(KnowledgeItem).where(KnowledgeItem.user_id == user_id, KnowledgeItem.dedup_key == dedup_key)
    )
    item = existing_result.scalar_one_or_none()
    if item is None:
        item = KnowledgeItem(
            user_id=user_id,
            source="book",
            type="book",
            title=body.title.strip(),
            author=body.author,
            dedup_key=dedup_key,
        )
        db.add(item)
        await db.flush()
        await sr.ensure_schedule(db, user_id, "item", item.id)

    new_highlights: list[Highlight] = []
    if body.reflection and body.reflection.strip():
        cards = await ai.split_reflection(body.reflection)
        for card_text in cards:
            hl = Highlight(
                knowledge_item_id=item.id,
                user_id=user_id,
                text=card_text,
                source_kind="ai",
            )
            db.add(hl)
            new_highlights.append(hl)
        await db.flush()
        for hl in new_highlights:
            await sr.ensure_schedule(db, user_id, "highlight", hl.id)

    await db.commit()
    await db.refresh(item)
    for hl in new_highlights:
        await db.refresh(hl)

    return CaptureBookOut(
        item=await _item_out(db, item),
        highlights=[
            HighlightOut(
                id=h.id,
                knowledge_item_id=h.knowledge_item_id,
                text=h.text,
                note=h.note,
                photo_url=h.photo_url,
                source_kind=h.source_kind,
                highlighted_at=h.highlighted_at,
            )
            for h in new_highlights
        ],
    )


@router.post("/book/{item_id}/photo")
async def capture_book_photo(
    item_id: uuid.UUID,
    photo: UploadFile = File(...),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    item = await db.get(KnowledgeItem, item_id)
    if item is None or item.user_id != user_id:
        raise HTTPException(status_code=404, detail="Item not found")

    image_bytes = await photo.read()
    media_type = photo.content_type or "image/jpeg"

    from app.services import ocr

    text = await ocr.extract_text(image_bytes, media_type=media_type)

    photo_url = await storage.upload_book_photo(user_id, image_bytes, media_type)

    hl = Highlight(
        knowledge_item_id=item.id,
        user_id=user_id,
        text=text,
        photo_url=photo_url,
        source_kind="photo",
    )
    db.add(hl)
    await db.flush()
    await sr.ensure_schedule(db, user_id, "highlight", hl.id)
    await db.commit()
    await db.refresh(hl)

    return {
        "highlight": HighlightOut(
            id=hl.id,
            knowledge_item_id=hl.knowledge_item_id,
            text=hl.text,
            note=hl.note,
            photo_url=hl.photo_url,
            source_kind=hl.source_kind,
            highlighted_at=hl.highlighted_at,
        ).model_dump(mode="json")
    }
