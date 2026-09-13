begin;

select plan(65);

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

grant select, insert, update on table inventory_test_ids to authenticated;

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
  1.250000,
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
    1.250000,
    'kg',
    '77777777-7777-4777-8777-777777777777',
    'Opening stock'
  ),
  adjustment_id,
  'a valid six-decimal operation replays to its original transaction'
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

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    1.0000001,
    'g',
    '77777777-1111-4111-8111-777777777777',
    'Over-scale'
  )$$,
  'P0001',
  'Quantity must have at most six fractional digits',
  'an over-scale quantity is rejected before its initial execution'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    1.0000001,
    'g',
    '77777777-1111-4111-8111-777777777777',
    'Over-scale'
  )$$,
  'P0001',
  'Quantity must have at most six fractional digits',
  'an identical over-scale retry is rejected consistently'
);

select is(
  (
    select count(*)
    from public.inventory_transactions
    where operation_id = '77777777-1111-4111-8111-777777777777'
  ),
  0::bigint,
  'an over-scale operation creates no ledger entry'
);

select is(
  (select quantity_base from public.inventory_balances where grocery_item_id = '33333333-3333-4333-8333-333333333333'),
  1250::numeric,
  'an over-scale operation does not mutate the projected balance'
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

select results_eq(
  $$select
      transaction_type::text,
      quantity_base,
      original_quantity,
      original_unit,
      created_by,
      operation_id
    from public.inventory_transactions
    where operation_id = '88888888-8888-4888-8888-888888888888'$$,
  $$values (
      'consumption',
      -250::numeric,
      250::numeric,
      'g'::text,
      '11111111-1111-4111-8111-111111111111'::uuid,
      '88888888-8888-4888-8888-888888888888'::uuid
    )$$,
  'consumption stores the exact signed quantity, original unit, actor, and operation ID'
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
    'Infinity'::numeric,
    'g',
    'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa',
    null
  )$$,
  'P0001',
  'Quantity must be finite and greater than zero',
  'positive infinity is rejected before inventory locking'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    '-Infinity'::numeric,
    'g',
    'aaaaaaaa-6666-4666-8666-aaaaaaaaaaaa',
    null
  )$$,
  'P0001',
  'Quantity must be finite and greater than zero',
  'negative infinity is rejected before inventory locking'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    null,
    'g',
    'aaaaaaaa-7777-4777-8777-aaaaaaaaaaaa',
    null
  )$$,
  'P0001',
  'Quantity must be finite and greater than zero',
  'a null quantity is rejected before inventory locking'
);

select is(
  (
    select count(*)
    from public.inventory_transactions
    where operation_id in (
      'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa',
      'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa',
      'aaaaaaaa-6666-4666-8666-aaaaaaaaaaaa',
      'aaaaaaaa-7777-4777-8777-aaaaaaaaaaaa'
    )
  ),
  0::bigint,
  'invalid non-finite and null requests create no ledger entries'
);

select is(
  (select quantity_base from public.inventory_balances where grocery_item_id = '33333333-3333-4333-8333-333333333333'),
  1000::numeric,
  'invalid non-finite and null requests do not mutate the balance'
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
    set unit_dimension = 'volume'
    where id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'Grocery item units are immutable',
  'a member cannot reinterpret a grocery unit dimension'
);

