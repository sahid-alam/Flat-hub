-- B9 Notifications: a subscription is yours alone, notification_send is insert-only and its
-- unique key is what makes a retried cron job send once, and only the 8 push triggers may exist.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'rhea@test'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test');

set local role authenticated;

-- the outsider's flat
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000003', 'Other flat', 'Outsider');

-- Ansh's flat, with Rhea as a second mate
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
reset role;
create temp table invite as select invite_code from public.household where id = '11111111-0000-7000-8000-000000000001';
grant select on invite to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.join_household('22222222-0000-7000-8000-000000000002', (select invite_code from invite), 'Rhea');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------------------------------------------------------------- push_subscription

select lives_ok($$ insert into public.push_subscription (id, household_id, member_id, endpoint, p256dh, auth, user_agent)
  values ('bbbbbbbb-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/ansh-phone', 'key1', 'auth1', 'Chrome') $$,
  'a mate registers their own device');

-- Only a real push service: the notify function POSTs to this from inside Supabase (SSRF).
select throws_ok($$ insert into public.push_subscription (id, household_id, member_id, endpoint, p256dh, auth)
  values ('bbbbbbbb-0000-7000-8000-000000000009', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000001', 'http://169.254.169.254/latest/meta-data', 'k', 'a') $$,
  '23514', null, 'an endpoint that is not a push service is refused');

-- One row per member per device, and the same endpoint can never be two rows: a browser has one
-- subscription per service-worker registration.
select throws_ok($$ insert into public.push_subscription (id, household_id, member_id, endpoint, p256dh, auth)
  values ('bbbbbbbb-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/ansh-phone', 'key2', 'auth2') $$,
  '23505', null, 'the same endpoint cannot be registered twice');

-- A second device is fine — the table is per member PER DEVICE.
select lives_ok($$ insert into public.push_subscription (id, household_id, member_id, endpoint, p256dh, auth)
  values ('bbbbbbbb-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/ansh-laptop', 'key3', 'auth3') $$,
  'a mate registers a second device');

select throws_ok($$ insert into public.push_subscription (id, household_id, member_id, endpoint, p256dh, auth)
  values ('bbbbbbbb-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000002', 'https://fcm.googleapis.com/fcm/send/not-mine', 'k', 'a') $$,
  '42501', null, 'a mate cannot register a device for someone else');

select throws_ok($$ insert into public.push_subscription (id, household_id, member_id, endpoint, p256dh, auth)
  values ('bbbbbbbb-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000002',
          '22222222-0000-7000-8000-000000000003', 'https://fcm.googleapis.com/fcm/send/outsider', 'k', 'a') $$,
  '42501', null, 'a mate cannot register a device in another household');

-- Not a ledger: the app re-subscribes on every open and upserts, because iOS drops the
-- subscription silently. An endpoint reissued for the same device must update, not pile up.
update public.push_subscription set last_seen_at = now(), endpoint = 'https://fcm.googleapis.com/fcm/send/ansh-phone-2'
  where id = 'bbbbbbbb-0000-7000-8000-000000000001';
select is((select endpoint from public.push_subscription where id = 'bbbbbbbb-0000-7000-8000-000000000001'),
  'https://fcm.googleapis.com/fcm/send/ansh-phone-2', 'a re-subscribe updates the endpoint in place');

select lives_ok($$ delete from public.push_subscription where id = 'bbbbbbbb-0000-7000-8000-000000000003' $$,
  'turning notifications off deletes your own row');

-- Rhea sees her own rows only, never Ansh's: a subscription is the device in your pocket.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*) from public.push_subscription), 0::bigint,
  'a flatmate cannot read another flatmate''s devices');
select is((select count(*) from public.push_subscription where id = 'bbbbbbbb-0000-7000-8000-000000000001'), 0::bigint,
  'and cannot delete one either');
delete from public.push_subscription where id = 'bbbbbbbb-0000-7000-8000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*) from public.push_subscription), 1::bigint, 'Ansh''s device survived her delete');

-- the outsider sees nothing at all
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*) from public.push_subscription), 0::bigint, 'a non-member reads no subscriptions');

-- ---------------------------------------------------------------- notification_send

-- Written only by the sender under the service role. A mate must not be able to mark a
-- notification as sent, because that would suppress it.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ insert into public.notification_send (id, household_id, trigger, member_id, due_on)
  values ('cccccccc-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'duty_due_today', '22222222-0000-7000-8000-000000000001', '2026-10-08') $$,
  '42501', null, 'a mate cannot write a send record and suppress their own reminder');

reset role; -- the notify function's service role
insert into public.notification_send (id, household_id, trigger, member_id, due_on)
  values ('cccccccc-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'duty_due_today', '22222222-0000-7000-8000-000000000001', '2026-10-08');

-- THE POINT OF THE TABLE: pg_cron retries, and a job can overlap itself. The unique key is what
-- makes the second attempt a no-op instead of a second buzz on the same phone on the same day.
select throws_ok($$ insert into public.notification_send (id, household_id, trigger, member_id, due_on)
  values ('cccccccc-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          'duty_due_today', '22222222-0000-7000-8000-000000000001', '2026-10-08') $$,
  '23505', null, 'the same trigger, mate and day cannot be sent twice');

-- Tomorrow is a different day, and a different mate is a different send.
select lives_ok($$ insert into public.notification_send (id, household_id, trigger, member_id, due_on)
  values ('cccccccc-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          'duty_due_today', '22222222-0000-7000-8000-000000000001', '2026-10-09') $$,
  'the next day is a new send');
select lives_ok($$ insert into public.notification_send (id, household_id, trigger, member_id, due_on)
  values ('cccccccc-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001',
          'duty_due_today', '22222222-0000-7000-8000-000000000002', '2026-10-08') $$,
  'another mate on the same day is a new send');

-- Only 9 of the 22 triggers in docs/NOTIFICATIONS.md may ever buzz a phone. An in-app trigger
-- wired to the push sender by accident is rejected by the database, not by somebody's memory.
select throws_ok($$ insert into public.notification_send (id, household_id, trigger, member_id, due_on)
  values ('cccccccc-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001',
          'shopping_item_added', '22222222-0000-7000-8000-000000000001', '2026-10-08') $$,
  '23514', null, 'an in-app-only trigger cannot be pushed');

set local role authenticated;
select throws_ok($$ update public.notification_send set due_on = '2026-01-01' $$,
  '42501', null, 'a send record cannot be updated');
select throws_ok($$ delete from public.notification_send $$,
  '42501', null, 'a send record cannot be deleted');

-- ---------------------------------------------------------------- anon

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.push_subscription $$, '42501', null,
  'anon has no access to subscriptions');
select throws_ok($$ select count(*) from public.notification_send $$, '42501', null,
  'anon has no access to send records');

select * from finish();
rollback;
