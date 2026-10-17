# eAcharya build status

## Phase 5.4B — Forum moderation: CODE COMPLETE, migration NOT applied
- **Moderators:** admins only (existing strict role model; no new role). One SQL function, `can_moderate_forum()`, plus `FORUM_MODERATOR_ROLES`, to widen later.
- **New:** `supabase/migrations/20261021000001_phase5_4b_forum_moderation.sql`, rollback, `supabase/tests/forum_moderation_rls_checks.sql`; `src/lib/forum/{moderation,moderation-data,moderation-actions}.ts` (+tests); `src/components/forum/{moderation-sections,report-actions}.tsx`; route `src/app/dashboard/admin/forum-reports/{page,loading,error}.tsx`.
- **Modified:** `forum/validation.ts` (+test), `dashboard/nav-config.ts` (admin link), `forum/reply-item.tsx` (anchor id only), README.
- **Verified:** typecheck clean; vitest 27 files / 296 tests pass; lint clean; SQL: 33 new checks plus 5.2 (42), 5.3 (23) and 5.4A (22) pass on local PostgreSQL 16 (stand-in auth, not Supabase); all 8 migrations install on a fresh database; rollback then re-apply works; production build compiled and generated all routes (including `/dashboard/admin/forum-reports`) with the font import temporarily stubbed (reverted).
- **NOT verified:** live Supabase/PostgREST (notably the embedded `discussions(...)`/`discussion_replies(...)` selects on `forum_reports` and admin reads of `profiles` under real JWTs), any browser, mobile or screen-reader behaviour, concurrent moderators (the row lock is exercised only by reasoning, not by a parallel test).
- **Known limits:** no "reopen"; a success message can vanish if the card leaves a filtered list after refresh (the counts and list still update); hiding does not auto-resolve other reports on the same post; reporters are not notified of outcomes.

## Phase 5.4A — Forum reporting: CODE COMPLETE, migration NOT applied
- **New:** `supabase/migrations/20261020000001_phase5_4a_forum_reports.sql`, rollback, `supabase/tests/forum_reports_rls_checks.sql`; `src/lib/forum/report-reasons.ts`; `src/components/forum/report-button.tsx`.
- **Modified:** `forum/{validation,actions,data}.ts` (+tests), `forum/reply-item.tsx`, `forum/[id]/page.tsx`, README.
- **Verified:** typecheck clean; vitest 24 files / 257 tests pass; lint clean; SQL: 22 new checks plus the existing 5.2 (42) and 5.3 (23) checks pass on local PostgreSQL 16 (stand-in auth, not Supabase); rollback then re-apply works; production build compiled and generated all routes with the font import temporarily stubbed (reverted), because Google Fonts cannot be reached from the sandbox.
- **NOT verified:** live Supabase/PostgREST, the dialog in a real browser (native `<dialog>`, focus and Escape behaviour), mobile layout, screen readers.
- **Not built (by design):** moderator access, report status changes, hiding or deleting reported content. All Phase 5.4B.

## Phase 5.3 — Likes, bookmarks, search and sort: CODE COMPLETE, migration NOT applied
- **New:** `supabase/migrations/20261019000001_phase5_3_forum_likes_bookmarks_search.sql`, rollback, `supabase/tests/forum53_rls_checks.sql`; `src/lib/forum/data.test.ts`; `src/components/forum/{like-button,discussion-bookmark-button}.tsx`; route `/forum/bookmarks`.
- **Modified:** `forum/{categories,types,validation,data,actions}.ts` (+tests), `forum-sections.tsx`, `reply-item.tsx`, `forum/page.tsx`, `forum/[id]/page.tsx`, README. Also fixed an existing unescaped apostrophe in `geography-lab/sections.tsx` that failed lint and therefore `next build`.
- **Verified:** typecheck clean; vitest 24 files / 243 tests pass; lint clean except the existing unused-variable warning in `practical-library.tsx`; SQL: 23 new checks plus the existing forum checks pass on local PostgreSQL 16 (stand-in auth, not Supabase); EXPLAIN shows BitmapOr over both trigram indexes for search and an index scan for most-liked; rollback then re-apply works.
- **Build:** `npm run build` fails in the sandbox only on the Google Fonts download. With the font import temporarily stubbed (reverted), the production build compiled, type-checked and generated all routes including `/forum/bookmarks`.
- **NOT verified:** anything on live Supabase/PostgREST (embedded `discussions!inner` select, RLS under real JWTs), browser, mobile or screen-reader behaviour.
- **Before using:** apply migration 6 on a scratch project BEFORE deploying this code (the list now reads `like_count`), run `forum53_rls_checks.sql`, then `npm run build` locally.

