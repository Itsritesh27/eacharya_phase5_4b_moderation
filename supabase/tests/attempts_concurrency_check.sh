#!/usr/bin/env bash
# Phase B concurrency check: parallel psql sessions racing start/submit for the same student.
#
# SCRATCH DATABASE ONLY. Unlike the SQL check scripts this COMMITS its fixtures (concurrent sessions
# cannot see uncommitted rows), then deletes them again (rows tagged RACE). Never run it against a
# production or shared project.
#
# Usage:  PGDATABASE=eac_dev [PGUSER=root] supabase/tests/attempts_concurrency_check.sh [parallel_sessions=12]
# Needs migrations 1-12 applied, and a superuser/owner connection (it impersonates users with SET ROLE).
set -uo pipefail
N="${1:-12}"
: "${PGDATABASE:?set PGDATABASE to a scratch database}"
case "$PGDATABASE" in *prod*|*live*) echo "refusing: database name looks like production"; exit 1;; esac
PSQL=(psql -X -q -t -A -v ON_ERROR_STOP=1)
FAILS=0
say()  { echo "$*"; }
pass() { say "PASS: $1"; }
fail() { say "FAIL: $1"; FAILS=$((FAILS+1)); }

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1
delete from public.assessment_attempts where assessment_id in (select id from public.assessments where title like 'RACE %');
delete from public.assessments where title like 'RACE %';
delete from public.enrollments where course_id in (select id from public.courses where slug like 'race-%');
delete from public.courses where slug like 'race-%';
delete from auth.users where email like 'race_%@test.local';
SQL
}
trap cleanup EXIT
cleanup

U() { printf '00000000-0000-0000-0000-00000000ff%02d' "$1"; }

"${PSQL[@]}" <<SQL
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000ff' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'race_' || g || '@test.local', '{}' from generate_series(1, 20) g;
insert into public.classes (grade, name) values (9, 'Class 9') on conflict (grade) do nothing;
insert into public.subjects (name, slug) values ('Geography', 'geography') on conflict (slug) do nothing;
insert into public.courses (title, slug, class_id, subject_id, status)
select 'RACE course', 'race-c1', c.id, s.id, 'published' from public.classes c, public.subjects s where c.grade = 9 and s.slug = 'geography';
insert into public.enrollments (user_id, course_id)
select u.id, (select id from public.courses where slug = 'race-c1') from auth.users u where u.email like 'race_%@test.local';
do \$\$
declare a uuid; q uuid; nm text; lim int;
begin
  foreach nm in array array['limit3', 'nolimit', 'keyed'] loop
    lim := case nm when 'limit3' then 3 else null end;
    insert into public.assessments (title, course_id, total_marks, attempt_limit, duration_minutes, status)
    values ('RACE ' || nm, (select id from public.courses where slug = 'race-c1'), 2, lim, 30, 'draft') returning id into a;
    insert into public.questions (assessment_id, question_type, question_text, marks, position) values (a, 'true_false', 'Q?', 2, 0) returning id into q;
    insert into public.question_answer_keys (question_id, correct_boolean) values (q, true);
    update public.assessments set status = 'published' where id = a;
  end loop;
end \$\$;
SQL
[ $? -eq 0 ] || { echo "fixture setup failed"; exit 2; }

AID() { "${PSQL[@]}" -c "select id from public.assessments where title = 'RACE $1'"; }
LIM=$(AID limit3); NOL=$(AID nolimit); KEY=$(AID keyed)

# one worker = one session = one student; prints one line per outcome
worker() { # user_n assessment mode(loop|once|samekey) 
  local uid; uid=$(U "$1")
  psql -X -q -t -A -d "$PGDATABASE" <<SQL
set role authenticated;
\\o /dev/null
select set_config('request.jwt.claims', '{"sub":"$uid","role":"authenticated"}', false);
\\o
do \$\$
declare r public.attempt_info; i int; k uuid;
begin
  for i in 1..$4 loop
    begin
      r := public.start_assessment_attempt('$2'::uuid, $5);
      raise notice 'RESULT start ok n=% status=% id=%', r.attempt_number, r.status, r.attempt_id;
      if '$3' = 'loop' then perform public.submit_attempt(r.attempt_id); end if;
    exception when others then
      raise notice 'RESULT start err %', sqlstate;
    end;
  end loop;
end \$\$;
SQL
}

COUNT() { "${PSQL[@]}" -c "$1"; }

