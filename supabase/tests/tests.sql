-- Database tests for Word Buddy. Run with: npm run test:db
-- Every check raises an error with a clear message when it fails.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Two users. Acting as one: set_config('request.jwt.claim.sub', id) + set role authenticated.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'anna@example.com', '{"language":"de","levels":{"de":"A2","nl":"B1"},"translations":{"de":"nl"}}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', '{"level":"B1"}');

-- ---------- Profiles and sign-ins ----------
select pg_temp.check((select count(*) = 2 from public.profiles), 'a profile is created for every sign-up');
select pg_temp.check((select language = 'de' and level = 'A2' and translate_to = 'nl' from public.profiles where email = 'anna@example.com'),
  'profile shows the current language, its level and its translation language');
select pg_temp.check((select language = 'nl' and level = 'B1' from public.profiles where email = 'ben@example.com'),
  'an older account (single "level") is read as Dutch at that level');
update auth.users set email_confirmed_at = now(), last_sign_in_at = now() where email = 'anna@example.com';
update auth.users set last_sign_in_at = now() + interval '1 hour' where email = 'anna@example.com';
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"speech":"slow"}' where email = 'anna@example.com';
select pg_temp.check((select sign_in_count = 2 and confirmed_at is not null from public.profiles where email = 'anna@example.com'),
  'sign-ins are counted; a confirmed email is recorded; saving preferences is not a sign-in');
