# Second Brain — API Contract (v1)

Single source of truth for the FastAPI backend (`backend/`) and the Expo app
(`app/`). Both sides MUST conform to this document. If something here is
ambiguous, the backend implementation wins and this doc gets updated.

- **Base URL:** `{API_URL}` (app env `EXPO_PUBLIC_API_URL`, default `http://localhost:8000`)
- **All endpoints are prefixed `/api` unless noted.**
- **Content type:** JSON (`application/json`) except photo upload (multipart).

## Authentication

The app authenticates users against **Supabase Auth** directly (supabase-js,
email/password). Every backend request carries the Supabase access token:

```
Authorization: Bearer <supabase_access_token>
```

Backend verifies the JWT with `SUPABASE_JWT_SECRET` (HS256) and derives
`user_id` from the `sub` claim. Every DB query is scoped by that `user_id`.

**Dev mode:** when env `AUTH_DEV_MODE=true`, the backend accepts the literal
token `dev` and maps it to a fixed dev user id
(`00000000-0000-0000-0000-000000000001`). The app uses this when
`EXPO_PUBLIC_MOCK=1`-style local dev without Supabase.

## Error shape

Non-2xx responses:

```json
{ "detail": "human readable message" }
```

`401` bad/missing token, `404` not found (or not owned), `422` validation.

## Common types

```ts
type UUID = string;            // uuid v4
type ISODate = string;         // "2026-07-11"
type ISODateTime = string;     // RFC3339

interface KnowledgeItem {
  id: UUID;
  source: 'book'|'youtube'|'link'|'note'|'voice';
  type: 'article'|'video'|'book'|'tweet'|'pdf'|'note';
  title: string;
  author: string | null;
  url: string | null;
  thumbnail_url: string | null;
  summary: string | null;
  reading_time_min: number | null;
  captured_at: ISODateTime;
  tags: string[];
  highlights_count: number;
}

interface Highlight {
  id: UUID;
  knowledge_item_id: UUID;
  text: string;
  note: string | null;
  photo_url: string | null;
  source_kind: 'log'|'photo'|'ai';
  highlighted_at: ISODateTime;
}
```

---

## Health

`GET /health` (no auth, no `/api` prefix) → `{ "status": "ok", "ai": true|false }`
(`ai` = whether an Anthropic key is configured).

## Profile

`GET /api/profile` →
```json
{ "display_name": "Aheen", "ai_tone": "warm", "quiet_hours_start": 22,
  "quiet_hours_end": 8, "notif_frequency": "daily" }
```

`PUT /api/profile` — same shape (all fields optional) → updated profile.

`POST /api/profile/push-token` — `{ "expo_push_token": "ExponentPushToken[...]" }` → `{ "ok": true }`

---

## Journal

### `GET /api/journal/entries?year=2026&month=7`
List of entries for a month (for the calendar/timeline):
```json
{ "entries": [ { "id": "...", "entry_date": "2026-07-11", "mood": 4,
                 "energy": 3, "preview": "first 140 chars…" } ] }
```

### `GET /api/journal/entries/{entry_date}`
Full entry for a date, `404` if none:
```json
{ "id": "...", "entry_date": "2026-07-11", "body": "…", "mood": 4,
  "energy": 3, "updated_at": "…" }
```

### `PUT /api/journal/entries/{entry_date}`
Upsert. Body: `{ "body": string, "mood": 1-5|null, "energy": 1-5|null }`
→ full entry (as above). Autosave calls this repeatedly.

### `GET /api/journal/entries/{entry_id}/chat`
`{ "messages": [ { "id": "...", "role": "user"|"assistant", "content": "…",
                   "created_at": "…" } ] }`

### `POST /api/journal/entries/{entry_id}/chat`
Body: `{ "message": string | null }`. `null`/empty message = "start the chat":
the assistant reacts to the entry itself. Persists both turns.
→ `{ "reply": { "id": "...", "role": "assistant", "content": "…", "created_at": "…" },
     "suggestions": [ { "kind": "widget", "widget_type": "habit", "title": "Running", "config": {} } ] }`
