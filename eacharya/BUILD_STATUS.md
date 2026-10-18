# eAcharya build status

> **How to read this file.** The Phase 6.1 audit below is the current status. Every section after it was written per phase,
> is not in order, and was **not re-verified** by the audit (see "Documentation drift").

## Phase 6.1 — Full project audit and role permissions (AUDIT ONLY; no application code, SQL or config was changed by the audit)

**Date:** 2026-10-17 (re-verified 2026-10-18, see section 1). **Method:** static review of `eacharya_phase5_4b_moderation.zip` (8 migrations, 6 SQL check scripts, 5 server-action
files, 40 routes, 27 test files). The first pass had no Supabase project, PostgreSQL, browser or deployment; the re-run added Node and a local PostgreSQL, but still no live Supabase, browser or deployment. Nothing was applied, no data
was touched, no service-role key exists in `src/` (searched) or was added.

### 1. What was actually run (and what failed)

The first pass of this audit was a static review in an environment with no registry, PostgreSQL or browser. It was **re-verified on
2026-10-18 in a networked sandbox** (Node, npm, PostgreSQL 16.15 with a small stand-in for Supabase's `auth`/`storage` schemas). The source
in the uploaded `eacharya_phase5_4b_moderation.zip` is byte-identical to the tree that was checked.

| Check | Result | Notes |
|---|---|---|
| `npm ci` | OK | |
| `npm run typecheck` (TypeScript 5.9) | **Clean, 0 errors** | The earlier "3,789 errors" came from a global `tsc` 6.x with no packages installed: environment, not code |
| `npm run lint` | **Clean, 0 errors, 0 warnings** | |
| `npx vitest run` | **30 files, 435 tests, all pass** (after the Phase 6.2 test batch; 27 files / 296 before) | The earlier count of 293 `it/test` calls is parameterised cases |
| `npm run build` with the real font import | **Fails**: `next/font` cannot download Plus Jakarta Sans | **Environment** (sandbox has no access to fonts.googleapis.com). Not a code defect; Netlify has network access |
| `npm run build` with the font import temporarily stubbed (reverted) | **Compiles, type-checks, generates all routes** incl. `/forum/*` and `/dashboard/admin/forum-reports` | Run with dummy Supabase values, so no live data paths ran |
| `npm audit --omit=dev` | **2 findings (1 high, 1 moderate)**, both PostCSS bundled inside `next` | See SEC-13 |
| Migrations 1-8 on a fresh local PostgreSQL 16 | **All apply in order, no errors** | Local stand-in only, **not Supabase** |
| `rls_checks.sql` | 19 PASS **only after `seed.sql`** (5 PASS then a false FAIL without it) | See TEST-1 |
| `assessment_rls_checks.sql` | 85 PASS on an **empty** database; **fails** (66 PASS, then "expected 1 rows, got 2") after `seed.sql` | See TEST-1: precondition fragility, not an application defect |
| `forum_rls_checks.sql` / `forum53` / `forum_reports` / `forum_moderation` | 42 / 23 / 22 / 33 PASS, with or without the seed | |
| Structural queries on the fresh database | Every `public` table has RLS enabled; `anon` can read only `classes`, `subjects`, `courses`, `units`, `lessons` (published/active rows); `authenticated` has no table-level DELETE/TRUNCATE; policies and grants quoted in sections 2 and 5 were confirmed (SEC-1, 2, 3, 5, 6) | |
| Live Supabase (real JWTs, PostgREST embedded selects, Auth emails, Storage), browser, mobile, screen reader, Netlify deployment | **Not performed** | Still the biggest gap |

**New findings from the re-run**

- **TEST-1 (test setup, Low).** The two oldest SQL scripts have opposite preconditions: `rls_checks.sql` needs `seed.sql`, while
  `assessment_rls_checks.sql` counts total rows and so needs an empty database. Run in the documented order on one database they cannot
  both pass. Fix: make the assessment counts ignore seeded rows (filter on the script's own ids) and give each script a "needs seed: yes/no"
  header. Not an application bug.
- **SEC-13 (Low-Med, dependency).** `npm audit` reports a high and a moderate PostCSS advisory (CSS stringify XSS and `sourceMappingURL`
  file read) through the copy of PostCSS inside `next`. The app only processes its own CSS at build time, so exposure is low, but the advised
  fix is a major upgrade (`next@16`). Recommend first trying the newest Next 15.5.x patch release, then planning the major upgrade deliberately.
- **DOC-1.** `supabase/proposed/phase5_1_forum_PROPOSAL.sql` is stale (superseded by migration 5) and should be removed so the proposed
  folder holds only live proposals.
- **BUILD-1.** Netlify's earlier failure was the unescaped apostrophe in `geography-lab/sections.tsx`; it is fixed in the Phase 5.3 and later
  sources (lint is clean). A normal `next build` on Netlify has **not** been confirmed since: redeploy and record the result.

### 2. Role model (from code and SQL)

Roles: `student`, `teacher`, `admin` only (`user_role` enum). No new role was invented.
- Sign-up always yields `student` (trigger ignores metadata; Zod strips a forged `role`). The `role` column is **not** grantable to
  `authenticated`; it changes only through `admin_set_user_role()` (admin only, never self), backed by a guard trigger.
- Role is read from `profiles` on every request via `auth.getUser()` (not from a cookie or JWT claim), so a demotion applies at once.
- `requireRole` is strict equality: a teacher cannot open admin pages and an admin cannot open teacher/student dashboards, even
  though RLS gives admins wider database rights than any screen exposes. Middleware only checks "signed in" for `/dashboard/*`.

**Routes**

| Audience | Routes (guard) |
|---|---|
| Public | `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/courses`, `/courses/[slug]`, `/sign-in`, `/sign-up`, `/auth/*`, `/geography-lab` (+ `map-explorer`, `thematic-map-studio`, `practicals`, `practicals/[id]`; role only changes a panel and enables browser-only drafts) |
| Any signed-in role (`requireSession`) | `/forum`, `/forum/new`, `/forum/[id]`, `/forum/bookmarks`, `/tutorials`, `/tutorials/[lessonId]`, `/resources`, `/resources/[id]` (data still gated by RLS) |
| Student only | `/dashboard/student` and `/courses`, `/resources`, `/assessments`, `/assessments/[id]`, `/bookmarks`, `/profile` |
| Teacher only | `/dashboard/teacher`, `/assessments`, `/assessments/new`, `/assessments/[id]` |
| Admin only | `/dashboard/admin` (user list, role change), `/dashboard/admin/forum-reports` |

**Permitted / restricted by role** (all rows are enforced by RLS or a DB function; UI hiding is never the control)

| | Student | Teacher | Admin |
|---|---|---|---|
| Permitted | Edit own display name; enrol/leave published courses; own progress, notes, bookmarks; read published resources via 5-minute signed URLs; read published assessments of enrolled courses (question text only inside the open window); forum post/reply/edit own/delete own (discussion only while it has no replies)/like/bookmark/report others | Everything a student can in the forum (posts like a student); on **own** courses (`created_by`): units and lessons while the course is draft, lesson content, draft resources, create/edit/delete draft assessments and questions, publish/unpublish own assessments, read own answer keys (builder only) | Read all profiles (no emails); change **other** users' roles; moderate forum reports (status, hide, restore); RLS rights to manage curriculum, resources, assessments (question content only while draft), delete any forum item |
| Restricted | No writes to courses, lessons, resources, assessments, questions, keys; cannot read others' notes, progress, enrolments, likes, bookmarks or reports; cannot see hidden posts of others; cannot change roles | Cannot publish courses or resources (admin only); no admin pages; cannot see reports; other teachers' assessments and keys invisible; cannot change roles | Cannot change own role; resolved reports are final; published question content is locked even for admins; builder UI is teacher-only (`role === "teacher"`), so admins have no screen for it |

**Server-side authorisation.** All five action files (`auth`, `learning`, `assessments`, `forum`, `forum/moderation`) validate input with Zod,
take the user from `auth.getUser()`, and use the user's own session (publishable key), so RLS always applies. Extra checks:
assessments (role `teacher` + course ownership), moderation (role `admin` + DB function re-check), role change (`requireRole("admin")`
+ DB function). Forum and learning actions rely on RLS plus `.eq(author_id|user_id)`. No action relies on hidden buttons.

### 3. Feature status

"Tested" = automated tests exist in the repo and **pass in the 2026-10-18 re-run** (unit tests under vitest, SQL scripts on a local PostgreSQL stand-in); **none was verified against live Supabase or a browser.**

| Area | Status | Notes |
|---|---|---|
| Role model, profile protection, curriculum RLS (migrations 1–2) | Implemented and tested | `rls_checks.sql` (19), `roles.test.ts`; local-PostgreSQL stand-in only |
| Auth: sign-up/in/out, verify, forgot/reset, safe redirect | Implemented, not fully verified | Zod, role and redirect unit tests; email flows and redirect allowlist need live Auth. `auth/actions.ts` has no tests |
| Public site, About/Contact/Privacy/Terms | Implemented, not fully verified | Contact, Privacy, Terms are draft placeholder text |
| Admin user list and role change | Implemented, not fully verified | No test for `setUserRoleAction`; see SEC-10 |
| Courses, enrolment, e-Tutorials (player, progress, notes, bookmarks), e-Content, signed URLs, profile | Implemented, not fully verified | Pure-logic tests only; `learning/actions.ts` and storage policies untested |
| Teacher/admin authoring (create course, Students, Submissions, Platform Settings, Security) | Missing | These nav items are disabled placeholders; course and chapter creation is still SQL |
| Teacher video manager (Phase 6.2): paste YouTube links, titles auto-fetched, add many per chapter | Code complete, not verified | Pure link-parsing tests only; `teacher-videos/actions.ts` untested; needs a live Supabase and outbound access to youtube.com. No migration. See section "Phase 6.2 video manager" |
| Assessment database (3.1) | Implemented and tested | 85 documented SQL checks; application unverified |
| Teacher assessment builder (3.2) | Implemented, not fully verified | Validation and publish unit tests; `assessments/actions.ts` untested; multi-step writes are not transactional |
| Student assessment list and instructions (3.3, read-only) | Partially implemented | Start button disabled by design |
| Attempts, exam UI, answer saving, submit, scoring, results, analytics (3.3–3.6) | Missing, blocked | Only `supabase/proposed/*` SQL exists, untested, not applied, awaiting approval |
| Geography Lab dashboard, Map Explorer, Thematic Map Studio (4.1–4.3) | Implemented, not fully verified | Coordinate, catalogue, classify, CSV and series tests; earlier note says headless Chromium only; OSM public tiles are for light use |
| Practical activities workspace and calculators (4.4) | Partially implemented | Drafts are browser-only (localStorage). Server drafts, submission, evidence upload, teacher review: Missing, blocked on proposal |
| Forum list and page (5.1) | Implemented, not fully verified | Needs forum tables from migration 5 |
| Discussions, replies, delete rule (5.2) | Implemented, **blocked by unapplied migration 5** | 42 SQL checks, 43+ unit tests documented |
| Likes, bookmarks, search, sort (5.3) | Implemented, **blocked by unapplied migration 6** | List reads `like_count`: migration must precede deploy |
| Reporting (5.4A) | Implemented, **blocked by unapplied migration 7** | Native `<dialog>` never run in a browser |
| Moderation (5.4B) | Implemented, **blocked by unapplied migration 8** | Embedded `discussions(...)`/`discussion_replies(...)` selects and admin `profiles` reads never run under real JWTs |
| Automated tests overall | Partial (435 unit tests pass; 6 SQL scripts pass locally) | 30 unit-test files; action tests now exist for auth, learning and assessments; still no component or e2e tests |

### 4. Migration status (no database access: applied state **unverified** for all eight)

| # | File | Documented state | Evidence in repo |
|---|---|---|---|
| 1–2 | initial schema, auth and RLS | not stated | none |
| 3 | phase 2 learning (+ `resources` bucket) | not stated | none |
| 4 | phase 3 assessments | "apply migration 4" listed as outstanding | none |
| 5–8 | forum, likes/search, reports, moderation | **NOT applied** (README and this file) | none either way |

Order matters (8 needs 7, 6 needs 5; 5–8 need `is_admin`, `set_updated_at`). Rollbacks exist for 4–8 only (none for 1–3). Five
`supabase/proposed/*.sql` files are not migrations. Nothing was applied by this audit.

### 5. Security findings (code and SQL review; none confirmed on a live project)

| ID | Severity | Finding | Recommended fix |
|---|---|---|---|
| SEC-1 | Medium | `questions`/`question_options` are readable by any enrolled student through the API during the open window, with no attempt record, so the timer, attempt limit and one-attempt rules cannot be enforced (answer keys are **not** exposed). The disabled Start button is not a control | Do not open exams to students until the attempts migration (RPC delivery) is approved; consider removing the direct student policies then |
| SEC-2 | Medium | An author can edit or delete reported content before a moderator acts, and can delete a reply **after** it was hidden. Reports store no content snapshot, so evidence and "restore" are lost | Additive migration: block author delete/edit while a report is pending or the item is hidden, or snapshot text at report time |
| SEC-3 | Medium | No audit log for role changes. `forum_report_events` cascades away if the reporter's account is deleted | Log role changes inside `admin_set_user_role`; keep events (FK `set null`) |
| SEC-4 | Low–Med | No `Content-Security-Policy` (other headers present); HSTS depends on the host | Add CSP (YouTube `frame-src`, OSM tiles, Supabase `connect-src`) |
| SEC-5 | Low | All teachers can read hidden forum posts, while moderation is admin-only | Product decision; restrict policy to author and admin if unintended |
| SEC-6 | Low | Enrolment policy has no role check; a teacher or admin enrolled in another teacher's published course gains student read access (code comment in `assessments/data.ts` acknowledges it) | Restrict insert to students, or accept |
| SEC-7 | Low | Storage read policy for published resources ignores course status; `resources.storage_path` need not be in the uploader's folder, so an admin could publish a pointer to someone else's file | Check path prefix and course status |
| SEC-8 | Low | `siteOrigin()` falls back to Host headers if `NEXT_PUBLIC_SITE_URL` is unset | Set it in production; restrict Supabase redirect URLs |
| SEC-9 | Low | No app-level rate limits (posts, replies, reports, likes, enrolment); sign-in relies on Supabase Auth limits | Add limits before public launch |
| SEC-10 | Low | Admin Users table stops at 100 rows with no search; `setUserRoleAction` ignores the RPC error (silent failure); two admins could demote each other (no last-admin guard) | Pagination, show errors, DB guard |
| SEC-11 | Info | Teachers may unpublish and edit a published assessment. Safe only while no attempts exist | Lock once attempts exist (already planned) |
| SEC-12 | Config | Unverified: Auth redirect allowlist, email confirmation, password rules, `resources` bucket exists and is private, RLS enabled on live tables | Check on the Supabase dashboard |

Reviewed and found sound: no service-role key in `src/`; `.env.example` has only the publishable key and `.gitignore` covers env files;
no `dangerouslySetInnerHTML`/`eval`; user id and role never come from the request; users can update only `full_name` and
`avatar_url`; every `SECURITY DEFINER` function pins `search_path` (counted per migration) and is revoked from `public`/`anon`
except intended helpers; like counters are not user-writable; forum links are https-only; `safeNext` blocks open redirects;
answer keys sit in staff-only tables; `anon` has no privileges on any table added after migration 2.

### 6. Documentation drift

"Known gaps" below still says Geography Lab, Forum and Assessments are "Soon" placeholders (no longer true); the line
"Last updated: Phase 3, Task 3.2 … NOT yet type-checked" is stale; Phase 3.2/3.3/4.1/4.2/4.4 sections record checks as "not run" and
were never marked superseded; Phase 5.2 cites "45" SQL checks but the script has 42; sections are out of order; the zip also contains
`tsconfig.tsbuildinfo` and `next-env.d.ts`, which `.gitignore` excludes.

### 7. Recommended order of fixes (not started)

1. On a **scratch** Supabase project apply migrations 1–8 in order, run the six `supabase/tests/*.sql` scripts (see TEST-1 for the seed rule), and record the output here.
2. (Done in a sandbox, 2026-10-18: `npm ci`, typecheck, lint, tests pass.) Redeploy on Netlify and record the real `next build` result (BUILD-1).
3. Exercise the untested live paths: embedded selects on `forum_reports`, admin reads of `profiles`, signed URLs, sign-up and reset emails.
4. Fix SEC-2, SEC-3, SEC-4; decide SEC-1, SEC-5, SEC-6 before attempts or any real students.
5. Add tests for `auth`, `learning` and `assessments` actions; then SEC-7 to SEC-10.

## Phase 6.2 — Tests for previously untested server actions (tests only; no application code changed)

- **Added:** `src/lib/auth/actions.test.ts` (27), `src/lib/learning/actions.test.ts` (36), `src/lib/assessments/actions.test.ts` (76). Total now 30 files / 435 tests; typecheck and lint clean.
- **What they pin down:** role changes need `requireRole("admin")`, ignore self-change and invalid input, and go only through `admin_set_user_role`; sign-up never sends a role (forged `role` stripped); sign-in/forgot/reset messages do not leak account existence or provider errors; enrol/progress/bookmark/note/profile actions use the session user id and write only granted columns; the assessment builder refuses student, admin, unknown-role, no-profile and signed-out callers on all 8 actions, hides other teachers' assessments as "not found", locks published assessments, checks course ownership on create and sets `created_by`/`status` server-side.
- **Limits:** the Supabase client is a fake, so these prove the application logic, not RLS (that is covered by the SQL scripts, run against a local stand-in, not live Supabase). SEC-10 (role-change RPC error silently ignored) is documented by the code but not changed.
- **Decisions recorded (nothing implemented):** SEC-2 approach chosen = **lock while reported or hidden** (authors cannot edit/delete a post or reply while it has an open report or is hidden), to be done as an additive migration 9 — **not yet written**. Not selected this round: hygiene fixes (TEST-1, DOC-1, SEC-10, SEC-13), migration 9 (SEC-2/SEC-3), CSP header (SEC-4). SEC-1, SEC-5, SEC-6 remain open product decisions.

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


## Phase 6.2 video manager: CODE COMPLETE, NOT VERIFIED

Teacher route `/dashboard/teacher/videos` (nav item "Videos"), then `/dashboard/teacher/videos/[unitId]` for one chapter (a `unit`).

- Paste one or many YouTube links (one per line). After a short pause titles are fetched from YouTube's public oEmbed endpoint (no API key) by a server action; the teacher can edit any title, reorder, remove rows, then save once.
- Each video becomes one `lessons` row (next free `position`) plus one `lesson_content.video_url` row, stored as the canonical `https://www.youtube.com/watch?v=<id>`. Duplicates (same video, any URL form) are skipped. Direct https .mp4/.webm/.ogv links are accepted; their titles are typed by hand (file name suggested).
- If the title cannot be fetched (private/removed video, YouTube unreachable) the row asks for a typed title; nothing is blocked.
- Teachers can also rename or remove a video from the chapter page.
- Security: teacher role required, Zod validation, URLs re-validated server-side with `parseVideoUrl`, the oEmbed request is rebuilt from an 11-character id (fixed host), ownership checked and enforced again by existing RLS, no service-role key.
- **No migration and no new storage bucket.** Uses existing `lessons` / `lesson_content` policies.
- **Known limit:** existing RLS lets a teacher change lessons only while the course is `draft`. On a published course the page is read-only and says so. Changing that needs a migration and is not proposed here.
- Not done: moving existing videos up/down after saving, per-video descriptions/objectives/transcripts, duration auto-fill.
- Evidence: the pure helpers in `src/lib/teacher-videos/links.ts` were compiled and run standalone in this environment (output matched the cases in `links.test.ts`). `npm install`, `npm run typecheck`, `lint`, `test`, `build` and any live Supabase/browser check were **not** run (no node_modules, no network).
