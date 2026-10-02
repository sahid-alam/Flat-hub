# Open-source household and flatmate management apps on GitHub: architecture, data models and lessons (as of Oct 2026)

Method: I shallow-cloned (`git clone --depth 1`) 11 repos into `/private/tmp/claude-501/-Users-sahidalam-Developer-Personal-POS/83029d76-8d88-49c8-abed-cb25150a3a77/scratchpad/repos-flat/` (grocy, spliit, split-pro, ihatemoney, kitchenowl, donetick, homebox, mealie, recipes [Tandoor], yuvomi, abrechnung). I rebuilt Grocy's final SQLite schema by applying all its `migrations/*.sql` files in order to a scratch DB (`repos-flat/grocy_schema.db`, with no errors) and read the resulting DDL and views. I took stars, last push, licence and archived flag from the GitHub REST API (`gh api repos/...`) on 2026-10-02, and the most-upvoted issues from the GitHub search API (`sort=reactions-+1`). Local paths below are relative to `repos-flat/`.

### Repo snapshot table (GitHub API, 2026-10-02)

| Repo | Feature focus | Stack | Stars | Last push | Licence | Status |
|---|---|---|---|---|---|---|
| [grocy/grocy](https://github.com/grocy/grocy) | Inventory, expiry, shopping, chores, batteries, tasks | PHP 8.5 + Slim 4 + LessQL + Blade, SQLite, jQuery/Bootstrap 4 | 9,543 | 2026-09-16 | MIT | Active (single maintainer) |
| [patzly/grocy-android](https://github.com/patzly/grocy-android) | Native Grocy client | Java (Android) | 1,199 | 2026-08-25 | GPL-3.0 | Active |
| [spliit-app/spliit](https://github.com/spliit-app/spliit) | Expense splitting | Next.js + tRPC + Prisma + Postgres | 2,969 | 2026-10-01 | MIT | Active |
| [oss-apps/split-pro](https://github.com/oss-apps/split-pro) | Expense splitting (Splitwise clone) | Next.js (pages) + tRPC + Prisma + Postgres (+pg_cron), next-auth, PWA | 1,459 | 2026-10-01 | MIT | Active |
| [spiral-project/ihatemoney](https://github.com/spiral-project/ihatemoney) | Expense splitting | Python Flask + SQLAlchemy | 1,392 | 2026-08-07 | BSD-style (GitHub shows NOASSERTION) | Slow, maintained |
| [SFTtech/abrechnung](https://github.com/SFTtech/abrechnung) | Expense splitting, events | Python FastAPI + Postgres, React + MUI | 207 | 2026-08-18 | AGPL-3.0 | Active |
| [julien-nc/cospend-nc](https://github.com/julien-nc/cospend-nc) | Expense splitting (Nextcloud app) | PHP (Nextcloud) | 327 | 2026-09-02 | AGPL-3.0 | Active |
| [TomBursch/kitchenowl](https://github.com/TomBursch/kitchenowl) | Shopping list, recipes, meal plan, expenses | Flutter (Dart) + Flask/SQLAlchemy + Socket.IO + Celery | 3,719 | 2026-09-26 | AGPL-3.0 | Active |
| [donetick/donetick](https://github.com/donetick/donetick) | Chores and rotation | Go (Gin + GORM), SQLite/Postgres; frontend in a separate repo | 2,608 | 2026-10-01 | AGPL-3.0 | Very active |
| [mealie-recipes/mealie](https://github.com/mealie-recipes/mealie) | Recipes, meal plan, shopping | Python FastAPI + SQLAlchemy, Vue/Nuxt | 13,403 | 2026-10-02 | AGPL-3.0 | Very active |
| [TandoorRecipes/recipes](https://github.com/TandoorRecipes/recipes) | Recipes, shopping, (new) inventory | Django + Vue | 8,649 | 2026-10-01 | **AGPL-3.0 + "Commons Clause"** (no right to Sell, incl. paid hosting; `recipes/LICENSE.md`) | Very active |
| [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) | Durable-goods inventory | Go + ent ORM, Vue/Nuxt, SQLite/Postgres | 7,428 | 2026-10-02 | AGPL-3.0 | Very active (community fork) |
| [hay-kot/homebox](https://github.com/hay-kot/homebox) | (original HomeBox) | Go | 3,007 | 2024-06-11 | AGPL-3.0 | **Archived/abandoned** |
| [ulsklyc/yuvomi](https://github.com/ulsklyc/yuvomi) | All-in-one family planner (tasks, shopping, pantry, budget with split costs) | Node/Express + better-sqlite3-multiple-ciphers, web-push, node-cron | 1,640 | 2026-10-01 | MIT | New (created 2026-03-24), fast-growing |
| [candiddev/homechart](https://github.com/candiddev/homechart) | Family organiser (budgets, chores, meals) | GitHub repo is docs-only (README, docs/, translations.yaml — no source) | 243 | 2026-09-23 | Not detected; code not in this repo | Active, small |
| [ccpk1/ChoreOps](https://github.com/ccpk1/ChoreOps) | Chores (Home Assistant) | Python | 431 | 2026-09-29 | GPL-3.0 | Active |
| [oliviertassinari/SplitMe](https://github.com/oliviertassinari/SplitMe) | Expense splitting | JavaScript | 157 | 2025-09-20 | MIT | Mostly dormant |
| [cryptoboid/splitio](https://github.com/cryptoboid/splitio) | Expense splitting | Svelte | 95 | 2024-09-14 | AGPL-3.0 | Likely abandoned (no push for 2 years) |
| [namaggarwal/splitwise](https://github.com/namaggarwal/splitwise) | Splitwise API SDK (not an app) | Python | 214 | 2024-05-21 | MIT | Dormant |
| "flatmate"/"roommates" topic repos (e.g. KESHAV-26-2004/FlatLedger, 360ghar/360-flatmates-app, comhendrik/hmly) | Flatmate managers | Mostly Flutter/JS student projects | ≤6 each | various | mostly none | Toy or abandoned |

Sources: GitHub API responses for each repo URL above; topic searches `topic:roommates`, `topic:flatmates`, `topic:chores`, `topic:expense-splitting`, `topic:splitwise`, `topic:pantry`, `topic:grocery-list`, `topic:household`, `topic:shared-expenses` via `gh search repos --sort stars`.

---

## Q1. Grocy: how does it model products, locations, stock, best-before dates, quantity units, shopping lists, chores, batteries and tasks? What is its stack, and where is its UX weak?

### Takeaway
Grocy is the most complete open-source model of household inventory. Each purchase is a separate stock lot (`stock` row) with its own best-before date, price and location. Every change is written to an append-only, undoable `stock_log`. Quantity units are converted through a recursive SQL closure, with product-specific factors taking priority over defaults. Consumption order is "opened first, then earliest due, then FIFO". Chores support four assignment modes, including alphabetical round-robin and "who did it least". The weaknesses are a single-tenant SQLite design (the maintainer says multi-home support is "technically unlikely"), a dated jQuery/Bootstrap 4 UI, no native push notifications, and a learning curve that users often call "overkill".

### Cited Findings

**Stack**
- PHP 8.5 with Slim 4 (routing), a forked LessQL (ORM-ish query builder), Blade templates, PHP-DI, Guzzle, `eluceo/ical` (iCal feeds) and `mike42/escpos-php` (thermal label printing). Source: `grocy/composer.json` — [composer.json](https://github.com/grocy/grocy/blob/HEAD/composer.json)
- Frontend: jQuery, Bootstrap 4, DataTables, fullcalendar, moment, chart.js and `@zxing/library` (in-browser barcode scanning). There is no SPA framework. Source: `grocy/package.json` — [package.json](https://github.com/grocy/grocy/blob/HEAD/package.json)
- Schema evolution: 258 migration files in `grocy/migrations/` (mostly `.sql`, plus a few `.php` such as `0027.php` and `0240.php`). Business logic lives heavily in SQL **views and triggers**. The final DB has roughly 37 tables and roughly 50 views, for example `stock_current`, `stock_next_use`, `quantity_unit_conversions_resolved`, `chores_current`, `uihelper_*` and `cache__*`. Source: [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)
- Services: `grocy/services/StockService.php`, `ChoresService.php`, `BatteriesService.php`, `TasksService.php`, `CalendarService.php`, `RecipesService.php` and `UserfieldsService.php` (custom fields on any entity). Source: [services/](https://github.com/grocy/grocy/tree/HEAD/services)

**Products and locations** (DDL from the rebuilt schema)
- `products` has `location_id` (default location), `shopping_location_id` (default store), `qu_id_purchase`, `qu_id_stock`, `qu_id_consume` and `qu_id_price` (four separate units per product), `min_stock_amount`, `default_best_before_days`, `default_best_before_days_after_open`, `_after_freezing` and `_after_thawing`.
  - `due_type` is 1 or 2, which separates "best before" (still usable after the date) from "expiration" (must discard).
  - It also has `parent_product_id` (one level of nesting, so generic "Rice" can have children such as "Basmati 5kg brand X"), `cumulate_min_stock_amount_of_sub_products`, `enable_tare_weight_handling`/`tare_weight`, `treat_opened_as_out_of_stock`, `quick_consume_amount`, `default_consume_location_id`, `move_on_open`, `should_not_be_frozen` and `calories`.
  - A trigger enforces one nesting level: `RAISE(ABORT, 'Unsupported product nesting level detected (currently only 1 level is supported)')`.
  - Sources: [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations); local `grocy_schema.db`
- `locations` has `name`, `is_freezer` and `active`. There are no sublocations; issue #481 "Sublocations" has been open since 2019 with 20 👍. Source: [issue #481](https://github.com/grocy/grocy/issues/481)
- `product_barcodes` has `product_id`, `barcode`, `qu_id`, `amount`, `shopping_location_id`, `last_price` and `note`. One product can have many barcodes, each implying a pack size and unit (e.g. barcode X = 1 "pack of 6"). Source: [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)

**Stock entries, best-before and journal**
- `stock` holds one row per lot: `product_id`, `amount DECIMAL(15,2)`, `best_before_date`, `purchased_date`, `stock_id` (a TEXT lot id, also used for printed labels), `price`, `open`, `opened_date`, `location_id`, `shopping_location_id` and `note`. All amounts are stored in the product's **stock** unit.
- `stock_log` is the append-only journal. It records `transaction_type`, `amount`, `best_before_date`, `used_date`, `spoiled`, `price`, `undone`/`undone_timestamp`, `correlation_id`, `transaction_id`, `stock_row_id`, `recipe_id` and `user_id NOT NULL`. Undo works per booking or per transaction (`StockService.php` ~L1496, `->where('undone = 0 AND correlation_id = :1')`). Source: [services/StockService.php](https://github.com/grocy/grocy/blob/HEAD/services/StockService.php)
- The consumption order is the view `stock_next_use`, which documents itself with the comment *"The default consume rule is: Opened first, then first due first, then first in first out. Apart from that products at their default consume location should be consumed first"*. It is implemented as `ROW_NUMBER() OVER(PARTITION BY product_id ORDER BY <default-consume-location first>, open DESC, best_before_date ASC, purchased_date ASC)`. `ConsumeProduct(...)` in `StockService.php` (L365) walks lots in this order and can substitute child products (`$allowSubproductSubstitution`). Source: [StockService.php](https://github.com/grocy/grocy/blob/HEAD/services/StockService.php)
- Due-soon and expired queries: `GetCurrentStock("WHERE best_before_date <= date('now', '$days days') AND best_before_date >= date()")` and `'WHERE best_before_date < date() AND due_type = 2'` for expired items (StockService.php ~L729–739). Opening, freezing or thawing a lot recomputes `best_before_date` from the `default_best_before_days_after_*` fields. Source: [StockService.php](https://github.com/grocy/grocy/blob/HEAD/services/StockService.php)
- `InventoryProduct(productId, newAmount, bestBeforeDate, ...)` (L915) is a stock-take that books the difference as a correction. Source: [StockService.php](https://github.com/grocy/grocy/blob/HEAD/services/StockService.php)

**Quantity units and conversions**
- `quantity_units` has `name`, `name_plural` and `plural_forms`. `quantity_unit_conversions` has `from_qu_id`, `to_qu_id`, `factor` and an optional `product_id` (NULL means a global default).
- The view `quantity_unit_conversions_resolved` is a `WITH RECURSIVE` transitive closure. It computes default closures first, then product closures with priority "Priority 1: Product-specific QU overrides" and "Priority 2: … factor of 1.0 from the stock unit to the stock unit". It prevents cycles with a path string (`c.path NOT LIKE '%/' || s.to_qu_id || '/%'`) and picks the shortest path per pair with `FIRST_VALUE(...) OVER (PARTITION BY from,to ORDER BY depth)`. The result is materialised into `cache__quantity_unit_conversions_resolved` by triggers. Source: [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)
- Changing a product's stock unit runs a trigger that rescales `stock`, `stock_log`, `shopping_list`, `recipes_pos`, `meal_plan` and `chores.product_amount` by the conversion factor. It aborts with `'qu_id_stock can only be changed when a corresponding QU conversion (old QU => new QU) exists when the product was once added to stock'`. Source: same

**Shopping lists**
- `shopping_lists` has `id` and `name UNIQUE`. `shopping_list` holds the items: `product_id` (nullable, so free-text notes are allowed), `note`, `amount`, `qu_id`, `shopping_list_id` and `done`.
- `AddMissingProductsToShoppingList($listId)` (StockService.php L21) reads `GetMissingProducts()` (stock below `min_stock_amount`) and inserts or raises the amount. This is the automatic "restock to minimum" feature, the closest match to a monthly ration list. Source: [StockService.php](https://github.com/grocy/grocy/blob/HEAD/services/StockService.php)
- There is no per-list sharing or ownership. All users see all lists, because there is one household per instance (see the multi-home finding below).

**Chores (rotation and assignment)**
- `chores` has `period_type` (`manually|hourly|daily|weekly|monthly|yearly|adaptive`), `period_interval`, `period_days`, `period_config`, `track_date_only`, `rollover`, `assignment_type`, `assignment_config` (a **comma-separated user-id string**), `next_execution_assigned_to_user_id`, `rescheduled_date`, `rescheduled_next_execution_assigned_to_user_id`, `start_date`, and `consume_product_on_execution` plus `product_id`/`product_amount` (doing the chore consumes stock, e.g. "change water filter" uses one filter).
  - `chores_log` has `tracked_time`, `done_by_user_id`, `skipped`, `undone` and `scheduled_execution_time`.
  - Sources: `ChoresService.php` L7–17; [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)
- `CalculateNextExecutionAssignment($choreId)` (ChoresService.php L19–102) works as follows:
  - **random**: `array_rand` over the assigned users.
  - **in-alphabetical-order**: sorts by `display_name`, picks the user after the last `done_by_user_id`, and wraps to the first.
  - **who-least-did-first**: picks the lowest `execution_count` from the view `chores_execution_users_statistics`, which is `COUNT(chores_log WHERE done_by_user_id = user AND undone = 0)` per assigned user.
  - **no-assignment**.
  - A one-off manual reassignment (`rescheduled_next_execution_assigned_to_user_id`) overrides the strategy.
  - Source: [services/ChoresService.php](https://github.com/grocy/grocy/blob/HEAD/services/ChoresService.php)
- `rollover=1` means an overdue chore keeps rolling to "today" rather than stacking (the `chores_current` view's `CASE WHEN x.rollover = 1 AND DATETIME('now') > next_estimated_execution_time`). Source: local `grocy_schema.db` view `chores_current`

**Batteries and tasks**
- `batteries` has `name`, `used_in` and `charge_interval_days`. `battery_charge_cycles` has `tracked_time` and `undone`. The view `batteries_current` computes the next charge date. Source: [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)
- `tasks` has `name`, `due_date`, `done`, `done_timestamp`, `category_id` and `assigned_to_user_id`. These are one-off to-dos with no recurrence (recurrence belongs to chores). Source: same

**Multi-user, permissions, barcode and notifications**
- `users` is flat (username, password, names). Permissions come from `permission_hierarchy` (name, parent) plus `user_permissions`. There is **no household/tenant id on any table**. Source: [migrations/](https://github.com/grocy/grocy/tree/HEAD/migrations)
- On issue #644 "Multiple Homes" (24 👍, closed), the maintainer (berrnd) wrote: *"Grocy has now grown over 6 years into what it is today and based on what that is, it's technically unlikely that this here, splitting everything up into 'Homes', will ever happen. Implementing that would mean kind of rewriting and rethinking everything"*. Source: [issue #644](https://github.com/grocy/grocy/issues/644)
- Barcode lookup is a plugin interface. `plugins/OpenFoodFactsBarcodeLookupPlugin.php` calls `https://world.openfoodfacts.org/api/v2/product/{barcode}?fields=product_name,image_url,...`. The OFF integration request (#158) was the top-voted issue (68 👍) and is now closed. Sources: [plugin](https://github.com/grocy/grocy/blob/HEAD/plugins/OpenFoodFactsBarcodeLookupPlugin.php); [issue #158](https://github.com/grocy/grocy/issues/158)
- Receipt OCR does **not exist**. Issue #404 "OCR shopping receipts" (30 👍) has been open since 2019-10. Source: [issue #404](https://github.com/grocy/grocy/issues/404)
- Database: SQLite only. #89 "Mysql/PostgreSQL Database option" (24 👍) is closed. Source: [issue #89](https://github.com/grocy/grocy/issues/89)
- Notifications: none native. The repo ships an iCal feed (`CalendarService.php` + `eluceo/ical`), and phone reminders come through calendar subscription or third-party clients. Source: [composer.json](https://github.com/grocy/grocy/blob/HEAD/composer.json)
- The official-ish native client is the separate project patzly/grocy-android ("ERP beyond your fridge, now on your phone"). Source: [grocy-android](https://github.com/patzly/grocy-android)

**UX weaknesses (user reports)**
- Community comments describe Grocy as "completely overkill" for meal planning and shopping lists, and as "a bit overkill if you want only a cookbook". KitchenOwl and Mealie are recommended as simpler options. Sources: [Lemmy.world "Grocery shopping apps"](https://lemmy.world/post/11033097); [SDF Chatter](https://lemmy.sdf.org/post/351462)
- AlternativeTo also lists a "steep learning curve" for new users. Source: [alternativeto Grocy](https://alternativeto.net/software/grocy/)

### Inferences
- Grocy's lot-level `stock` plus journal `stock_log` plus resolved-unit design is a strong, copyable data model for monthly bulk rations. A 25 kg rice bag bought on the 1st becomes one lot in kg with a price, and is drawn down via `quick_consume_amount`. The `purchase ≠ stock ≠ consume` unit split (bag → kg → cup) maps directly to South Asian bulk buying.
- The main things to avoid are the single-tenant schema, CSV-in-a-column assignments (`assignment_config`), logic buried in roughly 50 SQL views and triggers (hard to port to Postgres or a sync engine), and the forms-heavy desktop UI.
- Grocy has no cost-splitting at all. Prices are tracked per lot, but nobody "owes" anyone. This is the gap a flatmate app fills.

### Gaps
- I did not run the Grocy UI, so UX claims rest on community posts rather than first-hand testing.
- I did not trace the `adaptive` period algorithm in `chores_current` in full (beyond rollover).

---

## Q2. Expense splitting (Spliit, SplitPro, IHateMoney, Abrechnung, KitchenOwl, Yuvomi): data models, debt simplification, multi-currency and stack

### Takeaway
All the mainstream apps store an expense as a payer plus a set of (participant, shares or amount) rows, and derive balances on the fly. Spliit and Yuvomi now store **integer minor units**. SplitPro uses BigInt. IHateMoney and KitchenOwl still use floats. Debt simplification everywhere is the **greedy largest-creditor/largest-debtor matching** ("min cash flow", from GeeksforGeeks), applied **per currency**. Multi-currency is handled either as a per-expense conversion rate into one group currency (Spliit, IHateMoney) or as separate per-currency ledgers with explicit conversion transactions (SplitPro, Yuvomi).

### Cited Findings

**Spliit** (Next.js + tRPC + Prisma + Postgres; deps include `openai`, `html5-qrcode`, `next-s3-upload`)
- Schema (`spliit/prisma/schema.prisma`):
  - `Group{id, name, currency, currencyCode}`.
  - `Participant{id, name, groupId}`. Participants are **not user accounts**; groups are shared by link.
  - `Expense{amount Int, originalAmount Int?, originalCurrency, conversionRate Decimal?, paidById, isReimbursement, splitMode, recurrenceRule NONE|DAILY|WEEKLY|MONTHLY, documents, notes}`.
  - `ExpensePaidFor{expenseId, participantId, shares Int @default(1)}`.
  - `enum SplitMode {EVENLY, BY_SHARES, BY_PERCENTAGE, BY_AMOUNT}`.
  - `RecurringExpenseLink` (next occurrence is materialised lazily).
  - `Activity` audit log.
  - Source: [schema.prisma](https://github.com/spliit-app/spliit/blob/HEAD/prisma/schema.prisma)
- Rounding: `src/lib/shares.ts` uses **Hamilton/largest-remainder apportionment** in minor units, and breaks ties by rotating the start index with an FNV-1a hash of the expense id. In the file's own words, the hash is used to pick "which participant is offered the remaining minor unit of an uneven split… no persisted cursor, no randomness". Comments in `balances.ts` say the earlier per-participant rounding of float totals "used to break the books". Sources: [shares.ts](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/shares.ts); [balances.ts](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/balances.ts)
- Simplification: `getSuggestedReimbursements()` (balances.ts L95–126) sorts net balances. While more than one is left, it matches the first (largest creditor) with the last (largest debtor), emits `min(credit, -debt)` and drops whichever reaches zero. Source: [balances.ts](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/balances.ts)
- Multi-currency is per expense: the original amount and rate are stored and converted into the group currency. "Ability to select different currency for each transaction" (#53, 26 👍) is closed. Source: [issue #53](https://github.com/spliit-app/spliit/issues/53)
- Receipt extraction: `create-from-receipt-button-actions.ts` sends the uploaded image (`image_url`) to OpenAI with `env.OPENAI_MODEL_RECEIPT_EXTRACT` and a strict JSON schema. It is feature-flagged by `NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT` and `NEXT_PUBLIC_ENABLE_CATEGORY_EXTRACT`, and guarded against SSRF (`isAllowedUploadUrl`). Sources: [receipt action](https://github.com/spliit-app/spliit/blob/HEAD/src/app/groups/%5BgroupId%5D/expenses/create-from-receipt-button-actions.ts); [env.ts](https://github.com/spliit-app/spliit/blob/HEAD/src/lib/env.ts)
- Top issues:
  - Recurring expenses (#5, 32 👍): closed.
  - Optional authentication (#257, 25 👍): open.
  - Open API (#117, 23 👍): open.
  - User accounts (#76, 21 👍): open.
  - Better PWA (#79, 18 👍): open.
  - Encryption at rest (#34, 17 👍): open.
  - Source: [Spliit issues](https://github.com/spliit-app/spliit/issues?q=sort%3Areactions-%2B1-desc)

**SplitPro** (Next.js pages + tRPC + Prisma + Postgres with `pg_cron`; next-auth (email/OAuth); `web-push`; Serwist PWA; `plaid` + `nordigen-node` bank import)
- Schema (`split-pro/prisma/schema.prisma`):
  - `User{currency, defaultCurrency, bankingId, ...}`.
  - `Group{publicId, defaultCurrency, simplifyDebts Boolean @default(false), archivedAt, splitwiseGroupId}`.
  - `Expense{paidBy, addedBy, amount BigInt, currency, splitType, expenseDate, fileKey, deletedAt/deletedBy (soft delete), transactionId (bank txn), recurrenceId, conversionToId (self-relation "CurrencyConversion")}`.
  - `ExpenseParticipant{userId, expenseId, amount BigInt}`. The signed per-user amount is stored, not shares.
  - `enum SplitType {EQUAL, PERCENTAGE, EXACT, SHARE, ADJUSTMENT, SETTLEMENT, CURRENCY_CONVERSION}`.
  - `GroupDefaultSplit` / `FriendDefaultSplit` (stored default shares).
  - `CachedCurrencyRate{from,to,date,rate}`, `ExpenseRecurrence{jobId}` and `PushNotification{endpoint, subscription}`.
  - Source: [schema.prisma](https://github.com/oss-apps/split-pro/blob/HEAD/prisma/schema.prisma)
- Balances come from a SQL view, `prisma/views/public/BalanceView.sql`. It normalises each pair to `(min(userId,paidBy), max(...))` and sums `ep.amount * ±1` grouped by pair, `groupId` and `currency`, ignoring soft-deleted expenses. This gives **pairwise** balances, as Splitwise does. Source: [BalanceView.sql](https://github.com/oss-apps/split-pro/blob/HEAD/prisma/views/public/BalanceView.sql)
- Simplification: `src/lib/simplify.ts` splits by currency, builds an n×n BigInt adjacency matrix, computes net amounts and runs `minCashFlow`. The code comment says it is "based on https://www.geeksforgeeks.org/minimize-cash-flow-among-given-set-friends-borrowed-money/", using max-credit/max-debit queues. It is opt-in per group. Source: [simplify.ts](https://github.com/oss-apps/split-pro/blob/HEAD/src/lib/simplify.ts)
- Recurring expenses are pg_cron jobs: `cron.schedule($1, $2, $$ SELECT duplicate_expense_with_participants('<id>'::UUID); $$)` in `src/server/api/services/scheduleService.ts`. Source: [scheduleService.ts](https://github.com/oss-apps/split-pro/blob/HEAD/src/server/api/services/scheduleService.ts)
- Top issues:
  - Recurring expense (#160): closed.
  - **Offline mode (#105, 13 👍): open.**
  - Edit expense (#59/#74): closed.
  - OIDC (#148): closed.
  - Default split method per group (#373): closed.
  - Splitwise import 2.0 (#307): open.
  - Source: [SplitPro issues](https://github.com/oss-apps/split-pro/issues?q=sort%3Areactions-%2B1-desc)

**IHateMoney** (Flask + SQLAlchemy + sqlalchemy-continuum versioning)
- `Project{id (slug), password, default_currency}` (one project is one shared password, with no per-user accounts), `Person{weight Float default 1, activated}` (a **per-member** weight, not per-bill), and `Bill{payer_id, amount Float, original_currency, converted_amount Float, bill_type, owers (M2M), archive}`.
- The balance is `ower.weight * bill.converted_amount / total_weight` (models.py ~L136–147).
- Source: [models.py](https://github.com/spiral-project/ihatemoney/blob/HEAD/ihatemoney/models.py)
- Settling delegates to the external `debts` PyPI package (`from debts import settle`). `pyproject.toml` pins it with the comment `"debts~=0.5",  # Last update : 2019`. Source: [pyproject.toml](https://github.com/spiral-project/ihatemoney/blob/HEAD/pyproject.toml)
- FX: `currency_convertor.py` uses `https://api.exchangerate.host/latest?base=USD`. Related issues are #1229 "Unable to add any new bills due to lack of default currency" and #1232 "Currencies: rework or remove?" (open). Sources: [currency_convertor.py](https://github.com/spiral-project/ihatemoney/blob/HEAD/ihatemoney/currency_convertor.py); [#1232](https://github.com/spiral-project/ihatemoney/issues/1232)
- Top open request: "Split bill by amount or percentage" (#471, 23 👍, open since 2019). It cannot do unequal per-bill splits beyond member weights. Recurring bills (#152) have been open since 2016. Sources: [#471](https://github.com/spiral-project/ihatemoney/issues/471); [#152](https://github.com/spiral-project/ihatemoney/issues/152)

**Abrechnung** (FastAPI + Postgres + React/MUI)
- It has **clearing accounts**: `account_type 'clearing'` plus `clearing_account_share(account_id, revision_id, share_account_id, shares)` in `abrechnung/database/revisions/0010_clearing_accounts.sql`. These are "events" that collect costs and redistribute them to members, which suits "monthly ration pool" style splitting.
- It also offers revisioned (versioned) transactions, positions (line items), viewer/editor/owner permissions, multiple currencies with per-group rates, offline draft saving, and math-expression input.
- Sources: [0010_clearing_accounts.sql](https://github.com/SFTtech/abrechnung/blob/HEAD/abrechnung/database/revisions/0010_clearing_accounts.sql); [README](https://github.com/SFTtech/abrechnung/blob/HEAD/README.md)

**KitchenOwl expenses**
- `Expense{amount Float, paid_by_id, household_id, category_id, photo, exclude_from_statistics}` and `ExpensePaidFor{expense_id, user_id, factor Int}`.
- A **denormalised** `HouseholdMember.expense_balance Float` is recalculated by `service/recalculate_balances.py`.
- There is no currency field in the models (`grep currency models/` returned nothing).
- Sources: [expense.py](https://github.com/TomBursch/kitchenowl/blob/HEAD/backend/app/models/expense.py); [household.py](https://github.com/TomBursch/kitchenowl/blob/HEAD/backend/app/models/household.py)

**Yuvomi** (new, MIT)
- `server/services/split-expenses.js` parses money into minor units with an explicit ISO-4217 table. Its comments warn not to use CLDR/`Intl` for storage precision.
- `simplifyDebts(balanceRows)` groups by currency and matches debtors against creditors sorted by `user_id`, using a two-pointer loop that transfers `min(debtor.remaining, creditor.remaining)` (L140–180). This is greedy with deterministic ordering, not largest-first, and is still at most n−1 transfers.
- Tables include `expense_groups`, `expense_splits` and `split_expense_guest_users`. Guest (non-account) members can join a split.
- Source: [split-expenses.js](https://github.com/ulsklyc/yuvomi/blob/HEAD/server/services/split-expenses.js)

### Inferences
- The greedy "largest creditor pays largest debtor" heuristic guarantees at most n−1 transfers but is not guaranteed minimal. The true minimum is NP-hard (subset-sum partitioning). For a flat of 3–8 people the greedy result is fine, and an exact search over subsets is also feasible at that size.
- For a South Asian flat paying in INR/BDT/PKR (mostly a single currency), the Spliit pattern is enough: integer minor units (or whole rupees), Hamilton apportionment with rotating remainder, per-expense optional FX, and greedy settle. SplitPro's pairwise view and BigInt are useful if friend-to-friend debts outside the flat matter.
- Two good models for a "monthly ration pool" are Abrechnung's clearing account and Spliit's `BY_SHARES` with weights (e.g. someone away for 10 days gets a smaller share).

### Gaps
- I did not read the `debts` library source, so its exact algorithm is unverified.
- I did not clone or read Cospend's (Nextcloud) data model.
- The original Splitwise is closed source. I found no high-star, faithful "Splitwise clone" beyond SplitPro (topic results such as tuzup/SplitApp have 69★ and look like hobby projects).

---

## Q3. Other repos: KitchenOwl, Mealie, Tandoor, HomeBox, Donetick, Homechart, Yuvomi, chore apps and flatmate repos

### Takeaway
No single open-source project covers all four features well for flatmates.
- **KitchenOwl** is the best multi-household shopping list (real-time, Flutter apps, expenses), but it has no pantry or expiry.
- **Donetick** is the best chore engine (seven assignment strategies, rolling vs fixed schedules, points, approvals, notifications).
- **Tandoor** recently added inventory with expiry.
- **Mealie** tracks only an "on hand" flag.
- **HomeBox** is for durable goods (warranty, serials), not food.
- **Yuvomi** (new in 2026) is the closest all-in-one, bundling pantry, shopping, tasks and split budget.
- Dedicated "flatmate/roommate" repos on GitHub are all toy projects (≤6★).

### Cited Findings

**KitchenOwl** (Flutter client + Flask/SQLAlchemy backend, Socket.IO, Celery)
- Model:
  - `Household{name, language, planner_feature, expenses_feature, view_ordering}` and `HouseholdMember{household_id, user_id, owner, admin, expense_balance}`. This is **true multi-household**: one user can be in many households.
  - `Item{name, icon, category_id, household_id, ordering, support}`.
  - `Shoppinglist{name, household_id}` and `ShoppinglistItems{shoppinglist_id, item_id, description, created_by}`.
  - Sources: [household.py](https://github.com/TomBursch/kitchenowl/blob/HEAD/backend/app/models/household.py); [item.py](https://github.com/TomBursch/kitchenowl/blob/HEAD/backend/app/models/item.py); [shoppinglist.py](https://github.com/TomBursch/kitchenowl/blob/HEAD/backend/app/models/shoppinglist.py)
- Smart features are background jobs (`backend/app/jobs/`):
  - `cluster_shoppings.py` clusters "item dropped (checked off)" history timestamps with **1-D DBSCAN** (`eps = 600` seconds, `min_samples = 5`) to detect shopping trips.
  - `item_ordering.py` builds a pairwise ordering matrix from each trip and **topologically sorts** it to learn the store-aisle order (`Item.ordering`).
  - `item_suggestions.py` runs **apriori** association rules (`mlxtend`, `min_support=0.001, max_len=2`) to suggest "you usually also buy…" (`Item.support`, antecedents/consequents).
  - Sources: [jobs/](https://github.com/TomBursch/kitchenowl/tree/HEAD/backend/app/jobs)
- Real-time: `flask_socketio` (`sockets/shoppinglist_socket.py`) and `socket_io_client` in Flutter's `pubspec.yaml`. Real-time sync (#118) is closed as implemented. Source: [issue #118](https://github.com/TomBursch/kitchenowl/issues/118)
- Pantry is missing. "Feature request: Integrated Pantry List" (#10) has been open since 2022-02. Other open requests: images on items (#123, 18 👍), Mealie integration (#90, 18 👍) and Tandoor integration (#97). Sources: [#10](https://github.com/TomBursch/kitchenowl/issues/10); [#123](https://github.com/TomBursch/kitchenowl/issues/123)

**Mealie** (FastAPI + SQLAlchemy, Vue)
- Group → Household hierarchy (the `households` table, unique on `(group_id, name)`).
- Shopping lists: `ShoppingListItem{quantity, unit_id, food_id, label_id, checked, position, is_ingredient}` plus recipe references (each list item remembers which recipe and scale added it).
- Pantry is only `IngredientFoodModel.on_hand Boolean` plus `households_with_ingredient_food` (M2M). There are no quantities and no expiry.
- Sources: [shopping_list.py](https://github.com/mealie-recipes/mealie/blob/HEAD/mealie/db/models/household/shopping_list.py); [ingredient.py](https://github.com/mealie-recipes/mealie/blob/HEAD/mealie/db/models/recipe/ingredient.py)

**Tandoor** (Django + Vue; last commit 2026-09-30; licence AGPL-3.0 with a Commons Clause, so it cannot be sold or offered as paid hosting — [LICENSE.md](https://github.com/TandoorRecipes/recipes/blob/HEAD/LICENSE.md))
- Multi-tenant: `Space` scopes everything, `Household(name, space)` and `UserSpace.household`.
- `UnitConversion{base_amount, base_unit, converted_amount, converted_unit, food (optional), open_data_slug}`. Food-specific conversion, as in Grocy, plus a shared "open data" dataset.
- **New inventory**:
  - `InventoryLocation{name, is_freezer, household}`.
  - `InventoryEntry{inventory_location, sub_location, code (unique per space, for labels), amount Decimal(32,16), unit, food, expires Date, note}`.
  - `InventoryLog{booking_type add|remove|move, old_amount, new_amount, old/new_inventory_location}`.
- Also `Food.onhand_users` (M2M) and `SupermarketCategory`/`Supermarket` (aisle ordering per store).
- Source: [cookbook/models.py](https://github.com/TandoorRecipes/recipes/blob/HEAD/cookbook/models.py) (local L568, L909, L1362–1420)

**HomeBox** (Go + ent; the sysadminsmedia fork is the live one, the original hay-kot repo is archived)
- The schema has been refactored to a generic `entity`/`entity_type` (merging locations and items, per #251, closed). Fields include `quantity`, `serial_number`, `model_number`, `manufacturer`, `lifetime_warranty`, `warranty_expires`, `purchase_date/from/price`, `sold_*`, `insured` and `is_location`.
- Top issues: OIDC SSO (#6, 86 👍, closed), maintenance plans (#172, 34 👍, open) and user/account management (#439, 22 👍, open).
- Sources: [ent schema](https://github.com/sysadminsmedia/homebox/tree/HEAD/backend/internal/data/ent/schema); [#172](https://github.com/sysadminsmedia/homebox/issues/172)
- It suits assets (fridge, AC, gas cylinder) but not consumables.

**Donetick** (Go/Gin/GORM, SQLite or Postgres; frontend in a separate repo, with only `frontend/dist` vendored)
- `Chore` has:
  - `FrequencyType` (daily/weekly/monthly/yearly/adaptive/custom, `day_of_the_month`, `days_of_the_week`, `interval`), `FrequencyMetadataV2` (JSON) and `NextDueDate`.
  - `IsRolling` (schedule from completion date rather than due date).
  - `AssignedTo`, `Assignees[]` and `AssignStrategy`.
  - `CircleID` (a circle is a household), `Points`, `RequireApproval`, `CompletionWindow`, `SubTasks`, `IsPrivate`, `ProjectID` and `SyncVersion` (for incremental sync).
  - Source: [model.go](https://github.com/donetick/donetick/blob/HEAD/internal/chore/model/model.go)
- Assignment strategies (`model.go` L37–46; logic in `handler.go` `checkNextAssignee`, ~L4002–4140):
  - `random`
  - `least_assigned` (counts history `AssignedTo`)
  - `least_completed` (counts `CompletedBy`, current assignees only)
  - `keep_last_assigned`
  - `random_except_last_assigned`
  - `round_robin` (next index after the current assignee)
  - `no_assignee`
  - "Anyone" chores (empty assignees) rotate across the whole circle so notifications still fire.
  - Source: [handler.go](https://github.com/donetick/donetick/blob/HEAD/internal/chore/handler.go)
- Scheduling: in `scheduler.go`, `IsRolling` sets `baseDate = completedDate`. It has explicit handling so that completing a day-of-month chore early does not reschedule back onto the same date. The README says adaptive scheduling "learns from historical completions". Sources: [scheduler.go](https://github.com/donetick/donetick/blob/HEAD/internal/chore/scheduler.go); [README](https://github.com/donetick/donetick/blob/HEAD/README.md)
- Notifications: `internal/notifier/service/{telegram,discord,pushover,fcm}` plus a planner. Real-time: `internal/realtime/` (WebSocket broadcaster, connection pool, rate limiter, polling fallback) and `internal/sync/`. Also "Things" (IoT/Home Assistant triggers) and points. Source: [internal/](https://github.com/donetick/donetick/tree/HEAD/internal)
- Top issues are mostly operational: disable signup (#212), SSO UX (#438), 24h time (#245), Android widget (#387), OIDC on mobile (#371), translation (#251) and **iOS PWA notifications unavailable** (#269). Source: [Donetick issues](https://github.com/donetick/donetick/issues?q=sort%3Areactions-%2B1-desc)

**Yuvomi** (Node/Express + SQLCipher-capable SQLite; created 2026-03-24, 1,640★)
- Its README lists 20 modules: tasks (recurring, multi-assignment, points or rewards), shared aisle-sorted shopping, pantry, budget with "shared costs with debt simplification", and optional AES-256 DB encryption.
- "The last jar out of the pantry goes on the list with one tap. After the shop, one button books what you ticked off back into the pantry."
- `pantry_items{name, quantity REAL, unit TEXT (validated in app code against public/utils/pantry-units.js), location_id ON DELETE SET NULL, category, expires_on (NULL = never), min_quantity}` and `pantry_locations` (seeded in German: Vorratsschrank, Kühlschrank, Gefrierschrank, Keller).
- Sources: [README](https://github.com/ulsklyc/yuvomi/blob/HEAD/README.md); [server/db.js](https://github.com/ulsklyc/yuvomi/blob/HEAD/server/db.js) (local ~L4526–4560)

**Homechart**
- README: "Plan events, meals, chores… Link your budgets, projects, and shopping lists… Supports extended, divorced, and blended families". Latest release notes are v2026.09. The GitHub API detects no licence or primary language; the README points to "Open Source Details" at candid.dev. Source: [candiddev/homechart](https://github.com/candiddev/homechart)

**Chore and flatmate long tail**
- `topic:chores` is dominated by Home Assistant integrations: ccpk1/ChoreOps (431★), ad-ha/kidschores-ha (368★), prestomation/ha-home-keeper (103★).
- `topic:flatmates`/`roommates` has only toy repos: SplitMe 157★ (dormant), FlatLedger 3★, LazyRoommate 9★ (2018), room538 6★ (2018).
- Source: GitHub topic search results ([topic:chores](https://github.com/topics/chores), [topic:roommates](https://github.com/topics/roommates), [topic:flatmates](https://github.com/topics/flatmates))

### Inferences
- The flatmate niche (shared rations, cost split and duty roster in one app) is **unserved** in open source. Existing tools are family-oriented (Yuvomi, Homechart, ChoreOps), assuming one budget and parents/kids roles, or single-purpose.
- KitchenOwl's DBSCAN plus topological-sort aisle learning and apriori suggestions are cheap, high-value ideas to copy for a "monthly ration list" that learns what the flat usually buys together.

### Gaps
- Homechart's GitHub repo holds only README, docs/ and translations.yaml (checked via `gh api repos/candiddev/homechart/contents`), so its source and licence could not be inspected.
- I found no well-maintained open-source equivalent of OurGroceries (a simple real-time shared list). KitchenOwl is the closest.

---

## Q4. How does each handle multi-user households, real-time sync, notifications, barcode scanning (OpenFoodFacts) and receipt OCR?

### Takeaway
- Multi-household tenancy exists in KitchenOwl, Mealie, Tandoor, Donetick (circles) and SplitPro (groups), but not in Grocy.
- Real-time sync exists only in KitchenOwl (Socket.IO) and Donetick (WebSockets plus a sync version).
- Push notifications exist in SplitPro and Yuvomi (Web Push) and in Donetick (FCM, Telegram, Discord, Pushover).
- OpenFoodFacts barcode lookup is native only in Grocy.
- Receipt OCR exists only in Spliit, via an OpenAI vision call. It is Grocy's second most-requested open feature.

### Cited Findings

| App | Multi-household | Real-time | Notifications | Barcode / OFF | Receipt OCR | Offline |
|---|---|---|---|---|---|---|
| Grocy | No (one instance = one home; #644) | No | iCal feed only | Yes: `@zxing/library` + OFF plugin | No (#404 open) | No (web) |
| KitchenOwl | Yes (`HouseholdMember`) | Socket.IO | Not found in backend grep | No (Flutter deps show no scanner) | No | Flutter app caches (not verified) |
| Spliit | Link-shared groups, no accounts | No | No | QR code scanner only (`html5-qrcode`, group sharing) | Yes (OpenAI vision, feature flag) | PWA (#79 asks for better) |
| SplitPro | Accounts + groups + friends | No | Web Push (`web-push`, `PushNotification` table) | No | No | Requested (#105 open) |
| IHateMoney | Project + shared password | No | No | No | No | No |
| Donetick | Circles + roles (admin/manager/member, OIDC groups) | WebSocket + polling + `SyncVersion` | FCM, Telegram, Discord, Pushover | No | No | Mobile apps |
| Tandoor | Space → Household | No (not observed) | Not checked | Not found in grep | No | No |
| Yuvomi | Family users, guest split members | Not verified | `web-push`, `node-cron`, `nodemailer` | Not verified | Not verified | Not verified |

Sources:
- Grocy: [#644](https://github.com/grocy/grocy/issues/644), [OFF plugin](https://github.com/grocy/grocy/blob/HEAD/plugins/OpenFoodFactsBarcodeLookupPlugin.php), [package.json](https://github.com/grocy/grocy/blob/HEAD/package.json), [#404](https://github.com/grocy/grocy/issues/404)
- KitchenOwl: [config.py](https://github.com/TomBursch/kitchenowl/blob/HEAD/backend/app/config.py), [pubspec.yaml](https://github.com/TomBursch/kitchenowl/blob/HEAD/kitchenowl/pubspec.yaml)
- Spliit: [qr-code-scanner.tsx](https://github.com/spliit-app/spliit/blob/HEAD/src/components/qr-code-scanner.tsx)
- SplitPro: [package.json](https://github.com/oss-apps/split-pro/blob/HEAD/package.json), [#105](https://github.com/oss-apps/split-pro/issues/105)
- Donetick: [notifier](https://github.com/donetick/donetick/tree/HEAD/internal/notifier/service), [realtime](https://github.com/donetick/donetick/tree/HEAD/internal/realtime)
- Yuvomi: [package.json](https://github.com/ulsklyc/yuvomi/blob/HEAD/package.json)

- Spliit's OCR is LLM-based, not Tesseract. An image is uploaded to S3 and its URL sent to OpenAI chat completions with a strict JSON schema; the same mechanism also extracts a category. Source: [receipt action](https://github.com/spliit-app/spliit/blob/HEAD/src/app/groups/%5BgroupId%5D/expenses/create-from-receipt-button-actions.ts)
- SplitPro imports **bank transactions** (Plaid, GoCardless/Nordigen) as a substitute for receipt entry (`Expense.transactionId`, `CachedBankData`). Source: [schema.prisma](https://github.com/oss-apps/split-pro/blob/HEAD/prisma/schema.prisma)
- Donetick's issue #269 "Device notifications on iOS Progressive Web App unavailable" shows the PWA push limits on iOS. Source: [#269](https://github.com/donetick/donetick/issues/269)

### Inferences
- For South Asian rations (loose rice, dal and atta from a kirana store, often unbarcoded), barcode/OFF is lower value than in Europe. A product catalogue of common staples with default units (kg, L, packet) plus fast manual entry and LLM receipt or handwritten-bill parsing (Spliit-style) is likely more useful.
- Real-time sync matters mostly for the shopping list while one flatmate is in the store. KitchenOwl's Socket.IO room-per-household or Donetick's `SyncVersion` incremental pull are both simple to copy.

### Gaps
- I found no source on OpenFoodFacts coverage of Indian, Bangladeshi or Pakistani grocery barcodes. I did not verify this.
- I did not check Mealie's and Tandoor's notification and webhook support in depth (Mealie has a `webhooks.py` model under household).

---

## Q5. What to copy, what to avoid, and which GitHub issues show common requests and complaints?

### Takeaway
Copy the following:
- Grocy's lot/journal/unit-conversion inventory model and "restock below minimum" shopping auto-fill.
- Spliit's integer-minor-unit Hamilton apportionment with a greedy settle-up.
- Donetick's assignment-strategy enum, rolling vs fixed schedule, and points.
- KitchenOwl's household tenancy, real-time list and learned aisle order.

Avoid single-tenant schemas, float money, CSV-in-column relations, logic hidden in dozens of SQL views, link-only groups with no accounts, and desktop-first forms.

Recurring requests across trackers:
- **Recurring expenses** (Spliit #5 32👍; SplitPro #160; IHateMoney #152)
- **Auth/OIDC/accounts** (Spliit #257, #76; SplitPro #148; KitchenOwl #32; HomeBox #6 86👍; Donetick #438)
- **Receipt OCR** (Grocy #404)
- **Pantry in shopping apps** (KitchenOwl #10)
- **Multiple homes** (Grocy #644)
- **Offline mode** (SplitPro #105)
- **Unequal splits** (IHateMoney #471)
- **Native widgets/notifications** (Donetick #387, #269)

### Cited Findings
- Grocy top issues:
  - OFF integration #158: 68 👍, closed.
  - OCR receipts #404: 30 👍, open.
  - Multiple homes #644: 24 👍, closed as won't-do.
  - Sublocations #481: 20 👍, open.
  - "Multiple products for chores" #1886: 19 👍, open.
  - Source: [Grocy issues](https://github.com/grocy/grocy/issues?q=sort%3Areactions-%2B1-desc)
- Spliit: recurring #5 (32), per-transaction currency #53 (26), optional auth #257 (25), open API #117 (23), user accounts #76 (21), PWA #79 (18), encryption at rest #34 (17). Source: [Spliit issues](https://github.com/spliit-app/spliit/issues?q=sort%3Areactions-%2B1-desc)
- SplitPro: recurring #160 (13), offline #105 (13), edit expense #59 (10), OIDC #148 (10), maintainers wanted #213 (10). Source: [SplitPro issues](https://github.com/oss-apps/split-pro/issues?q=sort%3Areactions-%2B1-desc)
- KitchenOwl: OIDC #32 (18), images on items #123 (18), Mealie integration #90 (18), step-by-step recipes #206 (14), custom icons #293 (14), real-time sync #118 (10, closed), pantry #10 (9, open). Source: [KitchenOwl issues](https://github.com/TomBursch/kitchenowl/issues?q=sort%3Areactions-%2B1-desc)
- IHateMoney: split by amount or percentage #471 (23, open since 2019), recurring bills #152 (open since 2016), currencies "rework or remove?" #1232. Source: [IHateMoney issues](https://github.com/spiral-project/ihatemoney/issues?q=sort%3Areactions-%2B1-desc)
- HomeBox: OIDC #6 (86), maintenance plans #172 (34), account management #439 (22). Source: [HomeBox issues](https://github.com/sysadminsmedia/homebox/issues?q=sort%3Areactions-%2B1-desc)
- Donetick: disable signup #212 (18), SSO UX #438 (17), 24h time #245 (16), Android widget #387 (14), iOS PWA notifications #269 (11). Source: [Donetick issues](https://github.com/donetick/donetick/issues?q=sort%3Areactions-%2B1-desc)

### Inferences
**Copy:**
- (a) Lot-based stock (`stock` rows with `best_before_date`, `price`, `location`) plus an append-only `stock_log` with `correlation_id`/`transaction_id` for undo.
- (b) A FEFO consume order: opened → earliest due → FIFO.
- (c) Purchase, stock and consume units per product, plus product-specific conversion factors that override globals.
- (d) `min_stock_amount` → automatic monthly ration list.
- (e) Chore assignment strategies from Donetick's enum: round_robin, least_completed, random_except_last, plus a one-off reassign or skip, as in Grocy's `rescheduled_next_execution_assigned_to_user_id` and `skipped`.
- (f) Rolling vs fixed schedules.
- (g) Integer minor units with Hamilton apportionment and a hash-rotated remainder (Spliit).
- (h) Per-currency greedy settle-up (SplitPro/Yuvomi).
- (i) An `Activity` audit log for trust between flatmates.
- (j) A Grocy-style "chore consumes product" link, e.g. "refill water can" decrements stock.
- (k) The Yuvomi loop of pantry → list → bought → back into pantry.

**Avoid:**
- Grocy's no-tenant schema and SQLite-only design.
- `assignment_config` as a comma-separated string.
- Float money (IHateMoney, KitchenOwl).
- IHateMoney's shared-password projects and per-member weights only (no per-bill shares).
- Spliit's accountless groups for a long-lived flat (the auth and accounts requests show users want identity).
- Relying on iOS PWA for push.
- Free FX APIs that disappear (IHateMoney #1229/#1232).

**Flatmate-specific gap no repo fills:** linking the **cost of a ration lot** to the split. One flatmate buys the monthly bulk ration, the cost becomes a shared expense, and consumption is optionally attributed. Grocy has prices but no split; the split apps have no inventory. Yuvomi and KitchenOwl hold both, but as separate modules.

### Gaps
- r/selfhosted threads could not be fetched directly (search returned Lemmy and AlternativeTo instead). Community sentiment here rests on Lemmy and AlternativeTo snippets and is thin.
- Issue 👍 counts are a point-in-time snapshot (2026-10-02) and are biased toward older issues.
