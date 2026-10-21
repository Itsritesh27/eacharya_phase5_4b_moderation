-- Phase H: teacher-facing student progress, question analysis and grading backlog.
-- Requires the Phase B/D/F1/F3/G migrations. Review on a scratch Supabase project first.
create or replace function public.get_teacher_student_progress()
returns table (student_id uuid, student_name text, course_title text, assessment_count bigint, submitted_count bigint, graded_count bigint, pending_count bigint, average_score numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
 if v_uid is null or not (public.is_admin() or public.current_user_role() = 'teacher') then raise exception 'Teacher access required' using errcode='42501'; end if;
 return query
 select p.id, coalesce(nullif(btrim(p.full_name),''), 'Student')::text, c.title::text,
 count(distinct a.id)::bigint, count(distinct t.id) filter (where t.status='submitted')::bigint,
 count(distinct r.attempt_id) filter (where r.grading_status='graded')::bigint,
 count(distinct r.attempt_id) filter (where r.grading_status='pending_review')::bigint,
 round(avg(r.final_score) filter (where r.grading_status='graded'),2)
 from public.profiles p
 join public.enrollments e on e.user_id=p.id
 join public.courses c on c.id=e.course_id
 left join public.assessments a on a.course_id=c.id and a.status='published'
 left join public.assessment_attempts t on t.assessment_id=a.id and t.user_id=p.id
 left join public.attempt_results r on r.attempt_id=t.id
 where p.role='student' and (public.is_admin() or c.created_by=v_uid)
 group by p.id,p.full_name,c.title
 order by c.title, coalesce(nullif(btrim(p.full_name),''),'Student');
end; $$;
revoke all on function public.get_teacher_student_progress() from public, anon;
grant execute on function public.get_teacher_student_progress() to authenticated;

create or replace function public.get_teacher_question_analysis()
returns table (assessment_id uuid, assessment_title text, question_id uuid, question_position integer, question_type text, question_excerpt text, max_marks numeric, answer_count bigint, pending_count bigint, graded_count bigint, average_awarded numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
 if v_uid is null or not (public.is_admin() or public.current_user_role() = 'teacher') then raise exception 'Teacher access required' using errcode='42501'; end if;
 return query
 select a.id,a.title::text,q.id,q.position,q.question_type::text,left(q.question_text,180)::text,q.marks,
 count(distinct s.attempt_id)::bigint,
 count(distinct s.attempt_id) filter (where s.status='pending_review')::bigint,
 count(distinct s.attempt_id) filter (where s.status in ('graded','auto_graded'))::bigint,
 round(avg(s.awarded_marks) filter (where s.awarded_marks is not null),2)
 from public.assessments a join public.courses c on c.id=a.course_id
 join public.questions q on q.assessment_id=a.id
 left join public.assessment_attempts t on t.assessment_id=a.id and t.status='submitted'
 left join public.attempt_question_scores s on s.attempt_id=t.id and s.question_id=q.id
 where (public.is_admin() or c.created_by=v_uid)
   and (a.status='published' or exists (
     select 1 from public.assessment_attempts submitted
     where submitted.assessment_id=a.id and submitted.status='submitted'
   ))
 group by a.id,a.title,q.id,q.position,q.question_type,q.question_text,q.marks
 order by a.title,q.position;
end; $$;
revoke all on function public.get_teacher_question_analysis() from public, anon;
grant execute on function public.get_teacher_question_analysis() to authenticated;
