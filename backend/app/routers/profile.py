import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Profile
from app.schemas import OkOut, ProfileIn, ProfileOut, PushTokenIn

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
async def get_profile(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = await db.get(Profile, user_id)
    return ProfileOut(
        display_name=profile.display_name,
        ai_tone=profile.ai_tone,
        quiet_hours_start=profile.quiet_hours_start,
        quiet_hours_end=profile.quiet_hours_end,
        notif_frequency=profile.notif_frequency,
    )


@router.put("", response_model=ProfileOut)
async def update_profile(
    body: ProfileIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = await db.get(Profile, user_id)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(profile, key, value)
    await db.commit()
    await db.refresh(profile)
    return ProfileOut(
        display_name=profile.display_name,
        ai_tone=profile.ai_tone,
        quiet_hours_start=profile.quiet_hours_start,
        quiet_hours_end=profile.quiet_hours_end,
        notif_frequency=profile.notif_frequency,
    )


@router.post("/push-token", response_model=OkOut)
async def set_push_token(
    body: PushTokenIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OkOut:
    profile = await db.get(Profile, user_id)
    profile.expo_push_token = body.expo_push_token
    await db.commit()
    return OkOut(ok=True)
