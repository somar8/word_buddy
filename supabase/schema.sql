-- Word Buddy database schema.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

-- One row per word you add.
create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word text not null,
  language text not null default 'nl' check (language in ('nl', 'de', 'en')), -- language being learned
  translation_lang text not null default 'en', -- language of meaning_en and the example translations
  kind text not null default 'word' check (kind in ('word', 'phrase', 'idiom', 'saying', 'sentence')),
  literal text not null default '',   -- word-for-word meaning (idioms)
  usage text not null default '',     -- when to use it: formal, informal, spoken...
  key_word text not null default '',  -- the part exercises blank out (expressions)
  article text not null default '' check (article in ('', 'de', 'het', 'der', 'die', 'das')),
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

-- Dutch, German and English (safe to run again).
alter table public.words add column if not exists language text not null default 'nl'
  check (language in ('nl', 'de', 'en'));
alter table public.words add column if not exists translation_lang text not null default 'en';
-- Expressions, phrases, idioms, sayings and sentences live next to words.
alter table public.words add column if not exists kind text not null default 'word'
  check (kind in ('word', 'phrase', 'idiom', 'saying', 'sentence'));
alter table public.words add column if not exists literal text not null default '';
alter table public.words add column if not exists usage text not null default '';
alter table public.words add column if not exists key_word text not null default '';
alter table public.words drop constraint if exists words_article_check;
alter table public.words add constraint words_article_check
  check (article in ('', 'de', 'het', 'der', 'die', 'das'));

-- The same word may exist once per language.
drop index if exists public.words_user_word_unique;
create unique index if not exists words_user_lang_word_unique on public.words (user_id, language, lower(word));
create index if not exists words_user_due on public.words (user_id, due_on);
create index if not exists words_user_lang_due on public.words (user_id, language, due_on);

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

-- Practice tests (Test tab > My tests).
create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  language text not null default 'nl',
  source text not null default '',          -- added / due / recent
  total int not null,
  right_count int not null,
  match_mistakes int not null default 0,
  items jsonb not null default '[]'::jsonb,  -- [{ "word_id", "word", "sentence", "answer", "given", "correct" }]
  taken_at timestamptz not null default now()
);
create index if not exists tests_user_time on public.tests (user_id, taken_at desc);

-- ---------------------------------------------------------------------------
-- Users. Supabase keeps accounts in auth.users (Dashboard > Authentication > Users).
-- public.profiles mirrors what the app needs in a table you can browse in the
-- Table Editor; triggers keep it up to date, and public.sign_ins logs each sign-in.
-- Preferences (language, levels, translation) live in the account's user metadata.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  language text,
  level text,
  translate_to text, -- translation language for the language being learned now
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  sign_in_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.sign_ins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  signed_in_at timestamptz not null
);
create index if not exists sign_ins_user_time on public.sign_ins (user_id, signed_in_at desc);

create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  lang text := coalesce(meta->>'language', 'nl');
  new_sign_in boolean := new.last_sign_in_at is not null
    and (tg_op = 'INSERT' or new.last_sign_in_at is distinct from old.last_sign_in_at);
begin
  insert into public.profiles as p
    (id, email, language, level, translate_to, created_at, confirmed_at, last_sign_in_at, sign_in_count)
  values
    (new.id, new.email, lang, coalesce(meta->'levels'->>lang, meta->>'level'),
     coalesce(meta->'translations'->>lang, meta->>'translate_to'),
     new.created_at, new.email_confirmed_at, new.last_sign_in_at, case when new_sign_in then 1 else 0 end)
  on conflict (id) do update set
    email = excluded.email,
    language = excluded.language,
    level = excluded.level,
    translate_to = excluded.translate_to,
    confirmed_at = excluded.confirmed_at,
    last_sign_in_at = excluded.last_sign_in_at,
    sign_in_count = p.sign_in_count + case when new_sign_in then 1 else 0 end,
    updated_at = now();
  if new_sign_in then
    insert into public.sign_ins (user_id, signed_in_at) values (new.id, new.last_sign_in_at);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_changed on auth.users;
create trigger on_auth_user_changed
  after insert or update on auth.users
  for each row execute function public.sync_profile();

-- Fill in profiles for accounts that existed before this table.
insert into public.profiles (id, email, language, level, translate_to, created_at, confirmed_at, last_sign_in_at, sign_in_count)
select u.id, u.email,
       coalesce(u.raw_user_meta_data->>'language', 'nl'),
       coalesce(u.raw_user_meta_data->'levels'->>coalesce(u.raw_user_meta_data->>'language', 'nl'), u.raw_user_meta_data->>'level'),
       coalesce(u.raw_user_meta_data->'translations'->>coalesce(u.raw_user_meta_data->>'language', 'nl'),
                u.raw_user_meta_data->>'translate_to'),
       u.created_at, u.email_confirmed_at, u.last_sign_in_at,
       case when u.last_sign_in_at is null then 0 else 1 end
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Daily AI limit per user, so open sign-up cannot use up the free Gemini quota.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (user_id, day)
);

create or replace function public.use_ai(max_calls int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ai_usage as a (user_id, day, calls) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set calls = a.calls + 1
  returning calls into n;
  return n <= max_calls;
end;
$$;
revoke execute on function public.use_ai(int) from public, anon;
grant execute on function public.use_ai(int) to authenticated;

-- Row level security: every user only sees their own rows.
alter table public.words enable row level security;
alter table public.reviews enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.tests enable row level security;
alter table public.profiles enable row level security;
alter table public.sign_ins enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "own words" on public.words;
create policy "own words" on public.words
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own reviews" on public.reviews;
create policy "own reviews" on public.reviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own tests" on public.tests;
create policy "own tests" on public.tests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Profiles, sign-ins and AI usage are written only by the triggers/functions above.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());

drop policy if exists "read own sign-ins" on public.sign_ins;
create policy "read own sign-ins" on public.sign_ins for select using (user_id = auth.uid());

drop policy if exists "read own ai usage" on public.ai_usage;
create policy "read own ai usage" on public.ai_usage for select using (user_id = auth.uid());
