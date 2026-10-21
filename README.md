# eAcharya — Geography Learning Platform

A Geography learning platform for Classes 9–12, built with Next.js App Router, TypeScript, Tailwind CSS and Supabase.

> **Current readiness:** Core learning, discussion, Geography Lab, teacher assessment authoring, student assessment attempts/results, grading, and combined teacher Assessment Analytics & Reports routes are present in this source tree. A route or component being present does **not** mean the feature has been live-tested or is ready for production. Check `BUILD_STATUS.md`, `PHASE_H_VERIFICATION_CHECKLIST.md`, and `LIVE_SUPABASE_VERIFICATION.md` for verification state and known gaps before release.

## Main areas

- **Student learning:** course browsing and enrolment, e-Tutorials, e-Content, bookmarks and progress.
- **Discussion forum:** discussions, replies, likes, bookmarks, reporting and admin moderation (database migrations must match the code).
- **Assessment workflow:** teacher assessment authoring, student attempts and submission, results, teacher grading, and a single **Assessment Analytics & Reports** page. The page includes assessment summaries plus advanced student-progress and question-wise analysis when the Phase 2 analytics migration is applied. `/dashboard/teacher/reports` redirects to `/dashboard/teacher/analytics`.
- **Geography Lab:** interactive world map, coordinate-grid explorer, thematic map studio, climate climographs, population density/growth and age-structure explorers, plus practical activity workspaces. Climate and population examples are clearly marked synthetic teaching data, not official statistics. Practical drafts remain local to the student device; teacher assignment/shared server-side practical-progress features are not implemented yet.
- **Admin tools:** user administration and forum moderation.


## Phase 4 — Geography Lab tools

- `/geography-lab/latitude-longitude`: validates decimal coordinates, interprets hemispheres and plots the selected point on a simplified coordinate grid.
- `/geography-lab/climate-explorer`: select a climate teaching profile, read a climograph, view monthly values and calculate annual rainfall, mean temperature, warmest/coolest month, and wettest/driest month. Values are illustrative, not official station data.
- `/geography-lab/population-explorer`: compare synthetic settlement examples, calculate population density and population growth, and inspect age-group shares. Values are illustrative, not official statistics.
- All six Geography Lab cards now link to a real route; the existing Map Explorer, Thematic Map Studio and practical library remain in place. No new database migration is required for these client-side learning tools.
- Verification: typecheck and targeted ESLint are run where available. Automated Vitest execution requires the platform-specific Rollup native optional dependency; if missing, run `npm ci` on the local machine then `npm test`. A production build should also be run before deployment.

## Read before making changes

- `BUILD_STATUS.md` is the detailed implementation/verification log; it contains chronological notes, and older phase notes may describe the state before later features were added. Read the most recent dated entries and the verification sections.
- `LOCAL_SETUP.md` covers local setup. Do not place Supabase service-role/secret keys in client code or share `.env.local`.
- `PHASE_H_VERIFICATION_CHECKLIST.md` and `LIVE_SUPABASE_VERIFICATION.md` list important checks that must be completed against the actual Supabase project.

## Quick start (local, in this order)

1. **Install Node.js 20 or newer**, then in this folder:
   ```bash
   npm install
   ```
