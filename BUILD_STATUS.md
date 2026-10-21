## Phase 4 extension — India Geography Dataset Library — 2026-10-21

### Implemented in source
- Added `/geography-lab/india-datasets` and linked it from the Geography Lab tools catalogue.
- Bundled 17 source-attributed datasets/resources with 291 records across climate/rainfall, literacy by sex, total/child sex ratio, urbanisation, rice/wheat/sugarcane yield, national irrigation indicators, Census worker categories, installed electricity capacity, selected road-length rows, selected mineral/energy locations and selected cyclone events, plus official reference portals.
- Added dataset filtering by topic, search within a selected table, a top-five comparison view where a numeric series supports it, CSV download, source links and explicit period/geography/unit/caveat metadata.
- Added `INDIA_GEOGRAPHY_DATASETS.md` with source provenance, time-period/boundary notes and mapping limitations.
- Did not invent coordinates for mineral/energy locations or missing road/rail values. The rail entry is explicitly a source directory record; state-level choropleths still require a compatible India state/UT geometry layer.
- No database migrations, environment secrets or additional dependencies are required for the bundled dataset hub.

### Verification status
- `tsc --noEmit`: passed.
- Targeted ESLint on new/updated dataset files and Geography Lab catalogue: passed.
- Custom structural/data checks: passed for all 17 datasets and 291 records, including source links, row/column consistency, literacy gaps, rainfall sums and road-length arithmetic.
- Automated Vitest suite: attempted but could not start because the available cached dependencies lack `@rollup/rollup-linux-x64-gnu`.
- Production build: attempted but Next.js could not download the platform SWC binary because registry DNS resolution failed (`EAI_AGAIN`). Build and browser interaction are therefore not verified in this environment; run `npm ci`, `npm test` and `npm run build` locally before deployment.
- No live state-level map test was performed. Current Thematic Map Studio is documented in the UI as using world-country boundaries, not India state boundaries.

---

## Phase 4 — Geography Lab tool completion — 2026-10-21

### Implemented in source
- Added a Latitude and Longitude Explorer at `/geography-lab/latitude-longitude` with decimal-coordinate validation, hemisphere interpretation, copy-to-clipboard action, sample-place shortcuts, and a lightweight SVG coordinate grid.
- Added a Climate Data Explorer at `/geography-lab/climate-explorer` with selectable climate examples, monthly climographs, monthly tables, annual rainfall, mean annual temperature and warmest/coolest/wettest/driest month summaries. All values are prominently labelled as synthetic teaching examples rather than official or current station data.
- Added a Population Data Explorer at `/geography-lab/population-explorer` with calculated population density, growth percentage, a comparative density bar view and age-group structure. Values are synthetic examples, not official data for real places.
- Connected all six Geography Lab tool cards to implemented routes and removed the stale copy claiming most tools were still being built. Existing Map Explorer, Thematic Map Studio and practical catalogue routes were retained.
- Added pure calculation modules and unit tests for coordinate interpretation, climate summary calculations and population measures. No database migration or new npm dependency is required.

### Verification status
- `tsc --noEmit`: passed after addressing strict indexed-access checks in the new code.
- Targeted ESLint on the new/updated files: passed.
- Automated Vitest suite: attempted but did not start because the available archived `node_modules` lacks `@rollup/rollup-linux-x64-gnu`. This is an environment/dependency issue; it is not counted as a test pass.
- Production build and browser interaction: not run. Run `npm ci`, `npm test`, and `npm run build` in the local project before deployment.
- No database schema changes were made in this phase.

---

## Phase 2 — Advanced Assessment Analytics — 2026-10-21

### Implemented in source
- Kept the existing per-assessment summary cards and added two independent sections to the combined `/dashboard/teacher/analytics` page: student progress by course and question-wise performance.
- Student progress includes published assessment count, submitted attempts, graded attempts, pending grading and average marks from fully graded attempts.
- Question-wise analysis includes response counts, pending/graded counts, average awarded marks and average percentage; questions with lower average percentages appear first.
- Advanced RPC errors are handled per section so a missing Phase 2 migration does not hide the existing Phase G summary cards.
- Added `supabase/migrations/20261101000001_phase2_advanced_analytics.sql` to deploy/redefine the two staff-only RPCs. The question-analysis query now joins scores through submitted attempts to avoid counting score records from unrelated/non-submitted attempts.
- Added `PHASE2_ADVANCED_ANALYTICS_SETUP.md` with migration and verification steps.
- Fixed the existing student-progress RPC for the actual `profiles` schema (there is no `profiles.email` column) and limited rows to profiles with the `student` role; the question analysis join now counts only score rows belonging to submitted attempts. Applied the same source correction to the older Phase H migration for fresh installations.
- Passed a single server-generated evaluation timestamp into the client analytics cards so an assessment close time cannot flip the results-release badge during hydration.
- Added a safe optional-index access in an existing test assertion so `tsc` can proceed past a possibly-undefined array index.

### Verification status
- Static source and route review: done.
- `npm run typecheck`: **passed** after fixing the existing possibly-undefined assertion in `attempt-actions.test.ts`.
- Automated tests: attempted via the available Node toolchain but did not start because the archived `node_modules` is missing the platform-specific `@rollup/rollup-linux-x64-gnu` optional dependency.
- Production build: attempted; Next.js could not download `@next/swc-linux-x64-gnu` because npm registry DNS resolution failed (`EAI_AGAIN`).
- Live Supabase migration and browser verification: not performed. Apply the migration to the intended Supabase project, then verify that both advanced sections populate under an authenticated teacher account.
- **Do not treat Phase 2 as production-verified until typecheck, test, build, migration and role-isolation checks pass.**

---

## Phase 1 — UI link and label cleanup — 2026-10-21

### Implemented
- Connected the Student Dashboard's Quick access **Assessments** tile to the existing `/dashboard/student/assessments` route; replaced the inaccurate `Coming soon` note with `Quizzes and tests`. The dashboard sidebar already linked to this route.
- Updated the README overview to reflect the current route/module inventory and to distinguish source implementation from live verification.
- Updated the deployment guide from a GitHub/Vercel import flow to Netlify CLI/manual deployment instructions, consistent with `netlify.toml` and the requested no-GitHub deployment preference.

### Intentionally unchanged
- Geography Lab tools that have no implemented route/action still show `Coming soon`; making those cards clickable would misrepresent functionality. Teacher-side lab assignment and server-side progress are also explicitly not available yet.
- Contact details remain marked as unpublished because a real support contact was not provided. Privacy/terms content remains a draft; this phase does not invent legal or support information.

### Verification
- Static source review: done.
- Typecheck, lint, automated tests, production build and live Supabase/browser workflow: pending for this phase; do not mark as passed until run on the packaged project.

---

## Assessment Analytics route fix — 2026-10-19

- Root cause from source inspection: `/dashboard/teacher/analytics` called the Phase H RPCs `get_teacher_student_progress()` and `get_teacher_question_analysis()`, while the user's database verification confirmed `get_teacher_assessment_analytics()` exists and is executable. The generic fallback hid the RPC mismatch. Browser Network did not show the RPC because this page loads data in a Next.js Server Component; the call is server-side.
- Changed `src/app/dashboard/teacher/analytics/page.tsx` to use the existing `get_teacher_assessment_analytics()` RPC, matching the already-existing Assessment Reports page and its typed display component. Added server-side logging of the RPC error code only; no raw database message or user data is exposed.
- No migration or database change required.
- Verification in this environment: pending; run tests/typecheck/build and then test the route against the configured Supabase project.

## Fix — Assessment submission failure ("Something went wrong. Please try again."). STATUS: FIX WRITTEN; NOT VERIFIED AGAINST A LIVE DATABASE

**Date:** 2026-10-19.

### Root cause (confirmed by reading the code and SQL; not reproduced live)
`public.score_attempt` (Phase F1, `20261027000001_phase_f1_scoring_results.sql`) read `attempt_answers.selected_option_ids` and `attempt_answers.answer_boolean`. Those columns do not exist: the Phase D table (`20261026000001`) stores one `answer jsonb` (`{"option_id"}`, `{"option_ids":[...]}`, `{"value":bool}`). plpgsql resolves record fields at run time, so the migration applied cleanly but any submit of an attempt with a single-choice, multiple-select or true/false answer raised SQLSTATE `42703`. `submit_attempt` calls `score_attempt` in the same transaction, so the whole submit rolled back. `submitAttemptAction` -> `finish()` -> `attemptErrorMessage()` has no case for `42703`, so it returned `{ok:false,error:"Something went wrong. Please try again."}` as a normal server-action response (HTTP 200). Grep confirms no other function references the missing columns. Signatures, auth checks, status/expiry handling and the result/score inserts were reviewed and are consistent.

### Files changed
- NEW `supabase/migrations/20261031000001_fix_score_attempt_answer_columns.sql`: `create or replace function public.score_attempt(uuid)` only. Same signature, SECURITY DEFINER, `search_path = ''`, scoring rules and idempotency; it now reads the jsonb `answer`. Cleared answers (`answer is null`) count as unanswered. Execute remains revoked from public/anon/authenticated. Not destructive, no data change.
- NEW `src/lib/assessments/attempt-log.ts`: server-only logger. Logs operation + SQLSTATE code (+ truncated message outside production). Never logs details/hint, ids, answers or credentials.
- `src/lib/assessments/attempt-actions.ts`: failed RPCs are logged server-side; `submitAttemptAction` shows a specific message for `23514` (could not be scored; answers kept). Unexpected codes still return the generic message.
- Tests: `attempt-log.test.ts` (new), extra cases in `attempt-actions.test.ts`.

### Migration requirement
**Required.** Apply `20261031000001_fix_score_attempt_answer_columns.sql` to the Supabase project (do not edit the F1 migration). Attempts left `in_progress` after a failed submit can simply be submitted again. Any attempt already `submitted` without a result is scored on the next `submit_attempt` call.

### Test results (honest)
- `npm ci` failed: the sandbox proxy blocks `registry.npmjs.org` (HTTP 403), so dependencies could not be installed.
- **NOT run:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and the migration against Postgres (no database server available).
- Run only: `tsx` executed `describeRpcError` from `attempt-log.ts` and printed the expected output (code+message in dev, code only in production). The edits to `attempt-actions.ts` and the new tests were NOT compiled or executed.
- Please run `npm test && npm run build` and apply the migration on a scratch project, then submit an attempt with one single-choice, one multiple-select, one true/false and one short-answer question and confirm `attempt_results` / `attempt_question_scores` rows appear.

## Phase E6 — Secure Submission. STATUS: IMPLEMENTED; AUTOMATED CHECKS NOT VERIFIED

**Scope:** connect the student review screen to the existing `submit_attempt` server action. No database migration or scoring/results logic was added.

### Implemented
- Added a final confirmation step in the review screen; it warns that submission is final and shows answered/total counts.
- Before submission, awaits `AnswerAutosaver.flush()` and refuses to submit if any answer is still unconfirmed or the attempt is closed.
- Calls the existing `submitAttemptAction` with only the current attempt id. Ownership and deadline enforcement remain in the server/database function; no student id, score, deadline or status is accepted from the client.
- Shows a submitted confirmation only after the server returns `submitted`; displays a separate expiry state if the server returns `expired`.
- Handles server errors and uncertain network responses without claiming success. Repeated submission remains safe through the existing database function's idempotent status handling.
- No new migration, direct browser-to-database access, scoring, grades, or results view was added.

### Verification
- **Done:** source-level review, confirmed the submit action calls the existing RPC and the UI awaits autosave flush before calling it; ZIP archive integrity check.
- **NOT run:** TypeScript, lint, automated tests, production build, browser workflow, or live Supabase integration. The project dependencies are not installed in this working environment.
- **Live-verified:** none. Keep `ASSESSMENT_ATTEMPTS_ENABLED` disabled until migrations and all security/integration checks have been verified on a scratch Supabase project.

### Manual checks before enabling
1. Submit with all answers saved; confirm the submitted screen appears only after server confirmation.
2. Type an answer and immediately submit; confirm flush completes before submission.
3. Simulate a save failure/offline state; confirm submission is blocked and retry is available.
4. Submit an expired attempt and an already-submitted attempt; confirm server status is handled safely.
5. Attempt to submit another student's attempt id; confirm server authorization rejects it.
6. Verify no answer keys or score are returned to the student.

## Phase E5 — Review Before Submission. STATUS: IMPLEMENTED; AUTOMATED CHECKS NOT VERIFIED

**Date:** 2026-10-19. **Scope:** add a student-facing review screen before final submission. This phase does not submit attempts and makes no database or migration changes.

### Implemented
- Added a Review answers control to the student question paper.
- Review screen summarizes answered, unanswered, and total question counts.
- Lists each question with its answered/unanswered status and a control to return directly to that question.
- Added a return-to-questions control and preserves the existing answer state, autosave engine, countdown, and server-authoritative deadline checks.
- Shows a warning if answers are pending, saving, failed, or rejected; students are advised to wait for the saved status before finishing.
- Explicitly states that final submission is not available until Phase E6. No submit action or score is exposed.

