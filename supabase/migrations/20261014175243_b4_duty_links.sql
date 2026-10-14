-- B4 Duties, part two: areas, and duties that come with another duty. Additive only.
--
-- Two features that look alike and must never be merged, because merging them is the loophole:
--
--   AREA (duty_area, duty.area_id) is a LABEL. Kitchen, Bathroom. It groups duties for READING —
--   the Duties tab, the morning summary — and changes nothing about who does what. If an area
--   decided assignment, tagging six duties "Kitchen" would drop all six on one mate in one day.
--
--   COMES WITH (duty.follows_id) is an ASSIGNMENT LINK. "Meal planning comes with Dishes": on a day
--   both are due, Meal planning lands on whoever holds Dishes that day. It changes nothing about
--   who earns what — the two stay separate duties with separate ticks and separate points, so
--   ticking Dishes never banks the points for telling the cook nothing.
--
-- Who holds a duty is COMPUTED in src/domain/duties.ts (rota/assignees), never stored, so the link
-- resolves there. This migration only guarantees the link's SHAPE, which is the part SQL can see.
--
-- `plans_meals` is untouched and stays a ROLE: "whoever holds this duty tells the cook". It and
-- follows_id compose — make a "Meal planning" duty with plans_meals set, have it come with Dishes,
-- and the existing meals card asks the dishes-holder, through the link, with no second mechanism.

-- ---------------------------------------------------------------- duty_area
-- Household data, not a ledger: members add, rename, reorder and remove areas. Removing one just
-- un-labels its duties (on delete set null below); a label is not history.
create table public.duty_area (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  name text not null check (length(btrim(name)) between 1 and 30),
  position int not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now(),
  unique (household_id, id) -- target for duty's composite FK
);
-- "Kitchen" and "kitchen " are the same area; a flat of six should not end up with both.
create unique index duty_area_name on public.duty_area (household_id, lower(btrim(name)));

-- ---------------------------------------------------------------- duty: area + comes with
alter table public.duty
  add column area_id uuid,
  add column follows_id uuid;

alter table public.duty
  -- Composite FKs, so neither can name another flat's area or duty. `set null (area_id)` clears only
  -- the label; a plain SET NULL on a composite key would null household_id too and fail NOT NULL.
  add constraint duty_area_fk foreign key (household_id, area_id)
    references public.duty_area (household_id, id) on delete set null (area_id),
  add constraint duty_follows_fk foreign key (household_id, follows_id)
    references public.duty (household_id, id),
  -- never itself
  add constraint duty_follows_not_self check (follows_id <> id),
  -- A fixed duty is "always Ansh"; "whoever has dishes" would claim it too. A follower is rolling.
  add constraint duty_follows_rolling check (follows_id is null or schedule = 'rolling'),
  -- A follower's crew is decided by its leader, so it keeps no roster of its own: a setting that
  -- silently does nothing is a hidden setting, and hidden settings are how two mates read the same
  -- screen differently.
  add constraint duty_follows_no_roster check (follows_id is null or roster is null);

comment on column public.duty.area_id is
  'A label for reading (Kitchen, Bathroom). Never affects assignment. null = no area.';
comment on column public.duty.follows_id is
  'Comes with: on a day both are due, this duty goes to whoever holds follows_id that day. One '
  'level only — a duty that others come with cannot itself come with another, so no chain or loop '
  'can form. Chains lose nothing: A→B→C resolves exactly like A→C and B→C.';

create index on public.duty (follows_id);
create index on public.duty (area_id);

-- One level deep, enforced in both directions on every change. A CHECK cannot do this: it needs to
-- look at other rows. Without direction (b), "X comes with A" followed by "A comes with B" builds
-- X→A→B one row at a time, each row passing on its own.
create function private.check_duty_follows() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.follows_id is null then
    return new; -- leaving a link, or never having one, cannot build a chain
  end if;
  -- Serialise link changes per household. Two saves in flight at once — "A comes with B" and
  -- "B comes with C" — would each pass the checks below against the other's uncommitted row and
  -- commit a chain between them. Under the lock the second save sees the first.
  perform pg_advisory_xact_lock(hashtextextended('duty_follows:' || new.household_id::text, 0));
  -- (a) the duty you come with must not itself come with another
  if exists (select 1 from public.duty t where t.id = new.follows_id and t.follows_id is not null) then
    raise exception 'a duty can only come with one that does not itself come with another'
      using errcode = '23514';
  end if;
  -- (b) a duty that others come with cannot itself come with another
  if exists (select 1 from public.duty f where f.follows_id = new.id) then
    raise exception 'other duties come with this one, so it cannot come with another'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger duty_follows before insert or update of follows_id on public.duty
  for each row execute function private.check_duty_follows();