## Phase 5.2 — Discussions, detail pages, replies: CODE COMPLETE, migration NOT applied
- **Inspection:** Phase 5.1 had no forum tables; `/forum` showed an honest empty state. Owner decisions received and implemented (see README, "Phase 5.2").
- **New:** `supabase/migrations/20261018000001_phase5_2_forum.sql`, rollback, `supabase/tests/forum_rls_checks.sql`; `src/lib/forum/{validation,format,types,data,actions}.ts` (+ tests); `src/components/forum/{discussion-form,reply-form,reply-item,discussion-owner-tools,author-line}.tsx`; routes `/forum/new`, `/forum/[id]` (+ not-found). **Modified:** `forum/page.tsx`, `forum-sections.tsx`, `forum/categories.ts` (+test), README. Old 5.2 proposal file removed (it became the migration).
- **Verified:** typecheck clean; vitest 23 files / 220 tests pass (43 new); lint: nothing in new files (two existing issues remain: `geography-lab/sections.tsx:187` apostrophe error, `practical-library.tsx` unused variable); migrations 1-5 apply cleanly and 45 RLS checks pass on local PostgreSQL 16 (stand-in auth/storage, not Supabase).
- **Bug caught by tests:** search sanitiser stripped Hindi combining marks; fixed.
- **NOT verified:** `npm run build` (fails in the sandbox only because Google Fonts cannot be downloaded); any browser/mobile/screen-reader run; anything on live Supabase.
- **Before using:** apply migration 5 on a scratch project, run the RLS script, then `npm run build` locally.
- **Later tasks:** likes, bookmarks, advanced search, reporting, teacher moderation (`is_hidden` column is ready), configurable rate limits.

Last updated: Phase 3, Task 3.2 (teacher assessment builder) delivered; NOT yet type-checked, see below.

## Done
- **Phase 1**: landing page, auth (sign up/in/out, verify, forgot/reset), roles, dashboards, curriculum tables, RLS, README.
- **Phase 2**: student dashboard, enrolment, e-Tutorial player (YouTube allowlist + direct video), progress, bookmarks, private notes, e-Content library with search/filters/pagination, signed-URL file access, profile page.
- **Phase 3 / Task 3.1 (database only)**: assessments and question bank with RLS. No UI, no server actions yet.

## Task 3.3 status: PARTIAL (read-only student side); attempts BLOCKED on approval

### Finding
Migrations 1-4 have **no attempts or answers tables** (no way to start, save or submit). Per the brief, no migration was created or applied. The smallest additive proposal is in `supabase/proposed/phase3_3_attempts_PROPOSAL.sql` (not in `migrations/`, not run).

### Done
- `/dashboard/student/assessments` (list) and `/dashboard/student/assessments/[id]` (instructions, rules, question count, marks, window, closed/upcoming messages). Student nav link enabled.
- `src/lib/assessments/student-data.ts`, `availability.ts` (+test), `components/assessments/availability-badge.tsx`.
- Reads use the student's own session (RLS: published, published course, enrolled). No key tables selected; no question text selected; question count only inside the open window.
- Start Assessment is a disabled button with an honest note; nothing pretends to save or submit.

### Waiting on approval of the migration
Exam interface (palette, timer, navigation), answer saving, review and submit screens. They depend on the three functions in the proposal. Grading and results remain Phase 3.4.

### Verification
Syntax check only; `typecheck`, `lint`, `test`, `build` not run (no dependencies or network in the sandbox).

## Task 3.2 status: CODE COMPLETE, UNVERIFIED (teacher assessment builder)