2. **Create a Supabase project** at https://supabase.com (free tier is fine). Choose a region and set a database password.
3. **Copy the environment file** and fill in two values:
   ```bash
   cp .env.example .env.local
   ```
   In the Supabase dashboard: *Project Settings → API*.
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the **publishable** key (*API Keys* page). If your project only shows the older `anon` key, use that value instead; it works the same way.
   - Leave `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local work.
   - **Never** put the `service_role` / secret key in this project. Phase 1 does not need it.
4. **Apply the database migrations**, in order. Easiest way: *Supabase dashboard → SQL Editor → New query*, paste and run each file:
   1. `supabase/migrations/20261016000001_initial_schema.sql`
   2. `supabase/migrations/20261016000002_auth_and_rls.sql`
   3. `supabase/migrations/20261016000003_phase2_learning.sql` (Phase 2: tables, RLS, private storage bucket)
   4. `supabase/migrations/20261017000001_phase3_assessments.sql` (Phase 3, Task 3.1: assessments and question bank, additive only)
   5. `supabase/migrations/20261018000001_phase5_2_forum.sql` (Phase 5.2: discussions and replies, additive only; **not applied by any script, apply it yourself on a scratch project first**)
   6. `supabase/migrations/20261019000001_phase5_3_forum_likes_bookmarks_search.sql` (Phase 5.3: likes, forum bookmarks, search indexes; **not applied by any script, apply it yourself on a scratch project first, and BEFORE deploying the 5.3 code**)
   7. `supabase/migrations/20261020000001_phase5_4a_forum_reports.sql` (Phase 5.4A: forum reports; **not applied by any script, apply it yourself on a scratch project first**)
   8. `supabase/migrations/20261021000001_phase5_4b_forum_moderation.sql` (Phase 5.4B: moderation; **not applied by any script, apply it yourself on a scratch project first, after migration 7**)
   5. `supabase/seed.sql` (classes, Geography, and clearly labelled `[Sample]` courses, lessons, resources and one sample assessment)

   (Or with the Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
5. **Configure auth URLs**: *Authentication → URL Configuration*:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback`
6. **Run the app:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

## Email verification and password reset

Both flows use the link Supabase emails to the user, which lands on `/auth/callback`.

1. *Authentication → Providers → Email*: keep **Confirm email** turned on.
2. *Authentication → URL Configuration*: set the Site URL and add the redirect URLs for **every** environment (local and production), e.g. `https://your-domain.com/auth/callback`.
3. *Authentication → Emails → Templates*: the default templates work with the PKCE `code` flow used here. If you customise them, keep links pointing to `{{ .ConfirmationURL }}`.
4. Supabase's built-in email sender is rate-limited and meant for testing. For production, configure custom SMTP (*Project Settings → Authentication → SMTP*).

Do not treat these flows as working until you have signed up with a real inbox and clicked the link end to end.

## Creating the first administrator (safely)

Public sign-up can never create a teacher or admin. The database trigger always assigns `student`, and a
second trigger blocks role changes unless the caller is already an admin or a trusted backend.

1. Sign up normally through `/sign-up` and verify the email.
2. In the Supabase **SQL Editor** (which runs with database owner rights, not as a website user), run:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');
   ```
3. Sign out and back in, and you land on `/dashboard/admin`.
4. From there you can promote teachers using the **Users** table. Nobody can change their own role.

## Scripts

```bash
npm run dev        # development server
npm run typecheck  # TypeScript (strict)
npm run lint       # ESLint
npm test           # Vitest unit tests
npm run build      # production build
```

Run `npm run typecheck && npm run lint && npm test && npm run build` before deploying.

### Database security checks

`supabase/tests/assessment_rls_checks.sql` does the same for Task 3.1 (student, teacher, other teacher, admin and anonymous access to assessments and answer keys; marks/window/publish rules). It needs only migrations 1-4, no seed. It passed on a local PostgreSQL 16 with a stand-in for Supabase's auth schema; it has **not** been run on a real Supabase project.

`supabase/tests/rls_checks.sql` is a self-cleaning script (it rolls back) that tests default role
assignment, blocked self-promotion, student data isolation, and anonymous access. Paste it into the
SQL Editor after the migrations. It has **not been run yet**; if it errors, treat that as a finding.

## Deploying to Netlify (without GitHub-based import)

This project includes `netlify.toml`. For a manual/CLI deployment, install and sign in to the Netlify CLI, link this local folder to the intended Netlify site, and deploy from the project root. Keep `.env.local` out of the ZIP and out of source control.

1. Install the Netlify CLI if needed: `npm install -g netlify-cli`.
2. Sign in and link the project folder to your Netlify site using `netlify login` and `netlify link`.
3. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` in **Netlify site environment variables** for the deploy context. Do not add a service-role/secret key to client-exposed variables.
4. From the project root run `netlify deploy --build` for a preview, then `netlify deploy --build --prod` for production after verifying the preview.
5. In Supabase, set the production Site URL and add `https://your-domain/auth/callback` to Redirect URLs. Verify sign-in, email confirmation, role-based access, and database policies on the deployed site.
6. Remove sample content before a real launch (see below).

