-- Phase 5 verification checks: read-only queries.
-- Run AFTER applying 20261102000001_phase5_ncert_geography_content.sql.

-- Expected: 6 course rows.
SELECT c.title, cl.grade, count(DISTINCT u.id) AS chapter_units, count(DISTINCT l.id) AS lessons
FROM public.courses c
JOIN public.classes cl ON cl.id = c.class_id
LEFT JOIN public.units u ON u.course_id = c.id
LEFT JOIN public.lessons l ON l.unit_id = u.id AND l.is_published = true
WHERE c.slug IN (
  'class-9-contemporary-india-i',
  'class-10-contemporary-india-ii',
  'class-11-fundamentals-physical-geography',
  'class-11-india-physical-environment',
  'class-12-fundamentals-human-geography',
  'class-12-india-people-and-economy'
)
GROUP BY c.id, c.title, cl.grade
ORDER BY cl.grade, c.title;

-- Expected: 50 chapter worksheets; 6 official textbook links; 1 CIET link.
SELECT resource_type, topic, count(*) AS resource_count
FROM public.resources
WHERE title LIKE 'Practice worksheet: %'
   OR title LIKE 'Official NCERT textbook: %'
   OR title = 'NCERT/CIET Audio Books'
GROUP BY resource_type, topic
ORDER BY resource_type, topic;

-- Content row coverage. Expected: every published curriculum lesson has lesson_content.
SELECT count(*) AS published_curriculum_lessons,
       count(lc.lesson_id) AS lessons_with_content,
       count(*) FILTER (WHERE lc.lesson_id IS NULL) AS missing_content
FROM public.lessons l
JOIN public.units u ON u.id = l.unit_id
JOIN public.courses c ON c.id = u.course_id
LEFT JOIN public.lesson_content lc ON lc.lesson_id = l.id
WHERE c.slug IN (
  'class-9-contemporary-india-i',
  'class-10-contemporary-india-ii',
  'class-11-fundamentals-physical-geography',
  'class-11-india-physical-environment',
  'class-12-fundamentals-human-geography',
  'class-12-india-people-and-economy'
) AND l.is_published = true;