### New files
- `src/lib/assessments/`: `types.ts`, `validation.ts` (+test), `publish.ts` (+test), `data.ts` (reads), `actions.ts` (server actions).
- `src/components/assessments/`: `assessment-list`, `settings-form`, `assessment-editor`, `question-list`, `question-editor`, `student-preview`, `status-badge`, `form-controls`.
- `src/app/dashboard/teacher/assessments/`: `page.tsx`, `loading.tsx`, `error.tsx`, `new/page.tsx`, `[id]/page.tsx`.
### Modified
- `src/components/dashboard/nav-config.ts` (teacher "Assessments" link), `README.md`, this file.

### Behaviour and decisions
- Class comes from the course (no class column on `assessments`); the course is chosen at creation and fixed afterwards.
- Statuses draft/published only; "Closed" is derived from `closes_at`.
- `total_marks` recalculated from questions; placeholder 1 on empty drafts. Passing marks only settable once questions exist and cleared automatically if they exceed a lowered total.
- Writes are sequential (no transaction available from the JS client): a failed new question is deleted again; a failed edit reports that it may be partly saved. Editing a choice question replaces its options (new option ids).
- Reordering uses a two-phase renumber to avoid the unique (assessment, position) constraint.
- Teachers may move a published assessment back to draft (no attempts exist yet).
- Not built (later tasks): student taking, scoring/results, analytics. No image upload for questions (column exists, unused).

### Verification
- **Done:** syntax check of every new file with the TypeScript parser.
- **NOT run (no dependencies or network in the build sandbox):** `npm run typecheck`, `lint`, `test`, `build`, and anything against live Supabase. Run them locally and fix any reports; the new unit tests are `src/lib/assessments/*.test.ts`.
- Manual test list: create assessment; add one question of each type; reorder; delete; edit; preview; publish with and without questions; move to draft; open `/dashboard/teacher/assessments/<id>` as another teacher and as a student (expect not found / redirect).

## Task 3.1 status: COMPLETE (database foundation)

### Files
- NEW `supabase/migrations/20261017000001_phase3_assessments.sql`. Additive only: no existing table, policy, grant or row is altered.
- NEW `supabase/rollbacks/20261017000001_phase3_assessments_rollback.sql`. Destructive, needs `set app.confirm_assessment_rollback = 'yes';` in the same run. Not auto-applied.
- NEW `supabase/tests/assessment_rls_checks.sql` (85 checks, self-cleaning).
- MODIFIED `supabase/seed.sql`: appended one idempotent, `[Sample]`-labelled published assessment (one question of each type) on the Class 9 sample course.
- MODIFIED `src/types/app.ts`: appended assessment types (student-safe shapes and staff-only key shapes).
- MODIFIED `README.md`: migration order, Phase 3 policies, sample cleanup, test scripts.

### Tables and types
`assessments`, `questions`, `question_options`, `question_answer_keys` (staff only), `question_correct_options` (staff only); enums `assessment_status` (draft, published) and `question_type` (single_choice, true_false, multiple_select, short_answer, descriptive).

Constraints: total marks > 0; passing marks > 0 and <= total; question marks > 0 and <= 1000; closes_at > opens_at; duration 1-600; attempt limit 1-50 (null = unlimited); https-only image URL; unique (assessment, position) and (question, position), deferred; max 10 options; composite FK so a correct option must belong to its question. Deletion: course delete cascades; unit delete sets `unit_id` null; creator delete sets `created_by` null.

### Security model (details in README, "Phase 3 policies")
- RLS enabled on all five tables; `anon` has no privileges; `authenticated` has column-limited grants.
- Teacher authority = created the course (`courses.created_by`), same rule as lessons/resources. Admins manage all. Students cannot create, edit or publish.
- Teachers can publish their own assessments (differs from courses/resources, which need an admin). A trigger blocks publishing unless there is at least one question, marks add up to `total_marks`, and each question has a valid key.
- Questions, options and keys are editable only while the assessment is a draft (admins too).
- Students see an assessment only if published, course published and enrolled; they see questions/options only inside the opens/closes window.
- Answer keys and explanations live in staff-only tables with no student policy. Student-readable tables contain no answer columns (checked by the test script).
- `created_by` is forced to the caller on insert; `created_by` and `course_id` cannot be changed from a user session.
- No service-role key anywhere in client code; none was added.

