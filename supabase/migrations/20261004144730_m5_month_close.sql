-- M5 Month close: a closed month is frozen. One new table plus BEFORE triggers that judge
-- only NEW rows (and the one DELETE a mate can still do), so the four months of live rows
-- already in the database are untouched by this migration.
-- Months are IST (Asia/Kolkata, no DST), matching istDate() in src/domain/kitty.ts.

-- ---------------------------------------------------------------- table

create table public.month_close (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  closed_at timestamptz not null default now(),
  closed_by uuid not null,
  created_at timestamptz not null default now(),
  unique (household_id, month),
  unique (household_id, id),
  foreign key (household_id, closed_by) references public.member (household_id, id)
);
create index on public.month_close (closed_by);

-- ---------------------------------------------------------------- helpers

create function private.ist_month(ts timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(ts at time zone 'Asia/Kolkata', 'YYYY-MM')
$$;

-- definer: a trigger must see the close regardless of who is writing
create function private.month_is_closed(p_household_id uuid, p_month text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.month_close
    where household_id = p_household_id and month = p_month
  )
$$;

create function private.i_hold_kitty(p_household_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household h
    join public.member m on m.household_id = h.id and m.id = h.pool_holder_id
    where h.id = p_household_id and m.user_id = (select auth.uid())
  )
$$;

create function private.reject_if_closed(p_household_id uuid, p_month text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if private.month_is_closed(p_household_id, p_month) then
    raise exception '% is closed', to_char(to_date(p_month, 'YYYY-MM'), 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;
end $$;

revoke all on function private.ist_month(timestamptz), private.month_is_closed(uuid, text),
  private.i_hold_kitty(uuid), private.reject_if_closed(uuid, text) from public;
grant execute on function private.ist_month(timestamptz), private.month_is_closed(uuid, text),
  private.i_hold_kitty(uuid), private.reject_if_closed(uuid, text) to authenticated;

-- ---------------------------------------------------------------- enforcement

-- An absence is rejected when its date range touches any closed month, even by one day
-- (a run that starts in an open month and ends inside a closed one still changes its shares).
-- Same body for INSERT (the new row) and DELETE (a mate removing their own absence).
create function private.check_absence_closed() returns trigger
language plpgsql set search_path = '' as $$
declare r public.member_absence; m text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select c.month into m from public.month_close c
    where c.household_id = r.household_id
      and to_date(c.month, 'YYYY-MM') <= r.to_date
      and (to_date(c.month, 'YYYY-MM') + interval '1 month')::date > r.from_date
    order by c.month limit 1;
  if m is not null then
    raise exception '% is closed', to_char(to_date(m, 'YYYY-MM'), 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;
  return r;
end $$;
create trigger absence_month_closed before insert or delete on public.member_absence
  for each row execute function private.check_absence_closed();

-- A spend is judged on its own IST month. A reversal is judged on its TARGET's month and is
-- always allowed: it is allocated in the target's month and nets to zero there, so correcting
-- a mistake stays possible after close -- that is the one way into a closed month.
-- (A reversal of a reversal is already impossible: private.check_spend_reversal requires a
-- target with reverses_id null, so the chain can never grow.)
create function private.check_spend_closed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is null then
    perform private.reject_if_closed(new.household_id, private.ist_month(new.occurred_at));
  end if;
  return new;
end $$;
create trigger spend_month_closed before insert on public.spend
  for each row execute function private.check_spend_closed();

create function private.check_pool_entry_closed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is null then
    perform private.reject_if_closed(new.household_id, private.ist_month(new.occurred_at));
  end if;
  return new;
end $$;
create trigger pool_entry_month_closed before insert on public.pool_entry
  for each row execute function private.check_pool_entry_closed();

-- ---------------------------------------------------------------- RLS

alter table public.month_close enable row level security;

create policy month_close_read on public.month_close for select to authenticated
  using (household_id in (select private.my_household_ids()));
-- Closing and reopening are the treasurer's call. The contract allows any member to insert,
-- but an open insert policy would let any mate freeze a month behind the RPC's back.
create policy month_close_insert on public.month_close for insert to authenticated
  with check (household_id in (select private.my_household_ids())
              and private.i_hold_kitty(household_id));
create policy month_close_delete on public.month_close for delete to authenticated
  using (household_id in (select private.my_household_ids())
         and private.i_hold_kitty(household_id));

-- No UPDATE grant: a close either stands or is deleted (reopened).
revoke all on public.month_close from anon, authenticated;
grant select, insert, delete on public.month_close to authenticated;

-- ---------------------------------------------------------------- RPCs

-- Security invoker, so RLS applies on top of the explicit treasurer check. Idempotent:
-- a second call (same id, or a fresh id for a month already closed) is a no-op.
create function public.close_month(p_id uuid, p_household_id uuid, p_month text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.i_hold_kitty(p_household_id) then
    raise exception 'only the treasurer can close a month' using errcode = '42501';
  end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '% is not a month', p_month using errcode = 'P0001';
  end if;
  if p_month >= to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM') then
    raise exception '% is not over yet', to_char(to_date(p_month, 'YYYY-MM'), 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;
  insert into public.month_close (id, household_id, month, closed_by)
    select p_id, p_household_id, p_month, m.id from public.member m
      where m.household_id = p_household_id and m.user_id = (select auth.uid())
    on conflict do nothing;
end $$;

create function public.reopen_month(p_household_id uuid, p_month text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.i_hold_kitty(p_household_id) then
    raise exception 'only the treasurer can reopen a month' using errcode = '42501';
  end if;
  delete from public.month_close where household_id = p_household_id and month = p_month;
end $$;

revoke all on function public.close_month(uuid, uuid, text), public.reopen_month(uuid, text)
  from public, anon;
grant execute on function public.close_month(uuid, uuid, text), public.reopen_month(uuid, text)
  to authenticated;
