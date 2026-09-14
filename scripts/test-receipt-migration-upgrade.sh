#!/usr/bin/env bash
set -euo pipefail

supabase db reset \
  --local \
  --version 202609130002 \
  --sql-paths fixtures/receipt_upgrade_002.sql
supabase migration up --local
supabase test db supabase/upgrade-tests/receipt_extraction_upgrade.sql
