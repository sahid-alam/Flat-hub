-- M3 Stock: household isolation on all four tables, stock_move is insert-only,
-- put_away is idempotent, and a shopping item can be ticked off and un-ticked.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'outsider@test');

set local role authenticated;

-- the outsider's flat, with its own product and a spend line
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000002', 'Other flat', 'Outsider');
insert into public.product (id, household_id, name, base_unit)
  values ('66666666-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000002', 'Their milk', 'ml');
select public.add_spend(
  '{"id":"44444444-0000-7000-8000-000000000002","household_id":"11111111-0000-7000-8000-000000000002","source":"local","paid_by":"22222222-0000-7000-8000-000000000002","paid_from":"pool","total_paise":5000}',
  '[{"id":"55555555-0000-7000-8000-000000000002","name":"Milk","line_total_paise":5000}]');
set constraints all immediate;

-- ansh's flat
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
insert into public.product (id, household_id, name, base_unit, track_stock, min_qty)
  values ('66666666-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'Atta', 'g', true, 1000);
select public.add_spend(
  '{"id":"44444444-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","source":"zepto","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":45000}',
  '[{"id":"55555555-0000-7000-8000-000000000001","name":"Aashirvaad Atta 5kg","line_total_paise":45000,"product_id":"66666666-0000-7000-8000-000000000001"}]');
set constraints all immediate;

insert into public.product_uom (household_id, product_id, unit, factor_to_base)
  values ('11111111-0000-7000-8000-000000000001', '66666666-0000-7000-8000-000000000001', 'packet', 5000);

-- ---------------------------------------------------------------- put_away

select lives_ok($$ select public.put_away('[{"id":"77777777-0000-7000-8000-000000000001",
  "household_id":"11111111-0000-7000-8000-000000000001","product_id":"66666666-0000-7000-8000-000000000001",
  "spend_line_id":"55555555-0000-7000-8000-000000000001","location":"pantry","expiry_date":"2026-12-31","qty":5000}]') $$,
  'put_away creates a lot and its opening move');
select is((select opened from public.lot where id = '77777777-0000-7000-8000-000000000001'), false,
  'a new lot defaults to unopened');
select is((select reason from public.stock_move where lot_id = '77777777-0000-7000-8000-000000000001'), 'purchase',
  'the opening move is a purchase');
select is((select member_id from public.stock_move where lot_id = '77777777-0000-7000-8000-000000000001'),
  '22222222-0000-7000-8000-000000000001'::uuid, 'the opening move is credited to the caller');

-- the same call again: a retry must change nothing
select public.put_away('[{"id":"77777777-0000-7000-8000-000000000001",
  "household_id":"11111111-0000-7000-8000-000000000001","product_id":"66666666-0000-7000-8000-000000000001",
  "spend_line_id":"55555555-0000-7000-8000-000000000001","location":"pantry","expiry_date":"2026-12-31","qty":5000}]');
select is((select count(*) from public.lot), 1::bigint, 'put_away is idempotent on lot ids');
select is((select sum(delta_qty) from public.stock_move), 5000::numeric, 'put_away is idempotent on the ledger');

-- a quantity that rounds to zero would leave a lot with no opening move, invisible on every screen
select throws_ok($$ select public.put_away('[{"id":"77777777-0000-7000-8000-000000000006",
  "household_id":"11111111-0000-7000-8000-000000000001","product_id":"66666666-0000-7000-8000-000000000001",
  "location":"pantry","qty":0.0004}]') $$,
  '23514', null, 'put_away rejects a quantity that rounds to zero');
select is((select count(*) from public.lot), 1::bigint, 'and the lot it would have made is rolled back');

-- ---------------------------------------------------------------- insert-only ledger

select throws_ok($$ update public.stock_move set delta_qty = 1 $$, '42501', null, 'stock_move cannot be updated');
select throws_ok($$ delete from public.stock_move $$, '42501', null, 'stock_move cannot be deleted');

-- a correction is a compensating move
insert into public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id)
  values ('88888888-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001',
          '77777777-0000-7000-8000-000000000001', -2000, 'consume', '22222222-0000-7000-8000-000000000001');
select is((select sum(delta_qty) from public.stock_move where lot_id = '77777777-0000-7000-8000-000000000001'),
  3000::numeric, 'on-hand is the sum of the moves');

-- ---------------------------------------------------------------- cross-household FKs

select throws_ok($$ insert into public.lot (id, household_id, product_id, location)
  values ('77777777-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000002', 'fridge') $$,
  '23503', null, 'a lot cannot reference another household''s product');
select throws_ok($$ insert into public.lot (id, household_id, product_id, spend_line_id, location)
  values ('77777777-0000-7000-8000-000000000004', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', '55555555-0000-7000-8000-000000000002', 'fridge') $$,
  '23503', null, 'a lot cannot reference another household''s spend line');

-- ---------------------------------------------------------------- shopping list

insert into public.shopping_item (id, household_id, name, added_by)
  values ('99999999-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'Dahi',
          '22222222-0000-7000-8000-000000000001');
update public.shopping_item
  set done_by_spend_line_id = '55555555-0000-7000-8000-000000000001', done_at = now()
  where id = '99999999-0000-7000-8000-000000000001';
select isnt((select done_at from public.shopping_item where id = '99999999-0000-7000-8000-000000000001'), null,
  'a shopping item can be ticked off');
update public.shopping_item set done_by_spend_line_id = null, done_at = null
  where id = '99999999-0000-7000-8000-000000000001';
select is((select done_at from public.shopping_item where id = '99999999-0000-7000-8000-000000000001'), null,
  'a shopping item can be un-ticked');

-- ---------------------------------------------------------------- the outsider

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*) from public.product_uom) + (select count(*) from public.lot)
          + (select count(*) from public.stock_move) + (select count(*) from public.shopping_item),
  0::bigint, 'a non-member reads none of the stock tables');
select throws_ok($$ insert into public.lot (id, household_id, product_id, location)
  values ('77777777-0000-7000-8000-000000000005', '11111111-0000-7000-8000-000000000001',
          '66666666-0000-7000-8000-000000000001', 'fridge') $$,
  '42501', null, 'a non-member cannot insert a lot');
select throws_ok($$ insert into public.product_uom (household_id, product_id, unit, factor_to_base)
  values ('11111111-0000-7000-8000-000000000001', '66666666-0000-7000-8000-000000000001', 'sack', 10000) $$,
  '42501', null, 'a non-member cannot insert a uom');
select throws_ok($$ insert into public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id)
  values ('88888888-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001',
          '77777777-0000-7000-8000-000000000001', -3000, 'discard', '22222222-0000-7000-8000-000000000001') $$,
  '42501', null, 'a non-member cannot insert a stock move');
select throws_ok($$ insert into public.shopping_item (id, household_id, name, added_by)
  values ('99999999-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', 'Sneaky',
          '22222222-0000-7000-8000-000000000001') $$,
  '42501', null, 'a non-member cannot insert a shopping item');

select * from finish();
rollback;
