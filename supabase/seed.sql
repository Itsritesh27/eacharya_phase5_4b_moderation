-- eAcharya seed data. Idempotent: safe to re-run. The Geography curriculum courses
-- use canonical slugs; the starter quiz remains explicitly labelled as sample assessment content.

-- ===============================================================
-- Phase 1: classes and subject
-- ===============================================================
insert into public.classes (grade, name, description) values
  (9,  'Class 9',  'Foundations of Geography'),
  (10, 'Class 10', 'Resources, Development and Environment'),
  (11, 'Class 11', 'Physical Geography and Earth Systems'),
  (12, 'Class 12', 'Human Geography and Contemporary Issues')
on conflict (grade) do update
  set name = excluded.name, description = excluded.description;

insert into public.subjects (name, slug, description) values
  ('Geography', 'geography', 'The study of the Earth, its landscapes, climates, people and environments.')
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

-- ===============================================================
-- Geography curriculum course references. Phase 5 migration supplies chapter content and resources.
-- ===============================================================
insert into public.courses (title, slug, description, class_id, subject_id, status)
select v.title, v.slug, v.description, c.id, s.id, 'published'
from (values
  (9,  'Class 9 Geography: Contemporary India I',
       'class-9-contemporary-india-i',
       'NCERT-aligned original study guides, practice worksheets and official textbook links.'),
  (10, 'Class 10 Geography: Contemporary India II',
       'class-10-contemporary-india-ii',
       'NCERT-aligned original study guides, practice worksheets and official textbook links.'),
  (11, 'Class 11 Geography: Fundamentals of Physical Geography',
       'class-11-fundamentals-physical-geography',
       'NCERT-aligned original study guides, practice worksheets and official textbook links.'),
  (12, 'Class 12 Geography: Fundamentals of Human Geography',
       'class-12-fundamentals-human-geography',
       'NCERT-aligned original study guides, practice worksheets and official textbook links.')
) as v(grade, title, slug, description)
join public.classes c on c.grade = v.grade
join public.subjects s on s.slug = 'geography'
on conflict (slug) do nothing;

-- Legacy placeholder seeding (no-ops when Phase 5 canonical course slugs are present)
insert into public.units (course_id, title, description, position)
select co.id, '[Sample] Unit ' || (p.pos + 1), 'SAMPLE CONTENT: placeholder unit.', p.pos
from public.courses co
cross join (values (0), (1)) as p(pos)
where co.slug like 'sample-%'
  and not exists (
    select 1 from public.units u where u.course_id = co.id and u.position = p.pos
  );

-- Legacy lesson seeding (no-ops when the canonical curriculum is present)
insert into public.lessons (unit_id, title, description, position, is_published)
select u.id, '[Sample] Lesson ' || (p.pos + 1), 'SAMPLE CONTENT: placeholder lesson.', p.pos, true
from public.units u
join public.courses co on co.id = u.course_id
cross join (values (0), (1)) as p(pos)
where co.slug like 'sample-%'
  and not exists (
    select 1 from public.lessons l where l.unit_id = u.id and l.position = p.pos
  );

-- Lesson content without a video, so the "no video yet" empty state is shown.
-- Teachers add a YouTube or direct https video URL in lesson_content.video_url.
insert into public.lesson_content (lesson_id, objectives, transcript)
select l.id,
  array[
    'SAMPLE: Describe the main idea of this lesson',
    'SAMPLE: Locate the topic on a map',
    'SAMPLE: Explain one example in your own words'
  ],
  'SAMPLE CONTENT: this is placeholder transcript text. Real transcripts are added by teachers.'
from public.lessons l
join public.units u on u.id = l.unit_id
join public.courses co on co.id = u.course_id
where co.slug like 'sample-%'
on conflict (lesson_id) do nothing;

-- Legacy placeholder study-note resource (no-op when canonical course slugs are present)
insert into public.resources (title, description, resource_type, course_id, topic, body, is_published)
select
  '[Sample] Study notes: ' || co.title,
  'SAMPLE CONTENT: placeholder study notes.',
  'notes', co.id, 'Sample topic',
  'SAMPLE CONTENT' || E'\n\n' || 'These are placeholder notes. Real notes are added by teachers.',
  true
