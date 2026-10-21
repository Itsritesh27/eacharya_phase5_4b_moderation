-- PROPOSAL ONLY. NOT applied. UNTESTED (no PostgreSQL available when written).
-- Phase 3.6: teacher grading overview + assessment analytics.
-- DEPENDS ON, in order: phase3_3_attempts_PROPOSAL.sql, phase3_5_scoring_PROPOSAL.sql
-- (which already provides teacher read policies, attempt_results,
-- attempt_question_scores and grade_attempt_answer for the grading itself).
-- Adds read-only aggregate functions. No table changes. No student identities returned.

create or replace function public.can_manage_assessment_results(p_assessment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or (public.is_teacher_or_admin() and public.owns_assessment_course(p_assessment));
$$;
revoke all on function public.can_manage_assessment_results(uuid) from public, anon;
grant execute on function public.can_manage_assessment_results(uuid) to authenticated;

-- One row per assessment the caller may manage.
create or replace function public.teacher_grading_overview()
returns table (
  assessment_id uuid, title text, status public.assessment_status, course_title text,
  unit_title text, submissions bigint, pending_review bigint, graded bigint)
language sql stable security definer set search_path = '' as $$
  select a.id, a.title, a.status, c.title, u.title,
         count(t.id), count(r.attempt_id) filter (where r.grading_status = 'pending_review'),
         count(r.attempt_id) filter (where r.grading_status = 'graded')
  from public.assessments a
  join public.courses c on c.id = a.course_id
  left join public.units u on u.id = a.unit_id
  left join public.assessment_attempts t on t.assessment_id = a.id and t.status = 'submitted'
  left join public.attempt_results r on r.attempt_id = t.id
  where public.can_manage_assessment_results(a.id)
  group by a.id, c.title, u.title
  order by a.created_at desc;
$$;

-- Aggregates only. Finalized stats use graded results only; pending is counted separately.
-- Counts ATTEMPTS; with multiple attempts per student, "students submitted" counts distinct users.
create or replace function public.get_assessment_analytics(p_assessment uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_eligible bigint; v_max numeric;
begin
  if not public.can_manage_assessment_results(p_assessment) then
    raise exception 'Not found' using errcode = '42501';   -- same message as missing: no leak
  end if;
  select count(*) into v_eligible from public.enrollments e
    join public.assessments a on a.course_id = e.course_id where a.id = p_assessment;
  select total_marks into v_max from public.assessments where id = p_assessment;

  select jsonb_build_object(
    'eligible_students', v_eligible,                    -- current enrolments, not at-time
    'students_submitted', count(distinct t.user_id),
    'attempts_submitted', count(t.id),
    'pending_results', count(r.attempt_id) filter (where r.grading_status = 'pending_review'),
    'finalized_results', count(r.attempt_id) filter (where r.grading_status = 'graded'),
    'average', round(avg(r.final_score) filter (where r.grading_status = 'graded'), 2),
    'highest', max(r.final_score) filter (where r.grading_status = 'graded'),
    'lowest', min(r.final_score) filter (where r.grading_status = 'graded'),
    'max_marks', v_max,
    -- ten 10% bands of final_score / max_marks; 100% falls in the last band
    'distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('band', b, 'count', n) order by b), '[]')
      from (select least(floor(r2.final_score * 10 / r2.max_marks), 9)::int as b, count(*) as n
              from public.attempt_results r2
              join public.assessment_attempts t2 on t2.id = r2.attempt_id
             where t2.assessment_id = p_assessment and r2.grading_status = 'graded'
             group by 1) d),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'position', q.position, 'question_type', q.question_type,
        'scored_answers', s.n, 'pending_answers', s.p,
        'avg_percent', s.avg_pct) order by q.position), '[]')
      from public.questions q
      left join lateral (
        select count(*) filter (where qs.status <> 'pending_review') as n,
               count(*) filter (where qs.status = 'pending_review') as p,
               round(avg(qs.awarded_marks * 100 / qs.max_marks)
                     filter (where qs.status <> 'pending_review'), 1) as avg_pct
        from public.attempt_question_scores qs
        join public.assessment_attempts t3 on t3.id = qs.attempt_id
        where qs.question_id = q.id and t3.status = 'submitted') s on true
      where q.assessment_id = p_assessment)
  ) into v
  from public.assessment_attempts t
  left join public.attempt_results r on r.attempt_id = t.id
  where t.assessment_id = p_assessment and t.status = 'submitted';
  return v;
end $$;

do $$ declare f text; begin
  foreach f in array array['teacher_grading_overview()', 'get_assessment_analytics(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
