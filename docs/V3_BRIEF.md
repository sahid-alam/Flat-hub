# V3 brief — what the owner asked for on 7 Oct 2026

Captured from a spoken walkthrough of the live app plus six annotated references in `ui-refs/`.
Anything marked **?** is my reading of an ambiguous phrase and needs confirming.

## The look

`ui-refs/ref-4` is marked **"Perfect Example"**: light, soft cards, a greeting header
("Hey Rubel 👋 Here's your project update"), a snapshot card with one big figure and a bar chart,
2-up metric tiles, a "Today's Tasks" list with status pills and avatars, and a floating dark pill nav.

Supporting references:

| Ref | What he liked | Where it lands |
|---|---|---|
| ref-1 | Horizontal date strip (active day as a filled pill), time-gutter timeline of cards, floating nav | Duties — today and the next few days |
| ref-2 | Bar chart with a trend curve, big filled metric card, 2-up tiles, streak hero, dot-matrix grid | Spending, and duty streaks |
| ref-3 | Profile card (name, email, phone, saved cards); illustrated empty states | Profile; every empty list |
| ref-4 | **Perfect Example** — the whole dashboard shape | Home |
| ref-5 | Progress ring | "a habit tracker / reminder kind of thing" |
| ref-6 | A card expanding into a full sheet, frame by frame | The motion language everywhere |

The floating capsule nav from the earlier reference **stays** — he likes it. If five destinations will
not fit, the **+** opens a squarish rounded-corner menu from the button with the overflow in it.

## Home — the biggest complaint

> "this doesn't have a proper home screen. It just opens in a card, and the card doesn't feel like it
> should be the home screen."

Home must be a real dashboard, personalised to whoever is signed in. It must show:

- **What you personally owe or are owed.** If the flat owes Anant, Anant sees it on *his* home. Ansh,
  as treasurer, sees his own version. "the prominent one should show who owes what."
- **Duty points.**
- What is happening today.
- **Quick Add stays but shrinks** — one row of most-used items, not a grid. (Decided.)

## Import and shopping

- "Import a Zepto order" and "photo of the bill" are **the same action** — merge them into one.
- Wants import or cart linking across **Zepto, Blinkit, Instamart, BigBasket, Flipkart, Amazon Now,
  JioMart**. Blinkit is the main one (confirmed — he said "Zomato", meaning its grocery arm).
- Suggested pulling a product catalogue from a price-comparison service he called **"Compareify"**.
- From the shopping list, wants to add straight to Zepto, or at least deep-link into it.
- **Honest constraint:** none of these have a public cart API. See `docs/IMPORT_OPTIONS.md`.

## Kitchen

- The shopping list living inside Kitchen is "very weird"; the placements are "not good".
- Dislikes the Fridge | Shopping | Stock switch at the top.
- **The fridge is not only flat stock.** It must hold:
  - **Personal items** — "I bought a chocolate and will put it in my fridge". Recorded as that
    person's own spend, kept out of the kitty and out of everyone's share. (Decided.)
  - **Leftovers** — "Ayan will be doing the dishes. He will add those if he had put some extra food
    in the fridge."
- Stock: "I don't know how to use it right now, but fine." — not valuable to him yet.

## Duties

- Manage needs **separate sections for the duty list and Add**. Add opens a form: duty name, how
  often, points, who is in.
- **Reorder the rota.** "I can't have Monday as my duty because of my college. I can do Tuesday."
- **Assign 2 or 3 people to one duty.**
- **Only the assigned person ticks their own duty, and anyone else can vouch it was done.** (Decided.)
- **Swap and Skip become swipe gestures, not buttons.**
- Swap must offer every option, and must work on a **future** duty (e.g. one due 8 Oct), not just today's.
- **?** "the Escape option should also show Suraj for that day" — I read "Escape" as Skip. "Suraj" is
  not one of the six and may be a transcription slip. **Needs confirming: what should Skip show?**

## Spending

Filters are good. Wants the ref-2 / ref-4 chart vocabulary: bar chart with a trend curve, big single
figures, 2-up tiles, streak and dot-matrix grids.

## People, profile and UPI

- The people icon opening `/flat` with Reimburse / Favourites / Settlements is wrong — "I don't think
  all of them should be here."
- Who owes what belongs on the **home screen**, personalised, not behind an icon.
- **UPI is unfindable.** It must live in a **proper profile**: name, profile picture, cover picture,
  "some other fancy things so it looks good".
- Research profile patterns on Mobbin.

