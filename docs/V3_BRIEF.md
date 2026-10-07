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
