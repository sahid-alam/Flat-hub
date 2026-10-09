-- meal_plan is a note to the cook, not a ledger: the last write wins, in place. But it is still
-- scoped to one household, and a line can never be dragged onto another day or meal.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000010a', 'mealsansh@test'),
  ('00000000-0000-0000-0000-00000000010b', 'mealsoutsider@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000010a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-00000000010a', '22222222-0000-7000-8000-00000000010a', 'Flat 4B', 'Ansh');

insert into public.meal_plan (id, household_id, date, meal, text, by)
  values ('55555555-0000-7000-8000-00000000010a', '11111111-0000-7000-8000-00000000010a', '2026-10-08', 'lunch', 'Dal chawal', '22222222-0000-7000-8000-00000000010a');
select is((select text from public.meal_plan), 'Dal chawal', 'a member writes the day''s plan');

-- the last one to write wins: an upsert on (household_id, date, meal), not a second row
insert into public.meal_plan (id, household_id, date, meal, text, by)
  values ('55555555-0000-7000-8000-00000000010b', '11111111-0000-7000-8000-00000000010a', '2026-10-08', 'lunch', 'Rajma chawal', '22222222-0000-7000-8000-00000000010a')
  on conflict (household_id, date, meal) do update set text = excluded.text, by = excluded.by, written_at = now();
select is((select count(*) from public.meal_plan), 1::bigint, 'rewriting lunch replaces the line, it does not add one');
select is((select text from public.meal_plan), 'Rajma chawal', 'the last write wins');

-- a line belongs to its day and its meal for good
select throws_ok($$ update public.meal_plan set date = '2026-10-09' $$, '42501', null, 'a plan cannot be moved to another day');
select throws_ok($$ update public.meal_plan set meal = 'dinner' $$, '42501', null, 'a plan cannot be moved to another meal');

-- the outsider
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000010b","role":"authenticated"}';
select is((select count(*) from public.meal_plan), 0::bigint, 'non-member cannot read the meal plan');
select throws_ok(
  $$ insert into public.meal_plan (id, household_id, date, meal, text, by)
     values ('55555555-0000-7000-8000-00000000010c', '11111111-0000-7000-8000-00000000010a', '2026-10-08', 'dinner', 'Maggi', '22222222-0000-7000-8000-00000000010a') $$,
  '42501', null, 'non-member cannot write into the household''s meal plan');

select * from finish();
rollback;