## Decided in this session

| Question | Answer |
|---|---|
| Zomato or Blinkit | **Blinkit** — its grocery arm |
| Personal fridge items | **Tracked as the owner's own spend**, never the kitty |
| Who ticks a duty | **The assignee**; anyone else can vouch |
| Quick Add | **Stays on home, shrunk to one row** |

## Carried over from the earlier audit, still true

Product metadata gets built properly (category, min_qty, base unit) plus a seed of the real basket;
guests add a share; a second pot for bills; per-lot fridge logging stays. See `docs/AUDIT.md`.

---

# Round 2 — after reviewing the concept (8 Oct 2026)

Thirteen items from his walkthrough of `docs/design/concept.html`, plus two annotated screenshots.

## Corrections to what we drew

| # | What he said | What changes |
|---|---|---|
| R1 | **"I honestly didn't like the structure and ui of the add duties things"** | Manage opens on the **list of duties**; tapping one edits it; a separate **Add duty** button creates a new one. The form itself gets reworked, not restyled. |
| R2 | **"what I meant by two people is that one duty will be fulfilled by two people. e.g., Adnan and me one day, Ayan and Ansh the other day"** | We drew alternating owners. Wrong. Co-assignees do it **together, the same day**. See the model below. |
| R3 | **"what I didn't like how we are showing the options of 'where from'"** | The store chip grid goes away entirely. The extractor already detects the store, so it becomes a confirm line — "Blinkit · tap to change". |
| R4 | **"no need to show the kitty money this big"** | The big card becomes the AI summary. The kitty figure becomes a tile beside Position and Duty Points — still the tap-through to the ledger. **Conflicts with nav Option A; needs his yes.** |
| R5 | **"the animation should look like coming from the + icon/button"** | The + sheet scales out of the + circle (transform-origin on the button). Applies to the V3.1 FLIP work too. |
| R6 | **"separate section for fridge"** | The fridge becomes its own destination, not a group inside Kitchen. |
| R7 | **"need dark mode"** | The concept was light only. Both modes from here. |

## New features

| # | What | Notes |
|---|---|---|
| R8 | **Photo evidence on a duty** — "if someone didnt do his duty correctly" | Attached to a duty instance. Storage decided in `docs/PHOTOS_SCAN_AI.md`. |
| R9 | **Receipt photos kept** — "so that we have the records" | `spend.receipt_path` exists and has never been written. |
| R10 | **Barcode scanning** — "so we dont need to write the name n quantity again" | Only as good as the product data behind it; see the hit-rate test in `PHOTOS_SCAN_AI.md`. |
| R11 | **The cook, and meals** | Whoever has dishes also tells the cook what to make for lunch and dinner, and orders what is missing. He must be reminded to **declare the plan**, and it shows on everyone's home. |
| R12 | **Moving out** — a real screen | `AUDIT.md` M3: pick the date, confirm, show the frozen final position. Nothing writes `member.left_on` today. |
| R13 | **"proper notifications for everything"** | See `docs/NOTIFICATIONS.md`. |

## Models settled with the advisor

**Guests** — a guest is an absence with the sign flipped, attributed to the host. A `guest` row is
`(household_id, host_member_id, from, to, label?)`, and each guest-night adds **one person-day** to the
host's weight in `presenceWeights` (kitty.ts:71). `allocate()` is untouched and the pool still balances —
the host simply carries more. Guest writes must go through the **same** closed-month trigger as
absences (`private.check_absence_closed()` in `20261004154135_m5_close_guards.sql`), not a copy of it.
Tests: `linesBalance` holds with a guest present, and a guest logged in an open month cannot move a
closed month's shares.

**Two-person duties** — add `group_size` to the duty. The rota is a sliding window of `group_size` over
the existing rotation: six members at size 2 gives (Adnan, Anant)(Ansh, Ayan)(Jatin, Sahid). `assignee()`
becomes `assignees()`. **`chore_event` does not change** — each co-assignee ticks their own row and earns
the points individually, so "only the assignee ticks" still holds per person, Missed is per person,
Offer/Claim is per slot, and your partner is the natural voucher. `fairSharePoints` must account for
`group_size` or expected points come out wrong for pairs.

**Meals** — a role, not a chore name: `plans_meals: boolean` on the duty, so who declares today is
derived from `assignees()`, never matched by the string "dishes". A small `meal_plan` table
`(household_id, date, meal: lunch|dinner, text, by)` — this is not a ledger, so UPDATE is fine.
