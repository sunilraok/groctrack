create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.is_finite_numeric(value numeric)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select value is null
    or value::text not in ('NaN', 'Infinity', '-Infinity');
$$;

create type public.household_role as enum ('owner', 'member');
create type public.unit_dimension as enum ('mass', 'volume', 'count');
create type public.receipt_status as enum (
  'pending',
  'processing',
  'review_ready',
  'failed',
  'posted',
  'voided'
);
create type public.inventory_transaction_type as enum (
  'purchase',
  'consumption',
  'adjustment',
  'reversal'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (household_id, user_id)
);

create index household_members_active_user_idx
  on public.household_members (user_id, household_id)
  where revoked_at is null;

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  role public.household_role not null default 'member',
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null),
  foreign key (household_id, invited_by)
    references public.household_members(household_id, user_id)
);

create unique index household_invitations_active_email_idx
  on public.household_invitations (household_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_name),
  unique (household_id, id)
);

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  normalized_name text not null,
  category text,
  unit_dimension public.unit_dimension not null,
  base_unit text not null,
  low_stock_threshold numeric(18, 6)
    constraint grocery_items_low_stock_threshold_valid
    check (
      public.is_finite_numeric(low_stock_threshold)
      and (low_stock_threshold is null or low_stock_threshold >= 0)
    ),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_name),
  unique (household_id, id),
  foreign key (household_id, created_by)
    references public.household_members(household_id, user_id),
  check (
    (unit_dimension = 'mass' and base_unit = 'g')
    or (unit_dimension = 'volume' and base_unit = 'ml')
    or (unit_dimension = 'count' and base_unit = 'each')
  )
);

create table public.merchant_item_aliases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  merchant_id uuid not null,
  normalized_alias text not null,
  raw_alias text not null,
  product_code text not null default '',
  grocery_item_id uuid not null,
  confirmation_count integer not null default 1 check (confirmation_count > 0),
  confirmed_by uuid not null references public.profiles(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (household_id, merchant_id, normalized_alias, product_code),
  foreign key (household_id, merchant_id)
    references public.merchants(household_id, id) on delete cascade,
  foreign key (household_id, grocery_item_id)
    references public.grocery_items(household_id, id),
  foreign key (household_id, confirmed_by)
    references public.household_members(household_id, user_id)
);

create index merchant_item_aliases_trgm_idx
  on public.merchant_item_aliases using gin (normalized_alias gin_trgm_ops);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  merchant_id uuid,
  image_path text not null unique,
  original_filename text not null,
  content_type text not null,
  status public.receipt_status not null default 'pending',
  purchased_at timestamptz,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  subtotal numeric(12, 2),
  discount numeric(12, 2),
  tax numeric(12, 2),
  total numeric(12, 2),
  provider text,
  provider_model text,
  extraction_schema_version integer,
  extraction_warnings jsonb not null default '[]'::jsonb,
  extraction_error text,
  posted_at timestamptz,
  posted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'posted') = (posted_at is not null)),
  check (image_path like household_id::text || '/%'),
  constraint receipts_subtotal_valid check (
    public.is_finite_numeric(subtotal)
    and (subtotal is null or subtotal >= 0)
  ),
  constraint receipts_discount_valid check (
    public.is_finite_numeric(discount)
    and (discount is null or discount >= 0)
  ),
  constraint receipts_tax_valid check (
    public.is_finite_numeric(tax)
    and (tax is null or tax >= 0)
  ),
  constraint receipts_total_valid check (
    public.is_finite_numeric(total)
    and (total is null or total >= 0)
  ),
  unique (household_id, id),
  foreign key (household_id, uploaded_by)
    references public.household_members(household_id, user_id),
  foreign key (household_id, merchant_id)
    references public.merchants(household_id, id),
  foreign key (household_id, posted_by)
    references public.household_members(household_id, user_id)
);

