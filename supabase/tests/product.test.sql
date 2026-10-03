-- Products: household-scoped, no delete; add_spend keeps extraction + product_id; learn_alias.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'outsider@test');

set local role authenticated;

-- the outsider has their own flat with its own product
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000002', '22222222-0000-7000-8000-000000000002', 'Other flat', 'Outsider');
insert into public.product (id, household_id, name)
  values ('66666666-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000002', 'Their milk');

-- ansh's flat
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
insert into public.product (id, household_id, name)
  values ('66666666-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'Atta');

select is((select count(*) from public.product), 1::bigint, 'member reads only own household products');

select lives_ok($$ update public.product set favourite = true where id = '66666666-0000-7000-8000-000000000001' $$,
  'member can update favourite');
select is((select favourite from public.product where id = '66666666-0000-7000-8000-000000000001'), true,
  'favourite is saved');

select throws_ok($$ delete from public.product $$, '42501', null, 'products cannot be deleted');

select lives_ok($$ select public.add_spend(
  '{"id":"44444444-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","source":"zepto","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":45000,
    "extraction":{"source":"zepto","total_paise":45000}}',
  '[{"id":"55555555-0000-7000-8000-000000000001","name":"Aashirvaad Atta 5kg","line_total_paise":45000,"product_id":"66666666-0000-7000-8000-000000000001"}]');
  set constraints all immediate $$, 'add_spend accepts extraction and product_id');
select is((select extraction->>'source' from public.spend where id = '44444444-0000-7000-8000-000000000001'), 'zepto',
  'add_spend stores the extraction');
select is((select product_id from public.spend_line where id = '55555555-0000-7000-8000-000000000001'),
  '66666666-0000-7000-8000-000000000001'::uuid, 'add_spend stores the product_id');

select throws_ok($$ select public.add_spend(
  '{"id":"44444444-0000-7000-8000-000000000002","household_id":"11111111-0000-7000-8000-000000000001","source":"zepto","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":3000}',
  '[{"id":"55555555-0000-7000-8000-000000000002","name":"Milk","line_total_paise":3000,"product_id":"66666666-0000-7000-8000-000000000002"}]') $$,
  '23503', null, 'a spend line cannot reference another household''s product');

select public.learn_alias('66666666-0000-7000-8000-000000000001', '  Aashirvaad Atta 5kg ');
select public.learn_alias('66666666-0000-7000-8000-000000000001', 'aashirvaad atta 5KG');
select is((select aliases from public.product where id = '66666666-0000-7000-8000-000000000001'),
  array['aashirvaad atta 5kg'], 'learn_alias appends a normalized alias once');

-- the outsider: can't see, insert into, or teach ansh's products
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*) from public.product where household_id = '11111111-0000-7000-8000-000000000001'), 0::bigint,
  'non-member cannot read the household''s products');
select throws_ok(
  $$ insert into public.product (id, household_id, name)
     values ('66666666-0000-7000-8000-000000000003', '11111111-0000-7000-8000-000000000001', 'Sneaky') $$,
  '42501', null, 'non-member cannot insert a product into the household');
select public.learn_alias('66666666-0000-7000-8000-000000000001', 'sneaky');
reset role;
select is((select aliases from public.product where id = '66666666-0000-7000-8000-000000000001'),
  array['aashirvaad atta 5kg'], 'non-member learn_alias is a no-op');

select * from finish();
rollback;
