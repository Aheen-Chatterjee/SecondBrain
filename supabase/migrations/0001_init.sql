-- Second Brain — initial schema
-- Run against a Supabase project (SQL editor or `supabase db push`).

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  ai_tone text not null default 'warm' check (ai_tone in ('warm','coach','socratic','neutral')),
  quiet_hours_start smallint not null default 22,
  quiet_hours_end smallint not null default 8,
  notif_frequency text not null default 'daily' check (notif_frequency in ('off','daily','twice_daily','weekly')),
  expo_push_token text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- journal
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  body text not null default '',
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table if not exists public.journal_chats (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- knowledge
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('book','youtube','link','note','voice')),
  type text not null check (type in ('article','video','book','tweet','pdf','note')),
  title text not null,
  author text,
  url text,
  thumbnail_url text,
  raw_content text,
  summary text,
  reading_time_min int,
  dedup_key text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, dedup_key)
);

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.knowledge_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  note text,
  location text,
  photo_url text,
  source_kind text not null default 'log' check (source_kind in ('log','photo','ai')),
  highlighted_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  unique (user_id, name)
);

create table if not exists public.knowledge_item_tags (
  knowledge_item_id uuid not null references public.knowledge_items (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (knowledge_item_id, tag_id)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  knowledge_item_id uuid not null references public.knowledge_items (id) on delete cascade,
  primary key (collection_id, knowledge_item_id)
);

-- pgvector store (adapter fills this when an embedding provider is configured)
create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  object_type text not null check (object_type in ('journal','item','highlight')),
  object_id uuid not null,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  unique (object_type, object_id)
);

-- ---------------------------------------------------------------------------
-- review / spaced repetition
-- ---------------------------------------------------------------------------
create table if not exists public.review_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  object_type text not null check (object_type in ('item','highlight')),
  object_id uuid not null,
  next_review_at timestamptz not null default now(),
  interval_days real not null default 1,
  ease real not null default 2.5,
  last_result text check (last_result in ('resonates','neutral','faded','snoozed')),
  reviews_count int not null default 0,
  unique (object_type, object_id)
);

-- ---------------------------------------------------------------------------
-- tracker
-- ---------------------------------------------------------------------------
create table if not exists public.widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'metric','habit','mood_chart','reading_stats','goal','journal_streak',
    'topics','quote_of_day'
  )),
  title text not null,
  config jsonb not null default '{}'::jsonb,
  position int not null default 0,
  size text not null default 'half' check (size in ('half','full')),
  is_ai_created boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.widget_data (
  id uuid primary key default gen_random_uuid(),
  widget_id uuid not null references public.widgets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ts timestamptz not null default now(),
  value jsonb not null
);

-- ---------------------------------------------------------------------------
-- integrations & notifications
-- ---------------------------------------------------------------------------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('youtube')),
  status text not null default 'active' check (status in ('active','paused','error')),
  config jsonb not null default '{}'::jsonb, -- e.g. {"playlist_id": "..."}
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('remember','connect','reflect')),
  object_type text,
  object_id uuid,
  sent_at timestamptz not null default now(),
  opened_at timestamptz
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_journal_entries_user_date on public.journal_entries (user_id, entry_date desc);
create index if not exists idx_knowledge_items_user_captured on public.knowledge_items (user_id, captured_at desc);
create index if not exists idx_highlights_item on public.highlights (knowledge_item_id);
create index if not exists idx_highlights_user on public.highlights (user_id);
create index if not exists idx_review_due on public.review_schedule (user_id, next_review_at);
create index if not exists idx_widget_data_widget_ts on public.widget_data (widget_id, ts desc);
create index if not exists idx_items_title_trgm on public.knowledge_items using gin (title gin_trgm_ops);
create index if not exists idx_highlights_text_trgm on public.highlights using gin (text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Row Level Security — private by default, owner-only access.
-- The FastAPI backend connects with the service role and additionally scopes
-- every query by the JWT-derived user_id.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','journal_entries','journal_chats','knowledge_items','highlights',
    'tags','collections','embeddings','review_schedule','widgets','widget_data',
    'integrations','notifications_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner', t
    );
  end loop;
end $$;

-- join tables (no user_id column): scope through parents
alter table public.knowledge_item_tags enable row level security;
create policy knowledge_item_tags_owner on public.knowledge_item_tags for all
  using (exists (select 1 from public.knowledge_items ki
                 where ki.id = knowledge_item_id and ki.user_id = auth.uid()))
  with check (exists (select 1 from public.knowledge_items ki
                      where ki.id = knowledge_item_id and ki.user_id = auth.uid()));

alter table public.collection_items enable row level security;
create policy collection_items_owner on public.collection_items for all
  using (exists (select 1 from public.collections c
                 where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.collections c
                      where c.id = collection_id and c.user_id = auth.uid()));

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- storage bucket for book page photos
insert into storage.buckets (id, name, public) values ('book-photos','book-photos', false)
on conflict (id) do nothing;

create policy book_photos_owner on storage.objects for all
  using (bucket_id = 'book-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'book-photos' and auth.uid()::text = (storage.foldername(name))[1]);
