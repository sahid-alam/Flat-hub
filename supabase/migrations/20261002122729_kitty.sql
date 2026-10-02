-- M0/M1: household, members, absences, and the kitty ledgers.
-- Conventions: ids are client-generated UUIDv7, money is bigint paise, ledgers are insert-only
-- (a correction is a reversal row with the negated amount), every row carries household_id.

create schema if not exists private;

-- ---------------------------------------------------------------- tables

create table public.household (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 80),
  currency text not null default 'INR' check (currency = 'INR'),
  pool_holder_id uuid, -- FK below; null only until the first member exists
  monthly_topup_paise bigint not null default 200000 check (monthly_topup_paise >= 0),
  invite_code text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 12),
  created_at timestamptz not null default now()
);

create table public.member (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  user_id uuid not null references auth.users (id),
  display_name text not null check (length(btrim(display_name)) between 1 and 40),
  upi_vpa text check (upi_vpa ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$'),
  joined_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  left_on date check (left_on >= joined_on),
  created_at timestamptz not null default now(),
  unique (household_id, user_id),
  unique (household_id, id) -- target for same-household composite FKs
);
create index on public.member (user_id);

alter table public.household
  add foreign key (id, pool_holder_id) references public.member (household_id, id);

create table public.member_absence (
  id uuid primary key,
  household_id uuid not null,
  member_id uuid not null,
  from_date date not null,
  to_date date not null check (to_date >= from_date),
  created_at timestamptz not null default now(),
  foreign key (household_id, member_id) references public.member (household_id, id)
);
create index on public.member_absence (household_id);
create index on public.member_absence (member_id);

create table public.spend (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  source text not null check (source in ('zepto', 'local', 'other')),
  store_name text,
  paid_by uuid not null,
  paid_from text not null check (paid_from in ('pool', 'personal')),
  total_paise bigint not null,
  occurred_at timestamptz not null default now(),
  receipt_path text,
  extraction jsonb,
  reverses_id uuid unique,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, paid_by) references public.member (household_id, id),
  foreign key (household_id, reverses_id) references public.spend (household_id, id),
  check ((reverses_id is null and total_paise > 0) or (reverses_id is not null and total_paise < 0))
);
create index on public.spend (paid_by);

create table public.spend_line (
  id uuid primary key,
  household_id uuid not null,
  spend_id uuid not null,
  product_id uuid, -- products arrive in M3
  name text not null check (length(btrim(name)) between 1 and 120),
  qty numeric(12, 3) not null default 1 check (qty > 0),
  unit text,
  line_total_paise bigint not null,
  kind text not null default 'item' check (kind in ('item', 'fee', 'discount')),
  created_at timestamptz not null default now(),
  foreign key (household_id, spend_id) references public.spend (household_id, id),
  check ((kind = 'discount') = (line_total_paise < 0))
);
create index on public.spend_line (spend_id);

create table public.pool_entry (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  kind text not null check (kind in ('contribution', 'reimbursement')),
  member_id uuid not null,
  amount_paise bigint not null,
  occurred_at timestamptz not null default now(),
  note text,
  spend_id uuid, -- reimbursement: the own-pocket spend it pays back
  reverses_id uuid unique,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, member_id) references public.member (household_id, id),
  foreign key (household_id, spend_id) references public.spend (household_id, id),
  foreign key (household_id, reverses_id) references public.pool_entry (household_id, id),
  check ((reverses_id is null and amount_paise > 0) or (reverses_id is not null and amount_paise < 0)),
  check (spend_id is null or kind = 'reimbursement')
);
create index on public.pool_entry (member_id);
create index on public.pool_entry (spend_id);

-- ---------------------------------------------------------------- ledger invariants

-- Invariant 1: a spend's lines (if any) sum to its total. Deferred, so add_spend can insert
-- the spend and its lines in one transaction; a line added later must still balance.
create function private.check_spend_lines() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select coalesce(sum(line_total_paise), 0) from public.spend_line where spend_id = new.spend_id)
     <> (select total_paise from public.spend where id = new.spend_id) then
    raise exception 'spend lines must sum to the spend total' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger spend_lines_balance after insert on public.spend_line
  deferrable initially deferred for each row execute function private.check_spend_lines();

-- Invariant 4: a reversal mirrors its target exactly, so it nets to zero.
create function private.check_spend_reversal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is not null and not exists (
    select 1 from public.spend t
    where t.id = new.reverses_id and t.reverses_id is null
      and t.paid_by = new.paid_by and t.paid_from = new.paid_from and t.total_paise = -new.total_paise
  ) then
    raise exception 'a reversal must negate an original spend' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger spend_reversal before insert on public.spend
  for each row execute function private.check_spend_reversal();

