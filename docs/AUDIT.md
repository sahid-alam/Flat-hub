# FlatHub feature audit

**Audited:** `main` at `8d5f9f1` — the five-tab build (Kitty · Kitchen · Add · Duties · Spending).

**Which app this describes:** when this audit started, `docs/RESUME.md:3-5` said the live site was still
on the pre-tabs build. The five-tab build was deployed earlier today, so flathub.vercel.app and `main`
now match, and **everything below describes the app the six of them are using right now**.

This is an audit. No code was changed; the only file written is this one.

Tap counts in section 4 are measured against the five-tab shell on `8d5f9f1`
(`src/app/(tabs)/_layout.tsx`), not against the old single-screen build.

---

## 0. The G2 finding, nailed down

> **Verdict: broken in production.** Two shipped surfaces render a permanent falsehood, and a third
> renders meaningless numbers. The screenshots in `docs/screenshots/nav/` look right only because the
> local seed sets `category` by hand; nothing in the shipped app can ever set it.

### Every write path to `product`, traced

| Path | What it writes | Sets `category` / `min_qty` / `track_stock` / `base_unit`? |
|---|---|---|
| `src/app/favourites.tsx:116-123` — "Add a product" | `id`, `household_id`, `name`, `default_price_paise`, `favourite` | **No.** Five columns, none of the four. |
| `src/app/favourites.tsx:19` — star toggle | `favourite` | No |
| `src/app/favourites.tsx:87-90` — edit price | `default_price_paise` | No |
| `src/app/import.tsx` — Zepto confirm card | **Nothing.** The unmatched-line branch (`import.tsx:398-401`) prints the static string `New product: pick or create` with **no picker and no create button**. The line saves with `product_id: null`. | No |
| `src/app/import.tsx:273` → `learn_alias` RPC | `aliases` only (`20261003210805_m2_capture.sql`, `update public.product p set aliases = array_append(...)`) | No |
| `src/ui/putaway.tsx:162` → `put_away` RPC | `lot` + `stock_move` only (`20261004105950_m3_stock.sql`, two `insert into` statements) | No |
| `add_spend` RPC (`spend.tsx:56`, `quickadd.tsx:130`, `import.tsx:239`) | `spend` + `spend_line` only | No — never touches `product` |
| `create_household` / `join_household` (`welcome.tsx:40,46`) | No product seeding — grep for `insert` against `product` in `supabase/migrations/*.sql` returns only `spend_line` | No |
| `product_uom` | **Zero writers.** Selected at `books.tsx:118`; the insert grant and RLS policy exist (`20261004105950_m3_stock.sql:85,115`) and nothing in `src/` calls them. | n/a |

Confirmed by `grep -rn "from('product')\|product_uom" src/` (4 hits, 3 of them `favourites.tsx`, 1 a
`select` in `books.tsx`) and by reading every RPC body in `supabase/migrations/`.

### What the six of them see today

Production values are therefore always: `category = NULL`, `min_qty = NULL`, `base_unit = 'pc'`
(migration default, `20261003210805_m2_capture.sql:10`), `track_stock = true` (default, line 11).

1. **Spending → "Where it went · by product category"** (`(tabs)/spending.tsx:117-123`).
   `monthBreakdown` maps every line through `category || 'Other'` (`domain/kitty.ts:210`), so the map
   collapses to one key. `pcts()` over a single group returns 100. **They see exactly one bar, labelled
   `Other`, at 100%, in every month, forever.** Same for the statement's category group
   (`statement/[month].tsx:116-134`).

2. **Shopping → "From low stock · the app noticed"** (`ui/shopping.tsx:119-135`).
   `shoppingList`'s low branch filters on `p.min_qty !== null` (`domain/stock.ts:103`), which is never
   true, so it returns `[]`. **That block never renders.** The hero's sub-line
   (`ui/shopping.tsx:108-110`) permanently reads `0 from low stock · N asked for · M already ticked`,
   and the footer promise "Low-stock rows clear themselves once a spend puts the product back above its
   minimum" (`ui/shopping.tsx:229-231`) describes something that cannot happen.

3. **Stock → "Running low"** (`ui/stock.tsx:159-186`) calls the same function with an empty manual list,
   so `low.length === 0` always. **That block never renders either.**

