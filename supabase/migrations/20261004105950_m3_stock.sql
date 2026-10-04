-- M3 Stock & fridge: unit conversions, lots, the insert-only stock_move ledger, the shopping list,
-- and put_away (lots + their opening 'purchase' move in one transaction).
-- Additive only: nothing here touches household, member, spend, spend_line rows or pool_entry.

-- A composite FK target, so a lot / shopping_item can't point at another flat's line.
-- id is already the primary key, so the pair is trivially unique on existing data.
alter table public.spend_line add constraint spend_line_household_id_id_key unique (household_id, id);

-- ---------------------------------------------------------------- tables

-- '1 packet' = 400 g. The base unit itself needs no row.
create table public.product_uom (
  household_id uuid not null,
  product_id uuid not null,
  unit text not null check (length(btrim(unit)) between 1 and 20),
  factor_to_base numeric(12, 4) not null check (factor_to_base > 0),
  created_at timestamptz not null default now(),
  primary key (product_id, unit),
  foreign key (household_id, product_id) references public.product (household_id, id)
);
create index on public.product_uom (household_id);

-- One purchased batch of a product, used FEFO.
create table public.lot (
  id uuid primary key,
  household_id uuid not null,
  product_id uuid not null,
  spend_line_id uuid, -- null for a lot entered by hand
  location text not null check (location in ('fridge', 'freezer', 'pantry')),
  expiry_date date,
  opened boolean not null default false,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (household_id, id), -- target for stock_move's composite FK
  foreign key (household_id, product_id) references public.product (household_id, id),
  foreign key (household_id, spend_line_id) references public.spend_line (household_id, id)
);
create index on public.lot (product_id);
create index on public.lot (spend_line_id);

-- INSERT-ONLY ledger, like the kitty's. Correct a mistake with a compensating move.
create table public.stock_move (
  id uuid primary key,
  household_id uuid not null,
  lot_id uuid not null,
  delta_qty numeric(12, 3) not null check (delta_qty <> 0), -- in the product's base unit
  reason text not null check (reason in ('purchase', 'consume', 'discard', 'adjust')),
  member_id uuid not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (household_id, lot_id) references public.lot (household_id, id),
  foreign key (household_id, member_id) references public.member (household_id, id)
);
create index on public.stock_move (lot_id);
create index on public.stock_move (member_id);

-- Manual rows; the low-stock half of the list is derived from lots + min_qty.
create table public.shopping_item (
  id uuid primary key,
  household_id uuid not null,
  product_id uuid, -- null for a free-text ask
  name text not null check (length(btrim(name)) between 1 and 120),
  added_by uuid not null,
  done_by_spend_line_id uuid, -- the line that bought it
  done_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (household_id, product_id) references public.product (household_id, id),
  foreign key (household_id, added_by) references public.member (household_id, id),
  foreign key (household_id, done_by_spend_line_id) references public.spend_line (household_id, id)
);
create index on public.shopping_item (product_id);
create index on public.shopping_item (added_by);
create index on public.shopping_item (done_by_spend_line_id);
create index on public.shopping_item (household_id, done_at);

-- ---------------------------------------------------------------- RLS

alter table public.product_uom enable row level security;
alter table public.lot enable row level security;
alter table public.stock_move enable row level security;
alter table public.shopping_item enable row level security;

create policy product_uom_read on public.product_uom for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy product_uom_insert on public.product_uom for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

create policy lot_read on public.lot for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy lot_insert on public.lot for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy lot_update on public.lot for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

create policy stock_move_read on public.stock_move for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy stock_move_insert on public.stock_move for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

create policy shopping_item_read on public.shopping_item for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy shopping_item_insert on public.shopping_item for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy shopping_item_update on public.shopping_item for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy shopping_item_delete on public.shopping_item for delete to authenticated
  using (household_id in (select private.my_household_ids()));

-- Insert-only is enforced by privileges, not just by convention: stock_move gets no
-- UPDATE/DELETE grant at all, and the editable columns elsewhere are listed one by one.
revoke all on public.product_uom, public.lot, public.stock_move, public.shopping_item
  from anon, authenticated;
grant select, insert on public.product_uom, public.lot, public.stock_move, public.shopping_item
  to authenticated;
grant update (opened, location, expiry_date) on public.lot to authenticated;
grant update (name, product_id, done_by_spend_line_id, done_at) on public.shopping_item to authenticated;
grant delete on public.shopping_item to authenticated;

-- ---------------------------------------------------------------- RPC

-- Put away a shop: each lot plus its opening 'purchase' move, in one transaction.
-- RLS applies (security invoker); idempotent on ids, so a retry is a no-op.
-- Each item: {id, household_id, product_id, spend_line_id, location, expiry_date, qty}.
create function public.put_away(p_lots jsonb)
returns void language sql security invoker set search_path = '' as $$
  with items as (
    select x.id, x.household_id, x.product_id, x.spend_line_id, x.location, x.expiry_date,
           (e->>'qty')::numeric(12, 3) as qty
    from jsonb_array_elements(p_lots) e
    -- populate_record would turn absent keys into explicit NULLs and defeat the defaults,
    -- so only the columns below are ever written; opened/received_at keep theirs.
    cross join lateral jsonb_populate_record(null::public.lot, e) x
  ), ignored as (
    insert into public.lot (id, household_id, product_id, spend_line_id, location, expiry_date)
      select id, household_id, product_id, spend_line_id, location, expiry_date from items
      on conflict (id) do nothing
  )
  -- ponytail: the opening move reuses the lot id, so `on conflict (id) do nothing` makes a retry
  -- a no-op without needing the client to mint a second id.
  insert into public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id)
    select i.id, i.household_id, i.id, i.qty, 'purchase',
           (select m.id from public.member m
            where m.household_id = i.household_id and m.user_id = (select auth.uid()))
    -- the lot CTE always runs, and FK checks fire after the whole statement
    from items i where i.qty > 0
    on conflict (id) do nothing;
$$;

revoke all on function public.put_away(jsonb) from public, anon;
grant execute on function public.put_away(jsonb) to authenticated;
