"""Link enrichment: best-effort fetch + title/OG-tag extraction.

No bs4 dependency required — uses a small HTMLParser subclass. Any fetch
failure still allows the caller to create an item (title falls back to the
URL itself).
"""

from __future__ import annotations

import re
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title: str | None = None
        self.og: dict[str, str] = {}
        self._in_title = False
        self._title_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_d = {k.lower(): (v or "") for k, v in attrs}
        if tag.lower() == "title":
            self._in_title = True
        elif tag.lower() == "meta":
            prop = attrs_d.get("property") or attrs_d.get("name") or ""
            prop = prop.lower()
            if prop.startswith("og:"):
                content = attrs_d.get("content", "")
                if content:
                    self.og[prop] = content

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)

    def close(self) -> None:
        super().close()
        if self._title_parts and not self.title:
            self.title = unescape("".join(self._title_parts)).strip()


def normalize_url(url: str) -> str:
    """Normalize a URL for dedup purposes: lowercase scheme/host, strip trailing slash & fragment."""
    url = (url or "").strip()
    try:
        parsed = urlparse(url)
        scheme = (parsed.scheme or "https").lower()
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip("/") or ""
        query = f"?{parsed.query}" if parsed.query else ""
        return f"{scheme}://{netloc}{path}{query}"
    except Exception:
        return url.strip().lower().rstrip("/")


class EnrichmentResult:
    def __init__(
        self,
        title: str,
        thumbnail_url: str | None,
        raw_content: str | None,
        author: str | None = None,
        fetch_ok: bool = False,
    ) -> None:
        self.title = title
        self.thumbnail_url = thumbnail_url
        self.raw_content = raw_content
        self.author = author
        self.fetch_ok = fetch_ok


async def fetch_and_extract(url: str) -> EnrichmentResult:
    fallback_title = url
    try:
        parsed = urlparse(url)
        if parsed.netloc:
            fallback_title = parsed.netloc + parsed.path
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; SecondBrainBot/1.0)"},
            )
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type and content_type:
                # Non-HTML resource (e.g. direct PDF); no title/meta to parse.
                return EnrichmentResult(title=fallback_title, thumbnail_url=None, raw_content=None, fetch_ok=True)
            html = resp.text
            parser = _MetaParser()
            parser.feed(html[:300_000])
            parser.close()

            title = parser.og.get("og:title") or parser.title or fallback_title
            thumbnail = parser.og.get("og:image")
            author = parser.og.get("og:site_name")
            # crude text extraction for AI summarization: strip tags
            text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S | re.I)
            text = re.sub(r"<[^>]+>", " ", text)
            text = unescape(re.sub(r"\s+", " ", text)).strip()

            return EnrichmentResult(
                title=title.strip() if title else fallback_title,
                thumbnail_url=thumbnail,
                raw_content=text[:20000] or None,
                author=author,
                fetch_ok=True,
            )
    except Exception:
        return EnrichmentResult(title=fallback_title, thumbnail_url=None, raw_content=None, fetch_ok=False)