Do not treat deployment as complete until the production build and real Supabase authentication/data workflows have been verified.

Sample content: `seed.sql` creates one `[Sample]` course per class (with units, lessons, notes and one link). Remove it before launch:
```sql
delete from public.courses where slug like 'sample-%';
delete from public.resources where title like '[Sample]%';
delete from public.assessments where title like '[Sample]%';
```

## Adding learning content (until teacher screens exist)

Phase 2 has no upload UI. A project owner can add content in the Supabase SQL Editor / Storage.

**Video, objectives and transcript for a lesson** (find lesson ids with `select id, title from public.lessons;`):
```sql
insert into public.lesson_content (lesson_id, video_url, objectives, transcript, duration_minutes)
values ('<lesson-uuid>', 'https://www.youtube.com/watch?v=VIDEO_ID',
        array['Objective one', 'Objective two'], 'Transcript text...', 12)
on conflict (lesson_id) do update set
  video_url = excluded.video_url, objectives = excluded.objectives,
  transcript = excluded.transcript, duration_minutes = excluded.duration_minutes;
```
Supported video links: YouTube (`watch`, `youtu.be`, `embed`, `shorts`) and direct `https://` files ending in `.mp4`, `.webm` or `.ogv`. Anything else is rejected and shows "This video can't be shown". Only use videos you have the right to embed.

**A PDF, presentation or image resource**: upload the file in *Dashboard → Storage → resources*, e.g. as `class9/climate-notes.pdf`, then:
```sql
insert into public.resources (title, description, resource_type, course_id, topic, storage_path, is_published)
values ('Climate notes', 'Short description', 'pdf', '<course-uuid>', 'Climate', 'class9/climate-notes.pdf', true);
```
Types: `pdf`, `presentation`, `image` (need `storage_path`), `notes` (needs `body`), `link` (needs `external_url`). Set `is_published = true` to make it visible to students.

**Storage bucket**: migration 3 creates a **private** bucket named `resources` (25 MB limit; PDF, PowerPoint and PNG/JPEG/WebP only). If your project rejects the bucket insert, create it by hand (*Storage → New bucket*, name `resources`, **not public**) and re-run the `create policy ... on storage.objects` statements from the migration. Files are never public. Students receive signed links that expire after 5 minutes, and the storage policy allows reading a file only if it belongs to a published resource.

## Security model

- The role is stored only in `public.profiles`, read on the server with `auth.getUser()` (validated against Supabase Auth). It is never taken from a form, URL, cookie or client state.
- Sign-up sends only name, email and password. The Zod schema has no role field and strips unknown keys.
- Dashboards call `requireRole()` on the server. Hiding links is only a convenience.
- Middleware refreshes the session and does a first-pass check; roles are checked again in each page.
- `/auth/callback` only redirects to same-site paths (`safeNext`), preventing open redirects.
- Only the publishable key is used. No service-role key exists in this code.

## Row Level Security: what each policy does

All six tables have RLS enabled. Table privileges are also restricted: `anon` and `authenticated` start with nothing and are granted only what's listed.

**profiles**
- *read own*: a signed-in user can read only the row whose `id` equals their own `auth.uid()`.
- *admins read all*: admins can read every profile (needed for user management).
- *update own display fields*: a user can update their own row, and column privileges allow only `full_name` and `avatar_url`. The `role` column is not updatable by users.
- *admins update any*: admins can update any profile (role changes).
- No INSERT or DELETE policies: profiles are created by the signup trigger and deleted by cascade.
- Role changes from the app go only through `admin_set_user_role()`, which checks the caller is an admin and refuses self-changes.
- Trigger `protect_profile_privileged_columns` is a second layer: it blocks role/id changes unless the caller is an admin (or a trusted backend with no end-user session). `protect_profile_insert` blocks non-student inserts the same way.

**classes / subjects**
- *public read active*: anyone can read rows where `is_active` is true (admins see all).
- *admins manage*: only admins can insert, update or delete.

