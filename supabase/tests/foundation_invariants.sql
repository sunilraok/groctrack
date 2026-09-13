begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(47);

select ok(
  not has_function_privilege('anon', 'public.create_household(text)', 'execute'),
  'anonymous users cannot create households through the RPC'
);
select ok(
  not has_function_privilege('anon', 'public.post_receipt(uuid)', 'execute'),
  'anonymous users cannot post receipts through the RPC'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'owner-a@example.test',
    now(),
    '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'member-a@example.test',
    now(),
    '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'owner-b@example.test',
    now(),
    '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'unconfirmed@example.test',
    null,
    '{}'::jsonb
  );

insert into public.households (id, name, created_by)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'Household A',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Household B',
    '10000000-0000-0000-0000-000000000003'
  );

insert into public.household_members (household_id, user_id, role)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'owner'
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'member'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    'owner'
  );

insert into public.merchants (id, household_id, name, normalized_name)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Market',
  'MARKET'
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
values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Rice',
    'RICE',
    'mass',
    'g',
    '10000000-0000-0000-0000-000000000002'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Milk',
    'MILK',
    'volume',
    'ml',
    '10000000-0000-0000-0000-000000000003'
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
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001/receipt.jpg',
  'receipt.jpg',
  'image/jpeg',
  'review_ready'
);

insert into public.receipts (
  id,
  household_id,
  uploaded_by,
  image_path,
  original_filename,
  content_type
)
values (
  '50000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001/owner-upload.jpg',
  'owner-upload.jpg',
  'image/jpeg'
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
  '50000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001/nan-receipt.jpg',
  'nan-receipt.jpg',
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
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  1,
  'RICE 1KG',
  1,
  'kg',
  '40000000-0000-0000-0000-000000000001'
);

insert into storage.objects (bucket_id, name)
values
  (
    'receipts',
    '20000000-0000-0000-0000-000000000001/receipt.jpg'
  ),
  (
    'receipts',
    '20000000-0000-0000-0000-000000000001/owner-upload.jpg'
  );

