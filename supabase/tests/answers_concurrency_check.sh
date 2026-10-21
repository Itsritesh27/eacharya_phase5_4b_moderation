#!/usr/bin/env bash
# Phase D concurrency check: parallel psql sessions racing save_attempt_answer (duplicates, out-of-order
# revisions) and racing saves against submit_attempt.
#
# SCRATCH DATABASE ONLY. Like attempts_concurrency_check.sh this COMMITS its fixtures (concurrent sessions cannot
# see uncommitted rows), then deletes them again (rows tagged RACED). Never run it against a production or shared project.
#
# Usage:  PGDATABASE=eac_dev [PGUSER=root] supabase/tests/answers_concurrency_check.sh [parallel_sessions=12]
# Needs migrations 1-14 applied, and a superuser/owner connection (it impersonates users with SET ROLE).
set -uo pipefail
N="${1:-12}"
ROUNDS="${ROUNDS:-6}"
# each of 6 savers sends SAVES saves; the submit fires DELAY seconds in, so it should land mid-stream
SAVES="${SAVES:-800}"
DELAY="${DELAY:-0.25}"
: "${PGDATABASE:?set PGDATABASE to a scratch database}"
case "$PGDATABASE" in *prod*|*live*) echo "refusing: database name looks like production"; exit 1;; esac
PSQL=(psql -X -q -t -A -v ON_ERROR_STOP=1)
FAILS=0
say()  { echo "$*"; }
pass() { say "PASS: $1"; }
fail() { say "FAIL: $1"; FAILS=$((FAILS+1)); }

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1
delete from public.assessment_attempts where assessment_id in (select id from public.assessments where title like 'RACED %');
delete from public.assessments where title like 'RACED %';
delete from public.enrollments where course_id in (select id from public.courses where slug like 'raced-%');
delete from public.courses where slug like 'raced-%';
delete from auth.users where email like 'raced_%@test.local';
SQL
}
trap cleanup EXIT
cleanup

U() { printf '00000000-0000-0000-0000-00000000fd%02d' "$1"; }

"${PSQL[@]}" <<SQL
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000fd' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'raced_' || g || '@test.local', '{}' from generate_series(1, 20) g;
insert into public.classes (grade, name) values (9, 'Class 9') on conflict (grade) do nothing;
insert into public.subjects (name, slug) values ('Geography', 'geography') on conflict (slug) do nothing;
insert into public.courses (title, slug, class_id, subject_id, status)
select 'RACED course', 'raced-c1', c.id, s.id, 'published' from public.classes c, public.subjects s where c.grade = 9 and s.slug = 'geography';
insert into public.enrollments (user_id, course_id)
select u.id, (select id from public.courses where slug = 'raced-c1') from auth.users u where u.email like 'raced_%@test.local';
do \$\$
declare a uuid;
begin
  insert into public.assessments (title, course_id, total_marks, attempt_limit, duration_minutes, status)
  values ('RACED paper', (select id from public.courses where slug = 'raced-c1'), 4, null, 30, 'draft') returning id into a;
  insert into public.questions (assessment_id, question_type, question_text, marks, position) values
    (a, 'descriptive', 'Q1?', 2, 0), (a, 'descriptive', 'Q2?', 2, 1);
  update public.assessments set status = 'published' where id = a;
end \$\$;
SQL
[ $? -eq 0 ] || { echo "fixture setup failed"; exit 2; }

ASM=$("${PSQL[@]}" -c "select id from public.assessments where title = 'RACED paper'")
Q1=$("${PSQL[@]}" -c "select id from public.questions where assessment_id = '$ASM' and position = 0")
Q2=$("${PSQL[@]}" -c "select id from public.questions where assessment_id = '$ASM' and position = 1")

# start (or resume) an attempt as student $1; prints the attempt id
start_attempt() {
  local uid; uid=$(U "$1")
  psql -X -q -t -A -d "$PGDATABASE" <<SQL
set role authenticated;
\\o /dev/null
select set_config('request.jwt.claims', '{"sub":"$uid","role":"authenticated"}', false);
\\o
select attempt_id from public.start_assessment_attempt('$ASM'::uuid);
SQL
}

