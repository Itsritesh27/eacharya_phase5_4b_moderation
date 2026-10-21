-- eAcharya fix: score_attempt read columns that do not exist on attempt_answers.
--
-- Root cause: Phase F1 (20261027000001) wrote score_attempt against attempt_answers.selected_option_ids and
-- attempt_answers.answer_boolean. The Phase D table (20261026000001) has only `answer jsonb`:
--   single_choice   {"option_id": "<uuid>"}
--   multiple_select {"option_ids": ["<uuid>", ...]}
--   true_false      {"value": true | false}
-- plpgsql resolves record fields at run time, so the migration applied cleanly but every submit of an attempt with a
-- choice or true/false answer raised 42703, rolling back submit_attempt (same transaction).
--
-- Change: CREATE OR REPLACE of score_attempt(uuid) only. Same signature, same SECURITY DEFINER, same search_path,
-- same scoring rules (exact match; multiple_select all-or-nothing; short/descriptive pending review; idempotent).
-- Only the way the student's answer is read from the jsonb changes. Grants are re-asserted (unchanged).
-- Not destructive; safe to re-run. Existing attempts stuck in 'submitted' without a result are scored the next time
-- the student (or a retry) calls submit_attempt, because submit_attempt re-calls score_attempt for submitted rows.

create or replace function public.score_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record; q record; ans record;
  v_has boolean; v_awarded numeric;
  v_obj numeric := 0; v_pend numeric := 0; v_max numeric := 0;
  v_correct uuid[]; v_selected uuid[]; v_key boolean;
begin
  select * into t from public.assessment_attempts
   where id = p_attempt and status = 'submitted' for update;
  if not found then raise exception 'Attempt is not submitted' using errcode = '23514'; end if;
  -- Idempotent: a second call (double submit, retry) changes nothing.
  if exists (select 1 from public.attempt_results where attempt_id = p_attempt) then return; end if;

  for q in select id, question_type, marks from public.questions
            where assessment_id = t.assessment_id order by position loop
    v_max := v_max + q.marks;

    if q.question_type in ('short_answer', 'descriptive') then
      insert into public.attempt_question_scores (attempt_id, question_id, max_marks, status)
      values (p_attempt, q.id, q.marks, 'pending_review');
      v_pend := v_pend + q.marks;
    else
      select * into ans from public.attempt_answers
       where attempt_id = p_attempt and question_id = q.id;
      -- A row whose answer is null means the student cleared it: same as unanswered.
      v_has := found and ans.answer is not null;
      v_awarded := 0;                      -- unanswered objective question = 0

      if v_has and q.question_type = 'single_choice' then
        select coalesce(array_agg(option_id order by option_id), '{}') into v_correct
          from public.question_correct_options where question_id = q.id;
        v_selected := case when jsonb_typeof(ans.answer -> 'option_id') = 'string'
                           then array[(ans.answer ->> 'option_id')::uuid] else '{}'::uuid[] end;
        if cardinality(v_selected) > 0 and cardinality(v_correct) > 0 and v_selected = v_correct then
          v_awarded := q.marks;
        end if;
      elsif v_has and q.question_type = 'multiple_select' then
        select coalesce(array_agg(option_id order by option_id), '{}') into v_correct
          from public.question_correct_options where question_id = q.id;
        v_selected := case when jsonb_typeof(ans.answer -> 'option_ids') = 'array'
                           then array(select distinct (e.value)::uuid
                                        from jsonb_array_elements_text(ans.answer -> 'option_ids') e(value)
                                       order by 1)
                           else '{}'::uuid[] end;
        -- all-or-nothing for multiple_select
        if cardinality(v_selected) > 0 and cardinality(v_correct) > 0 and v_selected = v_correct then
          v_awarded := q.marks;
        end if;
      elsif v_has and q.question_type = 'true_false' then
        select correct_boolean into v_key from public.question_answer_keys where question_id = q.id;
        if jsonb_typeof(ans.answer -> 'value') = 'boolean' and v_key is not null
           and (ans.answer ->> 'value')::boolean = v_key then
          v_awarded := q.marks;
        end if;
      end if;

      insert into public.attempt_question_scores
        (attempt_id, question_id, max_marks, awarded_marks, status)
      values (p_attempt, q.id, q.marks, v_awarded, 'auto_graded');
      v_obj := v_obj + v_awarded;
    end if;
  end loop;

  if v_max <= 0 then raise exception 'Assessment has no scorable marks' using errcode = '23514'; end if;

  insert into public.attempt_results
    (attempt_id, objective_marks, pending_marks, max_marks, grading_status, final_score, graded_at)
  values (p_attempt, v_obj, v_pend, v_max,
          case when v_pend = 0 then 'graded'::public.grading_status else 'pending_review' end,
          case when v_pend = 0 then v_obj end,
          case when v_pend = 0 then now() end);
end $$;

-- Internal only: students must never call scoring directly (submit_attempt calls it as the function owner).
revoke all on function public.score_attempt(uuid) from public, anon, authenticated;
