-- M4/B4 Duties: household isolation, chore_event is insert-only, a reversal must mirror its
-- target, a swap needs someone to swap to, and a duty has exactly one cadence.
-- B4 adds: a claim needs an offer to answer, duty_mark and duty_photo are insert-only, and a photo
-- older than two months is purged.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'rhea@test'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test');

set local role authenticated;

-- the outsider's flat, with its own member
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000003', 'Other flat', 'Outsider');

-- Ansh's flat, with Rhea as a second mate (a swap needs two)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
reset role;
create temp table invite as select invite_code from public.household where id = '11111111-0000-7000-8000-000000000001';
grant select on invite to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.join_household('22222222-0000-7000-8000-000000000002', (select invite_code from invite), 'Rhea');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------------------------------------------------------------- duty: cadence and schedule

select lives_ok($$ insert into public.duty (id, household_id, name, effort_points, weekdays)
  values ('aaaaaaaa-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'Kitchen floor', 3, array[1, 4]) $$, 'a weekday duty is accepted');
select lives_ok($$ insert into public.duty (id, household_id, name, effort_points, every_days)
  values ('aaaaaaaa-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          'Bins', 1, 2) $$, 'an every-N-days duty is accepted');
select throws_ok($$ insert into public.duty (id, household_id, name, every_days, weekdays)
  values ('aaaaaaaa-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          'Both', 2, array[1]) $$, '23514', null, 'a duty cannot have two cadences');
select throws_ok($$ insert into public.duty (id, household_id, name)
  values ('aaaaaaaa-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001', 'Neither') $$,
  '23514', null, 'a duty must have one cadence');
select throws_ok($$ insert into public.duty (id, household_id, name, weekdays)
  values ('aaaaaaaa-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001',
          'Eighth day', array[7]) $$, '23514', null, 'weekdays stay within 0..6');
select throws_ok($$ insert into public.duty (id, household_id, name, every_days, schedule, fixed_member_id)
  values ('aaaaaaaa-0000-7000-8000-000000000006', '11111111-0000-7000-8000-000000000001',
          'Theirs', 7, 'fixed', '22222222-0000-7000-8000-000000000003') $$,
  '23503', null, 'a duty cannot be fixed to another household''s member');

-- retiring is an update, not a delete
update public.duty set active = false where id = 'aaaaaaaa-0000-7000-8000-000000000002';
select is((select active from public.duty where id = 'aaaaaaaa-0000-7000-8000-000000000002'), false,
  'a duty is retired with active = false');
update public.duty set active = true where id = 'aaaaaaaa-0000-7000-8000-000000000002';
select throws_ok($$ delete from public.duty $$, '42501', null, 'a duty cannot be deleted');

-- ---------------------------------------------------------------- chore_event: outcomes

-- B4: a 'swapped' row is a CLAIM, and a claim needs an offer to answer. The slots the swaps below
-- use are offered here, so those assertions still test the thing they name.
insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id) values
  ('cccccccc-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
   'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-08', '22222222-0000-7000-8000-000000000001',
   'offer', '22222222-0000-7000-8000-000000000001'),
  ('cccccccc-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
   'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-12', '22222222-0000-7000-8000-000000000001',
   'offer', '22222222-0000-7000-8000-000000000001');

insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done', '2026-10-01');
-- a skip is its own outcome and earns no credit; the domain layer is what counts points
insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'skipped', '2026-10-05');
select is((select count(*) from public.chore_event where outcome = 'done'), 1::bigint,
  'only a done row is a done row');

select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped', '2026-10-08') $$,
  '23514', null, 'a swap needs a to_member_id');
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000001', '2026-10-08') $$,
  '23514', null, 'a mate cannot swap a duty to themselves');
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done',
          '22222222-0000-7000-8000-000000000002', '2026-10-08') $$,
  '23514', null, 'only a swap carries a to_member_id');
-- 'skipped' on purpose: a 'done' row naming somebody else is now stopped earlier, by
-- check_chore_claimable, and this assertion is about the composite FK underneath it.
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000006', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000003', 'skipped', '2026-10-08') $$,
  '23503', null, 'a chore event cannot name another household''s member');

-- ---------------------------------------------------------------- insert-only ledger

select throws_ok($$ update public.chore_event set outcome = 'done' $$, '42501',
  null, 'chore_event cannot be updated');
select throws_ok($$ delete from public.chore_event $$, '42501', null, 'chore_event cannot be deleted');

-- a mistake is corrected with a reversing row that mirrors its target exactly
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on, reverses_id)
  values ('bbbbbbbb-0000-7000-8000-000000000007', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002', 'done',
          '2026-10-01', 'bbbbbbbb-0000-7000-8000-000000000001') $$,
  '23514', null, 'a reversal naming a different member is rejected');
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on, reverses_id)
  values ('bbbbbbbb-0000-7000-8000-000000000008', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done',
          '2026-10-02', 'bbbbbbbb-0000-7000-8000-000000000001') $$,
  '23514', null, 'a reversal on the wrong due date is rejected');
