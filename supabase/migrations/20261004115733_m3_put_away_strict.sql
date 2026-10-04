-- put_away: a lot with no opening move is invisible everywhere (both /stock and /fridge filter on
-- on-hand > 0), so a qty that rounds to zero must fail loudly instead of losing the line.
-- The only change is dropping `where i.qty > 0`: stock_move's `delta_qty <> 0` check then rejects
-- the row and the whole call rolls back. `create or replace` keeps the existing grants.
create or replace function public.put_away(p_lots jsonb)
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
    from items i
    on conflict (id) do nothing;
$$;
