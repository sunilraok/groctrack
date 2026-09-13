#!/usr/bin/env bash

set -euo pipefail

eval "$(supabase status -o env)"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

http_request() {
  local expectation="$1"
  shift
  local status

  status="$(curl --silent --show-error --output "$tmpdir/http-body" \
    --write-out "%{http_code}" "$@")"

  if [[ "$expectation" == "success" && "$status" != 2* ]]; then
    cat "$tmpdir/http-body" >&2
    echo "Expected success, received HTTP $status" >&2
    exit 1
  fi
  if [[ "$expectation" == "failure" && "$status" == 2* ]]; then
    cat "$tmpdir/http-body" >&2
    echo "Expected failure, received HTTP $status" >&2
    exit 1
  fi
}

admin_user() {
  local email="$1"
  local password="$2"

  http_request success \
    --request POST "$API_URL/auth/v1/admin/users" \
    --header "apikey: $SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SERVICE_ROLE_KEY" \
    --header "Content-Type: application/json" \
    --data "$(jq -nc \
      --arg email "$email" \
      --arg password "$password" \
      '{email: $email, password: $password, email_confirm: true}')"
  jq -r '.id' "$tmpdir/http-body"
}

access_token() {
  local email="$1"
  local password="$2"

  http_request success \
    --request POST "$API_URL/auth/v1/token?grant_type=password" \
    --header "apikey: $ANON_KEY" \
    --header "Content-Type: application/json" \
    --data "$(jq -nc \
      --arg email "$email" \
      --arg password "$password" \
      '{email: $email, password: $password}')"
  jq -r '.access_token' "$tmpdir/http-body"
}

rest_service() {
  local method="$1"
  local path="$2"
  local body="$3"

  http_request success \
    --request "$method" "$API_URL/rest/v1/$path" \
    --header "apikey: $SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SERVICE_ROLE_KEY" \
    --header "Content-Type: application/json" \
    --header "Prefer: return=minimal" \
    --data "$body"
}

rest_user() {
  local expectation="$1"
  local method="$2"
  local path="$3"
  local token="$4"
  local body="$5"

  http_request "$expectation" \
    --request "$method" "$API_URL/rest/v1/$path" \
    --header "apikey: $ANON_KEY" \
    --header "Authorization: Bearer $token" \
    --header "Content-Type: application/json" \
    --header "Prefer: return=representation" \
    --data "$body"
}

storage_upload() {
  local expectation="$1"
  local token="$2"
  local path="$3"

  http_request "$expectation" \
    --request POST "$API_URL/storage/v1/object/receipts/$path" \
    --header "apikey: $ANON_KEY" \
    --header "Authorization: Bearer $token" \
    --header "Content-Type: image/jpeg" \
    --data-binary "receipt-test"
}

storage_delete() {
  local expectation="$1"
  local token="$2"
  local path="$3"

  http_request "$expectation" \
    --request DELETE "$API_URL/storage/v1/object/receipts/$path" \
    --header "apikey: $ANON_KEY" \
    --header "Authorization: Bearer $token"
}

password="Integration-password-1!"
owner_id="$(admin_user owner.integration@example.test "$password")"
member_id="$(admin_user member.integration@example.test "$password")"
outsider_id="$(admin_user outsider.integration@example.test "$password")"
owner_token="$(access_token owner.integration@example.test "$password")"
member_token="$(access_token member.integration@example.test "$password")"
outsider_token="$(access_token outsider.integration@example.test "$password")"

rest_user success POST rpc/create_household "$owner_token" \
  '{"household_name":"Storage integration household"}'
household_id="$(jq -r '.' "$tmpdir/http-body")"
rest_user success POST rpc/create_household "$outsider_token" \
  '{"household_name":"Other integration household"}'
other_household_id="$(jq -r '.' "$tmpdir/http-body")"

rest_service POST household_members "$(jq -nc \
  --arg household_id "$household_id" \
  --arg user_id "$member_id" \
  '{household_id: $household_id, user_id: $user_id, role: "member"}')"

owner_path="$household_id/owner.jpg"
posted_path="$household_id/posted.jpg"
member_path="$household_id/member.jpg"

storage_upload success "$owner_token" "$owner_path"
storage_upload failure "$member_token" "$other_household_id/cross-household.jpg"

