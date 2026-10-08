# FlatHub

Household app for a 6-person shared flat in India: common kitty, groceries and stock, fridge, and duties.
Built for our flat first. It may become a product for other flats later, so every table is scoped by `household_id`.

- Plan, scope and milestones: [docs/PLAN.md](docs/PLAN.md)
- Tables and invariants: [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
- Research behind the decisions: [reports/Flatmate household management app.md](reports/Flatmate%20household%20management%20app.md)

## Stack (decided)

- **App:** Expo (React Native) + TypeScript. At least one flatmate uses an iPhone, which rules out a PWA: iOS web push needs a Home Screen install, and Safari has no barcode detection.
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage), with row-level security on `household_id`.
- **Receipt/Zepto extraction:** an LLM with a strict JSON schema, always followed by a confirm card before saving.
- **Package manager:** pnpm.

## Conventions (non-negotiable)

- Money is stored as **integer paise** (`bigint`). Never floats, and never `numeric` rupees in app code.
- Ledgers are **append-only**: `pool_entry`, `stock_move` and `chore_event`. Mistakes are corrected with a reversing entry, never with an UPDATE or DELETE.
- Every row gets a client-generated UUID (v7), so retries are idempotent.
- Every table has `household_id`, and RLS restricts access to members of that household.
- Each piece of money, rotation or month-close logic gets one runnable test. That test must fail if the pool stops balancing or if a missed chore earns credit.
- Don't import the report's pairwise-split machinery (debt simplification, Spliit-style per-expense splits, mate-to-mate UPI). This flat uses a **pooled kitty**; see PLAN.md.

## Domain words

- **Pool / kitty:** shared money that each mate tops up by ₹2,000 every month, paid to the treasurer **Ansh Rastogi**. It is only for groceries and common items; bills are split separately.
- **Spend:** a purchase for the flat. It is paid either from the pool or from a mate's own pocket. An own-pocket spend is **reimbursed** by Ansh, and the app tracks it until it's paid back.
- **Lot:** one purchased batch of a product, with its quantity, unit and expiry. Use it FEFO (first-expired, first-out).
- **Duty:** a recurring chore. There is no skip. A duty past its due date that nobody has done is **missed** — computed from the schedule, never recorded as an event, and it earns no credit. A **swap** is an offer, not a transfer: the assignee offers the instance, and any other mate claims it. Nobody is ever given a duty without tapping to take it, and an unclaimed offer is missed like any other.