select lives_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on, reverses_id)
  values ('bbbbbbbb-0000-7000-8000-000000000009', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done',
          '2026-10-01', 'bbbbbbbb-0000-7000-8000-000000000001') $$,
  'a mirroring reversal is accepted');
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on, reverses_id)
  values ('bbbbbbbb-0000-7000-8000-00000000000a', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done',
          '2026-10-01', 'bbbbbbbb-0000-7000-8000-000000000009') $$,
  '23514', null, 'a reversal of a reversal is impossible');

-- a swapped row reverses too, to_member_id and all. Rhea writes it: a claim is the taker tapping,
-- and check_chore_claimable now says so.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-00000000000b', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-12');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select lives_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, reverses_id)
  values ('bbbbbbbb-0000-7000-8000-00000000000c', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-12', 'bbbbbbbb-0000-7000-8000-00000000000b') $$,
  'a swap reverses when the reversal carries the same to_member_id');

-- ------------------------------------------------- points are snapshotted, never re-priced
-- duty 1 is 1 point today; every event above carries that price.
select is((select points from public.chore_event where id = 'bbbbbbbb-0000-7000-8000-000000000001'),
          (select effort_points from public.duty where id = 'aaaaaaaa-0000-7000-8000-000000000001'),
  'the event took the duty price at insert time');
select set_config('flathub.priced_at', (select points::text from public.chore_event
  where id = 'bbbbbbbb-0000-7000-8000-000000000001'), true);
update public.duty set effort_points = 10 where id = 'aaaaaaaa-0000-7000-8000-000000000001';
select is((select points from public.chore_event where id = 'bbbbbbbb-0000-7000-8000-000000000001'),
          current_setting('flathub.priced_at')::int,
  're-pricing the duty does not re-price work already done');
-- and a reversal mirrors its target's price, not the duty's new one, so it still nets to zero.
insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-00000000000e', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done', '2026-10-20');
insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on, reverses_id)
  values ('bbbbbbbb-0000-7000-8000-00000000000f', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done', '2026-10-20',
          'bbbbbbbb-0000-7000-8000-00000000000e');
select is((select sum(case when reverses_id is null then points else -points end)
           from public.chore_event where due_on = '2026-10-20'), 0::bigint,
  'a reversal carries its target price, so the pair nets to zero');
update public.duty set effort_points = current_setting('flathub.priced_at')::int where id = 'aaaaaaaa-0000-7000-8000-000000000001';


-- ---------------------------------------------------------------- B4: nobody is given a duty

-- 2026-10-15 was never offered, so there is nothing for a claim to answer.
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000011', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-15') $$,
  '23514', null, 'a duty cannot be taken from a slot nobody offered');
insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-15', '22222222-0000-7000-8000-000000000001',
          'offer', '22222222-0000-7000-8000-000000000001');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000012', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-15') $$,
  'once the slot is offered, another mate can take it');
-- …and only by the mate taking it. Ansh cannot hand his slot to Rhea on her behalf.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000013', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'swapped',
          '22222222-0000-7000-8000-000000000002', '2026-10-15') $$,
  '23514', null, 'a duty cannot be pushed onto a mate who did not tap to take it');

-- ---------------------------------------------------------------- B4: you tick your own duty
-- Whose TURN it is lives in assignees() in TypeScript and cannot be checked here. Who is TICKING
-- can be, and without it the publishable key in the web bundle is enough to farm duty points.
select lives_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000014', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done',
          '2026-10-18') $$,
  'a mate can tick their own duty');
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-000000000015', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002', 'done',
          '2026-10-18') $$,
  '23514', null, 'a mate cannot tick a duty in somebody else''s name');

-- ---------------------------------------------------------------- B4: duty_mark

select throws_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-16', '22222222-0000-7000-8000-000000000002',
          'offer', '22222222-0000-7000-8000-000000000001') $$,
  '23514', null, 'you can only offer your own slot, never somebody else''s');
select throws_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-16', '22222222-0000-7000-8000-000000000001',
          'vouch', '22222222-0000-7000-8000-000000000001') $$,
  '23514', null, 'you cannot vouch for yourself');
-- The actor is the session (20261015090000): Ansh cannot post an offer or a vouch in Rhea's name.
select throws_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000008', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-16', '22222222-0000-7000-8000-000000000002',
          'offer', '22222222-0000-7000-8000-000000000002') $$,
  '42501', null, 'a mate cannot offer another mate''s turn in that mate''s name');
select throws_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000009', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-01', '22222222-0000-7000-8000-000000000001',
          'vouch', '22222222-0000-7000-8000-000000000002') $$,
  '42501', null, 'a mate cannot forge somebody else''s vouch');
-- Rhea vouches for Ansh herself
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000006', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-01', '22222222-0000-7000-8000-000000000001',
          'vouch', '22222222-0000-7000-8000-000000000002') $$,
  'any other mate can vouch that a duty was done');