rest_user failure POST receipts "$member_token" "$(jq -nc \
  --arg household_id "$household_id" \
  --arg uploaded_by "$member_id" \
  --arg image_path "$owner_path" \
  '{
    household_id: $household_id,
    uploaded_by: $uploaded_by,
    image_path: $image_path,
    original_filename: "owner.jpg",
    content_type: "image/jpeg"
  }')"
storage_delete failure "$member_token" "$owner_path"

rest_user success POST receipts "$owner_token" "$(jq -nc \
  --arg household_id "$household_id" \
  --arg uploaded_by "$owner_id" \
  --arg image_path "$owner_path" \
  '{
    household_id: $household_id,
    uploaded_by: $uploaded_by,
    image_path: $image_path,
    original_filename: "owner.jpg",
    content_type: "image/jpeg"
  }')"
storage_delete success "$owner_token" "$owner_path"

storage_upload success "$owner_token" "$posted_path"
rest_user success POST receipts "$owner_token" "$(jq -nc \
  --arg household_id "$household_id" \
  --arg uploaded_by "$owner_id" \
  --arg image_path "$posted_path" \
  '{
    household_id: $household_id,
    uploaded_by: $uploaded_by,
    image_path: $image_path,
    original_filename: "posted.jpg",
    content_type: "image/jpeg"
  }')"
rest_service PATCH "receipts?image_path=eq.$posted_path" "$(jq -nc \
  --arg posted_by "$owner_id" \
  '{status: "posted", posted_at: "2026-09-13T00:00:00Z", posted_by: $posted_by}')"
storage_delete failure "$owner_token" "$posted_path"

storage_upload success "$member_token" "$member_path"
rest_user success POST receipts "$member_token" "$(jq -nc \
  --arg household_id "$household_id" \
  --arg uploaded_by "$member_id" \
  --arg image_path "$member_path" \
  '{
    household_id: $household_id,
    uploaded_by: $uploaded_by,
    image_path: $image_path,
    original_filename: "member.jpg",
    content_type: "image/jpeg"
  }')"
rest_service PATCH \
  "household_members?household_id=eq.$household_id&user_id=eq.$member_id" \
  '{"revoked_at":"2026-09-13T00:00:00Z"}'
storage_delete failure "$member_token" "$member_path"

db_container="$(docker ps \
  --filter "name=supabase_db_" \
  --format '{{.Names}}' \
  | head -n 1)"
if [[ -z "$db_container" ]]; then
  echo "Local Supabase database container was not found" >&2
  exit 1
fi

db_exec() {
  docker exec -i "$db_container" psql \
    --set ON_ERROR_STOP=1 \
    --username postgres \
    --dbname postgres
}

db_exec <<'SQL'
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '90000000-0000-0000-0000-000000000001',
    'race-owner@example.test',
    now(),
    '{}'::jsonb
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    'race-member@example.test',
    now(),
    '{}'::jsonb
  );

insert into public.households (id, name, created_by)
values (
  '91000000-0000-0000-0000-000000000001',
  'Concurrency household',
  '90000000-0000-0000-0000-000000000001'
);

insert into public.household_members (household_id, user_id, role)
values
  (
    '91000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    'owner'
  ),
  (
    '91000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000002',
    'member'
  );

insert into public.household_invitations (
  household_id,
  email,
  token_hash,
  role,
  invited_by,
  expires_at
)
values (
  '91000000-0000-0000-0000-000000000001',
  'race-member@example.test',
  encode(extensions.digest('race-token', 'sha256'), 'hex'),
  'member',
  '90000000-0000-0000-0000-000000000001',
  now() + interval '1 day'
);

insert into public.merchants (id, household_id, name, normalized_name)
values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'Race Market',
  'RACE MARKET'
);

insert into public.grocery_items (
  id,
  household_id,
  name,
  normalized_name,
  unit_dimension,
  base_unit,
  created_by
)
values (
  '93000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'Race rice',
  'RACE RICE',
  'mass',
  'g',
  '90000000-0000-0000-0000-000000000001'
);

insert into public.receipts (
  id,
  household_id,
  uploaded_by,
  merchant_id,
  image_path,
  original_filename,
  content_type,
  status
)
values (
  '94000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001/race.jpg',
  'race.jpg',
  'image/jpeg',
  'review_ready'
);

