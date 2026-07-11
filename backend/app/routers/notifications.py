from datetime import datetime, timezone

import httpx
from fastapi import APIRouter
from sqlalchemy import select

from app.db import async_session_maker
from app.models import NotificationLog, Profile, ReviewSchedule
from app.schemas import DispatchOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _in_quiet_hours(hour: int, start: int, end: int) -> bool:
    if start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


@router.post("/dispatch", response_model=DispatchOut)
async def dispatch() -> DispatchOut:
    sent = 0
    now = datetime.now(timezone.utc)

    async with async_session_maker() as db:
        profiles_result = await db.execute(
            select(Profile).where(Profile.expo_push_token.is_not(None), Profile.notif_frequency != "off")
        )
        profiles = profiles_result.scalars().all()

        for profile in profiles:
            if _in_quiet_hours(now.hour, profile.quiet_hours_start, profile.quiet_hours_end):
                continue

            due_result = await db.execute(
                select(ReviewSchedule)
                .where(ReviewSchedule.user_id == profile.user_id, ReviewSchedule.next_review_at <= now)
                .order_by(ReviewSchedule.next_review_at.asc())
                .limit(1)
            )
            due = due_result.scalar_one_or_none()
            if due is None:
                continue

            message = "A piece of wisdom you captured is ready to revisit."
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    await client.post(
                        EXPO_PUSH_URL,
                        json={
                            "to": profile.expo_push_token,
                            "title": "Second Brain",
                            "body": message,
                            "data": {"object_type": due.object_type, "object_id": str(due.object_id)},
                        },
                    )
            except Exception:
                # Best-effort: still log the attempt so the schedule doesn't spam-retry forever.
                pass

            log = NotificationLog(
                user_id=profile.user_id,
                type="remember",
                object_type=due.object_type,
                object_id=due.object_id,
            )
            db.add(log)
            sent += 1

        await db.commit()

    return DispatchOut(sent=sent)