create index receipts_household_created_idx
  on public.receipts (household_id, created_at desc);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  receipt_id uuid not null,
  line_number integer not null check (line_number > 0),
  raw_description text not null,
  interpreted_description text,
  product_code text,
  quantity numeric(18, 6)
    constraint receipt_lines_quantity_valid
    check (
      public.is_finite_numeric(quantity)
      and (quantity is null or quantity > 0)
    ),
  unit text,
  weight numeric(18, 6)
    constraint receipt_lines_weight_valid
    check (
      public.is_finite_numeric(weight)
      and (weight is null or weight > 0)
    ),
  weight_unit text,
  unit_price numeric(12, 2)
    constraint receipt_lines_unit_price_finite
    check (public.is_finite_numeric(unit_price)),
  line_total numeric(12, 2)
    constraint receipt_lines_total_finite
    check (public.is_finite_numeric(line_total)),
  discount numeric(12, 2)
    constraint receipt_lines_discount_finite
    check (public.is_finite_numeric(discount)),
  grocery_item_id uuid,
  save_alias boolean not null default false,
  is_ambiguous boolean not null default false,
  validation_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, line_number),
  unique (household_id, id),
  foreign key (household_id, receipt_id)
    references public.receipts(household_id, id) on delete cascade,
  foreign key (household_id, grocery_item_id)
    references public.grocery_items(household_id, id)
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  grocery_item_id uuid not null,
  transaction_type public.inventory_transaction_type not null,
  quantity_base numeric(18, 6) not null
    constraint inventory_transactions_quantity_base_valid
    check (
      public.is_finite_numeric(quantity_base)
      and quantity_base <> 0
    ),
  original_quantity numeric(18, 6)
    constraint inventory_transactions_original_quantity_finite
    check (public.is_finite_numeric(original_quantity)),
  original_unit text,
  source_receipt_line_id uuid,
  reverses_transaction_id uuid,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'purchase' and quantity_base > 0)
    or (transaction_type = 'consumption' and quantity_base < 0)
    or transaction_type in ('adjustment', 'reversal')
  ),
  check (
    (transaction_type = 'reversal') = (reverses_transaction_id is not null)
  ),
  check (
    source_receipt_line_id is null
    or transaction_type = 'purchase'
  ),
  unique (household_id, id),
  foreign key (household_id, grocery_item_id)
    references public.grocery_items(household_id, id),
  foreign key (household_id, source_receipt_line_id)
    references public.receipt_lines(household_id, id),
  foreign key (household_id, reverses_transaction_id)
    references public.inventory_transactions(household_id, id),
  foreign key (household_id, created_by)
    references public.household_members(household_id, user_id)
);

create unique index inventory_transactions_receipt_line_idx
  on public.inventory_transactions (source_receipt_line_id)
  where source_receipt_line_id is not null;

create unique index inventory_transactions_reversal_idx
  on public.inventory_transactions (reverses_transaction_id)
  where reverses_transaction_id is not null;

create index inventory_transactions_item_created_idx
  on public.inventory_transactions (household_id, grocery_item_id, created_at desc);

create table public.inventory_balances (
  household_id uuid not null references public.households(id) on delete cascade,
  grocery_item_id uuid not null,
  quantity_base numeric(18, 6) not null default 0
    constraint inventory_balances_quantity_base_finite
    check (public.is_finite_numeric(quantity_base)),
  updated_at timestamptz not null default now(),
  primary key (household_id, grocery_item_id),
  foreign key (household_id, grocery_item_id)
    references public.grocery_items(household_id, id) on delete cascade
);

create view public.inventory_stock
with (security_invoker = true)
as
select
  grocery_items.id,
  grocery_items.household_id,
  grocery_items.name,
  grocery_items.normalized_name,
  grocery_items.category,
  grocery_items.unit_dimension,
  grocery_items.base_unit,
  grocery_items.low_stock_threshold::text as low_stock_threshold,
  grocery_items.is_active,
  grocery_items.created_by,
  grocery_items.created_at,
  grocery_items.updated_at,
  coalesce(inventory_balances.quantity_base, 0)::text as quantity_base,
  inventory_balances.updated_at as balance_updated_at
