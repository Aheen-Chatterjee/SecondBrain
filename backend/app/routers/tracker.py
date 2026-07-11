import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai
from app.auth import get_current_user
from app.db import get_db
from app.models import JournalEntry, KnowledgeItem, Profile, Widget, WidgetData
from app.schemas import (
    InsightOut,
    OkOut,
    WidgetDataIn,
    WidgetIn,
    WidgetOut,
    WidgetPatchIn,
    WidgetProposal,
    WidgetsOut,
    WidgetSuggestOut,
)
from app.services import widgets as widgets_service

router = APIRouter(prefix="/api/tracker", tags=["tracker"])


async def _widget_out(db: AsyncSession, user_id: uuid.UUID, widget: Widget) -> WidgetOut:
    data = await widgets_service.compute_data(db, user_id, widget)
    return WidgetOut(
        id=widget.id,
        type=widget.type,
        title=widget.title,
        config=widget.config or {},
        position=widget.position,
        size=widget.size,
        is_ai_created=widget.is_ai_created,
        data=data,
    )


@router.get("/widgets", response_model=WidgetsOut)
async def list_widgets(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WidgetsOut:
    result = await db.execute(
        select(Widget).where(Widget.user_id == user_id).order_by(Widget.position.asc())
    )
    rows = result.scalars().all()
    return WidgetsOut(widgets=[await _widget_out(db, user_id, w) for w in rows])


@router.post("/widgets", response_model=WidgetOut)
async def create_widget(
    body: WidgetIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WidgetOut:
    max_pos_result = await db.execute(select(Widget).where(Widget.user_id == user_id))
    existing = max_pos_result.scalars().all()
    position = max((w.position for w in existing), default=-1) + 1

    widget = Widget(
        user_id=user_id,
        type=body.type,
        title=body.title,
        config=body.config or {},
        position=position,
        size=body.size or "half",
        is_ai_created=body.from_suggestion,
    )
    db.add(widget)
    await db.commit()
    await db.refresh(widget)
    return await _widget_out(db, user_id, widget)


async def _get_owned_widget(db: AsyncSession, user_id: uuid.UUID, widget_id: uuid.UUID) -> Widget:
    widget = await db.get(Widget, widget_id)
    if widget is None or widget.user_id != user_id:
        raise HTTPException(status_code=404, detail="Widget not found")
    return widget


@router.patch("/widgets/{widget_id}", response_model=WidgetOut)
async def patch_widget(
    widget_id: uuid.UUID,
    body: WidgetPatchIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WidgetOut:
    widget = await _get_owned_widget(db, user_id, widget_id)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(widget, key, value)
    await db.commit()
    await db.refresh(widget)
    return await _widget_out(db, user_id, widget)


@router.delete("/widgets/{widget_id}", response_model=OkOut)
async def delete_widget(
    widget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OkOut:
    widget = await _get_owned_widget(db, user_id, widget_id)
    data_result = await db.execute(select(WidgetData).where(WidgetData.widget_id == widget.id))
    for row in data_result.scalars().all():
        await db.delete(row)
    await db.delete(widget)
    await db.commit()
    return OkOut(ok=True)


@router.post("/widgets/{widget_id}/data", response_model=OkOut)
async def add_widget_data(
    widget_id: uuid.UUID,
    body: WidgetDataIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OkOut:
    widget = await _get_owned_widget(db, user_id, widget_id)
    point = WidgetData(
        widget_id=widget.id,
        user_id=user_id,
        value=body.value,
        ts=body.ts or datetime.now(timezone.utc),
    )
    db.add(point)
    await db.commit()
    return OkOut(ok=True)


@router.post("/suggest", response_model=WidgetSuggestOut)
async def suggest(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WidgetSuggestOut:
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.user_id == user_id).order_by(JournalEntry.entry_date.desc()).limit(10)
    )
    entries = result.scalars().all()
    texts = [e.body for e in entries if e.body]
    proposals = await ai.suggest_widgets(texts)
    return WidgetSuggestOut(proposals=[WidgetProposal(**p) for p in proposals])


@router.get("/insight", response_model=InsightOut)
async def insight(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InsightOut:
    profile = await db.get(Profile, user_id)
    today_str = datetime.now(timezone.utc).date().isoformat()
    settings_data = dict(profile.settings or {})
    cache = settings_data.get("insight_cache") or {}
    if cache.get("date") == today_str:
        return InsightOut(insight=cache.get("text"))

    widgets_result = await db.execute(select(Widget).where(Widget.user_id == user_id))
    widget_rows = widgets_result.scalars().all()
    dashboard_data = {}
    for w in widget_rows:
        dashboard_data[w.title] = await widgets_service.compute_data(db, user_id, w)

    items_result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.user_id == user_id))
    dashboard_data["items_captured_total"] = len(items_result.scalars().all())

    text = await ai.dashboard_insight(dashboard_data)

    settings_data["insight_cache"] = {"date": today_str, "text": text}
    profile.settings = settings_data
    await db.commit()

    return InsightOut(insight=text)
