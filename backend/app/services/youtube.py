"""YouTube playlist parsing + sync via the YouTube Data API v3."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

import httpx

from app.config import get_settings

PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems"


def parse_playlist_id(url: str) -> str | None:
    url = (url or "").strip()
    try:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        if "list" in qs and qs["list"]:
            return qs["list"][0]
    except Exception:
        pass
    # Fallback: bare playlist id passed directly (e.g. "PLxxxxxxxx")
    match = re.match(r"^[A-Za-z0-9_-]{10,}$", url)
    if match:
        return url
    return None


async def fetch_playlist_items(playlist_id: str, page_token: str | None = None) -> dict:
    settings = get_settings()
    params = {
        "part": "snippet,contentDetails",
        "playlistId": playlist_id,
        "maxResults": "50",
        "key": settings.YOUTUBE_API_KEY,
    }
    if page_token:
        params["pageToken"] = page_token

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(PLAYLIST_ITEMS_URL, params=params)
        resp.raise_for_status()
        return resp.json()


def video_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"
