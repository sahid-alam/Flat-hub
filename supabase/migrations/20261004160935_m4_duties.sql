-- M4 Duties: recurring chores with effort points, and the insert-only chore_event ledger.
-- Additive only: nothing here touches an existing table's rows.
-- Assignment itself lives in src/domain/duties.ts (pure TS, deterministic, no randomness) —
-- the database only holds the duties and what actually happened.

-- ---------------------------------------------------------------- tables

create table public.duty (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  effort_points int not null default 1 check (effort_points between 1 and 10),
  every_days int check (every_days between 1 and 90),
  weekdays int[] check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  schedule text not null default 'rolling' check (schedule in ('rolling', 'fixed')),
  fixed_member_id uuid, -- only meaningful for schedule = 'fixed'
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (household_id, id), -- target for chore_event's composite FK
  foreign key (household_id, fixed_member_id) references public.member (household_id, id),
  -- exactly one cadence: every N days, or a set of weekdays
  check ((every_days is null) <> (weekdays is null))
);
create index on public.duty (household_id);
create index on public.duty (fixed_member_id);

-- INSERT-ONLY ledger, like pool_entry and stock_move: a mistake is corrected with a reversing
-- row (reverses_id), never with an UPDATE or DELETE.
-- Month close deliberately does NOT freeze chore_event: duties are not money, and a chore logged
-- late can't rewrite anyone's kitty position. So there is no private.check_chore_closed() to match
-- the guards in 20261004154135_m5_close_guards.sql. Don't "fix" this.
create table public.chore_event (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  duty_id uuid not null,
  member_id uuid not null, -- whose turn it was
  outcome text not null check (outcome in ('done', 'skipped', 'swapped')),
  to_member_id uuid, -- 'swapped': who the instance moved to
  due_on date not null,
  occurred_at timestamptz not null default now(),
  reverses_id uuid unique,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, duty_id) references public.duty (household_id, id),
  foreign key (household_id, member_id) references public.member (household_id, id),
  foreign key (household_id, to_member_id) references public.member (household_id, id),
  foreign key (household_id, reverses_id) references public.chore_event (household_id, id),
  check ((outcome = 'swapped') = (to_member_id is not null)),
  check (to_member_id is distinct from member_id)
);
create index on public.chore_event (duty_id);
create index on public.chore_event (member_id);
create index on public.chore_event (to_member_id);
create index on public.chore_event (household_id, due_on); -- every read is a date window

-- A reversal mirrors its target exactly, so it nets out — same shape as private.check_spend_reversal.
create function private.check_chore_reversal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is not null and not exists (
    select 1 from public.chore_event t
    where t.id = new.reverses_id and t.reverses_id is null
      and t.duty_id = new.duty_id and t.member_id = new.member_id
      and t.outcome = new.outcome and t.due_on = new.due_on
      and t.to_member_id is not distinct from new.to_member_id
  ) then
    raise exception 'a reversal must mirror an original chore event' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger chore_reversal before insert on public.chore_event
  for each row execute function private.check_chore_reversal();

-- ---------------------------------------------------------------- RLS

alter table public.duty enable row level security;
alter table public.chore_event enable row level security;

create policy duty_read on public.duty for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy duty_insert on public.duty for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy duty_update on public.duty for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

create policy chore_event_read on public.chore_event for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy chore_event_insert on public.chore_event for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

-- Insert-only is enforced by privileges: chore_event gets no UPDATE/DELETE grant, and duty gets
-- no DELETE — retire a duty with active = false, so its history keeps pointing at something.
revoke all on public.duty, public.chore_event from anon, authenticated;
grant select, insert on public.duty, public.chore_event to authenticated;
grant update (name, effort_points, every_days, weekdays, schedule, fixed_member_id, active)
  on public.duty to authenticated;