select throws_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-000000000007', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-01', '22222222-0000-7000-8000-000000000001',
          'vouch', '22222222-0000-7000-8000-000000000002') $$,
  '23505', null, 'vouching twice is the same vouch, so a retry is idempotent');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ update public.duty_mark set kind = 'offer' $$, '42501', null, 'duty_mark cannot be updated');
select throws_ok($$ delete from public.duty_mark $$, '42501', null, 'duty_mark cannot be deleted');

-- ---------------------------------------------------------------- B4: duty_photo

select throws_ok($$ insert into public.duty_photo (id, household_id, duty_id, due_on, member_id, raised_by, path)
  values ('dddddddd-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-01', '22222222-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000002', 'x.jpg') $$,
  '42501', null, 'a mate cannot add a photo in somebody else''s name');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok($$ insert into public.duty_photo (id, household_id, duty_id, due_on, member_id, raised_by, path)
  values ('dddddddd-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-01', '22222222-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000002',
          '11111111-0000-7000-8000-000000000001/duty/dddddddd-0000-7000-8000-000000000001.jpg') $$,
  'anyone can attach a photo to a duty instance, including a mate who did not do it');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ insert into public.duty_photo (id, household_id, duty_id, due_on, member_id, raised_by, path)
  values ('dddddddd-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-01', '22222222-0000-7000-8000-000000000003',
          '22222222-0000-7000-8000-000000000001', 'x.jpg') $$,
  '23503', null, 'a photo cannot name another household''s member');
-- Immutable once submitted: swap it before you send it, nobody removes it after.
select throws_ok($$ update public.duty_photo set note = 'actually fine' $$, '42501', null,
  'a submitted photo cannot be edited');
select throws_ok($$ delete from public.duty_photo $$, '42501', null, 'a submitted photo cannot be deleted');

-- ---------------------------------------------------------------- B4: co-assignment columns

select is((select group_size from public.duty where id = 'aaaaaaaa-0000-7000-8000-000000000001'), 1,
  'a duty is one person unless it says otherwise');
select lives_ok($$ update public.duty set group_size = 2, plans_meals = true,
    roster = array['22222222-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002']::uuid[]
  where id = 'aaaaaaaa-0000-7000-8000-000000000001' $$,
  'a member can set who is in, how many at once, and who plans the meals');
select throws_ok($$ update public.duty set group_size = 4 where id = 'aaaaaaaa-0000-7000-8000-000000000001' $$,
  '23514', null, 'a duty is done by at most three mates together');

-- ---------------------------------------------------------------- B4: the 2-month retention rule

reset role; -- B9's scheduled job runs as postgres, not as a mate
-- The purge is global by design, so every assertion here names THIS photo's path rather than
-- counting rows: the local stack is shared, and another flat's photos are not this test's business.
select is((select count(*) from private.purge_duty_photos() p
           where p = '11111111-0000-7000-8000-000000000001/duty/dddddddd-0000-7000-8000-000000000001.jpg'),
  0::bigint, 'a photo taken today survives the purge');
update public.duty_photo set created_at = now() - interval '3 months'
  where household_id = '11111111-0000-7000-8000-000000000001';
select is((select count(*) from private.purge_duty_photos() p
           where p = '11111111-0000-7000-8000-000000000001/duty/dddddddd-0000-7000-8000-000000000001.jpg'),
  1::bigint, 'a photo older than two months is purged, and its storage path comes back for the caller to remove');
select is((select count(*) from public.duty_photo where household_id = '11111111-0000-7000-8000-000000000001'),
  0::bigint, 'and its row is gone');
set local role authenticated;

-- ---------------------------------------------------------------- the outsider

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*) from public.duty) + (select count(*) from public.chore_event), 0::bigint,
  'a non-member reads neither duties nor chore events');
select throws_ok($$ insert into public.duty (id, household_id, name, every_days)
  values ('aaaaaaaa-0000-7000-8000-000000000007', '11111111-0000-7000-8000-000000000001', 'Sneaky', 1) $$,
  '42501', null, 'a non-member cannot insert a duty');
-- 'skipped' again: a 'done' row in somebody else's name is refused by check_chore_claimable before
-- RLS is reached, and the thing under test here is RLS.
select throws_ok($$ insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on)
  values ('bbbbbbbb-0000-7000-8000-00000000000d', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'skipped', '2026-10-01') $$,
  '42501', null, 'a non-member cannot insert a chore event');
select is((select count(*) from public.duty_mark) + (select count(*) from public.duty_photo), 0::bigint,
  'a non-member reads neither offers, vouches nor photos');
select throws_ok($$ insert into public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id)
  values ('cccccccc-0000-7000-8000-00000000000f', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '2026-10-01', '22222222-0000-7000-8000-000000000001',
          'vouch', '22222222-0000-7000-8000-000000000001') $$,
  '42501', null, 'a non-member cannot vouch for anyone');

select * from finish();
rollback;
