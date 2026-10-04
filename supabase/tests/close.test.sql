-- M5 Month close: only the treasurer closes or reopens, a month that isn't over can't be
-- closed, and once closed nothing dated inside it can be written — except a reversal, which
-- is allocated in its target's month and nets to zero there.
-- Months are fixed in the past (2026-07 closed, 2026-08 open) so the test doesn't rot.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'rhea@test'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test');

set local role authenticated;

-- Ansh's flat: he is the treasurer, Rhea is a plain mate
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
-- the invite code is not readable by a not-yet-member, so park it first
reset role;
create temp table invite as select invite_code from public.household where id = '11111111-0000-7000-8000-000000000001';
grant select on invite to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.join_household('22222222-0000-7000-8000-000000000002', (select invite_code from invite), 'Rhea');

-- July rows, logged while July was still open
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.add_spend('{"id":"44444444-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","source":"local","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":45000,"occurred_at":"2026-07-10T06:00:00Z"}');
insert into public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at)
  values ('33333333-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'contribution', '22222222-0000-7000-8000-000000000001', 200000, '2026-07-01T06:00:00Z');
insert into public.member_absence (id, household_id, member_id, from_date, to_date) values
  ('77777777-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', '2026-07-05', '2026-07-09'),
  -- two days at the July/August boundary: on their own they deduct nothing (a run must reach 3 days)
  ('77777777-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', '2026-07-30', '2026-07-31'),
  ('77777777-0000-7000-8000-000000000006', '11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', '2026-08-01', '2026-08-01');
set constraints all immediate;

-- ---------------------------------------------------------------- who may close

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$ select public.close_month('88888888-0000-7000-8000-000000000009', '11111111-0000-7000-8000-000000000001', '2026-07') $$,
  '42501', null, 'a non-treasurer cannot close a month');
select throws_ok(
  $$ select public.reopen_month('11111111-0000-7000-8000-000000000001', '2026-07') $$,
  '42501', null, 'a non-treasurer cannot reopen a month');
-- the RPC is not the only lock: the insert policy is treasurer-only too
select throws_ok(
  $$ insert into public.month_close (id, household_id, month, closed_by)
     values ('88888888-0000-7000-8000-000000000008', '11111111-0000-7000-8000-000000000001', '2026-07', '22222222-0000-7000-8000-000000000002') $$,
  '42501', null, 'a non-treasurer cannot insert a close directly');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok(
  format($$ select public.close_month('88888888-0000-7000-8000-000000000007', '11111111-0000-7000-8000-000000000001', %L) $$,
         to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM')),
  'P0001', null, 'the current month is not over and cannot be closed');

select lives_ok(
  $$ select public.close_month('88888888-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', '2026-07') $$,
  'the treasurer closes July');
select public.close_month('88888888-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', '2026-07');
select public.close_month('88888888-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', '2026-07');
select is((select count(*) from public.month_close), 1::bigint, 'close_month is a no-op when the month is already closed');

-- ---------------------------------------------------------------- the freeze

select throws_ok(
  $$ insert into public.member_absence (id, household_id, member_id, from_date, to_date)
     values ('77777777-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', '2026-06-28', '2026-07-02') $$,
  'P0001', 'July 2026 is closed', 'an absence that ends inside a closed month is rejected');
select throws_ok(
  $$ delete from public.member_absence where id = '77777777-0000-7000-8000-000000000001' $$,
  'P0001', 'July 2026 is closed', 'an absence inside a closed month cannot be deleted');
select throws_ok(
  $$ select public.add_spend('{"id":"44444444-0000-7000-8000-000000000003","household_id":"11111111-0000-7000-8000-000000000001","source":"local","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":1000,"occurred_at":"2026-07-20T06:00:00Z"}') $$,
  'P0001', 'July 2026 is closed', 'a spend dated in a closed month is rejected');
select throws_ok(
  $$ insert into public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at)
     values ('33333333-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001', 'contribution', '22222222-0000-7000-8000-000000000001', 100, '2026-07-02T06:00:00Z') $$,
  'P0001', 'July 2026 is closed', 'a pool_entry backdated into a closed month is rejected');

