begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(30);

select has_column(
  'public',
  'receipts',
  'upload_id',
  'receipts store idempotent upload identifiers'
);
select has_column(
  'public',
  'receipts',
  'content_sha256',
  'receipts store exact content digests'
);
select has_column(
  'public',
  'receipts',
  'raw_extraction',
  'receipts preserve raw structured extraction evidence'
);

select ok(
  not has_table_privilege('authenticated', 'public.receipts', 'insert'),
  'authenticated clients cannot bypass server receipt validation'
);
select ok(
  not has_table_privilege('authenticated', 'public.receipt_lines', 'insert'),
  'authenticated clients cannot create extraction side effects'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_receipt_extraction(uuid,uuid)',
    'execute'
  ),
  'only the service role can claim extraction work'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_receipt_extraction(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)',
    'execute'
  ),
  'the service role can atomically persist extraction results'
);
select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'receipts'
  ),
  10485760::bigint,
  'receipt storage remains capped at 10 MiB'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '71000000-0000-4000-8000-000000000001',
  'receipt-owner@example.test',
  now(),
  '{}'::jsonb
);

insert into public.households (id, name, created_by)
values (
  '72000000-0000-4000-8000-000000000001',
  'Receipt test household',
  '71000000-0000-4000-8000-000000000001'
);

insert into public.household_members (household_id, user_id, role)
values (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.receipts (
  id,
  household_id,
  uploaded_by,
  upload_id,
  image_path,
  original_filename,
  content_type,
  object_size,
  content_sha256
)
values (
  '73000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000001.jpg',
  'receipt.jpg',
  'image/jpeg',
  4,
  repeat('a', 64)
);

insert into public.receipts (
  id,
  household_id,
  uploaded_by,
  upload_id,
  image_path,
  original_filename,
  content_type,
  object_size,
  content_sha256,
  status,
  posted_at,
  posted_by
)
values
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000002.jpg',
    'failure.jpg',
    'image/jpeg',
    4,
    repeat('b', 64),
    'pending',
    null,
    null
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000003.jpg',
    'posted.jpg',
    'image/jpeg',
    4,
    repeat('c', 64),
    'posted',
    now(),
    '71000000-0000-4000-8000-000000000001'
  );

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001'
  ),
  'service role claims pending extraction work'
);
select ok(
  not public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000002'
  ),
  'a live processing lease prevents duplicate provider work'
);

update public.receipts
set processing_started_at = now() - interval '6 minutes'
where id = '73000000-0000-4000-8000-000000000001';

select ok(
  public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000002'
  ),
  'an expired processing lease can be reclaimed'
);
select ok(
  not public.complete_receipt_extraction(
    '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    'fake',
    'deterministic-v1',
    1,
    '{"merchant_name":null}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  ),
  'a stale worker cannot persist extraction side effects'
);
select ok(
  public.complete_receipt_extraction(
    '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000002',
    'fake',
    'deterministic-v1',
    1,
    '{
      "merchant_name":"Exact Market",
      "purchased_at":null,
      "currency":"USD",
      "subtotal":"9999999999.99",
      "discount":null,
      "tax":null,
      "total":"9999999999.99",
      "lines":[{
        "raw_description":"BULK",
        "quantity":"999999999998.123456"
      }]
    }'::jsonb,
    '[]'::jsonb,
    '[{
      "line_number":1,
      "raw_description":"BULK",
      "interpreted_description":null,
      "product_code":null,
      "quantity":"999999999998.123456",
      "unit":"g",
      "weight":null,
      "weight_unit":null,
      "unit_price":null,
      "line_total":"9999999999.99",
      "discount":null,
      "is_ambiguous":false,
      "validation_warnings":[]
    }]'::jsonb
  ),
  'the current lease atomically persists exact extraction evidence'
);
select is(
  (
    select status::text
    from public.receipts
    where id = '73000000-0000-4000-8000-000000000001'
  ),
  'review_ready',
  'successful extraction transitions to review ready'
);
select is(
  (
    select quantity::text
    from public.receipt_lines
    where receipt_id = '73000000-0000-4000-8000-000000000001'
  ),
  '999999999998.123456',
  'quantity evidence round trips without IEEE-754 loss'
);
select is(
  (
    select total::text
    from public.receipts
    where id = '73000000-0000-4000-8000-000000000001'
  ),
  '9999999999.99',
  'money evidence round trips exactly'
);
select is(
  (select count(*) from public.inventory_transactions),
  0::bigint,
  'receipt extraction never mutates inventory'
);

select ok(
  public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000003'
  ),
  'failure lifecycle starts from a guarded claim'
);
select ok(
  not public.fail_receipt_extraction(
    '73000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000099',
    'transient',
    'Temporary failure.',
    true
  ),
  'a stale run token cannot record failure'
);
select ok(
  public.fail_receipt_extraction(
    '73000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000003',
    'transient',
    'Temporary failure.',
    true
  ),
  'the current run token records retryable failure'
);
select is(
  (
    select status::text
    from public.receipts
    where id = '73000000-0000-4000-8000-000000000002'
  ),
  'failed',
  'failure transition clears processing state'
);
select ok(
  public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000004'
  ),
  'retryable failed work can be reclaimed'
);
select ok(
  public.fail_receipt_extraction(
    '73000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000004',
    'permanent',
    'Permanent failure.',
    false
  ),
  'current work can record a non-retryable failure'
);
select ok(
  not public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000005'
  ),
  'non-retryable failed work cannot be claimed'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select ok(
  public.void_receipt('73000000-0000-4000-8000-000000000002'),
  'a household member can void failed work'
);
select ok(
  not public.void_receipt('73000000-0000-4000-8000-000000000002'),
  'voiding is idempotent'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  not public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000006'
  ),
  'voided work cannot be claimed'
);
select ok(
  not public.claim_receipt_extraction(
    '73000000-0000-4000-8000-000000000003',
    '75000000-0000-4000-8000-000000000007'
  ),
  'posted work cannot be claimed'
);
select throws_ok(
  $$update public.receipts
    set status = 'pending', posted_at = null, posted_by = null
    where id = '73000000-0000-4000-8000-000000000003'$$,
  'P0001',
  'Invalid receipt status transition',
  'invalid lifecycle transitions are rejected'
);
select throws_ok(
  $$insert into public.receipts (
      household_id,
      uploaded_by,
      upload_id,
      image_path,
      original_filename,
      content_type,
      status
    )
    values (
      '72000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000099',
      '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000099.jpg',
      'invalid-processing.jpg',
      'image/jpeg',
      'processing'
    )$$,
  '23514',
  null,
  'processing rows require a run token and start time'
);

select * from finish();
rollback;