from public.grocery_items
left join public.inventory_balances
  on inventory_balances.household_id = grocery_items.household_id
  and inventory_balances.grocery_item_id = grocery_items.id;

create view public.inventory_transaction_history
with (security_invoker = true)
as
select
  id,
  household_id,
  grocery_item_id,
  transaction_type,
  quantity_base::text as quantity_base,
  original_quantity::text as original_quantity,
  original_unit,
  source_receipt_line_id,
  reverses_transaction_id,
  note,
  created_by,
  created_at
from public.inventory_transactions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger households_set_updated_at before update on public.households
for each row execute function public.set_updated_at();
create trigger merchants_set_updated_at before update on public.merchants
for each row execute function public.set_updated_at();
create trigger grocery_items_set_updated_at before update on public.grocery_items
for each row execute function public.set_updated_at();
create trigger receipts_set_updated_at before update on public.receipts
for each row execute function public.set_updated_at();
create trigger receipt_lines_set_updated_at before update on public.receipt_lines
for each row execute function public.set_updated_at();

create or replace function public.prevent_household_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id <> old.household_id then
    raise exception 'A record cannot be moved between households';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_membership_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'A membership cannot be reassigned to another user';
  end if;
  return new;
end;
$$;

create trigger household_members_prevent_household_change
before update on public.household_members
for each row execute function public.prevent_household_change();
create trigger household_members_prevent_user_change
before update on public.household_members
for each row execute function public.prevent_membership_reassignment();
create trigger merchants_prevent_household_change
before update on public.merchants
for each row execute function public.prevent_household_change();
create trigger grocery_items_prevent_household_change
before update on public.grocery_items
for each row execute function public.prevent_household_change();
create trigger receipts_prevent_household_change
before update on public.receipts
for each row execute function public.prevent_household_change();
create trigger receipt_lines_prevent_household_change
before update on public.receipt_lines
for each row execute function public.prevent_household_change();

create or replace function public.protect_receipt_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.id,
    new.uploaded_by,
    new.image_path,
    new.original_filename,
    new.content_type,
    new.created_at
  ) is distinct from (
    old.id,
    old.uploaded_by,
    old.image_path,
    old.original_filename,
    old.content_type,
    old.created_at
  )
  then
    raise exception 'Receipt upload identity and provenance are immutable';
  end if;
  return new;
end;
$$;

create trigger receipts_protect_origin
before update on public.receipts
for each row execute function public.protect_receipt_origin();

create or replace function public.lock_mutable_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt_id uuid;
  target_status public.receipt_status;
begin
  if tg_op = 'UPDATE' and new.receipt_id <> old.receipt_id then
    raise exception 'A receipt line cannot be moved to another receipt';
  end if;

  target_receipt_id := case when tg_op = 'DELETE' then old.receipt_id else new.receipt_id end;

  select status into target_status
  from public.receipts
  where id = target_receipt_id
  for update;

  if target_status is null then
    raise exception 'Receipt not found';
  end if;
  if target_status = 'posted' then
    raise exception 'Posted receipt lines are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger receipt_lines_lock_mutable_receipt
before insert or update or delete on public.receipt_lines
for each row execute function public.lock_mutable_receipt();

create or replace function public.protect_grocery_item_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.unit_dimension, new.base_unit)
      is distinct from (old.unit_dimension, old.base_unit)
  then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(old.id::text, 0)
    );

    if (
      exists (
        select 1
        from public.inventory_transactions
        where household_id = old.household_id
          and grocery_item_id = old.id
      )
      or exists (
        select 1
        from public.inventory_balances
        where household_id = old.household_id
          and grocery_item_id = old.id
      )
    )
    then
      raise exception 'Units cannot change after inventory history exists';
    end if;
  end if;
  return new;
