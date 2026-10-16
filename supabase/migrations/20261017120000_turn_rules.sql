-- How turns go round, and what a missed turn costs. Additive.
--
--   turns   'order'  — straight down the duty's list, one turn each, every due day. A no-show never
--                      blocks the rota: the next mate is up the next due day regardless.
--           'points' — the original pick: whoever is furthest behind on effort points goes next.
--   on_miss (order only) what a missed turn costs the mate who missed it:
--           'makeup' — they owe one extra turn, taken straight after their NEXT regular turn;
--           'redo'   — they take the very next due day again;
--           'none'   — nothing beyond the miss itself (which, as always, earns no credit).
--
-- WHY A HISTORY TABLE. Who owned a past day is computed, never stored (CLAUDE.md: a miss is never
-- recorded). So the rule that computed it must not change under it: if the order lived only on
-- `duty`, reordering the list would re-decide who owned last Tuesday, and move or wipe the make-up
-- turns owed for it — anyone could clear their own debt by dragging a name. `duty_rule` keeps every
-- version with the day it took effect, and src/domain/duties.ts replays them in order.
--
-- It is insert-only and clients cannot insert into it at all: the only writer is the trigger below,
-- which copies the duty's own columns, so a rule row can never say anything the duty did not.

alter table public.duty
  add column turns text not null default 'order' check (turns in ('order', 'points')),
  add column on_miss text not null default 'makeup' check (on_miss in ('makeup', 'redo', 'none'));

comment on column public.duty.turns is
  'order = down the list, one each, every due day; points = furthest behind on effort points goes next.';
comment on column public.duty.on_miss is
  'Order only. makeup = one extra turn after the misser''s next regular turn; redo = next due day again; none = nothing more.';

grant update (turns, on_miss) on public.duty to authenticated;

create table public.duty_rule (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id),
  duty_id uuid not null,
  starts_on date not null, -- an IST date: the first day this rule decides
  turns text not null check (turns in ('order', 'points')),
  on_miss text not null check (on_miss in ('makeup', 'redo', 'none')),
  -- The order, explicitly. null only for a 'points' rule (where null means "the whole flat"); an
  -- order rule with null falls back to member id order in the domain, but nothing writes one.
  roster uuid[],
  -- Everything else the replay reads about a day, so no later edit can re-decide one: which days were
  -- due, how many at once, and whether the duty had turns of its own at all (not fixed, not a follower).
  every_days int,
  weekdays int[],
  group_size int not null,
  schedule text not null,
  fixed_member_id uuid,
  follows_id uuid,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, duty_id) references public.duty (household_id, id)
);
create index on public.duty_rule (duty_id, starts_on);

alter table public.duty_rule enable row level security;
create policy duty_rule_read on public.duty_rule for select to authenticated
  using (household_id in (select private.my_household_ids()));
revoke all on public.duty_rule from anon, authenticated;
grant select on public.duty_rule to authenticated;

-- IST, because the flat lives in IST and every due date in the app is an IST date.
create function private.ist_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- A new duty's rule starts today: it has no turns yet to disturb. An EDIT starts tomorrow: today's
-- turn is already somebody's, may be half done, and must not change hands because the list moved.
create function private.record_duty_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (new.roster, new.turns, new.on_miss, new.every_days, new.weekdays, new.group_size, new.schedule,
          new.fixed_member_id, new.follows_id)
         is not distinct from
         (old.roster, old.turns, old.on_miss, old.every_days, old.weekdays, old.group_size, old.schedule,
          old.fixed_member_id, old.follows_id) then
    return new;
  end if;
  -- An order rule always carries its list. A duty can reach order mode with no roster (one that was
  -- brought along by another, which clears it, then unlinked), and "everyone" must not mean a
  -- different order to each reader: snapshot it the way the app shows it, by display name.
  insert into public.duty_rule (household_id, duty_id, starts_on, turns, on_miss, roster,
                                every_days, weekdays, group_size, schedule, fixed_member_id, follows_id)
  values (new.household_id, new.id,
          case when tg_op = 'INSERT' then private.ist_today() else private.ist_today() + 1 end,
          new.turns, new.on_miss,
          case when new.roster is null and new.turns = 'order'
               then (select array_agg(m.id order by m.display_name, m.id) from public.member m
                     where m.household_id = new.household_id and m.left_on is null)
               else new.roster end,
          new.every_days, new.weekdays, new.group_size, new.schedule, new.fixed_member_id, new.follows_id);
  return new;
end $$;
revoke all on function private.record_duty_rule(), private.ist_today() from public;

create trigger duty_rule_record after insert or update of
    roster, turns, on_miss, every_days, weekdays, group_size, schedule, fixed_member_id, follows_id on public.duty
  for each row execute function private.record_duty_rule();

-- Every duty that exists today gets its first rule, starting TOMORROW: today's turns stay exactly as
-- the old pick made them, and from tomorrow the list starts at the top. Misses before that were made
-- under the old rule and owe nothing — a clean start. A duty whose roster was null ("everyone") gets
-- its list snapshotted in the order the app shows it (display name), so every client agrees on who
-- is first.
insert into public.duty_rule (household_id, duty_id, starts_on, turns, on_miss, roster,
                              every_days, weekdays, group_size, schedule, fixed_member_id, follows_id)
select d.household_id, d.id, private.ist_today() + 1, d.turns, d.on_miss,
       coalesce(d.roster, (select array_agg(m.id order by m.display_name, m.id)
                           from public.member m
                           where m.household_id = d.household_id and m.left_on is null)),
       d.every_days, d.weekdays, d.group_size, d.schedule, d.fixed_member_id, d.follows_id
from public.duty d;

-- ---------------------------------------------------------------- the past stays the past
-- A missed turn is computed from what was KNOWN by the end of its day, so nothing added later can
-- cancel it: not an absence recorded after the fact, not a Done ticked the next morning. That needs
-- a creation time the client cannot choose. Both tables had a table-wide insert grant, so a client
-- could send any created_at it liked; the server now stamps it, the way set_chore_points stamps the
-- price. (Recording a past absence still works for the kitty — it just cannot rewrite a duty day.)
create function private.stamp_created_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
revoke all on function private.stamp_created_at() from public;
create trigger absence_stamp before insert on public.member_absence
  for each row execute function private.stamp_created_at();
create trigger chore_event_stamp before insert on public.chore_event
  for each row execute function private.stamp_created_at();

-- An absence is recorded by the mate who is away. Until now any mate could record one for any other —
-- which also moves kitty shares (the 3-day rule) and passes a mate over for duty turns.
drop policy absence_insert on public.member_absence;
create policy absence_insert on public.member_absence for insert to authenticated
  with check (
    household_id in (select private.my_household_ids())
    and member_id in (
      select id from public.member where user_id = (select auth.uid()) and household_id = member_absence.household_id)
  );

-- And it can be taken back only before it starts, or on the day it was added (a mis-tap). Once it has
-- started it decided duty days, so removing it would re-decide them. A closed month already refused.
drop policy absence_delete_own on public.member_absence;
create policy absence_delete_own on public.member_absence for delete to authenticated
  using (
    member_id in (select id from public.member where user_id = (select auth.uid()))
    and (from_date > (now() at time zone 'Asia/Kolkata')::date
         or (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date)
  );
