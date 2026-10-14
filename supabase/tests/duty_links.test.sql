-- B4 part two: areas are labels, "comes with" is one level deep, and both stay inside one flat.
-- Every structural rule the domain relies on is held here, so no client bug can store a bad link.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test');

set local role authenticated;

-- the outsider's flat, with one duty of its own
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000003', 'Other flat', 'Outsider');
insert into public.duty (id, household_id, name, every_days)
  values ('cccccccc-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000002', 'Their dishes', 1);

-- Ansh's flat
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');

-- ---------------------------------------------------------------- areas

select is((select count(*)::int from public.duty_area), 4,
  'a new flat starts with four areas, and sees only its own');
select is((select string_agg(name, ',' order by position) from public.duty_area),
  'Kitchen,Bathroom,Common areas,Outside', 'in a sensible order');

select lives_ok($$ insert into public.duty_area (id, household_id, name, position)
  values ('ddddddd1-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'Terrace', 4) $$,
  'a mate can add an area');
select throws_ok($$ insert into public.duty_area (id, household_id, name)
  values ('ddddddd1-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', ' kitchen ') $$,
  '23505', null, 'an area cannot be added twice under different case or spacing');
select throws_ok($$ insert into public.duty_area (id, household_id, name)
  values ('ddddddd1-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000002', 'Sneaky') $$,
  '42501', null, 'a mate cannot add an area to another flat');

update public.duty_area set name = 'Roof terrace' where id = 'ddddddd1-0000-7000-8000-000000000001';
select is((select name from public.duty_area where id = 'ddddddd1-0000-7000-8000-000000000001'), 'Roof terrace',
  'a mate can rename an area');

insert into public.duty (id, household_id, name, every_days, area_id)
  values ('aaaaaaaa-0000-7000-8000-000000000009', '11111111-0000-7000-8000-000000000001', 'Sweep terrace', 7,
          'ddddddd1-0000-7000-8000-000000000001');
select lives_ok($$ delete from public.duty_area where id = 'ddddddd1-0000-7000-8000-000000000001' $$,
  'a mate can remove an area');
select ok((select area_id is null and household_id = '11111111-0000-7000-8000-000000000001'
           from public.duty where id = 'aaaaaaaa-0000-7000-8000-000000000009'),
  'removing an area un-labels its duties and keeps them in their flat');

reset role;
create temp table other_area as select id from public.duty_area where household_id = '11111111-0000-7000-8000-000000000002' limit 1;
grant select on other_area to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ insert into public.duty (id, household_id, name, every_days, area_id)
  values ('aaaaaaaa-0000-7000-8000-00000000000b', '11111111-0000-7000-8000-000000000001', 'Borrowed', 1,
          (select id from other_area)) $$,
  '23503', null, 'a duty cannot carry another flat''s area');

-- ---------------------------------------------------------------- comes with: shape

