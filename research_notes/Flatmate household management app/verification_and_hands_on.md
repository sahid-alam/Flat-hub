# Verification and hands-on checks: how the key open-source household apps actually behave, plus adversarial fact-checks of the flatmate-app research notes

Date: 2026-10-02. Scope: (A) run or trace the code of Spliit, Grocy and Donetick, and implement the mess meal rate; (B) fact-check the riskiest claims in `algorithms_integrations_stack.md`, `commercial_apps_and_user_needs.md` and `open_source_household_repos.md` (not modified).

Everything hands-on lives in the scratchpad: `/private/tmp/claude-501/-Users-sahidalam-Developer-Personal-POS/83029d76-8d88-49c8-abed-cb25150a3a77/scratchpad/verify/` (`flat_money.mjs` and its output `flat_money.out`, `grocy_fefo.sql`, `grocy_chores.sql`, `grocy_fefo_test.db` (a copy of `grocy_schema.db`), `zz_flatmate_verify_test.go`, `donetick_gotest.log`). Repo commits read: Spliit `d3b1e1e` (2026-09-30), Grocy `41206cb` (2026-09-16), Donetick `560c4b8` (2026-10-01).

## Claims in the existing notes that are wrong or need correcting (summary)

### Takeaway
The biggest code-level error in the notes concerns Spliit. It does **not** settle "largest creditor with largest debtor". It pairs creditors and debtors in **participant-id order** and ignores amounts. On small whole-rupee balances that ordering gave more transfers than necessary in 22% of random trials, against 4.6% for a true largest-first greedy. Both chore engines (Grocy and Donetick) **count a skipped chore as a completion** in their "least done" strategies, which lets a flatmate dodge their turn. Several web-sourced figures also need correcting. They are listed below.

