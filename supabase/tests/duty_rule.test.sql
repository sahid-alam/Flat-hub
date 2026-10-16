-- Turn rules (20261017120000): the history the rota replays. Only the trigger writes it, it is never
-- edited, an edit starts tomorrow while a new duty starts today, and nobody outside the flat sees it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000003', 'Other flat', 'Outsider');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');

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

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*)::int from public.duty_rule where household_id = '11111111-0000-7000-8000-000000000001'), 0,
  'a non-member cannot read another flat''s rules');

select * from finish();
rollback;
