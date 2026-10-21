# Phase 3 — Assessment workflow verification

**Purpose:** verify the full assessment lifecycle across the teacher UI, student UI, server actions and Supabase functions.

**Status:** verification plan and regression tests added; **not live-verified** against the configured Supabase project. Do not treat a successful local build or mocked test as proof that production RLS is correct.

## Automated regression coverage in this phase

- `src/lib/grading/actions.test.ts` covers validation before database access, teacher/admin role checks, refusal for unauthenticated or invalid-role callers, RPC argument allow-listing, feedback normalisation, safe error handling, and revalidation only after a successful grade save.
- `src/lib/assessments/paper-view.test.ts` asserts the assessment UI flushes pending autosaves and checks the flush result before calling the submit action.
- Existing assessment tests cover attempt start/resume, invalid input, attempt ownership, safe paper allow-listing, answer restore/save/revision handling, retry states, publish validation, results mapping and scoring-action errors.

## Local commands

Run from the repository root:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Save the terminal output and record each command's real exit status. If npm cannot reach its registry, report that as an environment/network blocker rather than a code test result.

## Scratch Supabase setup

1. Use a **scratch/test Supabase project**, not production.
2. Apply all prerequisite migrations in the documented order, including assessment attempts, question delivery, answer saving, scoring/results, teacher grading queue, analytics/release and the advanced analytics migration.
3. Run `supabase/verification/phase_f4_read_only_checks.sql` and `supabase/verification/phase3_assessment_workflow_checks.sql` from the SQL Editor. Read the results; these scripts are read-only.
4. Run the behaviour/security scripts in `supabase/tests/` as their headers instruct. They create fixtures only within a transaction and roll back when the script finishes.
5. Confirm the web app's `.env.local` points to the same scratch project. Never paste its key values into screenshots or chat.

## End-to-end test matrix

Use separate accounts for Teacher A, Teacher B, Student A and Student B. Enrol Student A in a published test course and create a fresh test assessment.

| ID | Scenario | Expected outcome | Evidence |
|---|---|---|---|
| WF-01 | Teacher creates a draft assessment | It appears only under an owned course; total marks equal question marks | Screenshot + assessment row |
| WF-02 | Publish without questions or with invalid answer key | Publish is refused with a useful message | UI message; status remains draft |
| WF-03 | Student not enrolled / assessment draft / assessment outside opening window | Start/paper access is refused without revealing whether an inaccessible assessment exists | Student browser + negative RPC check |
| WF-04 | Student starts an open assessment | One `in_progress` attempt exists; attempt number and official deadline come from the server | Attempt row |
| WF-05 | Student double-clicks start or retries with the same request key | Existing open attempt is resumed; no duplicate open attempt is created | Attempt rows/count |
| WF-06 | Student answers, reloads and resumes | Server-confirmed answers and revisions are restored | Browser screenshot + `attempt_answers` rows |
| WF-07 | Network interruption during autosave | The UI shows unsaved/retry state; submit is blocked until flush confirms all changes | Browser network/console + UI |
| WF-08 | Objective-only submission | Attempt is submitted once; result is created; repeated submit does not double-score | `assessment_attempts`, `attempt_results`, `attempt_question_scores` |
| WF-09 | Mixed objective and written submission | Objective questions are auto-graded; written questions are `pending_review`; final score remains null until all required manual grading is done | Result and score rows |
| WF-10 | Student A tries to open Student B's attempt/result details | No other student's result or question feedback is returned | Browser/RPC negative case |
| WF-11 | Teacher A opens grading queue for owned course | Only eligible submitted attempts in owned courses appear | Teacher A view + query output |
| WF-12 | Teacher B tries to grade Teacher A's response | Database rejects the operation; no score is changed | RPC error + unchanged score row |
| WF-13 | Teacher grades 0, partial and max marks | Valid marks save; negative or over-maximum marks are rejected | Before/after score rows |
| WF-14 | Last pending written response is graded | `pending_marks = 0`; grading status becomes `graded`; final score equals objective plus manual marks | `attempt_results` row |
| WF-15 | Immediate / after-close / manual release | Student sees result only according to that assessment's release policy | Student results before/after release |
| WF-16 | Unreleased question feedback | `get_my_result_detail` gives no feedback until both release and feedback settings permit it | RPC output |
| WF-17 | Timer/deadline expires while attempt is open | Server remains authoritative; expired attempts cannot continue saving or be submitted as successful | Attempt state + UI |
| WF-18 | Unexpected database/network error | UI displays a safe message; no raw SQL, IDs, or secrets leak | Console + network result |

## Database invariants to inspect

- Every submitted attempt should have an `attempt_results` row after scoring has successfully completed. Investigate any exception rather than manually patching rows.
- A fully graded result should have zero pending marks and a non-null final score.
- `objective_marks` should agree with the sum of auto-graded question scores.
- `max_marks` should agree with the sum of question maximum marks for that assessment.
- A student's direct table access must not reveal answer keys, correct options, another student's answers or score tables.
- `grade_attempt_answer` and all read RPCs must remain scoped to the authenticated role, caller, and owned course as applicable.

## Required sign-off before real student use

- [ ] Automated commands completed successfully locally.
- [ ] Prerequisite migrations and Phase 2 analytics migration applied in scratch project.
- [ ] Read-only database checks reviewed; no unexplained invariant failures.
- [ ] WF-01 through WF-18 tested with screenshots/query output saved.
- [ ] Student/teacher cross-account denial cases passed.
- [ ] `.env.local` and service credentials were not included in any shared archive.
- [ ] Netlify production environment and Auth redirects separately verified.

**Important:** no live Supabase migration is run by this package. Do not use these checks on production until the scratch-project run is clean.