insert into public.receipt_lines (
  id,
  household_id,
  receipt_id,
  line_number,
  raw_description,
  quantity,
  unit,
  grocery_item_id
)
values (
  '95000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  1,
  'RACE RICE',
  1,
  'kg',
  '93000000-0000-0000-0000-000000000001'
);
SQL

cat >"$tmpdir/revoke.sql" <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local statement_timeout = '15s';
select 1
from public.households
where id = '91000000-0000-0000-0000-000000000001'
for update;
select pg_sleep(2);
select public.revoke_household_member(
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002'
);
commit;
SQL

cat >"$tmpdir/accept.sql" <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local statement_timeout = '15s';
select public.accept_household_invitation('race-token');
commit;
SQL

db_exec <"$tmpdir/revoke.sql" >"$tmpdir/revoke.log" 2>&1 &
revoke_pid=$!
sleep 0.3
set +e
db_exec <"$tmpdir/accept.sql" >"$tmpdir/accept.log" 2>&1
accept_status=$?
wait "$revoke_pid"
revoke_status=$?
set -e

if grep -q "40P01\\|deadlock detected" "$tmpdir/revoke.log" "$tmpdir/accept.log"; then
  cat "$tmpdir/revoke.log" "$tmpdir/accept.log" >&2
  echo "Invitation race deadlocked" >&2
  exit 1
fi
if [[ "$revoke_status" -ne 0 || "$accept_status" -eq 0 ]] ||
  ! grep -q "Invitation is invalid or expired" "$tmpdir/accept.log"; then
  cat "$tmpdir/revoke.log" "$tmpdir/accept.log" >&2
  echo "Invitation race did not serialize to the expected revoked state" >&2
  exit 1
fi

db_exec <<'SQL'
do $$
begin
  if not exists (
    select 1
    from public.household_members
    where household_id = '91000000-0000-0000-0000-000000000001'
      and user_id = '90000000-0000-0000-0000-000000000002'
      and revoked_at is not null
  ) then
    raise exception 'Invitation race did not preserve revocation';
  end if;
end;
$$;
SQL

cat >"$tmpdir/edit.sql" <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local statement_timeout = '15s';
select 1
from public.receipts
where id = '94000000-0000-0000-0000-000000000001'
for update;
select pg_sleep(2);
update public.receipt_lines
set quantity = 2
where id = '95000000-0000-0000-0000-000000000001';
commit;
SQL

cat >"$tmpdir/post.sql" <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local statement_timeout = '15s';
select public.post_receipt('94000000-0000-0000-0000-000000000001');
commit;
SQL

db_exec <"$tmpdir/edit.sql" >"$tmpdir/edit.log" 2>&1 &
edit_pid=$!
sleep 0.3
set +e
db_exec <"$tmpdir/post.sql" >"$tmpdir/post.log" 2>&1
post_status=$?
wait "$edit_pid"
edit_status=$?
set -e

if [[ "$edit_status" -ne 0 || "$post_status" -ne 0 ]] ||
  grep -q "40P01\\|deadlock detected" "$tmpdir/edit.log" "$tmpdir/post.log"; then
  cat "$tmpdir/edit.log" "$tmpdir/post.log" >&2
  echo "Receipt edit/post race failed" >&2
  exit 1
fi

db_exec <<'SQL'
do $$
begin
  if not exists (
    select 1
    from public.receipts
    where id = '94000000-0000-0000-0000-000000000001'
      and status = 'posted'
  ) then
    raise exception 'Concurrent receipt was not posted';
  end if;
  if not exists (
    select 1
    from public.receipt_lines
    where id = '95000000-0000-0000-0000-000000000001'
      and quantity = 2
  ) then
    raise exception 'Concurrent line edit was not preserved';
  end if;
  if not exists (
    select 1
    from public.inventory_transactions
    where source_receipt_line_id = '95000000-0000-0000-0000-000000000001'
      and quantity_base = 2000
  ) then
    raise exception 'Concurrent posting ledger does not match receipt evidence';
  end if;
  if not exists (
    select 1
    from public.inventory_balances
    where household_id = '91000000-0000-0000-0000-000000000001'
      and grocery_item_id = '93000000-0000-0000-0000-000000000001'
      and quantity_base = 2000
  ) then
    raise exception 'Concurrent posting balance does not match its ledger';
  end if;
end;
$$;
SQL

echo "Storage API and concurrency integration tests passed"
