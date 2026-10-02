Build FlatHub milestones **M0 (setup)** and **M1 (Kitty)**. Work in `/Users/sahidalam/Developer/Personal/POS/FlatHub`.

## Read first, in this order
1. `CLAUDE.md`: stack, conventions, domain words
2. `docs/PLAN.md`: scope, milestones, answered questions, decisions
3. `docs/DATA_MODEL.md`: tables and invariants
4. `research_notes/Absence adjusted kitty shares/absence_rules.md`: the absence rule and its worked example. DATA_MODEL.md has the final formula.
5. Only if needed: `reports/Flatmate household management app.md`. Do **not** import its pairwise settle-up machinery (see PLAN.md "Not to import").

## M0 – Setup
- `git init`. FlatHub is its own repo.
- Expo app (TypeScript, expo-router), built with pnpm, in this folder (not a monorepo).
- `src/domain/` holds pure TypeScript with no React or Supabase imports, because the POS will reuse it later.
- Supabase via the CLI: run `supabase init` and use the local stack (Docker is installed). Keep migrations in `supabase/migrations/`. Don't create a hosted project yet; ask me first.
- Auth: email magic link. Then: create household → invite link → join.
- RLS on every table, keyed on household membership. Add a SQL test showing that a non-member can't read a row.

## M1 – Kitty
Tables, per DATA_MODEL.md: `household`, `member`, `member_absence`, `spend`, `spend_line`, `pool_entry`. Ledger tables are insert-only, and corrections are reversal rows. Money is integer paise (`bigint`). IDs are client-generated UUIDv7.

Domain functions in `src/domain/kitty.ts`, each with tests in `src/domain/kitty.test.ts` run by `node --test` (Node 26 strips TS types natively, so no test framework is needed):
- `allocate(totalPaise, weights)`: largest-remainder allocation with deterministic tie-break by member id. The shares must sum exactly to the total.
- `presenceWeights(month, members, absences)`:
  - merge each member's overlapping or adjacent absences;
  - count only runs of 3 or more days;
  - clip to the member's joined/left dates;
  - if Σw is 0, fall back to membership days.
- `poolCash`, `credit`, `share`, `position`, `toReimburse` and `suggestedTopup`, exactly as defined in DATA_MODEL.md.
- **Required tests:**
  - spend lines sum to the spend total;
  - the shares sum to Σ spend;
  - the kitty identity `Σ position = poolCash` holds on a realistic month: 6 mates, ₹2,000 top-ups each, Zepto spends from both the pool and a personal pocket, local dahi/milk spends, one reimbursement, one reversal, and one absent mate;
  - a reversal nets to zero;
  - **the research worked example is reproduced exactly:**
    - inputs: ₹11,400 spent in a 30-day month; A away 10 days (w=20); B away 2 days (under threshold, w=30); C–F w=30;
    - expected shares in paise: A 134,118, B and C 201,177 each, D–F 201,176 each;
    - suggested top-ups: A ₹1,341.18, B and C ₹2,011.77, D–F ₹2,011.76;
  - two back-to-back 2-day absences merge into one qualifying 4-day run;
  - a mate who joins mid-month is not treated as absent before they joined.

Screens (UI first, then data):
- **Kitty home**
  - Big pool balance.
  - "Top up ₹X to Ansh" card on/after the 1st for mates who haven't contributed this month.
    - X is `suggestedTopup` and can be edited.
    - Use a `upi://pay?pa=<ansh vpa>&pn=Ansh%20Rastogi&am=<X>&cu=INR&tn=FlatHub%20kitty%20<Mon YYYY>` link.
- **Away:** a mate logs an absence (from and to dates). The month statement flags entries added after the absence started as "added late".
  - List of each mate's position.
- **Add spend (manual)**
  - Source (Zepto / local / other), amount, paid by (defaults to me), and paid from (pool / own pocket).
  - Optional lines, with fee and discount line kinds.
  - Validate that the lines sum to the total.
- **Ansh's "To reimburse" list:** mark an item reimbursed, which creates a `pool_entry` of kind `reimbursement`.
- **Contributions:** record a top-up (member, amount, date).
- **Month statement:** read-only and visible to every member.

Before building the screens, run a UI design pass with the `impeccable` or `frontend-design` skill. The design must give:
- one-tap entry
- touch targets of 48px or more
- the balance readable at a glance
- no leaderboard
- correct ₹ formatting with Indian digit grouping (₹1,23,456)

## Out of scope
Zepto import, quick-add favourites, stock, fridge, duties (M2–M4), bills, and offline sync. Don't scaffold for them.

## Done when
- `node --test src/domain` passes.
- Migrations apply cleanly on a fresh `supabase db reset`.
- The RLS test passes.
- I can create the household, invite a second user, add a top-up, a pool spend, a personal spend and its reimbursement in the app on iOS Simulator or Expo Go, and see the balances match the domain functions.
- Show me screenshots, then commit.