### Verification
- ZIP integrity: checked after packaging.
- TypeScript, lint, Vitest, production build, browser, and live Supabase checks: not verified in this packaging environment because project dependencies are not installed completely. Do not treat E5 as production-ready or live-verified.

### Remaining
- E6: secure final submission; flush and verify autosave, call the existing server-side submit workflow, handle already-submitted/expired states safely, and run available tests. Keep real assessment attempts disabled until security and integration checks pass on a scratch Supabase project.

---

## Phase E4 — Countdown Timer and Question Navigation. STATUS: IMPLEMENTED; AUTOMATED CHECKS NOT VERIFIED

**Date:** 2026-10-19. **Scope:** add a server-derived countdown display, question palette, previous/next navigation, and answered/unanswered progress to the student question paper. No database migration or deployment changes.

### Implemented
- `src/components/assessments/attempt-paper-section.tsx` passes the server-returned `secondsRemaining` from the validated attempt payload into the question interface.
- `src/components/assessments/question-paper.tsx` displays a countdown initialized from server-calculated remaining seconds, not the student's wall clock. The server/database deadline remains authoritative.
- Added a question palette, Previous/Next controls, current-question indication, answered/unanswered styling, and a progress bar.
- When the displayed countdown reaches zero, answer inputs are disabled locally and a deadline warning appears. This is a user-interface safeguard only; server-side deadline validation remains mandatory. No automatic submission was added.
- Preserved E3 answer restore/autosave and existing student-safe question data. No answer keys were added to the client.

### Verification
- ZIP integrity will be checked after packaging.
- TypeScript, lint, Vitest, production build, browser, and live Supabase checks have not been verified in this packaging environment. Do not treat E4 as production-ready or live-verified.

### Remaining
- E5: review answers before submission.
- E6: secure submission; flush autosave and block submission if any answer remains unsaved; then final security and integration checks.

---

# eAcharya build status

## Phase E3 — Connect Autosave and Restore Saved Answers. STATUS: IMPLEMENTED; AUTOMATED CHECKS BLOCKED BY INCOMPLETE DEPENDENCIES

**Date:** 2026-10-19. **Scope:** connect the existing Phase D answer-saving and restore server actions to the E2 student question inputs. No database migration, schema, direct browser database access, or deployment changes.

### Implemented
- Updated `src/components/assessments/question-paper.tsx` to create the existing `AnswerAutosaver` for the active attempt and save through `saveAnswerAction`.
- Loads the student's saved answer snapshot with `getAttemptAnswersAction`, verifies that the returned attempt id matches the active attempt, and hydrates the autosaver before enabling inputs. Inputs remain disabled if restore fails, avoiding accidental overwrite of a saved snapshot with blank values.
- Connected single-choice, multiple-select and true/false inputs to immediate saves; text answers use the existing autosaver debounce and retry policy.
- Added save status, restore errors, manual retry for transient failures, and an online-event listener that asks the autosaver to retry.
- Disposes the autosaver and removes listeners when the component unmounts. No answer keys or additional student data are added to the client payload.
- Updated `attempt-paper-section.tsx` to pass the verified active attempt id and removed the obsolete warning that autosave was not connected.

### Verification
- ZIP integrity: verified after packaging.
- `npm run typecheck`: **blocked**. The available `node_modules` directory is an incomplete 2.3 MB skeleton; TypeScript reports missing type definition packages (`react`, `node`, `leaflet`, etc.). This is an environment/dependency problem, not a passing typecheck.
- Vitest, lint, production build, browser and live Supabase checks: **not verified**.
- Migration state on the real Supabase project remains unverified. Keep live assessment attempts disabled until migrations and security checks pass on a scratch Supabase project.

### Remaining
- E4: timer and question navigation.
- E5: review before submission.
- E6: secure submission; must call and await `AnswerAutosaver.flush()` and refuse submission if unsaved answers remain.

---

## Phase E2 — Question Display and Answer Inputs. STATUS: IMPLEMENTED; AUTOMATED CHECKS PENDING

**Date:** 2026-10-19. **Scope:** make the existing student-safe question paper interactive. No database or migration changes. E2 originally stored answers in client component memory only; Phase E3 now connects the existing Phase D save/restore actions and autosave engine.

### Implemented
- Converted `src/components/assessments/question-paper.tsx` to a client component with answer controls for all supported types: single choice, multiple select, true/false, short answer (500-character cap), and descriptive response (10,000-character cap).
- Added clear-answer controls for choice and true/false questions, selected-state styling, accessible labels/fieldsets, and live character counts.
- Kept the client question shape limited to `StudentQuestion`, which contains no answer key, correctness flags, accepted answers, or explanations. Question retrieval still goes through the existing server action/database function.
- Updated `attempt-paper-section.tsx` instructions to explain the input and autosave phase boundaries.
- Displayed a clear warning that answers are not saved yet and the student should keep the page open.
- No direct browser database access, schema changes, or GitHub deployment.

### Limitations / next
- Autosave and server restore are implemented in Phase E3. Automated and live Supabase verification are still pending; do not use for real exams until those checks pass.
- Timer/navigation/review/submission remain E4-E6.

### Verification
- Implemented by code inspection. Automated typecheck, lint, Vitest, production build, browser, and live Supabase checks were not run in this packaging environment. Do not treat E2 as verified or live-ready.

---

## Phase E1 — Start and Resume Assessment. STATUS: IMPLEMENTED; AUTOMATED CHECKS PENDING

**Date:** 2026-10-19. **Scope:** connect the existing student assessment detail page to the existing secure `start_assessment_attempt` server action. No schema or migration changes were made. The database remains authoritative for student role, enrolment, publication status, attempt limits, duplicate starts and deadlines.

### Implemented
- Added `src/components/assessments/start-resume-button.tsx`, a client control that calls the existing `startAttemptAction` with the assessment id and a UUID request key.
- The button prevents repeated clicks while a request is in flight. It retains the same request key after a failed request so a retry is idempotent; it clears the key after success.
- Success announces whether the attempt was started or resumed and refreshes the server-rendered page. Existing server components then re-check the student's open attempt before retrieving the safe question paper.
- Connected the control to `src/app/dashboard/student/assessments/[id]/page.tsx`. It is enabled only when the page's current availability check says the assessment is open; upcoming and closed assessments show a disabled button.
- Kept existing server-side RPC authorization and fixed error mapping. No student id, score, status, or deadline is accepted from the client. No service-role key was added.
- No database migration was added or applied. No GitHub deployment was performed.

### Verification
- **Implemented by code inspection:** UI integration and reuse of existing secure server action.
- **Not yet run in this packaging environment:** typecheck, lint, Vitest, production build, browser checks, or live Supabase checks. Do not treat Phase E1 as live-verified.
- The current `availability` prop is a page-render-time display gate only; the database RPC must and does remain the security authority.

### Remaining in Phase E
E2: question display and answer inputs. E3: connect answer inputs to Phase D autosave and restore. E4: timer and navigation (implemented; automated checks pending). E5: review screen. E6: secure submission and final checks. Keep assessment attempts disabled for real use until migrations and all relevant checks have been verified on a scratch Supabase project.

---


> **How to read this file.** Newest phase first: Phase D (answer saving), Phase C5 (question delivery verification), Phase C4 (student question delivery UI), Phase C3 (safe question response), Phase C2 (question retrieval) and Phase C1 (its audit) are at the top, then Phase B. The Phase 6.1 audit below is the current status. Every section after it was written per phase,
> is not in order, and was **not re-verified** by the audit (see "Documentation drift").

## Phase D — Answer saving and autosave. STATUS: SQL VERIFIED ON A LOCAL POSTGRES; TYPESCRIPT VERIFIED BY REAL vitest / tsc / lint; NOT RUN ON SUPABASE; NO UI; PRODUCTION BUILD NOT VERIFIED

**Date:** 2026-10-19. **Scope:** save and restore a student's in-progress answers. **Not built (by design):** exam UI, timer, review screen, submission changes (`submit_attempt` is untouched), scoring, results, teacher views (Phases E-G). Autosave is an engine plus server actions; nothing in the UI calls it yet (Phase E).

### What was added
| Path | What |
|---|---|
| `supabase/migrations/20261026000001_phase_d_answer_saving.sql` (migration 14) | `attempt_answers` (no grants, RLS on, no policy), `save_attempt_answer`, `get_attempt_answers`, internal helpers, guard trigger. **Not applied to any Supabase project.** |
| `supabase/rollbacks/20261026000001_phase_d_answer_saving_rollback.sql` | DESTRUCTIVE: drops all saved answers |
| `supabase/tests/answer_saving_checks.sql` | 120 checks |
| `supabase/tests/answers_concurrency_check.sh` | duplicate / out-of-order / save-vs-submit races |
| `src/lib/assessments/answers.ts` | schemas, mappers (fail closed), failure classification |
| `src/lib/assessments/answer-actions.ts` | `saveAnswerAction`, `getAttemptAnswersAction` |
| `src/lib/assessments/autosave.ts` | framework-free autosave engine (debounce, coalescing, revisions, backoff retry, flush, hydrate) |
| `src/lib/assessments/student-context.ts` | the existing student check, moved out of `attempt-actions.ts` so both action files share it (behaviour unchanged) |
| `src/lib/assessments/attempts.ts` | two new fixed messages (EA008, EA009) |
| `src/lib/assessments/answers.test.ts` | 37 tests |
| Phase C tests | 4 pre-existing type errors fixed in `paper.test.ts` / `attempt-actions.test.ts` (test code only); EA007-EA009 added to the message test |

### Rules enforced (in the database)
Caller from `auth.uid()` only (no user id parameter); student role; attempt must be the caller's (missing and someone else's look the same, EA005); attempt must be effectively open at that moment (not submitted, not past `expires_at`, no grace period); assessment still published, course published, student enrolled, window open; question must belong to the attempt's assessment (EA008); answer must match the question type, one key only, option ids must belong to the question, length caps 500 / 10000 (EA009); one row per (attempt, question) by unique constraint; the highest client revision wins, so repeats and late older requests are harmless no-ops (`applied: false`); clearing stores NULL so a late older save cannot bring the answer back; a SHARE lock on the attempt versus `submit_attempt`'s FOR UPDATE means a save either counts or is refused. A trigger repeats the open / deadline / membership checks even for the table owner.