# ---- Scenario 1: N sessions, ONE student, no key, 1 start each -> exactly 1 open attempt
for i in $(seq 1 "$N"); do worker 1 "$NOL" once 1 null >/dev/null 2>&1 & done; wait
ROWS=$(COUNT "select count(*) from public.assessment_attempts where assessment_id='$NOL' and user_id='$(U 1)'")
[ "$ROWS" = "1" ] && pass "S1: $N parallel starts (no key) created exactly 1 attempt" || fail "S1: expected 1 attempt, got $ROWS"

# ---- Scenario 2: N sessions, ONE student, DISTINCT keys -> still 1 attempt
for i in $(seq 1 "$N"); do worker 2 "$NOL" once 1 "gen_random_uuid()" >/dev/null 2>&1 & done; wait
ROWS=$(COUNT "select count(*) from public.assessment_attempts where assessment_id='$NOL' and user_id='$(U 2)'")
[ "$ROWS" = "1" ] && pass "S2: $N parallel starts with distinct keys created exactly 1 attempt" || fail "S2: expected 1 attempt, got $ROWS"

# ---- Scenario 3: N sessions, ONE student, SAME key -> 1 attempt, same id for everyone
OUT=$(for i in $(seq 1 "$N"); do worker 3 "$NOL" once 1 "'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'" 2>&1 & done; wait)
ROWS=$(COUNT "select count(*) from public.assessment_attempts where assessment_id='$NOL' and user_id='$(U 3)'")
IDS=$(echo "$OUT" | grep -o 'id=[0-9a-f-]*' | sort -u | wc -l)
OKS=$(echo "$OUT" | grep -c 'start ok')
{ [ "$ROWS" = "1" ] && [ "$IDS" = "1" ] && [ "$OKS" = "$N" ]; } && pass "S3: $N parallel starts with one key -> 1 attempt, 1 id, $N successes" || fail "S3: rows=$ROWS ids=$IDS ok=$OKS"

# ---- Scenario 4: attempt LIMIT 3, N sessions race start+submit loops for ONE student
OUT=$(for i in $(seq 1 "$N"); do worker 4 "$LIM" loop 6 null 2>&1 & done; wait)
ROWS=$(COUNT "select count(*) from public.assessment_attempts where assessment_id='$LIM' and user_id='$(U 4)'")
NUMS=$(COUNT "select string_agg(attempt_number::text, ',' order by attempt_number) from public.assessment_attempts where assessment_id='$LIM' and user_id='$(U 4)'")
BAD=$(COUNT "select count(*) from public.assessment_attempts where assessment_id='$LIM' and user_id='$(U 4)' and status <> 'submitted'")
LIMERR=$(echo "$OUT" | grep -c 'start err EA004')
OTHER=$(echo "$OUT" | grep 'start err' | grep -vc 'EA004')
{ [ "$ROWS" = "3" ] && [ "$NUMS" = "1,2,3" ] && [ "$BAD" = "0" ]; } && pass "S4: limit 3 under $N racing sessions -> exactly 3 attempts, numbers $NUMS, all submitted ($LIMERR sessions refused with EA004)" || fail "S4: rows=$ROWS numbers=$NUMS not-submitted=$BAD"
[ "$OTHER" = "0" ] && pass "S4: no unexpected errors (deadlocks, unique violations) among racers" || fail "S4: $OTHER unexpected errors: $(echo "$OUT" | grep 'start err' | grep -v EA004 | sort | uniq -c)"

# ---- Scenario 5: different students in parallel do not interfere (5 students x 4 sessions)
for u in 5 6 7 8 9; do for i in 1 2 3 4; do worker "$u" "$KEY" once 1 null >/dev/null 2>&1 & done; done; wait
BADU=$(COUNT "select count(*) from (select user_id from public.assessment_attempts where assessment_id='$KEY' group by user_id having count(*) <> 1) x")
TOT=$(COUNT "select count(distinct user_id) from public.assessment_attempts where assessment_id='$KEY'")
{ [ "$BADU" = "0" ] && [ "$TOT" = "5" ]; } && pass "S5: 5 students x 4 parallel sessions -> exactly one attempt each" || fail "S5: students=$TOT with-wrong-count=$BADU"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL CONCURRENCY CHECKS PASSED ($N parallel sessions)"; exit 0; else echo "$FAILS CONCURRENCY CHECK(S) FAILED"; exit 1; fi
