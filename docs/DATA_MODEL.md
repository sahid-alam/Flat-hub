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
spend      (id, household_id, source 'zepto'|'blinkit'|'instamart'|'bigbasket'|'jiomart'|'local'|'other', store_name,
            paid_by → member, paid_from 'pool'|'personal',
            total_paise bigint, occurred_at, receipt_path null, extraction jsonb null,
            reverses_id null)
spend_line (id, household_id, spend_id, product_id null → product, name, qty numeric(12,3), unit,
            line_total_paise bigint, kind 'item'|'fee'|'discount')   -- discount is negative
pool_entry (id, household_id, kind 'contribution'|'reimbursement',
            member_id, amount_paise bigint, occurred_at, note,
            spend_id null,                                      -- reimbursement → the own-pocket spend it repays
            reverses_id null)
month_close(id, household_id, month 'YYYY-MM', closed_at, closed_by → member,
            unique (household_id, month))                     -- M5: the month is frozen
```

- **Month close (M5):** `close_month(id, household_id, month)` is treasurer-only, refuses a month that is not strictly before the current IST month, and is idempotent (a second call is a no-op). `reopen_month(household_id, month)` deletes the row and is treasurer-only too. `month_close` has no UPDATE grant; INSERT and DELETE are restricted to `household.pool_holder_id` by policy, so a mate can't freeze a month behind the RPC's back.
- Once a month is closed, BEFORE triggers reject: a `member_absence` whose `from_date…to_date` touches it (including a run that starts in an open month), the DELETE of such an absence, and a `spend` or `pool_entry` whose `occurred_at` falls in it (IST, `Asia/Kolkata`, same boundary as `istDate()`). The error is `P0001` with the message `'July 2026 is closed'`.
- **The one way in is a reversal:** a row with `reverses_id` set always writes, because it is allocated in its target's month and nets to zero there. A reversal of a reversal stays impossible (the mirror trigger requires a target with `reverses_id null`).

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
duty        (id, household_id, name (1..60 chars), effort_points int 1..10 default 1,
             every_days int 1..90 | weekdays int[] ⊆ {0..6},    -- exactly one of the two
             schedule 'rolling'|'fixed' default 'rolling', fixed_member_id null → member,
             active bool default true, created_at,
             group_size int 1..3 default 1,                      -- how many do it TOGETHER
             plans_meals bool default false,                     -- also tells the cook
             roster uuid[] null,                                 -- who's in, in rota order
             area_id null → duty_area,                           -- a label; on delete set null
             follows_id null → duty,                             -- "comes with"; one level deep
             turns 'order'|'points' default 'order',             -- down the list, or furthest behind
             on_miss 'makeup'|'redo'|'none' default 'makeup',    -- what a missed turn costs (order only)
             unique (household_id, id))                          -- chore_event's FK target
duty_rule   (id, household_id, duty_id, starts_on date (IST),     -- insert-only; written ONLY by trigger
             turns, on_miss, roster uuid[] null, created_at)
duty_area   (id, household_id, name (1..30, unique per flat ignoring case and spaces),
             position int 0..99, created_at, unique (household_id, id))
chore_event (id, household_id, duty_id, member_id, outcome 'done'|'skipped'|'swapped',
             to_member_id null → member, due_on date, points int 1..10 (set by trigger),
             occurred_at, reverses_id unique null, created_at, unique (household_id, id))
duty_mark   (id, household_id, duty_id, due_on, member_id,       -- whose slot
             kind 'offer'|'vouch', by_member_id, created_at,
             unique (household_id, duty_id, due_on, member_id, kind, by_member_id))
duty_photo  (id, household_id, duty_id, due_on, member_id,       -- whose instance
             raised_by, path, note null, created_at)
```

