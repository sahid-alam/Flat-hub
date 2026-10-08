-- B7 Bills: cook, electricity, Wi-Fi. One mate pays the vendor, the rest owe that mate their share.
-- Additive only: nothing here touches the kitty's tables or rows.
--
-- This is NOT the kitty. The kitty is pooled (no per-expense splits, no mate-to-mate debt); a bill is
-- a payer with per-person shares and a debt until each share is settled. The two never mix: no bill
-- row reaches pool_entry, and nothing here changes anyone's kitty position.
--
-- The split itself is computed client-side by splitBill() in src/domain/bills.ts, which reuses
-- allocate() from src/domain/kitty.ts (largest remainder, ties to the lowest member id). The database
-- only insists the shares sum to the total exactly.
--
-- Month close deliberately does NOT freeze bills: there is no private.check_bill_closed() to match the
-- guards in 20261004154135_m5_close_guards.sql, because a bill is not kitty money and settling one
-- late cannot rewrite a frozen month's shares or anyone's position. Don't "fix" this.

-- ---------------------------------------------------------------- tables

create table public.bill (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  label text not null check (length(btrim(label)) between 1 and 60),
  total_paise bigint not null check (total_paise > 0),
  paid_by uuid not null, -- whoever added it pays the vendor; the others owe them
  occurred_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at timestamptz not null default now(),
  unique (household_id, id), -- target for same-household composite FKs
  foreign key (household_id, paid_by) references public.member (household_id, id)
);
create index on public.bill (household_id);
create index on public.bill (paid_by);

-- Written once, with the bill, in one transaction. Insert-only like every other ledger: a share is
-- never edited, and a bill with a wrong total is a new bill (see the gap noted in the B7 report).
create table public.bill_share (
  id uuid primary key,
  household_id uuid not null,
  bill_id uuid not null,
  member_id uuid not null,
  paise bigint not null check (paise >= 0),
  created_at timestamptz not null default now(),
  unique (household_id, bill_id, member_id), -- one share per mate, and bill_payment's FK target
  foreign key (household_id, bill_id) references public.bill (household_id, id),
  foreign key (household_id, member_id) references public.member (household_id, id)
);
create index on public.bill_share (bill_id);
create index on public.bill_share (member_id);

-- INSERT-ONLY ledger, exactly like pool_entry: who settled which share, and when. A mistake is
-- corrected with a negated reversing row carrying reverses_id, never with an UPDATE or DELETE.
create table public.bill_payment (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  bill_id uuid not null,
  member_id uuid not null, -- whose share this settles
  paise bigint not null,
  occurred_at timestamptz not null default now(),
  note text,
  reverses_id uuid unique,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, bill_id, member_id)
    references public.bill_share (household_id, bill_id, member_id),
  foreign key (household_id, reverses_id) references public.bill_payment (household_id, id),
  check ((reverses_id is null and paise > 0) or (reverses_id is not null and paise < 0))
);
create index on public.bill_payment (bill_id);
create index on public.bill_payment (member_id);

-- ---------------------------------------------------------------- invariants

-- 1. A bill's shares sum to its total, exactly. Deferred, so add_bill can insert the bill and its six
-- shares in one transaction; a share added later must still balance.
create function private.check_bill_shares() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select coalesce(sum(paise), 0) from public.bill_share where bill_id = new.bill_id)
     <> (select total_paise from public.bill where id = new.bill_id) then
    raise exception 'bill shares must sum to the bill total' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger bill_shares_balance after insert on public.bill_share
  deferrable initially deferred for each row execute function private.check_bill_shares();

-- 2. A reversal mirrors its target exactly, so the pair nets to zero.
create function private.check_bill_payment_reversal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is not null and not exists (
    select 1 from public.bill_payment t
    where t.id = new.reverses_id and t.reverses_id is null
      and t.bill_id = new.bill_id and t.member_id = new.member_id and t.paise = -new.paise
  ) then
    raise exception 'a reversal must negate an original bill payment' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger bill_payment_reversal before insert on public.bill_payment
  for each row execute function private.check_bill_payment_reversal();

-- 3. Net payments on a share stay between zero and the share itself: no paying ₹500 against a ₹100
-- share, and no marking the same share paid twice. Not deferred — every row has to hold on its own.
create function private.check_bill_payment_total() returns trigger
language plpgsql set search_path = '' as $$
declare net bigint; owed bigint;
begin
  select coalesce(sum(paise), 0) into net from public.bill_payment
    where bill_id = new.bill_id and member_id = new.member_id;
  select paise into owed from public.bill_share
    where bill_id = new.bill_id and member_id = new.member_id;
  if net < 0 or net > owed then
    raise exception 'bill payments on a share must stay between zero and the share'
      using errcode = '23514';
  end if;
  return null;
end $$;
create trigger bill_payment_within_share after insert on public.bill_payment
  for each row execute function private.check_bill_payment_total();

-- ---------------------------------------------------------------- RLS

alter table public.bill enable row level security;
alter table public.bill_share enable row level security;
alter table public.bill_payment enable row level security;

create policy bill_read on public.bill for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy bill_insert on public.bill for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

create policy bill_share_read on public.bill_share for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy bill_share_insert on public.bill_share for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

-- Any member may insert a payment; "only the payer marks a share paid" is a UI rule, exactly as
-- "only the treasurer reimburses" is on /reimburse. The ledger is append-only, so a wrong row is
-- visible and reversible rather than silently destructive.
create policy bill_payment_read on public.bill_payment for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy bill_payment_insert on public.bill_payment for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

-- No UPDATE/DELETE anywhere: insert-only is enforced by privileges, not just by convention.
revoke all on public.bill, public.bill_share, public.bill_payment from anon, authenticated;
grant select, insert on public.bill, public.bill_share, public.bill_payment to authenticated;
revoke all on function private.check_bill_shares(), private.check_bill_payment_reversal(),
  private.check_bill_payment_total() from public;
grant execute on function private.check_bill_shares(), private.check_bill_payment_reversal(),
  private.check_bill_payment_total() to authenticated;

-- ---------------------------------------------------------------- RPC

-- A bill and its shares in one transaction (RLS applies: security invoker). Idempotent on ids, so a
-- retried save that already landed is a no-op rather than a second bill.
create function public.add_bill(p_bill jsonb, p_shares jsonb)
returns void language sql security invoker set search_path = '' as $$
  insert into public.bill (id, household_id, label, total_paise, paid_by, occurred_on)
    select id, household_id, label, total_paise, paid_by,
           coalesce(occurred_on, (now() at time zone 'Asia/Kolkata')::date)
    from jsonb_populate_record(null::public.bill, p_bill)
    on conflict (id) do nothing;
  insert into public.bill_share (id, household_id, bill_id, member_id, paise)
    select s.id, (p_bill->>'household_id')::uuid, (p_bill->>'id')::uuid, s.member_id, s.paise
    from jsonb_populate_recordset(null::public.bill_share, p_shares) s
    on conflict (id) do nothing;
$$;
revoke all on function public.add_bill(jsonb, jsonb) from public, anon;
grant execute on function public.add_bill(jsonb, jsonb) to authenticated;
