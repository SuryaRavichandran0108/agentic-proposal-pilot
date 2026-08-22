-- LiveCards initial schema
-- Decks own cards; a deck may optionally be fed by one Google Sheet source.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- decks
-- ---------------------------------------------------------------------------
create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists decks_user_id_idx on public.decks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- sheet_sources
-- One Google Sheet feeding one deck. `webhook_secret` is the shared secret the
-- Apps Script trigger presents; it is never exposed to the browser client.
-- ---------------------------------------------------------------------------
create table if not exists public.sheet_sources (
  id               uuid primary key default gen_random_uuid(),
  deck_id          uuid not null unique references public.decks (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  spreadsheet_id   text not null,
  sheet_name       text not null default 'Sheet1',
  -- Header names to look for. Matching is case- and whitespace-insensitive.
  term_header      text not null default 'Term',
  definition_header text not null default 'Definition',
  -- Optional stable-ID column. When present it survives row reordering and
  -- deletion; when absent we fall back to the sheet row number.
  id_header        text,
  webhook_secret   text not null default encode(gen_random_bytes(24), 'hex'),
  -- When true, cards whose source row vanished from the sheet are archived.
  archive_removed  boolean not null default true,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists sheet_sources_spreadsheet_idx
  on public.sheet_sources (spreadsheet_id);

-- ---------------------------------------------------------------------------
-- cards
-- `source_row_key` ties a card back to its sheet row so re-ingestion updates
-- rather than duplicates. `content_hash` makes "has this row changed?" an
-- index lookup instead of a string comparison.
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id             uuid primary key default gen_random_uuid(),
  deck_id        uuid not null references public.decks (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  term           text not null,
  definition     text not null,
  source_row_key text,
  content_hash   text,
  origin         text not null default 'sheet' check (origin in ('sheet', 'manual')),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A sheet row maps to at most one card per deck. Partial index so manually
-- created cards (null key) are unconstrained.
create unique index if not exists cards_deck_source_row_key_idx
  on public.cards (deck_id, source_row_key)
  where source_row_key is not null;

create index if not exists cards_deck_active_idx
  on public.cards (deck_id, created_at desc)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- ingest_runs — one row per webhook firing, for debugging the pipeline
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_runs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid references public.sheet_sources (id) on delete cascade,
  deck_id        uuid references public.decks (id) on delete cascade,
  status         text not null check (status in ('success', 'error')),
  trigger_source text,
  rows_scanned   integer not null default 0,
  cards_created  integer not null default 0,
  cards_updated  integer not null default 0,
  cards_archived integer not null default 0,
  skipped_rows   integer not null default 0,
  duration_ms    integer,
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists ingest_runs_deck_idx
  on public.ingest_runs (deck_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists decks_touch_updated_at on public.decks;
create trigger decks_touch_updated_at
  before update on public.decks
  for each row execute function public.touch_updated_at();

drop trigger if exists cards_touch_updated_at on public.cards;
create trigger cards_touch_updated_at
  before update on public.cards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Every table is scoped to the owning user. The Edge Function uses the
-- service-role key and bypasses these policies by design.
-- ---------------------------------------------------------------------------
alter table public.decks         enable row level security;
alter table public.sheet_sources enable row level security;
alter table public.cards         enable row level security;
alter table public.ingest_runs   enable row level security;

drop policy if exists "own decks" on public.decks;
create policy "own decks" on public.decks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sources" on public.sheet_sources;
create policy "own sources" on public.sheet_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own cards" on public.cards;
create policy "own cards" on public.cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ingest logs are read-only from the client; only the service role writes them.
drop policy if exists "read own ingest runs" on public.ingest_runs;
create policy "read own ingest runs" on public.ingest_runs
  for select using (
    exists (
      select 1 from public.decks d
      where d.id = ingest_runs.deck_id and d.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: the browser subscribes to card changes so new rows appear live.
-- ---------------------------------------------------------------------------
alter table public.cards replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'cards'
  ) then
    alter publication supabase_realtime add table public.cards;
  end if;
end
$$;
