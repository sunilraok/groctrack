alter table public.receipts
add column upload_id uuid,
add column object_size bigint,
add column content_sha256 text,
add column extraction_run_id uuid,
add column extraction_attempts integer not null default 0,
add column processing_started_at timestamptz,
add column extraction_retryable boolean not null default false,
add column extraction_error_code text,
add column raw_extraction jsonb;

update public.receipts
set upload_id = gen_random_uuid()
where upload_id is null;

alter table public.receipts
alter column upload_id set not null;

update public.receipts
set
  status = 'failed',
  extraction_retryable = true,
  extraction_error_code = 'interrupted',
  extraction_error = 'Extraction was interrupted and can be retried.'
where status = 'processing';

alter table public.receipts
add constraint receipts_upload_id_unique
unique (household_id, uploaded_by, upload_id);

alter table public.receipts
add constraint receipts_object_size_valid
check (object_size is null or object_size between 1 and 10485760);

alter table public.receipts
add constraint receipts_content_sha256_valid
check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');

alter table public.receipts
add constraint receipts_content_type_valid
check (
  content_type in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  )
);

alter table public.receipts
add constraint receipts_owner_bound_path
check (
  (
    object_size is null
    and content_sha256 is null
  )
  or image_path like
      household_id::text || '/' || uploaded_by::text || '/' || upload_id::text || '.%'
) not valid;

alter table public.receipts
add constraint receipts_extraction_state_valid
check (
  (
    status = 'processing'
    and extraction_run_id is not null
    and processing_started_at is not null
  )
  or (
    status <> 'processing'
    and extraction_run_id is null
    and processing_started_at is null
  )
);

create index receipts_retryable_extraction_idx
on public.receipts (updated_at)
where status = 'failed' and extraction_retryable;

drop policy "Members can create receipts" on public.receipts;
drop policy "Members can update unposted receipts" on public.receipts;
drop policy "Members can create receipt lines" on public.receipt_lines;
drop policy "Members can update receipt lines" on public.receipt_lines;
drop policy "Members can delete receipt lines" on public.receipt_lines;

revoke insert, update on public.receipts from authenticated;
revoke insert, update, delete on public.receipt_lines from authenticated;

drop policy "Members can upload household receipts" on storage.objects;
create policy "Members can upload owner-bound household receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.household_members
    where user_id = (select auth.uid())
      and household_id::text = (storage.foldername(name))[1]
      and revoked_at is null
  )
);

create or replace function public.protect_receipt_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'pending' and new.status in ('processing', 'voided'))
    or (old.status = 'processing' and new.status in ('review_ready', 'failed'))
    or (old.status = 'failed' and new.status in ('processing', 'voided'))
    or (old.status = 'review_ready' and new.status in ('processing', 'posted', 'voided'))
  ) then
    raise exception 'Invalid receipt status transition';
  end if;

  return new;
end;
$$;

create trigger receipts_protect_lifecycle
before update on public.receipts
for each row execute function public.protect_receipt_lifecycle();