**courses**
- *public read published*: anyone, including visitors, can read published courses.
- *teachers read own drafts*: teachers see drafts they created.
- *admins read all*, *admins manage*: admins have full control, including publishing.
- *teachers create own drafts*: teachers can create courses only as themselves and only as `draft`.
- *teachers update / delete own drafts*: teachers can edit or delete only their own drafts, and cannot flip a course to `published` (the `with check` forces `draft`). Publishing needs an admin.

**units**
- *read when course visible*: readable only if the parent course is visible to the caller (so drafts stay hidden).
- *teachers manage in own drafts*: teachers can change units only inside their own draft courses.
- *admins manage*: full control.

**lessons**
- *public read published*: only published lessons of published courses are visible to the public.
- *teachers read own drafts* / *teachers manage in own drafts*: teachers work on lessons only inside their own courses.
- *admins manage*: full control.

Helper functions (`current_user_role`, `is_admin`, `is_teacher_or_admin`) are `SECURITY DEFINER` with a fixed empty `search_path`, so policies on `profiles` do not recurse. Execute rights are revoked from `anon` and `public`.

### Phase 2 policies

- **enrollments**: a student can read, create and delete only their own rows, and can enrol only in *published* courses. Admins can read all. (user, course) is unique.
- **lesson_content** (video URL, objectives, transcript): readable only by students enrolled in that published course, the teacher who owns the course, and admins. The public outline in `lessons` stays public.
- **lesson_progress**: a student can read and write only their own rows, and only for published lessons in courses they are enrolled in. The app can change only `status`, `position_seconds`, `completed_at` and `last_accessed_at`.
- **lesson_notes**: private to the author. Not even admins can read them through the API.
- **resources**: signed-in users read only published resources (in published courses). Teachers manage their own *unpublished* resources; publishing needs an admin.
- **bookmarks**: own rows only; one bookmark per student per lesson or resource.
- **storage.objects (bucket `resources`)**: signed-in users can read files attached to published resources; staff read and write only inside their own `<user-id>/` folder; admins can manage all.

### Phase 3 policies (Task 3.1: assessments)

Five new tables: `assessments`, `questions`, `question_options`, `question_answer_keys`, `question_correct_options`. RLS is on for all of them; `anon` has no access.

- **Authority**: a teacher manages assessments only in courses they created (`courses.created_by`, the same rule as lessons and resources). Admins manage all. Role is re-checked from `profiles` on every query, so demoting a teacher removes access immediately.
- **Publishing**: unlike courses and resources, a teacher may publish an assessment in their own course. A trigger refuses to publish unless there is at least one question, question marks add up to `total_marks`, and every question has a valid key. Students can never create, edit or publish.
- **Locked while live**: questions, options and keys can be edited only while the assessment is a draft (teachers and admins alike). To change a live assessment, unpublish it first.
- **Students** read an assessment only if it is published, its course is published and they are enrolled. ~~They read questions and options only inside the `opens_at`/`closes_at` window.~~ **Superseded by Phase C2:** students no longer read `questions` / `question_options` directly; question content comes only from `get_attempt_paper` for an open attempt they own (see Phase C2 below).
- **Answer keys are never in a student-readable table.** `questions` and `question_options` hold no answer data. Correct answers (`question_correct_options`), true/false answers, accepted short answers and explanations (`question_answer_keys`) have no student policy, so a student query returns zero rows. Explanations are stored with the key because they reveal the answer.
- **Secure delivery (planned for 3.3/3.4)**: submitting and grading will use `SECURITY DEFINER` functions that read the key tables on the server, and post-submission review will return keys and explanations through such a function. Never add a student policy to the key tables and never put key data in a public course query.
- **Ownership**: `created_by` is forced to the signed-in user on insert; `created_by` and `course_id` cannot be changed from a user session (no column grant plus a trigger).
- **Deletion**: deleting a course cascades to its assessments; deleting a unit keeps the assessment and clears `unit_id`. Teachers can delete only draft assessments. Task 3.3 must make attempt rows `on delete restrict` so student results are never silently cascaded away.
- **Rollback**: `supabase/rollbacks/20261017000001_phase3_assessments_rollback.sql` (destructive, requires an explicit confirmation line).