-- ---------------------------------------------------------------- set the followers in one go
-- Edit duty sets "brings along" from the LEADER's side, as a list ("Dishes also brings: Meal
-- planning, Wipe the counter"), but the link lives on each follower. One call, one transaction, so
-- the list never lands half-applied. Security invoker: the caller's own RLS and column grants
-- apply, exactly as if they had sent the updates themselves.
create function public.set_duty_followers(p_duty uuid, p_followers uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare
  h uuid;
  wanted uuid[] := coalesce(p_followers, '{}');
begin
  select household_id into h from public.duty where id = p_duty; -- RLS: only your own flat's
  if h is null then
    raise exception 'no such duty' using errcode = 'P0002';
  end if;
  if p_duty = any (wanted) then
    raise exception 'a duty cannot come with itself' using errcode = '23514';
  end if;
  -- Every id named must be a duty in the same flat. Updates that silently match nothing are how a
  -- save "succeeds" while doing half of what was asked.
  if exists (select unnest(wanted) except select id from public.duty where household_id = h) then
    raise exception 'one of those duties is not in this flat' using errcode = '23503';
  end if;
  -- Unlink first, so a duty leaving this list frees its place before anything new is checked.
  update public.duty set follows_id = null
    where household_id = h and follows_id = p_duty and not (id = any (wanted));
  -- A follower's roster is cleared with the link (duty_follows_no_roster). A fixed duty is NOT
  -- quietly turned rolling: duty_follows_rolling rejects it loudly instead.
  update public.duty set follows_id = p_duty, roster = null
    where household_id = h and id = any (wanted) and follows_id is distinct from p_duty;
end $$;

-- ---------------------------------------------------------------- RLS + grants
alter table public.duty_area enable row level security;
create policy duty_area_read on public.duty_area for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy duty_area_insert on public.duty_area for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy duty_area_update on public.duty_area for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy duty_area_delete on public.duty_area for delete to authenticated
  using (household_id in (select private.my_household_ids()));

revoke all on public.duty_area from anon, authenticated;
grant select, insert, delete on public.duty_area to authenticated;
grant update (name, position) on public.duty_area to authenticated;
-- duty's update grant is column-level: without these two, every save that sets an area or a link
-- fails with "permission denied for column", which reads like a bug in the screen.
grant update (area_id, follows_id) on public.duty to authenticated;

revoke all on function public.set_duty_followers(uuid, uuid[]) from public, anon;
grant execute on function public.set_duty_followers(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------- default areas
-- Four to start, renameable and removable. Reference data seeded by the server, so the ids come
-- from the database rather than a client (CLAUDE.md's client-UUIDv7 rule is about retried writes).
create function private.seed_duty_areas(p_household uuid) returns void
language sql set search_path = '' as $$
  insert into public.duty_area (id, household_id, name, position)
  select gen_random_uuid(), p_household, a.name, a.position
  from (values ('Kitchen', 0), ('Bathroom', 1), ('Common areas', 2), ('Outside', 3)) as a(name, position)
  on conflict (household_id, lower(btrim(name))) do nothing;
$$;

-- Neither helper is for clients. `private` is not exposed over the API, but a new function is
-- executable by PUBLIC by default, so it is shut here the way my_household_ids() is.
revoke all on function private.seed_duty_areas(uuid), private.check_duty_follows() from public;

-- every flat that already exists
select private.seed_duty_areas(id) from public.household;

-- and every flat made from now on. Same body as 20261002122729, plus the one seeding line.
create or replace function public.create_household(p_household_id uuid, p_member_id uuid, p_name text, p_display_name text)
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
  perform private.seed_duty_areas(p_household_id);
  return p_household_id;
end $$;
