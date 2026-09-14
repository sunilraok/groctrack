\set ON_ERROR_STOP on

do $$
begin
  if (
    select count(*)
    from public.grocery_items
    where id = 'c1000000-0000-4000-8000-000000000002'
  ) <> 1 then
    raise exception 'Upgrade lost the grocery item';
  end if;

  if (
    select count(*)
    from public.inventory_transactions
    where grocery_item_id = 'c1000000-0000-4000-8000-000000000002'
      and quantity_base = 2000
      and operation_id is null
  ) <> 1 then
    raise exception 'Upgrade changed or lost the existing ledger row';
  end if;

  if (
    select quantity_base
    from public.inventory_balances
    where grocery_item_id = 'c1000000-0000-4000-8000-000000000002'
  ) is distinct from 2000::numeric then
    raise exception 'Upgrade changed the projected balance';
  end if;

  if to_regprocedure(
    'public.record_inventory_change(uuid,public.inventory_transaction_type,numeric,text,text)'
  ) is not null then
    raise exception 'Upgrade retained the obsolete five-argument RPC';
  end if;

  if to_regprocedure(
    'public.record_inventory_change(uuid,public.inventory_transaction_type,numeric,text,uuid,text)'
  ) is null then
    raise exception 'Upgrade did not install the idempotent RPC';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.record_inventory_change(uuid,public.inventory_transaction_type,numeric,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role cannot execute the inventory RPC';
  end if;

  if (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.grocery_items'::regclass
      and tgname in (
        'grocery_items_prevent_household_change',
        'grocery_items_protect_units'
      )
      and not tgisinternal
  ) <> 2 then
    raise exception 'Upgrade did not preserve both grocery update guards';
  end if;

  if (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.inventory_transactions'::regclass
      and tgname in (
        'inventory_transaction_apply_balance',
        'inventory_transactions_prevent_update_delete'
      )
      and not tgisinternal
  ) <> 2 then
    raise exception 'Upgrade did not preserve ledger projection and append-only triggers';
  end if;
end;
$$;

set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  false
);

select public.record_inventory_change(
  'c1000000-0000-4000-8000-000000000002',
  'consumption',
  500,
  'g',
  'c1000000-0000-4000-8000-000000000003',
  'Post-upgrade consumption'
);

do $$
begin
  if (
    select quantity_base::numeric
    from public.inventory_stock
    where id = 'c1000000-0000-4000-8000-000000000002'
  ) is distinct from 1500::numeric then
    raise exception 'Post-upgrade RPC did not update the stock view';
  end if;

  if (
    select count(*)
    from public.inventory_transaction_history
    where operation_id = 'c1000000-0000-4000-8000-000000000003'
      and transaction_type = 'consumption'
      and quantity_base::numeric = -500
      and original_quantity::numeric = 500
      and original_unit = 'g'
      and created_by = 'c1000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Post-upgrade history view did not preserve the audit row';
  end if;
end;
$$;

reset role;