### What was actually run (all real unless stated)
Environment: Node 22.22, npm registry reachable this time, local PostgreSQL 16.15 (plain Postgres plus the repo's Supabase stand-in `local_supabase_stub.sql`, NOT Supabase).

| Check | Result |
|---|---|
| `npm ci` | OK (428 packages) |
| Baseline before changes: `npx vitest run` | 777 passed / 39 files |
| Baseline: migrations 1-13 + seed on local Postgres | applied cleanly |
| Baseline: `attempts_rls_checks.sql`, `question_delivery_checks.sql`, `assessment_rls_checks.sql` | 110 / 63 / 85 PASS |
| Baseline: `npm run typecheck` | 4 errors (Phase C test files; fixed in this phase) |
| Migration 14 on a fresh local DB | applied (after fixing one plpgsql syntax error found by the first run) |
| `answer_saving_checks.sql` | **120 PASS, 0 fail** |
| SQL mutation test: 12 deliberate breakages of the migration | all caught (the question-membership check in the function is also covered by the trigger, so it was only caught after both layers were removed) |
| `answers_concurrency_check.sh 12` (12 parallel sessions, 6 submit-race rounds, ~4,800 saves per round) | **ALL PASSED**. The first version of the race test never actually raced (the loop ran inside one transaction); fixed, and the script now fails if no round has both accepted and refused saves |
| `npx tsc --noEmit` (whole project) | **0 errors** |
| `npx vitest run` | **817 passed / 40 files** (777 baseline + 3 message cases + 37 new) |
| Engine mutation test: 3 breakages (stale resend, in-flight guard, closed handling) | all caught by the new tests |
| `npm run lint` | **No ESLint warnings or errors** |
| `npm run build` | **FAILED for an environmental reason only:** the sandbox cannot fetch `Plus Jakarta Sans` from Google Fonts. The app was not compiled by this command, so the production build is **UNVERIFIED** (not failing because of code, not proven passing) |

### NOT verified
- Migration 14 has not been run on a real Supabase project (real JWTs, PostgREST, real `rpc()` shapes). The local Postgres uses a stand-in `auth.uid()`.
- No browser test of anything (there is no UI for this phase).
- The server actions were tested against a mocked Supabase client only.
- `npm run build`, see above.
- Unsaved answers live in memory only: closing the tab with unsaved answers loses them. Phase E should warn using `hasUnsaved()` and call `flush()` before submitting.

### Behaviour worth knowing
- There is no grace period: a save that arrives after `expires_at` is refused.
- `get_attempt_answers` works only for an open attempt (like the paper). Showing answers after submission belongs to the results phase.
- C2's `get_attempt_paper` marks an overdue attempt expired and then raises; the exception rolls that update back. Harmless (effective status is computed everywhere and the sweeper does the marking). Phase D's helper does not try.
- Two browser tabs on the same attempt: the tab that edited last wins; a stale tab re-sends its newest edit with a higher revision (at most 3 times per edit, then it takes the stored answer).
- Unresolved, carried over: migrations 13 and 14 not applied to Supabase; owner questions Q1-Q5; ASM-3; ASM-8; no teacher / admin attempt views; no rate limiting; syntax error in `supabase/proposed/phase3_5_scoring_PROPOSAL.sql`; stray `src/app/tutorials/[lessonId]/page (4).tsx`.

### How to verify properly
```bash
npm ci && npx vitest run && npm run typecheck && npm run lint && npm run build   # build needs internet for Google Fonts
PGUSER=<superuser> supabase/tests/support/apply_local.sh eac_dev                   # local scratch Postgres only
psql -X -q -v ON_ERROR_STOP=1 -d eac_dev -f supabase/tests/answer_saving_checks.sql
PGDATABASE=eac_dev supabase/tests/answers_concurrency_check.sh 12
```
On a **scratch** Supabase project: apply migrations 1-14, run the two SQL scripts' checks, then call the two actions as a real student.

### Next phase
**Phase E - exam interface and submission** (waiting for your instruction). Uses `AnswerAutosaver`, `saveAnswerAction`, `getAttemptAnswersAction`; must `flush()` before submit.

---

## Phase C5 — Question delivery verification (C1-C4). STATUS: VERIFIED BY READING + STAND-IN RUNNER ONLY. NOT RUN AGAINST SUPABASE, NO REAL vitest / tsc / lint / build

**Date:** 2026-10-19. **Scope:** verify the question-delivery feature only (migration 13 `get_attempt_paper`, `getAttemptPaperAction`, the C3 safe-question layer, the C4 student page section). Fix only defects in that feature. **Not built (by design):** answer saving, autosave, scoring, Start button, results. **No migration, no SQL change, no new route.**

### Result in one line
No defect was found in the delivery code or SQL by code review. **One defect was found and fixed in a test** (below). Nothing could be proven against a real database or with the project's own toolchain in this environment.

### Defect found and fixed
| # | Defect | Fix |
|---|---|---|
| C5-1 | `paper-view.test.ts` (added in C4) contained the literal names `SERVICE_ROLE`, `service_role`, `serviceRole` inside its own regex. `attempt-actions.test.ts` has a repo-wide scan that fails on any file under `src/` containing those names, so the full suite would fail under real vitest. C4 never ran `attempt-actions.test.ts`, so it was missed. Found by running it in the stand-in runner. | `paper-view.test.ts`: the pattern is now built from string fragments (test-only change; no production code touched). |

### Checklist (what each item rests on)
| # | Item | Evidence | Kind |
|---|---|---|---|
| 1 | Unauthenticated user cannot retrieve questions | action returns the fixed "sign in" refusal and makes no rpc; SQL raises 42501 when `auth.uid()` is null; function executable by `authenticated` only (revoked from `public`, `anon`) | mocked tests + static SQL read |
| 2 | Student cannot read another student's questions | ownership is part of the lookup (`t.user_id = v_uid`); someone else's id and a missing id both give EA005 and the same fixed text; the client sends only an attempt id (extra fields such as a user id are stripped by the schema) | mocked tests + static SQL read |
| 3 | Invalid / unauthorized attempt | malformed ids rejected before any rpc; EA005 / EA007 mapped to fixed messages | mocked tests |
| 4 | Draft and unavailable assessments | function re-checks enrolment, published assessment, published course, opens_at / closes_at and effective attempt status at call time; EA001 / EA002 / EA003 / EA007 map to fixed messages and return no content | mocked tests + static SQL read. The SQL behaviour itself is exercised only by `supabase/tests/question_delivery_checks.sql`, which was **not run** |
| 5 | Only the authorised assessment's questions | SQL filters `q.assessment_id = v_row.assessment_id` and options by `o.question_id = q.id`; the view rejects a paper whose assessment or attempt does not match, and a paper with duplicate question ids | mocked tests + static SQL read |
| 6 | No answers or grading keys to students | SQL payload is an explicit `jsonb_build_object` field list and never reads `question_answer_keys` / `question_correct_options`; TypeScript rejects the whole paper on any extra key; second deep scan for restricted key names; server reads only `profiles` (for the role) | mocked tests + static SQL read + rendered HTML check |
| 7 | Nested options and other types do not leak | leaked flags inside an option, options smuggled onto true/false, and 7 question-level leak names each turn the whole view into an error with no question text | mocked tests |
| 8 | Failures reveal nothing sensitive | five hostile database errors (missing relation, connection failure, JWT, duplicate key, permission denied) and thrown errors all produce only the fixed generic text; raw message is never read | mocked tests |
| 9 | Teacher authoring still works | **Partly checked.** Authoring code (`actions.ts`, `data.ts`, `validation.ts`, `types.ts`, editor components) is unchanged in C4 / C5. Teacher policies on the question tables are untouched by migration 13 (verified by reading). The teacher preview path (`publish.ts` + `publish.test.ts`, 10 tests) passes in the stand-in runner. `actions.test.ts` and `validation.test.ts` were **NOT run** (they need the real `zod`). No live teacher create / edit / publish was performed | partial |
| 10 | RLS and server authorization agree | static test reads every migration in order and computes the policies that remain on the four question / key tables: all are staff-only, none uses a student helper; no migration grants anon anything on them; every error code the function raises has its own fixed student message | static test (a text read of SQL, **not** a database run) |

The static tests were mutation-checked: removing a policy drop, adding a key-table read to the function, and removing the anon revoke each made a test fail; the files were restored and diffed identical. (One test was too loose at first, matched the same line in another migration, and was tightened.)

### Changed and added files
| Path | Change |
|---|---|
| `src/lib/assessments/paper-view.test.ts` | CHANGED (test only): forbidden-names regex built from fragments (C5-1) |
| `src/lib/assessments/question-delivery-verification.test.ts` | NEW, 49 tests (mocked action chain + static SQL agreement) |
| `BUILD_STATUS.md` | this section |
No production source, migration or SQL test file was changed.

### Commands actually run and their results
Environment: sandbox, Node 22.22, **npm registry unreachable** (`npm ci` and `npm install` both died with "Exit handler never called" and left empty package folders, which were deleted). `vitest`, `next`, `eslint`, `zod`, `@supabase/ssr`, `@types/react` and `@types/node` are not installed. A global TypeScript 6.0.3, `tsx`, `react` and `react-dom` exist.

| Command / check | Result |
|---|---|
| `npm ci`, `npm install` | **FAILED** (registry unreachable) |
| `npx vitest run` | **NOT RUN** (vitest not installable) |
| `npm run typecheck` (`tsc --noEmit`, whole project) | **NOT RUN** (react, next, zod, supabase types missing) |
| `npm run lint` (`next lint`) | **NOT RUN** (eslint / next not installable) |
| `npm run build` (`next build`) | **NOT RUN** |
| Partial strict `tsc` (global 6.0.3, scratch tsconfig, `noUncheckedIndexedAccess`) on `student-question.ts`, `paper.ts`, `paper-view.ts`, `attempts.ts`, `attempt-actions.ts`, `publish.ts`, `types/app.ts` with stand-in declarations for the missing packages | **No errors in those files.** 8 errors, all in `src/lib/supabase/env.ts` and `server.ts` (missing `@supabase/ssr`, `next/headers`, `@types/node`). Components (`.tsx`) were **not** typechecked |
| Stand-in runner (a ~100-line shim for `describe/it/expect/vi` with lazy `vi.mock`, a minimal `zod` stub and a `@/` alias, run with `tsx`; scratch files outside the project; **not vitest**) on 8 files: `student-question` 120, `paper` 17, `paper-view` 24, `publish` 10, `attempts` 41, `availability` 7, `attempt-actions` 76, `question-delivery-verification` 49 | **344 passed, 0 failed** |
| Same runner on `actions.test.ts`, `validation.test.ts` | **Could not load** (zod stub has no `.datetime()`): **NOT RUN** |
| The other 29 test files in the repo (forum, practicals, etc.) | **NOT RUN** |
| Server render of the real `QuestionPaper` component with `react-dom/server` (5 question types, scratch script) | All option texts and answering instructions present; no `<input>`, `<textarea>` or restricted word in the HTML |
| Postgres / Supabase | **NOT AVAILABLE.** No SQL was executed. `question_delivery_checks.sql` (63 checks) and `assessment_rls_checks.sql` were **not run**. **No live Supabase verification of any kind was performed** |

### Known limitations and unresolved issues
- **Migration 13 (`20261025000001_phase_c2_question_delivery.sql`) has still not been applied to or run on any database.** The function has never executed; a SQL error in it would only appear on a real database. This is the largest open risk.
- No real-toolchain run exists for C2-C5: `vitest`, whole-project `tsc`, `next lint`, `next build` are all still outstanding (stand-in results are not equivalent).
- No browser check of the student page (layout, Suspense fallback, error and retry states, mobile, accessibility, dev-tools check that the HTML / RSC payload has no keys).
- Teacher authoring (item 9) was not exercised end to end; two of its test files were not run.
- Student SELECT on `assessments` still returns instructions and rules by design; this is not question content.
- Carried over unchanged: owner questions Q1-Q5, ASM-3, ASM-8, no teacher / admin attempt views, no rate limiting, the syntax error in `supabase/proposed/phase3_5_scoring_PROPOSAL.sql`, the stray `src/app/tutorials/[lessonId]/page (4).tsx`.
- The Start button is still disabled, so the paper is reachable only for a student who already has an open attempt created outside the UI.

### How to verify properly
```bash
npm ci && npx vitest run && npm run typecheck && npm run lint && npm run build
```
Then, on a **scratch** Supabase project only: apply migrations 1-13 and the seed, run `supabase/tests/question_delivery_checks.sql` and `supabase/tests/assessment_rls_checks.sql`, create an open attempt for a test student with `start_assessment_attempt`, sign in as that student and open `/dashboard/student/assessments/<id>`; in dev tools confirm the HTML and any RSC payload contain question and option text but no key, `is_correct`, explanation or accepted answers. Also sign in as a second student and a teacher and confirm they cannot see that paper.

### Phase C final status
**Phase C (question delivery, C1-C5): code complete and reviewed, verified only with mocks, static SQL reads and a stand-in runner. Not verified live. Do not treat as production-ready until the real toolchain and a scratch-Supabase run have passed.**

### Next main phase
**Phase D — Answer Saving and Autosave.** (This replaces the "Phase C5" described in the C4 section's "Next phase", which listed answer saving; C5 turned out to be this verification.) Phase D scope: `attempt_answers` table and a `save_attempt_answer` function with the same server-confirmed ownership, status, enrolment and window checks; turn the option list into real inputs; autosave with retry; Start enabled with one `requestKey` per click; submission with answers. Scoring and results come after Phase D. **Before starting Phase D:** run the real toolchain and apply migration 13 to a scratch Supabase project.

---

## Phase C4 — Student question delivery integration (existing page + server components). WRITTEN AND VERIFIED ONLY WITH MOCKS AND A STAND-IN RUNNER; NOT RUN AGAINST SUPABASE, NOT RENDERED IN A BROWSER

**Date:** 2026-10-19. **Scope:** show the questions of a student's own open attempt on the existing student assessment page, using `getOpenAttemptAction` then `getAttemptPaperAction` (Phases B / C2) and the safe `StudentQuestion` shapes (Phase C3). **Not built (by design):** answer saving, timers / countdown, submission, scoring, Start button, results. **No migration, no SQL change, no new route.**

### Changed and added files

| Item | Path | Change |
|---|---|---|
| Existing student page (no new page) | `src/app/dashboard/student/assessments/[id]/page.tsx` | CHANGED: for an **open** assessment mounts `<Suspense fallback={<PaperSkeleton/>}><AttemptPaperSection/></Suspense>` below the existing grid; Start button stays **disabled**; the note under it reworded ("Starting an attempt from this page is not switched on yet. If you already have an open attempt, its questions are shown below."). Nothing is mounted for upcoming or closed assessments. |
| Flow / view logic (pure, actions injected) | `src/lib/assessments/paper-view.ts` | NEW: `loadPaperView` (open attempt first; paper only if one exists; paper must match that attempt and assessment; thrown errors become the generic message), `answerInstruction` (exhaustive over the 5 types), `optionLabel`, `marksLabel` |
| Server component: loading / error / empty / ready | `src/components/assessments/attempt-paper-section.tsx` | NEW: `AttemptPaperSection` (async, server) and `PaperSkeleton`. Error state = existing `Alert` + retry; empty = existing `EmptyState` |
| Server component: question display | `src/components/assessments/question-paper.tsx` | NEW: ordered list, number, text, marks, optional image (`referrerPolicy="no-referrer"`), instruction, options as a plain lettered list (not inputs, because answers cannot be saved yet), True / False labels |
| Retry | `src/components/assessments/retry-button.tsx` | NEW: the **only** client component; no props; `router.refresh()` inside `useTransition` (re-runs the server render, which asks the server again) |
| Tests | `src/lib/assessments/paper-view.test.ts` | NEW, 24 tests |
| Docs | this section, `README.md` | |

Unchanged: `attempt-actions.ts`, `paper.ts`, `student-question.ts`, all migrations, the teacher editor and authoring code, the student assessment list page. Existing design-system components only (`Card`, `Alert`, `EmptyState`, `Skeleton`, `Button`, `DashboardShell`); same Tailwind tokens as the teacher student-preview.

### How it works

1. Page (server) loads the assessment as before; if `availability === "open"` it mounts the section inside `Suspense` (loading state = skeleton).
2. `AttemptPaperSection` (server) calls `getOpenAttemptAction({assessmentId})`. The server confirms the open attempt belongs to the signed-in student. No open attempt -> renders nothing.
3. Only then `getAttemptPaperAction({attemptId})` -> database function `get_attempt_paper` re-checks ownership, status, enrolment and window and returns the allow-listed fields -> `mapAttemptPaper` (Phase C3) rejects anything off the allow-list.
4. The result is rendered to **HTML on the server**. Because no component in the path is a client component and the only client component takes no props, the paper is **not** in React client state, page props or the RSC payload as data for client components. The student necessarily receives the question text and option text in the HTML (that is the purpose); they never receive keys, flags or explanations because those are not in the data at any step.
5. Error: fixed student-safe message + "Try again". Empty: "No questions to show". Order: the array order from the server (`position`), never re-sorted; a mis-ordered paper is rejected upstream.

### What was actually run

Environment: local sandbox, Node 22.22, **no npm registry access**, so the real `vitest`, `tsc`, `next lint`, `next build` and React could not be installed or run. **All results below are MOCKED / stand-in; none touches Supabase.**

| Check | Kind | Result |
|---|---|---|
| `paper-view.test.ts` (24): access order (paper never requested without a confirmed open attempt; called with exactly `{attemptId}`, no user id); five types in order with text, marks, options; mis-ordered paper rejected; wrong attempt / assessment rejected; empty / error / malformed / thrown-error views; thrown text never leaks; retry (second call succeeds); 5 leaked-field payloads (question-level and option-level) produce an error view with no content; ready view has no restricted key; source-text checks (paper components are server components with no hooks / storage / fetch; retry button has no props; no key-table / key-field / service-role / teacher-data-layer reference; no save / submit / start / timer code; Start still disabled; paper only mounted when open; no duplicate student assessment page) | **MOCKED** (fake actions that use the real Phase C3 mapper) + static source reads, run in the stand-in runner (Node type stripping + a small `vitest` shim, scratch files outside the project; `zod` stubbed) | **24 passed, 0 failed** |
| Whole assessment unit set run in the same runner (`paper-view` 24, `student-question` 120, `paper` 17, `publish` 10) | stand-in | **171 passed, 0 failed** |
| Mutation checks (code broken in a scratch copy, tests re-run): paper requested with no attempt; attempt / assessment mismatch check removed; catch returns the thrown text; empty paper shown as ready; paper component made `"use client"`; hook added to the section; `setInterval` added; page gating on `open` removed | stand-in | **8 of 8 caught**; files restored |

### NOT verified

- **Real `vitest`, `npm run typecheck`, `npm run lint`, `npm run build` were NOT run.** The new `.tsx` files and the page edit were **never compiled or rendered**; types and JSX were checked by reading only. `attempt-actions.test.ts` and the other test files were not run in this phase (Phase B total 35 files / 540 tests not reproduced).
- **No real Supabase integration**: migration 13 (`get_attempt_paper`) is still not applied to any project; real JWTs, PostgREST and the real `rpc()` shapes were not exercised. The mocked actions stand in for them.
- **No rendered HTML or browser check**: no React is installed here, so there is no test of the actual markup, the Suspense fallback, the error Alert, the retry button, mobile layout or accessibility. A DOM / render test was deliberately not added because it could not be run and the repo's vitest setup (`include: src/**/*.test.ts`, `jsx: preserve`) has no JSX transform for tests.
- **Network responses**: the claim "no keys in network responses" rests on the server/DB allow-list plus the C3 mapper and the mocked tests; it was not checked with browser dev tools against a live app.

### Behaviour worth knowing

- **The feature is not reachable by normal use yet.** Start is still disabled and nothing in the UI creates an attempt, so questions appear only for a student who already has an open attempt (for example one created through `start_assessment_attempt` in a scratch project). Enabling Start was **not** done: with no answer saving, no submit button and no countdown, a student who started would burn an attempt (limits and expiry apply) with no way to answer or finish. Start belongs with the answer-saving / submission phase.
- Retry re-runs the whole server render, so it also re-checks the attempt lookup. An attempt that has expired or been submitted shows "This attempt is no longer open." with a retry button that will keep showing the same message; an acceptable cost of keeping the error text fixed.
- The page may show "Questions: 3" from the count function while the paper below shows 3 questions; both come from the database, no extra count logic was added.
- Options are shown as a plain list, not radio buttons / checkboxes, so students are not invited to select something that cannot be saved.
- Images use a plain `<img>` (`no-referrer`, lazy); no UI sets `image_url` yet (owner question Q3 still open).

### Unresolved issues / still open

Unchanged from Phase C3 / C2 (migration 13 not applied anywhere; owner questions Q1-Q5; ASM-3, ASM-8; no teacher / admin attempt views; rate limiting; the `phase3_5_scoring_PROPOSAL.sql` syntax error; the stray `src/app/tutorials/[lessonId]/page (4).tsx`), plus: real test / typecheck / lint / build run still outstanding, and no browser check of the new UI.

### How to verify properly

```bash
npm ci && npx vitest run && npm run typecheck && npm run lint && npm run build
```
Then, on a **scratch** Supabase project: apply migrations 1-13 and `seed.sql`, run `supabase/tests/question_delivery_checks.sql`, create an open attempt for a test student (`select start_assessment_attempt(...)` as that student), sign in, open `/dashboard/student/assessments/<id>` and check in dev tools that the HTML and any RSC payload contain the question and option text and no key, `is_correct`, `explanation` or accepted answers.

### Next phase

**Phase C5**: answer saving (`attempt_answers` and a `save_attempt_answer` function with the same server-confirmed ownership checks), turning the option list into real inputs, a server-driven countdown, enabling Start with one `requestKey` per click, and submission with answers. Scoring and results follow after that. First: a real `npm ci` run of the full suite and a scratch-Supabase run of migration 13.

---

## Phase C3 — Safe question response layer (TypeScript only; no migration, no SQL change). WRITTEN AND LOCALLY TESTED WITH A STAND-IN RUNNER, REAL vitest / tsc / lint / build NOT RUN

**Date:** 2026-10-19. **Scope:** one explicit, per-type response shape for the question a student receives, built field by field, plus a deep restricted-key scan as a second gate. **Not built (by design):** scoring, answer saving, results, exam page, feedback-release logic. The database wire format of `get_attempt_paper` is unchanged, so there is **no new migration** (still 13 migrations, #13 still not applied to any Supabase project).

### What was added or changed

| Item | Path | Change |
|---|---|---|
| Safe response layer | `src/lib/assessments/student-question.ts` | NEW. `StudentQuestion` is now a discriminated union: `SingleChoiceQuestion` / `MultipleSelectQuestion` (have `options: {id, text}[]`), `TrueFalseQuestion` / `ShortAnswerQuestion` / `DescriptiveQuestion` (**no `options` property at all**). `STUDENT_QUESTION_FIELDS` is the explicit allow-list per type. `mapStudentQuestion` builds the object from named fields and returns `null` on any extra / missing key, unsupported type, bad value, options on a non-choice question, empty or duplicate-id options. `questionFromEditor` builds the same shape from a teacher `EditorQuestion` by picking named fields (never a spread). `findRestrictedKeys` (deep, array- and cycle-safe, key names only) and `isStudentSafe` are a second gate. |
| Paper mapper | `src/lib/assessments/paper.ts` | CHANGED: per-question mapping delegated to `mapStudentQuestion`; after mapping, `isStudentSafe(questions)` must pass or the whole paper is `null`. `StudentQuestion` is re-exported, so existing imports keep working. Top-level / attempt / assessment key checks unchanged. |
| Teacher preview | `src/lib/assessments/publish.ts` | CHANGED: `toPreviewQuestions` now goes through `questionFromEditor`. Output shape (`PreviewQuestion`) unchanged, except options are `[]` for non-choice types and an unsupported type is skipped. |
| Tests | `src/lib/assessments/student-question.test.ts` | NEW, 120 tests (see below). `paper.test.ts` and `publish.test.ts` are unchanged and still pass. |
| Docs | this section, `README.md` (short Phase C3 note) | |

**Teacher / authoring paths were not touched:** `data.ts`, `actions.ts`, `EditorQuestion`, `types.ts`, the question editor, the key tables and their RLS are unchanged. A test asserts the teacher's `EditorQuestion` is not mutated and keeps `isCorrect` / `explanation` after being passed through the safe layer.

### Feedback-release rules

**No feedback-release setting exists in any applied migration** (`results_release`, `show_question_feedback` appear only in the unapplied `supabase/proposed/phase3_5_scoring_PROPOSAL.sql`). With no configured rule, the safe reading is "not released": no student question shape has an explanation, feedback or correctness field, and a test asserts an `explanation` key (even `""` or `null`) is rejected. When release rules are built, they must add a separate gated shape in the results phase, not a field on these shapes.

### What was actually run

Environment: local sandbox, Node 22.22, **no network to the npm registry** (`npm ci` died with "Exit handler never called" and installed neither `vitest` nor `typescript`). **No PostgreSQL / Supabase was used in this phase (no SQL changed).**

| Check | Result |
|---|---|
| Stand-in runner (NOT vitest; scratch files outside the project: Node type stripping + a ~40-line `vitest` shim; `zod` stubbed because it was not installed) on `student-question.test.ts` + `paper.test.ts` + `publish.test.ts` | **147 passed, 0 failed** (`student-question` 120, `paper` 17, `publish` 10) |
| Mutation checks on the safe layer (source broken in a scratch copy, then tests re-run) | **5 of 6 caught**: option extra-key check removed (17 fail); non-choice options allowed (2 fail); editor builder spreads the whole question (1 fails); question extra-key check removed (63 fail); unsupported-type check removed (1 fails, after a test for it was added). The 6th, removing the final `isStudentSafe` gate in `paper.ts`, survives: it is a deliberately redundant second layer that the first layer already makes unreachable. `isStudentSafe` itself is tested directly. Files restored and diffed identical after each. |

**What the new tests cover:** exact field set per type (5 types); `options` present only on choice types; text, marks, position, image and option order preserved; 12 restricted field names rejected on each of the 5 types; 7 restricted option-level fields rejected on both choice types (nested option data), a leak on only the last option, non-object and duplicate-id options, options smuggled onto non-choice types; 24 malformed / unsupported inputs (null, wrong types, unknown / numeric / `__proto__` type, bad marks, position, http / javascript image, missing options) return `null` without throwing; whole-paper rejection if any of the five types, or any option inside, leaks; deep key scan (paths, arrays, circular, no false positive on the word "correct" in question text); teacher `EditorQuestion` -> preview drops every key and nested `isCorrect`, skips unsupported types, and is not mutated.

### NOT verified

- **Real `vitest`, `npm run typecheck`, `npm run lint`, `npm run build` were NOT run.** The numbers above come from the stand-in runner. TypeScript types in the new and changed files were **only reviewed by reading**, not compiled. Run `npm ci && npx vitest run && npm run typecheck && npm run lint` before relying on this phase.
- `attempt-actions.test.ts` (uses `vi.mock`) and the other ~32 test files were **not run** in this phase; the Phase B total (35 files / 540 tests) was not reproduced. `attempt-actions.ts` is unchanged, but it imports `paper.ts`, which changed.
- No live Supabase, no browser.

### Behaviour worth knowing

- The client type for non-choice questions no longer has an `options` field (before, it was `[]`). No page consumes `AttemptPaper` yet, so nothing broke; the future exam page must narrow on `type` before reading `options`.
- `findRestrictedKeys` scans key names only, never question or option text, so a question that says "choose the correct answer" is fine. Its pattern is broad on purpose (`correct`, `accepted`, `explanation`, `rubric`, `score`, `feedback`, ...): a future legitimate student field with such a name would be rejected and need a deliberate allow-list change.
- `src/app/tutorials/[lessonId]/page (4).tsx` is a stray duplicate file already present in Phase C2; left untouched.

### Unresolved issues / still open

Unchanged from Phase C2 (migration 13 not applied anywhere; owner questions Q1-Q5; ASM-3, ASM-8; no teacher / admin attempt views; rate limiting; the `phase3_5_scoring_PROPOSAL.sql` syntax error), plus: real test / typecheck / lint / build run still outstanding.

### How to reproduce

```bash
npm ci && npx vitest run src/lib/assessments && npm run typecheck && npm run lint
```

### Next phase

**Phase C4** (suggested): the student exam page that calls `getAttemptPaperAction` and renders each `StudentQuestion` by `type` (server-rendered, `force-dynamic`, server-driven countdown), and enabling Start with one `requestKey` per click. Answer saving (`attempt_answers`) and scoring follow after that. First: apply migration 13 to a scratch Supabase project and run the real `npm ci && vitest && typecheck && lint`.

---

## Phase C2 — Secure question retrieval (database function + server action only). WRITTEN AND LOCALLY TESTED, NOT APPLIED to any Supabase project

**Date:** 2026-10-19. **Scope:** one server-side path that returns the questions of an authorised attempt, plus closing the direct read path found in Phase C1 (R1). **Not built (by design):** exam page, answer saving, submission changes, scoring, explanations, shuffling. The Start button is still disabled; `submit_attempt` is unchanged.

### What was added or changed

| Item | Path | Change |
|---|---|---|
| Migration (13th, forward only) | `supabase/migrations/20261025000001_phase_c2_question_delivery.sql` | NEW: `get_attempt_paper(uuid)`, `get_assessment_question_count(uuid)`; drops policies `questions: students read when open` and `question_options: students read when open` |
| Rollback (one transaction, not destructive to data) | `supabase/rollbacks/20261025000001_phase_c2_question_delivery_rollback.sql` | NEW: drops the two functions, re-creates the two student policies verbatim (re-opens R1; header says so) |
| SQL checks (63 checks, one rolled-back transaction) | `supabase/tests/question_delivery_checks.sql` | NEW |
| Existing SQL check updated | `supabase/tests/assessment_rls_checks.sql` (l.320-322) | "enrolled student sees its questions / options" 4 / 2 rows -> **0 rows** (replaced by the two Phase C2 checks) |
| Pure validator | `src/lib/assessments/paper.ts` | NEW: `mapAttemptPaper`, `AttemptPaper`, `StudentQuestion`. Rejects the whole paper if any key is not on the allow-list |
| Server action | `src/lib/assessments/attempt-actions.ts` | ADDED `getAttemptPaperAction` (same `studentContext()` + zod + RPC pattern as the other actions) |
| Error wording | `src/lib/assessments/attempts.ts` | ADDED `EA007` -> "This attempt is no longer open." |
| Question count | `src/lib/assessments/student-data.ts` | CHANGED: direct `from("questions")` count replaced by `rpc("get_assessment_question_count")` (needed because the student read policy is gone); header comment updated |
| Unit tests | `src/lib/assessments/paper.test.ts` (NEW), `src/lib/assessments/attempt-actions.test.ts` (ADDED a describe block and one row in the shared authorisation table) | |
| Docs | this section, `README.md` (Phase C2 section; Phase 3 policies line marked superseded) | |

No exam page, no new route, no API route, no service-role key. `src/app/dashboard/student/assessments/[id]/page.tsx` is untouched (it still shows the count, now from the function).

### How it works (short)

`get_attempt_paper(p_attempt uuid) returns jsonb`, `SECURITY DEFINER`, `search_path = ''`, `execute` revoked from `public`/`anon`, granted to `authenticated`. It takes **only** the attempt id; the user is `auth.uid()`.
1. Not signed in, or role not `student` -> `42501`.
2. Attempt looked up with `id = p_attempt AND user_id = auth.uid()`. Missing, null and someone else's all give `EA005` with the same text.
3. An overdue open attempt is expired first (Phase B helper); status must then be `in_progress`, else `EA007` (submitted or expired: no content).
4. Access re-checked now: `is_enrolled_in_assessment` (published assessment, published course, enrolled) -> else `EA001`; `opens_at` in the future -> `EA002`; closed -> `EA003`.
5. Returns `{ attempt, assessment, questions }` built with `jsonb_build_object` from an explicit field list, only for `questions.assessment_id = attempt.assessment_id`, ordered by `questions.position` (options by `question_options.position`). Question fields: `id, position, type, text, image_url, marks, options[{id,text}]` (options only for `single_choice` / `multiple_select`). It does **not** read `question_answer_keys` or `question_correct_options`, does not use `to_jsonb`/`select *` for the payload, and does not say how many options are correct.
6. TypeScript: `getAttemptPaperAction` validates the id with zod, runs as the student's own session, calls the function, maps errors to fixed wording, and passes the result through `mapAttemptPaper`, which returns `null` (generic error, no content) on any extra, missing or malformed field, on a non-open attempt, a mismatched assessment id, duplicate ids, out-of-order positions or a non-https image.

### What was actually run

Environment: local sandbox, PostgreSQL 16.15 with the repo's Supabase stand-in (`supabase/tests/support/local_supabase_stub.sql`), Node 22. **Not Supabase.**

| Check | Result |
|---|---|
| Migrations 1-13 + `seed.sql` on a fresh database (`apply_local.sh`) | Apply in order, no errors |
| `question_delivery_checks.sql` | **63 PASS**, 0 failures |
| Older SQL scripts after migration 13: `rls_checks` / `assessment_rls_checks` / `attempts_rls_checks` / `forum_rls_checks` / `forum53` / `forum_reports` / `forum_moderation` | **19 / 85 / 110 / 42 / 23 / 22 / 33 PASS**, 0 failures (same counts as Phase B; `assessment_rls_checks` now asserts the student sees 0 questions/options) |
| `attempts_concurrency_check.sh 12` | **PASS** ("ALL CONCURRENCY CHECKS PASSED") |
| SQL mutation checks (migration deliberately broken in a scratch copy, then `question_delivery_checks.sql`) | **11 of 11 caught**: ownership filter removed; status check removed; enrolment check removed; student-role check removed; assessment filter removed; question ordering removed; option ordering removed; explanation added to payload; student policy kept; anon EXECUTE granted; window check removed |
| Rollback | Functions removed, both student policies restored; re-applying the migration works and the 63 checks pass again |
| TypeScript unit tests (**stand-in runner, NOT vitest**; see below) | `paper.test.ts`, `attempt-actions.test.ts`, `attempts.test.ts`: **134 passed, 0 failed** |
| TypeScript mutation checks | Mapper allow-list check disabled -> 4 tests fail; action forwarding a client user id -> 1 test fails (both caught; files restored) |
| Type check (global `tsc`, strict + `noUncheckedIndexedAccess`, on `paper.ts`, `attempts.ts`, `attempt-actions.ts`, `student-data.ts` and the two test files with stubbed `vitest`/Supabase modules) | **0 errors in the four source files.** The only messages were implicit-`any` in test callbacks and in `src/lib/supabase/server.ts`, caused by the stubs (the real `vitest`, `next` and `@supabase/ssr` types were not installed) |

**What the SQL checks cover** (answer to "focused tests"): valid access (all five question types, order and marks preserved, option order, exact key allow-lists, no key/explanation text anywhere in the JSON, only this assessment's questions, a second assessment and a second course isolated); invalid attempts (null, missing, wrong id, submitted, expired, overdue, wrong enrolment, un-enrolled student holding an attempt row, course unpublished / student unenrolled / window moved / window closed after start); cross-student access (another enrolled student gets `EA005` identical to a missing id; a teacher, an admin, a session with no user id and `anon` are all refused); direct table reads (student gets 0 rows from `questions`, `question_options` and both key tables; teacher and admin keep theirs); static properties (no key-table reference in the function body, one parameter, `SECURITY DEFINER`, empty `search_path`, grants).

### NOT verified

- **`npm ci` failed in this environment** (the npm registry is blocked by the sandbox proxy: `ENOTFOUND` / proxy `403`), so **real `vitest`, `npm run typecheck`, `npm run lint` and `npm run build` were NOT run**, and the Phase B totals (35 files / 540 tests) were **not reproduced**. The TypeScript numbers above come from a small stand-in runner I wrote in the scratchpad (not part of the project; it bundles the real test files with esbuild and supplies `describe/it/expect/vi.mock`). It ran only the three test files that import this phase's code; the other ~32 test files were not run in this phase. A real `npm ci && npx vitest run && npm run typecheck && npm run lint` is still required.
- **Live Supabase**: real JWTs, PostgREST and the exact `rpc()` result shape for a `jsonb` return (PostgREST returns the object as-is; the mapper also rejects arrays). Not run through a pooler.
- Browser, mobile, accessibility: nothing to test yet (no page).
- `student-data.ts` change (count via RPC) has no automated test of its own; it was only type-checked.

### Behaviour worth knowing

- **Expiry write is rolled back on `EA007`.** When an overdue attempt is requested, the function expires it and then raises `EA007`; the exception rolls back that write. The attempt still reads as `expired` (the effective status in `get_my_attempt`, `start`, `submit`) and is persisted by those, or by `expire_overdue_attempts()` once a `pg_cron` job exists. No content is ever returned. This is deliberate and covered by a check.
- **Retrieval is repeatable** while the attempt is open (resume after refresh). It writes nothing.
- **The count is still `null` outside the open window** (unchanged behaviour; owner question Q1 below).
- `get_my_attempt` still returns an un-enrolled student's own record (Phase B item 8); the paper function does its own enrolment check and does not rely on it.

### Unresolved issues / still open

1. **Migration 13 is not applied to any Supabase project.** Apply to a scratch project, run `question_delivery_checks.sql` (rolls back) and the Phase B scripts there, and record the output here. Applying it removes direct student reads of questions: nothing in the current UI needs them (the only student read was the count), but any out-of-repo client that read `questions` as a student will stop working.
2. **No page calls `getAttemptPaperAction` yet**, and Start is disabled. The exam page, answer saving (`attempt_answers`, `save_attempt_answer`), submission with answers, scoring and explanations are later phases.
3. Owner decisions from Phase C1 still open: Q1 count visibility before the window opens; Q2 whether finished attempts may ever re-read the paper (currently **no**: `EA007`); Q3 allowed image hosts (the paper returns `image_url` as stored; the page must use `referrerPolicy="no-referrer"`; no UI sets images yet); Q4 per-attempt shuffling (order is fixed by `position`); Q5 revoking direct SELECT on the two key tables (R9, defence in depth). Also: an expired attempt counts toward the attempt limit (Phase B).
4. `get_attempt_paper` returns all questions in one response. Fine for the schema's sizes (marks <= 1000, options <= 10, question text <= 5000 chars); no pagination.
5. Still open from earlier phases and not touched here: ASM-3 (teachers can change duration/limit/window/marks on a published assessment with attempts, which is why availability is re-checked on every call), ASM-8, no teacher/admin attempt views, other rollbacks without a transaction wrapper, rate limiting, the `phase3_5_scoring_PROPOSAL.sql` syntax error.

### How to reproduce locally

```bash
export PGUSER=<superuser>
supabase/tests/support/apply_local.sh eac_dev                         # stub + migrations 1-13 + seed (scratch Postgres only)
psql -v ON_ERROR_STOP=1 -q -d eac_dev -f supabase/tests/question_delivery_checks.sql
psql -v ON_ERROR_STOP=1 -q -d eac_dev -f supabase/tests/assessment_rls_checks.sql
psql -v ON_ERROR_STOP=1 -q -d eac_dev -f supabase/tests/attempts_rls_checks.sql
npm ci && npx vitest run && npm run typecheck && npm run lint
```
On a real Supabase **scratch** project: apply migration 13 in the SQL editor, then paste the check scripts (each rolls back).

### Next phase

**Phase C3** (suggested): the student exam page that calls `getAttemptPaperAction` (server-rendered, `force-dynamic`, server-driven countdown, no client-side paper fetch), and enabling Start with one `requestKey` per click. Answer saving (`attempt_answers`) and scoring follow. Before that, apply migration 13 to a scratch Supabase project and run a real `npm ci && vitest && typecheck && lint`.

---

## Phase C1 — Question delivery: schema and access audit (AUDIT ONLY; no application code, SQL, migration or config was changed)

> **Update:** findings R1, R2, R3, R4 and R6 were addressed in Phase C2 (above). R5, R7-R9 and the owner questions remain open.

**Date:** 2026-10-19. **Scope:** only how assessment questions, options and answer keys are stored, who can read them, and what must change to deliver them securely to a student who is taking an attempt. The Phase 6.1 audit and Phase B notes are not repeated; this builds on Phase B open item 1 (SEC-1 / ASM-1).

**Method and limits.** Static review of the SQL, TypeScript and tests listed below. **Nothing was executed**: no `npm ci`, typecheck, lint, vitest, build, no PostgreSQL, no Supabase, no browser. Every finding below is from reading code, not from a run. The one dynamic claim (a student can read questions over PostgREST) follows directly from the policy text quoted below, and is also asserted by the existing SQL checks (`assessment_rls_checks.sql` lines 320-321), but it was not re-run in this phase.

### 1. Verdict

- **Answer keys are stored securely.** Keys are in two separate staff-only tables with no student policy. `questions`, `question_options` and `assessments` contain no answer-bearing column (a static check in `assessment_rls_checks.sql` lines 101-112 asserts this).
- **Question content is NOT delivered securely.** Any enrolled student can read every question, option and image URL straight from the API for the whole open window, with no attempt, no timer and no attempt limit applied. Phase B protects attempts, not content.
- There is **no question-delivery code at all** yet: no function, server action, API route or page returns questions to a student. (`src/app/api/` does not exist.) So C2 can introduce the only student read path and close the direct one.

### 2. How questions are stored (exact)

All in `supabase/migrations/20261017000001_phase3_assessments.sql` (migration 4 of 12; the only migration that touches question tables).

| Table | Columns that matter | Student can read? |
|---|---|---|
| `public.questions` (l.64-78) | `id`, `assessment_id`, `question_type` (enum `single_choice, true_false, multiple_select, short_answer, descriptive`), `question_text` (1-5000), `image_url` (https only, <=1000, **no UI sets it yet**), `marks`, `position` (`unique (assessment_id, position)` deferrable) | **Yes**, policy l.633 `questions: students read when open` -> `is_assessment_open(assessment_id)` |
| `public.question_options` (l.80-89) | `id`, `question_id`, `option_text`, `position`; `unique (id, question_id)` | **Yes**, policy l.666 `question_options: students read when open` -> `is_question_open(question_id)` |
| `public.question_answer_keys` (l.92-103) | `question_id` PK, `correct_boolean`, `accepted_answers text[]`, `case_sensitive`, `explanation` | No. Only teacher-owner and admin policies (l.699-723). Zero rows for a student. |
| `public.question_correct_options` (l.106-113) | `(question_id, option_id)` composite FK to `question_options(id, question_id)` | No. Only teacher-owner and admin policies (l.728-752). |

Answer-key storage by type: `single_choice` / `multiple_select` -> rows in `question_correct_options`; `true_false` -> `question_answer_keys.correct_boolean`; `short_answer` -> `question_answer_keys.accepted_answers` + `case_sensitive`; `descriptive` -> no key (manual marking). `explanation` lives with the key on purpose (it usually reveals the answer).

Other facts relevant to delivery:
- Grants to `authenticated` on all four tables are broad table-level `SELECT` (l.573-590); **RLS policies are the only thing keeping students out of the key tables**. This is sound today (no student policy exists, and `assessment_rls_checks.sql` l.322-323 asserts zero rows) but is a single layer. See risk R9.
- Content is locked while published: write policies require `assessment_is_draft(...)` (l.641-661, l.674-694, l.703-752). Phase B's trigger `assessments_block_unpublish_with_attempts` (migration 12, l.387-405) stops a published assessment with attempts going back to draft, so questions and options cannot change under an existing attempt.
- Options are **replaced, not edited**: `writeAnswerData` deletes and re-inserts a question's options on every save (`src/lib/assessments/actions.ts` `writeAnswerData`, l.251-275), so option ids change on every draft save. This is only safe while no attempt references them, which the Phase B trigger guarantees; the answer-saving phase must not rely on option ids from a draft.
- There is no `attempt_answers` table in any applied migration. `supabase/proposed/phase3_3_attempts_PROPOSAL.sql` (l.38-) has one that is still usable, with the Phase B warning not to apply the rest of that file.

### 3. How questions are retrieved today (exact)

| Reader | File | What it reads | Student-safe? |
|---|---|---|---|
| Student assessment list | `src/lib/assessments/student-data.ts` `listStudentAssessments` (l.64-80) | `assessments` only (no questions) | Yes |
| Student assessment page | `student-data.ts` `getStudentAssessment` (l.81-102) | **Direct** `from("questions").select("id", {count, head})` when open, used for the "Questions" tile in `src/app/dashboard/student/assessments/[id]/page.tsx` l.78 | Count only, but it is the **only** student code that touches `questions`, and it depends on the student read policy that C2 must drop |
| Teacher editor | `src/lib/assessments/data.ts` `loadEditorQuestions` (l.120-) | Questions + options + **all key tables** | Staff only. Guarded by `fetchOwnedAssessment` ownership check (l.79-) and RLS. Not reachable by students. |
| Teacher actions | `src/lib/assessments/actions.ts` (500 lines) | Writes questions, options, keys; role check in `teacherContext` | Staff only |
| Teacher "student preview" | `src/components/assessments/student-preview.tsx` fed by `toPreviewQuestions` in `src/lib/assessments/publish.ts` l.51-58 | Strips keys client-side from `EditorQuestion` | Safe shape (`PreviewQuestion`, `types.ts` l.75-81) but **it is built from key-bearing data in the browser**; it must never be reused as the student delivery path |
| Attempts | `src/lib/assessments/attempt-actions.ts` + migration 12 functions | `assessment_attempts` only. `submit_attempt` reads no answers | n/a |

There are **no** API routes (`src/app/api` absent), no database function that returns questions, and no student page that renders them. `src/lib/assessments/types.ts` `PreviewQuestion` has no `imageUrl` and no `position`.

### 4. Security risks (ranked)

| ID | Severity | Risk | Where | Detail |
|---|---|---|---|---|
| **R1** | **High** | Questions readable with no attempt | migration 4 l.633-635, l.666-668 | Enrolled student calls `GET /rest/v1/questions` and `/question_options` directly. They get the whole paper before clicking Start, so the attempt limit, one-open-attempt rule and timer protect nothing about content. A student can also read it **after** exhausting attempts, or after their attempt expired, while the window is still open. Self-enrolment into a published course is allowed (`20261016000003_phase2_learning.sql` l.234-243), so "enrolled" is not a strong gate. |
| **R2** | High | No binding between a paper and an attempt | design gap | Nothing records or checks that questions were served to a specific, open, unexpired attempt of that student. Needed for fair timing and for the later answer-saving phase. |
| **R3** | Medium | Teachers and other non-student roles satisfy `is_enrolled_in_assessment` | migration 4 l.198-215 | It checks `enrollments` only, not role. A teacher enrolled in another teacher's published course can read that paper. Keys are not exposed (key policies need course ownership), but delivery must require the student role as `start_assessment_attempt` already does (migration 12 l.193). |
| **R4** | Medium | `get_my_attempt` returns an un-enrolled student's own record (already Phase B item 8) | migration 12 l.270-294 | The paper function must re-check enrolment, publication and window itself and not trust "attempt exists". |
| **R5** | Medium | Future `image_url` is an external hot-linked URL | migration 4 l.69-72; `next.config.mjs` has no CSP | Any https host is allowed. Rendered naively it leaks the student's IP/referrer to a third party and lets a teacher swap the image after publication. The column has no UI today, so it is currently unreachable; decide before C2 delivers it (see C2 step 8). |
| **R6** | Medium | A careless delivery function would leak keys | n/a (future) | If the paper function uses `to_jsonb(q)` / `select *`, a later column added to `questions` or `question_options` would be served automatically. Must be an explicit field allow-list. |
| **R7** | Medium | Caching of paper responses | `student/assessments/[id]/page.tsx` is `force-dynamic` (good) | If C2 adds a route handler or fetch, responses need `Cache-Control: no-store`; server actions (POST) and a `force-dynamic` RSC avoid this. Recommended: no API route. |
| **R8** | Low | Fixed question and option order | `position` only | No shuffling, so neighbours can compare papers. No setting exists to turn shuffling on. Owner decision (Q4). |
| **R9** | Low (defence in depth) | Key tables rely on RLS alone | migration 4 l.584-590 | `authenticated` holds table-level SELECT on the key tables; one accidental permissive policy would expose keys. Consider revoking SELECT from `authenticated` on the key tables and reading them in staff-only SECURITY DEFINER functions, or at least keep the static + policy checks as a required test. Not required for C2. |
| **R10** | Low | `is_assessment_open` runs per row in RLS | migration 4 l.218-251 | Performance only (called per question and per option). Disappears once the student policies are dropped; the paper function checks once. |
| **R11** | Info | Ownership/enrolment is checked correctly for staff screens | `data.ts` l.79-100 | `fetchOwnedAssessment` re-checks `courses.created_by`; nothing to change. |

**Not a risk (checked):** `question_answer_keys` and `question_correct_options` are unreadable by students and not selected by any student code; `student-preview.tsx` only accepts `PreviewQuestion`; `student-data.ts` never selects question text.

### 5. What must change to deliver questions securely

1. **Add one SECURITY DEFINER function as the only student read path** for question content, tied to an attempt.
2. **Drop the two student SELECT policies** (`questions: students read when open`, `question_options: students read when open`) in the same migration, so there is no second path.
3. **Replace the one direct student read** (`getStudentAssessment` question count) with a function-based count.
4. Add a server action + student page that call the function. Return a student-safe type with no key, correctness or explanation fields.
5. Update the existing SQL and unit tests that assert the old behaviour, and add new ones.
6. Answer keys stay staff-only throughout; explanations are for Phase D (post-submission) and are **not** part of C2.

### 6. Implementation plan for Phase C2 (not started)

**Migration** `supabase/migrations/20261025000001_phase_c2_question_delivery.sql` (13th; additive except the two policy drops) + rollback `supabase/rollbacks/20261025000001_phase_c2_question_delivery_rollback.sql` (same transaction wrapper as Phase B's; re-creates the two policies verbatim from migration 4 l.633-635 and l.666-668).

1. **`public.get_attempt_paper(p_attempt uuid) returns jsonb`**, `language plpgsql volatile security definer set search_path = ''`, `revoke all ... from public, anon`, `grant execute ... to authenticated`. Behaviour, in order:
   - `auth.uid()` required, else `42501`; role must be `student` (`public.current_user_role()`), else `42501` (closes R3).
   - Load the attempt `where id = p_attempt and user_id = auth.uid()`; missing or not yours -> `EA005` (same text, as in Phase B).
   - Call `expire_overdue_attempts(uid, assessment)` and re-read, so the **effective** status is used.
   - Status not `in_progress` (submitted or expired) -> new error `EA007` "This attempt is no longer open." No questions are returned for finished attempts (review is Phase D).
   - Re-check `is_enrolled_in_assessment(assessment_id)` (published assessment, published course, enrolled) -> else `EA001`; re-check the window with `is_assessment_open` -> else `EA003`. (Closes R4.)
   - Return an **explicit allow-list**, ordered by `position` (or a per-attempt order, see Q4): `{ attempt: {attempt_id, assessment_id, attempt_number, status, started_at, expires_at, server_now, seconds_remaining}, assessment: {id, title, instructions, total_marks, duration_minutes}, questions: [ {id, position, type, text, image_url, marks, options: [ {id, text} ] } ] }`. Options only for `single_choice` / `multiple_select`; `true_false`, `short_answer`, `descriptive` carry no options (the UI renders True/False itself). **Never** `select *`, never `to_jsonb(row)`, never join `question_answer_keys` or `question_correct_options` (closes R6). Do not return the number of correct options.
   - Reads no answer-key table. A SQL check will prove this by revoking nothing and by scanning the returned JSON keys.
2. **`public.get_assessment_question_count(p_assessment uuid) returns integer`** (SECURITY DEFINER, student role + `is_enrolled_in_assessment`, same open-window behaviour as today so the page does not change): replaces the direct `questions` count. Returns `null` outside the window, matching `StudentAssessment.questionCount`.
3. **Drop** policies `"questions: students read when open"` and `"question_options: students read when open"`. Keep every teacher/admin policy. Keep the table `SELECT` grants (teacher policies need them). After this, a student `select` on both tables returns zero rows.
4. **Optional, decide with Q5:** `alter table ... revoke select ... on question_answer_keys, question_correct_options from authenticated` with staff reads moved to functions. Larger change to `data.ts`; recommended as a separate hardening step, not in C2.
5. **TypeScript**
   - `src/lib/assessments/paper.ts` (new, pure): zod schema `attemptPaperSchema`, `mapAttemptPaper(raw)` that **rejects (returns null) any question or option object containing a key outside the allow-list** (so a future leak fails closed), `StudentQuestion` / `AttemptPaper` types (extend `PreviewQuestion` with `position`, `imageUrl`; do not reuse `EditorQuestion`).
   - `src/lib/assessments/attempt-actions.ts`: add `getAttemptPaperAction(input)` using the same `studentContext()` + `attemptIdSchema` + RPC pattern; map `EA007`.
   - `src/lib/assessments/attempts.ts`: add `EA007` to `attemptErrorMessage` (fixed wording).
   - `src/lib/assessments/student-data.ts`: replace the direct count with `rpc("get_assessment_question_count")`; update the header comment.
   - New server-rendered page `src/app/dashboard/student/assessments/[id]/attempt/[attemptId]/page.tsx` (`dynamic = "force-dynamic"`, `requireRole("student")`, uuid-validate both ids) that renders the paper read-only with a server-driven countdown from `seconds_remaining` / `server_now`. **No API route**; no client-side fetch of the paper (closes R7).
   - Do **not** enable the Start button in the same step unless the owner wants it; if enabled, it must generate one `requestKey` per click (Phase B item 9).
6. **Tests to update/add**
   - `supabase/tests/assessment_rls_checks.sql` l.320-321: change "enrolled student sees its questions/options" from 4 / 2 rows to **0 rows**; keep l.101-112 and l.322-323 as they are.
   - New `supabase/tests/question_delivery_checks.sql` (one rolled-back transaction, same helpers as `attempts_rls_checks.sql`): owner gets paper; other student, non-enrolled student, teacher, admin, anon each get `EA005`/`42501`/`EA001`; submitted and expired attempts get `EA007`; closed window -> `EA003`; draft or unpublished course -> `EA001`; the JSON contains **no** key from a deny-list (`correct`, `answer`, `explanation`, `accepted`, `case_sensitive`) and exactly the allow-listed keys; no `question_answer_keys`/`question_correct_options` rows leak even when a student writes a hostile `p_attempt`; direct `select` on `questions` and `question_options` returns 0 rows for an enrolled student; a mutation check (re-add the policy; add a column to the JSON) must make a check fail.
   - New `src/lib/assessments/paper.test.ts` and additions to `attempt-actions.test.ts` (mapper rejects extra keys, `EA007` wording, no service-role key, role guard).
   - Re-run all Phase B scripts (110 + concurrency) and the six older SQL scripts; they must still pass.
7. **Docs:** add the Phase C2 section to this file, update `README.md` "Phase 3 policies" l.215 (the line starting "**Students** read an assessment") (students no longer read questions directly) and the note in `supabase/proposed/phase3_3_attempts_PROPOSAL.sql`.
8. **`image_url`:** C2 delivers it as-is (https only, already DB-checked) but the paper page must render it with `referrerPolicy="no-referrer"`, `loading="lazy"`, an explicit `alt`, and `next.config.mjs` should get a `img-src` allow-list decision (Q3) before any UI lets a teacher set it.

**Out of C2 (later phases):** answer saving (`attempt_answers`, `save_attempt_answer`), scoring and result release, post-submission explanations, teacher attempt views, shuffling, `pg_cron` expiry.

### 7. Owner decisions needed before or during C2

- **Q1.** Should the question **count** stay hidden before the window opens (current behaviour) or be shown once the assessment is published? Default in this plan: keep current behaviour.
- **Q2.** Should a student who has used all attempts, or whose attempt expired, be able to see the questions again? Default: **no** (only an open attempt gets a paper).
- **Q3.** Allowed hosts for question images (or upload to a private bucket instead of free URLs).
- **Q4.** Shuffle questions/options per attempt? If yes, add `shuffle_questions` / `shuffle_options` booleans on `assessments` and a deterministic order seeded from the attempt id (no extra table).
- **Q5.** Revoke direct SELECT on the two key tables now or later (R9)?
- **Carried from Phase B:** an expired attempt still counts toward the limit; owner has not confirmed.

### 8. Files reviewed (all paths relative to `eacharya/`)

`supabase/migrations/20261017000001_phase3_assessments.sql`, `supabase/migrations/20261024000001_phase_b_assessment_attempts.sql`, `supabase/migrations/20261016000003_phase2_learning.sql` (enrolment policy), `supabase/proposed/phase3_3_attempts_PROPOSAL.sql`, `supabase/tests/assessment_rls_checks.sql`, `supabase/tests/attempts_rls_checks.sql`, `src/lib/assessments/{student-data,data,actions,attempts,attempt-actions,publish,types}.ts`, `src/app/dashboard/student/assessments/[id]/page.tsx`, `src/components/assessments/student-preview.tsx`, `src/types/app.ts`, `next.config.mjs`, `README.md`, `BUILD_STATUS.md`.

### 9. Next phase

**Phase C2** — implement section 6 (migration, rollback, SQL checks, server action, mapper, student paper page), applied first to a scratch database, with test output recorded here. Phase C1 changed only this file.

---

## Phase B — Secure assessment attempts (database + server actions only). WRITTEN AND LOCALLY TESTED, NOT APPLIED to any Supabase project

**Date:** 2026-10-19. **Scope:** start, resume, retrieve, status-only submit and server-side expiry of assessment attempts. **Not built (by design):** exam UI, question delivery, answer saving, scoring, results, teacher/admin attempt views.

> **About "Phase A".** The handoff refers to Phase A findings ASM-1 to ASM-10. The project ZIP supplied for this phase **does not contain that text**: `BUILD_STATUS.md` had no ASM entries. Phase B was therefore built from what *is* in the repo: the Phase 6.1 audit (SEC-1 etc.), the Task 3.1 schema, the Task 3.3 notes, `supabase/proposed/phase3_3_attempts_PROPOSAL.sql`, and the handoff text. ASM numbers below are quoted from the handoff and could not be cross-checked against the original audit.

### What was added

| Item | Path |
|---|---|
| Migration (12th, forward only) | `supabase/migrations/20261024000001_phase_b_assessment_attempts.sql` |
| Rollback (destructive; needs `set app.confirm_attempts_rollback = 'yes';`; one transaction) | `supabase/rollbacks/20261024000001_phase_b_assessment_attempts_rollback.sql` |
| SQL checks (110 checks, one rolled-back transaction) | `supabase/tests/attempts_rls_checks.sql` |
| Race test (parallel psql sessions; commits then removes its own `RACE` fixtures; scratch DB only) | `supabase/tests/attempts_concurrency_check.sh` |
| Local Supabase stand-in + applier (scratch Postgres only; refuses on a real Supabase) | `supabase/tests/support/local_supabase_stub.sql`, `apply_local.sh` |
| Server actions | `src/lib/assessments/attempt-actions.ts` |
| Pure helpers (schemas, result mapper, error wording) | `src/lib/assessments/attempts.ts` |
| Unit tests (90 tests) | `src/lib/assessments/attempts.test.ts`, `attempt-actions.test.ts` |
| Docs | this section, `README.md` (Phase B section), note at top of `supabase/proposed/phase3_3_attempts_PROPOSAL.sql` |

No existing migration, policy, table or page was modified. The existing student pages still show a disabled Start button.

### Design (short)

- Table `assessment_attempts` (`in_progress | submitted | expired`; `started_at`, `expires_at = least(now + duration, closes_at)`, `submitted_at`, `expired_at`, optional `request_key`). FK to `assessments` is `ON DELETE RESTRICT`.
- Students: SELECT own rows only. **No INSERT/UPDATE/DELETE grant and no write policy**, so the functions are the only write path. `anon`: nothing.
- A guard trigger makes identity, `started_at`, `expires_at` and `request_key` immutable and freezes finished attempts, even for the table owner.
- Unique indexes (independent of the lock): (assessment, user, attempt_number); one open attempt per (assessment, user); (user, request_key).
- Functions, all `SECURITY DEFINER`, `search_path = ''`, **none takes a user id** (they use `auth.uid()`):
  `start_assessment_attempt(assessment, request_key?)`, `get_my_attempt(id)`, `get_my_open_attempt(assessment)`, `submit_attempt(id)` (status only). Internal, not executable by app roles: `expire_overdue_attempts(user?, assessment?)`, `attempt_to_info`.
- `start`: student role required; per-student advisory transaction lock; idempotent on request key; closes overdue attempts; reuses `is_enrolled_in_assessment` and `is_assessment_open`; share-locks the assessment row so limit/duration/window cannot change mid-start; resumes an open attempt; enforces the limit (expired and submitted attempts both count); inserts with **database-clock** times (`clock_timestamp()`).
- All functions return `public.attempt_info` (`attempt_id, assessment_id, attempt_number, status, started_at, expires_at, submitted_at, server_now, seconds_remaining, resumed`). `status` is the *effective* status.
- Error codes: `42501` not signed in / not a student, `EA001` not available (missing, draft, unpublished course and not-enrolled give the **identical** message), `EA002` not open yet, `EA003` closed, `EA004` limit reached, `EA005` attempt missing or not yours (identical message), `EA006` request key reused for another assessment. The TypeScript layer maps codes to fixed wording; raw database text is never shown.
- Trigger on `assessments`: published -> draft is refused once attempts exist (otherwise the draft-only question-edit rules would let questions change under existing attempts).
- Server actions run as the signed-in student's session. **No service-role key is used or referenced** (a test scans `src/`).

### What was actually run (local sandbox: PostgreSQL 16.15 + a stand-in for Supabase `auth`/`storage`, Node 22; NOT Supabase)

| Check | Result |
|---|---|
| Migrations 1-12 + `seed.sql` on a fresh database | Apply in order, no errors |
| `attempts_rls_checks.sql` | **110 PASS**, 0 failures (also on a database with the seed loaded) |
| Existing SQL scripts after migration 12 (same DB) | `rls_checks` 19, `assessment_rls_checks` 85, `forum_rls_checks` 42, `forum53` 23, `forum_reports` 22, `forum_moderation` 33: **all PASS** |
| `attempts_concurrency_check.sh 12` | **PASS**: 12 parallel starts (no key / distinct keys / same key) -> exactly 1 attempt; limit 3 under 12 racing start+submit loops -> exactly 3 attempts numbered 1,2,3 (69 refusals with `EA004`, no unexpected errors); 5 students x 4 sessions -> 1 attempt each. Fixtures cleaned up (verified 0 leftovers) |
| Mutation checks (migration deliberately broken in a scratch copy) | **Caught** each time: ownership filter removed in `get_my_attempt`; limit `>=` -> `>`; expired attempts excluded from the limit count; student UPDATE grant added; advisory lock removed (race test fails: 11 raw `23505` errors, so the unique indexes still prevent over-limit rows but the lock is what makes the error clean) |
| Rollback | Unconfirmed: aborts, 0 objects dropped (checked under plain psql without `ON_ERROR_STOP`). Confirmed: all 10 attempt objects removed, existing assessments untouched. Re-apply works and the 110 checks pass again |
| `npm ci` | OK |
| `npx vitest run` | **35 files, 540 tests pass** (baseline before Phase B: 33 / 450) |
| `npm run typecheck`, `npm run lint` | Clean |

### NOT verified

- **Live Supabase**: real JWTs, PostgREST, and the exact `rpc()` result shape for composite returns. The mapper accepts an object or a one-element array, but this was only exercised with mocks.
- `npm run build` (not run; the known Google Fonts download problem in a sandbox), `npm audit`, any browser or mobile behaviour.
- The stand-in `auth.uid()` mimics Supabase; behaviour under the real `auth` schema, `authenticator` role and connection pooling (pgbouncer transaction mode) is untested. Advisory *transaction* locks are pooler-safe by design, but this was not run through a pooler.
- Clock-skew and `pg_cron` behaviour. No job is scheduled.

### Remaining limitations and open problems (priority order)

1. **SEC-1 / ASM-1 NOT fixed.** Any enrolled student can still read all questions and options straight from the API during the open window, with or without an attempt, so the timer and limit protect nothing about *content*. Before real students or an enabled Start button: add `get_attempt_paper(attempt)` (SECURITY DEFINER, no answer keys, re-checks enrolment/publication, attempt owner, not expired), drop the two student read policies on `questions` and `question_options`, update `student-data.ts` (question count) and the student-read expectations in `assessment_rls_checks.sql`. (Answer keys remain staff-only throughout.)
2. **Owner decision:** an expired attempt currently counts toward the attempt limit (a student who walks away from a timed exam loses that attempt). Confirm or change.
3. **Lazy expiry.** A direct table SELECT can show a stale `in_progress`; read through the functions. `expire_overdue_attempts()` is ready for a `pg_cron` job that was not created.
4. **ASM-3:** teachers can still edit duration, limit, window and marks on a published assessment that has attempts (stored deadlines do not move).
5. **ASM-8:** deleting a course or assessment that has attempts fails (RESTRICT). Needs a product decision.
6. **No teacher/admin read access** to attempts (they see 0 rows). A roster function (ASM-6) belongs to the grading phase.
7. `submit_attempt` is status-only. Phase D must extend it and keep the `attempt_info` return type. **Do not apply** the proposal file's `submit_attempt(uuid) returns timestamptz` or its `attempt_status`/`assessment_attempts` definitions on top of migration 12. Only `attempt_answers` and `save_attempt_answer` from that proposal remain useful.
8. `get_my_attempt` still returns an un-enrolled student's own record; paper delivery must re-check eligibility itself.
9. The UI must generate **one `requestKey` UUID per click** and reuse it on retries of that click.
10. Other rollbacks in `supabase/rollbacks/` lack the transaction wrapper and are unsafe under plain psql.
11. Still open from earlier audits: owner decisions (multiple-select rule, short-answer marking, which attempt counts, results release), no rate limiting (SEC-9), the `LIVE_SUPABASE_VERIFICATION.md` vs migration-status disagreement, and `proposed/phase3_5_scoring_PROPOSAL.sql` has a syntax error (`position` must be quoted in `get_my_result_detail`).

### How to reproduce locally

```bash
# scratch Postgres only (sandbox: apt-get install -y postgresql; service postgresql start; create a superuser role)
export PGUSER=<superuser>
supabase/tests/support/apply_local.sh eac_dev            # stub + migrations 1-12 + seed
psql -v ON_ERROR_STOP=1 -q -d eac_dev -f supabase/tests/attempts_rls_checks.sql
PGDATABASE=eac_dev supabase/tests/attempts_concurrency_check.sh 12
npm ci && npx vitest run && npm run typecheck && npm run lint
```
On a real Supabase **scratch** project: apply migration 12 from the SQL editor, then paste `attempts_rls_checks.sql` (it rolls back). Do not run the stub or the concurrency script there (the concurrency script commits and needs psql).

### Next phase

Phase C part 1: `get_attempt_paper` + dropping the student question read policies (item 1), with test updates. Then exam UI and answer saving (`attempt_answers`), then Phase D scoring. Before any of that, the owner should apply migration 12 to a scratch Supabase project, run both Phase B scripts there, and record the output here.

---

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

> **Update 2026-10-19:** the attempts table and start/resume/submit-status functions now exist as migration 12 (see the Phase B section at the top). The exam UI, answer saving and question delivery below are still not built.

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

## Phase F1 — Scoring and results database foundation (IMPLEMENTED IN CODE; NOT VERIFIED)

**Date:** 2026-10-19. **Scope:** add a migration for objective scoring, pending manual grading for short-answer/descriptive questions, results release settings, secure student result RPCs, and teacher/admin grading RPC. The existing `submit_attempt(uuid)` return contract (`public.attempt_info`) is preserved while scoring is invoked in the same transaction after a successful submission.

**Files added:** `supabase/migrations/20261027000001_phase_f1_scoring_results.sql`.

**Security design:** score/answer-key writes stay inside `SECURITY DEFINER` functions; student result retrieval is through ownership-checked functions and release rules; students have no RLS policy for direct result-table reads; teachers can read results for their own courses; answer keys and explanations are not returned by the result-detail function. `results_release` supports `immediate`, `after_close`, and `manual`; immediate is the migration default. Objective single-choice/multiple-select use exact-match scoring; true/false uses the stored boolean key. Short-answer and descriptive answers require manual grading.

**Important verification status:** this migration has NOT been applied to a database and has NOT been run against real Supabase or PostgreSQL in this task. SQL syntax, migration ordering, grants/RLS behavior, scoring correctness, concurrency, and integration with the E6 UI remain UNVERIFIED. Do not apply to production or enable real exams until scratch-project tests pass. Expired attempts are not automatically scored by the existing expiry path; this needs an explicit product decision/implementation. No Phase F student results page or teacher grading UI is included in F1.

**Next:** F2 — implement typed server actions and student results page using `get_my_results()` / `get_my_result_detail(uuid)`, with pending-review states and no answer-key leakage; then F3 — teacher grading UI and integration tests. Before that, run migration 15 on a disposable Supabase project and add SQL checks for unauthorized roles, release gating, exact-match scoring, pending manual grades, idempotent submission, and result-detail privacy.


## Phase F2 — Student Results Page. STATUS: IMPLEMENTED; INTEGRATION NOT VERIFIED

**Scope:** add a student-facing results page that consumes the Phase F1 `get_my_results()` database function. No schema or migration changes were made in F2.

### Implemented
- Added `/dashboard/student/results`, guarded by `requireRole("student")`.
- Results are fetched only through `supabase.rpc("get_my_results")`; the page does not query score tables directly.
- Shows assessment title, attempt number, submission time, release status, score, maximum marks, percentage when available, grading status, and released overall feedback.
- Hides score and feedback while the database function says results are not released.
- Clearly labels scores as provisional while manual grading remains pending.
- Includes honest empty and database-error states, without fabricated result data.
- Added a `My Results` student navigation link and icon.
- No direct client-side database access, answer keys, or privileged credentials added.

### Verification
- **Done:** reviewed Phase F1 migration function signature and used its `get_my_results()` RPC contract; source files and route added; project ZIP packaged.
- **NOT run:** TypeScript, lint, automated tests, production build, browser workflow, or live Supabase integration. Dependencies and database availability were not verified in this packaging step.
- **Live-verified:** none. F1 migration must exist and be tested on a scratch Supabase project before this page can return results.

### Manual checks
1. Student with no submissions sees the empty state.
2. Submitted attempt with immediate release shows the result.
3. Assessment configured for after-close/manual release hides scores until release conditions are met.
4. Pending written-answer grading is labelled provisional/pending review.
5. A student cannot access another student's results or score tables directly.
6. Missing F1 migration shows the friendly unavailable state.


## Phase F3 — Teacher Manual Grading. STATUS: IMPLEMENTED IN CODE; DATABASE/BUILD NOT VERIFIED

### Implemented
- Added `/dashboard/teacher/grading`, protected by the existing teacher-role guard.
- Added `get_teacher_grading_queue()` migration function. It returns submitted written answers and score status only for courses owned by the signed-in teacher (admins are permitted at database-function level). It does not return answer keys.
- Added grading UI for short-answer/descriptive responses, marks validation against maximum marks, optional feedback, pending/graded labels, and regrading.
- Saves grades only through the existing `grade_attempt_answer` SECURITY DEFINER function; the server action checks the current database role and validates input.
- Added the teacher navigation link `Submissions` to the grading queue.
- Failing database calls show a clear unavailable state rather than fabricated submissions.

### Verification
- ZIP integrity verified after packaging.
- TypeScript, lint, unit tests, production build, SQL execution, browser workflow, and live Supabase integration have NOT been run/verified in this packaging environment.
- New migration `20261028000001_phase_f3_teacher_grading_queue.sql` depends on Phase B, Phase D, and Phase F1. Apply/test on a scratch Supabase project only after reviewing migration order.
- Keep real assessment attempts disabled until all migrations, authorization, and end-to-end checks pass.

### Manual verification
1. Apply F1 then F3 migrations on a scratch project after prerequisite migrations.
2. As teacher A, verify queue includes only courses owned by teacher A.
3. As teacher B, verify teacher A's answers are not returned.
4. As a student, verify the route redirects and grading RPC rejects access.
5. Grade a written answer at 0, partial, and maximum marks; reject negative or excessive marks.
6. Verify final score updates only after all manually graded questions are complete, and student result release rules still apply.

## Phase G — Assessment Analytics and Controlled Result Release

**Status: IMPLEMENTED IN SOURCE; automated and live checks NOT VERIFIED.**

### Included
- Added teacher dashboard route `/dashboard/teacher/reports` with per-assessment attempt totals, submitted count, fully graded count, pending manual grading count, average final score, and maximum marks.
- Added `Assessment Reports` to teacher navigation.
- Added migration `20261029000001_phase_g_analytics_release.sql` with a staff-only, ownership-filtered analytics RPC and a server-authorized manual result-release RPC.
- Added a release control only for assessments configured with `results_release = 'manual'`. The database function rechecks the caller's role, assessment ownership, and release mode; repeated release is idempotent.
- Average score excludes pending-review attempts because `final_score` remains null until all required written questions are graded.
- Browser action returns a generic error rather than raw database details.

### Required verification before use
- Apply migrations in order to a scratch Supabase project, including F1, F3, then G.
- Run typecheck, lint, tests and production build; exercise analytics and manual release as an owning teacher, a non-owning teacher, a student, and an admin.
- Verify `get_my_results()` hides results before manual release and reveals them after release; verify `after_close` follows `closes_at` rather than assessment status.
- Confirm database schema names/types match the deployed Phase B/F1 migrations. No real Supabase migration or browser workflow was run while packaging this phase. Do not treat Phase G as live-verified.

## Phase H — Student Progress and Question Analytics. STATUS: IMPLEMENTED IN SOURCE; NOT LIVE-VERIFIED

- Added teacher analytics page at `/dashboard/teacher/analytics` with student progress by course, class/course progress summary, question-level response and score analysis, and pending-grading summary.
- Added `get_teacher_student_progress()` and `get_teacher_question_analysis()` security-definer RPCs in `supabase/migrations/20261030000001_phase_h_analytics.sql`. Both enforce authenticated teacher/admin role and teacher course ownership in the database.
- Added Assessment Analytics to teacher navigation.
- See `PHASE_H_IMPLEMENTATION_NOTES.md` and `PHASE_H_VERIFICATION_CHECKLIST.md`.
- ZIP integrity checked. Typecheck, lint, tests, build, migration application, browser and live Supabase verification NOT run. Do not claim production readiness until checklist passes on a scratch project.
- The grading queue now inserts a visible heading at each attempt boundary so questions are visually grouped by assessment/student attempt.


## Local verification follow-up — 2026-10-19
- Fixed the `GradingQueue.update` TypeScript state update by providing safe default `marks` and `feedback` values when a key has no existing state.
- Updated `paper-view.test.ts` integration assertions to reflect the implemented assessment architecture: data-loading components remain server-safe, while the interactive `QuestionPaper` client component owns autosave/submission/timer behaviour. Kept checks that those behaviours do not leak into the server page/data-loading files.
- Normalized discovered route paths to `/` before asserting the route list, fixing the Windows path-separator mismatch.
- Verification attempted in this environment: `npm test` could not start because `vitest` was not found on PATH (`node_modules` is incomplete); no test pass is claimed. `npm run build` was not run here because dependencies are incomplete. Run `npm ci` on the user's machine after closing processes that may lock `.node` files, then rerun tests/build.

## Phase 3 — assessment workflow verification (2026-10-21)

**Status: PREPARED; NOT LIVE-VERIFIED.**

- Added `src/lib/grading/actions.test.ts` for grade-input validation, auth/profile role checks, RPC argument allow-listing, feedback normalization, safe error mapping and post-success cache revalidation.
- Extended `src/lib/assessments/paper-view.test.ts` to assert the client paper flushes pending answer saves and checks the flush result before calling `submitAttemptAction`.
- Added `supabase/verification/phase3_assessment_workflow_checks.sql`, a read-only database report for required workflow objects, RLS/grants/policies, missing results for submitted attempts, score aggregate consistency, question-score row counts and result-release summaries.
- Added `PHASE3_ASSESSMENT_WORKFLOW_VERIFICATION.md` with the local command list and WF-01–WF-18 end-to-end test matrix.
- No live Supabase migration is executed by this phase. The new SQL report needs to be reviewed in the configured scratch/test project. Automated test/build status must reflect the commands actually run in the user's local environment; mocked unit tests and source checks do not establish real database/RLS correctness.

### Phase 3 verification performed in packaging environment

- `node node_modules/typescript/bin/tsc --noEmit`: **PASS**.
- Targeted ESLint on `src/lib/grading/actions.test.ts`, `src/lib/assessments/paper-view.test.ts`, and `src/lib/grading/actions.ts`: **PASS**.
- Vitest did not start: the mounted dependency tree lacks the optional native package `@rollup/rollup-linux-x64-gnu`. Therefore the test suite is **not run / not passed** in this environment.
- Live Supabase workflow checks, migrations, and browser E2E scenarios: **not run**.



## Phase 5 — NCERT-aligned Geography content integration (2026-10-21)

- Added `supabase/migrations/20261102000001_phase5_ncert_geography_content.sql`.
- Defines six book courses across Classes 9–12: Contemporary India I/II, Fundamentals of Physical Geography, India Physical Environment, Fundamentals of Human Geography, and India: People and Economy.
- Adds 50 chapter units and 100 lesson records (a study guide plus a practice worksheet per chapter), original eAcharya study notes/objectives, 50 per-chapter worksheet resources, official NCERT textbook links, and the official CIET audio-book catalogue link.
- Renames the four legacy placeholder course rows in place when possible to preserve course IDs and assessment references. Existing course unit/lesson IDs are reused by position. Back up data and review lesson-progress meaning before applying to a production database.
- Added a select-only RLS policy so authenticated teachers/admins can read published curriculum lesson content while preserving existing edit ownership rules.
- Updated course/tutorial descriptions and renamed the lesson tab to `Study notes / transcript`.
- Updated the seed's course slugs to canonical course slugs so a database reset does not re-create duplicate `[Sample]` courses. The starter quiz remains a sample assessment.
- Static SQL/content inventory checks were performed. Live Supabase migration, user-role access, full test suite and production build are not verified in this environment.