`suggestions` may be empty; `kind` is `"widget"` or `"tag"` (tag has `{kind, name}`).

### `GET /api/journal/on-this-day`
→ `{ "entries": [ …same shape as month list… ] }` (same date, previous months/years).

---

## Capture

### `POST /api/capture/link`
`{ "url": string, "note": string|null }` → `KnowledgeItem`
Backend fetches the page (best-effort), extracts title/thumbnail, AI-summarizes,
auto-tags, classifies type (`article|video|tweet|pdf`), dedups by URL
(re-capturing the same URL returns the existing item with `200`).

### `POST /api/capture/note`
`{ "text": string }` → `KnowledgeItem` (source `note`, type `note`; title =
AI-generated or first line).

### `POST /api/capture/book`
Log a book you read. `{ "title": string, "author": string|null,
"reflection": string|null }` → `{ "item": KnowledgeItem, "highlights": Highlight[] }`
If `reflection` is present, AI splits it into discrete highlight cards
(`source_kind: "ai"`). Re-logging the same title+author appends to the
existing book item.

### `POST /api/capture/book/{item_id}/photo`
Multipart form: field `photo` (jpeg/png). OCR extracts text, AI cleans it and
pulls the key idea → `{ "highlight": Highlight }` (`source_kind: "photo"`,
`photo_url` set when storage is configured, else null).

### Items
- `GET /api/items?source=&type=&tag=&q=&limit=30&offset=0` → `{ "items": KnowledgeItem[], "total": n }`
- `GET /api/items/{id}` → `KnowledgeItem & { raw_content, highlights: Highlight[], related: RelatedItem[] }`
  where `RelatedItem = { id, title, source, reason }`
