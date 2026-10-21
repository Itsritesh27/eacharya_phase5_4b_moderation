# Phase 5 — NCERT-aligned Geography learning content

This phase adds a chapter-organised Geography curriculum for Classes 9–12 using the existing eAcharya courses, units, lessons, lesson_content and resources tables.

The study notes, learning objectives and practice tasks below are original eAcharya educational material. They are designed to support learning alongside the prescribed book; they are not copied textbook chapters and do not replace the current official CBSE syllabus or NCERT edition.

## Books and chapter collections

- **Class 9 Geography: Contemporary India I** — 6 chapter collections. [Open the official NCERT textbook page](https://ncert.nic.in/textbook.php?jess1=0-6).
- **Class 10 Geography: Contemporary India II** — 7 chapter collections. [Open the official NCERT textbook page](https://ncert.nic.in/textbook.php?jess2=0-7).
- **Class 11 Geography: Fundamentals of Physical Geography** — 14 chapter collections. [Open the official NCERT textbook page](https://ncert.nic.in/textbook.php?kegy2=0-14).
- **Class 11 Geography: India — Physical Environment** — 6 chapter collections. [Open the official NCERT textbook page](https://ncert.nic.in/textbook.php?kegy1=0-6).
- **Class 12 Geography: Fundamentals of Human Geography** — 8 chapter collections. [Open the official NCERT textbook page](https://ncert.nic.in/textbook.php?legy1=0-8).
- **Class 12 Geography: India — People and Economy** — 9 chapter collections. [Open the official NCERT textbook page](https://ncert.nic.in/textbook.php?legy2=0-9).

## What students get

- Chapter-wise study guide lessons with learning objectives and original explanations.
- A second lesson per chapter with short-answer prompts, map/data activities and a self-check routine.
- A worksheet resource attached to each chapter, visible from the lesson Resources tab and e-Content Library.
- A course-level official NCERT textbook link for reference. A separate CIET audio-books catalogue link supports accessibility where material is available.

## Apply the migration

1. Back up the Supabase project before applying schema/content changes.
2. In Supabase Dashboard → SQL Editor, run `supabase/migrations/20261102000001_phase5_ncert_geography_content.sql` as one complete script.
3. Existing four `[Sample]` course rows are renamed in place to preserve their course IDs and existing assessment references. Their unit and lesson IDs are reused and relabelled; review old lesson progress before applying this in a production system.
4. Two additional book courses are added for Class 11 India Physical Environment and Class 12 India: People and Economy.
5. Sign in as a teacher and a student. Students should enrol in a course before opening its lesson notes and tracking progress.

## Current boundaries

- No copyrighted textbook PDF or full textbook chapter text is bundled. Students are linked to the official NCERT portal.
- This migration does not invent video URLs; teachers can add verified HTTPS video sources through the existing teacher workflow.
- Chapter lists are aligned to commonly available NCERT book structures. Rationalised content and CBSE annual syllabus requirements can change, so confirm the current academic-year syllabus before formal teaching or assessment.
- The migration is idempotent for course/unit/lesson content and worksheet resources. It does not delete assessment attempts or alter marks.

## Official references

- NCERT Textbooks I–XII: https://ncert.nic.in/textbook.php
- CIET NCERT Audio Books: https://ciet.ncert.gov.in/audio-books
- CBSE curriculum 2026–27: https://cbseacademic.nic.in/curriculum_2027.html
