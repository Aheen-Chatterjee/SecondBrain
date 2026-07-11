"""Wisdom feed assembly: due reviews + newest + serendipity, deterministic daily shuffle."""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Highlight, KnowledgeItem, ReviewSchedule


@dataclass
class Card:
    card_id: str
    kind: str
    title: str
    subtitle: str | None
    text: str
    image_url: str | None
    item_id: uuid.UUID | None
    object_type: str
    object_id: uuid.UUID
    due_for_review: bool
    sort_key: datetime = field(compare=False)


def _highlight_kind(h: Highlight) -> str:
    if h.source_kind == "photo":
        return "photo_page"
    if h.source_kind == "ai":
        return "takeaway"
    return "highlight"


async def build_candidates(db: AsyncSession, user_id: uuid.UUID) -> tuple[list[Card], set[tuple[str, uuid.UUID]]]:
    now = datetime.now(timezone.utc)

    # Due review schedule rows for this user.
    due_result = await db.execute(
        select(ReviewSchedule).where(
            ReviewSchedule.user_id == user_id, ReviewSchedule.next_review_at <= now
        )
    )
    due_rows = due_result.scalars().all()
    due_set: set[tuple[str, uuid.UUID]] = {(r.object_type, r.object_id) for r in due_rows}

    # All items for this user, keyed by id, for joining.
    items_result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.user_id == user_id))
    items = {i.id: i for i in items_result.scalars().all()}

    # All highlights for this user.
    highlights_result = await db.execute(select(Highlight).where(Highlight.user_id == user_id))
    highlights = highlights_result.scalars().all()

    highlighted_item_ids: set[uuid.UUID] = set()
    cards: list[Card] = []

    for h in highlights:
        item = items.get(h.knowledge_item_id)
        if item is None:
            continue
        highlighted_item_ids.add(item.id)
        subtitle = " · ".join(p for p in [item.author, item.source] if p) or None
        cards.append(
            Card(
                card_id=f"hl:{h.id}",
                kind=_highlight_kind(h),
                title=item.title,
                subtitle=subtitle,
                text=h.text,
                image_url=h.photo_url,
                item_id=item.id,
                object_type="highlight",
                object_id=h.id,
                due_for_review=("highlight", h.id) in due_set,
                sort_key=h.highlighted_at,
            )
        )

    # Items with no highlights become their own card (e.g. a video or note captured but not yet
    # broken into highlights).
    for item in items.values():
        if item.id in highlighted_item_ids:
            continue
        kind = "video" if item.type == "video" else "quote"
        text = item.summary or item.title
        subtitle = " · ".join(p for p in [item.author, item.source] if p) or None
        cards.append(
            Card(
                card_id=f"it:{item.id}",
                kind=kind,
                title=item.title,
                subtitle=subtitle,
                text=text,
                image_url=item.thumbnail_url,
                item_id=item.id,
                object_type="item",
                object_id=item.id,
                due_for_review=("item", item.id) in due_set,
                sort_key=item.captured_at,
            )
        )

    return cards, due_set


def assemble_feed(cards: list[Card], user_id: uuid.UUID, today: date | None = None) -> list[Card]:
    """Order: due-for-review first, then newest, then serendipity (older, random). Dedup by
    (object_type, object_id). Deterministic daily shuffle within each bucket."""
    today = today or datetime.now(timezone.utc).date()
    seed = f"{user_id}:{today.isoformat()}"
    rng = random.Random(seed)

    seen: set[tuple[str, uuid.UUID]] = set()

    due = [c for c in cards if c.due_for_review]
    rest = [c for c in cards if not c.due_for_review]
    rest_sorted = sorted(rest, key=lambda c: c.sort_key, reverse=True)

    newest_cutoff = 20
    newest = rest_sorted[:newest_cutoff]
    older = rest_sorted[newest_cutoff:]

    rng.shuffle(due)
    rng.shuffle(newest)
    serendipity = older[:]
    rng.shuffle(serendipity)

    ordered: list[Card] = []
    for bucket in (due, newest, serendipity):
        for c in bucket:
            key = (c.object_type, c.object_id)
            if key in seen:
                continue
            seen.add(key)
            ordered.append(c)

    return ordered


def paginate(cards: list[Card], cursor: str | None, limit: int) -> tuple[list[Card], str | None]:
    offset = 0
    if cursor:
        try:
            offset = max(0, int(cursor))
        except ValueError:
            offset = 0
    page = cards[offset : offset + limit]
    next_offset = offset + limit
    next_cursor = str(next_offset) if next_offset < len(cards) else None
    return page, next_cursor