end;
$$;

create trigger grocery_items_protect_units
before update on public.grocery_items
for each row execute function public.protect_grocery_item_units();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
      and revoked_at is null
  );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
      and role = 'owner'
      and revoked_at is null
  );
$$;

create or replace function public.owns_receipt_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from storage.objects
    where bucket_id = 'receipts'
      and name = object_name
      and owner_id = (select auth.uid())::text
  );
$$;

create or replace function public.can_delete_receipt_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from storage.objects
    join public.receipts
      on receipts.image_path = storage.objects.name
    where storage.objects.bucket_id = 'receipts'
      and storage.objects.name = object_name
      and storage.objects.owner_id = (select auth.uid())::text
      and receipts.uploaded_by = (select auth.uid())
      and receipts.status <> 'posted'
      and public.is_household_member(receipts.household_id)
  );
$$;

create or replace function public.set_household_member_role(
  target_household_id uuid,
  target_user_id uuid,
  new_role public.household_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_membership public.household_members%rowtype;
begin
  perform 1
  from public.households
  where id = target_household_id
  for update;

  if not found or not public.is_household_owner(target_household_id) then
    raise exception 'Household not found';
  end if;

  select * into current_membership
  from public.household_members
  where household_id = target_household_id
    and user_id = target_user_id
    and revoked_at is null
  for update;

  if current_membership.user_id is null then
    raise exception 'Active household member not found';
  end if;
  if current_membership.role = 'owner'
    and new_role <> 'owner'
    and not exists (
      select 1
      from public.household_members
      where household_id = target_household_id
        and user_id <> target_user_id
        and role = 'owner'
        and revoked_at is null
    )
  then
    raise exception 'A household must have at least one active owner';
  end if;

  update public.household_members
  set role = new_role
  where household_id = target_household_id
    and user_id = target_user_id;
end;
$$;

create or replace function public.revoke_household_member(
  target_household_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_membership public.household_members%rowtype;
  target_email text;
begin
  perform 1
  from public.households
  where id = target_household_id
  for update;

  if not found or not public.is_household_owner(target_household_id) then
    raise exception 'Household not found';
  end if;

  select * into current_membership
  from public.household_members
  where household_id = target_household_id
    and user_id = target_user_id
    and revoked_at is null
  for update;

  if current_membership.user_id is null then
    raise exception 'Active household member not found';
  end if;
  if current_membership.role = 'owner'
    and not exists (
      select 1
      from public.household_members
      where household_id = target_household_id
        and user_id <> target_user_id
        and role = 'owner'
        and revoked_at is null
    )
  then
    raise exception 'A household must have at least one active owner';
  end if;

  update public.household_members
  set revoked_at = now()
  where household_id = target_household_id
    and user_id = target_user_id;

  select email into target_email
  from auth.users
  where id = target_user_id;

  update public.household_invitations
  set revoked_at = now()
  where household_id = target_household_id
    and accepted_at is null
    and revoked_at is null
    and lower(email) = lower(target_email);
end;
$$;

create or replace function public.shares_household_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members caller_membership
    join public.household_members target_membership
      on target_membership.household_id = caller_membership.household_id
    where caller_membership.user_id = (select auth.uid())
      and target_membership.user_id = target_user_id
      and caller_membership.revoked_at is null
      and target_membership.revoked_at is null
  );
$$;

create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_household_id uuid;
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(household_name)) not between 1 and 80 then
    raise exception 'Household name must contain 1 to 80 characters';
  end if;

  insert into public.households (name, created_by)
  values (trim(household_name), caller)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, caller, 'owner');

  return new_household_id;
end;
$$;

