# Phase H verification checklist

- [ ] Confirm all prerequisite migrations are applied in order on a scratch Supabase project.
- [ ] Apply `20261030000001_phase_h_analytics.sql` and inspect any SQL errors.
- [ ] Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- [ ] Teacher A sees only courses they own; Teacher B cannot see Teacher A's student/course/question data.
- [ ] Admin access follows the existing `is_admin()` policy.
- [ ] Student/anonymous calls to both analytics RPCs are rejected.
- [ ] Verify no-attempt, no-question, and pending-manual-grading states render clearly.
- [ ] Compare analytics totals against known test rows, including multiple attempts per student.
- [ ] Verify question score averages exclude NULL/pending marks.
- [ ] Confirm the real Supabase project migration state before enabling this in production.
