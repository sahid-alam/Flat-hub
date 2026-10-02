-- A non-member can't read or write another household's rows; ledgers are insert-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ansh@test'),
  ('00000000-0000-0000-0000-00000000000b', 'outsider@test');

-- as ansh: create a household and record a top-up and a spend
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.create_household('11111111-0000-7000-8000-000000000001', '22222222-0000-7000-8000-000000000001', 'Flat 4B', 'Ansh');
insert into public.pool_entry (id, household_id, kind, member_id, amount_paise)
  values ('33333333-0000-7000-8000-000000000001', '11111111-0000-7000-8000-000000000001', 'contribution', '22222222-0000-7000-8000-000000000001', 200000);
select public.add_spend('{"id":"44444444-0000-7000-8000-000000000001","household_id":"11111111-0000-7000-8000-000000000001","source":"local","paid_by":"22222222-0000-7000-8000-000000000001","paid_from":"pool","total_paise":6000}');
select is((select count(*) from public.spend), 1::bigint, 'member reads own household spend');

select throws_ok($$ update public.pool_entry set amount_paise = 1 $$, '42501', null, 'ledger rows cannot be updated');
select throws_ok($$ delete from public.spend $$, '42501', null, 'ledger rows cannot be deleted');

-- as the outsider: sees nothing, can't write into ansh's household
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*) from public.household), 0::bigint, 'non-member cannot read the household');
select is((select count(*) from public.member), 0::bigint, 'non-member cannot read members');
select is((select count(*) from public.spend), 0::bigint, 'non-member cannot read spends');
select is((select count(*) from public.pool_entry), 0::bigint, 'non-member cannot read pool entries');
select throws_ok(
  $$ insert into public.pool_entry (id, household_id, kind, member_id, amount_paise)
     values ('33333333-0000-7000-8000-000000000002', '11111111-0000-7000-8000-000000000001', 'contribution', '22222222-0000-7000-8000-000000000001', 100) $$,
  '42501', null, 'non-member cannot insert into the household');

-- anon sees nothing at all
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.spend $$, '42501', null, 'anon has no table access');

select * from finish();
rollback;
