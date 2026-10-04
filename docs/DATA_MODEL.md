# FlatHub data model

Postgres on Supabase. Every table has `id uuid` (v7, generated on the client), `household_id`, and `created_at` — the one exception is `product_uom`, keyed by `(product_id, unit)`.
RLS: a row is visible and writable only to members of its household.
**Ledger tables are insert-only.** A mistake is corrected by inserting a reversing row (`reverses_id`), never by an UPDATE or DELETE.

## Household & members

```
household     (id, name, currency 'INR', pool_holder_id → member,   -- Ansh Rastogi
               monthly_topup_paise default 200000,
               invite_code unique)                              -- the invite link carries this
member        (id, household_id, user_id → auth.users, display_name, upi_vpa,
               joined_on, left_on null)
member_absence(id, household_id, member_id, from_date, to_date, created_at)  -- duties + kitty share weights
```

## Money: kitty

```
spend      (id, household_id, source 'zepto'|'local'|'other', store_name,
            paid_by → member, paid_from 'pool'|'personal',
            total_paise bigint, occurred_at, receipt_path null, extraction jsonb null,
            reverses_id null)
spend_line (id, household_id, spend_id, product_id null → product, name, qty numeric(12,3), unit,
            line_total_paise bigint, kind 'item'|'fee'|'discount')   -- discount is negative
pool_entry (id, household_id, kind 'contribution'|'reimbursement',
            member_id, amount_paise bigint, occurred_at, note,
            spend_id null,                                      -- reimbursement → the own-pocket spend it repays
            reverses_id null)
```

- **Reversal sign:** an original row has a positive amount; its reversal has the **negated** amount, the same kind/member/payer, and `reverses_id` set (one reversal per row). A trigger rejects a reversal that doesn't mirror its target exactly, so every Σ below is a plain sum.
- Creating a household, joining with an invite code, handing over the kitty, and saving a spend with its lines go through RPCs (`create_household`, `join_household`, `set_pool_holder`, `add_spend`). `add_spend` also stores `spend.extraction` (the raw LLM output behind a Zepto import) and each line's `product_id`. A deferred constraint trigger enforces invariant 1. Ledgers have no UPDATE/DELETE grants.
- Cross-household references are composite FKs on `(household_id, id)`, so a row can't point at another flat's member or spend.

Derived values (views or functions, never stored):

- `pool_cash` = Σ contribution − Σ spend[paid_from=pool] − Σ reimbursement
- `credit(m)` = Σ contribution(m) + Σ spend[paid_from=personal, paid_by=m] − Σ reimbursement(m)
- `share(m)` = Σ over months of `allocate(Σ spend in month, w)`. This is **largest remainder** in paise, with ties broken by member id, so each month's shares sum exactly to that month's spend.
  - `w(m)` = membership days in the month (`joined_on…left_on`) − days covered by qualifying absences.
  - A qualifying absence is a run of **≥ 3 consecutive days**, judged after merging overlapping or adjacent `member_absence` rows. A run that spans two months still qualifies.
  - If `Σw = 0` while there was spend, fall back to `w = membership days`.
  - The current month is provisional. After month close it is frozen.
  - A reversal is allocated in the **original spend's month**, so it nets to zero for every mate even after that month has closed.
- `suggested_topup(m)` = max(0, `household.monthly_topup_paise` − position(m))
- `position(m)` = credit(m) − share(m), where positive means the kitty owes m and negative means m should top up
- `to_reimburse(m)` = Σ spend[paid_from=personal, paid_by=m] − Σ reimbursement(m). This is Ansh's list.

### Invariants (each one has a test)

1. `Σ spend_line.line_total_paise = spend.total_paise`, for every spend.
2. `Σ share(m) = Σ spend.total_paise`. There is no lost or extra paisa.
3. **`Σ position(m) = pool_cash`.** This is the kitty identity. If it breaks, the books are wrong.
   *Proof sketch:* Σcredit − Σshare = (Σcontrib + Σpersonal − Σreimb) − (Σpool + Σpersonal) = pool_cash.
4. A reversal nets its target to zero, and the target row is untouched.

## Stock & fridge

```
product       (id, household_id, name unique per household (case-insensitive),
               aliases text[],                                  -- learned Zepto line names, lower(trim)
               base_unit 'g'|'ml'|'pc' default 'pc', track_stock bool default true, min_qty numeric(12,3) null,
               favourite bool, default_price_paise bigint null, category null)   -- M2
product_uom   (household_id, product_id, unit, factor_to_base numeric(12,4) > 0,
               primary key (product_id, unit))                   -- '1 packet' = 400 g
lot           (id, household_id, product_id, spend_line_id null,
               location 'fridge'|'freezer'|'pantry', expiry_date null,
               opened bool default false, received_at,
               unique (household_id, id))                        -- stock_move's FK target
stock_move    (id, household_id, lot_id, delta_qty numeric(12,3) <> 0,   -- in base unit
               reason 'purchase'|'consume'|'discard'|'adjust', member_id, occurred_at)
shopping_item (id, household_id, product_id null, name, added_by,
               done_by_spend_line_id null, done_at null)
```

- `product` is household data, not a ledger: members can insert and update it, nobody can delete it (spend lines point at it; unfavourite instead).
- `learn_alias(product_id, alias)` appends `lower(trim(alias))` to `aliases` once; a repeat, a blank alias or a non-member's call is a no-op. The import screen calls it when a mate confirms a Zepto line → product match.
- **`stock_move` is insert-only**, like the kitty ledgers: there is no UPDATE or DELETE grant, so a mistake is corrected with a compensating move (a `consume`/`adjust` row with the opposite sign), never by editing one.
- `lot` is editable in three columns only (`opened`, `location`, `expiry_date`); `shopping_item` in four (`name`, `product_id`, `done_by_spend_line_id`, `done_at`) and is the one stock table that can be deleted. `product_uom` is insert-only.
- `put_away(p_lots jsonb)` inserts lots and their opening `'purchase'` `stock_move` in one transaction. Each item is `{id, household_id, product_id, spend_line_id, location, expiry_date, qty}`; the move's id *is* the lot id, so it is idempotent on retry, and `member_id` is whoever called it. The capture flow calls it after a spend whose lines matched `track_stock` products; "Skip" still puts them away as `pantry` with no expiry, so nothing is lost. `spend_line` carries a `unique (household_id, id)` so a lot can't reference another flat's line.
- On-hand quantity for a lot is `Σ stock_move.delta_qty`, and a lot is empty when that sum is ≤ 0.
- Products with `track_stock = false` (same-day dahi, milk, bread) create a spend line but no lot.
- **FEFO order:** `ORDER BY opened DESC, expiry_date ASC NULLS LAST, received_at ASC`. Warn when an unopened lot expires before an opened one.
- Shopping list = manual `shopping_item` rows, plus products where `track_stock` is set and on-hand is below `min_qty`.

## Duties

```
duty        (id, household_id, name, effort_points int, every_days int | weekdays int[],
             schedule 'rolling'|'fixed', active bool)
chore_event (id, duty_id, member_id, outcome 'done'|'skipped'|'swapped',
             to_member_id null, due_on, occurred_at, reverses_id null)
```

- **Assignment:** among members who are active and not absent on `due_on`, pick the one with the largest `fair_share_points − done_points`. Break ties by whoever did this duty least recently, then by `member.id`. There is no randomness, so the next turn is always predictable.
- `done_points` counts only `outcome = 'done'`. **A skip earns no credit** and has a test.
- A swap moves one instance to `to_member_id`. Credit goes to whoever actually does it, and the original assignee keeps their place in the rotation.
