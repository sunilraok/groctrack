#!/usr/bin/env bash
set -euo pipefail

database_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
temporary_directory="$(mktemp -d)"
first_pid=""
holder_pid=""

cleanup() {
  if [[ -n "$first_pid" ]] && kill -0 "$first_pid" 2>/dev/null; then
    kill "$first_pid"
  fi
  if [[ -n "$holder_pid" ]] && kill -0 "$holder_pid" 2>/dev/null; then
    kill "$holder_pid"
  fi
  rm -f "$temporary_directory"/*
  rmdir "$temporary_directory"
}
trap cleanup EXIT

show_failure_output() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    for error_file in "$temporary_directory"/*.err; do
      if [[ -s "$error_file" ]]; then
        cat "$error_file" >&2
      fi
    done
  fi
  exit "$status"
}
trap show_failure_output ERR

psql -X "$database_url" -f supabase/test-support/inventory_concurrency_setup.sql

session_sql() {
  local sleep_seconds="$1"
  local application_name="$2"
  cat <<SQL
begin;
set local application_name = '$application_name';
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.record_inventory_change(
  'c2000000-0000-4000-8000-000000000003',
  'adjustment',
  2,
  'g',
  'c2000000-0000-4000-8000-000000000004',
  'Concurrent retry'
);
select pg_sleep($sleep_seconds);
commit;
SQL
}

session_sql 2 "inventory-concurrency-first" |
  psql -X -v ON_ERROR_STOP=1 -At "$database_url" \
  >"$temporary_directory/first.out" 2>"$temporary_directory/first.err" &
first_pid=$!

first_lock_acquired=false
for _ in {1..40}; do
  if [[ "$(psql -X -At "$database_url" -c "
    select count(*)
    from pg_locks locks
    join pg_stat_activity activity on activity.pid = locks.pid
    where locks.locktype = 'advisory'
      and locks.granted
      and activity.application_name = 'inventory-concurrency-first'
  ")" -gt 0 ]]; then
    first_lock_acquired=true
    break
  fi
  sleep 0.05
done
test "$first_lock_acquired" = true

start_ns="$(date +%s%N)"
session_sql 0 "inventory-concurrency-second" |
  psql -X -v ON_ERROR_STOP=1 -At "$database_url" \
  >"$temporary_directory/second.out" 2>"$temporary_directory/second.err"
end_ns="$(date +%s%N)"
wait "$first_pid"
first_pid=""

first_id="$(grep -Eo '[0-9a-f]{8}-[0-9a-f-]{27}' "$temporary_directory/first.out" | head -1)"
second_id="$(grep -Eo '[0-9a-f]{8}-[0-9a-f-]{27}' "$temporary_directory/second.out" | head -1)"
elapsed_ms="$(( (end_ns - start_ns) / 1000000 ))"

test -n "$first_id"
test "$first_id" = "$second_id"
test "$elapsed_ms" -ge 500
test "$elapsed_ms" -lt 10000
test "$(psql -X -At "$database_url" -c "
  select count(*)
  from public.inventory_transactions
  where operation_id = 'c2000000-0000-4000-8000-000000000004'
")" = "1"
test "$(psql -X -At "$database_url" -c "
  select quantity_base
  from public.inventory_balances
  where grocery_item_id = 'c2000000-0000-4000-8000-000000000003'
")" = "2.000000"

psql -X -v ON_ERROR_STOP=1 -At "$database_url" \
  >"$temporary_directory/holder.out" 2>"$temporary_directory/holder.err" <<'SQL' &
begin;
set local application_name = 'inventory-validation-holder';
select pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'c2000000-0000-4000-8000-000000000003',
    0
  )
);
select pg_sleep(3);
commit;
SQL
holder_pid=$!

validation_lock_acquired=false
for _ in {1..40}; do
  if [[ "$(psql -X -At "$database_url" -c "
    select count(*)
    from pg_locks locks
    join pg_stat_activity activity on activity.pid = locks.pid
    where locks.locktype = 'advisory'
      and locks.granted
      and activity.application_name = 'inventory-validation-holder'
  ")" -gt 0 ]]; then
    validation_lock_acquired=true
    break
  fi
  sleep 0.05
done
test "$validation_lock_acquired" = true

assert_rejected_before_lock() {
  local quantity="$1"
  local operation_id="$2"
  local expected_message="$3"
  local output
  local status

  set +e
  output="$(psql -X -v ON_ERROR_STOP=1 "$database_url" 2>&1 <<SQL
set statement_timeout = '750ms';
set role authenticated;
set request.jwt.claims =
  '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.record_inventory_change(
  'c2000000-0000-4000-8000-000000000003',
  'adjustment',
  $quantity,
  'g',
  '$operation_id',
  null
);
SQL
  )"
  status=$?
  set -e

  test "$status" -ne 0
  grep -Fq "$expected_message" <<<"$output"
  if grep -Fq "statement timeout" <<<"$output"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
}

assert_rejected_before_lock "'NaN'::numeric" \
  "c2000000-0000-4000-8000-000000000005" \
  "Quantity must be finite and greater than zero"
assert_rejected_before_lock "'Infinity'::numeric" \
  "c2000000-0000-4000-8000-000000000006" \
  "Quantity must be finite and greater than zero"
assert_rejected_before_lock "'-Infinity'::numeric" \
  "c2000000-0000-4000-8000-000000000007" \
  "Quantity must be finite and greater than zero"
assert_rejected_before_lock "null" \
  "c2000000-0000-4000-8000-000000000008" \
  "Quantity must be finite and greater than zero"
assert_rejected_before_lock "1.0000001" \
  "c2000000-0000-4000-8000-000000000009" \
  "Quantity must have at most six fractional digits"

wait "$holder_pid"
holder_pid=""

test "$(psql -X -At "$database_url" -c "
  select count(*)
  from public.inventory_transactions
  where operation_id in (
    'c2000000-0000-4000-8000-000000000005',
    'c2000000-0000-4000-8000-000000000006',
    'c2000000-0000-4000-8000-000000000007',
    'c2000000-0000-4000-8000-000000000008',
    'c2000000-0000-4000-8000-000000000009'
  )
")" = "0"
test "$(psql -X -At "$database_url" -c "
  select quantity_base
  from public.inventory_balances
  where grocery_item_id = 'c2000000-0000-4000-8000-000000000003'
")" = "2.000000"

printf 'inventory concurrency and pre-lock validation passed\n'
