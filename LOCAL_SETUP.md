# Run eAcharya on your own computer (no Netlify)

Netlify is only the place the site is *hosted*. The app itself is a normal Next.js project, so it
runs fine on your PC. Your data (users, courses, uploaded videos) stays in Supabase either way.

## Option A (recommended): app on your PC, database on your existing Supabase project

Nothing to migrate: you keep all your current users, courses and files.

1. Install Node.js 20+ (https://nodejs.org). Check with `node -v`.
2. In this folder run `npm install` (once).
3. Create `.env.local` (copy `.env.example`) with the SAME two values Netlify uses
   (Netlify -> Site settings -> Environment variables, or Supabase -> Project Settings -> API):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-KEY
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
4. Supabase -> Authentication -> URL Configuration: add `http://localhost:3000/auth/callback`
   to Redirect URLs (keep your Netlify one too). Without this, email links and sign-in redirects
   will not come back to localhost.
5. Run the new migrations once, in order (SQL Editor): `supabase/migrations/20261023000001_lesson_files_bucket.sql`, then `supabase/migrations/20261023000002_teacher_lesson_resources.sql`.
   (Also make sure `20261022000001_video_qualities.sql` has been run.)
6. Start:
   - `npm run dev`   (fast, for editing and checking)
   - or `npm run build` then `npm run start`  (exactly what production behaves like)

   Open http://localhost:3000. Open it from your phone on the same Wi-Fi with
   `npm run dev -- -H 0.0.0.0` and then http://<your-PC-IP>:3000 (add that URL to the
   Supabase redirect list too if you want to sign in from the phone).

## Option B: everything local (database too)

Needs Docker Desktop. Good for testing without touching real data.

```bash
npx supabase init          # once; creates supabase/config.toml
npx supabase start         # prints API URL + keys
npx supabase db reset      # applies supabase/migrations/* in order, then supabase/seed.sql
```
Put the printed `API URL` and `Publishable`/`anon` key into `.env.local`. Sign-up emails appear
in the local mail inbox at http://127.0.0.1:54324.

Limitation: the video validator only accepts `https://` video links, and local Supabase serves files
over `http://127.0.0.1`. So uploaded videos will be rejected locally. Use Option A for testing uploads
and videos (or expose local Supabase through an https tunnel).

## Why this avoids the Netlify limits

Netlify spends build minutes / bandwidth / function credits on every deploy and request. Running
locally uses none of them. Deploy to Netlify only when you are happy with a change.
