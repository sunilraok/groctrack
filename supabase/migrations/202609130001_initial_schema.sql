create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

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
  primary key (household_id, user_id)
);

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  role public.household_role not null default 'member',
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index household_invitations_active_email_idx
  on public.household_invitations (household_id, lower(email))
  where accepted_at is null;

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_name)
);

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  normalized_name text not null,
  category text,
  unit_dimension public.unit_dimension not null,
  base_unit text not null,
  low_stock_threshold numeric(18, 6) check (low_stock_threshold is null or low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_name),
  check (
    (unit_dimension = 'mass' and base_unit = 'g')
    or (unit_dimension = 'volume' and base_unit = 'ml')
    or (unit_dimension = 'count' and base_unit = 'each')
  )
);

create table public.merchant_item_aliases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  normalized_alias text not null,
  raw_alias text not null,
  product_code text not null default '',
  grocery_item_id uuid not null references public.grocery_items(id),
  confirmation_count integer not null default 1 check (confirmation_count > 0),
  confirmed_by uuid not null references public.profiles(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (household_id, merchant_id, normalized_alias, product_code)
);

create index merchant_item_aliases_trgm_idx
  on public.merchant_item_aliases using gin (normalized_alias gin_trgm_ops);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  merchant_id uuid references public.merchants(id),
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
  check ((status = 'posted') = (posted_at is not null))
);

create index receipts_household_created_idx
  on public.receipts (household_id, created_at desc);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  raw_description text not null,
  interpreted_description text,
  product_code text,
  quantity numeric(18, 6) check (quantity is null or quantity > 0),
  unit text,
  weight numeric(18, 6) check (weight is null or weight > 0),
  weight_unit text,
  unit_price numeric(12, 2),
  line_total numeric(12, 2),
  discount numeric(12, 2),
  grocery_item_id uuid references public.grocery_items(id),
  save_alias boolean not null default false,
  is_ambiguous boolean not null default false,
  validation_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, line_number)
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  grocery_item_id uuid not null references public.grocery_items(id),
  transaction_type public.inventory_transaction_type not null,
  quantity_base numeric(18, 6) not null check (quantity_base <> 0),
  original_quantity numeric(18, 6),
  original_unit text,
  source_receipt_line_id uuid references public.receipt_lines(id),
  reverses_transaction_id uuid references public.inventory_transactions(id),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'purchase' and quantity_base > 0)
    or (transaction_type = 'consumption' and quantity_base < 0)
    or transaction_type in ('adjustment', 'reversal')
  ),
  check (
    transaction_type = 'reversal'
    or reverses_transaction_id is null
  )
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
  grocery_item_id uuid not null references public.grocery_items(id) on delete cascade,
  quantity_base numeric(18, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (household_id, grocery_item_id)
);

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
  caller uuid := auth.uid();
  caller_email text;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  select email into caller_email from auth.users where id = caller;
  select * into invitation
  from public.household_invitations
  where token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;
  if lower(invitation.email) <> lower(caller_email) then
    raise exception 'Invitation belongs to another email address';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, caller, invitation.role)
  on conflict (household_id, user_id) do nothing;

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

create or replace function public.post_receipt(target_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
  receipt_line public.receipt_lines%rowtype;
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

  for receipt_line in
    select * from public.receipt_lines
    where receipt_id = target_receipt_id
    order by line_number
  loop
    canonical_quantity := case receipt_line.unit
      when 'mg' then receipt_line.quantity * 0.001
      when 'g' then receipt_line.quantity
      when 'kg' then receipt_line.quantity * 1000
      when 'ml' then receipt_line.quantity
      when 'l' then receipt_line.quantity * 1000
      when 'tsp' then receipt_line.quantity * 4.92892159375
      when 'tbsp' then receipt_line.quantity * 14.78676478125
      when 'each' then receipt_line.quantity
      when 'dozen' then receipt_line.quantity * 12
      else null
    end;

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
  base_quantity numeric,
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
begin
  select * into target_item
  from public.grocery_items
  where id = target_grocery_item_id;

  if target_item.id is null or not public.is_household_member(target_item.household_id) then
    raise exception 'Grocery item not found';
  end if;
  if change_type not in ('consumption', 'adjustment') then
    raise exception 'Unsupported manual transaction type';
  end if;
  if base_quantity = 0 or entered_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if change_type = 'consumption' and base_quantity > 0 then
    raise exception 'Consumption quantity must be negative';
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

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
grant execute on function public.post_receipt(uuid) to authenticated;
grant execute on function public.record_inventory_change(
  uuid,
  public.inventory_transaction_type,
  numeric,
  numeric,
  text,
  text
) to authenticated;

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
using (id = (select auth.uid()));
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
create policy "Owners can update memberships"
on public.household_members for update to authenticated
using (public.is_household_owner(household_id))
with check (public.is_household_owner(household_id));
create policy "Owners can remove memberships"
on public.household_members for delete to authenticated
using (
  public.is_household_owner(household_id)
  and user_id <> (select auth.uid())
);

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
);
create policy "Members can update unposted receipts"
on public.receipts for update to authenticated
using (
  public.is_household_member(household_id)
  and status <> 'posted'
)
with check (public.is_household_member(household_id));

create policy "Members can read receipt lines"
on public.receipt_lines for select to authenticated
using (
  exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and public.is_household_member(receipts.household_id)
  )
);
create policy "Members can create receipt lines"
on public.receipt_lines for insert to authenticated
with check (
  exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and receipts.status <> 'posted'
      and public.is_household_member(receipts.household_id)
  )
);
create policy "Members can update receipt lines"
on public.receipt_lines for update to authenticated
using (
  exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and receipts.status <> 'posted'
      and public.is_household_member(receipts.household_id)
  )
)
with check (
  exists (
    select 1 from public.receipts
    where receipts.id = receipt_lines.receipt_id
      and receipts.status <> 'posted'
      and public.is_household_member(receipts.household_id)
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
  and public.is_household_member(((storage.foldername(name))[1])::uuid)
);
create policy "Members can upload household receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and public.is_household_member(((storage.foldername(name))[1])::uuid)
);
create policy "Uploaders can remove unposted receipt images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.receipts
    where receipts.image_path = name
      and receipts.uploaded_by = (select auth.uid())
      and receipts.status <> 'posted'
  )
);