# one saver = one session = one student; sends revisions $4..$5 of question $3 in attempt $2 as SEPARATE
# autocommitted statements (\gexec), exactly like separate autosave requests. One line per call:
#   RESULT save applied=<t|f> rev=<n>      or      ERROR:  <SQLSTATE>: <message>   (psql VERBOSITY verbose)
saver() { # user_n attempt question rev_from rev_to
  local uid; uid=$(U "$1")
  psql -X -q -t -A -d "$PGDATABASE" <<SQL 2>&1
\set VERBOSITY verbose
set role authenticated;
\o /dev/null
select set_config('request.jwt.claims', '{"sub":"$uid","role":"authenticated"}', false);
\o
select format(\$f\$select 'RESULT save applied=' || (r->>'applied') || ' rev=' || (r->>'revision') from (select public.save_attempt_answer(%L::uuid, %L::uuid, jsonb_build_object('text', 'r%s'), %s) as r) x\$f\$, '$2', '$3', i, i)
from generate_series($4, $5) i \gexec
SQL
}

# a submit after a short pause
submitter() { # user_n attempt delay_seconds
  local uid; uid=$(U "$1")
  psql -X -q -t -A -d "$PGDATABASE" <<SQL 2>&1
set role authenticated;
\\o /dev/null
select set_config('request.jwt.claims', '{"sub":"$uid","role":"authenticated"}', false);
select pg_sleep($3);
\\o
do \$\$
declare r public.attempt_info;
begin
  r := public.submit_attempt('$2'::uuid);
  raise notice 'RESULT submit %', r.status;
end \$\$;
SQL
}

COUNT() { "${PSQL[@]}" -c "$1"; }

# ---- D1: N sessions send the IDENTICAL save (same attempt, question, revision, body)
A1=$(start_attempt 1)
OUT=$(for i in $(seq 1 "$N"); do saver 1 "$A1" "$Q1" 1 1 & done; wait)
ROWS=$(COUNT "select count(*) from public.attempt_answers where attempt_id='$A1' and question_id='$Q1'")
APPLIED=$(echo "$OUT" | grep -c 'applied=true')
NOTAPPLIED=$(echo "$OUT" | grep -c 'applied=false')
ERRS=$(echo "$OUT" | grep -c 'ERROR:')
{ [ "$ROWS" = "1" ] && [ "$APPLIED" = "1" ] && [ "$NOTAPPLIED" = "$((N-1))" ] && [ "$ERRS" = "0" ]; } \
  && pass "D1: $N identical parallel saves -> 1 row, exactly 1 applied, $((N-1)) harmless repeats, 0 errors" \
  || fail "D1: rows=$ROWS applied=$APPLIED repeats=$NOTAPPLIED errors=$ERRS: $(echo "$OUT" | sort | uniq -c)"

# ---- D2: N sessions send DIFFERENT revisions 1..N at once (arrival order is random)
A2=$(start_attempt 2)
OUT=$(for i in $(seq 1 "$N"); do saver 2 "$A2" "$Q1" "$i" "$i" & done; wait)
ROW=$(COUNT "select revision || ':' || (answer->>'text') from public.attempt_answers where attempt_id='$A2' and question_id='$Q1'")
ROWS=$(COUNT "select count(*) from public.attempt_answers where attempt_id='$A2' and question_id='$Q1'")
ERRS=$(echo "$OUT" | grep -c 'ERROR:')
{ [ "$ROWS" = "1" ] && [ "$ROW" = "$N:r$N" ] && [ "$ERRS" = "0" ]; } \
  && pass "D2: revisions 1..$N racing in random order -> 1 row, the highest revision ($N) won with its own body, 0 errors" \
  || fail "D2: rows=$ROWS stored=$ROW (want $N:r$N) errors=$ERRS: $(echo "$OUT" | sort | uniq -c | head)"

