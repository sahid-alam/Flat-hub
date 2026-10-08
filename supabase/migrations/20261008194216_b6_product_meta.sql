-- B6 Product metadata: a barcode column for B11, and the flat's starter basket.
--
-- No new columns for the editor: category, base_unit, track_stock and min_qty have existed since
-- 20261003210805_m2_capture.sql and are already in the UPDATE grant. Nothing in the app ever wrote
-- them (docs/AUDIT.md section 0), so B6 is their writer, not their schema.
-- Additive only.

-- ---------------------------------------------------------------- barcode

-- Scanned once, named once (docs/V3_BUILD.md, B11). EAN-13 is 13 digits; the range is wide enough
-- for EAN-8 and UPC-A too. Free text, because a mate may read it off the packet by eye.
alter table public.product add column barcode text check (length(btrim(barcode)) between 8 and 20);

-- One product per barcode within a flat, so a scan resolves to exactly one row. Partial, because
-- every product nobody has scanned yet keeps barcode null.
create unique index product_household_barcode_key on public.product (household_id, barcode)
  where barcode is not null;

grant update (barcode) on public.product to authenticated;

-- ---------------------------------------------------------------- the starter basket

-- vvvvvv  PASTE THE FLAT'S REAL BASKET IN THE VALUES BLOCK BELOW  vvvvvv
--
-- Every price here is a PLACEHOLDER: plausible Delhi-NCR figures, not this flat's. Replace the
-- rows with the real list. This migration has not shipped anywhere, so editing it in place is
-- correct for now; once it has been pushed, a correction is a NEW migration that re-creates this
-- function, never an edit to this file (CLAUDE.md).
--
--   name            the mate-facing name; unique per flat, case-insensitively
--   category        a chip from CATEGORIES in src/ui/product.tsx, or null for "Other".
--                   ui/putaway.tsx:33 reads it to guess Fridge / Freezer / Pantry.
--   base_unit       g | ml | pc — what stock_move.delta_qty counts. ml makes a litre read "1 L".
--   min_qty         in base_unit. Under this, the product turns up on the shopping list by
--                   itself. null means "never nag me about this one".
--   track_stock     false skips the put-away sheet entirely (buy it, don't count it).
--   favourite       shows in Quick Add.
--   default_price   PAISE (CLAUDE.md: integer paise, never rupees). 1105 rupees is 110500.
--
create function public.basket_template()
returns table (
  name text, category text, base_unit text, min_qty numeric(12, 3),
  track_stock boolean, favourite boolean, default_price_paise bigint
) language sql immutable set search_path = '' as $$
  values
    -- name              category       unit  min_qty  track  fav      paise
    ('Amul Taaza milk', 'Dairy',       'ml',  1000,   true,  true,   3000::bigint),
    ('Amul dahi',       'Dairy',       'g',    400,   true,  true,   3500),
    ('Paneer',          'Dairy',       'g',    200,   true,  false,  9500),
    ('Eggs',            'Eggs & Meat', 'pc',     6,   true,  true,   4800),
    ('Bread',           'Staples',     'pc',     1,   true,  true,   4500),
    ('Atta',            'Staples',     'g',   2000,   true,  true,  32000),
    ('Rice',            'Staples',     'g',   5000,   true,  true,  45000),
    ('Toor dal',        'Staples',     'g',   1000,   true,  true,  18000),
    ('Cooking oil',     'Staples',     'ml',  1000,   true,  true,  16000),
    ('Sugar',           'Staples',     'g',   1000,   true,  false,  5000),
    ('Onions',          'Vegetables',  'g',   1000,   true,  true,   5000),
    ('Tomatoes',        'Vegetables',  'g',    500,   true,  true,   4000),
    ('Potatoes',        'Vegetables',  'g',   1000,   true,  true,   3500),
    ('Chai patti',      'Drinks',      'g',    250,   true,  true,  27000),
    ('Water can',       'Drinks',      'pc',     2,   true,  true,   4000),
    ('Maggi',           'Snacks',      'pc',     4,   true,  false,  5600),
    -- not food, still the kitty's (AUDIT.md M8): the two every mate types from scratch today
    ('Gas cylinder',    'Household',   'pc',     1,   true,  true, 110500),
    ('Dish soap',       'Household',   'pc',     1,   true,  false,  6000);
$$;
-- ^^^^^^  PASTE THE FLAT'S REAL BASKET IN THE VALUES BLOCK ABOVE  ^^^^^^

-- Give a household the basket. Idempotent on (household_id, lower(name)), so a second call adds
-- nothing and never overwrites a product the flat has since edited — which is also why the ids are
-- server-side v4 rather than client v7: here the name is what makes the insert a no-op, not the id.
create function private.seed_basket(p_household_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.product
    (id, household_id, name, category, base_unit, min_qty, track_stock, favourite, default_price_paise)
  select gen_random_uuid(), p_household_id, b.name, b.category, b.base_unit, b.min_qty,
         b.track_stock, b.favourite, b.default_price_paise
  from public.basket_template() b
  where exists (select 1 from public.household h where h.id = p_household_id)
  on conflict do nothing;
$$;

revoke all on function public.basket_template() from public, anon, authenticated;
revoke all on function private.seed_basket(uuid) from public, anon, authenticated;

-- The flats that already exist, which today means the one real one. A product they have already
-- named is left exactly as it is.
--
-- ponytail: create_household deliberately does NOT call this. Seeding a brand-new flat would be
-- one more line, but it changes the fixture every pgTAP file builds on (six of them call
-- create_household) and there is exactly one flat. When a second flat is real, onboarding calls
-- private.seed_basket and those tests get updated in the same change.
select private.seed_basket(h.id) from public.household h;
