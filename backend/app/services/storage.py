"""Best-effort upload of book-page photos to Supabase Storage.

If SUPABASE_URL + SUPABASE_SERVICE_KEY aren't configured (or the upload
fails), returns None so the caller can proceed with photo_url=null.
"""

from __future__ import annotations

import uuid

import httpx

from app.config import get_settings

BUCKET = "book-photos"


async def upload_book_photo(user_id: uuid.UUID, image_bytes: bytes, content_type: str = "image/jpeg") -> str | None:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY or not image_bytes:
        return None

    object_path = f"{user_id}/{uuid.uuid4()}.jpg"
    upload_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/{BUCKET}/{object_path}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                upload_url,
                content=image_bytes,
                headers={
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                    "apikey": settings.SUPABASE_SERVICE_KEY,
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
            )
            if resp.status_code >= 400:
                return None
        return f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{BUCKET}/{object_path}"
    except Exception:
        return None