# ---- D3: sessions hammer two questions of the same attempt at once -> one row per question
A3=$(start_attempt 3)
OUT=$(for i in $(seq 1 "$N"); do saver 3 "$A3" "$Q1" "$i" "$i" & saver 3 "$A3" "$Q2" "$i" "$i" & done; wait)
ROWS=$(COUNT "select count(*) from public.attempt_answers where attempt_id='$A3'")
BADREV=$(COUNT "select count(*) from public.attempt_answers where attempt_id='$A3' and (revision <> $N or answer->>'text' <> 'r$N')")
ERRS=$(echo "$OUT" | grep -c 'ERROR:')
{ [ "$ROWS" = "2" ] && [ "$BADREV" = "0" ] && [ "$ERRS" = "0" ]; } \
  && pass "D3: $((N*2)) parallel saves over 2 questions -> exactly 2 rows, each at revision $N, 0 errors" \
  || fail "D3: rows=$ROWS wrong-final=$BADREV errors=$ERRS"

# ---- D4: saves racing a submit. Repeated $ROUNDS times, each on a fresh attempt.
D4_BAD=0
D4_RACED=0
for round in $(seq 1 "$ROUNDS"); do
  S=$((3 + round))                                  # a different student each round
  A=$(start_attempt "$S")
  OUT=$( { for w in 1 2 3 4 5 6; do saver "$S" "$A" "$Q1" "$((w*10000+1))" "$((w*10000+SAVES))" & done
           submitter "$S" "$A" "$DELAY" &
           wait; } 2>&1 )
  ST=$(COUNT "select status from public.assessment_attempts where id='$A'")
  LATE=$(COUNT "select count(*) from public.attempt_answers a join public.assessment_attempts t on t.id = a.attempt_id where t.id='$A' and a.updated_at > t.submitted_at")
  OTHER=$(echo "$OUT" | grep 'ERROR:' | grep -vc 'EA007')
  SUBMITS=$(echo "$OUT" | grep -c 'RESULT submit submitted')
  MAXAPPLIED=$(echo "$OUT" | grep 'applied=true' | sed -E 's/.*rev=([0-9]+).*/\1/' | sort -n | tail -1)
  STORED=$(COUNT "select coalesce(max(revision), 0) from public.attempt_answers where attempt_id='$A' and question_id='$Q1'")
  say "  round $round: saves applied=$(echo "$OUT" | grep -c 'applied=true') repeats=$(echo "$OUT" | grep -c 'applied=false') refused-after-submit=$(echo "$OUT" | grep -c 'ERROR:  EA007')"
  if [ "$(echo "$OUT" | grep -c 'applied=true')" -ge 1 ] && [ "$(echo "$OUT" | grep -c 'ERROR:  EA007')" -ge 1 ]; then D4_RACED=$((D4_RACED+1)); fi
  # saves refused after the submit must say EA007; the stored revision must equal the highest APPLIED revision
  if [ "$ST" != "submitted" ] || [ "$LATE" != "0" ] || [ "$OTHER" != "0" ] || [ "$SUBMITS" != "1" ] || [ "${MAXAPPLIED:-0}" != "$STORED" ]; then
    D4_BAD=$((D4_BAD+1))
    say "  round $round: status=$ST answers-after-submit=$LATE unexpected-errors=$OTHER submits=$SUBMITS max-applied=${MAXAPPLIED:-0} stored=$STORED"
  fi
done
[ "$D4_RACED" -ge 1 ] || { fail "D4: no round had both accepted and refused saves, so the race never interleaved; rerun with more load"; }
[ "$D4_BAD" = "0" ] && pass "D4: $ROUNDS rounds of 6 savers x $SAVES saves racing a submit -> always submitted, no answer written after the submit time, every refused save was EA007, stored revision = highest applied one" \
                    || fail "D4: $D4_BAD of $ROUNDS rounds violated an invariant"

# ---- D5: after the race, nothing can be saved any more
A=$(start_attempt 12); "${PSQL[@]}" -c "select 1" >/dev/null
OUT=$(saver 12 "$A" "$Q1" 1 1)
OUT2=$(submitter 12 "$A" 0)
OUT3=$(saver 12 "$A" "$Q1" 2 2)
echo "$OUT" | grep -q 'applied=true' && echo "$OUT3" | grep -q 'ERROR:  EA007' \
  && pass "D5: a save before submit works, the same call after submit fails with EA007" \
  || fail "D5: before='$OUT' submit='$OUT2' after='$OUT3'"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PHASE D CONCURRENCY CHECKS PASSED ($N parallel sessions, $ROUNDS submit-race rounds)"; exit 0; else echo "$FAILS PHASE D CONCURRENCY CHECK(S) FAILED"; exit 1; fi
