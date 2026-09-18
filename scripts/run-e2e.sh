#!/usr/bin/env bash
set -euo pipefail

started_supabase=0
if [[ -x "./node_modules/.bin/supabase" ]]; then
  supabase_cmd=(./node_modules/.bin/supabase)
elif command -v supabase >/dev/null 2>&1; then
  supabase_cmd=(supabase)
else
  supabase_cmd=(npx --yes supabase@2.117.0)
fi

if ! "${supabase_cmd[@]}" status --output json >/dev/null 2>&1; then
  "${supabase_cmd[@]}" start
  started_supabase=1
fi

database_container="$(docker ps --filter name=supabase_db_ --format '{{.Names}}' | head -n 1)"
if [[ -n "$database_container" ]]; then
  host_epoch="$(date +%s)"
  docker_epoch="$(docker exec "$database_container" date +%s)"
  clock_delta=$((host_epoch - docker_epoch))
  if (( clock_delta < -30 || clock_delta > 30 )); then
    echo "Docker clock differs from the host by ${clock_delta}s; restart Docker Desktop before E2E." >&2
    exit 1
  fi
fi

if [[ "${E2E_SKIP_DB_RESET:-0}" != "1" ]]; then
  "${supabase_cmd[@]}" db reset
fi

status="$("${supabase_cmd[@]}" status --output json)"
export NEXT_PUBLIC_SUPABASE_URL="$(jq -r '.API_URL' <<<"$status")"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(jq -r '.ANON_KEY' <<<"$status")"
export SUPABASE_SERVICE_ROLE_KEY="$(jq -r '.SERVICE_ROLE_KEY' <<<"$status")"
export NEXT_PUBLIC_SITE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
export RECEIPT_EXTRACTOR=fake

set +e
./node_modules/.bin/playwright test "$@"
test_status=$?
set -e

cleanup_status=0
if [[ "$started_supabase" == "1" ]]; then
  "${supabase_cmd[@]}" stop --no-backup || cleanup_status=$?
else
  "${supabase_cmd[@]}" db reset || cleanup_status=$?
fi

if [[ "$test_status" != "0" ]]; then
  exit "$test_status"
fi
exit "$cleanup_status"
