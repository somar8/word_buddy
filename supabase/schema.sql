-- Word Buddy database schema.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

-- One row per word you add.
create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word text not null,
  article text not null default '' check (article in ('', 'de', 'het')),
  part_of_speech text not null default '',
  forms text not null default '',
  meaning_nl text not null default '',
  meaning_en text not null default '',
  examples jsonb not null default '[]'::jsonb,   -- [{ "nl": "...", "en": "..." }]
  related jsonb not null default '[]'::jsonb,    -- [{ "word": "...", "relation": "...", "en": "..." }]
  note text not null default '',
  level text not null default 'B1' check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')), -- level the card was made for
  drawing text check (drawing is null or length(drawing) < 600000), -- your own sketch, as a PNG data URL
  stage int not null default 1 check (stage between 1 and 7), -- 1..6 = next review number, 7 = learned
  due_on date not null,
  added_on date not null,
  review_task jsonb,          -- today's AI-made exercise (fresh sentence)
  review_task_on date,        -- the day review_task was made for
  created_at timestamptz not null default now()
);

-- For projects created before levels and drawings existed (safe to run again).
alter table public.words add column if not exists level text not null default 'B1'
  check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
alter table public.words add column if not exists drawing text
  check (drawing is null or length(drawing) < 600000);

create unique index if not exists words_user_word_unique on public.words (user_id, lower(word));
create index if not exists words_user_due on public.words (user_id, due_on);

-- One row per answer, so we can measure progress later.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_id uuid not null references public.words (id) on delete cascade,
  stage int not null,
  task text not null,
  correct boolean not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists reviews_user_time on public.reviews (user_id, reviewed_at);

-- Browser push subscriptions for the daily reminder.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Each user's level (A1-C2) is stored in Supabase Auth user metadata ("level"),
-- chosen at sign-up and changeable in Settings, so it needs no table.

-- Row level security: every user only sees their own rows.
alter table public.words enable row level security;
alter table public.reviews enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "own words" on public.words;
create policy "own words" on public.words
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own reviews" on public.reviews;
create policy "own reviews" on public.reviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
