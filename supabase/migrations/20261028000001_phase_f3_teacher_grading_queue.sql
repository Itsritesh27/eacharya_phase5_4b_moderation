-- eAcharya Phase F3: teacher grading queue read function.
-- Depends on Phase B, Phase D, and Phase F1 migrations.
-- Apply to a scratch Supabase project first; do not enable live assessments until verified.

create or replace function public.get_teacher_grading_queue()
returns table (
  attempt_id uuid,
  assessment_id uuid,
  assessment_title text,
  attempt_number integer,
  submitted_at timestamptz,
  student_name text,
  question_id uuid,
  question_position integer,
  question_text text,
  question_type text,
  student_answer jsonb,
  max_marks numeric,
  awarded_marks numeric,
  score_status text,
  feedback text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (
    public.current_user_role() = 'teacher'
    or public.current_user_role() = 'admin'
  ) then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    a.id,
    a.title::text,
    t.attempt_number,
    t.submitted_at,
    coalesce(nullif(btrim(p.full_name), ''), 'Student')::text,
    q.id,
    q.position,
    q.question_text::text,
    q.question_type::text,
    ans.answer,
    qs.max_marks,
    qs.awarded_marks,
    qs.status::text,
    qs.feedback
  from public.assessment_attempts t
  join public.assessments a on a.id = t.assessment_id
  join public.courses c on c.id = a.course_id
  join public.profiles p on p.id = t.user_id
  join public.attempt_question_scores qs on qs.attempt_id = t.id
  join public.questions q on q.id = qs.question_id
  left join public.attempt_answers ans
    on ans.attempt_id = t.id and ans.question_id = q.id
  where t.status = 'submitted'
    and qs.status in ('pending_review', 'graded')
    and (public.is_admin() or (public.current_user_role() = 'teacher' and c.created_by = v_uid))
  order by t.submitted_at desc nulls last, a.title, t.attempt_number, q.position;
end;
$$;

revoke all on function public.get_teacher_grading_queue() from public, anon;
grant execute on function public.get_teacher_grading_queue() to authenticated;
