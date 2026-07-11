import uuid

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.models import Profile

DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return auth_header.split(" ", 1)[1].strip()


async def get_current_user_id(request: Request) -> uuid.UUID:
    settings = get_settings()
    token = _extract_bearer_token(request)

    if settings.AUTH_DEV_MODE and token == "dev":
        return DEV_USER_ID

    if not settings.SUPABASE_JWT_SECRET:
        # No way to verify a real JWT; only dev mode works.
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token: no sub claim")

    try:
        return uuid.UUID(str(sub))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token: bad sub claim") from exc


async def get_current_user(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """Verify the JWT and ensure a profiles row exists for the user."""
    existing = await db.get(Profile, user_id)
    if existing is None:
        profile = Profile(user_id=user_id)
        db.add(profile)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            # Row may have been created concurrently; re-check.
            existing = await db.get(Profile, user_id)
            if existing is None:
                raise
    return user_id
