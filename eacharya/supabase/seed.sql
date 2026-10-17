-- eAcharya seed data. Idempotent: safe to re-run. Never overwrites real data
-- (all sample rows use slugs starting with 'sample-' and titles starting with '[Sample]').

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
-- SAMPLE CONTENT (Phase 1 + 2): one published course per class.
-- Remove before launch:  delete from public.courses where slug like 'sample-%';
--                        delete from public.resources where title like '[Sample]%';
-- ===============================================================
insert into public.courses (title, slug, description, class_id, subject_id, status)
select v.title, v.slug, v.description, c.id, s.id, 'published'
from (values
  (9,  '[Sample] Class 9 Geography',
       'sample-class-9-geography',
       'SAMPLE CONTENT: placeholder course used to demonstrate the curriculum structure. Replace with real curriculum.'),
  (10, '[Sample] Class 10: Resources and Development',
       'sample-class-10-resources-development',
       'SAMPLE CONTENT: placeholder course for Class 10. Replace with real curriculum.'),
  (11, '[Sample] Class 11: Physical Geography',
       'sample-class-11-physical-geography',
       'SAMPLE CONTENT: placeholder course for Class 11. Replace with real curriculum.'),
  (12, '[Sample] Class 12: Human Geography',
       'sample-class-12-human-geography',
       'SAMPLE CONTENT: placeholder course for Class 12. Replace with real curriculum.')
) as v(grade, title, slug, description)
join public.classes c on c.grade = v.grade
join public.subjects s on s.slug = 'geography'
on conflict (slug) do nothing;

-- Two sample units per sample course
insert into public.units (course_id, title, description, position)
select co.id, '[Sample] Unit ' || (p.pos + 1), 'SAMPLE CONTENT: placeholder unit.', p.pos
from public.courses co
cross join (values (0), (1)) as p(pos)
where co.slug like 'sample-%'
  and not exists (
    select 1 from public.units u where u.course_id = co.id and u.position = p.pos
  );

-- Two published sample lessons per sample unit
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

-- Sample text-note resource per sample course
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

-- Sample external link (NCERT is the official textbook publisher)
insert into public.resources (title, description, resource_type, topic, external_url, is_published)
select
  '[Sample] NCERT textbooks (external site)',
  'SAMPLE CONTENT: link to the official NCERT website.',
  'link', 'Textbooks', 'https://ncert.nic.in/', true
where not exists (
  select 1 from public.resources where title = '[Sample] NCERT textbooks (external site)'
);

-- ===============================================================
-- SAMPLE CONTENT (Phase 3, Task 3.1): one published sample assessment with
-- one question of each type, on the Class 9 sample course.
-- Remove before launch:  delete from public.assessments where title like '[Sample]%';
-- (Also removed automatically if the sample course is deleted.)
-- Run as the database owner (SQL editor / seed). Created with no creator, so only
-- admins can edit it. Idempotent: skipped if it already exists.
-- ===============================================================
do $$
declare
  v_course uuid;
  v_assessment uuid;
  v_q uuid;
  v_o1 uuid;
begin
  select id into v_course from public.courses where slug = 'sample-class-9-geography';
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
     'SAMPLE CONTENT: placeholder quiz showing every question type. Replace with a real assessment.',
     'SAMPLE CONTENT: answer every question. This is not a real test.',
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
          'SAMPLE: In 3 to 4 sentences, explain how latitude affects the climate of a place.', 3, 4);

  update public.assessments set status = 'published' where id = v_assessment;
end $$;
