# eAcharya: live Supabase verification record

**Date:** 2026-10-18
**Project:** eAcharya (Supabase project "eAcharya NEW", free plan; scratch/test, no real students)
**Recorded by:** project owner, from what they ran in the Supabase SQL Editor. Output screenshots/logs were not saved with this record.

## 1. Migrations applied (in order)

| # | File | Status |
|---|------|--------|
| 1 | `20261016000001_initial_schema.sql` | Applied |
| 2 | `20261016000002_auth_and_rls.sql` | Applied |
| 3 | `20261016000003_phase2_learning.sql` | Applied (a second run errored with `type "progress_status" already exists`, which only confirms it was already applied; nothing was changed) |
| 4 | `20261017000001_phase3_assessments.sql` | Applied |
| 5 | `20261018000001_phase5_2_forum.sql` | Applied |
| 6 | `20261019000001_phase5_3_forum_likes_bookmarks_search.sql` | Applied |
| 7 | `20261020000001_phase5_4a_forum_reports.sql` | Applied |
| 8 | `20261021000001_phase5_4b_forum_moderation.sql` | Applied |

Migration 9 (SEC-2 lock + SEC-3) is **not written yet**, so it is not applied.

## 2. Seed

- `supabase/seed.sql` run (classes 9-12, Geography, `[Sample]` courses/lessons/notes, one sample quiz).

## 3. RLS test scripts (`supabase/tests/`)

All six finished with no FAIL / no error, run one at a time in the SQL Editor.

| Script | Result | Notes |
|--------|--------|-------|
| `assessment_rls_checks.sql` | Passed | First attempt failed with `FAIL: admin reads all assessments (expected 1 rows, got 2)`. Cause: known TEST-1, the seeded `[Sample]` quiz counted by the script. Re-run with the fixed version (deletes `[Sample]%` assessments inside its own transaction; the final rollback restores them) and it passed. |
| `rls_checks.sql` | Passed | Needs seed; seed was loaded. |
| `forum_rls_checks.sql` | Passed | |
| `forum53_rls_checks.sql` | Passed | |
| `forum_reports_rls_checks.sql` | Passed | |
| `forum_moderation_rls_checks.sql` | Passed | |

## 4. Not yet verified

- Next.js app against this database: `npm run typecheck`, `npm run lint`, `npm test` (expect 30 files / 435 tests), `npm run dev`.
- Real sign-up, email confirmation, sign-in as student / teacher / admin.
- First admin promotion for `riteshrai.explore@gmail.com` (query prepared; confirm it was run).
- Supabase Storage, real login tokens (JWTs), Auth emails, browser/mobile/screen-reader checks, Netlify deployment.

## 5. Open items

- TEST-1: stock `assessment_rls_checks.sql` still fails after seeding; replace it in the repo with the fixed version.
- SEC-1, SEC-5, SEC-6 (open product decisions); SEC-2/SEC-3 (migration 9, not written); SEC-4 (CSP header).
- Before real launch: remove sample content, set up custom SMTP, add production URLs to Redirect URLs.