4. **A 1 L pack of milk.** `base_unit` is `'pc'`, and `product_uom` is empty, so `toBase` returns `null`
   (`domain/stock.ts:73-76`); the kg/L special case in `openingQty` requires `base_unit` to be `'g'`/`'ml'`
   and so is skipped (`ui/putaway.tsx:48-52`); a new product has no `lastPackSize`, so the sheet opens at
   `line.qty`, i.e. **1**. `fmtQty(1, 'pc')` prints **`1 pc`** — the fridge card reads "1 pc left" for a
   litre of milk, and "0.5 pc left" after Half left. It can never print `1 L`: `fmtQty`'s kg/L branches
   (`ui/stock.tsx:25-27`) are unreachable.

**What still works:** `track_stock` defaults to `true`, so a `/spend` or `/import` line that exactly
matches a product the mate created does open the put-away sheet and does create a lot. The Fridge is not
empty — its expiry warnings (`expiringSoon`, `staleWarning`) are real and useful. It is the *quantities*
that are meaningless and the *low-stock automation* that is dead.

---

## 1. GENERIC — built for "a flat", not for these six

| # | What's generic now | The version for this flat | Cost | Files |
|---|---|---|---|---|
| G1 | **The product catalogue starts empty.** `favourites.tsx:100-164` is "Add a product", one at a time, name + price. Six mates each have to build the staples list before Quick Add does anything. | Seed the flat's actual basket on first run — atta, Amul Taaza, dahi, eggs, bread, onions, tomatoes, rice, dal, chai, Maggi, 20L water can — with real prices and categories. One SQL seed; `defaultLocation()` (`ui/putaway.tsx:33-37`) then works because categories exist. | **S** | one migration, `favourites.tsx` |
| G2 | **No product can be fully configured, anywhere.** See section 0 — `category`, `min_qty`, `track_stock`, `base_unit` and `product_uom` have no writer in the shipped app. | Either add the four fields to the product row (a category chip, a "keep at least ___" number, a "track this" switch, a base unit) **or** cut the features that depend on them. Don't leave both half-alive. See D1/D2. | **M** build / **S** cut | `favourites.tsx`, `ui/shopping.tsx`, `ui/stats.tsx` |
| G3 | **Store is free text with an invented placeholder** — `spend.tsx:121` suggests "Sharma Dairy", and `store_name` is never recalled. This flat buys from the same two or three kiranas. | Chips of the last 5 distinct `store_name`s above the field; tap to fill. | **S** | `spend.tsx`, `import.tsx:333` |
| G4 | **Duties' empty state invents their chores** — "dishes, kitchen floor, bins" (`(tabs)/duties.tsx:293`). | Either seed the six duties they actually run, or say "add the chores the six of you argue about" and leave the naming to them. | **S** | `(tabs)/duties.tsx` |
| G5 | **Treasurer is a role with hand-over machinery.** `mates.tsx:86-93` renders a `Make X treasurer` button under every other mate, and `set_pool_holder` is a whole RPC. Ansh is the treasurer; this is a once-a-year action occupying five buttons on a screen everyone visits to set their UPI ID. | Collapse to one line behind a confirm. Keep the RPC. | **S** | `mates.tsx` |
| G6 | **₹2,000 is a DB default with no editor.** Nothing writes `monthly_topup_paise` — grep finds two reads only (`(tabs)/index.tsx:109`, `topup.tsx:65`). If they raise it to ₹2,500 in January, someone writes SQL. | One field on `/flat`, treasurer-only. | **S** | `flat.tsx`, `mates.tsx` |
| G7 | **Positions print paise.** `formatINR` shows the fraction whenever it's non-zero (`domain/money.ts:11`), so the Kitty hero reads `You +₹4,861.59` (`docs/screenshots/nav/light-1-kitty.png`). Largest-remainder shares always leave paise. Nobody in this flat thinks in paise. | Round user-facing positions and top-ups to the rupee; keep paise on `/statement/[month]`, where the books are the point. | **S** | `ui/kit.tsx:319-326`, `(tabs)/index.tsx` |
| G8 | **"a head" contradicts the absence rule.** `(tabs)/spending.tsx:92` divides the period total by `mates.length`, flat. `share()` divides by presence-weighted days (`domain/kitty.ts:121`). A month where Jatin was home for ten days shows one number on Spending and a different one on his statement. | Use `shares(books)` for the per-head line, or drop the line. | **S** | `(tabs)/spending.tsx` |

---

## 2. MISSING — what six people sharing a kitchen in India need and the app cannot answer

