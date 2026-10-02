# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users
Six flatmates sharing a flat in India; one or two use iPhones, the rest Android. Each opens the app for a few seconds at a time: right after buying dahi or milk downstairs, after a Zepto order lands, or on the 1st when it's time to top up the kitty. The treasurer, **Ansh Rastogi**, also uses it to see who he owes for own-pocket purchases and to mark them paid back.

## Product Purpose
A shared kitty for groceries and common items. Each mate tops up ₹2,000 a month to Ansh; spends come out of the pool or out of a mate's pocket (then reimbursed). The app answers: how much is left, who has put in what, who needs to top up and by how much, and what Ansh still owes. Success means nobody keeps a spreadsheet and nobody argues about the books at month end.

## Positioning
A pooled kitty, not a split engine: one identity (Σ position = pool cash) replaces per-expense splits and mate-to-mate debts. Shares follow days present in the month (absences of 3+ days count), so a mate who was away tops up less, automatically.

## Operating Context
- Groceries are mostly Zepto orders plus small daily local buys (dahi, milk, bread, eggs).
- Top-ups are paid to Ansh over UPI; the app opens a prefilled `upi://pay` link.
- Absences are logged by the mate; entries logged after the absence began are shown as "added late". Nobody approves them.
- Month statement is read-only and visible to everyone.

## Capabilities and Constraints
- Money in integer paise; ledgers are append-only (corrections are reversal rows).
- ₹ amounts use Indian digit grouping (₹1,23,456).
- Any mate can record a top-up or a spend; only the treasurer sees "mark reimbursed".
- Out of scope for M1: Zepto import, quick-add favourites, stock, fridge, duties, bills, offline sync.

## Product Principles
1. One-tap entry: logging a ₹30 dahi must be faster than remembering it.
2. The balance is readable at a glance from across the room.
3. Fairness is visible without becoming a scoreboard: no leaderboard, no ranking of mates.
4. The books never lie: every number on screen comes from the same domain functions the tests check.

## Accessibility & Inclusion
Touch targets ≥ 48px. Works in light and dark mode.