select throws_ok(
  $$update public.grocery_items
    set base_unit = 'ml'
    where id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'Grocery item units are immutable',
  'a member cannot reinterpret a grocery base unit'
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
  $$update public.grocery_items
    set household_id = gen_random_uuid()
    where id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'Grocery item household and creator are immutable',
  'a member cannot move a grocery to another household'
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

select results_eq(
  $$select
      reversal.transaction_type::text,
      reversal.quantity_base,
      reversal.original_quantity,
      reversal.original_unit,
      reversal.created_by,
      reversal.reverses_transaction_id,
      reversal.operation_id
    from public.inventory_transactions reversal
    join inventory_test_ids ids
      on reversal.reverses_transaction_id = ids.adjustment_id$$,
  $$select
      'reversal'::text,
      -1250::numeric,
      null::numeric,
      null::text,
      '11111111-1111-4111-8111-111111111111'::uuid,
      adjustment_id,
      null::uuid
    from inventory_test_ids$$,
  'reversal stores the exact inverse, actor, and source transaction'
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

select results_eq(
  $$select
      transaction_type::text,
      quantity_base,
      original_quantity,
      original_unit,
      created_by,
      source_receipt_line_id,
      operation_id
    from public.inventory_transactions
    where source_receipt_line_id = '66666666-6666-4666-8666-666666666666'$$,
  $$values (
      'purchase',
      1000::numeric,
      1::numeric,
      'kg'::text,
      '11111111-1111-4111-8111-111111111111'::uuid,
      '66666666-6666-4666-8666-666666666666'::uuid,
      null::uuid
    )$$,
  'receipt posting stores exact purchase attribution and source quantities'
);

select results_eq(
  $$select
      transaction_type::text,
      quantity_base,
      original_quantity,
      original_unit,
      created_by,
      source_receipt_line_id,
      operation_id
    from public.inventory_transaction_history
    where source_receipt_line_id = '66666666-6666-4666-8666-666666666666'$$,
  $$values (
      'purchase',
      '1000.000000'::text,
      '1.000000'::text,
      'kg'::text,
      '11111111-1111-4111-8111-111111111111'::uuid,
      '66666666-6666-4666-8666-666666666666'::uuid,
      null::uuid
    )$$,
  'authorized history exposes the exact persisted purchase audit row'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.inventory_stock),
  2::bigint,
  'an ordinary member can read household stock'
);

select is(
  (select count(*) from public.inventory_transaction_history),
  5::bigint,
  'an ordinary member can read household history'
);

select lives_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'consumption',
    1,
    'g',
    'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
    'Member consumption'
  )$$,
  'an ordinary member can record compatible-unit consumption'
);

select results_eq(
  $$select
      transaction_type::text,
      quantity_base,
      original_quantity,
      original_unit,
      created_by,
      operation_id
    from public.inventory_transaction_history
    where operation_id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'$$,
  $$values (
      'consumption',
      '-1.000000'::text,
      '1.000000'::text,
      'g'::text,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
      'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'::uuid
    )$$,
  'member consumption history preserves its exact signed audit data'
);

select lives_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'adjustment',
    2,
    'g',
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'Member adjustment'
  )$$,
  'an ordinary member can record an adjustment'
);

select is(
  (
    select quantity_base
    from public.inventory_balances
    where grocery_item_id = '33333333-3333-4333-8333-333333333333'
  ),
  751::numeric,
  'ordinary member consumption and adjustment update the balance once'
);

select lives_ok(
  $$select public.reverse_inventory_transaction(
    (
      select id
      from public.inventory_transactions
      where operation_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
    ),
    'Member reversal'
  )$$,
  'an ordinary member can reverse their adjustment'
);

select is(
  (
    select quantity_base
    from public.inventory_balances
    where grocery_item_id = '33333333-3333-4333-8333-333333333333'
  ),
  749::numeric,
  'the member reversal applies exactly once'
);

select results_eq(
  $$select
      reversal.transaction_type::text,
      reversal.quantity_base,
      reversal.created_by,
      reversal.reverses_transaction_id
    from public.inventory_transaction_history reversal
    join public.inventory_transactions adjustment
      on adjustment.id = reversal.reverses_transaction_id
    where adjustment.operation_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'$$,
  $$select
      'reversal'::text,
      '-2.000000'::text,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
      id
    from public.inventory_transactions
    where operation_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'$$,
  'member reversal history preserves the exact actor, sign, and source ID'
);

select throws_ok(
  $$select public.record_inventory_change(
    '33333333-3333-4333-8333-333333333333',
    'consumption',
    1,
    'ml',
    'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb',
    null
  )$$,
  'P0001',
  'Unit does not match the grocery item',
  'an ordinary member cannot use an incompatible unit'
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
