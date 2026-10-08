-- B5: a mate owns their own photo paths and notification modes, and nobody else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a0', 'sahid@test'),
  ('00000000-0000-0000-0000-0000000005b0', 'ansh@test'),
  ('00000000-0000-0000-0000-0000000005c0', 'outsider@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a0","role":"authenticated"}';
select public.create_household('55555555-0000-7000-8000-000000000001', '55555555-0000-7000-8000-0000000000a1', 'Flat 4B', 'Sahid');

-- Ansh joins the same flat
reset role;
create temp table invite as select invite_code from public.household where id = '55555555-0000-7000-8000-000000000001';
grant select on invite to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005b0","role":"authenticated"}';
select public.join_household('55555555-0000-7000-8000-0000000000a2', (select invite_code from invite), 'Ansh');

-- ---------------------------------------------------------------- photos on the member row

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a0","role":"authenticated"}';
update public.member
  set avatar_path = '55555555-0000-7000-8000-000000000001/55555555-0000-7000-8000-0000000000a1/avatar.jpg',
      cover_path = '55555555-0000-7000-8000-000000000001/55555555-0000-7000-8000-0000000000a1/cover.jpg'
  where id = '55555555-0000-7000-8000-0000000000a1';
select is(
  (select avatar_path from public.member where id = '55555555-0000-7000-8000-0000000000a1'),
  '55555555-0000-7000-8000-000000000001/55555555-0000-7000-8000-0000000000a1/avatar.jpg',
  'a mate sets their own avatar path');

-- member_update_self: the update simply matches no row rather than raising
update public.member set avatar_path = 'hijacked' where id = '55555555-0000-7000-8000-0000000000a2';
select is((select avatar_path from public.member where id = '55555555-0000-7000-8000-0000000000a2'), null,
  'a mate cannot set a flatmate''s avatar path');

-- ---------------------------------------------------------------- notification_pref

insert into public.notification_pref (id, household_id, member_id, trigger, mode)
  values ('55555555-0000-7000-8000-0000000000f1', '55555555-0000-7000-8000-000000000001',
          '55555555-0000-7000-8000-0000000000a1', 'shopping_added', 'off');
select is((select mode from public.notification_pref where trigger = 'shopping_added'), 'off',
  'a mate mutes one trigger');

-- the upsert target: the same (member, trigger) twice is one row
select throws_ok(
  $$ insert into public.notification_pref (id, household_id, member_id, trigger, mode)
     values ('55555555-0000-7000-8000-0000000000f2', '55555555-0000-7000-8000-000000000001',
             '55555555-0000-7000-8000-0000000000a1', 'shopping_added', 'silent') $$,
  '23505', null, 'one row per member and trigger');

select throws_ok(
  $$ insert into public.notification_pref (id, household_id, member_id, trigger, mode)
     values ('55555555-0000-7000-8000-0000000000f3', '55555555-0000-7000-8000-000000000001',
             '55555555-0000-7000-8000-0000000000a1', 'duty_due_today', 'off') $$,
  '23514', null, 'the locked triggers cannot be switched off');

select throws_ok(
  $$ insert into public.notification_pref (id, household_id, member_id, trigger, mode)
     values ('55555555-0000-7000-8000-0000000000f4', '55555555-0000-7000-8000-000000000001',
             '55555555-0000-7000-8000-0000000000a1', 'shopping_added', 'buzz') $$,
  '23514', null, 'mode is sound, silent or off');

-- writing into a flatmate's row is refused by the insert policy, not silently dropped
select throws_ok(
  $$ insert into public.notification_pref (id, household_id, member_id, trigger, mode)
     values ('55555555-0000-7000-8000-0000000000f5', '55555555-0000-7000-8000-000000000001',
             '55555555-0000-7000-8000-0000000000a2', 'shopping_added', 'off') $$,
  '42501', null, 'nobody can mute a flatmate''s phone');

-- a flatmate may read it (the treasurer asking why Ayan never got it)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005b0","role":"authenticated"}';
select is((select count(*) from public.notification_pref), 1::bigint, 'the household can read the choices');

-- an outsider sees nothing
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005c0","role":"authenticated"}';
select is((select count(*) from public.notification_pref), 0::bigint, 'a non-member reads no choices');

-- ---------------------------------------------------------------- the bucket

reset role;
select is(
  (select public from storage.buckets where id = 'member-photos'),
  false, 'the member-photos bucket is private');

select * from finish();
rollback;