insert into public.duty (id, household_id, name, effort_points, every_days, group_size) values
  ('aaaaaaaa-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'Dishes', 2, 1, 2),
  ('aaaaaaaa-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', 'Meal planning', 1, 1, 1),
  ('aaaaaaaa-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001', 'Wipe the counter', 1, 1, 1),
  ('aaaaaaaa-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001', 'Bins', 1, 2, 1);
insert into public.duty (id, household_id, name, every_days, schedule, fixed_member_id) values
  ('aaaaaaaa-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001', 'Water filter', 7, 'fixed',
   '22222222-0000-7000-8000-000000000001');

select throws_ok($$ update public.duty set follows_id = id where id = 'aaaaaaaa-0000-7000-8000-000000000002' $$,
  '23514', null, 'a duty cannot come with itself');
select throws_ok($$ update public.duty set follows_id = 'aaaaaaaa-0000-7000-8000-000000000001'
  where id = 'aaaaaaaa-0000-7000-8000-000000000005' $$,
  '23514', null, 'a fixed duty cannot come with another — "always Ansh" and "whoever has dishes" would both claim it');
select throws_ok($$ update public.duty set follows_id = 'cccccccc-0000-7000-8000-000000000001'
  where id = 'aaaaaaaa-0000-7000-8000-000000000002' $$,
  '23503', null, 'a duty cannot come with another flat''s duty');

update public.duty set roster = array['22222222-0000-7000-8000-000000000001']::uuid[]
  where id = 'aaaaaaaa-0000-7000-8000-000000000003';
select throws_ok($$ update public.duty set follows_id = 'aaaaaaaa-0000-7000-8000-000000000001'
  where id = 'aaaaaaaa-0000-7000-8000-000000000003' $$,
  '23514', null, 'a follower keeps no roster of its own: its crew is its leader''s');
update public.duty set roster = null where id = 'aaaaaaaa-0000-7000-8000-000000000003';

-- Meal planning comes with Dishes
update public.duty set follows_id = 'aaaaaaaa-0000-7000-8000-000000000001' where id = 'aaaaaaaa-0000-7000-8000-000000000002';
-- (a) X comes with Meal planning, which already comes with Dishes: that is a chain
select throws_ok($$ update public.duty set follows_id = 'aaaaaaaa-0000-7000-8000-000000000002'
  where id = 'aaaaaaaa-0000-7000-8000-000000000004' $$,
  '23514', null, 'a duty cannot come with one that itself comes with another (no chain, direction a)');
-- (b) Dishes has a follower, so Dishes cannot start following Bins: X→Dishes→Bins, one row at a time
select throws_ok($$ update public.duty set follows_id = 'aaaaaaaa-0000-7000-8000-000000000004'
  where id = 'aaaaaaaa-0000-7000-8000-000000000001' $$,
  '23514', null, 'a duty that others come with cannot itself come with another (no chain, direction b)');
-- and a loop is just a chain that closes
select throws_ok($$ update public.duty set follows_id = 'aaaaaaaa-0000-7000-8000-000000000002'
  where id = 'aaaaaaaa-0000-7000-8000-000000000001' $$,
  '23514', null, 'no loop: Dishes cannot come with its own follower');

-- ---------------------------------------------------------------- set_duty_followers

select lives_ok($$ select public.set_duty_followers('aaaaaaaa-0000-7000-8000-000000000001',
  array['aaaaaaaa-0000-7000-8000-000000000002', 'aaaaaaaa-0000-7000-8000-000000000003']::uuid[]) $$,
  'Dishes can bring two duties along in one call');
select is((select count(*)::int from public.duty where follows_id = 'aaaaaaaa-0000-7000-8000-000000000001'), 2,
  'both now come with Dishes');

select public.set_duty_followers('aaaaaaaa-0000-7000-8000-000000000001',
  array['aaaaaaaa-0000-7000-8000-000000000002']::uuid[]);
select ok((select follows_id is null from public.duty where id = 'aaaaaaaa-0000-7000-8000-000000000003'),
  'dropping a duty from the list unlinks it');

select throws_ok($$ select public.set_duty_followers('aaaaaaaa-0000-7000-8000-000000000001',
  array['aaaaaaaa-0000-7000-8000-000000000001']::uuid[]) $$,
  '23514', null, 'a duty cannot bring itself along');
select throws_ok($$ select public.set_duty_followers('aaaaaaaa-0000-7000-8000-000000000001',
  array['cccccccc-0000-7000-8000-000000000001']::uuid[]) $$,
  '23503', null, 'a duty cannot bring along another flat''s duty');
-- A fixed duty in the list fails loudly rather than being quietly turned rolling — and because the
-- whole call is one transaction, the valid duty listed beside it is not linked either.
select throws_ok($$ select public.set_duty_followers('aaaaaaaa-0000-7000-8000-000000000001',
  array['aaaaaaaa-0000-7000-8000-000000000003', 'aaaaaaaa-0000-7000-8000-000000000005']::uuid[]) $$,
  '23514', null, 'a fixed duty in the list is refused, not quietly made rolling');
select ok((select follows_id is null from public.duty where id = 'aaaaaaaa-0000-7000-8000-000000000003'),
  'the call is all-or-nothing: a refusal links nothing');
select is((select schedule from public.duty where id = 'aaaaaaaa-0000-7000-8000-000000000005'), 'fixed',
  'and the fixed duty is still fixed');

-- the outsider cannot reach into Flat 4B
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select throws_ok($$ select public.set_duty_followers('aaaaaaaa-0000-7000-8000-000000000001', '{}'::uuid[]) $$,
  'P0002', null, 'a non-member cannot change another flat''s links: the duty is invisible to them');
select is((select count(*)::int from public.duty_area where household_id = '11111111-0000-7000-8000-000000000001'), 0,
  'a non-member cannot read another flat''s areas');

select * from finish();
rollback;