insert into public.household_invitations (
  household_id,
  email,
  token_hash,
  invited_by,
  expires_at
)
values (
  '20000000-0000-0000-0000-000000000001',
  'member-a@example.test',
  encode(extensions.digest('pre-revocation-token', 'sha256'), 'hex'),
  '10000000-0000-0000-0000-000000000001',
  now() + interval '1 day'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.grocery_items),
  1::bigint,
  'RLS hides another household grocery item'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'receipts'),
  0::bigint,
  'storage RLS hides another household receipt'
);
select throws_ok(
  $$select public.record_inventory_change(
    '40000000-0000-0000-0000-000000000001',
    'consumption',
    1,
    'kg',
    null
  )$$,
  'P0001',
  'Grocery item not found',
  'cross-household inventory RPC access is rejected'
);
select throws_ok(
  $$select public.post_receipt('50000000-0000-0000-0000-000000000001')$$,
  'P0001',
  'Receipt not found',
  'cross-household receipt RPC access is rejected'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$update public.receipts
    set uploaded_by = '10000000-0000-0000-0000-000000000002'
    where id = '50000000-0000-0000-0000-000000000003'$$,
  'P0001',
  'Receipt upload identity and provenance are immutable',
  'a member cannot claim another member receipt upload'
);
select is(
  (
    with deleted as (
      delete from storage.objects
      where bucket_id = 'receipts'
        and name = '20000000-0000-0000-0000-000000000001/owner-upload.jpg'
      returning name
    )
    select count(*) from deleted
  ),
  0::bigint,
  'a member cannot delete another uploader receipt object'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.receipts (
      household_id,
      uploaded_by,
      image_path,
      original_filename,
      content_type
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001/pending.jpg',
      'pending.jpg',
      'image/jpeg'
    )$$,
  'an active member can create a receipt in the exact initial state'
);
select throws_ok(
  $$insert into public.receipts (
      household_id,
      uploaded_by,
      image_path,
      original_filename,
      content_type,
      status,
      posted_at,
      posted_by
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001/forged-posted.jpg',
      'forged-posted.jpg',
      'image/jpeg',
      'posted',
      now(),
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'authenticated users cannot insert an already-posted receipt'
);
select throws_ok(
  $$insert into public.receipts (
      household_id,
      uploaded_by,
      image_path,
      original_filename,
      content_type,
      posted_by
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001/false-attribution.jpg',
      'false-attribution.jpg',
      'image/jpeg',
      '10000000-0000-0000-0000-000000000002'
    )$$,
  '42501',
  null,
  'authenticated users cannot forge receipt posting attribution'
);
select throws_ok(
  $$select public.record_inventory_change(
    '40000000-0000-0000-0000-000000000001',
    'adjustment',
    'NaN'::numeric,
    'g',
    null
  )$$,
  'P0001',
  'Quantity must be finite and greater than zero',
  'manual inventory changes reject NaN'
);
select throws_ok(
  $$insert into public.receipt_lines (
      household_id,
      receipt_id,
      line_number,
      raw_description,
      quantity,
      unit,
      grocery_item_id
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      2,
      'INVALID NAN',
      'NaN'::numeric,
      'g',
      '40000000-0000-0000-0000-000000000001'
    )$$,
  '23514',
  null,
  'receipt line constraints reject NaN'
);

select lives_ok(
  $$select public.revoke_household_member(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002'
  )$$,
  'an owner can revoke a member with referenced audit records'
);

reset role;
select ok(
  (
    select revoked_at is not null
    from public.household_members
    where household_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000002'
  ),
  'revocation preserves the membership audit row'
);
select is(
  (
    select created_by
    from public.grocery_items
    where id = '40000000-0000-0000-0000-000000000001'
  ),
  '10000000-0000-0000-0000-000000000002'::uuid,
  'revocation preserves references to the member identity'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.households),
  0::bigint,
  'a revoked member loses household access'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'receipts'),
  0::bigint,
  'a revoked member loses receipt storage access'
);
select throws_ok(
  $$select public.accept_household_invitation('pre-revocation-token')$$,
  'P0001',
  'Invitation is invalid or expired',
  'revocation invalidates outstanding invitations for that member'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$update public.household_members
    set role = 'owner'
    where household_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'membership changes must use transactional RPCs'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.revoke_household_member(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003'
  )$$,
  'P0001',
  'A household must have at least one active owner',
  'the sole owner cannot revoke themselves'
);
select throws_ok(
  $$select public.set_household_member_role(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    'member'
  )$$,
  'P0001',
  'A household must have at least one active owner',
  'the sole owner cannot demote themselves'
);

reset role;
insert into public.household_invitations (
  household_id,
  email,
  token_hash,
  invited_by,
  expires_at
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'unconfirmed@example.test',
    encode(extensions.digest('unconfirmed-token', 'sha256'), 'hex'),
    '10000000-0000-0000-0000-000000000001',
    now() + interval '1 day'
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'member-a@example.test',
    encode(extensions.digest('valid-token', 'sha256'), 'hex'),
    '10000000-0000-0000-0000-000000000001',
    now() + interval '1 day'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.accept_household_invitation('unconfirmed-token')$$,
  'P0001',
  'A confirmed email address is required',
  'an unconfirmed account cannot accept an invitation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.accept_household_invitation('valid-token')$$,
  'a confirmed invited account can accept an invitation'
);

reset role;
select ok(
  (
    select revoked_at is null
    from public.household_members
    where household_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000002'
  ),
  'accepting a new invitation reactivates a revoked membership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.accept_household_invitation('valid-token')$$,
  'P0001',
  'Invitation is invalid or expired',
  'an accepted invitation cannot be replayed'
);

