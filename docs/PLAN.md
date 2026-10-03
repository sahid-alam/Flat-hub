# FlatHub plan

## How our flat works today

- There are **6 mates**, and at least one uses an iPhone.
- **Kitty:** each mate puts in **₹2,000** and common things are bought from that pool. Personal stuff isn't tracked.
- **Groceries:** mostly ordered on **Zepto**. Small items like dahi, milk, bread and eggs come from local stores, often daily.
- So "monthly ration" here really means **continuous replenishment**: frequent small baskets, not one big bazar run.

## What FlatHub v1 does (four screens over a few ledgers)

| Screen | Answers | Built from |
|---|---|---|
| **Kitty** | How much is left? Who has put in what? Who needs to top up? | `pool_entry`, `spend` |
| **Stock** | What do we have, and what do we need to order? | `lot`, `stock_move`, `shopping_item` |
| **Fridge** | What's in the fridge, and what expires soon? | `lot` where location = fridge, in FEFO order |
| **Duties** | Whose turn is it, and is the split fair? | `duty`, `chore_event` |

The spine is that **one purchase writes a spend (money) and, optionally, lots (stock)**. No existing app links these two (see the research report).

## Getting data in (this decides adoption)

1. **Zepto order: share → extract → confirm.**
   - Share the Zepto invoice PDF or order screenshot into FlatHub using the iOS/Android share sheet.
   - An LLM fills a strict JSON schema: items, qty, unit, price, plus fee and discount lines, and the order total.
   - A confirm card shows the parsed lines. Each line's product is matched through `product.aliases`, and the matches are learned over time.
   - Zepto has **no public API**, so share-sheet is the realistic v1 path. Email-invoice forwarding comes later.
   - Fees (delivery, handling, small-cart, surge) and coupons are **their own lines** (`kind = fee | discount`), not spread across items. The lines must sum to the amount actually paid.
2. **Local store quick-add.**
   - A favourites grid (dahi, milk, bread, eggs, …): tap the item, edit the amount if needed, save. That's 2 taps.
   - Payer defaults to "me", and the source defaults to the pool.
   - Same-day perishables are set to `track_stock = false`, so they record money only and create no lot.
3. **Manual / typed.** "dahi 30, bread 45" goes through the same LLM schema and the same confirm card.

## Milestones

- **M0 – Setup**
  - Decide the repo layout (open decision 1 below).
  - Set up the Expo app (TypeScript, expo-router) and a Supabase project with migrations in git.
  - Auth via email magic link or Google. Phone OTP is skipped for now because SMS costs money.
  - Create the household, with an invite link shared on WhatsApp.
- **M1 – Kitty**
  - Record contributions and spends (manual entry), with paid from pool or from own pocket.
  - Reimbursements, plus Ansh's "to reimburse" list.
  - Show the pool balance and each mate's position.
  - Monthly "Top up ₹2,000 to Ansh" prompt with a UPI link.
  - Ship the balance-invariant test.
- **M2 – Capture:** favourites quick-add, then Zepto share-sheet → extraction → confirm card, then typed entry.
- **M3 – Stock + fridge**
  - Create lots from spend lines.
  - Mark items finished, half-left or thrown away.
  - Fridge view with "expiring soon".
  - Auto shopping list from `min_qty`, plus manual items.
- **M4 – Duties**
  - Duties with effort points.
  - Assignment by effort deficit; a skip earns no credit and a swap transfers the instance.
  - Absences.
  - Push reminders, sent as one daily digest and not a stream of pings.
- **M5 – Month close:** monthly kitty statement visible to everyone (free, never paywalled), plus a spend breakdown by category and source (Zepto vs local).

**Design:** run a UI design pass (the `impeccable` / `frontend-design` skills) before building M1 screens. Targets: one-tap entry, big touch targets, readable at a glance, and no leaderboard. Fairness should be visible without becoming a scoreboard.

## Deferred (don't build yet)

- Pairwise splits, debt simplification and mate-to-mate settle-up are not needed with a kitty.
- Meal-count / mess-style cost split.
- Weighted shares (e.g. the AC room pays more).
- Rent and utilities are split separately (a possible v2 "Bills" screen).
- WhatsApp bot, offline sync (PowerSync), and barcode/OpenFoodFacts. OpenFoodFacts coverage of Indian products is thin, and Zepto lines already name the item.
- Fridge ownership tags (mine/shared/free-for-all), because only common items are tracked.
- Multiple households, onboarding and pricing. The `household_id` column + RLS keeps the door open.

## Answered questions (2026-10-02)

1. **Repo layout:** FlatHub is **its own repo** (`POS/FlatHub`). Keep `src/domain/` pure TypeScript (no React, no Supabase) so the POS can lift it later.
2. **Who holds the kitty?** **Ansh Rastogi** is the treasurer (`household.pool_holder_id`). Top-ups are paid to him over UPI, and he pays pool spends and reimbursements.
3. **What does the kitty cover?** **Groceries/common items only.** Bills (rent, electricity, Wi-Fi, maid) are split separately and are out of scope for v1.
4. **When is a top-up triggered?** **Monthly:** ₹2,000 per mate at the start of each month. Show the balance prominently and nudge on the 1st. There is no threshold trigger.
5. **Absences:** **each month's spend is split by days present that month.** An absence counts only if it is a run of **3 or more consecutive days**. Absences can be logged until the month closes, and late entries are shown as "added late"; nobody approves them. After close the month is frozen. Research and worked example: `research_notes/Absence adjusted kitty shares/absence_rules.md`.
   - **Top-up amount:** the suggested top-up is `₹2,000 − position`, floored at 0 and editable. A mate who was away or is owed money pays less, and everyone's position returns to +₹2,000.
6. **Out-of-pocket purchases:** **reimbursed.** A spend with `paid_from = personal` creates an amount the kitty owes that mate. Ansh records the reimbursement when he pays it, and the app shows his "to reimburse" list.

## Decisions (with reasons)

| Decision | Why |
|---|---|
| Expo, not PWA | iPhone in the flat. iOS web push needs a Home Screen install, and Safari has no BarcodeDetector. |
| Supabase + RLS on `household_id` | The free tier fits one flat. Realtime is useful for the shopping list. Free projects pause after 7 idle days, so add a keep-alive cron. |
| Integer paise, append-only ledgers, UUIDv7 | All the money bugs found in the reference repos came from floats or mutable rows. |
| Pool ledger, not per-expense splits | It matches how the flat actually works; one identity (see DATA_MODEL) replaces the whole split engine. |
| Web app on Vercel for now, name + password sign-in (2026-10-03) | Free, no domain, works on every phone today. Supabase's free email sender only mails project team members, so magic links can't reach mates; accounts are made per mate instead. Native builds (EAS) come back when share-sheet or push is needed. |
| LLM extraction + confirm card | Spliit's proven approach. Zepto PDFs and screenshots are messy, so a human confirms every save. |
| Fees and discounts as separate lines | The spend total equals what was paid, and the item prices stay honest. |
| Chore assignment by effort deficit, skip ≠ done | Grocy and Donetick both credit skips; the research shows that fairness as perceived is what matters. |

## Not to import from the research report

The report's settle-up section (Spliit-style splits, bitmask debt solver, "pay Asha ₹X" UPI links) and its mess meal-rate model were written for pairwise or mess setups. The parts that do carry over are the purchase → lot + spend spine, FEFO ordering, the chore-fairness fixes, the LLM-extraction pattern, and the Supabase/Expo choices.
