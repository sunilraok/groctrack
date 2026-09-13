\set ON_ERROR_STOP on

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'c1000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'inventory-upgrade@example.com',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Inventory upgrade"}',
  now(),
  now()
);

insert into public.households (
  id,
  name,
  created_by
) values (
  'c1000000-0000-4000-8000-000000000004',
  'Upgrade household',
  'c1000000-0000-4000-8000-000000000001'
);

insert into public.household_members (
  household_id,
  user_id,
  role
) values (
  'c1000000-0000-4000-8000-000000000004',
  'c1000000-0000-4000-8000-000000000001',
  'owner'
);

set role authenticated;
set request.jwt.claims =
  '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.grocery_items (
  id,
  household_id,
  name,
  normalized_name,
  category,
  unit_dimension,
  base_unit,
  low_stock_threshold,
  created_by
) values (
  'c1000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000004',
  'Upgrade flour',
  'upgrade flour',
  'Pantry',
  'mass',
  'g',
  500,
  'c1000000-0000-4000-8000-000000000001'
);

select public.record_inventory_change(
  'c1000000-0000-4000-8000-000000000002',
  'adjustment',
  2,
  'kg',
  'Pre-upgrade balance'
);

reset role;

do $$
begin
  if (
    select quantity_base
    from public.inventory_balances
    where grocery_item_id = 'c1000000-0000-4000-8000-000000000002'
  ) is distinct from 2000::numeric then
    raise exception 'Pre-upgrade balance was not projected';
  end if;
end;
$$;
