# Second Brain

An AI-powered second brain: capture what you read and watch, journal daily with
an AI that chats back, review everything through a TikTok-style wisdom feed,
and track your life on a dashboard the AI can extend.

**Stack:** Expo React Native (`app/`) · FastAPI (`backend/`) · Supabase (`supabase/`)

| Page | What it does |
|---|---|
| **Journal** | Daily entry with mood/energy, autosave, end-of-entry AI chat |
| **Capture** | Links, notes, books ("I read this" + snap-a-page OCR), YouTube |
| **Wisdom** | Full-screen swipeable feed of highlights/takeaways, spaced-repetition review |
| **Tracker** | Widget dashboard; the AI proposes widgets from your journaling |

## Layout

```
app/       Expo React Native app (expo-router, TypeScript)
backend/   FastAPI backend (SQLAlchemy async, DeepSeek via OpenRouter, spaced repetition)
supabase/  SQL migrations (Postgres + pgvector + RLS)
docs/      API contract (docs/API.md) and theme spec (docs/THEME.md)
PRD.md     Product requirements
SETUP.md   How to run everything (including zero-config dev mode)
```

## Quickstart (zero config, no accounts)

Runs fully locally: SQLite instead of Supabase, deterministic AI fallbacks.

```bash
# backend
cd backend
uv venv .venv && uv pip install -p .venv/bin/python -e .
AUTH_DEV_MODE=true .venv/bin/uvicorn app.main:app --reload

# app (new terminal)
cd app
npm install
npx expo start
```

Open the app, tap **Continue in dev mode**. See `SETUP.md` to connect the real
things: Supabase, an OpenRouter key (real AI via DeepSeek), YouTube sync, and push
notifications.