-- The merged run, not the row: presenceWeights joins absences that touch into one run and only
-- deducts runs of >= 3 days, so an August-only row can still move closed July's shares.
select throws_ok(
  $$ insert into public.member_absence (id, household_id, member_id, from_date, to_date)
     values ('77777777-0000-7000-8000-000000000007', '11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', '2026-08-02', '2026-08-02') $$,
  'P0001', 'July 2026 is closed', 'an open-month absence adjacent to a closed-month absence is rejected');
select throws_ok(
  $$ delete from public.member_absence where id = '77777777-0000-7000-8000-000000000006' $$,
  'P0001', 'July 2026 is closed', 'deleting that open-month absence is rejected too');
select lives_ok(
  $$ insert into public.member_absence (id, household_id, member_id, from_date, to_date)
     values ('77777777-0000-7000-8000-000000000008', '11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', '2026-08-20', '2026-08-24') $$,
  'an absence in an open month clear of the closed run still writes');

-- a spend_line is judged on its spend's month, or a closed month's breakdown could be rewritten
select throws_ok(
  $$ insert into public.spend_line (id, household_id, spend_id, name, line_total_paise)
     values ('55555555-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', '44444444-0000-7000-8000-000000000001', 'Milk', 45000) $$,
  'P0001', 'July 2026 is closed', 'a line added to a spend in a closed month is rejected');

-- the one grant that could undo the freeze from outside the RPC: RLS filters, it does not raise
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
delete from public.month_close where household_id = '11111111-0000-7000-8000-000000000001' and month = '2026-07';
select is((select count(*) from public.month_close), 1::bigint, 'a plain mate cannot delete a close directly');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- IST boundary: 18:29:59Z on the 31st is still July in Kolkata, 18:30:00Z is August
select throws_ok(
  $$ select public.add_spend('{"id":"44444444-0000-7000-8000-000000000004","household_id":"11111111-0000-7000-8000-000000000001","source":"local","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":1000,"occurred_at":"2026-07-31T18:29:59Z"}') $$,
  'P0001', 'July 2026 is closed', 'the last IST minute of a closed month is rejected');
select lives_ok(
  $$ select public.add_spend('{"id":"44444444-0000-7000-8000-000000000005","household_id":"11111111-0000-7000-8000-000000000001","source":"local","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":1000,"occurred_at":"2026-07-31T18:30:00Z"}') $$,
  'the first IST minute of the next month still writes');
select lives_ok(
  $$ select public.add_spend('{"id":"44444444-0000-7000-8000-000000000006","household_id":"11111111-0000-7000-8000-000000000001","source":"local","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":2000,"occurred_at":"2026-08-14T06:00:00Z"}') $$,
  'a spend in a later open month still writes');

-- reversals stay possible: they are allocated in the target's month and net to zero there
select lives_ok(
  $$ insert into public.spend (id, household_id, source, paid_by, paid_from, total_paise, occurred_at, reverses_id)
     values ('44444444-0000-7000-8000-00000000000a', '11111111-0000-7000-8000-000000000001', 'local', '22222222-0000-7000-8000-000000000001', 'pool', -45000, now(), '44444444-0000-7000-8000-000000000001') $$,
  'a reversal of a spend in a closed month still writes');
select lives_ok(
  $$ insert into public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, reverses_id)
     values ('33333333-0000-7000-8000-00000000000a', '11111111-0000-7000-8000-000000000001', 'contribution', '22222222-0000-7000-8000-000000000001', -200000, now(), '33333333-0000-7000-8000-000000000001') $$,
  'a reversal of a pool entry in a closed month still writes');

-- ---------------------------------------------------------------- reopen, and isolation

select public.reopen_month('11111111-0000-7000-8000-000000000001', '2026-07');
select lives_ok(
  $$ insert into public.member_absence (id, household_id, member_id, from_date, to_date)
     values ('77777777-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', '2026-07-20', '2026-07-24') $$,
  'a reopened month accepts an absence again');

-- close July again, so the outsider below has something it must NOT see
select public.close_month('88888888-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001', '2026-07');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000003', 'Other flat', 'Outsider');
select public.close_month('88888888-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000002', '2026-07');
select is((select count(*) from public.month_close), 1::bigint,
  'a non-member sees only their own flat''s month_close row');
select lives_ok(
  $$ insert into public.member_absence (id, household_id, member_id, from_date, to_date)
     values ('77777777-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000003', '2026-08-01', '2026-08-04') $$,
  'another flat''s close does not freeze this flat''s August');

select * from finish();
rollback;