create or replace function public.claim_receipt_extraction(
  target_receipt_id uuid,
  new_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if new_run_id is null then
    raise exception 'Extraction run ID is required';
  end if;

  select * into target_receipt
  from public.receipts
  where id = target_receipt_id
  for update;

  if target_receipt.id is null then
    raise exception 'Receipt not found';
  end if;
  if target_receipt.status = 'review_ready' then
    return false;
  end if;
  if target_receipt.status = 'failed' and not target_receipt.extraction_retryable then
    return false;
  end if;
  if target_receipt.status = 'processing'
    and target_receipt.processing_started_at >= now() - interval '5 minutes'
  then
    return false;
  end if;
  if target_receipt.status not in ('pending', 'processing', 'failed') then
    return false;
  end if;

  update public.receipts
  set
    status = 'processing',
    extraction_run_id = new_run_id,
    extraction_attempts = extraction_attempts + 1,
    processing_started_at = now(),
    extraction_retryable = false,
    extraction_error = null,
    extraction_error_code = null
  where id = target_receipt_id;

  return true;
end;
$$;

create or replace function public.fail_receipt_extraction(
  target_receipt_id uuid,
  expected_run_id uuid,
  error_code text,
  safe_error text,
  retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if error_code is null or length(error_code) > 40
    or safe_error is null or length(safe_error) > 250
  then
    raise exception 'Invalid extraction error';
  end if;

  update public.receipts
  set
    status = 'failed',
    extraction_run_id = null,
    processing_started_at = null,
    extraction_retryable = retryable,
    extraction_error_code = error_code,
    extraction_error = safe_error
  where id = target_receipt_id
    and status = 'processing'
    and extraction_run_id = expected_run_id;

  return found;
end;
$$;

create or replace function public.complete_receipt_extraction(
  target_receipt_id uuid,
  expected_run_id uuid,
  extraction_provider text,
  extraction_model text,
  schema_version integer,
  extracted_receipt jsonb,
  warnings jsonb,
  lines jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
  merchant_name text;
  normalized_merchant text;
  resolved_merchant_id uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if extraction_provider is null or length(extraction_provider) > 40
    or extraction_model is null or length(extraction_model) > 120
    or schema_version is null or schema_version < 1
    or jsonb_typeof(extracted_receipt) <> 'object'
    or jsonb_typeof(warnings) <> 'array'
    or jsonb_typeof(lines) <> 'array'
  then
    raise exception 'Invalid extraction result';
  end if;

  select * into target_receipt
  from public.receipts
  where id = target_receipt_id
  for update;

  if target_receipt.id is null
    or target_receipt.status <> 'processing'
    or target_receipt.extraction_run_id <> expected_run_id
  then
    return false;
  end if;

  merchant_name := nullif(trim(extracted_receipt ->> 'merchant_name'), '');
  if merchant_name is not null then
    normalized_merchant := lower(regexp_replace(merchant_name, '\s+', ' ', 'g'));
    insert into public.merchants (household_id, name, normalized_name)
    values (target_receipt.household_id, merchant_name, normalized_merchant)
    on conflict (household_id, normalized_name)
    do update set name = excluded.name
    returning id into resolved_merchant_id;
  end if;

  delete from public.receipt_lines
  where receipt_id = target_receipt_id;

  insert into public.receipt_lines (
    household_id,
    receipt_id,
    line_number,
    raw_description,
    interpreted_description,
    product_code,
    quantity,
    unit,
    weight,
    weight_unit,
    unit_price,
    line_total,
    discount,
    is_ambiguous,
    validation_warnings
  )
  select
    target_receipt.household_id,
    target_receipt_id,
    line.line_number,
    line.raw_description,
    line.interpreted_description,
    line.product_code,
    line.quantity,
    line.unit,
    line.weight,
    line.weight_unit,
    line.unit_price,
    line.line_total,
    line.discount,
    line.is_ambiguous,
    line.validation_warnings
  from jsonb_to_recordset(lines) as line(
    line_number integer,
    raw_description text,
    interpreted_description text,
    product_code text,
    quantity numeric,
    unit text,
    weight numeric,
    weight_unit text,
    unit_price numeric,
    line_total numeric,
    discount numeric,
    is_ambiguous boolean,
    validation_warnings jsonb
  );

  update public.receipts
  set
    merchant_id = resolved_merchant_id,
    purchased_at = nullif(extracted_receipt ->> 'purchased_at', '')::timestamptz,
    currency = nullif(extracted_receipt ->> 'currency', ''),
    subtotal = nullif(extracted_receipt ->> 'subtotal', '')::numeric,
    discount = nullif(extracted_receipt ->> 'discount', '')::numeric,
    tax = nullif(extracted_receipt ->> 'tax', '')::numeric,
    total = nullif(extracted_receipt ->> 'total', '')::numeric,
    provider = extraction_provider,
    provider_model = extraction_model,
    extraction_schema_version = schema_version,
    extraction_warnings = warnings,
    raw_extraction = extracted_receipt,
    extraction_error = null,
    extraction_error_code = null,
    extraction_retryable = false,
    extraction_run_id = null,
    processing_started_at = null,
    status = 'review_ready'
  where id = target_receipt_id;

  return true;
end;
$$;

create or replace function public.void_receipt(target_receipt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
begin
  select * into target_receipt
  from public.receipts
  where id = target_receipt_id
  for update;

  if target_receipt.id is null
    or not public.is_household_member(target_receipt.household_id)
  then
    raise exception 'Receipt not found';
  end if;
  if target_receipt.status = 'voided' then
    return false;
  end if;
  if target_receipt.status not in ('pending', 'failed', 'review_ready') then
    raise exception 'Receipt cannot be voided in its current state';
  end if;

  update public.receipts
  set
    status = 'voided',
    extraction_run_id = null,
    processing_started_at = null,
    extraction_retryable = false
  where id = target_receipt_id;

  return true;
end;
$$;

create or replace function public.cleanup_unlinked_receipt_object(object_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  delete from storage.objects
  where bucket_id = 'receipts'
    and name = object_name
    and not exists (
      select 1
      from public.receipts
      where receipts.image_path = object_name
    );

  return found;
end;
$$;

revoke all on function public.claim_receipt_extraction(uuid, uuid) from public;
revoke all on function public.fail_receipt_extraction(uuid, uuid, text, text, boolean) from public;
revoke all on function public.complete_receipt_extraction(
  uuid,
  uuid,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  jsonb
) from public;
revoke all on function public.void_receipt(uuid) from public;
revoke all on function public.cleanup_unlinked_receipt_object(text) from public;

grant execute on function public.claim_receipt_extraction(uuid, uuid) to service_role;
grant execute on function public.fail_receipt_extraction(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.complete_receipt_extraction(
  uuid,
  uuid,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  jsonb
) to service_role;
grant execute on function public.void_receipt(uuid) to authenticated;
grant execute on function public.cleanup_unlinked_receipt_object(text) to service_role;