Ranked by value ÷ build cost.

| # | The moment | What's missing | Cost | Files |
|---|---|---|---|---|
| M1 | **11pm. Ayan orders ₹1,180 on Zepto: ₹700 of flat groceries, ₹480 of his own chips and Coke.** The import confirm card (`import.tsx:337-425`) offers Item / Fee / Discount per line and a delete ✕ — no "this one's mine". Deleting the line forces him to edit the total too (the balance bar, `import.tsx:449`), after which the app silently disagrees with his bank statement. | A per-line **"mine, not the flat's"** toggle that drops the line from `p_lines` *and* subtracts it from `total_paise`, with the full raw bill still kept on `spend.extraction` (already saved, `import.tsx:247`). Invariant 1 stays intact. | **S–M** | `import.tsx` |
| M2 | **1st of the month. Ansh opens the app.** He sees the same Kitty every mate sees. The two things only he does — ₹8,000 of top-ups to record and ₹1,450 owed back to Anant — both sit behind the people icon on `/flat` (`flat.tsx:28-33,58-62`), with no count anywhere on his Kitty tab. | A treasurer strip at the top of Kitty: "₹1,450 to pay back to 2 · 3 of 6 topped up", tapping straight into `/reimburse` and `/topup`. `isTreasurer` and `unreimbursed()` are already in `useHousehold` / `domain/kitty.ts:151`. | **S** | `(tabs)/index.tsx` |
| M3 | **Jatin's lease ends on the 20th. He wants his money.** No UI anywhere writes `member.left_on` — grep finds four reads and zero writes (`(tabs)/index.tsx:54`, `(tabs)/spending.tsx:57`, `(tabs)/duties.tsx:53`, `duties/manage.tsx:23`). `presenceWeights` already prorates by `joined_on…left_on` (`domain/kitty.ts:71`), so the maths exists; there is no way in, and no "final settle: Ansh owes Jatin ₹X" screen. Same hole in reverse when a seventh mate joins mid-month. | A "Moving out" row on `/mates`: pick the date, confirm, show the frozen final position. | **S–M** | `mates.tsx`, `away.tsx` |
| M4 | **The 18th. The kitty has ₹4,200 left and twelve days to go.** The hero shows the balance (`(tabs)/index.tsx:92`); nothing says whether that is fine. Spending offers a monthly average over *the bars you can see* (`(tabs)/spending.tsx:102`), which is not a burn rate. | One line under the hero: "≈₹350/day this month — about 12 days left." Pure arithmetic over `spends` in `thisMonth()`; no schema change. | **S** | `(tabs)/index.tsx`, `domain/stats.ts` |
| M5 | **"I'm on Zepto right now — anyone need anything?"** The shopping list is two taps and a scroll inside Kitchen (`(tabs)/kitchen.tsx:73`), and the person ordering has no reason to open it. Nobody is notified of anything — push is deliberately unbuilt (`docs/RESUME.md:47-48`). | Cheap: show the to-buy count as a badge on the Kitchen tab (`toBuyCount` already exists, `ui/shopping.tsx:22`) and put "Need anything? 5 on the list" on the Kitty. Real: a share button that pastes the open list as text into their WhatsApp group, where this conversation actually happens. | **S** each | `(tabs)/_layout.tsx`, `ui/shopping.tsx` |
| M6 | **Adnan's cousin stays four nights and eats every meal.** `presenceWeights` counts members only; absences subtract days, nothing adds them. The flat eats six-and-a-bit people's groceries and Adnan pays a sixth. | The symmetric twin of `/away`: "guest, from–to, whose" — one extra weight in the same `allocate()` call. Small, but it changes the fairness model, so whether the flat wants that bookkeeping is the owner's call. | **M** | `domain/kitty.ts:71`, `away.tsx` |
| M7 | **"I bought dahi yesterday and forgot."** `/spend` has no date field at all (no `DateField` anywhere in `spend.tsx`), and neither does Quick Add. `occurred_at` defaults to now. Only `/import:335` and `/topup:67` let you pick a day. | A "Yesterday" chip beside the amount. | **S** | `spend.tsx`, `ui/quickadd.tsx` |
| M8 | **The gas cylinder (₹1,100) lands on the 9th; the water-can man comes every Tuesday.** Both are legitimately kitty "common items", and `/spend` with source `other` already records them — but nobody has told the app they exist, so they are typed from scratch each time and swing a month's bars with no label. | Favourites are not only for food: add "Gas cylinder" and "Water can" as favourite products with their prices. **Zero code** — this is the seeding job in G1, and it is the cheapest real win on this list. | **S** | seed only |
| M9 | **Rent, electricity, Wi-Fi, the maid's salary.** Explicitly out of scope (`docs/PLAN.md:68,77`) and still split on WhatsApp. CLAUDE.md forbids the pairwise/settle-up machinery, so there are exactly two in-rules shapes, and this is a scope decision rather than an engineering one: **(a)** pay bills *out of the kitty* and raise the monthly top-up to cover them — zero new concepts, `/spend` already handles it, the only change is the ₹2,000 number (G6); **(b)** a second pot with its own holder and figure — a parallel `pool_entry`/`spend` pair scoped by a `purpose` column. | (a) **S**, (b) **L** | — |
| M10 | **A dispute: "₹1,180? what was that?"** `spend.receipt_path` is in the schema and nothing in `src/` ever reads or writes it (grep: zero hits). The bill photo a mate already picked for extraction is thrown away once the LLM has read it. | Upload the picked image to Storage during `/import`, show it on the statement row. | **M** | `import.tsx`, `statement/[month].tsx` |

