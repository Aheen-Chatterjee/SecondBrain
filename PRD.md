# Second Brain — Product Requirements Document

> **Status:** Draft v0.1
> **Last updated:** 2026-07-11
> **Owner:** Aheen Chatterjee
> **Stack:** React Native (Expo) · FastAPI · Supabase (Postgres + Auth + Storage + Realtime)

---

## 1. Overview

### 1.1 Vision
A personal, AI-powered "second brain" that continuously ingests the knowledge you
encounter — book highlights, links you share, YouTube playlist additions — and
combines it with what you write yourself through daily journaling. It doesn't just
store this material; it helps you **review, connect, and remember** the wisdom you
gather, and reflects your whole life back to you through a dynamic, AI-curated
dashboard.

### 1.2 The core problem
People consume enormous amounts of high-quality content and have meaningful daily
reflections, but almost none of it is retained or revisited. Highlights die in
Kindle. Saved links rot in a tab graveyard. Journal entries are written once and
never read again. There is no single place where *external inputs* (what you read
and watch) and *internal outputs* (what you think and feel) live together and are
actively resurfaced.

### 1.3 Product pillars
1. **Capture everywhere** — frictionless ingestion from books (snap/log), share sheets, and YouTube.
2. **Reflect daily** — a journaling habit with an AI conversation partner.
3. **Remember actively** — a knowledge hub with spaced resurfacing ("wisdom notifications").
4. **See your whole life** — a dynamic dashboard the AI can extend with widgets.

### 1.4 Success metrics (North Star)
- **North Star:** Weekly Active Reflectors — users who journal ≥3 days/week *and*
  review ≥5 knowledge items/week.
- **Supporting metrics:** journal streak length, items captured/week, wisdom
  notification open rate, review recall rate, D30 retention.

---

## 2. Goals & Non-Goals

### 2.1 Goals (v1)
- Daily journaling with an end-of-entry AI chat.
- Ingestion of book highlights (manual log + photo/OCR), shared links, and YouTube playlist items.
- A unified, searchable knowledge hub across all sources.
- Spaced-repetition-style "wisdom notifications."
- A dynamic dashboard where the AI can add/remove tracking widgets.
- Cross-source semantic search and AI-generated connections.

### 2.2 Non-Goals (v1)
- Multi-user collaboration / shared brains (single-player only).
- A full note-taking editor rivaling Notion/Obsidian (journaling is focused, not freeform docs).
- Native offline-first sync engine (basic offline read cache only).
- Public sharing / social features.
- Web app (mobile-first; web is a later phase).

---

## 3. Target User & Personas

**Primary persona — "The Lifelong Learner"**
Reads books, saves articles and videos constantly, journals sporadically, and
feels frustrated that they retain very little. Wants a system that does the
remembering for them and nudges reflection.

**Secondary persona — "The Quantified Self-er"**
Loves tracking habits, mood, and metrics. Draws to the dynamic dashboard and
wants the AI to surface patterns across their inputs and life data.

---

## 4. Information Architecture

The app has **four primary tabs** plus onboarding/settings.

| Tab | Purpose |
|-----|---------|
| **Journal** | Write today's entry; end-of-entry AI chat; browse past entries. |
| **Share / Capture** | Add content (links, notes, media) manually or via the OS share sheet. |
| **Wisdom (Review)** | The knowledge hub — browse, search, and review resurfaced items. |
| **Tracker** | Dynamic dashboard of life-tracking widgets the AI can manage. |

---

## 5. Feature Requirements

### 5.1 Journal

**Description:** A daily writing surface. One entry per day is the default rhythm,
but multiple entries are allowed. Supports rich-ish text (headings, lists,
quotes), mood tagging, and inline references to knowledge items.

**Requirements**
- `JR-1` Create/edit today's entry with autosave.
- `JR-2` Optional mood + energy tags per entry.
- `JR-3` Reference a knowledge item inside an entry (`@mention`-style linking).
- `JR-4` Browse a calendar/timeline of past entries with search.
- `JR-5` **End-of-entry AI chat:** when the user finishes writing, the app offers
  "Chat about today?" The AI responds to the entry — asking reflective questions,
  drawing connections to past entries and captured wisdom, or offering
  encouragement. Tone is configurable (coach / therapist-ish / neutral / socratic).
- `JR-6` The chat can suggest new tracker widgets or knowledge tags (with user consent).
- `JR-7` On-this-day resurfacing of past entries.

**AI behavior for `JR-5`**
- Grounded in the user's own data via retrieval (recent entries + relevant wisdom).
- Never fabricates events; asks rather than assumes.
- Short, warm, non-preachy. Ends with an optional prompt to go deeper.

