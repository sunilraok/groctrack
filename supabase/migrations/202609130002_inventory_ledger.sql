alter table public.inventory_transactions
add column operation_id uuid;

alter table public.inventory_transactions
add constraint inventory_transactions_receipt_source_type
check (
  source_receipt_line_id is null
  or transaction_type = 'purchase'
);

alter table public.inventory_transactions
add constraint inventory_transactions_manual_operation
check (
  operation_id is null
  or transaction_type in ('consumption', 'adjustment')
);

create unique index inventory_transactions_operation_idx
on public.inventory_transactions (household_id, created_by, operation_id)
where operation_id is not null;

create or replace function public.protect_grocery_item_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.household_id, new.created_by)
      is distinct from (old.household_id, old.created_by)
  then
    raise exception 'Grocery item household and creator are immutable';
  end if;
  if (new.unit_dimension, new.base_unit)
      is distinct from (old.unit_dimension, old.base_unit)
  then
    raise exception 'Grocery item units are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists grocery_items_protect_units
on public.grocery_items;

create trigger grocery_items_protect_units
before update on public.grocery_items
for each row execute function public.protect_grocery_item_units();

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

drop function public.record_inventory_change(
  uuid,
  public.inventory_transaction_type,
  numeric,
  text,
  text
);

create or replace function public.record_inventory_change(
  target_grocery_item_id uuid,
  change_type public.inventory_transaction_type,
  entered_quantity numeric,
  entered_unit text,
  client_operation_id uuid,
  change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item public.grocery_items%rowtype;
  existing_transaction public.inventory_transactions%rowtype;
  new_transaction_id uuid;
  base_quantity numeric(18, 6);
  normalized_note text := nullif(trim(change_note), '');
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  if client_operation_id is null then
    raise exception 'Operation ID is required';
  end if;
  if entered_quantity is not null
    and public.is_finite_numeric(entered_quantity)
    and scale(entered_quantity) > 6
  then
    raise exception 'Quantity must have at most six fractional digits';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_grocery_item_id::text, 0)
  );

  select * into target_item
  from public.grocery_items
  where id = target_grocery_item_id;

  if target_item.id is null
    or not public.is_household_member(target_item.household_id)
  then
    raise exception 'Grocery item not found';
  end if;
  if change_type not in ('consumption', 'adjustment') then
    raise exception 'Unsupported manual transaction type';
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

  select * into existing_transaction
  from public.inventory_transactions
  where household_id = target_item.household_id
    and created_by = caller
    and operation_id = client_operation_id;

  if existing_transaction.id is not null then
    if (
      existing_transaction.grocery_item_id,
      existing_transaction.transaction_type,
      existing_transaction.quantity_base,
      existing_transaction.original_quantity,
      existing_transaction.original_unit,
      existing_transaction.note
    ) is distinct from (
      target_item.id,
      change_type,
      base_quantity,
      entered_quantity,
      entered_unit,
      normalized_note
    )
    then
      raise exception 'Operation ID was already used for a different inventory change';
    end if;
    return existing_transaction.id;
  end if;

  insert into public.inventory_transactions (
    household_id,
    grocery_item_id,
    transaction_type,
    quantity_base,
    original_quantity,
    original_unit,
    operation_id,
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
    client_operation_id,
    normalized_note,
    caller
  )
  on conflict (household_id, created_by, operation_id)
    where operation_id is not null
  do nothing
  returning id into new_transaction_id;

  if new_transaction_id is not null then
    return new_transaction_id;
  end if;

  select * into existing_transaction
  from public.inventory_transactions
  where household_id = target_item.household_id
    and created_by = caller
    and operation_id = client_operation_id;

  if (
    existing_transaction.grocery_item_id,
    existing_transaction.transaction_type,
    existing_transaction.quantity_base,
    existing_transaction.original_quantity,
    existing_transaction.original_unit,
    existing_transaction.note
  ) is distinct from (
    target_item.id,
    change_type,
    base_quantity,
    entered_quantity,
    entered_unit,
    normalized_note
  )
  then
    raise exception 'Operation ID was already used for a different inventory change';
  end if;

  return existing_transaction.id;
end;
$$;

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
  operation_id,
  note,
  created_by,
  created_at
from public.inventory_transactions;

revoke all on function public.record_inventory_change(
  uuid,
  public.inventory_transaction_type,
  numeric,
  text,
  uuid,
  text
) from public;
revoke all on function public.prevent_inventory_transaction_mutation()
from public;
grant execute on function public.record_inventory_change(
  uuid,
  public.inventory_transaction_type,
  numeric,
  text,
  uuid,
  text
) to authenticated;

grant select on public.inventory_stock to authenticated;
grant select on public.inventory_transaction_history to authenticated;
