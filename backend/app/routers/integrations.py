import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai
from app.auth import get_current_user
from app.config import get_settings
from app.db import get_db
from app.models import Integration, KnowledgeItem
from app.schemas import (
    IntegrationOut,
    IntegrationsListOut,
    YoutubeIntegrationIn,
    YoutubeIntegrationOut,
    YoutubeSyncOut,
)
from app.services import spaced_repetition as sr
from app.services import youtube as youtube_service

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.post("/youtube", response_model=YoutubeIntegrationOut)
async def connect_youtube(
    body: YoutubeIntegrationIn,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> YoutubeIntegrationOut:
    playlist_id = youtube_service.parse_playlist_id(body.playlist_url)
    if not playlist_id:
        raise HTTPException(status_code=422, detail="Could not parse a playlist id from that URL")

    result = await db.execute(
        select(Integration).where(Integration.user_id == user_id, Integration.provider == "youtube")
    )
    integration = result.scalar_one_or_none()
    if integration is None:
        integration = Integration(user_id=user_id, provider="youtube", config={"playlist_id": playlist_id})
        db.add(integration)
    else:
        integration.config = {**(integration.config or {}), "playlist_id": playlist_id}
        integration.status = "active"

    await db.commit()
    return YoutubeIntegrationOut(ok=True, playlist_id=playlist_id)


@router.post("/youtube/sync", response_model=YoutubeSyncOut)
async def sync_youtube(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> YoutubeSyncOut:
    settings = get_settings()
    if not settings.YOUTUBE_API_KEY:
        return YoutubeSyncOut(imported=0, detail="no api key")

    result = await db.execute(
        select(Integration).where(Integration.user_id == user_id, Integration.provider == "youtube")
    )
    integration = result.scalar_one_or_none()
    if integration is None or not (integration.config or {}).get("playlist_id"):
        return YoutubeSyncOut(imported=0, detail="no playlist configured")

    playlist_id = integration.config["playlist_id"]

    try:
        data = await youtube_service.fetch_playlist_items(playlist_id)
    except Exception:
        integration.status = "error"
        await db.commit()
        return YoutubeSyncOut(imported=0, detail="youtube api request failed")

    imported = 0
    for entry in data.get("items", []):
        snippet = entry.get("snippet", {})
        video_id = (snippet.get("resourceId") or {}).get("videoId")
        if not video_id:
            continue
        url = youtube_service.video_url(video_id)
        dedup_key = url

        existing_result = await db.execute(
            select(KnowledgeItem).where(KnowledgeItem.user_id == user_id, KnowledgeItem.dedup_key == dedup_key)
        )
        if existing_result.scalar_one_or_none() is not None:
            continue

        title = snippet.get("title") or url
        thumbnail = None
        thumbnails = snippet.get("thumbnails") or {}
        for key in ("high", "medium", "default"):
            if key in thumbnails:
                thumbnail = thumbnails[key].get("url")
                break
        description = snippet.get("description") or ""
        summary = await ai.summarize(description) if description else None

        item = KnowledgeItem(
            user_id=user_id,
            source="youtube",
            type="video",
            title=title,
            author=snippet.get("channelTitle") or snippet.get("videoOwnerChannelTitle"),
            url=url,
            thumbnail_url=thumbnail,
            raw_content=description or None,
            summary=summary,
            dedup_key=dedup_key,
        )
        db.add(item)
        await db.flush()
        await sr.ensure_schedule(db, user_id, "item", item.id)
        imported += 1

    integration.last_synced_at = datetime.now(timezone.utc)
    integration.status = "active"
    await db.commit()

    return YoutubeSyncOut(imported=imported)


@router.get("", response_model=IntegrationsListOut)
async def list_integrations(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationsListOut:
    result = await db.execute(select(Integration).where(Integration.user_id == user_id))
    rows = result.scalars().all()
    return IntegrationsListOut(
        integrations=[
            IntegrationOut(provider=r.provider, status=r.status, config=r.config or {}, last_synced_at=r.last_synced_at)
            for r in rows
        ]
    )
