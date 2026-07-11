"""OCR for photographed book pages.

Delegates to app.ai.extract_page_text (Claude vision) when an AI key is
configured. When it isn't, or the call fails/returns nothing, callers should
use FALLBACK_TEXT so the capture flow still succeeds end-to-end.
"""

from __future__ import annotations

from app import ai

FALLBACK_TEXT = "Photo captured — connect an AI key to extract the text."


async def extract_text(image_bytes: bytes, media_type: str = "image/jpeg") -> str:
    text = await ai.extract_page_text(image_bytes, media_type=media_type)
    return text.strip() if text and text.strip() else FALLBACK_TEXT
