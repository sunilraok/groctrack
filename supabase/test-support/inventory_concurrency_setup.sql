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
  'c2000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'inventory-concurrency@example.com',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Inventory concurrency"}',
  now(),
  now()
);

insert into public.households (
  id,
  name,
  created_by
) values (
  'c2000000-0000-4000-8000-000000000002',
  'Concurrency household',
  'c2000000-0000-4000-8000-000000000001'
);

insert into public.household_members (
  household_id,
  user_id,
  role
) values (
  'c2000000-0000-4000-8000-000000000002',
  'c2000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.grocery_items (
  id,
  household_id,
  name,
  normalized_name,
  unit_dimension,
  base_unit,
  created_by
) values (
  'c2000000-0000-4000-8000-000000000003',
  'c2000000-0000-4000-8000-000000000002',
  'Concurrent flour',
  'concurrent flour',
  'mass',
  'g',
  'c2000000-0000-4000-8000-000000000001'
);