create or replace function public.accept_household_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.household_invitations%rowtype;
  invitation_household_id uuid;
  current_membership public.household_members%rowtype;
  caller uuid := auth.uid();
  caller_email text;
  caller_email_confirmed_at timestamptz;
  invitation_token_hash text;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  select email, email_confirmed_at
  into caller_email, caller_email_confirmed_at
  from auth.users
  where id = caller;

  if caller_email is null or caller_email_confirmed_at is null then
    raise exception 'A confirmed email address is required';
  end if;

  invitation_token_hash := encode(
    extensions.digest(invitation_token, 'sha256'),
    'hex'
  );

  select household_id into invitation_household_id
  from public.household_invitations
  where token_hash = invitation_token_hash;

  if invitation_household_id is null then
    raise exception 'Invitation is invalid or expired';
  end if;

  perform 1
  from public.households
  where id = invitation_household_id
  for update;

  if not found then
    raise exception 'Invitation is invalid or expired';
  end if;

  select * into current_membership
  from public.household_members
  where household_id = invitation_household_id
    and user_id = caller
  for update;

  select * into invitation
  from public.household_invitations
  where token_hash = invitation_token_hash
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;
  if invitation.household_id <> invitation_household_id
    or invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= now()
  then
    raise exception 'Invitation is invalid or expired';
  end if;
  if lower(invitation.email) <> lower(caller_email) then
    raise exception 'Invitation belongs to another email address';
  end if;
  if current_membership.user_id is not null
    and current_membership.revoked_at is null
  then
    raise exception 'User is already an active household member';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, caller, invitation.role)
  on conflict (household_id, user_id)
  do update set
    role = excluded.role,
    joined_at = now(),
    revoked_at = null;

  update public.household_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.household_id;
end;
$$;

create or replace function public.apply_inventory_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_balances (
    household_id,
    grocery_item_id,
    quantity_base,
    updated_at
  )
  values (
    new.household_id,
    new.grocery_item_id,
    new.quantity_base,
    now()
  )
  on conflict (household_id, grocery_item_id)
  do update set
    quantity_base = public.inventory_balances.quantity_base + excluded.quantity_base,
    updated_at = now();
  return new;
end;
$$;

create trigger inventory_transaction_apply_balance
after insert on public.inventory_transactions
for each row execute function public.apply_inventory_balance();

create or replace function public.prevent_inventory_transaction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Inventory transactions are append-only';
end;
$$;

create trigger inventory_transactions_prevent_update_delete
before update or delete on public.inventory_transactions
for each row execute function public.prevent_inventory_transaction_mutation();

