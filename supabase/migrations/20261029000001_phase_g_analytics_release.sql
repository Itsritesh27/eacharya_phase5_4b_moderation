-- eAcharya Phase G: teacher assessment analytics and controlled result release.
-- Depends on Phase B assessment attempts, Phase F1 scoring/results, and Phase F3 grading queue.
-- Apply to a scratch Supabase project and verify before production use.

create or replace function public.get_teacher_assessment_analytics()
returns table (
  assessment_id uuid,
  assessment_title text,
  course_title text,
  assessment_status text,
  results_release text,
  results_released_at timestamptz,
  closes_at timestamptz,
  total_attempts bigint,
  submitted_attempts bigint,
  graded_attempts bigint,
  pending_attempts bigint,
  average_score numeric,
  max_marks numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (public.is_admin() or public.current_user_role() = 'teacher') then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;
  return query
  select a.id, a.title::text, c.title::text, a.status::text,
         a.results_release::text, a.results_released_at, a.closes_at,
         count(t.id)::bigint,
         count(t.id) filter (where t.status = 'submitted')::bigint,
         count(r.attempt_id) filter (where r.grading_status = 'graded')::bigint,
         count(r.attempt_id) filter (where r.grading_status = 'pending_review')::bigint,
         round(avg(r.final_score), 2), max(r.max_marks)
  from public.assessments a
  join public.courses c on c.id = a.course_id
  left join public.assessment_attempts t on t.assessment_id = a.id
  left join public.attempt_results r on r.attempt_id = t.id
  where public.is_admin() or c.created_by = v_uid
  group by a.id, a.title, c.title, a.status, a.results_release, a.results_released_at, a.closes_at
  order by a.created_at desc;
end;
$$;
revoke all on function public.get_teacher_assessment_analytics() from public, anon;
grant execute on function public.get_teacher_assessment_analytics() to authenticated;

create or replace function public.release_assessment_results(p_assessment uuid)
returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_release public.results_release; v_released timestamptz;
begin
  if v_uid is null or not (public.is_admin() or public.current_user_role() = 'teacher') then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;
  select a.results_release, a.results_released_at into v_release, v_released
  from public.assessments a join public.courses c on c.id = a.course_id
  where a.id = p_assessment and (public.is_admin() or c.created_by = v_uid)
  for update of a;
  if not found then raise exception 'Assessment not found' using errcode = 'P0002'; end if;
  if v_release <> 'manual' then
    raise exception 'Only assessments configured for manual release can be released here' using errcode = '23514';
  end if;
  if v_released is null then
    update public.assessments set results_released_at = now() where id = p_assessment
      returning results_released_at into v_released;
  end if;
  return v_released;
end;
$$;
revoke all on function public.release_assessment_results(uuid) from public, anon;
grant execute on function public.release_assessment_results(uuid) to authenticated;
