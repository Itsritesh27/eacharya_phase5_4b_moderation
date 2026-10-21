# Phase 2 — Advanced Assessment Analytics

## What's included

- Student progress by enrolled student and course: published assessment count, submitted attempts, graded attempts, pending attempts and average marks for fully graded attempts.
- Question-wise analysis: response count, pending/graded response count and average awarded marks as a percentage of maximum marks. Lower average percentages appear first.
- Both advanced sections are independent from the basic assessment summary. If an advanced RPC is not present in Supabase, the core assessment cards still render and the affected section shows a migration/setup message.
- A follow-up migration redefines Phase H analytics functions with safer question-to-attempt joins and consistent submitted-attempt filters.

## Apply the migration

In the Supabase SQL Editor, open and run:

`supabase/migrations/20261101000001_phase2_advanced_analytics.sql`

Run it using the correct project. Do not put service-role keys into frontend environment variables. The functions are `SECURITY DEFINER`, validate that the caller is a teacher/admin, and limit returned rows to courses owned by the teacher unless the caller is an admin. Run this after the project’s existing assessment, attempt, scoring/results and analytics-release migrations have been applied.

## Verify in the website

1. Log in with a teacher account.
2. Open `/dashboard/teacher/analytics`.
3. Confirm the basic assessment summary still renders.
4. Confirm Student Progress and Question-wise Analysis appear below it.
5. If either section shows its migration warning, check the exact migration was applied to the same Supabase project used by the app, then reload the page.

## Interpretation

- Student averages include fully graded attempts only.
- Submitted counts are attempt counts, so repeat attempts can exceed the number of published assessments.
- Question average percentage uses scored responses only; pending responses do not contribute awarded marks.
- These are descriptive metrics, not definitive measures of question validity or student ability.