- `DELETE /api/items/{id}` → `{ "ok": true }`
- `POST /api/items/{id}/distill` → `{ "highlights": Highlight[] }` (AI condenses
  the item's content/highlights into 3–5 durable principles, saved as highlights)

---

## Wisdom

### `GET /api/wisdom/feed?cursor=&limit=10`
The TikTok-style feed. Returns full-screen **cards**, mixed by the backend
(due-for-review first, then newest, then serendipity), shuffled deterministically
per day.

```json
{
  "cards": [
    {
      "card_id": "hl:<uuid>" ,
      "kind": "highlight"|"takeaway"|"quote"|"video"|"photo_page"|"journal_flashback",
      "title": "Atomic Habits",           // item title / context line
      "subtitle": "James Clear · book",   // author · source
      "text": "You do not rise to the level of your goals…",
      "image_url": null,                  // photo_url or video thumbnail
      "item_id": "<uuid>|null",
      "object_type": "highlight"|"item",
      "object_id": "<uuid>",
      "due_for_review": true
    }
  ],
  "next_cursor": "opaque|null"
}
```

### `POST /api/wisdom/feedback`
`{ "object_type": "highlight"|"item", "object_id": UUID,
   "action": "resonates"|"neutral"|"faded"|"snoozed"|"save" }`
→ `{ "ok": true, "next_review_at": ISODateTime|null }`
Updates the spaced-repetition schedule (`resonates` grows the interval,
`faded` shrinks it, `snoozed` pushes +7d, `save` favorites without scheduling).

### `GET /api/wisdom/search?q=&limit=20`
→ `{ "results": [ { "object_type": "item"|"highlight", "object_id": "...",
     "title": "…", "text": "…", "score": 0.87 } ] }`
v1: Postgres trigram/FTS. (pgvector adapter slots in behind the same endpoint.)

### `GET /api/wisdom/digest`
→ `{ "week_of": ISODate, "summary": "…", "stats": { "captured": 12, "reviewed": 9, "journal_days": 5 } }`

---

## Tracker

```ts
interface Widget {
  id: UUID;
  type: 'metric'|'habit'|'mood_chart'|'reading_stats'|'goal'|'journal_streak'|'topics'|'quote_of_day';
  title: string;
  config: Record<string, unknown>;  // per-type, see below
  position: number;
  size: 'half'|'full';
  is_ai_created: boolean;
  data: unknown;                    // server-computed payload, per-type (below)
}
```

Per-type `data` payloads (server computes on GET):
- `metric` → `{ value: number, label: string }` (config: `{ metric: 'items_captured'|'books_finished'|'manual', label }`)
- `habit` → `{ streak: number, week: boolean[7] }` (config: `{ name }`; days marked via widget data points `{done: true}`)
- `mood_chart` → `{ points: [{date, mood, energy}] }` (last 30 days from journal)
- `reading_stats` → `{ captured_this_week: n, by_source: {book: n, youtube: n, link: n, note: n} }`
- `goal` → `{ current: number, target: number }` (config: `{ target, unit }`; manual data points `{value: n}`)
- `journal_streak` → `{ streak: n, best: n }`
- `topics` → `{ topics: [{name, count}] }` (top tags)
- `quote_of_day` → `{ text, title, author }` (rotates daily from highlights)

Endpoints:
- `GET /api/tracker/widgets` → `{ "widgets": Widget[] }` (sorted by position; data populated)
- `POST /api/tracker/widgets` — `{ type, title, config?, size? }` → `Widget`
- `PATCH /api/tracker/widgets/{id}` — any of `{ title, config, position, size }` → `Widget`
- `DELETE /api/tracker/widgets/{id}` → `{ "ok": true }`
- `POST /api/tracker/widgets/{id}/data` — `{ "value": object, "ts": ISODateTime? }` → `{ "ok": true }`
- `POST /api/tracker/suggest` → `{ "proposals": [ { widget_type, title, config, reason } ] }`
  AI reads recent journal entries and proposes widgets. **Propose-only** — the
  app renders approve/dismiss; approval calls `POST /api/tracker/widgets` with
  `is_ai_created` set server-side via `{ "from_suggestion": true }` in the body.
- `GET /api/tracker/insight` → `{ "insight": string|null }` (one-line AI
  observation across dashboard data, cached for the day)

---

## Integrations

- `POST /api/integrations/youtube` — `{ "playlist_url": string }` → `{ "ok": true, "playlist_id": "…" }`
- `POST /api/integrations/youtube/sync` → `{ "imported": n }` (pulls new playlist
  items via YouTube Data API when `YOUTUBE_API_KEY` set; otherwise `{ "imported": 0, "detail": "no api key" }`)
- `GET /api/integrations` → `{ "integrations": [ { provider, status, config, last_synced_at } ] }`

## Notifications

- `POST /api/notifications/dispatch` (cron/manual) — picks due wisdom per user,
  sends Expo push, logs it → `{ "sent": n }`

---

## AI degradation rules

Backend AI features call the Anthropic API (`ANTHROPIC_API_KEY`). When the key
is missing, endpoints MUST still succeed with deterministic fallbacks:
summaries = first ~2 sentences of content; book reflection split = split on
sentence/paragraph boundaries; journal chat reply = fixed reflective prompt
("What felt most alive about today?"); tags = simple keyword extraction;
suggest/insight = empty. `GET /health` reports `"ai": false` so the app can
show a subtle "AI offline" hint.

## Backend env vars

| var | required | purpose |
|---|---|---|
| `DATABASE_URL` | yes* | Postgres (Supabase) SQLAlchemy URL. *Defaults to local SQLite `sqlite+aiosqlite:///./secondbrain.db` for dev. |
| `SUPABASE_JWT_SECRET` | prod | verify Supabase JWTs |
| `AUTH_DEV_MODE` | no | `true` accepts token `dev` |
| `ANTHROPIC_API_KEY` | no | enables real AI |
| `ANTHROPIC_MODEL` | no | default `claude-sonnet-5` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | no | storage uploads (book photos) |
| `YOUTUBE_API_KEY` | no | playlist sync |
| `CORS_ORIGINS` | no | default `*` |
