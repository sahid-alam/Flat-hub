-- B1 Home: today's meals, and the duty flag that says who writes them.
-- Additive only: one new table, one new column with a default.
--
-- meal_plan is NOT a ledger. It is a note to the cook — "the last one to write wins", in the
-- owner's words — so UPDATE is granted and an upsert on (household_id, date, meal) is the write.
-- Nothing in it moves money or earns points, so there is nothing a reversing row could correct.
-- Compare pool_entry / stock_move / chore_event, which are insert-only for exactly that reason.

alter table public.duty add column plans_meals boolean not null default false;
comment on column public.duty.plans_meals is
  'Whoever holds this duty today tells the cook what to make. Home reads the flag, never the name '
  '"dishes" — the flat can rename or move the duty without the meals card following the string.';

create table public.meal_plan (
  id uuid primary key, -- client-generated UUIDv7, so a retried first write is idempotent
  household_id uuid not null references public.household (id),
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner')),
  text text not null check (length(btrim(text)) between 1 and 200),
  by uuid not null, -- who wrote it last
  written_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, date, meal), -- the upsert target: one line per meal per day
  foreign key (household_id, by) references public.member (household_id, id)
);
create index on public.meal_plan (household_id, date);

-- ---------------------------------------------------------------- RLS

alter table public.meal_plan enable row level security;

-- Any member of the household can read and write the day's plan. Restricting the write to whoever
-- holds the plans_meals duty today is deliberately NOT enforced here: whose turn it is is computed
-- in src/domain/duties.ts (pure TS, deterministic), not in SQL, so the database cannot check it
-- without reimplementing the assignment engine. The UI shows the fields to the planner only; a mate
-- who writes anyway has written a note to the cook, which is the worst that can happen.
create policy meal_plan_read on public.meal_plan for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy meal_plan_insert on public.meal_plan for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy meal_plan_update on public.meal_plan for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy meal_plan_delete on public.meal_plan for delete to authenticated
  using (household_id in (select private.my_household_ids()));

revoke all on public.meal_plan from anon, authenticated;
grant select, insert, delete on public.meal_plan to authenticated;
grant update (text, by, written_at) on public.meal_plan to authenticated;
-- No update on date, meal or household_id: a line is rewritten in place, never moved to another day.
