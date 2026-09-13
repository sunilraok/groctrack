begin;

select plan(21);

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
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'inventory-owner@example.com',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Inventory owner"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'inventory-outsider@example.com',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Inventory outsider"}',
    now(),
    now()
  );

create temporary table inventory_test_ids (
  household_id uuid,
  adjustment_id uuid
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

insert into inventory_test_ids (household_id)
values (public.create_household('Inventory home'));

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
)
select
  '33333333-3333-4333-8333-333333333333',
  household_id,
  'Flour',
  'flour',
  'Baking',
  'mass',
  'g',
  500,
  '11111111-1111-4111-8111-111111111111'
from inventory_test_ids;

select is(public.to_base_quantity(1.25, 'kg', 'mass'), 1250::numeric, 'kg converts exactly to grams');
select is(public.to_base_quantity(2, 'dozen', 'count'), 24::numeric, 'dozen converts exactly to each');
select is(public.to_base_quantity(1, 'kg', 'volume'), null, 'incompatible units are rejected');

update inventory_test_ids
set adjustment_id = public.record_inventory_change(
  '33333333-3333-4333-8333-333333333333',
  'adjustment',
  1.25,
  'kg',
  'Opening stock'
);

select is(
  (select quantity_base from public.inventory_balances where grocery_item_id = '33333333-3333-4333-8333-333333333333'),
  1250::numeric,
  'an adjustment projects into the balance'
);

select is(
  (
    select pg_typeof(quantity_base)::text
    from public.inventory_stock
    where id = '33333333-3333-4333-8333-333333333333'
  ),
  'text',
  'the API-facing stock view preserves numeric values as text'
);

select lives_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'consumption',
    250,
    'g',
    'Baking'
  )$$,
  'a member can record consumption'
);

select is(
  (select quantity_base from public.inventory_balances where grocery_item_id = '33333333-3333-4333-8333-333333333333'),
  1000::numeric,
  'consumption is subtracted transactionally'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'consumption',
    -1,
    'g',
    null
  )$$,
  'P0001',
  'Consumption quantity must be positive',
  'negative consumption input is rejected'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    1,
    'ml',
    null
  )$$,
  'P0001',
  'Unit does not match the grocery item',
  'incompatible adjustment units are rejected'
);

select lives_ok(
  format(
    'select public.reverse_inventory_transaction(%L, %L)',
    adjustment_id,
    'Correct opening stock'
  ),
  'a member can reverse a transaction'
)
from inventory_test_ids;

select is(
  (select quantity_base from public.inventory_balances where grocery_item_id = '33333333-3333-4333-8333-333333333333'),
  -250::numeric,
  'a reversal applies the exact inverse to the balance'
);

select throws_ok(
  format(
    'select public.reverse_inventory_transaction(%L, null)',
    adjustment_id
  ),
  '23505',
  null,
  'a transaction cannot be reversed twice'
)
from inventory_test_ids;

reset role;

select throws_ok(
  format(
    'update public.inventory_transactions set note = %L where id = %L',
    'mutated',
    adjustment_id
  ),
  'P0001',
  'Inventory transactions are append-only',
  'ledger entries cannot be updated'
)
from inventory_test_ids;

select throws_ok(
  format(
    'delete from public.inventory_transactions where id = %L',
    adjustment_id
  ),
  'P0001',
  'Inventory transactions are append-only',
  'ledger entries cannot be deleted'
)
from inventory_test_ids;

insert into public.merchants (
  id,
  household_id,
  name,
  normalized_name
)
select
  '44444444-4444-4444-8444-444444444444',
  household_id,
  'Test market',
  'test market'
from inventory_test_ids;

insert into public.receipts (
  id,
  household_id,
  uploaded_by,
  merchant_id,
  image_path,
  original_filename,
  content_type,
  status
)
select
  '55555555-5555-4555-8555-555555555555',
  household_id,
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  household_id::text || '/receipt.jpg',
  'receipt.jpg',
  'image/jpeg',
  'review_ready'
from inventory_test_ids;

insert into public.receipt_lines (
  id,
  household_id,
  receipt_id,
  line_number,
  raw_description,
  quantity,
  unit,
  grocery_item_id
)
select
  '66666666-6666-4666-8666-666666666666',
  household_id,
  '55555555-5555-4555-8555-555555555555',
  1,
  'Flour',
  1,
  'kg',
  '33333333-3333-4333-8333-333333333333'
from inventory_test_ids;

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
select
  household_id,
  '33333333-3333-4333-8333-333333333333',
  'purchase',
  1000,
  1,
  'kg',
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111'
from inventory_test_ids;

select throws_ok(
  $$insert into public.inventory_transactions (
      household_id,
      grocery_item_id,
      transaction_type,
      quantity_base,
      source_receipt_line_id,
      created_by
    )
    select
      household_id,
      '33333333-3333-4333-8333-333333333333',
      'purchase',
      1000,
      '66666666-6666-4666-8666-666666666666',
      '11111111-1111-4111-8111-111111111111'
    from inventory_test_ids$$,
  '23505',
  null,
  'a receipt line cannot post twice'
);

select throws_ok(
  $$insert into public.inventory_transactions (
      household_id,
      grocery_item_id,
      transaction_type,
      quantity_base,
      reverses_transaction_id,
      created_by
    )
    select
      household_id,
      '33333333-3333-4333-8333-333333333333',
      'adjustment',
      1,
      adjustment_id,
      '11111111-1111-4111-8111-111111111111'
    from inventory_test_ids$$,
  '23514',
  null,
  'only reversal entries can reference a reversed transaction'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select is((select count(*) from public.grocery_items), 0::bigint, 'an outsider cannot read groceries');
select is((select count(*) from public.inventory_transactions), 0::bigint, 'an outsider cannot read ledger entries');
select is((select count(*) from public.inventory_balances), 0::bigint, 'an outsider cannot read balances');

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    1,
    'g',
    null
  )$$,
  'P0001',
  'Grocery item not found',
  'an outsider cannot change another household inventory'
);

select throws_ok(
  format(
    'select public.reverse_inventory_transaction(%L, null)',
    adjustment_id
  ),
  'P0001',
  'Inventory transaction not found',
  'an outsider cannot reverse another household transaction'
)
from inventory_test_ids;

select * from finish();
rollback;
