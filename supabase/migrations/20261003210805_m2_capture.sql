-- M2 Capture: products (favourites + learned Zepto line names), spend_line → product,
-- add_spend stores the extraction and product ids, learn_alias.
-- Additive only: safe on a database that already holds spends.

create table public.product (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  aliases text[] not null default '{}', -- lower(trim) line names this product was matched to
  base_unit text not null default 'pc' check (base_unit in ('g', 'ml', 'pc')),
  track_stock boolean not null default true,
  min_qty numeric(12, 3) check (min_qty >= 0),
  favourite boolean not null default false,
  default_price_paise bigint check (default_price_paise > 0),
  category text,
  created_at timestamptz not null default now(),
  unique (household_id, id) -- target for same-household composite FKs
);
create unique index product_household_name_key on public.product (household_id, lower(name));

-- existing lines all have product_id null, which MATCH SIMPLE skips
alter table public.spend_line
  add constraint spend_line_product_fkey
  foreign key (household_id, product_id) references public.product (household_id, id);
create index on public.spend_line (product_id);

alter table public.product enable row level security;

create policy product_read on public.product for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy product_insert on public.product for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy product_update on public.product for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- Not a ledger, but no DELETE: spend lines point at products. Unfavourite instead.
revoke all on public.product from anon, authenticated;
grant select, insert on public.product to authenticated;
grant update (name, aliases, favourite, default_price_paise, category, track_stock, base_unit, min_qty)
  on public.product to authenticated;

-- Same signature as M1 (keeps its grants); now also stores extraction and product_id.
create or replace function public.add_spend(p_spend jsonb, p_lines jsonb default '[]')
returns void language sql security invoker set search_path = '' as $$
  insert into public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, extraction)
    select id, household_id, source, store_name, paid_by, paid_from, total_paise, coalesce(occurred_at, now()), extraction
    from jsonb_populate_record(null::public.spend, p_spend)
    on conflict (id) do nothing;
  insert into public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind)
    select l.id, (p_spend->>'household_id')::uuid, (p_spend->>'id')::uuid, l.product_id, l.name, coalesce(l.qty, 1), l.unit,
           l.line_total_paise, coalesce(l.kind, 'item')
    from jsonb_populate_recordset(null::public.spend_line, p_lines) l
    on conflict (id) do nothing;
$$;

-- Remember a Zepto line name for a product. RLS applies: a non-member's call updates nothing.
create function public.learn_alias(p_product_id uuid, p_alias text)
returns void language sql security invoker set search_path = '' as $$
  update public.product p set aliases = array_append(p.aliases, a.alias)
  from (select lower(btrim(p_alias)) as alias) a
  where p.id = p_product_id and a.alias <> '' and not (a.alias = any (p.aliases));
$$;

revoke all on function public.learn_alias(uuid, text) from public, anon;
grant execute on function public.learn_alias(uuid, text) to authenticated;
