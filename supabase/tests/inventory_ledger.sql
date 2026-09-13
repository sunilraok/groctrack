begin;

select plan(40);

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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'authenticated',
    'authenticated',
    'inventory-member@example.com',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Inventory member"}',
    now(),
    now()
  );

create temporary table inventory_test_ids (
  household_id uuid,
  adjustment_id uuid
);

select is(public.to_base_quantity(1.25, 'kg', 'mass'), 1250::numeric, 'kg converts exactly to grams');
select is(public.to_base_quantity(2, 'dozen', 'count'), 24::numeric, 'dozen converts exactly to each');
select is(public.to_base_quantity(1, 'kg', 'volume'), null, 'incompatible units are rejected');
select is(
  public.to_base_quantity(1, 'tbsp', 'volume'),
  14.78676478125::numeric,
  'tablespoons convert with an exact decimal factor'
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

reset role;
insert into public.household_members (household_id, user_id, role)
select
  household_id,
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'member'
from inventory_test_ids;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

update inventory_test_ids
set adjustment_id = public.record_inventory_change(
  '33333333-3333-4333-8333-333333333333',
  'adjustment',
  1.25,
  'kg',
  '77777777-7777-4777-8777-777777777777',
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

select is(
  public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    1.25,
    'kg',
    '77777777-7777-4777-8777-777777777777',
    'Opening stock'
  ),
  adjustment_id,
  'replaying an operation returns its original transaction'
)
from inventory_test_ids;

select is(
  (select quantity_base from public.inventory_balances where grocery_item_id = '33333333-3333-4333-8333-333333333333'),
  1250::numeric,
  'replaying an operation does not apply its balance twice'
);

select is(
  (
    select count(*)
    from public.inventory_transactions
    where operation_id = '77777777-7777-4777-8777-777777777777'
  ),
  1::bigint,
  'the operation uniqueness constraint stores one ledger entry'
);

select ok(
  (
    select indexrelid::regclass::text = 'inventory_transactions_operation_idx'
      and indisunique
    from pg_index
    where indexrelid = 'public.inventory_transactions_operation_idx'::regclass
  ),
  'the operation ID has a database uniqueness guard for concurrent submissions'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    2,
    'kg',
    '77777777-7777-4777-8777-777777777777',
    'Different payload'
  )$$,
  'P0001',
  'Operation ID was already used for a different inventory change',
  'an operation ID cannot be reused for another payload'
);

select lives_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'consumption',
    250,
    'g',
    '88888888-8888-4888-8888-888888888888',
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
    '99999999-9999-4999-8999-999999999999',
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
    'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    null
  )$$,
  'P0001',
  'Unit does not match the grocery item',
  'incompatible adjustment units are rejected'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    'NaN'::numeric,
    'g',
    'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa',
    null
  )$$,
  'P0001',
  'Quantity must be finite and greater than zero',
  'non-finite manual quantities are rejected'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    999999999999,
    'kg',
    'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa',
    null
  )$$,
  '22003',
  null,
  'overflowing normalized quantities are rejected'
);

insert into public.grocery_items (
  id,
  household_id,
  name,
  normalized_name,
  unit_dimension,
  base_unit,
  created_by
)
select
  'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb',
  household_id,
  'Vanilla',
  'vanilla',
  'volume',
  'ml',
  '11111111-1111-4111-8111-111111111111'
from inventory_test_ids;

select lives_ok(
  $$select public.record_inventory_change(
    'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb',
    'adjustment',
    1,
    'tbsp',
    'aaaaaaaa-4444-4444-8444-aaaaaaaaaaaa',
    'Measured amount'
  )$$,
  'tablespoon quantities persist successfully'
);

select is(
  (
    select quantity_base
    from public.inventory_transactions
    where operation_id = 'aaaaaaaa-4444-4444-8444-aaaaaaaaaaaa'
  ),
  14.786765::numeric,
  'persisted tablespoon conversion rounds to the declared scale'
);

select throws_ok(
  $$update public.grocery_items
    set unit_dimension = 'volume', base_unit = 'ml'
    where id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'Grocery item units are immutable',
  'a member cannot reinterpret grocery units'
);

select throws_ok(
  $$update public.grocery_items
    set created_by = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    where id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'Grocery item household and creator are immutable',
  'a member cannot forge grocery creation attribution'
);

select throws_ok(
  $$insert into public.grocery_items (
      household_id,
      name,
      normalized_name,
      unit_dimension,
      base_unit,
      created_by
    )
    select
      household_id,
      'Forged item',
      'forged item',
      'count',
      'each',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    from inventory_test_ids$$,
  '42501',
  null,
  'a member cannot forge grocery attribution at creation'
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
  'P0001',
  'Inventory transaction is already reversed',
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

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.post_receipt('55555555-5555-4555-8555-555555555555')$$,
  'posting a reviewed receipt atomically records its purchase'
);

select is(
  (
    select status::text
    from public.receipts
    where id = '55555555-5555-4555-8555-555555555555'
  ),
  'posted',
  'the posted receipt status commits with its ledger entry'
);

select is(
  (
    select count(*)
    from public.inventory_transactions
    where source_receipt_line_id = '66666666-6666-4666-8666-666666666666'
  ),
  1::bigint,
  'receipt posting creates exactly one purchase transaction'
);

select is(
  (
    select quantity_base
    from public.inventory_balances
    where grocery_item_id = '33333333-3333-4333-8333-333333333333'
  ),
  750::numeric,
  'receipt posting updates the projected balance in the same transaction'
);

reset role;

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
select is((select count(*) from public.inventory_stock), 0::bigint, 'an outsider cannot read the stock view');
select is((select count(*) from public.inventory_transaction_history), 0::bigint, 'an outsider cannot read the history view');

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    1,
    'g',
    'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa',
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
