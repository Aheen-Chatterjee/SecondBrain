"""Server-computed `data` payloads for tracker widgets, per API.md."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Highlight,
    JournalEntry,
    KnowledgeItem,
    KnowledgeItemTag,
    Tag,
    Widget,
    WidgetData,
)


def _today() -> date:
    return datetime.now(timezone.utc).date()


async def _latest_widget_values(db: AsyncSession, widget_id: uuid.UUID, limit: int = 400) -> list[WidgetData]:
    result = await db.execute(
        select(WidgetData).where(WidgetData.widget_id == widget_id).order_by(WidgetData.ts.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def _metric_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    config = widget.config or {}
    metric = config.get("metric", "manual")
    label = config.get("label") or widget.title

    if metric == "items_captured":
        result = await db.execute(
            select(func.count()).select_from(KnowledgeItem).where(KnowledgeItem.user_id == user_id)
        )
        value = result.scalar_one() or 0
    elif metric == "books_finished":
        result = await db.execute(
            select(func.count())
            .select_from(KnowledgeItem)
            .where(KnowledgeItem.user_id == user_id, KnowledgeItem.source == "book")
        )
        value = result.scalar_one() or 0
    else:
        points = await _latest_widget_values(db, widget.id, limit=1)
        value = 0
        if points:
            val = points[0].value or {}
            value = val.get("value", 0)

    return {"value": value, "label": label}


async def _habit_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    points = await _latest_widget_values(db, widget.id)
    done_dates: set[date] = set()
    for p in points:
        val = p.value or {}
        if val.get("done"):
            ts = p.ts
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            done_dates.add(ts.date())

    today = _today()
    week: list[bool] = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        week.append(day in done_dates)

    streak = 0
    cursor = today
    while cursor in done_dates:
        streak += 1
        cursor -= timedelta(days=1)

    return {"streak": streak, "week": week}


async def _mood_chart_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    since = _today() - timedelta(days=30)
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.user_id == user_id, JournalEntry.entry_date >= since)
        .order_by(JournalEntry.entry_date.asc())
    )
    entries = result.scalars().all()
    points = [
        {"date": e.entry_date.isoformat(), "mood": e.mood, "energy": e.energy} for e in entries
    ]
    return {"points": points}


async def _reading_stats_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    today = _today()
    week_start = today - timedelta(days=today.weekday())
    since_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)

    result = await db.execute(
        select(KnowledgeItem).where(
            KnowledgeItem.user_id == user_id, KnowledgeItem.captured_at >= since_dt
        )
    )
    items = result.scalars().all()
    by_source = {"book": 0, "youtube": 0, "link": 0, "note": 0}
    for item in items:
        if item.source in by_source:
            by_source[item.source] += 1
        else:
            by_source[item.source] = by_source.get(item.source, 0) + 1

    return {"captured_this_week": len(items), "by_source": by_source}


async def _goal_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    config = widget.config or {}
    target = config.get("target", 0)
    points = await _latest_widget_values(db, widget.id)
    current = 0
    for p in points:
        val = p.value or {}
        if "value" in val:
            try:
                current += float(val["value"])
            except (TypeError, ValueError):
                pass
    if current == int(current):
        current = int(current)
    return {"current": current, "target": target}


async def _journal_streak_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    result = await db.execute(
        select(JournalEntry.entry_date).where(JournalEntry.user_id == user_id).order_by(JournalEntry.entry_date.desc())
    )
    dates = {row[0] for row in result.all()}

    today = _today()
    streak = 0
    cursor = today
    # allow streak to still count if today has no entry yet but yesterday chain exists
    if cursor not in dates:
        cursor -= timedelta(days=1)
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)

    best = 0
    if dates:
        sorted_dates = sorted(dates)
        run = 1
        best = 1
        for i in range(1, len(sorted_dates)):
            if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
                run += 1
            else:
                run = 1
            best = max(best, run)

    return {"streak": streak, "best": best}


async def _topics_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    result = await db.execute(
        select(Tag.name, func.count(KnowledgeItemTag.knowledge_item_id))
        .join(KnowledgeItemTag, KnowledgeItemTag.tag_id == Tag.id)
        .where(Tag.user_id == user_id)
        .group_by(Tag.name)
        .order_by(func.count(KnowledgeItemTag.knowledge_item_id).desc())
        .limit(10)
    )
    topics = [{"name": name, "count": count} for name, count in result.all()]
    return {"topics": topics}


async def _quote_of_day_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    result = await db.execute(
        select(Highlight, KnowledgeItem)
        .join(KnowledgeItem, KnowledgeItem.id == Highlight.knowledge_item_id)
        .where(Highlight.user_id == user_id)
        .order_by(Highlight.highlighted_at.asc())
    )
    rows = result.all()
    if not rows:
        return {"text": None, "title": None, "author": None}

    day_of_year = _today().timetuple().tm_yday
    idx = day_of_year % len(rows)
    highlight, item = rows[idx]
    return {"text": highlight.text, "title": item.title, "author": item.author}


_COMPUTE = {
    "metric": _metric_data,
    "habit": _habit_data,
    "mood_chart": _mood_chart_data,
    "reading_stats": _reading_stats_data,
    "goal": _goal_data,
    "journal_streak": _journal_streak_data,
    "topics": _topics_data,
    "quote_of_day": _quote_of_day_data,
}


async def compute_data(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> dict:
    fn = _COMPUTE.get(widget.type)
    if fn is None:
        return {}
    try:
        return await fn(db, user_id, widget)
    except Exception:
        return {}
