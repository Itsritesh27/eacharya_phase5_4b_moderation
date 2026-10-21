# Phase H — Student Progress, Class Performance, Question Analysis, Pending Grading

## Included
- Teacher route: `/dashboard/teacher/analytics`.
- Student progress by course: published assessment count, submitted attempts, graded/pending results, average finalized score.
- Question-level analysis: question type, marks, response count, pending/graded score count and average awarded marks.
- Summary cards for student-course records, pending grading, and question rows.
- Teacher navigation entry.
- SQL migration `20261030000001_phase_h_analytics.sql` with two SECURITY DEFINER RPCs; both derive the caller from `auth.uid()`, require teacher/admin role, and restrict teacher results to courses they own.

## Migration order / caution
Requires the existing Phase B assessment attempts, Phase D answer saving, Phase F1 scoring/results, Phase F3 grading queue, and Phase G analytics/release migrations. Apply all prerequisite migrations first and test on a scratch Supabase project. The SQL assumes `profiles.full_name`, `enrollments.user_id`, `courses.created_by`, `assessments.status`, `questions.position`, and F1 scoring tables match the preceding migrations.

## Verification status
ZIP integrity was checked. TypeScript, lint, automated tests, production build, migration execution, browser workflow and live Supabase integration were not run here. Do not interpret packaging as proof that the database migration or UI works end-to-end. If the database is currently broken, diagnose and repair migration state before applying Phase H.
