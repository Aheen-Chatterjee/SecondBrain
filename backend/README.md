# Second Brain — Backend

FastAPI backend implementing `docs/API.md`. SQLAlchemy 2.0 async ORM,
SQLite (dev, default) / Postgres+Supabase (prod), Claude for AI features
with deterministic fallbacks when no API key is configured.

## Setup

```bash
cd backend
uv venv .venv
uv pip install -p .venv/bin/python -e ".[dev]"
cp .env.example .env   # edit as needed; AUTH_DEV_MODE=true works out of the box
```

## Run

```bash
.venv/bin/uvicorn app.main:app --reload
```

The server boots against a local SQLite DB (`secondbrain.db`) by default and
auto-creates tables on startup. Point `DATABASE_URL` at Postgres/Supabase in
production — migrations there are managed by `supabase/migrations/0001_init.sql`.

With `AUTH_DEV_MODE=true`, send `Authorization: Bearer dev` to authenticate as
the fixed dev user (`00000000-0000-0000-0000-000000000001`).

```bash
curl http://localhost:8000/health
curl -H "Authorization: Bearer dev" http://localhost:8000/api/profile
```

## Test

```bash
.venv/bin/pytest
```

Tests run against a temp SQLite DB with `AUTH_DEV_MODE=true` and no
`OPENROUTER_API_KEY`, exercising the deterministic AI fallbacks end-to-end.

## Structure

```
app/
  main.py          FastAPI app, CORS, /health, router registration
  config.py        pydantic-settings env config
  db.py            async engine/session, create_all for SQLite dev
  models.py        SQLAlchemy ORM models (mirrors supabase/migrations/0001_init.sql)
  schemas.py       Pydantic request/response models
  auth.py          Supabase JWT verification + AUTH_DEV_MODE
  ai.py            OpenRouter (DeepSeek) wrapper with deterministic fallbacks
  services/        enrichment, ocr, spaced_repetition, feed, widgets, storage, youtube
  routers/         profile, journal, capture, items, wisdom, tracker, integrations, notifications
tests/             pytest suite (httpx.AsyncClient + ASGITransport)
```