create or replace function public.to_base_quantity(
  quantity numeric,
  unit text,
  dimension public.unit_dimension
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if quantity is null
    or not public.is_finite_numeric(quantity)
    or quantity <= 0
  then
    raise exception 'Quantity must be finite and greater than zero';
  end if;

  return case
    when dimension = 'mass' and unit = 'mg' then quantity * 0.001
    when dimension = 'mass' and unit = 'g' then quantity
    when dimension = 'mass' and unit = 'kg' then quantity * 1000
    when dimension = 'volume' and unit = 'ml' then quantity
    when dimension = 'volume' and unit = 'l' then quantity * 1000
    when dimension = 'volume' and unit = 'tsp' then quantity * 4.92892159375
    when dimension = 'volume' and unit = 'tbsp' then quantity * 14.78676478125
    when dimension = 'count' and unit = 'each' then quantity
    when dimension = 'count' and unit = 'dozen' then quantity * 12
    else null
  end;
end;
$$;

create or replace function public.post_receipt(target_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
  receipt_line public.receipt_lines%rowtype;
  grocery_item public.grocery_items%rowtype;
  canonical_quantity numeric(18, 6);
  alias_value text;
begin
  select * into target_receipt
  from public.receipts
  where id = target_receipt_id
  for update;

  if target_receipt.id is null
    or not public.is_household_member(target_receipt.household_id) then
    raise exception 'Receipt not found';
  end if;
  if target_receipt.status <> 'review_ready' then
    raise exception 'Receipt is not ready to post';
  end if;
  if target_receipt.merchant_id is null then
    raise exception 'Receipt merchant must be confirmed';
  end if;
  if exists (
    select 1 from public.receipt_lines
    where receipt_id = target_receipt_id
      and (grocery_item_id is null or quantity is null or unit is null)
  ) then
    raise exception 'All receipt lines must have an item, quantity, and unit';
  end if;
  if exists (
    select 1 from public.receipt_lines
    where receipt_id = target_receipt_id
      and not public.is_finite_numeric(quantity)
  ) then
    raise exception 'Receipt line quantities must be finite';
  end if;
  if not exists (
    select 1 from public.receipt_lines
    where receipt_id = target_receipt_id
  ) then
    raise exception 'Receipt must contain at least one line';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(grocery_item_id::text, 0)
  )
  from (
    select distinct grocery_item_id
    from public.receipt_lines
    where receipt_id = target_receipt_id
    order by grocery_item_id
  ) as receipt_items;

  for receipt_line in
    select * from public.receipt_lines
    where receipt_id = target_receipt_id
    order by line_number
  loop
    select * into grocery_item
    from public.grocery_items
    where household_id = target_receipt.household_id
      and id = receipt_line.grocery_item_id;

    if grocery_item.id is null then
      raise exception 'Grocery item not found for receipt line %', receipt_line.line_number;
    end if;

    canonical_quantity := public.to_base_quantity(
      receipt_line.quantity,
      receipt_line.unit,
      grocery_item.unit_dimension
    );
    if canonical_quantity is null then
      raise exception 'Unsupported unit on receipt line %', receipt_line.line_number;
    end if;

    if receipt_line.save_alias then
      alias_value := upper(regexp_replace(trim(receipt_line.raw_description), '[^[:alnum:]]+', ' ', 'g'));
      insert into public.merchant_item_aliases (
        household_id,
        merchant_id,
        normalized_alias,
        raw_alias,
        product_code,
        grocery_item_id,
        confirmed_by
      )
      values (
        target_receipt.household_id,
        target_receipt.merchant_id,
        alias_value,
        receipt_line.raw_description,
        coalesce(receipt_line.product_code, ''),
        receipt_line.grocery_item_id,
        auth.uid()
      )
      on conflict (household_id, merchant_id, normalized_alias, product_code)
      do update set
        grocery_item_id = excluded.grocery_item_id,
        raw_alias = excluded.raw_alias,
        confirmation_count = public.merchant_item_aliases.confirmation_count + 1,
        confirmed_by = auth.uid(),
        last_seen_at = now();
    end if;

    insert into public.inventory_transactions (
      household_id,
      grocery_item_id,
      transaction_type,
      quantity_base,
      original_quantity,
      original_unit,
      source_receipt_line_id,
      created_by
    )
    values (
      target_receipt.household_id,
      receipt_line.grocery_item_id,
      'purchase',
      canonical_quantity,
      receipt_line.quantity,
      receipt_line.unit,
      receipt_line.id,
      auth.uid()
    );
  end loop;

  update public.receipts
  set status = 'posted', posted_at = now(), posted_by = auth.uid()
  where id = target_receipt_id;
end;
$$;

create or replace function public.record_inventory_change(
  target_grocery_item_id uuid,
  change_type public.inventory_transaction_type,
  entered_quantity numeric,
  entered_unit text,
  change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item public.grocery_items%rowtype;
  new_transaction_id uuid;
  base_quantity numeric(18, 6);
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_grocery_item_id::text, 0)
  );

  select * into target_item
  from public.grocery_items
  where id = target_grocery_item_id;

  if target_item.id is null or not public.is_household_member(target_item.household_id) then
    raise exception 'Grocery item not found';
  end if;
  if change_type not in ('consumption', 'adjustment') then
    raise exception 'Unsupported manual transaction type';
  end if;
  if entered_quantity = 0 then
    raise exception 'Quantity must not be zero';
  end if;

  base_quantity := public.to_base_quantity(
    abs(entered_quantity),
    entered_unit,
    target_item.unit_dimension
  );
  if base_quantity is null then
    raise exception 'Unit does not match the grocery item';
  end if;
  if change_type = 'consumption' then
    if entered_quantity < 0 then
      raise exception 'Consumption quantity must be positive';
    end if;
    base_quantity := -base_quantity;
  elsif entered_quantity < 0 then
    base_quantity := -base_quantity;
  end if;

  insert into public.inventory_transactions (
    household_id,
    grocery_item_id,
    transaction_type,
    quantity_base,
    original_quantity,
    original_unit,
    note,
    created_by
  )
  values (
    target_item.household_id,
    target_item.id,
    change_type,
    base_quantity,
    entered_quantity,
    entered_unit,
    nullif(trim(change_note), ''),
    auth.uid()
  )
  returning id into new_transaction_id;

  return new_transaction_id;
