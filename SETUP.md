# Setup

Two ways to run: **dev mode** (zero config, everything local, AI stubbed) and
**full mode** (Supabase + Anthropic + optional YouTube/push).

---

## 1. Dev mode (no accounts needed)

### Backend

```bash
cd backend
uv venv .venv
uv pip install -p .venv/bin/python -e .
AUTH_DEV_MODE=true .venv/bin/uvicorn app.main:app --reload --port 8000
```

- Uses a local SQLite file (`backend/secondbrain.db`), tables auto-created.
- `GET http://localhost:8000/health` → `{"status":"ok","ai":false}`.

### App

```bash
cd app
npm install
npx expo start
```

- With no Supabase env vars, the sign-in screen shows **Continue in dev mode** —
  it authenticates with the literal token `dev`.
- Point a physical device at your machine: create `app/.env` with
  `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000`.

### Backend tests

```bash
cd backend && .venv/bin/pytest
```

---

## 2. Full mode — manual steps

### a. Supabase (database + auth + storage)

1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_init.sql` (enables pgvector,
   creates all tables, RLS policies, the profile-on-signup trigger, and the
   `book-photos` storage bucket).
3. Collect from Project Settings:
   - **Project URL** and **anon key** → the app
   - **service_role key** and **JWT secret** → the backend
   - **Connection string** (URI, "Transaction" pooler works) → the backend
     `DATABASE_URL`, converted to
     `postgresql+asyncpg://postgres:...@.../postgres`

### b. Backend env (`backend/.env`)

```env
DATABASE_URL=postgresql+asyncpg://postgres:<password>@<host>:5432/postgres
SUPABASE_JWT_SECRET=<jwt secret>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
ANTHROPIC_API_KEY=<key from console.anthropic.com>   # enables real AI
# ANTHROPIC_MODEL=claude-sonnet-5                    # optional override
# YOUTUBE_API_KEY=<Google Cloud key with YouTube Data API v3>  # playlist sync
# CORS_ORIGINS=*
AUTH_DEV_MODE=false
```

Run: `.venv/bin/uvicorn app.main:app --port 8000`

### c. App env (`app/.env`)

```env
EXPO_PUBLIC_API_URL=https://<your-backend-host>   # or http://<lan-ip>:8000
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Restart `npx expo start` after changing env. Sign up with email/password —
the trigger creates your profile row automatically.

### d. Wisdom notifications (optional)

1. Expo push tokens are registered automatically when the app asks for
   notification permission (physical device required).
2. Schedule the dispatcher — hit it hourly with any scheduler (cron, GitHub
   Actions, Supabase cron + `pg_net`, etc.):
   `POST /api/notifications/dispatch`
   It respects each user's quiet hours and frequency setting.

### e. YouTube playlist sync (optional)

1. Google Cloud Console → enable **YouTube Data API v3** → create an API key →
   set `YOUTUBE_API_KEY` in backend env.
2. In-app (or via API): `POST /api/integrations/youtube` with your playlist URL.
3. Schedule `POST /api/integrations/youtube/sync` alongside the notification
   dispatcher.

### f. Deploying the backend

Any Python host works (Fly.io, Railway, Render):
`uvicorn app.main:app --host 0.0.0.0 --port $PORT` with the env from (b).

### g. Building the app

- Dev on device: Expo Go + `npx expo start`.
- Store builds: `npx eas build` (needs an Expo account; camera and
  notifications need a development build rather than Expo Go for full fidelity).

---

## Known manual-work list (deferred by design)

- Creating the Supabase project + running the migration (a, above)
- Anthropic API key for real AI (b)
- YouTube API key (e)
- Scheduling the two cron endpoints (d, e)
- EAS/store builds and push-notification credentials (g)
