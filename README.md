# Word Buddy

A word coach for **Dutch, German and English**, at every level (A1–C2). You pick the
language and your level when you sign up. You type a new word, the app builds a card
for your level — a meaning in that language, a translation in the language you choose,
example sentences, related words and your own drawing — and brings the word back after
1, 3, 7, 14, 30 and 60 days. Each review is a little harder than the one before.

## Free stack (€0 per month)

| Part | Service | Free tier used |
| --- | --- | --- |
| App and API | [Next.js](https://nextjs.org) on [Vercel](https://vercel.com) Hobby | Personal, non-commercial use; 1 daily scheduled job |
| Database and login | [Supabase](https://supabase.com) Free | 500 MB database, 2 projects; paused after 1 week without activity (the daily job keeps it active) |
| Word cards and exercises | [Google Gemini API](https://aistudio.google.com) free tier | Rate-limited; on the free tier Google may use your prompts to improve its products |
| Daily reminder | Web push (VAPID) | Free, no third-party service |
| Pronunciation | The phone's built-in Dutch voice | Free |

No credit card is needed for any of these.

## How the app works

- **Languages and preferences**: learn Dutch, German or English (`lib/languages.ts`). Each language keeps its own
  words, its own level and its own translation language (for example German → Dutch, English → Arabic).
  Each saved word remembers the language its translation is in. **Settings → Preferences** sets the language, level, translation language, whether
  translations show straight away, and pronunciation speed. They live in the Supabase Auth user metadata
  (`lib/prefs.ts`), and every AI prompt uses them.
- **Accounts**: anyone can sign up. The confirmation email links to `/auth/confirm`
  (`app/auth/confirm/page.tsx`), which also explains expired links and can send a new one.
  The `profiles` table mirrors every account (email, language, level, confirmed, last sign-in, number of sign-ins)
  and `sign_ins` logs each sign-in. Both are filled by database triggers. Each account may make
  `AI_CALLS_PER_DAY` AI requests a day (default 150).
- **Clear errors**: when something fails, the app says what happened and what to do (offline, AI busy, daily limit,
  not a word in this language…), with a **Try again** button where that helps (`lib/server/http.ts`, `components/ErrorBox.tsx`).
- **Add** (`app/add`): `/api/card` asks Gemini for the card. You check and edit it — article, word, meaning,
  examples (add your own), related words, plus an optional drawing and note — and save it from the bar at the bottom.
  Words added today are listed under the form.
- **Expressions** (Add → "Expression or sentence", `app/api/expression`): phrases, idioms, sayings and whole sentences.
  The card adds the literal meaning (idioms), when to use it, and a key part. They are reviewed like words, but review 2
  is "complete the expression" (the key part is hidden), and gap sentences hide only the key part.
- **Re-translating** (`app/api/retranslate`): a card's page shows which language its translations are in, with a
  button to translate it into the language you chose. **Settings → Preferences** can re-translate all cards of a
  language at once (15 cards per AI request). Today's exercise sentences are only reused when they are in the
  card's translation language.
- **Deleting**: tap **Select** in Words or Expressions to delete several at once, or delete one from its page.
  In **Test → My tests**, open a test to delete it, or delete all tests for the language. Every delete asks first
  (`components/ConfirmDialog.tsx`) and is permanent; deleting a word also removes its review history.
- **Two separate lists** (My list, `app/words`): **Words** and **Expressions** each have their own count, search and filters;
  the expressions list can also be filtered by kind. `/words#expressions` opens it directly.
- **Your own sentences**: on a word's page you can add sentences; the AI checks them, fixes mistakes and adds a translation.
- **Drawing**: an optional sketch pad (`components/DrawingPad.tsx`) on the Add screen and on each word's page.
  The drawing is saved as a small PNG in the `words.drawing` column.
- **Test** (`app/test`): a practice test on the words added today (or due today). Step 1: match each meaning
  with its word. Step 2: one tab per word with a sentence to fill in. It does not change the review plan.
  **My tests** lists every finished test with your answers (`tests` table).
- **Search** (`app/words`): finds words by the word, article + word, meaning, translation, related words or note,
  ignoring capitals and accents.
- **Review** (`app/review`): up to 60 words a day. After each answer you rate it **Again / Hard / Good / Easy**
  (a wrong typed answer counts as Again). Good follows days 1, 3, 7, 14, 30, 60, then a check every 90 days; Hard repeats
  the step after half the gap; Easy skips a step; Again goes **two steps back** (not to the start) and comes back tomorrow.
  The exercises mix reading, writing, listening and speaking: meaning → type it / from the translation / listen and type →
  fill the gap / listen → choose / say it (the phone's own speech recognition) → write your own sentence → mixed.
  "Can't listen / speak now" swaps to a typing exercise. Typing allows one small slip per word (not in articles).
  Words answered Again 2+ times are **hard words** (Progress, My list → Hard, Test → My hard words). Logic: `lib/schedule.ts`.
- **Daily story** (`app/story`, `app/api/story`): once a day the AI writes a short text at your level with up to 7 of your
  most recent words, highlighted (tap for the meaning), with a translation, read-aloud and 3 questions. Stored per day.
- **Progress** (`app/progress`): streak (days in a row with a review, test or story), today's goal (Settings → daily goal),
  the last 7 days, reviews per day, where your words are in the schedule, and your hard words.
- **My list** (`app/words`, the menu item at the bottom): search, filters, the page of each word or expression,
  a date picker to pin a review date, and delete.
- **Reminder**: Vercel runs `/api/cron/remind` once a day (`vercel.json`, 07:00 UTC, which is 08:00–10:00 in the Netherlands) and pushes "N woorden wachten op je".
- The schedule logic lives in `lib/schedule.ts` and the settings in `lib/config.ts`. Tests: `npm test` (55 unit tests), `npm run test:coverage` (the same, with coverage: about 97% of `lib/`),
  `npm run test:db` (31 database checks on a throwaway local Postgres: privacy between users, limits, deletes;
  needs Postgres installed, nothing touches Supabase).

## Set it up (about 30 minutes, once)

### 1. Get a free Gemini API key
1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Click **Create API key** and copy it.

### 2. Create the Supabase project
1. Sign up at <https://supabase.com> and create a **New project** (choose a region in Europe, for example Frankfurt).
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   (Already ran it before? Run it again after each update: it adds what is new and keeps your words.)
3. Click **Connect** at the top of the project page and copy the **Project URL** (`https://<project-id>.supabase.co`).
4. Open **Project Settings → API Keys** and copy the **publishable key** (for `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and the **secret key** (for `SUPABASE_SERVICE_ROLE_KEY`).

### 3. Make the push keys
```bash
npx web-push generate-vapid-keys
```
This prints a public key and a private key.

### 4. Try it on your computer (optional)
```bash
cp .env.example .env.local
```
Fill in `.env.local` (see the comments in the file). Then start the app:
```bash
npm run dev
```
Open <http://localhost:3000> and create your account.

### 5. Put the code on GitHub
Create a **private** repository on GitHub and push this folder to it.

### 6. Deploy on Vercel
1. Sign up at <https://vercel.com> with GitHub (the Hobby plan is free).
2. Click **Add New → Project**, import the repository and open **Environment Variables**.
3. Add every variable from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase.
   - `GEMINI_API_KEY` from Google AI Studio.
   - `AI_CALLS_PER_DAY` (optional): AI requests per account per day, default 150.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` plus your email).
   - `CRON_SECRET`: any long random string. Vercel sends it to the daily job automatically.
   - `APP_TIME_ZONE`: `Europe/Amsterdam`.
4. Click **Deploy**. You get a link such as `https://word-buddy-xyz.vercel.app`.

### 7. Finish Supabase (confirmation emails)
1. **Authentication → URL Configuration**:
   - **Site URL**: your Vercel link, for example `https://word-buddy-xyz.vercel.app`.
   - **Redirect URLs**: add `https://word-buddy-xyz.vercel.app/auth/confirm` and, for testing on your computer,
     `http://localhost:3000/auth/confirm`.
2. *(Optional — only possible with your own SMTP service, see below.)* The app works with Supabase's standard
   confirmation email. On the built-in email service the templates are read-only. Once you connect your own SMTP,
   you can make links safe from email link scanners: **Authentication → Emails → Confirm signup**, replace the link with:
   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
   ```
3. **Authentication → Sign In / Providers**: keep **Allow new users to sign up** on, so anyone can create an account.
4. Open the app and create your account.

Supabase's built-in email service sends only a few emails per hour. For more sign-ups, connect a free
SMTP service (for example Resend or Brevo) under **Authentication → Emails → SMTP Settings**.

### 8. Install it on your phone
1. On iPhone, open the Vercel link in **Safari**, tap **Share → Add to Home Screen**. On Android, open it in Chrome and choose **Install app**.
2. Open Word Buddy from the home screen, sign in, go to **Settings** (the gear icon) and tap **Turn on reminders**. Then tap **Send a test notification** to check that reminders arrive.

Every push to the GitHub `main` branch deploys a new version automatically.

## Not in the MVP yet

- **AI pictures and photos**: next phase. AI image models are not on Gemini's free tier. Your own drawing works now.
- **More languages**: add one to `lib/languages.ts` and to the `language` check in `supabase/schema.sql`.
- **Choosing your own reminder time**: the free Vercel plan allows one fixed daily job.
- **Checking de/het against a dictionary**: the AI sets the article, and you can correct it before saving.