select pg_temp.check((select count(*) = 2 from public.sign_ins where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'each sign-in is logged in sign_ins');

-- ---------- Words: defaults and checks (as Anna) ----------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
insert into public.words (language, word, article, due_on, added_on) values ('de', 'Termin', 'der', current_date, current_date);
select pg_temp.check((select kind = 'word' and translation_lang = 'en' and lapses = 0 and stage = 1 and user_id = auth.uid()
  from public.words where word = 'Termin'), 'a new word gets the right defaults and belongs to the user');
insert into public.words (language, word, due_on, added_on) values ('nl', 'termin', current_date, current_date);
select pg_temp.check(true, 'the same word may exist in another language');
do $$ begin
  insert into public.words (language, word, due_on, added_on) values ('de', 'TERMIN', current_date, current_date);
  perform pg_temp.check(false, 'a duplicate in the same language is refused');
exception when unique_violation then perform pg_temp.check(true, 'a duplicate in the same language is refused'); end $$;
do $$ begin
  insert into public.words (language, word, kind, due_on, added_on) values ('de', 'x y', 'poem', current_date, current_date);
  perform pg_temp.check(false, 'an unknown kind is refused');
exception when check_violation then perform pg_temp.check(true, 'an unknown kind is refused'); end $$;
do $$ begin
  insert into public.words (language, word, article, due_on, added_on) values ('de', 'Haus', 'le', current_date, current_date);
  perform pg_temp.check(false, 'an unknown article is refused');
exception when check_violation then perform pg_temp.check(true, 'an unknown article is refused'); end $$;
do $$ begin
  insert into public.words (language, word, due_on, added_on) values ('fr', 'maison', current_date, current_date);
  perform pg_temp.check(false, 'an unknown language is refused');
exception when check_violation then perform pg_temp.check(true, 'an unknown language is refused'); end $$;
do $$ begin
  insert into public.words (language, word, stage, due_on, added_on) values ('de', 'Hund', 8, current_date, current_date);
  perform pg_temp.check(false, 'a stage above 7 is refused');
exception when check_violation then perform pg_temp.check(true, 'a stage above 7 is refused'); end $$;
insert into public.words (language, word, kind, key_word, literal, usage, due_on, added_on)
values ('de', 'jemandem die Daumen drücken', 'idiom', 'Daumen drücken', 'press the thumbs', 'Informal.', current_date, current_date);

-- Anna's reviews, test and story.
insert into public.reviews (word_id, stage, task, correct, rating)
select id, 1, 'meaning', true, 'good' from public.words where word = 'Termin';
insert into public.reviews (word_id, stage, task, correct, rating, reviewed_at)
select id, 2, 'type', false, 'again', now() - interval '1 day' from public.words where word = 'Termin';
insert into public.tests (language, total, right_count) values ('de', 3, 2);
insert into public.stories (language, day, content) values ('de', current_date, '{"title":"T"}');
do $$ begin
  insert into public.stories (language, day, content) values ('de', current_date, '{"title":"again"}');
  perform pg_temp.check(false, 'one story per language and day');
exception when unique_violation then perform pg_temp.check(true, 'one story per language and day'); end $$;

-- practice_days: per language, per day, only your own.
select pg_temp.check((select count(*) = 2 and sum(reviews) = 2 and sum(correct) = 1
  from public.practice_days('de', 'Europe/Amsterdam', current_date - 7)), 'practice_days counts reviews per day for the language');
select pg_temp.check((select count(*) = 0 from public.practice_days('nl', 'Europe/Amsterdam', current_date - 7)),
  'practice_days keeps languages apart');

-- Daily AI limit.
select pg_temp.check((select public.use_ai(2) and public.use_ai(2) and not public.use_ai(2)), 'the daily AI limit allows 2 and refuses the 3rd');
reset role;

-- ---------- Privacy: Ben can see and change nothing of Anna ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
set role authenticated;
select pg_temp.check((select count(*) = 0 from public.words), 'another user sees none of the words');
select pg_temp.check((select count(*) = 0 from public.reviews), 'another user sees none of the reviews');
select pg_temp.check((select count(*) = 0 from public.tests), 'another user sees none of the tests');
select pg_temp.check((select count(*) = 0 from public.stories), 'another user sees none of the stories');
select pg_temp.check((select count(*) = 0 from public.sign_ins), 'another user sees none of the sign-ins');
select pg_temp.check((select count(*) = 1 and bool_and(email = 'ben@example.com') from public.profiles), 'a user sees only their own profile');
select pg_temp.check((select count(*) = 0 from public.practice_days('de', 'Europe/Amsterdam', current_date - 7)),
  'practice_days never shows another user''s reviews');
with u as (update public.words set word = 'hacked' returning 1) select pg_temp.check((select count(*) = 0 from u), 'another user cannot change the words');
with d as (delete from public.tests returning 1) select pg_temp.check((select count(*) = 0 from d), 'another user cannot delete the tests');
do $$ begin
  insert into public.words (user_id, language, word, due_on, added_on)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'de', 'planted', current_date, current_date);
  perform pg_temp.check(false, 'nobody can add a word to someone else''s list');
exception when insufficient_privilege then perform pg_temp.check(true, 'nobody can add a word to someone else''s list'); end $$;
with u as (update public.profiles set level = 'C2' returning 1) select pg_temp.check((select count(*) = 0 from u), 'profiles cannot be edited directly');
reset role;

-- ---------- Not signed in ----------
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.check((select count(*) = 0 from public.words), 'a visitor who is not signed in sees no words');
do $$ begin
  perform public.use_ai(5);
  perform pg_temp.check(false, 'a visitor cannot use the AI allowance');
exception when insufficient_privilege then perform pg_temp.check(true, 'a visitor cannot use the AI allowance'); end $$;
reset role;

-- ---------- Deleting an account removes all its data ----------
delete from auth.users where email = 'anna@example.com';
select pg_temp.check((select
    (select count(*) from public.words where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  + (select count(*) from public.reviews where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  + (select count(*) from public.tests where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  + (select count(*) from public.stories where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  + (select count(*) from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001')
  + (select count(*) from public.sign_ins where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  + (select count(*) from public.ai_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0),
  'deleting an account removes its words, reviews, tests, stories, profile, sign-ins and AI usage');
select pg_temp.check((select count(*) = 1 from public.profiles), 'other accounts are untouched');
