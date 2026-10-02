-- Invariants 1 and 4 enforced by the database itself.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'ansh@test');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');

-- a Zepto order: two items + a fee − a coupon = 54,500 paise
select lives_ok($$ select public.add_spend(
  '{"id":"44444444-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","source":"zepto","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":54500}',
  '[{"id":"55555555-0000-7000-8000-000000000001","name":"Atta 5kg","line_total_paise":45000},
    {"id":"55555555-0000-7000-8000-000000000002","name":"Dal","line_total_paise":12000},
    {"id":"55555555-0000-7000-8000-000000000003","name":"Delivery","line_total_paise":2500,"kind":"fee"},
    {"id":"55555555-0000-7000-8000-000000000004","name":"Coupon","line_total_paise":-5000,"kind":"discount"}]');
  set constraints all immediate $$, 'balanced lines are accepted');

select throws_ok($$ select public.add_spend(
  '{"id":"44444444-0000-7000-8000-000000000002","household_id":"11111111-0000-7000-8000-000000000001","source":"zepto","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":60000}',
  '[{"id":"55555555-0000-7000-8000-000000000005","name":"Atta 5kg","line_total_paise":45000}]');
  set constraints all immediate $$, '23514', null, 'lines that do not sum to the total are rejected');

select lives_ok($$ select public.add_spend(
  '{"id":"44444444-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","source":"zepto","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":54500}') $$,
  'retrying the same spend id is a no-op');

select throws_ok($$ insert into public.spend (id, household_id, source, paid_by, paid_from, total_paise, reverses_id)
  values ('44444444-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001', 'zepto', '22222222-0000-7000-8000-000000000001', 'pool', -100, '44444444-0000-7000-8000-000000000001') $$,
  '23514', null, 'a partial reversal is rejected');

insert into public.spend (id, household_id, source, paid_by, paid_from, total_paise, reverses_id)
  values ('44444444-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001', 'zepto', '22222222-0000-7000-8000-000000000001', 'pool', -54500, '44444444-0000-7000-8000-000000000001');
select is((select sum(total_paise) from public.spend), 0::numeric, 'a reversal nets its target to zero');
select is((select total_paise from public.spend where id = '44444444-0000-7000-8000-000000000001'), 54500::bigint, 'the target row is untouched');

select * from finish();
rollback;