## Teacher assessment builder (Phase 3, Task 3.2)

Teachers manage assessments at `/dashboard/teacher/assessments` (list), `/new` (create) and `/[id]` (editor: questions, settings, student preview, publish).

- **Who can use it:** signed-in users with the `teacher` role, for courses they created (`courses.created_by`). Server pages call `requireRole("teacher")`; every server action re-checks the role and ownership, and RLS is a second independent check. No service-role key is used.
- **Statuses:** the database has `draft` and `published` only. "Closed" is shown for a published assessment whose `closes_at` has passed; it is not stored.
- **Question types:** multiple choice (`single_choice`), multiple select, true/false, short answer, long answer (`descriptive`, marked by hand).
- **Marks:** `total_marks` is recalculated from the questions after every change. A brand-new draft stores a placeholder of 1 (the table requires > 0) and shows 0.
- **Publishing:** blocked unless there is at least one question, marks add up, and every question has a valid key. The same rules run in the editor, in the server action and in the database trigger.
- **Locking:** questions and settings are editable only while a draft. "Move to draft" reopens a published assessment (Task 3.3 must block this once attempts exist).
- **Answer keys:** read only by teacher screens. The student preview is built from a type with no answer fields.
- **No new env vars or migrations.**

## Phase B: assessment attempts (database + server actions only)

Migration `20261024000001_phase_b_assessment_attempts.sql` adds `assessment_attempts` and four student functions
(`start_assessment_attempt`, `get_my_attempt`, `get_my_open_attempt`, `submit_attempt`). The server actions are in
`src/lib/assessments/attempt-actions.ts`. There is **no exam UI, no question delivery, no answer saving and no scoring yet**;
the Start button stays disabled. The migration is written and locally tested but **not applied to any Supabase project**.
Apply it to a scratch project first and run `supabase/tests/attempts_rls_checks.sql`. Rollback:
`supabase/rollbacks/20261024000001_phase_b_assessment_attempts_rollback.sql` (destructive, needs the confirmation line).
Read `BUILD_STATUS.md` (Phase B section) for what was verified and the open problems, notably that students can still read
questions directly until question delivery (Phase C) replaces the student read policies.

## Phase C4: student question delivery (UI integration)

The existing student assessment page (`/dashboard/student/assessments/[id]`) now shows the questions of the student's own **open** attempt, rendered on the server (loading skeleton, error with retry, empty state). It uses `getOpenAttemptAction` then `getAttemptPaperAction`; no keys, flags or explanations are in any data on the path. Read-only: no answer saving, timer, submission or Start button yet (Phase C5). Verified with mocks only; see `BUILD_STATUS.md`, Phase C4.

## Phase C3: safe question response layer (TypeScript only)

`src/lib/assessments/student-question.ts` defines one explicit student-facing shape per question type and builds every student question field by field; extra, missing or restricted fields reject the whole paper. No answer key, correctness flag, rubric, score or explanation can be part of a student response. Teacher authoring is unchanged. No migration. Details and actual test results: `BUILD_STATUS.md`, Phase C3.

## Phase C2: secure question retrieval (database function + server action only)

Migration `20261025000001_phase_c2_question_delivery.sql` adds `get_attempt_paper(attempt)` (the only student path to question
content: owner of an effectively-open attempt, enrolled, published, inside the window, explicit field allow-list, no answer keys)
and `get_assessment_question_count(assessment)`, and **drops the two student SELECT policies** on `questions` and
`question_options`. The server action is `getAttemptPaperAction` in `src/lib/assessments/attempt-actions.ts`; the pure
validator is `src/lib/assessments/paper.ts`. There is **no exam page, no answer saving, no submission change and no scoring**;
the Start button stays disabled. Written and tested on a local PostgreSQL only, **not applied to any Supabase project**.
Check script: `supabase/tests/question_delivery_checks.sql`. Rollback (re-opens the direct read, see its header):
`supabase/rollbacks/20261025000001_phase_c2_question_delivery_rollback.sql`. Details: `BUILD_STATUS.md`, Phase C2.