### Remaining configuration / decisions for later tasks
- Apply migration 4 (and re-run seed if you want the sample assessment) in Supabase.
- Secure grading/review must use `SECURITY DEFINER` functions (Tasks 3.3/3.4). Do not add student policies to the key tables.
- Task 3.3 attempts must reference assessments `on delete restrict` and must block unpublish-then-edit once attempts exist (today an owner can unpublish, edit, republish).
- Teachers can publish assessments; if you want admin-only publishing like courses, change the insert/update policies and trigger accordingly.

## Verification results (actual)
- **SQL on local PostgreSQL 16 (NOT Supabase)**: migrations 1-4 applied in order with no errors, using a small stand-in for Supabase's `auth`/`storage` schemas and roles. A before/after dump of all pre-existing policies, grants, RLS flags and helper functions was identical. Seed ran twice (idempotent). Rollback refused without confirmation, then removed all new objects and left Phase 1-2 objects intact; the migration re-applied cleanly afterwards.
- **`assessment_rls_checks.sql`**: 85 checks passed (student, enrolled student, non-enrolled student, owning teacher, other teacher, demoted teacher, admin, anon; window, draft, unpublished-course, publish and lock rules; cascades).
- **Existing `rls_checks.sql`**: 19 checks passed on the same local setup.
- `npm install` ok. `npm run typecheck` passed. `npm run lint` passed. `npx vitest run`: 6 files, 44 tests passed.
- **`npm run build` FAILED in this sandbox** only because `next/font` could not download Plus Jakarta Sans from Google Fonts (no network). It never reached type or page compilation, so the build is **unverified**; re-run it on your machine.
- **NOT verified**: anything against a live Supabase project (real `auth.uid()`/JWT handling, PostgREST behaviour, the Supabase SQL editor, storage), and any UI (none exists yet). Treat the local result as strong evidence for the SQL logic, not as a Supabase test.

## Known gaps / limits (carried over)
- No teacher/admin authoring or upload screens (content added via SQL and Storage; see README).
- YouTube embeds cannot report playback position; only "last opened" is saved for them.
- Geography Lab, Discussion Forum, Assessments UI and Settings are "Soon" placeholders.
- Contact, Privacy and Terms are draft placeholder text.
- Types in `src/types/app.ts` are hand-written; replace with generated Supabase types.

## Next task
Verify 3.2 locally, then **3.3 — student assessment taking**.

## Task 3.4 status: BLOCKED, awaiting approval of the attempts migration
No attempts/answers tables exist in `supabase/migrations/`. `supabase/proposed/phase3_3_attempts_PROPOSAL.sql` was revised for 3.4 (save revision counter so older saves cannot overwrite newer ones; row lock so saves and submit serialise; idempotent submit). Not applied. No 3.4 code written yet.

## Task 3.5 status: BLOCKED, proposal written (nothing applied, no app code written)
Inspection found no attempts/answers/results tables, no submit flow, no results-release setting, no service-role usage. `supabase/proposed/phase3_5_scoring_PROPOSAL.sql` (UNTESTED, depends on the attempts proposal) adds: release policy columns on `assessments`, `attempt_results` + `attempt_question_scores` (no student policy), `score_attempt` (called inside `submit_attempt`, idempotent), `grade_attempt_answer` (owning teacher/admin), `get_my_results` / `get_my_result_detail` (ownership + release enforced, no keys). Decisions pending: multiple_select rule, short_answer auto-match vs pending review, which attempt counts, release default. UI/actions to follow after approval.

## Task 3.6 status: BLOCKED (depends on unapproved 3.3 and 3.5 proposals); proposal written
`supabase/proposed/phase3_6_analytics_PROPOSAL.sql` (UNTESTED): `teacher_grading_overview()`, `get_assessment_analytics(uuid)`, `can_manage_assessment_results(uuid)`; aggregates only, no student identities. No chart library installed (plan: SVG/CSS bars, no new dependency). No app code written.