### 5.2 Share / Capture

**Description:** The intake funnel for external content and quick notes.

**Requirements**
- `CP-1` OS **share-sheet target** (iOS/Android) to send URLs, text, and images into the app.
- `CP-2` In-app "Add" flow for links, quick notes, and voice memos (transcribed).
- `CP-3` Automatic enrichment on capture: fetch title, author, favicon/thumbnail,
  reading time, and a short AI summary.
- `CP-4` Auto-classify content type (article, video, tweet/thread, PDF, book, note).
- `CP-5` AI-suggested tags + user override.
- `CP-6` De-duplication (same URL captured twice merges).
- `CP-7` Capture works offline and syncs when back online.

**Book capture (in lieu of a Kindle/Readwise integration)**
- `CP-8` **Books are captured manually — no Kindle sync or Readwise account
  required.** Two lightweight paths:
  - **(a) "I read this" quick log:** user names a book (title/author, cover
    auto-fetched) and writes what they liked / what stuck with them in free text.
    The AI splits this into discrete highlight/takeaway cards for the wisdom feed.
  - **(b) Snap a page:** user photographs a book page (or a highlighted passage);
    **on-device or backend OCR** extracts the text, the AI cleans it up and pulls
    the key idea, and it becomes a highlight card. The original photo is kept and
    viewable on the card.
  - Both create a `book` knowledge item with child `highlights`; multiple
    logs/photos accrue under the same book.
- `CP-9` **YouTube playlist sync** — connect a YouTube account (or watch specific
  playlists via API). New videos added to a chosen playlist auto-import with title,
  channel, transcript (when available), and AI summary.
- `CP-10` **Generic link sharing** — anything shared via `CP-1` becomes a knowledge item.

### 5.3 Wisdom (Review) — the Knowledge Hub

**Description:** The heart of the product. A unified library of everything captured
plus insights extracted from journaling, made **reviewable and memorable**.

**Requirements**
- `WS-1` **TikTok-style vertical feed:** the primary browse experience is a
  full-screen, vertically swipeable stack of **wisdom cards** — one item per screen,
  snap-scrolling top-to-bottom. Each card renders a single, digestible unit of
  wisdom (a highlight, an AI takeaway, a quote, a video clip, or a distilled
  principle), not a dense list row. This makes reviewing feel effortless and
  addictive rather than like homework.
  - Card content adapts to type: book highlight/takeaway, article summary point,
    YouTube thumbnail + key idea, or a photographed book page.
  - Per-card actions (thumb-reachable, overlaid): save/favorite, "still resonates,"
    distill, open detail, start a related journal prompt, share.
  - Feed ordering is a mix of newest captures, spaced-repetition-due items, and
    AI-surfaced connections (serendipity) — tunable via filters.
  - Filters/search still available (source, type, tag, date) but collapse away so
    the feed stays immersive.
- `WS-2` Item detail view (tap a card): full content/summary, highlights, your
  notes, AI-generated key takeaways, and related items.
- `WS-3` **Semantic search** across all sources (vector search over embeddings).
- `WS-4` **AI connections:** for any item, surface related highlights, videos,
  journal entries, and notes ("This connects to…").
- `WS-5` **Collections / topics:** AI clusters items into themes; user can curate.
- `WS-6` **Review mode:** a spaced-repetition-style flow that resurfaces items
  (highlights, takeaways) as flashcard-like prompts. Track recall / "still resonates."
- `WS-7` "Distill" action: AI condenses a book's highlights or a long article into
  a few durable principles saved back into the hub.
- `WS-8` Weekly "Wisdom digest" summarizing what you learned and connected.

### 5.4 Wisdom Notifications

**Description:** Proactive resurfacing to build memory and serendipity.

**Requirements**
- `WN-1` Scheduled push notifications delivering a resurfaced highlight, takeaway,
  or past journal insight.
- `WN-2` Spaced-repetition scheduling (items resurface at increasing intervals;
  interval adapts to "still resonates" feedback).
- `WN-3` Context-aware timing (respect quiet hours; user-set frequency).
- `WN-4` Tap-through opens the item in the hub with one-tap actions (save, snooze,
  "distill," start a related journal prompt).
- `WN-5` Types: *Remember this* (a highlight), *Connect this* (two related items),
  *Reflect on this* (a journal prompt seeded by past wisdom).

### 5.5 Tracker — Dynamic Dashboard

**Description:** A configurable dashboard for tracking every aspect of life, where
**the AI can add, arrange, and populate widgets** based on what it learns from your
journaling and captures.

