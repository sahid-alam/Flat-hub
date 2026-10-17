-- The private calendar feed (20261017150000): a token is yours alone, only the function hands it out,
-- resetting it really replaces it, and nobody reads anyone else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'rhea@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
reset role;
create temp table invite as select invite_code from public.household where id = '11111111-0000-7000-8000-000000000001';
create temp table seen (who text, token text);
grant select on invite to authenticated;
grant select, insert on seen to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.join_household('22222222-0000-7000-8000-000000000002', (select invite_code from invite), 'Rhea');
insert into seen values ('rhea', public.calendar_feed_token('11111111-0000-7000-8000-000000000001'));

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into seen values ('ansh', public.calendar_feed_token('11111111-0000-7000-8000-000000000001'));
select ok((select token ~ '^[0-9a-f]{48}$' from seen where who = 'ansh'), 'a token is 48 random hex characters');
select is(public.calendar_feed_token('11111111-0000-7000-8000-000000000001'), (select token from seen where who = 'ansh'),
  'asking again returns the same link, so the calendar keeps working');
select isnt(public.calendar_feed_token('11111111-0000-7000-8000-000000000001', true), (select token from seen where who = 'ansh'),
  'resetting replaces it');
select is((select count(*)::int from public.calendar_feed), 1, 'a mate sees their own row and nobody else''s');
select throws_ok($$ insert into public.calendar_feed (member_id, household_id, token)
  values ('22222222-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', repeat('a', 48)) $$,
  '42501', null, 'nobody writes a token directly');
select throws_ok($$ update public.calendar_feed set token = repeat('b', 48) $$, '42501', null, 'or changes one');
select throws_ok($$ select public.calendar_feed_token('11111111-0000-7000-8000-000000000009') $$,
  '42501', null, 'a token is only for a flat you are in');
reset role;
select is((select count(*)::int from public.calendar_feed where household_id = '11111111-0000-7000-8000-000000000001'), 2, 'one row per mate who asked');

select * from finish();
rollback;
