"""Thin, typed wrapper around the Anthropic API.

Every public function here is designed to NEVER raise: if `ANTHROPIC_API_KEY`
is unset, or any call to the API fails for any reason, we fall back to a
deterministic, non-AI implementation so the surrounding endpoint still
succeeds (see docs/API.md "AI degradation rules").
"""

from __future__ import annotations

import base64
import re
from collections import Counter

from app.config import get_settings

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in",
    "on", "for", "with", "is", "are", "was", "were", "be", "been", "being",
    "it", "this", "that", "these", "those", "i", "you", "he", "she", "we",
    "they", "at", "by", "from", "as", "so", "not", "no", "do", "does",
    "did", "have", "has", "had", "my", "your", "his", "her", "our",
    "their", "about", "into", "over", "after", "before", "up", "down",
    "out", "just", "than", "too", "very", "can", "will", "would", "should",
    "could", "there", "what", "when", "where", "who", "how", "which",
}


def _client():
    """Return an AsyncAnthropic client, or None if no key configured."""
    settings = get_settings()
    if not settings.ai_configured:
        return None
    try:
        import anthropic

        return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    except Exception:
        return None


def _model() -> str:
    return get_settings().ANTHROPIC_MODEL


async def _complete(system: str, user: str, max_tokens: int = 512) -> str | None:
    """Single-turn text completion. Returns None on any failure."""
    client = _client()
    if client is None:
        return None
    try:
        resp = await client.messages.create(
            model=_model(),
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
        return "\n".join(parts).strip() or None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Deterministic fallbacks
# ---------------------------------------------------------------------------


def _fallback_summarize(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(sentences[:2]).strip()[:500]


def _fallback_tags(text: str, limit: int = 5) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", (text or "").lower())
    words = [w for w in words if w not in _STOPWORDS]
    counts = Counter(words)
    return [w for w, _ in counts.most_common(limit)]


def _fallback_split_reflection(reflection: str) -> list[str]:
    reflection = (reflection or "").strip()
    if not reflection:
        return []
    # split on paragraph boundaries first, then sentences
    parts: list[str] = []
    for para in re.split(r"\n\s*\n", reflection):
        para = para.strip()
        if not para:
            continue
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", para) if s.strip()]
        parts.extend(sentences)
    if not parts:
        parts = [reflection]
    return [p for p in parts if p]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def summarize(text: str) -> str:
    text = text or ""
    if not text.strip():
        return ""
    result = await _complete(
        "You write extremely concise summaries (1-2 sentences) of captured content for a "
        "personal knowledge app. Respond with ONLY the summary text, no preamble.",
        text[:8000],
        max_tokens=200,
    )
    return result if result else _fallback_summarize(text)


async def tag(text: str) -> list[str]:
    text = text or ""
    if not text.strip():
        return []
    result = await _complete(
        "Extract up to 5 short lowercase topical tags (single words or short phrases) for the "
        "given content. Respond with ONLY a comma-separated list, nothing else.",
        text[:4000],
        max_tokens=100,
    )
    if result:
        tags = [t.strip().lower() for t in result.split(",") if t.strip()]
        if tags:
            return tags[:5]
    return _fallback_tags(text)


async def classify(url: str | None, text: str) -> str:
    """Classify content type: article|video|tweet|pdf."""
    url = url or ""
    lowered = url.lower()
    if "youtube.com" in lowered or "youtu.be" in lowered:
        return "video"
    if "twitter.com" in lowered or "x.com" in lowered:
        return "tweet"
    if lowered.endswith(".pdf"):
        return "pdf"
    result = await _complete(
        "Classify the content as exactly one of: article, video, tweet, pdf. "
        "Respond with ONLY that single word.",
        f"URL: {url}\n\nContent:\n{(text or '')[:3000]}",
        max_tokens=10,
    )
    if result:
        word = result.strip().lower().split()[0].strip(".,!")
        if word in {"article", "video", "tweet", "pdf"}:
            return word
    return "article"


async def split_reflection(reflection: str) -> list[str]:
    reflection = reflection or ""
    if not reflection.strip():
        return []
    result = await _complete(
        "Split the user's free-text reflection about a book into discrete, standalone "
        "highlight/takeaway cards. Each card should be a single durable idea, in the user's "
        "voice, 1-2 sentences. Respond with ONLY the cards, one per line, no numbering or "
        "bullets.",
        reflection[:6000],
        max_tokens=600,
    )
    if result:
        lines = [re.sub(r"^[\-\*\d\.\)\s]+", "", ln).strip() for ln in result.splitlines()]
        lines = [ln for ln in lines if ln]
        if lines:
            return lines
    return _fallback_split_reflection(reflection)


_FALLBACK_CHAT_PROMPT = "What felt most alive about today?"


async def journal_chat(
    entry: str,
    history: list[dict[str, str]],
    tone: str,
    context_items: list[str],
) -> tuple[str, list[dict]]:
    """Returns (reply_text, suggestions). suggestions are plain dicts matching Suggestion shape."""
    client = _client()
    if client is None:
        return _FALLBACK_CHAT_PROMPT, []

    tone_desc = {
        "warm": "warm, encouraging, and gentle",
        "coach": "direct, motivating, like a personal coach",
        "socratic": "curious and question-driven, socratic method",
        "neutral": "calm and neutral",
    }.get(tone, "warm and encouraging")

    context_block = "\n".join(f"- {c}" for c in context_items[:10]) if context_items else "(none)"
    system = (
        f"You are a reflective journaling companion. Your tone is {tone_desc}. "
        "You are grounded ONLY in the user's own journal entry and the context provided below; "
        "never fabricate events or details. Ask reflective questions rather than assuming. "
        "Keep replies short (2-4 sentences), non-preachy, and end with an optional gentle "
        "prompt to go deeper.\n\n"
        f"Relevant context from the user's past entries and captured wisdom:\n{context_block}"
    )

    messages = []
    for turn in history[-10:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    if not messages:
        messages.append({"role": "user", "content": f"Here is today's journal entry:\n\n{entry}"})

    try:
        resp = await client.messages.create(
            model=_model(),
            max_tokens=400,
            system=system,
            messages=messages,
        )
        parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
        reply = "\n".join(parts).strip()
        if not reply:
            return _FALLBACK_CHAT_PROMPT, []
        return reply, []
    except Exception:
        return _FALLBACK_CHAT_PROMPT, []


async def distill(content: str) -> list[str]:
    content = content or ""
    if not content.strip():
        return []
    result = await _complete(
        "Condense the given content into 3-5 durable, standalone principles or takeaways. "
        "Respond with ONLY the principles, one per line, no numbering or bullets.",
        content[:8000],
        max_tokens=500,
    )
    if result:
        lines = [re.sub(r"^[\-\*\d\.\)\s]+", "", ln).strip() for ln in result.splitlines()]
        lines = [ln for ln in lines if ln]
        if lines:
            return lines[:5]
    # deterministic fallback: first few sentences as separate "principles"
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", content) if s.strip()]
    return sentences[:3] if sentences else []


async def extract_page_text(image_bytes: bytes, media_type: str = "image/jpeg") -> str:
    """OCR + cleanup a photographed book page via Claude vision. Empty string on failure."""
    client = _client()
    if client is None or not image_bytes:
        return ""
    try:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        resp = await client.messages.create(
            model=_model(),
            max_tokens=500,
            system=(
                "You transcribe photographed book pages. Read the image, clean up OCR noise, "
                "and respond with ONLY the cleaned key passage/idea from the page (a few "
                "sentences), no commentary."
            ),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": media_type, "data": b64},
                        },
                        {"type": "text", "text": "Transcribe and clean up the key passage on this page."},
                    ],
                }
            ],
        )
        parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
        return "\n".join(parts).strip()
    except Exception:
        return ""