from public.courses co
where co.slug like 'sample-%'
  and not exists (
    select 1 from public.resources r
    where r.course_id = co.id and r.title = '[Sample] Study notes: ' || co.title
  );

-- Official NCERT textbook portal link for the general e-Content catalogue.
insert into public.resources (title, description, resource_type, topic, external_url, is_published)
select
  'NCERT Textbook Portal',
  'Open the official NCERT textbook portal and verify the current edition and applicable annual syllabus.',
  'link', 'Textbooks', 'https://ncert.nic.in/textbook.php', true
where not exists (
  select 1 from public.resources where title = 'NCERT Textbook Portal'
);
-- ===============================================================
-- Starter practice assessment with examples of all question types.
-- This remains visibly labelled as a sample assessment so teachers can test the workflow.
-- Run as the database owner (SQL editor / seed). Idempotent: skipped if it already exists.
-- ===============================================================
do $$
declare
  v_course uuid;
  v_assessment uuid;
  v_q uuid;
  v_o1 uuid;
begin
  select id into v_course from public.courses where slug = 'class-9-contemporary-india-i';
  if v_course is null
     or exists (select 1 from public.assessments
                where course_id = v_course and title = '[Sample] Class 9 Geography quiz') then
    return;
  end if;

  -- Draft first: the publish check needs the questions to exist.
  insert into public.assessments
    (title, description, instructions, course_id, status, total_marks, passing_marks,
     duration_minutes, attempt_limit)
  values
    ('[Sample] Class 9 Geography quiz',
     'Starter practice assessment covering key Class 9 Geography concepts. Review against the current annual syllabus before assigning.',
     'Answer each question and review the explanation after results are released.',
     v_course, 'draft', 10, 4, 15, 3)
  returning id into v_assessment;

  -- 1. single choice (2 marks)
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (v_assessment, 'single_choice', 'SAMPLE: Which ocean lies to the south of India?', 2, 0)
  returning id into v_q;
  insert into public.question_options (question_id, option_text, position) values
    (v_q, 'Atlantic Ocean', 0), (v_q, 'Pacific Ocean', 2), (v_q, 'Arctic Ocean', 3);
  insert into public.question_options (question_id, option_text, position)
    values (v_q, 'Indian Ocean', 1) returning id into v_o1;
  insert into public.question_correct_options (question_id, option_id) values (v_q, v_o1);
  insert into public.question_answer_keys (question_id, explanation)
    values (v_q, 'SAMPLE: The Indian Ocean borders peninsular India to the south.');

  -- 2. true / false (1 mark)
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (v_assessment, 'true_false', 'SAMPLE: The Equator is at 0 degrees latitude.', 1, 1)
  returning id into v_q;
  insert into public.question_answer_keys (question_id, correct_boolean, explanation)
    values (v_q, true, 'SAMPLE: Latitude is measured from the Equator, which is 0 degrees.');

  -- 3. multiple select (2 marks)
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (v_assessment, 'multiple_select', 'SAMPLE: Select all the continents.', 2, 2)
  returning id into v_q;
  insert into public.question_options (question_id, option_text, position)
    values (v_q, 'Pacific', 2);
  insert into public.question_options (question_id, option_text, position)
    values (v_q, 'Asia', 0) returning id into v_o1;
  insert into public.question_correct_options (question_id, option_id) values (v_q, v_o1);
  insert into public.question_options (question_id, option_text, position)
    values (v_q, 'Africa', 1) returning id into v_o1;
  insert into public.question_correct_options (question_id, option_id) values (v_q, v_o1);
  insert into public.question_options (question_id, option_text, position)
    values (v_q, 'Antarctica', 3) returning id into v_o1;
  insert into public.question_correct_options (question_id, option_id) values (v_q, v_o1);

  -- 4. short answer (2 marks)
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (v_assessment, 'short_answer', 'SAMPLE: What is the imaginary line at 0 degrees latitude called?', 2, 3)
  returning id into v_q;
  insert into public.question_answer_keys (question_id, accepted_answers)
    values (v_q, array['equator', 'the equator']);

  -- 5. descriptive (3 marks, marked by hand)
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (v_assessment, 'descriptive',
          'In 3 to 4 sentences, explain how latitude can affect the climate of a place.', 3, 4);

  update public.assessments set status = 'published' where id = v_assessment;
end $$;
