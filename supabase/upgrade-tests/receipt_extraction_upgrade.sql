begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

select is(
  (select count(*) from public.receipts),
  2::bigint,
  '003 preserves existing receipts'
);
select is(
  (select count(*) from public.receipt_lines),
  1::bigint,
  '003 preserves existing receipt lines'
);
select is(
  (select count(*) from public.receipts where upload_id is not null),
  2::bigint,
  '003 backfills every upload ID'
);
select is(
  (
    select status::text
    from public.receipts
    where id = '83000000-0000-4000-8000-000000000002'
  ),
  'failed',
  '003 converts interrupted processing work to failed'
);
select ok(
  (
    select extraction_retryable
    from public.receipts
    where id = '83000000-0000-4000-8000-000000000002'
  ),
  'interrupted processing work is retryable'
);
select is(
  (
    select extraction_error_code
    from public.receipts
    where id = '83000000-0000-4000-8000-000000000002'
  ),
  'interrupted',
  'interrupted processing work has a safe error code'
);
select lives_ok(
  $$update public.receipts
    set extraction_error = 'Legacy row remains mutable'
    where id = '83000000-0000-4000-8000-000000000001'$$,
  'legacy paths remain compatible with the NOT VALID owner-path constraint'
);
select has_index(
  'public',
  'receipts',
  'receipts_retryable_extraction_idx',
  '003 creates the retry index'
);
select has_function(
  'public',
  'claim_receipt_extraction',
  array['uuid', 'uuid'],
  '003 creates the guarded claim function'
);
select has_function(
  'public',
  'complete_receipt_extraction',
  array['uuid', 'uuid', 'text', 'text', 'integer', 'jsonb', 'jsonb', 'jsonb'],
  '003 creates the atomic completion function'
);
select has_function(
  'public',
  'fail_receipt_extraction',
  array['uuid', 'uuid', 'text', 'text', 'boolean'],
  '003 creates the guarded failure function'
);
select has_function(
  'public',
  'void_receipt',
  array['uuid'],
  '003 creates the void function'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'receipts_owner_bound_path'
      and convalidated = false
  ),
  'legacy owner-path constraint remains intentionally not validated'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_constraint
    where conrelid = 'public.receipts'::regclass
      and conname in (
        'receipts_upload_id_unique',
        'receipts_object_size_valid',
        'receipts_content_sha256_valid',
        'receipts_content_type_valid',
        'receipts_extraction_state_valid'
      )
  ),
  5::bigint,
  '003 installs receipt uniqueness, integrity, and extraction-state constraints'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Members can upload owner-bound household receipts'
  ),
  '003 installs owner-bound upload policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.receipts', 'insert'),
  '003 revokes direct authenticated receipt inserts'
);

select * from finish();
rollback;