end;
$$;

create or replace function public.reverse_inventory_transaction(
  target_transaction_id uuid,
  reversal_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction public.inventory_transactions%rowtype;
  new_transaction_id uuid;
begin
  select * into target_transaction
  from public.inventory_transactions
  where id = target_transaction_id
  for update;

  if target_transaction.id is null
    or not public.is_household_member(target_transaction.household_id)
  then
    raise exception 'Inventory transaction not found';
  end if;
  if target_transaction.transaction_type = 'reversal' then
    raise exception 'A reversal cannot be reversed';
  end if;
  if exists (
    select 1
    from public.inventory_transactions
    where reverses_transaction_id = target_transaction.id
  ) then
    raise exception 'Inventory transaction is already reversed';
  end if;

  insert into public.inventory_transactions (
    household_id,
    grocery_item_id,
    transaction_type,
    quantity_base,
    original_quantity,
    original_unit,
    reverses_transaction_id,
    note,
    created_by
  )
  values (
    target_transaction.household_id,
    target_transaction.grocery_item_id,
    'reversal',
    -target_transaction.quantity_base,
    target_transaction.original_quantity,
    target_transaction.original_unit,
    target_transaction.id,
    nullif(trim(reversal_note), ''),
    auth.uid()
  )
  returning id into new_transaction_id;

  return new_transaction_id;
end;
$$;

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

grant execute on function public.is_finite_numeric(numeric) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.owns_receipt_object(text) to authenticated;
grant execute on function public.can_delete_receipt_object(text) to authenticated;
grant execute on function public.set_household_member_role(
  uuid,
  uuid,
  public.household_role
) to authenticated;
grant execute on function public.revoke_household_member(uuid, uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;
grant execute on function public.post_receipt(uuid) to authenticated;
grant execute on function public.record_inventory_change(
  uuid,
  public.inventory_transaction_type,
  numeric,
  text,
  text
) to authenticated;
grant execute on function public.reverse_inventory_transaction(uuid, text) to authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.households to authenticated;
grant select, update on public.household_members to authenticated;
grant select, insert, update, delete on public.household_invitations to authenticated;
grant select, insert, update on public.merchants to authenticated;
grant select, insert, update on public.grocery_items to authenticated;
grant select on public.merchant_item_aliases to authenticated;
grant select, insert, update on public.receipts to authenticated;
grant select, insert, update, delete on public.receipt_lines to authenticated;
grant select on public.inventory_transactions to authenticated;
grant select on public.inventory_balances to authenticated;
grant select on public.inventory_stock to authenticated;
grant select on public.inventory_transaction_history to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.merchants enable row level security;
alter table public.grocery_items enable row level security;
alter table public.merchant_item_aliases enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_balances enable row level security;

create policy "Users can read own profile"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.shares_household_with(id)
);
create policy "Users can update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Members can read households"
on public.households for select to authenticated
using (public.is_household_member(id));
create policy "Owners can update households"
on public.households for update to authenticated
using (public.is_household_owner(id))
with check (public.is_household_owner(id));

create policy "Members can read memberships"
on public.household_members for select to authenticated
using (public.is_household_member(household_id));
create policy "Owners can manage invitations"
on public.household_invitations for all to authenticated
using (public.is_household_owner(household_id))
with check (
  public.is_household_owner(household_id)
  and invited_by = (select auth.uid())
);

create policy "Members can read merchants"
on public.merchants for select to authenticated
using (public.is_household_member(household_id));
create policy "Members can create merchants"
on public.merchants for insert to authenticated
with check (public.is_household_member(household_id));
create policy "Members can update merchants"
on public.merchants for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can read groceries"
on public.grocery_items for select to authenticated
using (public.is_household_member(household_id));
create policy "Members can create groceries"
on public.grocery_items for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by = (select auth.uid())
);
create policy "Members can update groceries"
on public.grocery_items for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can read aliases"
on public.merchant_item_aliases for select to authenticated
using (public.is_household_member(household_id));