Deliberately **not** listed as missing, because they are built and this flat will use them: UPI top-up
links (`(tabs)/index.tsx:205-208`), absences, month freeze, reversals.

---

## 3. DEAD WEIGHT — what to delete

| # | What | The evidence | Cost to cut | Files |
|---|---|---|---|---|
| D1 | **Both category breakdowns** — "Where it went · by product category" (`(tabs)/spending.tsx:117-123`) and the statement's category groups (`statement/[month].tsx:116-134`). | Section 0: `category` has no writer, every line falls to `'Other'` (`domain/kitty.ts:210`), and the chart is a single 100% bar in every month. It is a visible falsehood today. | **S** — delete two blocks, or build the chip in G2 first | `(tabs)/spending.tsx`, `statement/[month].tsx` |
| D2 | **The low-stock half of Shopping, and arguably the whole lot pipeline.** | Four independent cuts, all verified: (i) `min_qty` has no writer, so `shoppingList`'s low branch (`domain/stock.ts:101-105`) always returns `[]` — the "From low stock" block and Stock's "Running low" block never render; (ii) **Quick Add never creates a lot** — `ui/quickadd.tsx:117-140` calls `add_spend` and stops, with no `usePutAway`, so the flat's most-used entry path feeds nothing into stock; (iii) `/import` cannot create a product (`import.tsx:398-401`), so every new Zepto line saves with `product_id: null` and becomes no lot; (iv) quantities are `pc`-only and meaningless (section 0, item 4). The pipeline is severed at both ends. What survives and works is the manual "Asked for" list. | **S** to cut Stock + low-stock and keep the typed list; **L** to make the pipeline real | `ui/stock.tsx`, `ui/shopping.tsx`, `(tabs)/kitchen.tsx` |
| D3 | **Per-lot consumption logging.** "Finished / Half left / Threw away" (`ui/fridge.tsx:230-240`) is 3–4 taps per carton of milk, every day, forever. Six people will not do this. | A judgement rather than a grep — but it rides on D2: with no `min_qty`, nothing *reads* the resulting on-hand except the fridge screen itself. The expiry warnings (`expiringSoon`, `staleWarning`) are the part worth keeping. | **M** | `ui/fridge.tsx` |
| D4 | **The `/statement` index screen.** | `flat.tsx:49-50` justifies keeping it "because that's where a month gets closed" — but `(tabs)/spending.tsx:173` renders the same `CloseMonth` component and `(tabs)/spending.tsx:179-193` renders the same archive stack. Fully redundant. Keep `/statement/[month]`; delete the index and its `/flat` row. | **S** | `app/statement.tsx`, `flat.tsx` |
| D5 | **`product_uom` and `toBase`.** | Table is selected at `books.tsx:118` and never inserted anywhere, so `toBase` (`domain/stock.ts:73`) always returns `null` and `openingQty` always falls through to the `lastPackSize` guess (`ui/putaway.tsx:46-59`). | **S** | `domain/stock.ts`, `lib/books.tsx`, `ui/putaway.tsx` |
| D6 | **`shoppingList`'s reserved `opts` parameter** (`domain/stock.ts:84-85`, with a `void opts;` to silence the linter). | YAGNI, self-documented in the comment. | **S** | `domain/stock.ts` |
| D7 | **Effort points 1/2/3/5/8** (`duties/manage.tsx:14`). | Low confidence, so flagged rather than cut: if the six set everything to 1, the whole deficit engine reduces to round-robin and the points chip on every card (`(tabs)/duties.tsx:152`) is noise. Check the real data before touching it. | — | — |

