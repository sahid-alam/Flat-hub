-- Taking an offer back: only your own, only while nobody has taken it, and a withdrawn offer cannot
-- be claimed. Vouches are untouched (duties.test.sql still proves duty_mark has no DELETE grant).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'rhea@test'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000003', 'Other flat', 'Outsider');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
reset role;
create temp table invite as select invite_code from public.household where id = '11111111-0000-7000-8000-000000000001';
grant select on invite to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.join_household('22222222-0000-7000-8000-000000000002', (select invite_code from invite), 'Rhea');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.duty (id, household_id, name, every_days)
  values ('aaaaaaaa-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'Garbage dump', 1);
-- Ansh offers his turn on the 20th
insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20', '22222222-0000-7000-8000-000000000001',
          'offer', '22222222-0000-7000-8000-000000000001');

-- Rhea's call only ever reaches her own slot, which has no offer: Ansh's stays up.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.withdraw_offer('aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20');
select is((select count(*)::int from public.duty_mark where kind = 'offer'), 1,
  'a mate cannot take back somebody else''s offer');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select throws_ok($$ select public.withdraw_offer('aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20') $$,
  'P0002', null, 'a non-member cannot reach the flat''s duties at all');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select lives_ok($$ select public.withdraw_offer('aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20') $$,
  'the mate who offered can take it back');
select is((select count(*)::int from public.duty_mark where kind = 'offer'), 0, 'and the offer is gone');
select lives_ok($$ select public.withdraw_offer('aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20') $$,
  'taking it back twice is a no-op, so a retry is safe');

-- A withdrawn offer cannot be claimed: the turn is Ansh's again.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-20') $$,
  '23514', null, 'a withdrawn offer cannot be taken');

-- Offer again, and this time Rhea takes it.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select lives_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20', '22222222-0000-7000-8000-000000000001',
          'offer', '22222222-0000-7000-8000-000000000001') $$,
  'after taking it back, the same turn can be offered again');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-20');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ select public.withdraw_offer('aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20') $$,
  '23514', null, 'once somebody has taken it, it cannot be taken back');
select is((select count(*)::int from public.duty_mark where kind = 'offer'), 1, 'so the offer stays');

-- Rhea undoes her Take it (a reversing row, never a delete). The turn is Ansh's and on offer again,
-- so he can take it back after all.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, reverses_id)
  values ('bbbbbbbb-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-20', 'bbbbbbbb-0000-7000-8000-000000000002');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select lives_ok($$ select public.withdraw_offer('aaaaaaaa-0000-7000-8000-000000000001', '2026-10-20') $$,
  'a claim that was undone no longer blocks taking the offer back');
select is((select count(*)::int from public.duty_mark where kind = 'offer'), 0, 'and it is gone');

select * from finish();
rollback;