reset role;
insert into public.household_invitations (
  household_id,
  email,
  token_hash,
  invited_by,
  created_at,
  expires_at
)
values (
  '20000000-0000-0000-0000-000000000001',
  'member-a@example.test',
  encode(extensions.digest('expired-token', 'sha256'), 'hex'),
  '10000000-0000-0000-0000-000000000001',
  now() - interval '2 days',
  now() - interval '1 day'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.accept_household_invitation('expired-token')$$,
  'P0001',
  'Invitation is invalid or expired',
  'an expired invitation cannot be accepted'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.post_receipt('50000000-0000-0000-0000-000000000001')$$,
  'a reviewed receipt posts atomically'
);
select is(
  (
    select status
    from public.receipts
    where id = '50000000-0000-0000-0000-000000000001'
  ),
  'posted'::public.receipt_status,
  'posting marks the receipt posted'
);
select is(
  (
    select quantity_base
    from public.inventory_balances
    where household_id = '20000000-0000-0000-0000-000000000001'
      and grocery_item_id = '40000000-0000-0000-0000-000000000001'
  ),
  1000::numeric,
  'posting projects the normalized purchase balance'
);
select throws_ok(
  $$select public.post_receipt('50000000-0000-0000-0000-000000000001')$$,
  'P0001',
  'Receipt is not ready to post',
  'a receipt cannot be posted twice'
);
select throws_ok(
  $$insert into public.receipt_lines (
      household_id,
      receipt_id,
      line_number,
      raw_description
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      2,
      'LATE LINE'
    )$$,
  'P0001',
  'Posted receipt lines are immutable',
  'receipt lines cannot be inserted after posting'
);
select throws_ok(
  $$update public.receipt_lines
    set raw_description = 'CHANGED'
    where id = '60000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Posted receipt lines are immutable',
  'receipt lines cannot be updated after posting'
);
select throws_ok(
  $$delete from public.receipt_lines
    where id = '60000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Posted receipt lines are immutable',
  'receipt lines cannot be deleted after posting'
);
select throws_ok(
  $$update public.grocery_items
    set unit_dimension = 'count', base_unit = 'each'
    where id = '40000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Units cannot change after inventory history exists',
  'canonical units are immutable after ledger use'
);
select lives_ok(
  $$select public.reverse_inventory_transaction(
    (
      select id
      from public.inventory_transactions
      where source_receipt_line_id = '60000000-0000-0000-0000-000000000001'
    ),
    'Test reversal'
  )$$,
  'a purchase transaction can be reversed once'
);
select is(
  (
    select quantity_base
    from public.inventory_balances
    where household_id = '20000000-0000-0000-0000-000000000001'
      and grocery_item_id = '40000000-0000-0000-0000-000000000001'
  ),
  0::numeric,
  'a reversal updates the projected balance'
);
select throws_ok(
  $$select public.reverse_inventory_transaction(
    (
      select id
      from public.inventory_transactions
      where source_receipt_line_id = '60000000-0000-0000-0000-000000000001'
    ),
    null
  )$$,
  'P0001',
  'Inventory transaction is already reversed',
  'the same transaction cannot be reversed twice'
);
select throws_ok(
  $$select public.reverse_inventory_transaction(
    (
      select id
      from public.inventory_transactions
      where reverses_transaction_id is not null
    ),
    null
  )$$,
  'P0001',
  'A reversal cannot be reversed',
  'a reversal transaction cannot itself be reversed'
);
select is(
  (
    select count(*)
    from public.inventory_transactions
    where household_id = '20000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'duplicate posting and reversal attempts create no extra ledger rows'
);
select is(
  (
    select count(*)
    from public.receipt_lines
    where receipt_id = '50000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'posted receipt evidence remains consistent with its ledger'
);

reset role;
select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'receipt_lines_lock_mutable_receipt'
      and not tgisinternal
  ),
  'receipt line mutations use the parent receipt serialization trigger'
);
select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.revoke_household_member(uuid,uuid)'::regprocedure
      and prosecdef
  ),
  'membership revocation uses a transactional security-definer RPC'
);
select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.set_household_member_role(uuid,uuid,public.household_role)'::regprocedure
      and prosecdef
  ),
  'owner role changes use a transactional security-definer RPC'
);
select ok(
  not public.is_finite_numeric('Infinity'::numeric),
  'positive numeric infinity is rejected'
);
select ok(
  not public.is_finite_numeric('-Infinity'::numeric),
  'negative numeric infinity is rejected'
);

alter table public.receipt_lines
  drop constraint receipt_lines_quantity_valid;
insert into public.receipt_lines (
  household_id,
  receipt_id,
  line_number,
  raw_description,
  quantity,
  unit,
  grocery_item_id
)
values (
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  1,
  'CORRUPT NAN',
  'NaN'::numeric,
  'g',
  '40000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.post_receipt('50000000-0000-0000-0000-000000000002')$$,
  'P0001',
  'Receipt line quantities must be finite',
  'receipt posting rejects non-finite persisted quantities defensively'
);

select * from finish();
rollback;
