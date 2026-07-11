import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai
from app.auth import get_current_user
from app.db import get_db
from app.models import Highlight, KnowledgeItem, KnowledgeItemTag, Tag
from app.schemas import DistillOut, HighlightOut, ItemDetailOut, ItemsListOut, KnowledgeItemOut, OkOut, RelatedItem
from app.services import spaced_repetition as sr

router = APIRouter(prefix="/api/items", tags=["items"])


async def _tags_for_item(db: AsyncSession, item_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(Tag.name).join(KnowledgeItemTag, KnowledgeItemTag.tag_id == Tag.id).where(
            KnowledgeItemTag.knowledge_item_id == item_id
        )
    )
    return [row[0] for row in result.all()]


async def _tag_ids_for_item(db: AsyncSession, item_id: uuid.UUID) -> set[uuid.UUID]:
    result = await db.execute(select(KnowledgeItemTag.tag_id).where(KnowledgeItemTag.knowledge_item_id == item_id))
    return {row[0] for row in result.all()}


async def _highlights_for_item(db: AsyncSession, item_id: uuid.UUID) -> list[Highlight]:
    result = await db.execute(
        select(Highlight).where(Highlight.knowledge_item_id == item_id).order_by(Highlight.highlighted_at.asc())
    )
    return list(result.scalars().all())


async def _item_out(db: AsyncSession, item: KnowledgeItem) -> KnowledgeItemOut:
    tags = await _tags_for_item(db, item.id)
    highlights = await _highlights_for_item(db, item.id)
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
        highlights_count=len(highlights),
    )


@router.get("", response_model=ItemsListOut)
async def list_items(
    source: str | None = None,
    type: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    limit: int = Query(default=30, le=200),
    offset: int = 0,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ItemsListOut:
    stmt = select(KnowledgeItem).where(KnowledgeItem.user_id == user_id)
    if source:
        stmt = stmt.where(KnowledgeItem.source == source)
    if type:
        stmt = stmt.where(KnowledgeItem.type == type)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(KnowledgeItem.title.ilike(like), KnowledgeItem.summary.ilike(like)))
    if tag:
        stmt = stmt.join(KnowledgeItemTag, KnowledgeItemTag.knowledge_item_id == KnowledgeItem.id).join(
            Tag, Tag.id == KnowledgeItemTag.tag_id
        ).where(Tag.name == tag.lower())

    all_result = await db.execute(stmt)
    all_items = list(all_result.scalars().unique().all())
    all_items.sort(key=lambda i: i.captured_at, reverse=True)
    total = len(all_items)
    page = all_items[offset : offset + limit]

    return ItemsListOut(items=[await _item_out(db, i) for i in page], total=total)


async def _get_owned_item(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> KnowledgeItem:
    item = await db.get(KnowledgeItem, item_id)
    if item is None or item.user_id != user_id:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.get("/{item_id}", response_model=ItemDetailOut)
async def get_item(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ItemDetailOut:
    item = await _get_owned_item(db, user_id, item_id)
    tags = await _tags_for_item(db, item.id)
    highlights = await _highlights_for_item(db, item.id)
    tag_ids = await _tag_ids_for_item(db, item.id)

    related: list[RelatedItem] = []
    if tag_ids:
        candidates_result = await db.execute(
            select(KnowledgeItem, KnowledgeItemTag.tag_id)
            .join(KnowledgeItemTag, KnowledgeItemTag.knowledge_item_id == KnowledgeItem.id)
            .where(
                KnowledgeItem.user_id == user_id,
                KnowledgeItem.id != item.id,
                KnowledgeItemTag.tag_id.in_(tag_ids),
            )
        )
        seen: dict[uuid.UUID, KnowledgeItem] = {}
        for candidate, _tag_id in candidates_result.all():
            seen[candidate.id] = candidate
        for candidate in list(seen.values())[:5]:
            related.append(RelatedItem(id=candidate.id, title=candidate.title, source=candidate.source, reason="shared tags"))

    if len(related) < 5:
        same_source_result = await db.execute(
            select(KnowledgeItem)
            .where(KnowledgeItem.user_id == user_id, KnowledgeItem.id != item.id, KnowledgeItem.source == item.source)
            .order_by(KnowledgeItem.captured_at.desc())
            .limit(5 - len(related))
        )
        existing_ids = {r.id for r in related}
        for candidate in same_source_result.scalars().all():
            if candidate.id not in existing_ids:
                related.append(
                    RelatedItem(id=candidate.id, title=candidate.title, source=candidate.source, reason=f"same source ({item.source})")
                )

    return ItemDetailOut(
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
        highlights_count=len(highlights),
        raw_content=item.raw_content,
        highlights=[
            HighlightOut(
                id=h.id, knowledge_item_id=h.knowledge_item_id, text=h.text, note=h.note,
                photo_url=h.photo_url, source_kind=h.source_kind, highlighted_at=h.highlighted_at,
            )
            for h in highlights
        ],
        related=related,
    )


@router.delete("/{item_id}", response_model=OkOut)
async def delete_item(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OkOut:
    item = await _get_owned_item(db, user_id, item_id)
    highlights = await _highlights_for_item(db, item.id)
    for h in highlights:
        await db.delete(h)
    tag_links_result = await db.execute(select(KnowledgeItemTag).where(KnowledgeItemTag.knowledge_item_id == item.id))
    for link in tag_links_result.scalars().all():
        await db.delete(link)
    await db.delete(item)
    await db.commit()
    return OkOut(ok=True)


@router.post("/{item_id}/distill", response_model=DistillOut)
async def distill_item(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DistillOut:
    item = await _get_owned_item(db, user_id, item_id)
    highlights = await _highlights_for_item(db, item.id)

    content_parts = []
    if item.raw_content:
        content_parts.append(item.raw_content)
    if item.summary:
        content_parts.append(item.summary)
    content_parts.extend(h.text for h in highlights)
    content = "\n".join(content_parts).strip() or item.title

    principles = await ai.distill(content)
    new_highlights: list[Highlight] = []
    for p in principles:
        hl = Highlight(knowledge_item_id=item.id, user_id=user_id, text=p, source_kind="ai")
        db.add(hl)
        new_highlights.append(hl)
    await db.flush()
    for hl in new_highlights:
        await sr.ensure_schedule(db, user_id, "highlight", hl.id)
    await db.commit()
    for hl in new_highlights:
        await db.refresh(hl)

    return DistillOut(
        highlights=[
            HighlightOut(
                id=h.id, knowledge_item_id=h.knowledge_item_id, text=h.text, note=h.note,
                photo_url=h.photo_url, source_kind=h.source_kind, highlighted_at=h.highlighted_at,
            )
            for h in new_highlights
        ]
    )