async def suggest_widgets(recent_entries: list[str]) -> list[dict]:
    """Returns proposals: list of {widget_type, title, config, reason}. Empty list on failure/no key."""
    client = _client()
    if client is None or not recent_entries:
        return []
    joined = "\n---\n".join(recent_entries[-10:])
    result = await _complete(
        "You propose dashboard tracker widgets based on recurring themes in the user's journal "
        "entries. Allowed widget_type values: metric, habit, mood_chart, reading_stats, goal, "
        "journal_streak, topics, quote_of_day. Respond with a JSON array of objects, each with "
        "keys widget_type, title, config (object), reason (short string). Respond with ONLY "
        "the JSON array, no markdown fences, no commentary. If nothing stands out, respond "
        "with an empty array [].",
        joined[:6000],
        max_tokens=500,
    )
    if not result:
        return []
    try:
        import json

        cleaned = result.strip()
        cleaned = re.sub(r"^```(json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
        data = json.loads(cleaned)
        if isinstance(data, list):
            proposals = []
            for item in data:
                if isinstance(item, dict) and "widget_type" in item and "title" in item:
                    proposals.append(
                        {
                            "widget_type": item.get("widget_type"),
                            "title": item.get("title"),
                            "config": item.get("config") or {},
                            "reason": item.get("reason") or "",
                        }
                    )
            return proposals
    except Exception:
        pass
    return []


async def dashboard_insight(data: dict) -> str | None:
    client = _client()
    if client is None:
        return None
    import json

    result = await _complete(
        "You are a terse data analyst. Given a JSON summary of a personal dashboard "
        "(journal/mood/reading stats), respond with ONE short, specific, non-generic "
        "observation (a single sentence). Respond with ONLY that sentence.",
        json.dumps(data, default=str)[:4000],
        max_tokens=100,
    )
    return result