## Folder structure

```
supabase/
  migrations/            SQL schema, triggers, RLS
  seed.sql               classes, Geography subject, one [Sample] course
  rollbacks/             manual, destructive rollback scripts (never auto-applied)
  tests/rls_checks.sql   database security checks (run manually)
  tests/assessment_rls_checks.sql   Task 3.1 assessment security checks (run manually)
src/
  app/                   routes (public, auth, dashboard, courses)
  components/            ui, layout, landing, auth, dashboard, curriculum
  lib/                   supabase clients, auth guards/actions, validation, data, utils
  types/                 app types
  middleware.ts          session refresh and first-pass route protection
```

## Handoff checklist (before Phase 3)

- [ ] Run typecheck, lint, tests and build; fix any findings.
- [ ] Run `rls_checks.sql` against a real project (it now also covers Phase 2).
- [ ] Test sign up → verify email → sign in → reset password end to end.
- [ ] Test the learning flow with a student account: enrol, open a lesson, save a note, bookmark, mark complete, check the progress percentage.
- [ ] Add a real video URL and a real PDF (see "Adding learning content") and open them as a student.
- [ ] Generate real DB types: `npx supabase gen types typescript --project-id <ref> > src/types/database.ts`.
- [ ] Replace placeholder copy on Contact, Privacy and Terms with reviewed text.
- [ ] Add real photography (or keep the SVG illustrations) and a favicon.
- [ ] Remove the `[Sample]` content.
- [ ] Next candidates: teacher authoring and upload screens, assessments, discussion forum, Geography Lab.

## Thematic Map Studio (Phase 4.3)
`/geography-lab/thematic-map-studio`: choropleth, graduated colour and proportional symbol maps from starter data or a CSV
imported in the browser. Boundaries: Natural Earth 1:110m (public domain), see `public/data/world-countries-110m.ATTRIBUTION.txt`.
Regenerate boundaries with `node scripts/build-boundaries.mjs <ne_110m_admin_0_countries.geojson>`.


## Phase 4.4: Practical activities (partial)

Routes: `/geography-lab/practicals` (library) and `/geography-lab/practicals/<id>` (workspace). Calculations work offline in the browser.
Drafts are stored **only in the browser (localStorage)**; server saving, submission, evidence upload and teacher review need the
migration in `supabase/proposed/phase4_4_practicals_PROPOSAL.sql`, which is a proposal and has **not** been applied or tested.
Starter activities are illustrative, not formally curriculum-approved. See `BUILD_STATUS.md` for details and known limits.


## Phase 5.2: discussions, detail pages and replies

**Routes:** `/forum` (live list, search, class/category filters, pagination), `/forum/new` (create), `/forum/[id]` (discussion, replies, reply form, author edit/delete). All require sign-in, checked on the server.

**Database (migration 5):** `discussions`, `discussion_replies` (flat thread), `forum_author_cards()` (name and role only, only for authors of visible posts, since `profiles` stays private), `forum_links_valid()`, and a delete-guard trigger. Rollback: `supabase/rollbacks/20261018000001_phase5_2_forum_rollback.sql` (needs `set app.confirm_forum_rollback = 'yes';`).

**Owner decisions implemented:** authors may delete a discussion only while it has no replies (trigger plus app check); all signed-in users see all classes; teachers post and reply like students; authors show full name with a Student/Teacher badge read from `profiles.role` (admins show "Admin"); no rate limiting yet, but length/https-link validation and a per-author idempotency token stop duplicate submissions.

**Security:** author id always comes from the server session; unknown request fields are dropped; edits and deletes filter on `author_id` and report failure when no row changed; RLS and column grants are the second check; no service-role key is used. Teachers and admins have no edit rights over others' posts (moderation tools are a later task); admins can delete via RLS but no admin button exists yet.

