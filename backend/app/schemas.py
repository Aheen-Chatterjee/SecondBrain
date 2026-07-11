from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------


class KnowledgeItemOut(BaseModel):
    id: UUID
    source: Literal["book", "youtube", "link", "note", "voice"]
    type: Literal["article", "video", "book", "tweet", "pdf", "note"]
    title: str
    author: str | None = None
    url: str | None = None
    thumbnail_url: str | None = None
    summary: str | None = None
    reading_time_min: int | None = None
    captured_at: datetime
    tags: list[str] = Field(default_factory=list)
    highlights_count: int = 0


class RelatedItem(BaseModel):
    id: UUID
    title: str
    source: str
    reason: str


class HighlightOut(BaseModel):
    id: UUID
    knowledge_item_id: UUID
    text: str
    note: str | None = None
    photo_url: str | None = None
    source_kind: Literal["log", "photo", "ai"]
    highlighted_at: datetime


class ItemDetailOut(KnowledgeItemOut):
    raw_content: str | None = None
    highlights: list[HighlightOut] = Field(default_factory=list)
    related: list[RelatedItem] = Field(default_factory=list)


class ItemsListOut(BaseModel):
    items: list[KnowledgeItemOut]
    total: int


class OkOut(BaseModel):
    ok: bool = True


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class ProfileOut(BaseModel):
    display_name: str | None = None
    ai_tone: str
    quiet_hours_start: int
    quiet_hours_end: int
    notif_frequency: str


class ProfileIn(BaseModel):
    display_name: str | None = None
    ai_tone: Literal["warm", "coach", "socratic", "neutral"] | None = None
    quiet_hours_start: int | None = None
    quiet_hours_end: int | None = None
    notif_frequency: Literal["off", "daily", "twice_daily", "weekly"] | None = None


class PushTokenIn(BaseModel):
    expo_push_token: str


# ---------------------------------------------------------------------------
# Journal
# ---------------------------------------------------------------------------


class JournalEntryPreview(BaseModel):
    id: UUID
    entry_date: date
    mood: int | None = None
    energy: int | None = None
    preview: str


class JournalEntriesListOut(BaseModel):
    entries: list[JournalEntryPreview]


class JournalEntryOut(BaseModel):
    id: UUID
    entry_date: date
    body: str
    mood: int | None = None
    energy: int | None = None
    updated_at: datetime


class JournalEntryIn(BaseModel):
    body: str = ""
    mood: int | None = Field(default=None, ge=1, le=5)
    energy: int | None = Field(default=None, ge=1, le=5)


class ChatMessageOut(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class ChatMessagesOut(BaseModel):
    messages: list[ChatMessageOut]


class ChatIn(BaseModel):
    message: str | None = None


class Suggestion(BaseModel):
    kind: Literal["widget", "tag"]
    widget_type: str | None = None
    title: str | None = None
    config: dict[str, Any] | None = None
    name: str | None = None


class ChatOut(BaseModel):
    reply: ChatMessageOut
    suggestions: list[Suggestion] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------


class CaptureLinkIn(BaseModel):
    url: str
    note: str | None = None


class CaptureNoteIn(BaseModel):
    text: str


class CaptureBookIn(BaseModel):
    title: str
    author: str | None = None
    reflection: str | None = None


class CaptureBookOut(BaseModel):
    item: KnowledgeItemOut
    highlights: list[HighlightOut]


class DistillOut(BaseModel):
    highlights: list[HighlightOut]


# ---------------------------------------------------------------------------
# Wisdom
# ---------------------------------------------------------------------------


class WisdomCard(BaseModel):
    card_id: str
    kind: Literal["highlight", "takeaway", "quote", "video", "photo_page", "journal_flashback"]
    title: str
    subtitle: str | None = None
    text: str
    image_url: str | None = None
    item_id: UUID | None = None
    object_type: Literal["highlight", "item"]
    object_id: UUID
    due_for_review: bool = False


class WisdomFeedOut(BaseModel):
    cards: list[WisdomCard]
    next_cursor: str | None = None


class WisdomFeedbackIn(BaseModel):
    object_type: Literal["highlight", "item"]
    object_id: UUID
    action: Literal["resonates", "neutral", "faded", "snoozed", "save"]


class WisdomFeedbackOut(BaseModel):
    ok: bool = True
    next_review_at: datetime | None = None


class WisdomSearchResult(BaseModel):
    object_type: Literal["item", "highlight"]
    object_id: UUID
    title: str
    text: str
    score: float


class WisdomSearchOut(BaseModel):
    results: list[WisdomSearchResult]


class WisdomDigestOut(BaseModel):
    week_of: date
    summary: str
    stats: dict[str, int]


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------


class WidgetOut(BaseModel):
    id: UUID
    type: str
    title: str
    config: dict[str, Any]
    position: int
    size: Literal["half", "full"]
    is_ai_created: bool
    data: Any = None


class WidgetsOut(BaseModel):
    widgets: list[WidgetOut]


class WidgetIn(BaseModel):
    type: Literal[
        "metric", "habit", "mood_chart", "reading_stats", "goal",
        "journal_streak", "topics", "quote_of_day",
    ]
    title: str
    config: dict[str, Any] | None = None
    size: Literal["half", "full"] | None = None
    from_suggestion: bool = False


class WidgetPatchIn(BaseModel):
    title: str | None = None
    config: dict[str, Any] | None = None
    position: int | None = None
    size: Literal["half", "full"] | None = None


class WidgetDataIn(BaseModel):
    value: dict[str, Any]
    ts: datetime | None = None


class WidgetProposal(BaseModel):
    widget_type: str
    title: str
    config: dict[str, Any]
    reason: str


class WidgetSuggestOut(BaseModel):
    proposals: list[WidgetProposal]


class InsightOut(BaseModel):
    insight: str | None = None


# ---------------------------------------------------------------------------
# Integrations
# ---------------------------------------------------------------------------


class YoutubeIntegrationIn(BaseModel):
    playlist_url: str


class YoutubeIntegrationOut(BaseModel):
    ok: bool = True
    playlist_id: str


class YoutubeSyncOut(BaseModel):
    imported: int
    detail: str | None = None


class IntegrationOut(BaseModel):
    provider: str
    status: str
    config: dict[str, Any]
    last_synced_at: datetime | None = None


class IntegrationsListOut(BaseModel):
    integrations: list[IntegrationOut]


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class DispatchOut(BaseModel):
    sent: int


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class HealthOut(BaseModel):
    status: str
    ai: bool
