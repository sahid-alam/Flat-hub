-- Turn rules (20261017120000): the history the rota replays. Only the trigger writes it, it is never
-- edited, an edit starts tomorrow while a new duty starts today, and nobody outside the flat sees it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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

insert into public.duty (id, household_id, name, every_days, roster)
  values ('aaaaaaaa-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'Garbage', 1,
          array['22222222-0000-7000-8000-000000000001']::uuid[]);

select is((select count(*)::int from public.duty_rule), 1, 'a new duty writes its first rule');
select ok((select starts_on = (now() at time zone 'Asia/Kolkata')::date and turns = 'order' and on_miss = 'makeup' from public.duty_rule),
  'a new duty''s rule starts today, in strict order with make-up turns');

update public.duty set name = 'Garbage dump' where id = 'aaaaaaaa-0000-7000-8000-000000000001';
select is((select count(*)::int from public.duty_rule), 1, 'renaming a duty writes no rule');

update public.duty set roster = array['22222222-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001']::uuid[]
  where id = 'aaaaaaaa-0000-7000-8000-000000000001';
select is((select count(*)::int from public.duty_rule), 2, 'changing the order writes a rule');
select ok((select starts_on = (now() at time zone 'Asia/Kolkata')::date + 1 from public.duty_rule order by created_at desc, starts_on desc limit 1),
  'and it starts tomorrow, so today''s turn does not change hands');

update public.duty set on_miss = 'none' where id = 'aaaaaaaa-0000-7000-8000-000000000001';
select is((select count(*)::int from public.duty_rule), 3, 'changing what a miss costs writes a rule');
select throws_ok($$ update public.duty set turns = 'random' where id = 'aaaaaaaa-0000-7000-8000-000000000001' $$,
  '23514', null, 'turns is order or points, nothing else');

-- The history cannot be written or rewritten by hand: that would re-decide whose past days were.
select throws_ok($$ insert into public.duty_rule (household_id, duty_id, starts_on, turns, on_miss)
  values ('11111111-0000-7000-8000-000000000001', 'aaaaaaaa-0000-7000-8000-000000000001', '2020-01-01', 'order', 'none') $$,
  '42501', null, 'a mate cannot write a rule directly, backdated or not');
select throws_ok($$ update public.duty_rule set on_miss = 'none' $$, '42501', null, 'a rule cannot be edited');
select throws_ok($$ delete from public.duty_rule $$, '42501', null, 'a rule cannot be deleted');
select throws_ok($$ select private.record_duty_rule() $$, '42501', null, 'the trigger function is not callable');

-- Everything else that decides a day is frozen with the rule too.
update public.duty set weekdays = array[1, 3, 5], every_days = null, group_size = 2
  where id = 'aaaaaaaa-0000-7000-8000-000000000001';
select ok(exists (select 1 from public.duty_rule where duty_id = 'aaaaaaaa-0000-7000-8000-000000000001'
                 and weekdays = array[1, 3, 5] and every_days is null and group_size = 2 and schedule = 'rolling'
                 and starts_on = (now() at time zone 'Asia/Kolkata')::date + 1),
  'a schedule or group-size change writes a rule that carries the new shape');

-- ---------------------------------------------------------------- the past stays the past
select throws_ok($$ insert into public.member_absence (id, household_id, member_id, from_date, to_date)
  values ('dddddddd-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000002', '2026-10-01', '2026-10-02') $$,
  '42501', null, 'a mate cannot record an absence for another mate');
insert into public.member_absence (id, household_id, member_id, from_date, to_date, created_at)
  values ('dddddddd-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000001', '2026-10-01', '2026-10-02', '2020-01-01');
select ok((select created_at > now() - interval '1 minute' from public.member_absence
           where id = 'dddddddd-0000-7000-8000-000000000002'),
  'the server stamps when an absence was recorded; the client cannot backdate it');
-- Added today, so a mis-tap can still come off even though it has started.
delete from public.member_absence where id = 'dddddddd-0000-7000-8000-000000000002';
select is((select count(*)::int from public.member_absence where id = 'dddddddd-0000-7000-8000-000000000002'), 0,
  'an absence added today can be removed');
insert into public.member_absence (id, household_id, member_id, from_date, to_date)
  values ('dddddddd-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000001', '2026-10-01', '2026-10-02'),
         ('dddddddd-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001',
          '22222222-0000-7000-8000-000000000001', '2099-01-01', '2099-01-02');
reset role;
update public.member_absence set created_at = now() - interval '3 days';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
delete from public.member_absence where id in ('dddddddd-0000-7000-8000-000000000003', 'dddddddd-0000-7000-8000-000000000004');
select is((select count(*)::int from public.member_absence where id = 'dddddddd-0000-7000-8000-000000000003'), 1,
  'a started absence recorded on an earlier day stays: it already decided duty days');
select is((select count(*)::int from public.member_absence where id = 'dddddddd-0000-7000-8000-000000000004'), 0,
  'one that has not started can still be removed');

insert into public.chore_event (id, household_id, duty_id, member_id, outcome, due_on, created_at)
  values ('eeeeeeee-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          'aaaaaaaa-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'done', '2026-10-05', '2020-01-01');
select ok((select created_at > now() - interval '1 minute' from public.chore_event where id = 'eeeeeeee-0000-7000-8000-000000000001'),
  'the server stamps when a Done was recorded, so a late tick reads as late');
select ok((select points = 1 from public.chore_event where id = 'eeeeeeee-0000-7000-8000-000000000001'),
  'and the stamp leaves the price trigger alone');

-- No list, order mode: the rule still carries one, in the order the app shows.
insert into public.duty (id, household_id, name, every_days)
  values ('aaaaaaaa-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', 'Bins', 2);
select is((select roster from public.duty_rule where duty_id = 'aaaaaaaa-0000-7000-8000-000000000002'),
  array['22222222-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000002']::uuid[],
  'an order rule with no list snapshots the flat in display-name order (Ansh, then Rhea)');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*)::int from public.duty_rule where household_id = '11111111-0000-7000-8000-000000000001'), 0,
  'a non-member cannot read another flat''s rules');

select * from finish();
rollback;