---

## 4. HARD TO REACH — taps from app open to done

Measured against the five-tab shell on `8d5f9f1`. Rules: the app opens on **Kitty**; a tab tap = 1, a
row/button tap = 1; typing and keyboard dismissal are not counted; a required scroll is noted, not counted.

| Action | How often | Taps | Verdict |
|---|---|---|---|
| "What's left in the kitty / what do I owe?" | daily | **0** | ✓ |
| "Whose turn for the dishes?" | daily | **1** — Duties | ✓ |
| Mark my duty done | daily | **2** — Duties → Done (`(tabs)/duties.tsx:196-203`) | ✓ |
| Log ₹60 milk from the kirana (a favourite) | daily | **2** — tile → Save (`ui/quickadd.tsx:68,166`) | ✓ the best thing in the app |
| Log a spend that isn't a favourite | ~weekly | **2** — Add → Save; defaults are me / pool / local (`spend.tsx:26-27`) | ✓ but no date (M7), no store recall (G3) |
| Add to the shopping list | few per week | **2 + scroll** — Kitchen → (segment) → Add; the field sits *below* both lists (`ui/shopping.tsx:149-170`) | ⚠ move the field to the top |
| **Import a Zepto order** | **the flat's main grocery channel** | **≈5 + scroll** — scroll past the favourites grid on Kitty → the "Import a Zepto order" row (`ui/quickadd.tsx:88-92`, **the only `/import` link in the whole app**) → picker → pick → Save, plus a Yes/Not-it per unmatched line and a put-away sheet | ✗ **the worst gap.** The centre **Add** button hard-codes `/spend` (`(tabs)/_layout.tsx:91`), and `/spend` has no link to `/import`. The commonest way groceries enter this flat is the least reachable thing in the UI. |
| **Ansh records a mate's top-up** | **5× every month** | **4** — people icon → Record a top-up → pick mate → Record (`flat.tsx:58-62`, `topup.tsx`) | ✗ ~20 taps a month for the one person with a job |
| **Ansh marks a reimbursement paid** | weekly-ish | **3** — people icon → To reimburse → Mark paid (`flat.tsx:28-33`, `reimburse.tsx:82-87`) | ✗ and the amount owed appears **only** on `/flat` (`flat.tsx:31`), never on his Kitty tab |
| Mark the milk finished | daily, if done at all | **3–4** — Kitchen → (Fridge segment, +1 when the tab lands on Shopping, `(tabs)/kitchen.tsx:33`) → tap the lot → Finished (`ui/fridge.tsx:236`) | ✗ see D3 |
| Log an absence | monthly | **3 + two date pickers** — people → Away → Log my absence (`away.tsx:47-57`) | ⚠ acceptable |
| Reverse a wrong entry | occasional | **long-press**, discoverable only from one line of grey text (`(tabs)/index.tsx:158-160`) | ⚠ fine for a correction — don't make it easier |

---

## The three to do first

**1. Put the Zepto import behind the Add button.** Five taps and a scroll currently guard the channel
most of this flat's groceries arrive through, and the fix is a choice sheet on one `tabPress` listener —
`src/app/(tabs)/_layout.tsx:88-93`. Highest value-per-rupee on the page.

**2. A treasurer strip on the Kitty tab (M2).** One person does roughly 25 extra taps a month and is the
only one who cannot see his own outstanding work without going three screens deep. `isTreasurer` and
`unreimbursed()` already exist; this is a block, not a feature.

**3. Settle the product-metadata fork (G2 / D1 / D2) in one pass.** Right now the Shopping tab advertises
a low-stock list that mathematically cannot appear, and Spending draws a category chart that is
permanently one grey bar labelled "Other" — both are live falsehoods, today, in production. Either spend
the **M** on a product editor plus a seed of the flat's real basket (which also lights up put-away
locations and kg/L formatting), or spend the **S** on deleting them and keeping the typed shopping list,
which works. Shipping the seed alone (G1 + M8) turns Quick Add from an empty grid into the flat's actual
cart on day one.