**Tests:** `npx vitest run` (validation, formatting, server actions with a fake Supabase client) and `supabase/tests/forum_rls_checks.sql` (45 checks, passed on local PostgreSQL 16 with a stand-in for Supabase's auth schema; **not yet run on a real Supabase project**).

## Phase 5.3: likes, bookmarks, search and sort

**Routes:** `/forum` (search, class, topic, sort and page all live in the URL; any change to search, filters or sort starts again at page 1; "Clear all filters" goes to `/forum`), `/forum/[id]` (like and bookmark on the discussion, like on each reply), `/forum/bookmarks` (your private saved discussions, paginated). The older student page `/dashboard/student/bookmarks` (lessons and resources) is unchanged.

**Database (migration 6):** `discussion_likes`, `discussion_reply_likes`, `discussion_bookmarks` (primary key per item and user, so duplicates are impossible); `like_count` columns on `discussions` and `discussion_replies`, kept by SECURITY DEFINER triggers and not writable by users; trigram (`pg_trgm`) GIN indexes on title and body for `ILIKE '%text%'`; an index for "most liked". Users can read, add and delete only their own like and bookmark rows; hidden items cannot be liked or bookmarked. **One change to existing objects:** the two `set_updated_at` triggers now fire only when title/body/links (or reply body) change, so a like does not make a post look "edited". Rollback: `supabase/rollbacks/20261019000001_phase5_3_forum_rollback.sql` (needs `set app.confirm_forum53_rollback = 'yes';`).

**Behaviour:** like and bookmark actions are set-style and idempotent (the browser sends the wanted state, never a user id); clicks are ignored while a request is in flight; the UI rolls back on failure and shows the count the database returns. Users may like their own posts. Search is case-insensitive substring matching on title and body; very short terms (under 3 characters) cannot use the trigram index and scan more rows, which is fine at classroom scale. "Most liked" sorts by like count, then newest.

**Tests:** `npx vitest run` (243 tests, 23 new: actions, query construction, URL params) and `supabase/tests/forum53_rls_checks.sql` (23 checks, passed on local PostgreSQL 16 with a stand-in auth schema; **not yet run on real Supabase**).

## Phase 5.4A: forum reporting

**What it does:** signed-in members can report a discussion or a reply from its detail page (`/forum/[id]`): a "Report" button opens a dialog with a reason list and optional details. A report only records a concern. Nothing is hidden, deleted or penalised, and likes, bookmarks, search and pagination are untouched. You cannot report your own posts or hidden posts, and each person can report a given post once. Reporting is not offered on list cards.

**Database (migration 7):** `forum_reports` (reporter, content type and id, optional foreign keys to the discussion or reply, reason, optional description, status `pending | reviewed | dismissed | action_taken`, timestamps). Reasons: spam, abusive, inappropriate, off_topic, misinformation, other ("other" needs details). `UNIQUE (reporter_id, content_type, content_id)` blocks duplicates. If the content is later deleted the report stays: its foreign key becomes null (`ON DELETE SET NULL`) while `content_type` and `content_id` keep the record and keep duplicates blocked. A deleted account takes its own reports with it. Rollback: `supabase/rollbacks/20261020000001_phase5_4a_forum_reports_rollback.sql` (needs `set app.confirm_forum_reports_rollback = 'yes';`).

**RLS:** `anon` has no access. Members can SELECT only their own rows, and INSERT only as themselves, only as `pending` (status is not a granted column), only on visible, non-hidden content they did not write. No UPDATE or DELETE privilege exists for members, and no moderator policy exists yet (Phase 5.4B).

**Tests:** `npx vitest run` (257 tests; 14 new for reporting) and `supabase/tests/forum_reports_rls_checks.sql` (22 checks, passed on local PostgreSQL 16 with a stand-in auth schema; **not run on real Supabase**).

## Phase 5.4B: forum moderation

**Route:** `/dashboard/admin/forum-reports` (admin area, guarded on the server by `requireRole("admin")`; signed-out visitors go to sign-in, students and teachers to their own dashboard). Linked from the admin sidebar as "Forum Reports".

**Who moderates:** **admins only.** The existing role model is strict (no implicit access across dashboards), teachers already only *read* hidden posts, and no moderator role exists, so none was invented. The rule lives in one SQL function, `can_moderate_forum()`, mirrored by `FORUM_MODERATOR_ROLES` in `src/lib/forum/moderation.ts`. To let teachers moderate later, change both together (the database function is the authority).

**Dashboard:** counts per status (click to filter), filters for status / content type / reason, newest or oldest first, 10 reports per page, everything in the URL (applying filters returns to page 1). Each card shows reason, optional details, the reporter's display name only (no email or id), the date, the reported post with a link (to the reply's anchor for replies), "hidden" or "deleted" notices, and the audit history. Loading, empty, error and success states are included.

