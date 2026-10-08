-- B7 Bills: the shares-sum-to-total invariant, the payment ledger's reversal and overpay guards,
-- and RLS. A bill is a payer with per-person shares; it never touches the kitty.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'sahid@test'),
  ('00000000-0000-0000-0000-00000000000b', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Sahid');
-- ansh joins, so the flat has two mates and a ₹600 Wi-Fi bill splits ₹300/₹300
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.join_household('22222222-0000-7000-8000-000000000002',
  (select invite_code from public.household where id = '11111111-0000-7000-8000-000000000001'), 'Ansh');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------------------------------------------------------------- the split must be exact

select lives_ok($$ select public.add_bill(
  '{"id":"66666666-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","label":"Wi-Fi","total_paise":60000,"paid_by":"22222222-0000-7000-8000-000000000001","occurred_on":"2026-10-05"}',
  '[{"id":"77777777-0000-7000-8000-000000000001","member_id":"22222222-0000-7000-8000-000000000001","paise":30000},
    {"id":"77777777-0000-7000-8000-000000000002","member_id":"22222222-0000-7000-8000-000000000002","paise":30000}]');
  set constraints all immediate $$, 'shares that sum to the total are accepted');

select throws_ok($$ select public.add_bill(
  '{"id":"66666666-0000-7000-8000-000000000002","household_id":"11111111-0000-7000-8000-000000000001","label":"Cook","total_paise":90000,"paid_by":"22222222-0000-7000-8000-000000000001"}',
  '[{"id":"77777777-0000-7000-8000-000000000003","member_id":"22222222-0000-7000-8000-000000000001","paise":45000},
    {"id":"77777777-0000-7000-8000-000000000004","member_id":"22222222-0000-7000-8000-000000000002","paise":44999}]');
  set constraints all immediate $$, '23514', null, 'shares a paisa short of the total are rejected');

select lives_ok($$ select public.add_bill(
  '{"id":"66666666-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","label":"Wi-Fi","total_paise":60000,"paid_by":"22222222-0000-7000-8000-000000000001","occurred_on":"2026-10-05"}',
  '[{"id":"77777777-0000-7000-8000-000000000001","member_id":"22222222-0000-7000-8000-000000000001","paise":30000}]') $$,
  'retrying the same bill id is a no-op');
select is((select count(*) from public.bill), 1::bigint, 'and leaves exactly one bill');

select throws_ok($$ insert into public.bill_share (id, household_id, bill_id, member_id, paise)
  values ('77777777-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002', 100);
  set constraints all immediate $$, '23505', null, 'a mate cannot be given a second share on one bill');

-- ---------------------------------------------------------------- the payment ledger

-- ansh settles his ₹300 share
insert into public.bill_payment (id, household_id, bill_id, member_id, paise)
  values ('88888888-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002', 30000);
select is((select sum(paise) from public.bill_payment), 30000::numeric, 'a settled share is recorded');

select throws_ok($$ insert into public.bill_payment (id, household_id, bill_id, member_id, paise)
  values ('88888888-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002', 30000) $$,
  '23514', null, 'the same share cannot be marked paid twice');

select throws_ok($$ insert into public.bill_payment (id, household_id, bill_id, member_id, paise)
  values ('88888888-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 50000) $$,
  '23514', null, 'a payment larger than the share is rejected');

select throws_ok($$ insert into public.bill_payment (id, household_id, bill_id, member_id, paise, reverses_id)
  values ('88888888-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002', -10000,
          '88888888-0000-7000-8000-000000000001') $$,
  '23514', null, 'a partial reversal is rejected');

insert into public.bill_payment (id, household_id, bill_id, member_id, paise, reverses_id)
  values ('88888888-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002', -30000,
          '88888888-0000-7000-8000-000000000001');
select is((select sum(paise) from public.bill_payment), 0::numeric, 'a reversal nets its payment to zero');

select throws_ok($$ update public.bill_payment set paise = 1 $$, '42501', null, 'bill payments cannot be updated');
select throws_ok($$ delete from public.bill_share $$, '42501', null, 'bill shares cannot be deleted');

-- ---------------------------------------------------------------- RLS

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*) from public.bill) + (select count(*) from public.bill_share)
          + (select count(*) from public.bill_payment), 0::bigint, 'a non-member sees no bills at all');
select throws_ok(
  $$ insert into public.bill (id, household_id, label, total_paise, paid_by)
     values ('66666666-0000-7000-8000-000000000009', '11111111-0000-7000-8000-000000000001', 'Fake', 100,
             '22222222-0000-7000-8000-000000000001') $$,
  '42501', null, 'a non-member cannot add a bill to someone else''s flat');

select * from finish();
rollback;
