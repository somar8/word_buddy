# Word Buddy

A personal Dutch word coach for every level (A1–C2). You pick your level when you
sign up. You type a new word, the app builds a card for your level — a meaning in
Dutch, English as backup, example sentences, related words and your own drawing —
and brings the word back after 1, 3, 7, 14, 30 and 60 days. Each review is a little
harder than the one before.

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

- **Level**: chosen at sign-up (or on first sign-in for older accounts) and changeable in Settings. It is stored in the
  Supabase Auth user metadata, and every AI prompt uses it (`lib/levels.ts`). A1 and A2 show English straight away.
- **Add** (`app/add`): `/api/card` asks Gemini for the card. The card is split into numbered sections (word, meaning,
  examples, related words, drawing, note) that you can check and edit before you save.
- **Drawing**: an optional sketch pad (`components/DrawingPad.tsx`) on the Add screen and on each word's page.
  The drawing is saved as a small PNG in the `words.drawing` column.
- **Test** (`app/test`): a practice test on the words added today (or due today). Step 1: match each English meaning
  with its Dutch word. Step 2: one tab per word with a sentence to fill in. It does not change the review plan.
- **Review** (`app/review`): up to 60 words a day. The exercise type follows the review number:
  1 meaning → 2 type the word with de/het → 3 fill the gap → 4 choose the word → 5 write your own sentence → 6 mixed.
  Fresh gap sentences for all of the day's words come from ONE Gemini call (`/api/tasks`), which stores them for that day.
  A correct answer moves the word on; a wrong answer sends it back to review 1 tomorrow.
- **Words** (`app/words`): search, filters, word detail, a date picker to pin a review date, and delete.
- **Reminder**: Vercel runs `/api/cron/remind` once a day (`vercel.json`, 07:00 UTC, which is 08:00–10:00 in the Netherlands) and pushes "N woorden wachten op je".
- The schedule logic lives in `lib/schedule.ts` and the settings in `lib/config.ts`. Run the tests with `npm test`.

## Set it up (about 30 minutes, once)

### 1. Get a free Gemini API key
1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Click **Create API key** and copy it.

### 2. Create the Supabase project
1. Sign up at <https://supabase.com> and create a **New project** (choose a region in Europe, for example Frankfurt).
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   (Already ran it before? Run it again: it adds the new `level` and `drawing` columns and keeps your words.)
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
   - `ALLOWED_EMAILS`: your own email address, so nobody else can use your AI quota.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` plus your email).
   - `CRON_SECRET`: any long random string. Vercel sends it to the daily job automatically.
   - `APP_TIME_ZONE`: `Europe/Amsterdam`.
4. Click **Deploy**. You get a link such as `https://word-buddy-xyz.vercel.app`.

### 7. Finish Supabase
1. **Authentication → URL Configuration**: set **Site URL** to your Vercel link.
2. Open the app and create your account (confirm the email if Supabase asks you to).
3. **Authentication → Sign In / Providers**: turn off **Allow new users to sign up**, so only you have an account.

### 8. Install it on your phone
1. On iPhone, open the Vercel link in **Safari**, tap **Share → Add to Home Screen**. On Android, open it in Chrome and choose **Install app**.
2. Open Word Buddy from the home screen, sign in, go to **Settings** (the gear icon) and tap **Turn on reminders**. Then tap **Send a test notification** to check that reminders arrive.

Every push to the GitHub `main` branch deploys a new version automatically.

## Not in the MVP yet

- **AI pictures and photos**: next phase. AI image models are not on Gemini's free tier. Your own drawing works now.
- **Other languages**: next phase. Dutch is set in `lib/config.ts`.
- **Choosing your own reminder time**: the free Vercel plan allows one fixed daily job.
- **Checking de/het against a dictionary**: the AI sets the article, and you can correct it before saving.