**Requirements**
- `TR-1` Grid-based dashboard of widgets; user can add/remove/reorder/resize.
- `TR-2` **Widget catalog (v1):**
  - Metric/number (e.g., "books finished this month")
  - Habit tracker / streak
  - Mood-over-time chart
  - Reading & watching stats (items captured, time saved-to-read)
  - Goal progress bar
  - Journal streak
  - Topic/interest breakdown (from captured content)
  - Note/quote-of-the-day
- `TR-3` **AI-managed widgets:** the AI may *propose* a new widget ("You've
  mentioned running 4×; want a running tracker?"). User approves before it's added.
- `TR-4` Widgets bind to underlying data sources (journal fields, captures, manual
  logs) via a typed widget schema so the AI can safely instantiate them.
- `TR-5` Manual data entry for widgets that need it (e.g., weight, mood check-in).
- `TR-6` AI can annotate the dashboard with insights ("Mood dips on weeks with <2
  journal entries").
- `TR-7` Guardrails: AI can only create widgets from an allow-listed schema; it
  never deletes user data or widgets without confirmation.

---

## 6. AI System Design

### 6.1 Capabilities
| Capability | Where used | Approach |
|-----------|-----------|----------|
| Summarization | Capture, YouTube, books | LLM over fetched content/transcript |
| Tagging & classification | Capture | LLM + embeddings |
| Semantic search & connections | Wisdom hub | pgvector embeddings + retrieval |
| Reflective chat | Journal | RAG over user's entries + wisdom |
| Widget proposals | Tracker | Tool-calling with a typed widget schema |
| Wisdom scheduling | Notifications | Spaced-repetition algorithm + LLM selection |

### 6.2 Retrieval / grounding
- All user content is embedded and stored in **pgvector** (Supabase).
- The journal chat and "connections" features retrieve top-k relevant items and
  ground responses in them; the model is instructed to cite/reference source items
  and to avoid fabrication.

### 6.3 Model strategy
- All AI goes through **OpenRouter**, with **DeepSeek** as the default model for
  chat, summarization, tagging, and structured outputs (strong quality at low
  cost). Model choice is a config value, so it can be swapped per-task later.
- DeepSeek is text-only, so photo OCR (snap-a-page) routes to a configurable
  vision-capable model on OpenRouter (default Qwen2.5-VL).
- All prompts include user-configurable tone and are constrained by system prompts
  that enforce privacy and grounding.

### 6.4 Privacy & safety
- The second brain is deeply personal. Data is **private by default**, encrypted at
  rest (Supabase), scoped per-user via Row Level Security.
- AI calls send only the minimum necessary context; user can opt items out of AI
  processing.
- No training on user data; clear data-export and delete controls.

---

## 7. Technical Architecture

### 7.1 High-level
```
┌────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  React Native app  │◄───►│   FastAPI backend   │◄───►│    Supabase      │
│  (Expo)            │ HTTPS│  (Python)          │     │  Postgres+pgvector│
│  - 4 tabs          │     │  - AI orchestration │     │  Auth / Storage  │
│  - share extension │     │  - ingestion jobs   │     │  Realtime / RLS  │
│  - push (Expo)     │     │  - integrations     │     └──────────────────┘
└────────────────────┘     │  - embeddings       │              ▲
                           └─────────┬───────────┘              │
                                     │  ┌────────────────────┐  │
                                     └─►│ OpenRouter (DeepSeek)│  │
                                        │ YouTube API        │  │
                                        │ OCR (book photos)  │──┘
                                        └────────────────────┘
```

### 7.2 Frontend (React Native / Expo)
- Expo Router for the 4-tab navigation.
- Supabase JS client for auth + realtime; REST calls to FastAPI for AI/ingestion.
- Expo Notifications for push; native **Share Extension** (iOS) / **Share Intent**
  (Android) for capture.
- Local cache (SQLite/AsyncStorage) for offline read + queued captures.

### 7.3 Backend (FastAPI)
- REST API for app clients; handles all LLM calls (keys never on device).
- Background workers (e.g., Celery/RQ or Supabase Edge Functions + cron) for:
  enrichment, embeddings, YouTube polling, book-photo OCR, notification scheduling.
- Auth via Supabase JWT verification.

### 7.4 Data & storage (Supabase)
- Postgres with **pgvector** for embeddings.
- Storage for images/PDFs/voice memos.
- Realtime for live dashboard/journal updates.
- **Row Level Security** on every table keyed by `user_id`.

### 7.5 Third-party integrations
- **LLM:** DeepSeek via OpenRouter (text); Qwen2.5-VL via OpenRouter (photo OCR).
- **YouTube Data API** (playlist items, video metadata; transcripts via available API).
- **Books:** no Kindle/Readwise integration — manual "I read this" logging plus
  photo capture with **OCR** (on-device text recognition or a cloud OCR/vision call).
- **Push:** Expo Push Notifications.

---

## 8. Data Model (initial)

```
users (managed by Supabase Auth)
  id, email, created_at

profiles
  user_id (fk), display_name, ai_tone, quiet_hours, notif_frequency, settings jsonb

journal_entries
  id, user_id, entry_date, body, mood, energy, created_at, updated_at

journal_chats
  id, entry_id, role (user|assistant), content, created_at

knowledge_items
  id, user_id, source (book|youtube|link|note|voice),
  type (article|video|book|tweet|pdf|note), title, author, url,
  thumbnail, raw_content, summary, reading_time, captured_at, dedup_key

highlights
  id, knowledge_item_id, user_id, text, note, location,
  photo_url (nullable, for snapped book pages), source_kind (log|photo),
  highlighted_at

tags
  id, user_id, name
knowledge_item_tags (join)
  knowledge_item_id, tag_id

collections
  id, user_id, name, is_ai_generated
collection_items (join)
  collection_id, knowledge_item_id

embeddings
  id, user_id, object_type (journal|item|highlight), object_id, vector(pgvector)

review_schedule
  id, user_id, object_type, object_id, next_review_at, interval, ease, last_result

widgets
  id, user_id, type, title, config jsonb, position, size, is_ai_created

widget_data
  id, widget_id, user_id, ts, value jsonb   -- for manual/derived metrics

integrations
  id, user_id, provider (youtube), status, tokens (encrypted),
  last_synced_at, config jsonb

notifications_log
  id, user_id, type, object_id, sent_at, opened_at
```

---

## 9. Key User Flows

1. **Capture a link:** Share sheet → item queued → backend enriches (summary, tags,
   embedding) → appears in Wisdom hub with a summary.
2. **Daily journal + chat:** Open Journal → write → "Chat about today?" → AI
   reflects using recent entries + relevant wisdom → optional widget/tag suggestions.
3. **Wisdom notification:** Scheduler picks a due highlight → push → tap → item
   detail with "still resonates?" feedback → reschedules interval.
4. **AI adds a widget:** Journal chat detects a recurring habit → proposes a tracker
   widget → user approves → widget instantiated from schema on the dashboard.
5. **Review session:** Wisdom tab → swipe the TikTok-style wisdom feed → per-card
   "still resonates?" and distill actions → feedback updates the spaced-repetition
   schedule and feed ordering.
6. **Capture a book:** "I read this" → name book + write what you liked (or snap a
   page) → OCR/AI splits it into highlight cards under the book → they enter the feed.

---

## 10. Milestones / Phased Roadmap

**Phase 0 — Foundations (Weeks 1–2)**
Supabase schema + RLS, auth, FastAPI skeleton, RN app shell with 4 tabs.

**Phase 1 — Capture & Hub MVP (Weeks 3–5)**
Manual capture + share sheet, book logging + photo/OCR, enrichment/summary,
TikTok-style wisdom feed, basic search.

**Phase 2 — Journal & AI Chat (Weeks 6–7)**
Journaling, end-of-entry AI chat grounded via retrieval, past-entry browsing.

**Phase 3 — Wisdom Memory (Weeks 8–9)**
Embeddings + semantic search, connections, review mode, wisdom notifications.

**Phase 4 — Integrations (Weeks 10–11)**
YouTube playlist sync; harden book photo/OCR pipeline.

**Phase 5 — Dynamic Dashboard (Weeks 12–13)**
Widget catalog, manual tracking, AI-proposed widgets with guardrails, insights.

**Phase 6 — Polish & Beta (Week 14+)**
Offline cache, onboarding, settings, export/delete, private beta.

---

## 11. Open Questions
- Book OCR: on-device text recognition (free, offline) vs. a cloud vision/OCR call
  (higher accuracy on tricky pages) — or on-device first with cloud fallback?
- YouTube transcripts: which items lack transcripts, and do we fall back to
  audio-to-text?
- Spaced-repetition algorithm: SM-2 baseline vs. a lighter "resonance"-based model?
- Voice memo transcription provider and cost ceiling.
- How much AI autonomy on the dashboard is comfortable (propose-only vs. auto-add)?
- Cost model: per-user monthly LLM/embedding budget and where to cap.

## 12. Risks
- **Ingestion fragility** (YouTube API changes; OCR accuracy) → isolate behind adapters.
- **AI cost** at scale → tiered models, caching, batching embeddings.
- **Privacy trust** → strong defaults, transparency, easy export/delete.
- **Feature sprawl** → keep v1 scoped to the four pillars.
