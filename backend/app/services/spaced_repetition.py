"""A simple SM-2-ish spaced repetition scheduler."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ReviewSchedule

MAX_INTERVAL_DAYS = 180.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_schedule(
    db: AsyncSession, user_id: uuid.UUID, object_type: str, object_id: uuid.UUID
) -> ReviewSchedule:
    """Create (or return existing) review_schedule row for a newly-created reviewable object."""
    result = await db.execute(
        select(ReviewSchedule).where(
            ReviewSchedule.object_type == object_type, ReviewSchedule.object_id == object_id
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    schedule = ReviewSchedule(
        user_id=user_id,
        object_type=object_type,
        object_id=object_id,
        next_review_at=_now() + timedelta(days=1),
        interval_days=1.0,
        ease=2.5,
    )
    db.add(schedule)
    await db.flush()
    return schedule


async def get_schedule(
    db: AsyncSession, object_type: str, object_id: uuid.UUID
) -> ReviewSchedule | None:
    result = await db.execute(
        select(ReviewSchedule).where(
            ReviewSchedule.object_type == object_type, ReviewSchedule.object_id == object_id
        )
    )
    return result.scalar_one_or_none()


async def apply_feedback(
    db: AsyncSession,
    user_id: uuid.UUID,
    object_type: str,
    object_id: uuid.UUID,
    action: str,
) -> datetime | None:
    """Apply feedback to (or create) the review schedule. Returns next_review_at, or None for 'save'."""
    if action == "save":
        # Favorite without scheduling; don't touch the review schedule.
        schedule = await get_schedule(db, object_type, object_id)
        return schedule.next_review_at if schedule else None

    schedule = await ensure_schedule(db, user_id, object_type, object_id)

    if action == "resonates":
        schedule.interval_days = min(schedule.interval_days * schedule.ease, MAX_INTERVAL_DAYS)
    elif action == "neutral":
        schedule.interval_days = min(schedule.interval_days * 1.3, MAX_INTERVAL_DAYS)
    elif action == "faded":
        schedule.interval_days = 1.0
    elif action == "snoozed":
        schedule.next_review_at = _now() + timedelta(days=7)
        schedule.last_result = action
        schedule.reviews_count += 1
        await db.flush()
        return schedule.next_review_at
    else:
        raise ValueError(f"unknown feedback action: {action}")

    schedule.next_review_at = _now() + timedelta(days=schedule.interval_days)
    schedule.last_result = action
    schedule.reviews_count += 1
    await db.flush()
    return schedule.next_review_at
