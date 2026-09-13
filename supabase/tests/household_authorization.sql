begin;

select plan(10);

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
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'owner@example.com',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Owner"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'member@example.com',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Member"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'authenticated',
    'authenticated',
    'outsider@example.com',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Outsider"}',
    now(),
    now()
  );

create temporary table test_household (id uuid not null);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into test_household select public.create_household('Owner home')$$,
  'an authenticated user can create a household'
);

select is(
  (select count(*) from public.households),
  1::bigint,
  'the owner sees their household'
);

insert into public.household_invitations (
  household_id,
  email,
  token_hash,
  invited_by,
  expires_at
)
select
  id,
  'member@example.com',
  encode(extensions.digest('valid-invitation', 'sha256'), 'hex'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  now() + interval '7 days'
from test_household;

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.households),
  0::bigint,
  'a non-member cannot read another household'
);

select throws_ok(
  $$insert into public.household_invitations (
      household_id, email, token_hash, invited_by, expires_at
    )
    select
      id,
      'outsider@example.com',
      encode(extensions.digest('forbidden', 'sha256'), 'hex'),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now() + interval '7 days'
    from test_household$$,
  '42501',
  null,
  'a non-owner cannot create an invitation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.accept_household_invitation('valid-invitation')$$,
  'P0001',
  'Invitation belongs to another email address',
  'an invitation cannot be accepted by a different email'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.accept_household_invitation('valid-invitation')$$,
  'the invited email can accept'
);

select throws_ok(
  $$select public.accept_household_invitation('valid-invitation')$$,
  'P0001',
  'Invitation is invalid or expired',
  'an accepted invitation cannot be replayed'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

insert into public.household_invitations (
  household_id,
  email,
  token_hash,
  invited_by,
  expires_at,
  created_at
)
select
  id,
  'member@example.com',
  encode(extensions.digest('expired-invitation', 'sha256'), 'hex'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  now() - interval '1 day',
  now() - interval '8 days'
from test_household;

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.accept_household_invitation('expired-invitation')$$,
  'P0001',
  'Invitation is invalid or expired',
  'an expired invitation cannot be accepted'
);

select is(
  (select count(*) from public.households),
  1::bigint,
  'the accepted member can read the joined household'
);

select is(
  (select count(*) from public.profiles),
  2::bigint,
  'members can list profiles only after sharing a household'
);

select * from finish();
rollback;
