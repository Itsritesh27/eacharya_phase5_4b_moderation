# Phase G — Assessment Analytics and Controlled Result Release

## Files added
- `src/app/dashboard/teacher/reports/page.tsx`
- `src/components/reports/assessment-analytics.tsx`
- `src/lib/reports/actions.ts`
- `supabase/migrations/20261029000001_phase_g_analytics_release.sql`

## Files updated
- `src/components/dashboard/nav-config.ts`
- `src/components/dashboard/sidebar-nav.tsx`
- `BUILD_STATUS.md`

## Apply migration
Apply `supabase/migrations/20261029000001_phase_g_analytics_release.sql` only after the Phase B, Phase D, Phase F1 and Phase F3 schema is present. Review and test on a scratch Supabase project first.

## Expected behavior
- Teacher sees analytics only for assessments in courses they own. Admins are accepted by the SQL RPC, but the UI route currently requires the teacher role.
- Manual result release is available only when an assessment is configured for `manual` release. The database function rechecks role, ownership and release mode; UI restrictions are not the security boundary.
- Immediate release and after-close release remain governed by Phase F1's `results_visible()` function.
- Average score is based on final scores only; attempts awaiting manual grading are not included in the average.

## Not verified
No live Supabase migration, real account/role matrix, browser test, typecheck, lint, test suite, or production build was run as part of packaging. The ZIP integrity is checked separately; archive integrity is not a substitute for app/database verification.
