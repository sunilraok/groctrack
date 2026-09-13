insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '81000000-0000-4000-8000-000000000001',
  'upgrade-owner@example.test',
  now(),
  '{}'::jsonb
);

insert into public.households (id, name, created_by)
values (
  '82000000-0000-4000-8000-000000000001',
  'Upgrade household',
  '81000000-0000-4000-8000-000000000001'
);

insert into public.household_members (household_id, user_id, role)
values (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.receipts (
  id,
  household_id,
  uploaded_by,
  image_path,
  original_filename,
  content_type,
  status
)
values
  (
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001/legacy-pending.jpg',
    'legacy-pending.jpg',
    'image/jpeg',
    'pending'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001/legacy-processing.pdf',
    'legacy-processing.pdf',
    'application/pdf',
    'processing'
  );

insert into public.receipt_lines (
  id,
  household_id,
  receipt_id,
  line_number,
  raw_description
)
values (
  '84000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  1,
  'LEGACY LINE'
);