create policy "Members can read receipts"
on public.receipts for select to authenticated
using (public.is_household_member(household_id));
create policy "Members can create receipts"
on public.receipts for insert to authenticated
with check (
  public.is_household_member(household_id)
  and uploaded_by = (select auth.uid())
  and status = 'pending'
  and merchant_id is null
  and purchased_at is null
  and currency is null
  and subtotal is null
  and discount is null
  and tax is null
  and total is null
  and provider is null
  and provider_model is null
  and extraction_schema_version is null
  and extraction_warnings = '[]'::jsonb
  and extraction_error is null
  and posted_at is null
  and posted_by is null
  and public.owns_receipt_object(image_path)
);
create policy "Members can update unposted receipts"
on public.receipts for update to authenticated
using (
  public.is_household_member(household_id)
  and status <> 'posted'
)
with check (
  public.is_household_member(household_id)
  and status <> 'posted'
  and posted_at is null
  and posted_by is null
);

create policy "Members can read receipt lines"
on public.receipt_lines for select to authenticated
using (public.is_household_member(household_id));
create policy "Members can create receipt lines"
on public.receipt_lines for insert to authenticated
with check (
  public.is_household_member(household_id)
  and
  exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and receipts.household_id = receipt_lines.household_id
      and receipts.status <> 'posted'
  )
);
create policy "Members can update receipt lines"
on public.receipt_lines for update to authenticated
using (
  public.is_household_member(household_id)
  and
  exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and receipts.household_id = receipt_lines.household_id
      and receipts.status <> 'posted'
  )
)
with check (
  public.is_household_member(household_id)
  and
  exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and receipts.household_id = receipt_lines.household_id
      and receipts.status <> 'posted'
  )
);
create policy "Members can delete receipt lines"
on public.receipt_lines for delete to authenticated
using (
  public.is_household_member(household_id)
  and exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and receipts.household_id = receipt_lines.household_id
      and receipts.status <> 'posted'
  )
);

create policy "Members can read inventory transactions"
on public.inventory_transactions for select to authenticated
using (public.is_household_member(household_id));
create policy "Members can read inventory balances"
on public.inventory_balances for select to authenticated
using (public.is_household_member(household_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can read household receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.household_members
    where user_id = (select auth.uid())
      and household_id::text = (storage.foldername(name))[1]
      and revoked_at is null
  )
);
create policy "Members can upload household receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.household_members
    where user_id = (select auth.uid())
      and household_id::text = (storage.foldername(name))[1]
      and revoked_at is null
  )
  and owner_id = (select auth.uid())::text
);
create policy "Uploaders can remove unposted receipt images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and public.can_delete_receipt_object(name)
);