create function private.check_pool_reversal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is not null and not exists (
    select 1 from public.pool_entry t
    where t.id = new.reverses_id and t.reverses_id is null
      and t.kind = new.kind and t.member_id = new.member_id and t.amount_paise = -new.amount_paise
      and t.spend_id is not distinct from new.spend_id
  ) then
    raise exception 'a reversal must negate an original pool entry' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger pool_reversal before insert on public.pool_entry
  for each row execute function private.check_pool_reversal();

-- ---------------------------------------------------------------- RLS

-- security definer so the member policy can read member without recursing into itself
create function private.my_household_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.member where user_id = (select auth.uid())
$$;
revoke all on function private.my_household_ids() from public;
grant usage on schema private to authenticated;
grant execute on function private.my_household_ids() to authenticated;

alter table public.household enable row level security;
alter table public.member enable row level security;
alter table public.member_absence enable row level security;
alter table public.spend enable row level security;
alter table public.spend_line enable row level security;
alter table public.pool_entry enable row level security;

create policy household_read on public.household for select to authenticated
  using (id in (select private.my_household_ids()));

create policy member_read on public.member for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy member_update_self on public.member for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy absence_read on public.member_absence for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy absence_insert on public.member_absence for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
-- an absence isn't a ledger: its owner may remove a mistaken one
create policy absence_delete_own on public.member_absence for delete to authenticated
  using (member_id in (select id from public.member where user_id = (select auth.uid())));

create policy spend_read on public.spend for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy spend_insert on public.spend for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

create policy spend_line_read on public.spend_line for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy spend_line_insert on public.spend_line for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

create policy pool_entry_read on public.pool_entry for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy pool_entry_insert on public.pool_entry for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

-- Explicit grants (hosted projects no longer expose new tables by default). No UPDATE/DELETE
-- on ledgers: insert-only is enforced by privileges, not just by convention.
revoke all on public.household, public.member, public.member_absence, public.spend,
  public.spend_line, public.pool_entry from anon, authenticated;
grant select on public.household, public.member to authenticated;
grant update (display_name, upi_vpa) on public.member to authenticated;
grant select, insert, delete on public.member_absence to authenticated;
grant select, insert on public.spend, public.spend_line, public.pool_entry to authenticated;

-- ---------------------------------------------------------------- RPCs

-- Joining is chicken-and-egg under RLS (not a member yet), so these two are security definer.
create function public.create_household(p_household_id uuid, p_member_id uuid, p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.household (id, name) values (p_household_id, p_name) on conflict (id) do nothing;
  insert into public.member (id, household_id, user_id, display_name)
    values (p_member_id, p_household_id, (select auth.uid()), p_display_name)
    on conflict (id) do nothing;
  -- the creator holds the kitty until they hand it over
  update public.household set pool_holder_id = p_member_id
    where id = p_household_id and pool_holder_id is null
      and exists (select 1 from public.member where id = p_member_id and user_id = (select auth.uid()));
  return p_household_id;
end $$;

create function public.join_household(p_member_id uuid, p_invite_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare h uuid;
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select id into h from public.household where invite_code = p_invite_code;
  if h is null then raise exception 'invalid invite code' using errcode = 'P0002'; end if;
  insert into public.member (id, household_id, user_id, display_name)
    values (p_member_id, h, (select auth.uid()), p_display_name)
    on conflict (household_id, user_id) do nothing;
  return h;
end $$;

-- Only the current treasurer can hand the kitty over (same household enforced by the FK).
create function public.set_pool_holder(p_household_id uuid, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.household h set pool_holder_id = p_member_id
    where h.id = p_household_id
      and exists (select 1 from public.member m
                  where m.id = h.pool_holder_id and m.user_id = (select auth.uid()));
  if not found then raise exception 'only the treasurer can hand over the kitty' using errcode = '42501'; end if;
end $$;

-- A spend and its lines in one transaction (RLS applies: security invoker). Idempotent on ids.
create function public.add_spend(p_spend jsonb, p_lines jsonb default '[]')
returns void language sql security invoker set search_path = '' as $$
  insert into public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at)
    select id, household_id, source, store_name, paid_by, paid_from, total_paise, coalesce(occurred_at, now())
    from jsonb_populate_record(null::public.spend, p_spend)
    on conflict (id) do nothing;
  insert into public.spend_line (id, household_id, spend_id, name, qty, unit, line_total_paise, kind)
    select l.id, (p_spend->>'household_id')::uuid, (p_spend->>'id')::uuid, l.name, coalesce(l.qty, 1), l.unit,
           l.line_total_paise, coalesce(l.kind, 'item')
    from jsonb_populate_recordset(null::public.spend_line, p_lines) l
    on conflict (id) do nothing;
$$;

revoke all on function public.create_household(uuid, uuid, text, text), public.join_household(uuid, text, text),
  public.set_pool_holder(uuid, uuid), public.add_spend(jsonb, jsonb) from public, anon;
grant execute on function public.create_household(uuid, uuid, text, text), public.join_household(uuid, text, text),
  public.set_pool_holder(uuid, uuid), public.add_spend(jsonb, jsonb) to authenticated;