### Cited Findings
- WRONG (open_source_household_repos.md, Q2 takeaway and Spliit bullet): "Debt simplification everywhere is the greedy largest-creditor/largest-debtor matching" and "[Spliit] sorts net balances… matches the first (largest creditor) with the last (largest debtor)". In fact `compareBalancesForReimbursements` puts positive balances before negative ones and then sorts by `participantId`. Magnitude is never compared. Only SplitPro's `minCashFlow` is largest-first. Yuvomi sorts by `user_id`, which the notes already say. — [spliit balances.ts L84–126](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/balances.ts); [split-pro simplify.ts L82–150](https://github.com/oss-apps/split-pro/blob/HEAD/src/lib/simplify.ts); [yuvomi split-expenses.js L140–180](https://github.com/ulsklyc/yuvomi/blob/HEAD/server/services/split-expenses.js)
- INCOMPLETE (same file, Grocy chores): "who-least-did-first picks the lowest execution_count… COUNT(chores_log WHERE done_by_user_id = user AND undone = 0)". The formula is right, but the consequence was missed: **skipped** executions (`skipped = 1`) are counted, so skipping a chore credits you with doing it. Demonstrated in SQL below. — [grocy ChoresService.php](https://github.com/grocy/grocy/blob/HEAD/services/ChoresService.php); view `chores_execution_users_statistics` in [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)
- INCOMPLETE (Donetick strategies): `least_completed` counts skip records too, because `SkipChore` writes a history row with `CompletedBy: userID, Status: skipped` and `checkNextAssignee` does not filter by status. Ties in `least_assigned`/`least_completed` are broken by Go map iteration order, which is random. `round_robin` advances from the **assigned** person, not from whoever completed the chore. A skip in Donetick keeps the same assignee. — [donetick handler.go L4002–4140](https://github.com/donetick/donetick/blob/HEAD/internal/chore/handler.go); [repository.go SkipChore L1022–1080](https://github.com/donetick/donetick/blob/HEAD/internal/chore/repo/repository.go)
- WRONG (Donetick `FrequencyType`): the notes list "daily/weekly/monthly/yearly/adaptive/custom". The actual enum is `once, daily, weekly, monthly, yearly, adaptive, interval, days_of_the_week, day_of_the_month, trigger, no_repeat, always`. There is no `custom` constant; only a stale code comment on L52 mentions "custom". — [donetick model.go L20–35](https://github.com/donetick/donetick/blob/HEAD/internal/chore/model/model.go)
- CONFIRMED: Grocy's FEFO order (default consume location first, then opened, then earliest due date, then oldest purchase), Spliit's Hamilton apportionment with an FNV-1a-rotated remainder, SplitPro's largest-first `minCashFlow`, and the seven Donetick strategy names. Evidence is in the sections below.
- REFUTED or corrected web claims (details and sources in B1–B13):
  - Splitwise **publishes** its cap ("up to 4 expenses each day").
  - Flatastic has no "$2.49/month" tier. The US price is $1.99/month or $18.49/year.
  - WebKit bug 254573 is an unrelated JSC bug, and WebKit's position on Shape Detection is "support", not "Under Consideration". Desktop Chrome supports BarcodeDetector only on macOS and ChromeOS.
  - WhatsApp service messages after the free 1,000 cost ₹0.115, not ₹0.145. The current card is dated 1 Oct 2026, and GST is not on Meta's page.
  - UPI `am` is optional for P2P links. NPCI ended P2P *collect* requests on 1 Oct 2025.
  - Supabase Pro's 8 GB is disk, not database size.
  - Minimum settlement is **strongly** NP-hard (Verhoeff 2004, from 3-Partition).
- CONFIRMED: OFF counts (24,639 for India, 1,334 for Bangladesh) and rate limits (15 reads and 10 searches per min per IP); iOS push needs a Home Screen install; Supabase free-tier limits and the 7-day pause; WhatsApp ₹0.8631 marketing and ₹0.115 utility/authentication; the 1,000 free service messages; no public bKash P2P deep link; Yuvomi (1,640★, created 2026-03-24, MIT); Tandoor AGPL-3.0 plus Commons Clause.
- UNVERIFIABLE: the 2023 start date of Splitwise's cap, and OurHome's "Sept 2023 / last updated 2020" dates. Both OurHome store listings now 404.

### Inferences
- When a design doc says "copy Spliit's greedy settle-up", it should say which greedy it means. For FlatHub, sorting by magnitude (largest-first) is equally simple and measurably better on round-number balances. Exact minimisation is cheap for flats of 8 or fewer people.
- "Skip" must be a separate outcome that does **not** count as doing the chore. Both reference implementations get this wrong for fairness-based strategies.

### Gaps
- The `debts` PyPI library used by IHateMoney was not read, so its ordering is still unverified.

## (A1) Environment: what tooling is available to run the apps?

### Takeaway
Docker 29.7.2 (with the Docker Desktop daemon running), Node v26.0.0 and Python 3.12.8 are available. **PHP and Go are not installed**, so Grocy cannot run natively. An attempt to run Donetick's Go code in a `golang:1.24` container failed: the Docker credential helper hung while pulling the image, and the run hit the 10-minute cap.

### Cited Findings
- `docker --version` → `Docker version 29.7.2, build a7dcaa6`; `docker info` → server 29.7.2, Docker Desktop — local command output
- `node --version` → `v26.0.0`; `python3 --version` → `Python 3.12.8`; `php --version` → `command not found: php`; `go version` → `command not found: go`; `sqlite3 --version` → 3.44.4 — local command output
- `repos-flat/grocy_mig_err.txt` is empty (0 bytes), which matches the notes' claim that the schema rebuilt "with no errors". The DB has the schema only: `products`, `stock`, `users` and the other tables have 0 rows. — local file check

### Inferences
- A full Grocy UI run needs its Docker image (linuxserver/grocy). This was not attempted. The FEFO and chore logic live in SQL views, so testing them directly in SQLite exercises the real code path.

### Gaps
- No app UI was started. The Docker time budget went on the failed Donetick test container (see A6).

## (A2) Spliit split/rounding and settlement: ported and run on a 4-flatmate month

### Takeaway
I ported Spliit's `shares.ts` and `balances.ts` to plain JS. The port reproduces six of Spliit's own unit-test vectors. On a realistic month (rent, utilities with an AC-room weighting, a ₹7,350 ration bought by one person and split by days present, personal items and a reimbursement), every expense's shares sum exactly to its amount, the four net balances sum to 0 paise, and the suggested transfers zero every balance. Spliit's id-ordered settle-up is **not** largest-first. Here it happened to give the minimum (3 transfers), but in random trials it is non-minimal far more often than a largest-first greedy.

### Cited Findings
- Source logic: `apportion()` floors each exact share, then hands the leftover minor units out by largest remainder, with ties rotated by `hashString(expense.id) % n` (FNV-1a). `paidFor` is sorted by participant id first, so the order rows come back from the DB does not matter. `BY_PERCENTAGE` shares are basis points (Σ = 10000) and `BY_AMOUNT` shares are minor units, both treated as ratios. — [spliit shares.ts](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/shares.ts)
- Settlement: `getSuggestedReimbursements` filters out zero balances and sorts them with `compareBalancesForReimbursements`: `if (b1.total > 0 && 0 > b2.total) return -1 … return b1.participantId < b2.participantId ? -1 : 1`. The loop then repeatedly settles `last` (a debtor, by id) → `first` (a creditor, by id). The code comment explains the intent: "A comparator that is stable across reimbursements. This ensures that a participant executing a suggested reimbursement does not result in completely new repayment suggestions." — [spliit balances.ts L79–126](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/balances.ts)
- Verbatim script output (`node flat_money.mjs`, scratchpad `verify/flat_money.out`):
```
[0] Port matches 6 of Spliit's own shares.test.ts vectors: OK

[1] Per-expense shares (paise). leftover = units handed out by largest remainder
  rent-oct    EVENLY         ₹48,000.00 paidBy=asha   leftover=0  asha:1200000 bilal:1200000 chetan:1200000 divya:1200000
  elec-sep    BY_PERCENTAGE   ₹3,217.50 paidBy=bilal  leftover=2  asha:72394 bilal:72394 chetan:112612 divya:64350
  wifi-oct    EVENLY          ₹1,179.00 paidBy=chetan leftover=0  asha:29475 bilal:29475 chetan:29475 divya:29475
  gas-cyl     EVENLY            ₹853.50 paidBy=divya  leftover=2  asha:21338 bilal:21337 chetan:21337 divya:21338
  cook-maid   EVENLY          ₹9,500.00 paidBy=asha   leftover=0  asha:237500 bilal:237500 chetan:237500 divya:237500
  ration-oct  BY_SHARES       ₹7,350.00 paidBy=bilal  leftover=2  asha:200454 bilal:200455 chetan:200455 divya:133636
  veg-milk    EVENLY          ₹2,890.45 paidBy=divya  leftover=1  asha:72261 bilal:72261 chetan:72261 divya:72262
  toothpaste  EVENLY            ₹120.00 paidBy=asha   leftover=0  asha:12000
  snacks      EVENLY            ₹333.33 paidBy=chetan leftover=1  chetan:16667 divya:16666
  medicine    BY_AMOUNT         ₹457.25 paidBy=bilal  leftover=0  divya:45725
  repay-med   BY_AMOUNT         ₹457.25 paidBy=divya  leftover=0  bilal:45725

[1] Net balances (paid - share). Sum = 0
  asha    paid  ₹57,620.00  share  ₹18,454.22  net  ₹39,165.78
  bilal   paid  ₹11,024.75  share  ₹18,791.47  net  -₹7,766.72
  chetan  paid   ₹1,512.33  share  ₹18,903.07  net -₹17,390.74
  divya   paid   ₹4,201.20  share  ₹18,209.52  net -₹14,008.32

[1] Settlement
  Spliit getSuggestedReimbursements: 3 transfer(s) -> divya->asha ₹14,008.32, chetan->asha ₹17,390.74, bilal->asha ₹7,766.72
  Largest-creditor/largest-debtor  : 3 transfer(s) -> chetan->asha ₹17,390.74, divya->asha ₹14,008.32, bilal->asha ₹7,766.72
  Exact minimum (bitmask DP): 3 transfer(s)

[2] small whole-rupee balances (±₹10, ₹1 steps: zero-sum subgroups common): {"trials":20000,"spliitNonMinimal":4408,"largestFirstNonMinimal":929,"spliitWorseThanLargest":3715,"largestWorseThanSpliit":236}
  4-person example where Spliit order is non-minimal: balances (₹) [-3,3,1,-1] Spliit=3 largest-first=2 optimal=2

[2] realistic paise balances (±₹10,000, 1-paisa steps): {"trials":20000,"spliitNonMinimal":0,"largestFirstNonMinimal":0,"spliitWorseThanLargest":0,"largestWorseThanSpliit":0}
  (no case may exceed n-1 transfers: asserted)
```
  — local run of `verify/flat_money.mjs` (ported from the Spliit source above)
- Assertions that passed:
  - Every expense's shares are integers and sum to its amount.
  - Σ net balances = 0.
  - Applying each settler's transfers leaves every balance at exactly 0.
  - The bitmask-DP minimum equals an independent LeetCode-465-style brute force on every random case with n ≤ 5.
  - No settler ever exceeds n−1 transfers.
  - Source: local run

  The worked rounding examples:
  - Electricity at 22.5/22.5/35/20% of ₹3,217.50 has exact shares of 723.9375, 723.9375, 1,126.125 and 643.50. Asha and Bilal each get the extra paisa, because their remainders (0.75) are the largest.
  - The ₹7,350 ration split 30:30:30:20 days leaves 2 paise over. These go to Bilal and Chetan rather than Asha, even though Asha, Bilal and Chetan have equal remainders. This is the FNV hash rotation at work.
  - Source: local run

### Inferences
- With realistic paise-level balances, coincidental zero-sum subgroups almost never occur. Then any greedy reaches n−1 transfers, and n−1 is optimal: 0 of 20,000 trials were non-minimal. The id-ordering weakness only shows when amounts are round (e.g. "everyone owes ₹500"), which **is** common in flats with fixed rent and Wi-Fi shares. FlatHub should use largest-first plus an exact DP for n ≤ 12. Both are about 20 lines (see `minTransfers()` in the script).
- Spliit's id-ordered comparator has a real UX benefit: suggestions stay stable after one person pays. Largest-first can reshuffle the remaining suggestions. That stability is worth keeping as a tie-breaker.
- Personal items (toothpaste paid for and owed by the same person) and reimbursements modelled as expenses net out correctly, so FlatHub does not need a special "personal" code path in the ledger. A `paidFor = [self]` expense is enough.

### Gaps
- Spliit's own Vitest suite was not run (no `node_modules`). The port was validated against six of its test vectors instead.

## (A3) Mess meal-rate calculation on sample data

### Takeaway
Meal rate = total bazar ÷ total meals. Applied to the same ₹7,350 ration plus ₹4,941.25 of fresh bazar (₹12,291.25 in total) over 230 meals, the rate is ₹53.4402 per meal. Quoting the rate rounded to paisa (₹53.44) loses 5 paise. Rounding each member's bill to the rupee over-collects 75 paise. Largest-remainder apportionment with meals as shares (Spliit's `apportion()`) is exact, and the balances, with deposits and the manager's pot, net to zero.

### Cited Findings
- The formula, "Total Bazar Cost ÷ Total Meals = Meal Rate", as stated by a mess calculator site — [Bachelor Mess Meal Rate Calculator BD](https://studentmealcalculator.convertertoolsai.com/) (cited in algorithms_integrations_stack.md; not re-fetched)
- Verbatim script output, section [3]:
```
[3] Mess: total bazar ₹12,291.25, total meals 230, meal rate = ₹12,291.25/230 = ₹53.4402 per meal
  meal cost by member      asha          bilal         chetan        divya         sum          residue vs bazar
  rate rounded to ₹53.44 x meals ₹3,099.52     ₹3,259.84     ₹3,847.68     ₹2,084.16     ₹12,291.20   -5 paise
  each rounded to ₹1         ₹3,100.00     ₹3,260.00     ₹3,848.00     ₹2,084.00     ₹12,292.00   75 paise
  largest remainder (paisa)  ₹3,099.53     ₹3,259.85     ₹3,847.70     ₹2,084.17     ₹12,291.25   0 paise
  balance = deposits + bazar paid - meal cost (Chetan also owes the unspent pot ₹2,885.00):
    asha    meals 58  deposit  ₹2,000.00  bazar  ₹1,240.50  cost  ₹3,099.53  net     ₹140.97
    bilal   meals 61  deposit      ₹0.00  bazar  ₹8,455.00  cost  ₹3,259.85  net   ₹5,195.15
    chetan  meals 72  deposit  ₹1,000.00  bazar      ₹0.00  cost  ₹3,847.70  net  -₹5,732.70
    divya   meals 39  deposit  ₹1,500.00  bazar    ₹980.75  cost  ₹2,084.17  net     ₹396.58
  Sum of mess balances = 0
  Spliit order on mess balances: 3 transfer(s) -> chetan->asha ₹140.97, chetan->bilal ₹5,195.15, chetan->divya ₹396.58
  Exact minimum: 3
  For comparison, equal split of the same bazar: ₹3,072.82 each; Divya pays ₹988.64 more than under meal rate, Chetan ₹774.89 less
```
  — local run of `verify/flat_money.mjs`
- Sample data:
  - Ration of ₹7,350 bought by Bilal, plus ₹1,105 of his own fresh bazar.
  - Asha's bazar duty was ₹1,240.50 and Divya's ₹980.75. Chetan (the manager) spent ₹1,615 from the deposit pot.
  - Deposits paid to Chetan: Asha ₹2,000, Chetan ₹1,000, Divya ₹1,500.
  - Meals: 58, 61, 72 (including 4 guest meals) and 39 (Divya was away 10 days).
  - The manager's liability for the unspent pot (Σ deposits − pot spend = ₹2,885) has to be in the formula, or the books do not balance.
  - Source: local run

### Inferences
- The algorithms note's formula `member_balance = deposits_i + bazar_paid_i − member_cost_i` (algorithms_integrations_stack.md §2) is **incomplete**. It only nets to zero if deposits are recorded as the manager's liability, i.e. the manager's balance also subtracts Σ deposits − spending from the pot. Without that term, the sample books are off by exactly ₹2,885.
- Meal rate vs equal split matters: the member who was away 10 days pays ₹988.64 less on a ₹12.3k bazar. This is the "perceived fairness" lever described in commercial_apps_and_user_needs.md.
- Store the meal rate as a rational number (total/meals). Only round at apportionment time. Never quote a rounded rate as the billing basis.

### Gaps
- Half-meals, guest meals charged to a host, and mid-month joiners were not modelled. Weighted meal counts plug into the same `apportion()` as shares (e.g. breakfast = 1, lunch = 2, with doubled units).

## (A4) Grocy FEFO consumption: `stock_next_use` run against the rebuilt schema

### Takeaway
On a copy of `grocy_schema.db` I inserted two products and eight stock lots. The real `stock_next_use` view ordered them exactly as its comment says: lots at the **default consume location first**, then **opened before unopened**, then **earliest best-before**, then **earliest purchase**. Two flatmate-relevant consequences follow. First, an opened milk carton is used before an unopened one that expires two days sooner. Second, a lot with a NULL best-before date sorts **before** dated lots in the same location, because SQLite orders NULL first in ascending sorts. Grocy's own UI avoids the second problem by storing "never expires" as `2999-12-31`.

### Cited Findings
- The view definition from the rebuilt DB: `ROW_NUMBER() OVER(PARTITION BY s.product_id ORDER BY CASE WHEN IFNULL(p.default_consume_location_id, -1) = s.location_id THEN 0 ELSE 1 END ASC, s.open DESC, s.best_before_date ASC, s.purchased_date ASC) * -1 AS priority`. The comment reads: "The default consume rule is: Opened first, then first due first, then first in first out. Apart from that products at their default consume location should be consumed first". — `repos-flat/grocy_schema.db`; [grocy migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)
- `ConsumeProduct()` gets candidate lots from `GetProductStockEntries()`, which returns `$this->DB->stock_next_use()->where(...)`, and walks them in order until the amount is used up. With `$allowSubproductSubstitution` it widens the filter to child products. Chores that consume stock call it with substitution set to `true`. — [grocy StockService.php L365–470, L866–887, ChoresService.php ~L200](https://github.com/grocy/grocy/blob/HEAD/services/StockService.php)
- Grocy writes `date('2999-12-31')` for products without a due date (StockService.php L161, L170, L1336), so NULL dates only come from direct DB or API writes. — [StockService.php](https://github.com/grocy/grocy/blob/HEAD/services/StockService.php)
- Verbatim output of `sqlite3 grocy_fefo_test.db < grocy_fefo.sql`. The setup: rice has default location Store room (1) and default *consume* location Kitchen (2). Milk is in the Fridge (3) with `due_type` 2.
```
product_id  priority  stock_id  loc  open  bbd         bought      amount  note
----------  --------  --------  ---  ----  ----------  ----------  ------  ---------------------------------------
1           -1        lotB      2    1     2027-01-15  2026-08-01  1.2     opened tin in kitchen
1           -2        lotD      2    0     2026-12-31  2026-08-20  5       5kg bag kitchen, bought earlier
1           -3        lotC      2    0     2026-12-31  2026-09-05  5       5kg bag kitchen, bought later
1           -4        lotF      1    0                 2026-09-11  2       NULL best_before (direct insert)
1           -5        lotA      1    0     2027-03-31  2026-09-01  25      25kg monthly bulk bag, store room
1           -6        lotE      1    0     2999-12-31  2026-09-10  5       never-expires sentinel used by Grocy UI
2           -1        milk1     3    1     2026-10-05  2026-10-01  0.5     opened, expires later
2           -2        milk2     3    0     2026-10-03  2026-10-01  1       unopened, expires sooner
```
  — local run against a copy of `repos-flat/grocy_schema.db` (SQLite 3.44.4)

### Inferences
- For FlatHub's fridge, "opened first" is a sensible default for milk and curd, but it is **not** pure FEFO. If an unopened item expires first, the app should warn ("milk2 expires before the opened one"), not silently pick the opened one.
- Location priority means the 25 kg bulk bag in the store room is only drawn on once the kitchen lots are gone. That matches how a monthly ration is decanted. FlatHub's `stock_lot` ordering should be `ORDER BY (location = default_consume) DESC, opened DESC, expiry ASC NULLS LAST, received_at ASC`, with an explicit `NULLS LAST` (Postgres sorts NULLs last in ASC by default, but say so explicitly). The algorithms note's `expiry_date ASC NULLS LAST, received_at ASC` is consistent with this but leaves out location and opened state.

### Gaps
- Grocy's PHP consume path was not executed (no PHP). Only the view, which is the ordering source it reads, was exercised.

## (A5) Grocy chore assignment: traced, with the statistics view exercised

### Takeaway
`CalculateNextExecutionAssignment` (ChoresService.php L19–102) runs after every tracked or undone execution:
- A one-off `rescheduled_next_execution_assigned_to_user_id` wins, and is cleared after the next execution is tracked.
- **random**: `array_rand` over the assigned users.
- **in-alphabetical-order**: sorts by `display_name` and takes the user after the last `done_by_user_id`. If the last doer is not in the list, or is last, it takes the first.
- **who-least-did-first**: takes the lowest `execution_count`, which counts **skips** as executions and has no tie-break.

### Cited Findings
- Code facts — [grocy ChoresService.php](https://github.com/grocy/grocy/blob/HEAD/services/ChoresService.php):
  - The assigned users are those whose id is in `explode(',', $chore->assignment_config)`. The SQL view instead uses `',' || assignment_config || ',' LIKE '%,' || id || ',%'`.
  - The "last done by" user is found from the max `tracked_time` among non-undone logs, breaking ties by `row_created_timestamp DESC`.
  - In-alphabetical-order uses `usort(... strcmp($a->display_name, $b->display_name))`. If no user follows the last doer, the code comment says: "probably it was the last user in the sorted list -> the first one is the next one".
  - who-least-did-first uses `chores_execution_users_statistics()->where('chore_id = :1')->orderBy('execution_count')->limit(1)`, with no secondary order.
  - `TrackChoreExecution` saves the log row (including `skipped`), consumes the linked product if `consume_product_on_execution = 1`, clears `rescheduled_date` and `rescheduled_next_execution_assigned_to_user_id`, then recalculates. `UndoChoreExecution` sets `undone = 1` and recalculates.
- The view counts skips: `(SELECT COUNT(1) FROM chores_log WHERE chore_id = c.id AND done_by_user_id = caur.user_id AND undone = 0) AS execution_count`. It has no `skipped = 0` filter. — `repos-flat/grocy_schema.db`
- Verbatim run (`grocy_chores.sql`). Asha did the chore twice and Bilal once. Chetan **skipped** twice. Divya did it once, but that was undone:
```
user_id  execution_count
-------  ---------------
4        0
2        1
1        2
3        2
```
  Chetan's two skips count the same as Asha's two real completions, so Divya (0) is next and Chetan is ranked last. — local run against a copy of `grocy_schema.db`
- Edge cases from reading the code (not executed):
  - With `random` and an empty assignee list, `array_rand([])` throws a `ValueError` in PHP 8.
  - Alphabetical order is by display name, so renaming a user reorders the rotation.
  - Source: [ChoresService.php](https://github.com/grocy/grocy/blob/HEAD/services/ChoresService.php)

### Inferences
- In-alphabetical-order is a plain round-robin keyed on "who last did it". A swap (Divya does Bilal's turn) moves the rotation pointer to Divya, so Bilal's turn is effectively forfeited and Divya's comes round again sooner. FlatHub should treat a swap as an explicit transfer of one instance.

### Gaps
- The `adaptive` period computation in `chores_current` was not traced.

## (A6) Donetick chore assignment strategies: traced in code (a container run was attempted and failed)

### Takeaway
All seven strategies live in one function, `checkNextAssignee` (handler.go L4002–4140), called on complete (L2400) and approve (L3594). Skip does not call it: `SkipChore` keeps `chore.AssignedTo`. How each strategy picks:
- **round_robin**: index of the *current assignee* + 1, modulo the list, in preload order.
- **least_assigned**: minimum count of history `AssignedTo`.
- **least_completed**: minimum count of history `CompletedBy`, with skips included.
- **random**: `rand.Intn` over the assignees.
- **random_except_last_assigned**: random over everyone except the current assignee, keeping them if they are the only one.
- **keep_last_assigned**: `chore.AssignedTo`.
- **no_assignee**: nil.

Ties in the two "least" strategies are resolved by Go map iteration order, which is randomised.

### Cited Findings
- Enum (model.go L37–47): `random, least_assigned, least_completed, keep_last_assigned, random_except_last_assigned, round_robin, no_assignee`. The request binding validates `oneof=no_assignee least_assigned least_completed random keep_last_assigned random_except_last_assigned round_robin` (handler.go L320). — [model.go](https://github.com/donetick/donetick/blob/HEAD/internal/chore/model/model.go); [handler.go](https://github.com/donetick/donetick/blob/HEAD/internal/chore/handler.go)
- "Anyone" chores: if `len(chore.Assignees) == 0` and the strategy is not `no_assignee`, the assignee list becomes the whole circle. The code comment says this is because "the notification planner only emits for an assigned user, so dropping it would silence the chore". — [handler.go L4007–4021](https://github.com/donetick/donetick/blob/HEAD/internal/chore/handler.go)
- With no history, the code inserts a synthetic history row assigned to the performer ("assume the current operation as the first"). — handler.go L4029–4033
- least_assigned and least_completed loop `for assignee, numChores := range assigneeChores` (a Go `map[int]int`) and use a strict `<`, so among tied users the winner is whoever the randomised map iteration reaches first. least_completed only counts `history.CompletedBy` values that are current assignees (a regression fix covered by the repo's own `assignee_test.go`). — handler.go L4036–4093
- round_robin walks `chore.Assignees`, which comes from GORM `Preload("Assignees")` with no `Order`, finds `chore.AssignedTo` and picks `(i+1) % len`. If the current assignee is not found it picks `assignees[0]`. — handler.go L4122–4140; [repository.go L644](https://github.com/donetick/donetick/blob/HEAD/internal/chore/repo/repository.go)
- Skip: `nextAssignedTo := chore.AssignedTo` (handler.go ~L1899). `SkipChore` writes `ChoreHistory{CompletedBy: userID, AssignedTo: chore.AssignedTo, Status: ChoreHistoryStatusSkipped}`. — [repository.go L1022–1070](https://github.com/donetick/donetick/blob/HEAD/internal/chore/repo/repository.go)
- History source: `GetChoreHistory` returns **all** history for the chore, ordered by `updated_at desc`. The approve path at L3569 uses `GetChoreHistoryWithLimit(..., 5)` in one branch. — [repository.go L1101–1125](https://github.com/donetick/donetick/blob/HEAD/internal/chore/repo/repository.go)
- Rolling vs fixed: `scheduler.go` sets `baseDate = completedDate` when `chore.IsRolling`, and otherwise uses `NextDueDate`. This confirms the notes' claim. — [scheduler.go L20–30](https://github.com/donetick/donetick/blob/HEAD/internal/chore/scheduler.go)
- Execution attempt (the optional Docker step, capped at 10 min): I wrote a Go test, `verify/zz_flatmate_verify_test.go`, that calls the real `checkNextAssignee`. It covers round_robin when someone else completes, a 4-way tie under least_completed over 400 runs, and skip rows under least_completed. I ran it with `timeout 600 docker run --rm -v …/donetick:/src -w /src golang:1.24 go test ./internal/chore/ -run 'TestFlat|TestCheckNextAssignee' -v`. **It did not run.** The output was `Unable to find image 'golang:1.24' locally` / `docker: error getting credentials - err: signal: terminated` / `exit=124 secs=600`. The Docker Desktop credential helper hung during the image pull until the 10-minute cap expired. Go is not installed on the host. **The Donetick behaviour above therefore comes from code tracing only**: the random tie-break follows from Go's documented randomised map iteration, and the skip counting follows from the field values `SkipChore` writes. The test file is kept for a rerun, e.g. with `DOCKER_CONFIG` pointed at an empty config to bypass the credential store. — local log `verify/donetick_gotest.log`

### Inferences
- For FlatHub's "weighted deficit rotation", the tie-break must be deterministic, e.g. least recently did this chore, then user id. Neither Grocy (SQL row order) nor Donetick (random map order) gives a predictable "whose turn is next" display.
- Advancing round-robin from the assignee rather than the completer is the better behaviour for swaps: if Divya covers Bilal, the rotation still moves to the person after Bilal. Grocy does the opposite.

### Gaps
- The adaptive scheduler ("learns from historical completions") was not traced beyond the README claim.

## (B1) Splitwise: the 2023 free-tier expense cap and current Pro price

### Takeaway
**Partially confirmed, with one correction.** Splitwise **does publish** the cap: free users can add **4 expenses per day**. The notes' line "Splitwise does not publish the exact number… about 3–5" is wrong. The "introduced in 2023" date rests only on third-party sources. The US App Store lists $4.99 and $39.99 Pro purchases, but the listing does not say which is monthly or yearly.

### Cited Findings
- "free users can add up to 4 expenses each day" — [Splitwise KB: What is Splitwise Pro?](https://kb.splitwise.com/pro/what-is-splitwise-pro) (re-fetched by me, 2026-10-02)
- "Splitwise has introduced a daily expense limit for our free tier… you can add more expenses as soon as the daily limit resets". No date and no reset time are given. — [Splitwise feedback KB: Why am I seeing an expense limit?](https://feedback.splitwise.com/knowledgebase/articles/2010350-why-am-i-seeing-an-expense-limit)
- US App Store (v26.9.1, 2026-09-20) in-app purchases: "Splitwise Pro" at $4.99, $2.99, $3.99, $39.99 and $29.99, with no period labels. The India store lists ₹49, ₹149, ₹199, ₹999 and ₹1,399. — [App Store US](https://apps.apple.com/us/app/splitwise/id458023433); [App Store IN](https://apps.apple.com/in/app/splitwise/id458023433)
- splitwise.com/pro shows no prices. — [splitwise.com/pro](https://www.splitwise.com/pro)

### Inferences
- "$4.99/month or $39.99/year" is plausible but not confirmed by a primary source. ₹999 is probably the Indian annual tier (also unconfirmed). Quote "up to 4 expenses/day (Splitwise KB)" as the cap.

### Gaps
- No primary source dates the start of the cap to 2023. The X post and blogs from Dec 2023 are the earliest evidence available.

## (B2) Has OurHome been pulled from the app stores?

### Takeaway
**Confirmed that it is gone from both stores. The dates are unverifiable.** The official site still links to both listings, and both return 404.

### Cited Findings
- ourhomeapp.com (HTTP only) still shows "OurHome - Your home made easy". It links to App Store id879717020 and Play package `com.getfairshare.ourhome`. — [ourhomeapp.com](http://ourhomeapp.com/)
- [Play Store listing](https://play.google.com/store/apps/details?id=com.getfairshare.ourhome) → 404. [App Store listing](https://apps.apple.com/au/app/ourhome-chores-rewards-groceries/id879717020) → 404. The iTunes lookup API returns 0 results in the US, AU, GB and IN stores. — fetched 2026-10-02
- New, unrelated apps use the same name: "OurHome by Elusios" (App Store id6753957205) and "OurHome: Family Planner" (id6781321737). — App Store search via iTunes lookup

### Inferences
- The notes' "a different developer's product now uses the name" is consistent with these two apps.

### Gaps
- "Unpublished Sept 2023" and "not updated since 2020" come from competitor blogs only. The Wayback Machine has no capture of the Play page from 2023.

## (B3) Flatastic pricing

### Takeaway
**Partially confirmed.** The German App Store shows €1.99/month and €17.99/year for "Premium für dich", matching the notes. The "$2.49/month" figure is **refuted**: the US store shows $1.99/month and $18.49/year for one person, and $6.49/month and $34.99/year for "Premium for everyone". The notes also miss a household-wide tier.

### Cited Findings
- App Store DE (v3.17.4, 2026-09-30):
  - "Premium für dich – Monatsabo 1,99 €" and "Jahresabo 17,99 €".
  - Also "Monatsabo 2,79 €".
  - "Premium für alle – Monatsabo 4,99 €" and "Jahresabo" at 31,99 € and 44,99 €.
  - Source: [App Store DE](https://apps.apple.com/de/app/flatastic/id840810742)
- App Store US: "Premium for one – Monthly $1.99", "Yearly $18.49", "Premium for everyone – Monthly $6.49", "Premium for everybody – Yearly $34.99". — [App Store US](https://apps.apple.com/us/app/id840810742)
- The vendor site gives no prices, only "Less than a coffee a month" and "annual subscription, you save 20%". — [flatastic-app.com/premium](https://www.flatastic-app.com/premium)

### Inferences
- Flatastic already sells a per-household "Premium for everyone" tier, which supports the notes' inference that per-household pricing fits flats.

### Gaps
- No Play Store or INR pricing was checked.

## (B4) OpenFoodFacts India/Bangladesh product counts and API rate limits

### Takeaway
**Confirmed.** The live API returns `count: 24639` for India and `1334` for Bangladesh, and the documented limits are 15 product reads/min/IP and 10 searches/min/IP.

### Cited Findings
- `GET https://world.openfoodfacts.org/api/v2/search?countries_tags_en=india&page_size=1&fields=code` → `"count":24639`. The same query for `bangladesh` → `"count":1334`. Sent with User-Agent `FlatHubResearch/0.1 (research)` on 2026-10-02. — [OFF search API](https://world.openfoodfacts.org/api/v2/search?countries_tags_en=india&page_size=1&fields=code)
- "15 req/min/IP address for all read product queries (GET /api/v*/product …)" and "10 req/min/IP address for all search queries (GET /api/v*/search or GET /cgi/search.pl)". Global limits return HTTP 503. A User-Agent of the form `AppName/Version (ContactEmail)` is required. — [OFF API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)

### Inferences
- About 24.6k Indian and 1.3k Bangladeshi products, against India's huge kirana catalogue, confirms that OFF is enrichment only. A local product cache makes the rate limits irrelevant.

### Gaps
- None for these figures.

## (B5) Safari BarcodeDetector status

### Takeaway
**The core claim is confirmed: Safari still ships BarcodeDetector disabled by default.** Two supporting details in the notes are **wrong**. WebKit bug 254573 is an unrelated JSC bug, and WebKit's standards position on Shape Detection is "support", not "Under Consideration". The notes also overstate Chrome. Desktop Chrome supports it only on macOS and ChromeOS, not on Windows or Linux. Android Chrome has had it since version 83.

### Cited Findings
- MDN browser-compat-data:
  - Safari `version_added: "17"`, behind the flag "Shape Detection API". iOS Safari is the same.
  - Chrome desktop 88+: partial, "Supported on ChromeOS and macOS only". "Before Chrome 113, on macOS Ventura (13) and above, this interface silently failed".
  - Chrome Android 83: full support.
  - Firefox: no support.
  - Source: [BarcodeDetector.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/BarcodeDetector.json)
- WebKit `UnifiedWebPreferences.yaml` on main: `ShapeDetection: status: testable … defaultValue: false`. — [WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml)
- Bug 254573 is "[JSC] Fix Windows x64 calling convention" (RESOLVED). I re-fetched it myself via the Bugzilla XML. The relevant bugs are:
  - 198174 (BarcodeDetector feature request), resolved as a duplicate of 255803.
  - 255803, "[Shape Detection] [Cocoa] Implement first draft…" (RESOLVED FIXED).
  - 255380, "Make the Shape Detection API work in Workers" (NEW).
  - Sources: [bug 254573](https://bugs.webkit.org/show_bug.cgi?id=254573); [bug 255803](https://bugs.webkit.org/show_bug.cgi?id=255803)
- WebKit standards-positions issue #174, "Accelerated Shape Detection in Images", has position **support** (concerns: duplication, use cases) and is closed. — [WebKit/standards-positions#174](https://github.com/WebKit/standards-positions/issues/174)

### Inferences
- A PWA still needs a WASM/ZXing fallback on iOS **and** on Windows/Linux desktop Chrome. Expo native scanning sidesteps both.

### Gaps
- I found no public timeline for WebKit enabling the feature by default.

## (B6) Does iOS web push require installing to the Home Screen?

### Takeaway
**Confirmed.** Since iOS/iPadOS 16.4, push works only for web apps added to the Home Screen. Declarative Web Push (18.4) is also limited to Home Screen web apps. I found no source saying iOS 26 allows push from Safari tabs.

### Cited Findings
- "A web app that has been added to the Home Screen can request permission to receive push notifications as long as that request is in response to direct user interaction." — [WebKit blog, Feb 16 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- "Add web push to Home Screen web apps in iOS 16.4 or later and Webpages in Safari 16 for macOS 13 or later." — [Apple Developer: Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- "Declarative Web Push is now available on iOS and iPadOS 18.4 for web apps added to the Home Screen." — [WebKit: Safari 18.4 features](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- The Safari 26.0 features post says nothing about push from Safari tabs on iOS. — [WebKit: Safari 26.0](https://webkit.org/blog/17333/)

### Inferences
- The notes' recommendation (native push via Expo, with PWA push as a secondary path) stands.

### Gaps
- One reported iOS 26 change is that any site added to the Home Screen opens as a web app by default. It was seen only in a search summary, not read in the primary post.

## (B7) Supabase free-tier limits and the 7-day pause

### Takeaway
**Confirmed from supabase.com/pricing**, with two refinements. Egress is 5 GB plus a separate 5 GB of *cached* egress. Pro's "8 GB" is **disk size per project**, not database size.

### Cited Findings
- Free:
  - $0.
  - "500 MB database size", 1 GB file storage, "5 GB included" egress plus "5 GB cached egress".
  - 50,000 MAU, 500,000 Edge Function invocations, 200 Realtime connections, 2 million Realtime messages.
  - "Limit of 2 active projects".
  - Projects paused "After 1 week of inactivity".
- Pro: "$25+", "8 GB disk size per project", 100,000 MAU, 250 GB egress, 100 GB storage, 2 million function invocations, 500 Realtime connections.
- Team: "$599+".
- Source: [supabase.com/pricing](https://supabase.com/pricing)

### Inferences
- The notes' cost analysis holds. The primary source now replaces the three secondary blogs the notes cited.

### Gaps
- None material.

## (B8) WhatsApp Business API India per-message pricing

### Takeaway
**The rates are confirmed on Meta's official INR rate card (effective 1 Oct 2026): marketing ₹0.8631, utility ₹0.115, authentication ₹0.115.** The single-sourced "1,000 free service messages/month from 1 Oct 2026" is **confirmed** by Meta. Its "then ₹0.145" is **refuted**: service messages cost ₹0.115. The 18% GST is not on Meta's page and is unverified.

### Cited Findings
- From "Cost per message in INR on the WhatsApp Business Platform, effective October 1, 2026", India row: Marketing 0.8631, Utility 0.115, Authentication 0.115, Authentication-International 2.4971, Service 0.115. The USD card shows India at 0.0118 / 0.0014 / 0.0014 / 0.0304 / 0.0014. — [Meta: WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- "As Meta resumes charging for service messages, Meta provides every business phone number with a free tier of 1,000 service messages per month". Charging starts "as of the 1,001st service message for each business phone number". The free tier resets monthly and does not roll over. — [Meta: WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- "Utility templates delivered within an open customer service window are free." — same page
- INR billing: "Billing localization launched on January 1, 2026" for Sold-To India. Migration to INR is required by Dec 31, 2026. — same page

### Inferences
- A household bot sending around 30 utility reminders per flat per month costs about ₹3.45 before tax. Replies within 24 h are free and the first 1,000 service messages are free, so WhatsApp is cheap at FlatHub's scale.

### Gaps
- The 1 Jul 2026 card was not fetched separately, so the "effective 1 Jul 2026" date in the notes is unverified. The current card is dated 1 Oct 2026 with the same utility and marketing figures. GST treatment is not confirmed by Meta.

## (B9) Is minimum-transaction debt settlement NP-complete?

### Takeaway
**Confirmed, and stronger than the notes say.** Verhoeff (2004) reduces from 3-Partition, so the problem is **strongly** NP-hard. Anton Cao's Subset-Sum reduction only shows weak NP-hardness. The characterisation the notes marked "not verified" (min transfers = n − maximum number of disjoint zero-sum groups) is stated in Verhoeff. My script's DP built on it agreed with brute force on every random case.

### Cited Findings
- "The number of arrows in a forest equals the number of points minus the number of components … minimizing the number of arrows in an acyclic graph, is equivalent to maximizing the number of components". Also: "minimizing the number of transfers is at least as difficult as 3-Partition", where 3-Partition is "NP-complete in the strong sense". — [Verhoeff, "Settling Multiple Debts Efficiently: An Invitation to Computing Science", Informatics in Education 3(1):105–126, 2004](https://wstomv.win.tue.nl/publications/INFE023.pdf)
- "the decision variant of this problem is NP-complete" (by reduction from Subset Sum). — [Anton Cao, The Splitwise Problem](https://antoncao.me/blog/splitwise)
- The DP equalled the LeetCode-465 brute force on every random 4–5 person case run (thousands of trials, with no assertion failures). — local run, `verify/flat_money.mjs`

### Inferences
- The "Inferences" bullet in algorithms_integrations_stack.md §1 about the bitmask DP can now be upgraded to a cited finding.

### Gaps
- None.

## (B10) UPI deep link format

### Takeaway
**Confirmed with corrections.** The parameter names match NPCI's Linking Specification 1.6. **`am` is optional for a static (P2P) link** (the payer can edit the amount), `tr` is mandatory only for merchant or dynamic links, and `cu` only accepts INR. NPCI discontinued **P2P collect requests from 1 Oct 2025**. That affects request-money flows, not payer-initiated `upi://pay` intents. The circular itself was seen only via news coverage.

### Cited Findings
- From "NPCI UPI Linking Specifications 1.6, November 2017" (a mirror; npci.org.in returned 403):
  - Static / Dynamic requirements: `pa` M/M, `pn` M/M, `mc` O/O, `tid` O/O, `tr` O/C ("Mandatory for Merchant transactions and dynamic URL generation"), `tn` O/O, `am` O/M ("If 'am' is not present then field is editable"), `mam` O/C, `cu` O/O ("Currently ONLY "INR" is the supported value").
  - Source: [labnol mirror of the NPCI linking spec PDF](https://www.labnol.org/files/linking.pdf) (secondary copy of an NPCI document)
- NPCI circular of 29 Jul 2025: P2P collect requests are discontinued from 1 Oct 2025, and merchant collect continues. — news coverage only (BusinessWorld, Outlook Money); the NPCI primary was unreachable

### Inferences
- FlatHub's "Pay ₹X to Asha" button should build `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…` (the payer pushes). It must **not** rely on sending UPI collect requests between flatmates, which are no longer allowed for P2P. Some UPI apps reportedly restrict or warn on P2P intents carrying an amount. This is unverified, so test with GPay, PhonePe and Paytm.

### Gaps
- No primary NPCI circular was fetched. Nothing primary was found on app-level handling of P2P intents with `am`.

## (B11) Does bKash have a public P2P deep link?

### Takeaway
**Confirmed: no public P2P deep link or URI scheme was found.** bKash's developer portal documents only merchant APIs (Tokenized Checkout and related).

### Cited Findings
- developer.bka.sh documents Tokenized Checkout (with and without agreement), Auth & Capture, token, query/search and refund APIs. It contains no deep link or URI scheme for Send Money. — [bKash Developer Portal](https://developer.bka.sh/docs)
- No documented `bkash://` scheme was found on bkash.com or in web search. — [bKash Send Money](https://www.bkash.com/en/products-services/send-money)

### Inferences
- The notes' recommendation stands: show the payee's bKash number with a copy button and the amount, and do not invent a scheme.

### Gaps
- An absence of evidence is not proof. Undocumented intents inside the bKash Android app were not reverse-engineered.

## (B12) Yuvomi existence, stars and features, plus repo star counts

### Takeaway
**Confirmed.** Yuvomi exists, was created on 2026-03-24, has 1,640 stars and is MIT-licensed. The star counts the notes give for Spliit, Donetick and Grocy match the GitHub API on 2026-10-02.

### Cited Findings
- `gh api repos/ulsklyc/yuvomi` → stars 1640, created `2026-03-24T12:46:14Z`, licence MIT. — [ulsklyc/yuvomi](https://github.com/ulsklyc/yuvomi)
- spliit-app/spliit 2,969 (MIT), donetick/donetick 2,608 (AGPL-3.0), grocy/grocy 9,543 (MIT), TandoorRecipes/recipes 8,649 (GitHub licence field: NOASSERTION). — [GitHub REST API](https://api.github.com/repos/spliit-app/spliit)
- Feature claims: the local clone's `server/services/split-expenses.js` has the per-currency `simplifyDebts` (sorted by user id). The notes' description of it was confirmed by my own reading above. — [split-expenses.js](https://github.com/ulsklyc/yuvomi/blob/HEAD/server/services/split-expenses.js)

### Inferences
- A repo that gained 1,640 stars in about 6 months is unusual. It is worth watching, but its maturity is unproven.

### Gaps
- The README's 20-module feature list was not re-read in this pass.

## (B13) Tandoor licence: AGPL plus Commons Clause?

### Takeaway
**Confirmed.** Tandoor's LICENSE.md puts the Commons Clause v1.0 on top of AGPL-3.0 for the whole software, so it cannot be sold, including as paid hosting. Versions before 0.10.0 (29 Jun 2020) are MIT. GitHub shows NOASSERTION because of the combined text. Strictly, this makes Tandoor source-available rather than OSI open source.

### Cited Findings
- "the grant of rights under the License will not include, and the License does not grant to you, the right to Sell the Software." The definition: "'Sell' means practicing any or all of the rights granted to you under the License to provide to third parties, for a fee or other consideration (including without limitation fees for hosting or consulting/ support services related to the Software), a product or service whose value derives, entirely or substantially, from the functionality of the Software." The file names "License: GNU AFFERO GENERAL PUBLIC LICENSE v3". The local clone's file is identical to upstream (blob `93b13b5…`). — [TandoorRecipes/recipes LICENSE.md](https://github.com/TandoorRecipes/recipes/blob/develop/LICENSE.md)
- "### Prior 0.10.0 — All versions released before version 0.10. or 29.06.2020 were licensed under the following license: The MIT License (MIT)". — same file

### Inferences
- FlatHub must not copy Tandoor code into a product that will be sold or hosted for a fee. Its design ideas (food-specific unit conversion, inventory booking log) can be reimplemented independently.

### Gaps
- None.
