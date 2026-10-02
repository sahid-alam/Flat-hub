# Algorithms, Data Integrations and Modern Stack for a Flatmate Household Management App (+ shared POS concepts)

Research date: 2026-10-02. South Asian context (INR/BDT, UPI/bKash, monthly bulk ration buying).
Note on sourcing: items under "Cited Findings" were seen in fetched pages or search results this session. Standard algorithmic/design content that I could not tie to a fetched source is placed under "Inferences" as design recommendations, not as facts.

## 1. Expense splitting: split modes, debt simplification, rounding, multi-currency, recurring bills, settlement, UPI/bKash links

### Takeaway
Minimizing the number of settlement transactions is NP-complete (reduction from Subset Sum), so every practical app uses a heuristic: the greedy "largest debtor pays largest creditor" algorithm, which needs at most n-1 transfers for n non-zero balances. UPI payment can be launched with a documented `upi://pay?pa=&pn=&am=&cu=INR&tn=` deep link; no public P2P deep-link scheme for bKash send-money was found.

### Cited Findings
- Deciding whether a group's debts can be settled in at most E transactions is NP-complete; proof reduces Subset Sum (S integers, target T) to a Splitwise instance with S borrowers and two lenders with balances -T and T - sum(p), E = S. The author notes Splitwise uses "a greedy algorithm that pays one lender at a time" — fast but suboptimal on larger instances. — [Anton Cao, The Splitwise Problem](https://antoncao.me/blog/splitwise)
- Greedy heuristic description: repeatedly pick the largest creditor and largest debtor, transfer min(credit, debt), drop whichever hits zero; for n non-zero balances this never needs more than n-1 transactions; not provably minimal. — [expense-splitter (GitHub)](https://github.com/pastbologanesh0101/expense-splitter); [Simplify Splitwise Debts Fast](https://splitwise-simplify-debts.pages.dev/posts/splitwise-simplify-debts/)
- Other third-party writeups frame Splitwise's "simplify debts" as a max-flow (Ford–Fulkerson/Dinic) problem on the existing debt graph, noting max-flow guarantees correct settlement but minimal edge count needs extra heuristics. — [dev.to: Ford–Fulkerson via Splitwise](https://dev.to/ayush-k-anand/i-finally-understood-ford-fulkerson-by-solving-splitwises-simplify-debts-2dnp); [Medium: Algorithm Behind Splitwise's Debt Simplification](https://medium.com/@mithunmk93/algorithm-behind-splitwises-debt-simplification-feature-8ac485e97688) (403 on fetch; seen only as search result). CONFLICT: Cao says greedy, these say max-flow; no primary Splitwise engineering post was found, so Splitwise's actual algorithm is unconfirmed.
- The exact-minimum variant is the LeetCode problem 465 "Optimal Account Balancing" (backtracking/bitmask over net balances). — [DesignGurus: 465 Optimal Account Balancing](https://www.designgurus.io/answers/detail/465-optimal-account-balancing-nsa783)
- UPI deep link format: `upi://pay?param=value&...`; parameters `pa` (payee VPA), `pn` (payee name), `am` (amount, decimal), `cu` (currency — "Currently ONLY INR is supported"), `tn` (note), `tr` (transaction reference; mandatory for merchant/dynamic), `mc` (merchant code), `tid`, `url`. Example: `upi://pay?pa=merchant@upi&pn=Chai%20Shop&am=50.00&cu=INR&tn=Tea%20and%20samosa&tr=TXN20260415001`. — [NPCI UPI Deep Linking spec (GitHub wiki mirror, not NPCI itself)](https://github.com/bgagan911/RandomDocs/wiki/NPCI-UPI---Specifications-for-Deep-Linking); [dvaarik: upi://pay explained](https://www.dvaarik.com/blog/upi-payment-link-deep-linking-india)
- UPI deep links/QR intents are an abuse vector (attackers craft payment intents), so links should be generated only for verified payee VPAs. — [Medium: UPI/QR Deep-Link Abuse](https://medium.com/@aryan.dcgpt/upi-qr-deep-link-abuse-how-attackers-exploit-payment-intents-and-how-to-stop-them-362e1e07c8f9)
- bKash integration material found is merchant-side (checkout with amount, invoice number, callback URL, intent URL to open the app); bKash consumer features include Send Money and Group Send Money. — [LinkedIn: bKash Payment Integration with App](https://www.linkedin.com/pulse/bkash-payment-integration-app-monotosh-roy); [bKash Send Money](https://www.bkash.com/en/products-services/send-money)

### Inferences
- Data model: store every expense as `expense(id, payer_id(s), total_minor, currency, split_type)` + `expense_share(user_id, owed_minor)`. All split types (equal, exact, percentage, shares, itemized) reduce to computing `owed_minor` per user at write time; store the computed shares, not just the rule, so later member changes don't rewrite history. Net balance per user = sum(paid) - sum(owed) - settlements; balances always sum to zero (assert this).
- Rounding: use integer minor units (paisa/poisha). For equal/percent/shares splits use the largest-remainder (Hamilton) method: floor each share, then distribute the leftover 1-minor-unit remainders to the members with the largest fractional parts (tie-break deterministically, e.g. by user id or rotating), so shares sum exactly to the total. Itemized split = per-item exact allocation + proportional allocation of tax/tip/discount using the same remainder method.
- Debt simplification: run greedy on net balances (O(n log n) with two heaps). For a flat of 3–8 people, an exact solver is also feasible: the minimum number of transfers equals n minus the maximum number of disjoint zero-sum subgroups of non-zero balances, computable by bitmask DP over 2^n subsets (n ≤ ~15). This characterization is standard but was not verified against a fetched source this session. Offer a "simplify debts" toggle (Splitwise UX) since simplified transfers can create payer→payee pairs that never had a direct expense.
- Settlement tracking: record a `settlement(from, to, amount_minor, method: upi|bkash|cash, external_ref, status: pending|confirmed)`; payer marks "paid", receiver confirms. The app cannot verify a UPI/bKash P2P payment without a PSP/merchant integration, so confirmation is social, not cryptographic.
- UPI button: build `upi://pay?pa={payee_vpa}&pn={name}&am={amount.toFixed(2)}&cu=INR&tn={FlatHub settle Oct}`; on desktop show the same string as a QR. For bKash, show the payee's bKash number with a copy button + amount; do not invent a `bkash://` scheme.
- Multi-currency: store original currency + amount on each expense and an FX rate snapshot at entry; compute balances per currency and only convert on settlement (avoids balances drifting with FX). For an INR/BDT household this is a low-priority edge case.
- Recurring bills (rent, Wi-Fi, maid, gas cylinder): a `recurring_template(rrule, split rule)` materialized by a scheduled job (e.g. pg_cron / scheduled function) into normal expenses at period start.

### Gaps
- No primary Splitwise engineering source on its exact algorithm; GeeksforGeeks min-cash-flow page not fetched this session.
- No public bKash P2P deep-link / URI scheme found; bKash developer docs (Tokenized Checkout) not fetched. Nagad/Rocket not researched.
- No source gathered on how existing roommate apps handle multi-currency or recurring bills.

## 2. Consumption-based splitting (mess "meal rate"), personal vs shared items, per-item logging

### Takeaway
The South Asian bachelor-mess model is well established and implemented by many Bangladeshi apps: meal rate = total bazar cost / total meals; each member pays meals_eaten × meal_rate minus their deposits/bazar spending. This is a distinct split mode from equal splitting and should be first-class.

### Cited Findings
- Formula: Total Bazar Cost ÷ Total Meals = Meal Rate. — [Bachelor Mess Meal Rate Calculator BD](https://studentmealcalculator.convertertoolsai.com/)
- Mess Mate (Bangladesh) "tracks meals, deposits and bazar costs, auto-calculates the meal rate, and settles the month fairly for every member on Android and the web." — [Mess Mate](https://messmate.bd/en)
- MessBuddy "tracks meals, rotates the bazar, splits bills and settles up in one shared ledger." — [MessBuddy](https://messbuddy.org/)
- Other existing mess apps: Smart Mess Manager (auto total cost, current meal rate, per-member expense), Bachelors' Meal Manager, BD Mess, Mess Monitor; an open-source example exists. — [Smart Mess Manager (Play)](https://play.google.com/store/apps/details?id=com.official.smart_mess_manager); [BD Mess](https://bdmess.com/en); [Mess Monitor](https://messmonitor.com/); [bilash-biswas/mess-meal-cost (GitHub)](https://github.com/bilash-biswas/mess-meal-cost)

### Inferences
- Month-close algorithm (per mess period): `meal_rate = sum(bazar_cost_minor) / sum(meals)`; `member_cost = meals_i × meal_rate` (largest-remainder rounding to minor units so costs sum to total bazar); `member_balance = deposits_i + bazar_paid_i - member_cost_i`; fixed costs (rent, utilities, cook/maid salary) are split separately (equal or by room). Then feed balances to the debt simplifier.
- Meal logging: `meal_log(user, date, slot: breakfast|lunch|dinner, count, guest_count)`; allow half-meals/weights (e.g. breakfast = 0.5) and guest meals charged to the host. Daily "meal on/off" toggles with a cutoff time are the common UX in mess apps.
- Personal vs shared: tag each purchase line `shared | personal(user)`; personal lines go straight to that user, shared lines feed meal rate (or equal split). Per-item consumption (e.g. "I used 2 eggs") is high-friction; use it only for expensive shared items, otherwise rely on meal counts.
- Rotating "bazar duty" (who shops this week) is effectively a chore rotation (Section 5) whose cost lands in the expense ledger.

### Gaps
- No source on how these apps handle half-meals, guest meals or mid-month joiners; details above are design recommendations.

## 3. Pantry/fridge: expiry & FEFO, consumption rate, shopping lists, reorder thresholds, monthly ration planning, units

### Takeaway
Treat pantry as a small inventory system: an append-only stock ledger of lots (batch + expiry), FEFO picking, consumption rate estimated from ledger outflows, and reorder/shopping list from (forecast demand over the horizon − on-hand). No fetched source covered household-specific algorithms; this section is mostly design inference from standard inventory practice.

### Cited Findings
- No household-pantry-specific algorithm sources were fetched this session (see Gaps). Product master data can come from OpenFoodFacts (quantity, brand, categories) — see Section 4. — [OpenFoodFacts API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)

### Inferences
- Schema: `item(product_id, base_unit)`, `stock_lot(item, qty_base, expiry_date, location: fridge|freezer|pantry, purchase_line_id)`, `stock_move(item, lot, qty_delta_base, reason: purchase|consume|waste|adjust, at, by)`. On-hand = sum of moves (ledger), never a mutable counter only (cache it if needed).
- FEFO: on consume, allocate from lots ordered by `expiry_date ASC NULLS LAST, received_at ASC` (falls back to FIFO when no expiry). Daily job flags lots expiring within N days (e.g. 3 for fridge, 30 for dry goods) → push notification "use first".
- Consumption rate: exponentially weighted moving average of daily outflow per item, e.g. `rate_t = α·(consumed over last period / days) + (1-α)·rate_{t-1}` with α≈0.3; for monthly bulk items, simply `avg monthly consumption over last 3 months`. Days-of-cover = on_hand / rate.
- Reorder point = rate × lead_time_days + safety_stock (safety ≈ a few days of usage); when on_hand ≤ ROP → add to shopping list. Monthly ration plan = for each staple, `target = avg_monthly_usage × (1 + buffer) − on_hand`, rounded up to purchasable pack sizes (5 kg rice bag, 1 L oil pouch). Adjust for member count changes (usage per head × heads).
- Units: store everything in a base unit per dimension (g, ml, piece) as integers; keep `unit_conversion(item, from_unit, factor_to_base)` for item-specific conversions (1 packet Maggi = 70 g; 1 dozen eggs = 12 pcs; 1 L oil ≈ 910 g only if needed). Generic conversions (kg→g, L→ml) are global; packet/bag/dozen are per-item. Never convert across dimensions without an item-specific factor.
- Don't over-model: most flatmates won't log every consumption. Practical mode = log purchases precisely, log consumption coarsely ("finished", "half left") and let the "finished" event drive the shopping list.

### Gaps
- No fetched sources on household consumption forecasting or on apps doing FEFO for home pantries; recommendations are standard inventory practice, not verified against a source this session.

## 4. Data capture: OpenFoodFacts, barcode scanning, receipt OCR, voice/LLM entry

### Takeaway
OpenFoodFacts has thin South Asian coverage (about 24.6k India products, about 1.3k Bangladesh) and strict rate limits, so use it only as an opportunistic enrichment with a local product cache, not as the catalog. On-device barcode scanning is solid on native (ML Kit / expo-camera), but iOS Safari still has BarcodeDetector disabled by default, so a PWA needs a WASM/ZXing fallback. Receipt OCR and LLM natural-language entry were not researched with sources this session.

### Cited Findings
- OpenFoodFacts India site: "search 24,639 products" (fetched 2026-10-02); an earlier snippet said 24,642. — [in.openfoodfacts.org](https://in.openfoodfacts.org/)
- OpenFoodFacts Bangladesh site: "search ১,৩৩৪ products" (1,334). — [bd.openfoodfacts.org](https://bd.openfoodfacts.org/)
- Global database: 4 million+ products from 150 countries, 100,000+ contributors (search snippet). — [Open Food Facts discover](https://world.openfoodfacts.org/discover)
- Example Indian staple present: "Bharat Rice", barcode 8905532000400. — [in.openfoodfacts.org product](https://in.openfoodfacts.org/product/8905532000400/bharat-rice)
- API: rate limits "15 req/min/IP address for all read product queries" and "10 req/min/IP address for all search queries"; must send custom User-Agent `AppName/Version (ContactEmail)`; v3 endpoint `/api/v3/product/{barcode}.json` recommended, v2 deprecated; data under ODbL, contents under Database Contents License, images CC BY-SA. — [OpenFoodFacts API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- ML Kit Barcode Scanning: on-device, no network; formats Codabar, Code 39/93/128, EAN-8, EAN-13, ITF, UPC-A, UPC-E, Aztec, Data Matrix, PDF417, QR; Android + iOS; Android-only Google Code Scanner is permission-less and returns the most centered barcode; max 10 barcodes per call. — [ML Kit Barcode Scanning](https://developers.google.com/ml-kit/vision/barcode-scanning)
- expo-camera supports 13 barcode types incl. ean13, ean8, upc_a, upc_e, code128, qr; Android uses Google code scanner (for the modal scanner), iOS uses DataScannerViewController (iOS 16+), web uses BarcodeDetector; scanner can be disabled via config plugin to reduce app size. — [Expo Camera docs](https://docs.expo.dev/versions/latest/sdk/camera/)
- BarcodeDetector: shipped by default in Chrome (search summary says Chrome 134); Safari 17.0–26.5 and 26.6/27+ have it disabled by default; WebKit bug 254573 "Under Consideration"; Firefox lacks support. — [caniuse BarcodeDetector](https://caniuse.com/mdn-api_barcodedetector); [dev.to: zero-dependency scanner](https://dev.to/jamiepark-design/building-a-zero-dependency-barcode-scanner-with-the-web-barcode-detection-api-246k)
- iOS web workaround: WebAssembly barcode decoders as fallback; html5-qrcode users report iPhone Safari issues. — [dev.to: Barcode scanning on iOS, WASM solution](https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2); [html5-qrcode issue #512](https://github.com/mebjas/html5-qrcode/issues/512)

### Inferences
- With ~1.3k BD products and many loose/unbranded staples (rice, dal, oil from local shops with no barcode), barcode scanning is a secondary input path. Primary path should be quick manual/NL entry with a household-local product list + autocomplete. Build a shared `product` table that is seeded on first scan (OFF lookup → user confirms name/size → cached locally), so the 15 req/min limit is irrelevant in practice.
- Indian GTINs start with GS1 prefix 890; Bangladesh is 941 (standard GS1 allocations; not verified against GS1 this session).
- Scanning decision: native (Expo) gets ML Kit/DataScanner quality for free; a PWA must ship BarcodeDetector + a WASM fallback (e.g. ZXing-based) for iOS — more code and worse performance on iOS.
- LLM natural-language entry ("bought 5kg rice for 400"): send text to an LLM with a JSON schema/tool definition `{items:[{name, qty, unit, price_minor, shared:boolean}], payer, date}`, normalize units via the conversion table, show a confirm card before writing. Same schema works for voice (device speech-to-text → text) and for receipt photos (vision model → same schema), which is simpler than maintaining a Tesseract pipeline. Bengali/Hindi/"Banglish" input should be tested explicitly.

### Gaps
- Receipt OCR: no sources fetched comparing ML Kit Text Recognition vs Tesseract vs LLM vision on South Asian handwritten/thermal receipts (handwritten bazar lists from local shops are common and likely hard for classical OCR).
- No sourced pricing/accuracy for LLM vision extraction; ZXing library docs not fetched.
- Barcode coverage for Bangladeshi brands beyond OFF (e.g. local GS1 registries) not researched.

## 5. Chores: fair rotation, effort weighting, absences, swaps, fairness metrics, reminders, photo proof

### Takeaway
Academic fair division (Spliddit) focuses on one-shot envy-free allocations of rent, goods and credit; for recurring household chores the practical algorithm is a weighted rotation that assigns each next task to the eligible member with the largest "effort deficit" (expected share − points done), which naturally handles absences, swaps and unequal task difficulty. Fairness should be shown as each member's cumulative points vs fair share.

### Cited Findings
- Spliddit (CMU, Goldman & Procaccia, launched 4 Nov 2014) offered provably fair division for rent, goods and credit; "a single algorithm is provided for each application." — [Goldman & Procaccia, Spliddit: Unleashing Fair Division Algorithms (SIGecom Exchanges 2014)](https://www.sigecom.org/exchanges/volume_13/2/GOLDMAN.pdf)
- Envy-freeness is the gold standard for rent division; Spliddit's rent algorithm picks, among envy-free solutions, the one maximizing the worst-off agent's utility (maximin). — [Gal, Mash, Procaccia, Zick: Which is the Fairest (Rent Division) of Them All?](https://procaccia.info/wp-content/uploads/2017/11/rent.pdf)
- Spliddit-style point elicitation: participants divide 1,000 points among items by value (search snippet attributed to the Spliddit paper). — [Spliddit paper](https://www.sigecom.org/exchanges/volume_13/2/GOLDMAN.pdf)
- Open-source example of EF1 (envy-free up to one item) fair-division for shared expenses and chores. — [revati-cse/FairSplit PR](https://github.com/revati-cse/FairSplit/pull/1)
- Unverified: a search summary claimed Spliddit later added a chore/task-division app requested by medical professionals for call shifts; I did not find this in a fetched primary source.

### Inferences
- Algorithm (weighted deficit rotation): each chore has `effort_points` (members can vote; use median). Each member has `availability_factor` (1.0 normal, 0 when away, 0.5 partial). Over a rolling window, `fair_share_i = total_points_assigned × avail_i / sum(avail)`; `deficit_i = fair_share_i − points_done_i`. Assign the next instance of a chore to the available member with max deficit (tie-break: least recently did this specific chore, then fixed order). Pure round-robin is the special case of equal points and full availability.
- Absences: mark date ranges away → availability 0 → skipped without accruing debt (or accruing reduced share, a household policy choice).
- Swaps: a swap request transfers one instance; the ledger records who actually completed it, so points follow the doer automatically — no special-case logic.
- Fairness metric to display: per-member points done vs fair share (deficit), plus max−min deficit (spread) or Gini over points/availability; also "completed on time %".
- Reminders: schedule push at due time and an escalation (e.g. +12 h). Photo proof: upload to object storage (Supabase Storage/S3) with the completion record; optional peer "thumbs up" verification. Keep proof optional — mandatory photos add friction.
- Bazar (shopping) duty in messes is best modelled as a chore with points proportional to effort, while its cost goes to the expense ledger.

### Gaps
- No fetched source specifically on recurring chore rotation algorithms in production roommate apps (e.g. Tody, Flatastic, OurHome); no source on which fairness metrics they display.

## 6. Real-time sync, offline, notifications, and chat-bot interface

### Takeaway
For a small household app, Supabase (Postgres + Auth + Realtime + Storage) on the free tier is enough; PowerSync adds proper offline-first SQLite sync on top of Supabase with a free tier (2 GB synced/month, 50 peak concurrent clients). Push on iOS PWAs only works after "Add to Home Screen" (iOS 16.4+), which is a real adoption barrier versus native apps. A WhatsApp bot is cheap but not free; costs and the 2026 rule changes need verification.

### Cited Findings
- Supabase Free: $0, 500 MB DB, 1 GB file storage, 5 GB egress, 50,000 MAU, 500,000 Edge Function invocations, 200 concurrent Realtime connections, 2 active projects; free projects pause after 1 week of inactivity. Pro: $25/month per project (8 GB DB, 100K MAU), no pausing. Team: $599/month. — [UI Bakery: Supabase pricing 2026](https://uibakery.io/blog/supabase-pricing); [JetAdmin: Supabase pricing 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/); [automationatlas](https://automationatlas.io/answers/supabase-pricing-explained-2026/) (secondary sources, not supabase.com)
- PowerSync Free: $0, up to 2 GB data synced/month, 500 MB hosted, 50 peak concurrent clients, 2 service instances, 1 source DB connection per instance. Pro from $49/month (30 GB synced, 10 GB hosted, 1,000 peak concurrent clients); Team from $599/month. Billing now based on a single "data synced" metric. Sync Streams allow partial sync. — [PowerSync pricing](https://powersync.com/pricing); [PowerSync blog: simplified pricing](https://powersync.com/blog/simplified-cloud-pricing-based-on-data-synced); [Supabase PowerSync integration](https://supabase.com/partners/integrations/powersync)
- iOS web push: since iOS 16.4 (March 2023) home-screen PWAs can receive push; not from Safari tabs. Safari 18.4 added Declarative Web Push, which subscribes via `window.pushManager` and does not require a service worker. — [WebKit: Safari 18.4 features](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/); [Pushpad: iOS requirements](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications); [MobiLoud PWA iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios/)
- WhatsApp Business API India per-message rates: marketing ₹0.8631, utility ₹0.1150, authentication ₹0.1150 (effective 1 Jul 2026), plus 18% GST; utility templates are free inside the 24 h customer-service window. — [whautomate India rate card](https://whautomate.com/whatsapp-business-api-pricing-india); [MyOperator 2026](https://myoperator.com/blog/whatsapp-business-api-pricing-india-2026) (reseller sources, not Meta's rate card)
- Single-source, unverified: "From 1 October 2026, every WhatsApp Business number gets 1,000 FREE Service messages every month; after that ₹0.145 each." — [search result among India pricing pages; reseller claim]( https://chatmaxima.com/whatsapp-api-pricing/india/) (exact originating page uncertain; verify against Meta's official pricing).

### Inferences
- Default: Supabase Realtime (Postgres changes / broadcast) for live updates of the household feed; no local-first engine needed for v1 because conflicts are rare (small group, append-only ledgers). Add PowerSync later if offline use in the bazar (poor connectivity) proves important; PowerSync's free tier comfortably covers a few households.
- Designing tables as append-only ledgers (expenses, stock_moves, chore_completions, meal_logs) makes offline sync conflict-free: inserts with client-generated UUIDs merge trivially; only edits/deletes need last-writer-wins + audit.
- Supabase free-tier pause after 7 days inactivity is a real risk for a household app used in bursts; a cron ping or the $25 Pro plan avoids it.
- Push: native (Expo Notifications → FCM/APNs) is the reliable path; PWA push works on Android, but iOS users must install to home screen first.
- Chat bot: Telegram bots are free and simple (Bot API, webhooks); WhatsApp is where South Asian flatmates actually are but requires a Business number + templates for reminders initiated by the app (paid utility messages), with replies free in the 24 h window. A bot is viable as a secondary interface for NL entry ("bought 5kg rice 400") and reminders, not as the primary UI (no rich balance views). WhatsApp group bots are restricted (Cloud API is 1:1), so a household "group" experience is weaker than Telegram groups — verify.

### Gaps
- Firebase (Firestore/FCM) pricing and limits, ElectricSQL current status, and Supabase official pricing page were not fetched this session.
- Telegram Bot API limits and WhatsApp Cloud API group-chat support were not verified with sources.
- The 1 Oct 2026 WhatsApp service-message change is single-sourced.

## 7. Recommended stack, household-group auth, hosting cost

### Takeaway
Recommended: TypeScript monorepo with Expo (React Native) for the mobile app (+ Expo web or a separate Next.js PWA for the POS/back-office), Supabase for Postgres/Auth/Realtime/Storage with RLS keyed on household membership, invite-link auth via signed tokens, optionally PowerSync for offline. Can run at $0 on free tiers for a handful of households; $25/month removes Supabase's inactivity pause.

### Cited Findings
- Expo camera gives native barcode scanning on Android (Google code scanner) and iOS (DataScannerViewController), and falls back to BarcodeDetector on web. — [Expo Camera docs](https://docs.expo.dev/versions/latest/sdk/camera/)
- iOS PWAs need home-screen install for push; BarcodeDetector disabled by default on Safari. — [Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications); [caniuse](https://caniuse.com/mdn-api_barcodedetector)
- Supabase free tier ($0, 50k MAU, 2 projects, pauses after 7 days idle); Pro $25/month. — [UI Bakery](https://uibakery.io/blog/supabase-pricing)
- PowerSync free tier (2 GB synced/month, 50 peak concurrent clients); integrates with Supabase. — [PowerSync pricing](https://powersync.com/pricing); [Supabase partner page](https://supabase.com/partners/integrations/powersync)

### Inferences
- PWA vs Expo vs Flutter: the two features that matter most here — barcode scanning and push reminders — are both second-class on iOS PWAs (cited above). Expo keeps one TypeScript codebase across Android/iOS/web, shares types/validation (e.g. Zod) and domain logic (splitting, rounding, rotation) with a Next.js POS in the same repo. Flutter is equally capable on mobile but splits the language from a TypeScript web/POS stack. If iOS users are few (Android-dominant South Asian market), a PWA-first MVP is acceptable, with a WASM barcode fallback.
- Repo layout: `packages/domain` (pure TS: money/minor units, split algorithms, debt simplifier, UoM conversions, FEFO, rotation — each with a small test), `packages/db` (SQL migrations, generated types), `apps/flat` (Expo), `apps/pos` (Next.js or Expo web).
- Household auth: Supabase Auth (phone OTP is natural in IN/BD but SMS costs money; email magic link or Google sign-in is free). Invites: `household_invite(token_hash, household_id, expires_at, max_uses)`; share link `https://app/join/{token}` via WhatsApp; on accept, insert `household_member`. RLS: every table has `household_id`; policy `household_id IN (select household_id from household_member where user_id = auth.uid())`.
- Cost: $0 (Supabase free + Expo EAS free builds/limited + Vercel/Netlify hobby for web) for personal use; ~$25/month when it must not pause; LLM extraction costs per call are small but unmeasured here. Google Play developer account is a one-time fee and Apple Developer is annual (amounts not verified this session).

### Gaps
- No fetched source for Flutter vs Expo comparison in 2026, Expo EAS free-tier limits, Vercel hobby limits, app-store fees, or SMS OTP pricing in IN/BD.
- No blog posts by builders of roommate apps were found/fetched this session.

## 8. Shared concepts with the retail POS in the same repo

### Takeaway
The household app and a retail POS share the same core: product catalog, units of measure with conversions, purchase documents with line items, and an append-only stock ledger with lots/expiry. Build these once in a shared domain package; household-only concepts (members, splits, meals, chores) and POS-only concepts (sales, tax, tenders, customers, registers) sit on top.

### Cited Findings
- OpenFoodFacts product data (barcode, brand, quantity, categories; ODbL) is usable as enrichment for both a household catalog and a retail catalog; rate limits (15 product reads/min/IP) mean it must be cached locally. — [OpenFoodFacts API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- ML Kit / expo-camera scan EAN-13/UPC barcodes on-device, which is the same capability a mobile POS needs. — [ML Kit](https://developers.google.com/ml-kit/vision/barcode-scanning); [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)

### Inferences
- Shared tables (tenant-scoped by `org_id` where org = household or shop): `product(id, org_id, name, gtin nullable, base_unit, category)`, `uom(code, dimension)`, `product_uom(product_id, uom, factor_to_base, is_purchase_unit, is_sale_unit)`, `purchase(id, org_id, supplier/shop, date, total_minor, currency, payer_id)`, `purchase_line(purchase_id, product_id, qty, uom, unit_price_minor)`, `stock_lot`, `stock_move(reason: purchase|sale|consume|waste|adjust|transfer)`.
- A household "bazar" purchase and a shop "goods receipt" are the same document; a household "consume" and a POS "sale" are both negative stock moves (sale additionally creates revenue/tender rows). FEFO allocation, reorder points and consumption/sales-velocity forecasting are the identical algorithm for both.
- Money: one shared `Money` type in integer minor units with largest-remainder allocation — used by expense splits in the flat app and by discount/tax apportioning across lines in the POS.
- Divergences to keep separate: POS needs tax (GST in India / VAT in Bangladesh), price lists, tenders, receipts, cash drawer sessions; household needs members, split rules, settlements, meals, chores. Don't force one app's concept into the other (ponytail: no generic "party" abstraction until both actually need it).

### Gaps
- No sources fetched on POS data models, GST/VAT receipt requirements, or open-source POS schemas (e.g. Odoo/ERPNext stock ledger) to validate the shared model.