## Task 4.1 status: CODE COMPLETE, UNVERIFIED (Geography Lab dashboard)
- Route `/geography-lab` (public; role only picks the bottom panel). New: `src/lib/geography-lab/catalogue.ts` (+test), `src/components/geography-lab/sections.tsx`, `src/app/geography-lab/{page,loading,error}.tsx`. Modified: `nav-config.ts` and student dashboard quick link (now link to `/geography-lab`), this file.
- Tool cards are "Coming soon" except Fieldwork (`#activities`). Activities are a labelled starter catalogue in code; Start Activity is disabled. No student progress shown: no activity-progress table exists (see proposal note in the chat reply). No schema change, no new dependency.
- Verified: syntax check of all changed files; catalogue tests run with a stand-in for vitest. NOT run: typecheck, lint, vitest, build (dependencies could not be installed in the sandbox).

## Task 4.2 status: CODE COMPLETE, UNVERIFIED (Interactive Map Explorer)
- Route `/geography-lab/map-explorer` (public). New: `src/lib/geography-lab/{coordinates,sample-places}.ts` (+`coordinates.test.ts`), `src/components/geography-lab/{leaflet-map,map-explorer}.tsx`, `src/app/geography-lab/map-explorer/page.tsx`. Modified: `catalogue.ts` (Map card now links to the route; test now checks the route file exists), `package.json` (added `leaflet`, `@types/leaflet`), this file.
- **Run `npm install` locally** (dependencies were NOT installed in the sandbox; no lockfile exists).
- Leaflet is plain `leaflet` (no react-leaflet), loaded via `next/dynamic({ ssr: false })`. Single OpenStreetMap layer, so no layer selector. No satellite/terrain. No schema change.
- OSM's public tile server is for light use; for production traffic use a hosted tile provider (key must stay server-side or be a public key restricted by domain) and keep attribution.
- Verified: syntax check; coordinates/catalogue tests (13) run with a vitest stand-in; strict typecheck of the three pure modules. NOT run: full typecheck, lint, vitest, build, and any browser test.

## Phase 4.4 — Practical activities and virtual fieldwork: PARTIAL, UNVERIFIED BUILD

**Inspection findings (before coding):** no activity, attempt, observation, submission, feedback or evidence tables exist
(migrations 1-4 only). The only storage bucket is `resources` (private, staff-write only; students cannot upload). No dependencies
are installed in the sandbox and there is no network, so `npm run typecheck/lint/test/build` were NOT run.

**Works now (no database needed)**
- `/geography-lab/practicals`: searchable library; filters for class, topic, difficulty (plain GET form, server-filtered); objectives, time, materials. 8 starter activities, labelled illustrative and not curriculum-approved.
- `/geography-lab/practicals/[id]`: workspace with objectives, materials, procedure, observation table (typed, validated, computed columns), measurements, calculators, interpretation/conclusion/reflection, progress bar and checklist.
- Calculators: Map Scale (1:50,000 style, mm/cm/m, steps), Population Density (km² or ha, formula, steps), Weather Log (date/temp/rain/optional humidity, average/min/max, total rainfall, rainy days, wettest day; labelled as student observations, not official data), plus bearing→compass/back-bearing and a relief summary.
- Interactive Map Explorer is reused (loaded on demand inside the workspace); the map engine is not duplicated.
- Drafts are autosaved to **this browser only** (localStorage, namespaced per signed-in user, untrusted-input parsing). Clearly labelled; nothing is uploaded.

**Not built because the schema/storage does not exist (nothing falsely claimed)**
- Server-side drafts, resume across devices, submission, locking after submit, real submission status: Submit is a disabled button with an honest note.
- Evidence uploads: no bucket. No upload UI was added.
- Teacher review (view submissions, feedback, marks, pending/reviewed tracking): not built; no server data to show.
- All of the above are specified in `supabase/proposed/phase4_4_practicals_PROPOSAL.sql` (UNTESTED, NOT applied, no PostgreSQL was available to even syntax-check it). It adds three tables, SECURITY DEFINER write functions, read-only RLS, teacher authorisation by course ownership + class grade, and a new private `practical-evidence` bucket (5 MB, PDF/PNG/JPEG/WebP, owner-folder paths, reviewer read via signed URLs only). Approve/adjust it, apply it on a scratch project first, then the app work (server actions, upload with magic-byte check, teacher pages) can follow.

