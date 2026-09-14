#!/usr/bin/env bash
set -euo pipefail

database_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

supabase db reset --local --version 202609130001 --no-seed
psql -X "$database_url" -f supabase/test-support/inventory_upgrade_seed.sql
supabase migration up --local
psql -X "$database_url" -f supabase/test-support/inventory_upgrade_verify.sql
