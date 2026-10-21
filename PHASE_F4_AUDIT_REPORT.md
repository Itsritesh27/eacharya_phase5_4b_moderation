# Phase F4 — End-to-End Verification

**Status: PREPARED; NOT LIVE-VERIFIED.** This package adds a read-only database verification script and an explicit manual test plan. It does not certify that the assessment lifecycle works in a real Supabase project.

## Source-level inventory

| Area | Present in project | Runtime verified |
|---|---|---|
| Student submit action calls `submit_attempt` | Yes | No |
| F1 scoring/results migration defines scoring and result RPCs | Yes | No |
| Student results page calls `get_my_results()` | Yes | No |
| Teacher grading page calls `get_teacher_grading_queue()` | Yes | No |
| Teacher grade action calls `grade_attempt_answer` | Yes | No |
| F3 grading-queue migration present | Yes | No |
| Student/teacher roles are checked in page/server action | Yes, source-level | No |
| SQL/RLS permissions on configured Supabase | Unknown | No |
| Complete browser assessment lifecycle | Unknown | No |

## Checks to run

1. Install dependencies with `npm ci` (or the project's documented package-manager equivalent).
2. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`; record the actual exit status and full error output.
3. In a **scratch Supabase project**, apply prerequisite migrations in the intended order: initial schema/auth/RLS, Phase B attempts, Phase D answer saving, Phase F1 scoring/results, then Phase F3 grading queue. Do not apply to production first.
4. Run `supabase/verification/phase_f4_read_only_checks.sql`. Confirm all required functions/tables exist; no `anon` execution on privileged functions; score tables are not directly readable by student `authenticated` users; and RLS is enabled where intended.
5. Test with separate accounts: teacher A, teacher B, student A, student B. Never use a student account to inspect privileged tables through the SQL editor.
6. Verify the lifecycle cases below and record evidence.

## End-to-end test matrix

- Objective-only attempt: submit once; objective marks are calculated once and stay unchanged on repeated submit.
- Mixed objective + written attempt: objective marks calculate; written items remain `pending_review`; final score does not misrepresent pending marks as zero/final.
- Manual grading: teacher A can grade only assessments in courses owned by teacher A; teacher B cannot grade A's submissions; students cannot call grading RPC.
- Mark boundaries: reject negative marks and marks above each question's maximum; accept zero, partial and maximum marks.
- Release policy: immediate results are visible only after submission; after-close results remain hidden before close; manual results remain hidden until explicitly released.
- Result privacy: student A cannot retrieve student B's results, question feedback or score; answer keys never appear in student RPC payloads.
- Failure/retry: network failure before submit; repeated submit; stale/expired attempt; save pending at submit; database RPC unavailable.
- UI: student results empty/error states; pending manual grading; teacher queue empty/error states; success/failure messages after grade save.

## Important limitations and risks

- These checks were not run against live Supabase and this package does not apply migrations.
- The `get_teacher_grading_queue()` function and F1 functions must be reviewed against the actual deployed schema and helper functions. SQL function existence alone does not prove correct permissions.
- Do not enable real assessment attempts until runtime tests, database grants/RLS review, and the complete browser workflow pass on a scratch project.
- No production deployment was performed.