**Files:** new `src/lib/practicals/*` (scale, density, weather, bearing, rows, progress, draft, catalogue, types + 5 test files), `src/components/practicals/*`, `src/app/geography-lab/practicals/{page,loading,error,[id]/page}.tsx`, the proposal SQL. Modified `src/lib/geography-lab/catalogue.ts` (activities now derived from the practical catalogue; Fieldwork card links to the library), `src/components/geography-lab/sections.tsx` (activity cards open the workspace; honest progress/teacher text), this file, README.
The previous 8 placeholder cards on the Lab page (climograph, water-use audit, etc.) were replaced by the 8 new activities.

**Verified:** all new pure modules pass strict `tsc` (noUncheckedIndexedAccess on); 33 unit tests pass using a small stand-in runner (not vitest itself); UI files parse and type-check against stubbed React/Next/lucide/ui modules (stubs, so prop types of the real components were not checked). **Not verified:** real typecheck, lint, vitest, `next build`, any browser run, screen-reader or mobile testing.

## Phase 4.3 — Thematic Map Studio (complete)

Route: `/geography-lab/thematic-map-studio` (public, static; linked from the Geography Lab catalogue).

**Works:** choropleth (continuous shading), graduated colour (equal interval, quantile, Jenks natural breaks, 3–7 classes),
proportional symbols (area-proportional; positions from latitude/longitude columns or an approximate region centre).
CSV import is browser-only (no upload, no Supabase, no migrations): preview, column mapping, validation of missing /
non-numeric / duplicate / unmatched / bad-coordinate rows, limits of 2 MB, 5,000 rows, 60 columns.

**Boundary data:** `public/data/world-countries-110m.geojson`, Natural Earth 1:110m Admin 0 Countries (public domain),
slimmed by `scripts/build-boundaries.mjs`. Attribution in `public/data/world-countries-110m.ATTRIBUTION.txt` and on the map.

**Starter data:** "Population estimate" (Natural Earth `POP_EST`, approximate, not official) and "Practice scores"
(SYNTHETIC, labelled everywhere). Colour ramps: ColorBrewer (Apache-2.0), attributed in the UI.

**Known limitations**
- Countries only (177 features at 1:110m). Small countries/islands (e.g. Singapore, Maldives) cannot be shaded; they can be shown as symbols using lat/lng columns.
- No sub-national boundaries (e.g. Indian states). Natural Earth shows de facto borders, which may differ from India's official map; do not treat as an official map of India. Supply an authorised dataset if required.
- Web Mercator distorts area for shaded maps. Region symbols use a centroid of the largest polygon, which can fall outside oddly shaped countries.
- Uploaded data is held in memory only and lost on reload. Map shapes are not keyboard-focusable; the values table is the keyboard-accessible alternative.
- Natural breaks is disabled above 1,500 values (O(k·n²)).
- Tested in headless Chromium only (desktop width); no screen-reader or mobile-device testing.

**Checks:** `npm run typecheck`, `npm run lint`, `npx vitest run` (140 tests) and `npm run build` pass.
The build needs Google Fonts reachable (or `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` in an offline sandbox).

## Phase 5.1 — Discussion Forum foundation: PAGE ONLY, UNVERIFIED BUILD
- **Inspection:** no discussion/forum/thread/reply tables or code existed (only "Soon" placeholders). Nothing is queried and no sample posts exist.
- **Built:** `/forum` (signed-in only, server-checked via `requireSession`, inside `DashboardShell` like `/tutorials`): heading, GET search, class 9-12 filters, six topic categories, Recent discussions with an honest empty state, `loading.tsx`, `error.tsx`. "Popular discussions" is omitted (no activity data). No thread or "new discussion" links exist (no pages). Nav: "Discussion Forum" now links to `/forum` for student, teacher and admin; student dashboard quick link enabled.
- **New files:** `src/lib/forum/categories.ts` (+test), `src/components/forum/forum-sections.tsx`, `src/app/forum/{page,loading,error}.tsx`, `supabase/proposed/phase5_1_forum_PROPOSAL.sql` (UNTESTED, not applied). **Modified:** `nav-config.ts`, `src/app/dashboard/student/page.tsx`.
- **Not verified:** typecheck, lint, vitest, build (no dependencies in sandbox).