- **There is no skip.** A duty past its due date that nobody ticked is **missed** — computed from the schedule in `missed()`, never recorded as an event, earning no credit exactly as a skip did not. Nothing is written to the ledger for something nobody did. `'skipped'` stays in `chore_event`'s CHECK because rows already in the ledger carry it; nothing writes it any more, and they are not migrated away.
- **Assignment** returns one **slot** per co-assignee (`assignees()`, not `assignee()`): among members who are on the roll, not absent on `due_on` and in the duty's `roster`, take `group_size` off the top of the largest `fair_share_points − done_points`. With no roster, ties break by whoever did this duty least recently then by `member.id`, as before. **With a roster, roster position replaces both** — if it merely followed them, `last_did` would encode the old cycle and reordering the roster would do nothing. There is no randomness, so the next turn is always predictable. It lives in `src/domain/duties.ts` (pure TS) — the database only stores the duties and what actually happened.
- **Two or three mates, one duty, the same day.** `group_size` is how many do it *together*, not alternating owners. `chore_event` does not change: each co-assignee ticks their OWN row and earns the points individually, so "only the assignee ticks" holds per person, missed is per person, offer/claim is per slot, and your partner is the natural voucher.
- A slot's identity is its **owner**, the mate the rota picked. The pick deliberately excludes that instance's own events, so ticking a duty never re-shuffles the pair that was on screen.
- `done_points` counts only `outcome = 'done'`, **once per slot** (keyed by `duty_id|due_on|member_id`, so a double submit from a second tab pays once but both halves of a pair pay), and prices each one from `chore_event.points`, not the duty's current `effort_points`. `private.set_chore_points` snapshots the price on insert — from the duty, or from the reversed row when `reverses_id` is set — exactly the way money ledgers snapshot paise. An append-only ledger is never re-priced, so editing a duty from 1 to 10 points cannot retroactively buy the editor out of the rota. The client never sets the column.
- `fair_share_points` is **prorated per day**: each due instance's points are split between the mates on the roll, in the flat *and* in the duty's roster that day, and **multiplied by `group_size`** (capped at the number available), because a pair duty hands out two lots of points every time it falls due. A mate who joined mid-month is not billed for the weeks before they arrived, an away mate is not billed for days they could not do the chore — which is what the "Away — no turns" badge promises — and nobody is billed for a duty they are not in. **A missed chore earns no credit** and has a test.
- `rota()` credits each slot it hands out provisionally, so three duties due the same day go to three different mates instead of all landing on whoever was furthest behind at dawn.
- **A swap is an offer, not a transfer.** The assignee offers their slot: a `duty_mark` with `kind = 'offer'`, which hands the duty to nobody and stays visible to all six. Another mate taps Take it, and *that* is the `'swapped'` chore_event — `member_id` the mate who offered, `to_member_id` the mate who took it. `private.check_chore_claimable` refuses a `'swapped'` row with no matching offer, so **nobody is ever given a duty without tapping to take it**. Unclaimed by the due date, the slot is missed like any other: an open offer protects nobody. **An offer can be taken back** while nobody has taken it: `withdraw_offer(duty, due_on)` (security definer) deletes the caller's own offer row and nothing else, and refuses once a live `'swapped'` event answers it. An offer is an intent with no points, not a ledger row, so withdrawing it leaves no trace; vouches and photos stay immutable. A withdrawal and a claim on the same slot take the same advisory lock (`private.slot_lock`), so the two cannot both win. A reversal is exempt, since it mirrors a row that was already legitimate.
- A claim **to a mate who is away** on `due_on` does not stick: the slot stays with its owner, so a chore can't be dumped on someone who physically cannot do it. Credit goes to whoever actually does it, and the mate who offered keeps their place in the rotation. A `check` makes `to_member_id` present exactly when `outcome = 'swapped'`, and never equal to `member_id`.
- A **vouch** is `duty_mark` with `kind = 'vouch'`: one mate confirming another's duty was done. It carries no points and never will. You offer only your own slot and never vouch for yourself — one check covers both: `(kind = 'offer') = (by_member_id = member_id)`.
- **Photo evidence** hangs off the **instance** (`duty_id`, `due_on`, `member_id`), not off a `chore_event`: a duty nobody did has no event to point at, and "didn't do it correctly" is a duty logged done but done badly. One table covers both. Anyone can add one, including the mate who did the job; there is no report, no flag and no red. Files live in the private `flathub` Storage bucket under `<household_id>/duty/<photo_id>.jpg`, the first path segment being what the `storage.objects` policies scope on, and are **compressed on upload** (~200 KB) because a blown free-tier quota takes the whole project read-only. **Immutable once submitted:** no UPDATE and no DELETE grant on `duty_mark` or `duty_photo` — swap the photo before you send it, nobody removes it after.
- **Photos are deleted after two months.** `private.purge_duty_photos(interval)` forgets the rows and returns their storage paths; the caller removes the files through Storage's own API, because whether deleting a `storage.objects` row drops the backing object is not something the migration can verify on hosted Supabase. The scheduled job that calls it is B9's.
- A duty has **exactly one cadence**: `(every_days is null) <> (weekdays is null)`. `fixed_member_id` matters only when `schedule = 'fixed'`, and a composite FK stops it naming another flat's mate. The Add/Edit form no longer asks for it — "always one mate" is a roster of one, which is one concept instead of two — but a duty saved as fixed before the rework keeps its setting and the engine still honours it.
- A `roster` is a plain `uuid[]`: no composite FK is possible into an array, so a stale id simply never matches a member and the engine ignores it, the same as a mate who left.
- **`chore_event` is insert-only**, like the kitty and stock ledgers: no UPDATE or DELETE grant. A mistake is corrected with a reversing row whose `reverses_id` points at the original, and `private.check_chore_reversal` (same shape as `check_spend_reversal`) rejects a reversal that doesn't mirror its target's `duty_id`, `member_id`, `outcome`, `due_on` and `to_member_id`. The target must itself have `reverses_id null`, so a reversal of a reversal is impossible.
- `duty` is household data, not a ledger: members may insert and update it in fourteen columns (`name`, `effort_points`, `every_days`, `weekdays`, `schedule`, `fixed_member_id`, `active`, `group_size`, `plans_meals`, `roster`, `area_id`, `follows_id`, `turns`, `on_miss`). Nobody can delete one — **retire a duty with `active = false`**, so its history keeps pointing at something.
- **Area and "comes with" are two features, never one** (`20261014175243_b4_duty_links.sql`). An **area** (`duty_area`, `duty.area_id`) is a LABEL — Kitchen, Bathroom — that groups duties on the Duties tab and the Manage list and decides nothing; if it decided assignment, tagging six duties "Kitchen" would drop all six on one mate in one day. A new flat gets four (`private.seed_duty_areas`, also called by `create_household`); members add, rename and remove them, and removing one only un-labels its duties. Composite FKs keep both columns inside the flat.
- **"Comes with"** (`duty.follows_id`) is an ASSIGNMENT LINK: on a day both are due, the follower goes to whoever holds the leader that day — after claims and absences, capped at the follower's own `group_size` — and its own instance events still win. **It binds who, never whether:** the two stay separate duties with separate ticks, separate points and separate misses, so ticking Dishes never banks Meal planning. On a day the leader is not due, or once it is retired, the follower takes its own rolling turn. One leader can bring any number along; a follower cannot itself be followed (`private.check_duty_follows`, under a per-flat advisory lock so two concurrent saves cannot build a chain between them), so no chain or loop can form, and a chain would add nothing (A→B→C resolves exactly as A→C, B→C). A follower is `rolling` and has no `roster` — its crew is its leader's. `set_duty_followers(p_duty, p_followers[])` sets a leader's whole list in one transaction (security invoker). It resolves in `rota()`/`assignees()`, which credit the follower's points to its holder before the next pick, and fair share bills the follower to the leader's crew on linked days. **`plans_meals` stays a role** and composes with the link: a "Meal planning" duty with `plans_meals` that comes with Dishes asks the dishes-holder, with no second mechanism.
- **Turn rules** (`20261017120000`). `turns = 'order'` goes straight down the duty's list, `group_size` at a time, every due day; a mate who is away is passed over for that turn and owes nothing for it. `'points'` is the original deficit pick above, where the list only breaks ties. Under order, `on_miss` decides what a missed turn costs its **holder** (whoever took an offer took the turn): `'makeup'` is one extra turn served on the instance straight after their *next* regular turn (one per regular turn, so a repeat no-show costs the flat only their own days while the debt grows), `'redo'` puts them on the very next due day, `'none'` moves on. A miss still earns no credit under every rule.
- **Why `duty_rule` exists.** Who owned a past day is computed, never stored, so the rule that computed it must not change under it. Reordering a list stored only on `duty` would re-decide who owned last Tuesday and move or wipe the make-up turns owed for it — a mate could clear their own debt by dragging a name. `duty_rule` keeps every version with the IST day it took effect; `replay()` in `src/domain/duties.ts` walks them in order. A new rule starts at the top of its list and debts carry across it. What a miss costs is the rule **on the day of the miss**, so switching to `'none'` never forgives a turn already owed. The table has no insert, update or delete grant: `private.record_duty_rule()` (security definer, after insert / update of roster, turns, on_miss) is its only writer, and it copies the duty's own columns. A new duty's rule starts **today**; an edit's starts **tomorrow**, so a turn already under way never changes hands. Order mode saves the list explicitly; the backfill snapshotted "everyone" in display-name order so every client agrees who is first. Before a duty's first rule the points pick decides, which is what the live history was shown under — so the misses from before the switch owe nothing. Followers and fixed duties never take ordered turns.
- **The past stays the past.** A rule row also freezes the day's shape — cadence, `group_size`, `schedule`, `fixed_member_id`, `follows_id` — so editing how often a duty runs, or linking it to another, re-decides no day already past and hides no make-up turn. A day is judged on what was known by its end: an absence counts for a duty day only if it was recorded by then, and only a Done recorded by then keeps the turn from being a miss (a late Done still earns its points). That relies on `created_at` the client cannot choose, so `private.stamp_created_at()` sets it on every `member_absence` and `chore_event` insert. An absence is now recorded only by the mate who is away (it moves kitty shares and duty turns), and can be removed only before it starts or on the day it was added.
- Make-up turns appear on the Duties tab as an ordinary turn marked "make-up". The mate who has them gets a private line on Home; the flat's morning summary says only "<duty> has N make-up turns waiting" once a duty has two or more — the duty and the count, never the mate.
- **The actor is the session.** `duty_mark.by_member_id` and `duty_photo.raised_by` must be the caller's own member row in that flat (RLS, `20261015090000`), the same rule `check_chore_claimable` holds for `chore_event`. Before it, any mate could post an offer of another mate's turn, a vouch or a photo in that mate's name.
- **`create_household` cannot join an existing flat.** It used to skip the household insert on a known id and still add the caller as a member. Now, if the flat already exists, the call succeeds only as a retry by someone who is already its member; anything else is refused with 42501. The only way into an existing flat is `join_household` with its invite code.
- **Month close does not freeze `chore_event`.** Duties are not money, and a chore logged late can't move anyone's kitty position, so there is deliberately no `check_chore_closed()` to match the guards in `m5_close_guards.sql`.