**Actions:** mark reviewed; dismiss (optional note); action taken (optional note, optionally **hide** the post); restore a hidden post. Allowed moves: pending -> reviewed / dismissed / action_taken, reviewed -> dismissed / action_taken. Dismissed and action_taken are final. Hiding sets the existing reversible `is_hidden` flag (other members stop seeing the post, replies of a hidden discussion disappear with it); **nothing is ever deleted**, and hiding is refused if the post is already deleted.

**Database (migration 8):** `can_moderate_forum()`, `forum_report_events` (append-only audit: moderator, from/to status, hide/restore, note, time; moderators read only), a moderator read policy on `forum_reports`, and two SECURITY DEFINER functions, `forum_moderate_report()` and `forum_restore_report_content()`. They re-check the caller's role, lock the report row, validate the transition, change the status and content and write the audit row in one transaction. The moderator is always `auth.uid()`. Nobody has an UPDATE/INSERT privilege on reports or events, so the functions are the only write path. Rollback: `supabase/rollbacks/20261021000001_phase5_4b_forum_moderation_rollback.sql` (deletes the audit trail; needs `set app.confirm_forum_moderation_rollback = 'yes';`; does not un-hide content).

**Tests:** `npx vitest run` (296 tests; 39 new for moderation) and `supabase/tests/forum_moderation_rls_checks.sql` (33 checks, passed on local PostgreSQL 16 with a stand-in auth schema; **not run on real Supabase**).



## Phase 6.2: teacher video manager

Sign in as a teacher, open **Videos**, pick a chapter and paste one or more YouTube links. Titles are fetched automatically (server needs outbound access to youtube.com); edit if needed, then **Add videos**. No migration required. Videos can only be added while the course is a draft.

## Phase D note (answer saving)
Migration 14 adds `attempt_answers`, `save_attempt_answer` and `get_attempt_answers`; the server actions are in `src/lib/assessments/answer-actions.ts` and the autosave engine in `src/lib/assessments/autosave.ts`. No UI uses them yet (Phase E). See `BUILD_STATUS.md` for what was and was not verified.

## Phase 3 — assessment workflow verification

Phase 3 adds regression coverage for the teacher grading server action and protects the student submit path from submitting while answer autosaves are still unconfirmed. See `PHASE3_ASSESSMENT_WORKFLOW_VERIFICATION.md` for the local commands, scratch-Supabase setup, the WF-01–WF-18 manual test matrix, and required sign-off. `supabase/verification/phase3_assessment_workflow_checks.sql` is a read-only report for workflow schema, grants/RLS, and result/score consistency; it does not make fixes or mutate data.
## Geography Lab — India project datasets

The Geography Lab includes a source-attributed **India Geography Datasets** hub at `/geography-lab/india-datasets`. It provides filterable tables and CSV downloads for Census demographics, rainfall/climate, crop yield, irrigation, occupational structure, electricity capacity, reported road length, selected mineral/energy locations and selected cyclone events. See `INDIA_GEOGRAPHY_DATASETS.md` for source provenance and limitations. Historical or partial datasets are labelled as such.



## Phase 5 — NCERT-aligned Geography content

See `PHASE5_NCERT_CONTENT_SETUP.md` before applying the migration `supabase/migrations/20261102000001_phase5_ncert_geography_content.sql`. The migration adds original study guides and worksheets for six Geography books across Classes 9–12, and official NCERT/CIET links. It updates four legacy sample courses in place to preserve their course IDs; back up the database first.
