begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

select has_column('public', 'receipts', 'upload_id');
select has_column('public', 'receipts', 'content_sha256');
select has_column('public', 'receipts', 'raw_extraction');

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

select * from finish();
rollback;
