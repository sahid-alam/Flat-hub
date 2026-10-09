# V3 build plan

Decisions are settled. This is the order it gets built in, and what only you can do.

---

# WHAT YOU NEED TO DO

Three things. The first takes two minutes and unblocks notifications.

## 1. Turn on pg_cron (2 minutes)

1. Open **https://supabase.com/dashboard/project/odhpvfwvpgwfgqypijnw/database/extensions**
2. Search for **`pg_cron`**. Toggle it on. If it asks for a schema, choose `pg_catalog` (the default).
3. Search for **`pg_net`**. Toggle that on too — it is what lets a scheduled job call our function.
4. Tell me whether each one enabled, or what the error said.

If the toggles are missing or fail, that is the answer we need: cron is not on the free tier, and
notifications move to a different scheduler. Either way, two minutes settles it.

*(The SQL equivalent, if you prefer the SQL editor: `create extension if not exists pg_cron;` then
`create extension if not exists pg_net;`)*

## 2. Send me the basket list

Still blocking the cheapest win in the whole audit. Any format:

```
Amul Taaza milk ₹60
atta 5kg ₹320
onions 1kg ₹50
gas cylinder ₹1,105 — every ~5 weeks
water can ₹40 — 3 a week
```

Twelve to fifteen lines. Rough prices fine. Until this lands, Quick Add is an empty grid for all six of you.

## 3. Scan one barcode and send me the number

You said you scanned an Amul milk packet. Send me the digits underneath it (13 digits, e.g.
`8901262010016`). One real number from your own kitchen tells me more than another database query —
it tells me whether the packets you actually buy are in the database at all.

---

# What I am doing, in order

Design tokens block every screen, so they go first. Everything after fans out in parallel.

| # | Milestone | Depends on |
|---|---|---|
| **B0** | Tokens: the concept palette, type down a notch, dark mode | — |
| **B1** | The floating capsule nav + transitions + the + sheet growing from the button | B0 |
| **B2** | Home: morning summary, three tiles, today, meals card | B0 |
| **B3** | Fridge as its own place; shopping its own place; personal items and leftovers | B0 |
| **B4** | Duties: co-assignment, offer/claim, missed, Manage rework, photos | B0 |
| **B5** | Profile: name, photo, cover, **UPI**, notification settings | B0 |
| **B6** | Product metadata + the real basket seed | your list |
| **B7** | Bills — a new section | — |
| **B8** | Import merged, store picker gone, enum widened to Blinkit/Instamart/BigBasket/JioMart | — |
| **B9** | Notifications | pg_cron answer |
| **B10** | Guests, moving out | — |
| **B11** | Barcode scanning | B6 |

B6 through B8 touch the database and not the look, so they run alongside B0–B5.

---

# Decisions taken from your answers

### Kitchen is gone as a word
Fridge, Shopping and Meals are three separate places. No hub, no segmented switch.

### The kitty tile stays a tile
Confirmed. It keeps the brass and remains the only brass thing on Home, so it is still the door
to the ledger.

### The morning summary is computed, not generated
"Will try to use LLM as little as possible." So it is templated from facts the app already holds —
free, instant, works offline, and cannot invent a rupee figure. The phrasing varies by what is true
that day rather than by a model. If it gets stale in a month, an LLM can rephrase it later behind a
guard that every number must match the ledger.

### Duty photos
Supabase Storage, compressed on upload, **auto-deleted after 2 months**, and **immutable once
submitted** — you can swap the photo before you send it, nobody can remove it after. The retention
job is one more pg_cron line. See `docs/PHOTOS_SCAN_AI.md` and the retention design below.

### Barcode
Scan once, name once, and the flat's own list fills up. Open Food Facts is prefill only — 66% hit
rate on Indian products and the names come back wrong when they come back at all.

### Notification settings
A section in Profile. Per trigger: **sound**, **silent in the bar**, or **off**. The important ones
cannot be switched off.
**One honest limit:** sound and vibration are controlled by the phone's own notification settings on
iOS, not by the web app. On Android we can set them per notification. So for iPhone users these
switches control *whether* a notification arrives, not how it feels. That is a platform limit, not a
decision.

---

# Bills — the new section

You described it precisely, so this is your model, not mine:

> "I have added a Wi-Fi bill for 600. When I put in a 600 bill, it will be split among everyone, so
> each person pays me 100. I will have the 600, and I'll pay the Wi-Fi bill."

- **Anyone can add a bill.** The person adding it is the one paying the vendor.
- The amount splits equally among the current flatmates.
- Everyone else owes their share **to the person who added it**.
- Each share is settled individually and tracked until it is.

Current bills: **cook, electricity, Wi-Fi**, and whatever you add later.

### This contradicts CLAUDE.md, deliberately

CLAUDE.md says: *"Don't import the report's pairwise-split machinery... This flat uses a pooled kitty."*
Bills are exactly that machinery — a payer, per-person shares, and a debt until settled.

That rule was written about **groceries**, and it is still right there: the kitty stays pooled, with no
per-expense splits and no mate-to-mate debt. Bills are a different ledger with a different shape, and
you have described the shape you want twice now.

So I am scoping the rule rather than deleting it: **pairwise splitting is banned in the kitty, and is
how bills work.** I am making that edit to CLAUDE.md as part of B7 and flagging it here so it is not a
quiet change to your non-negotiables. Say the word if you would rather bills came out of a second pot
instead.

### Shape

- `bill` — id, household_id, label, total_paise, **paid_by**, occurred_on
- `bill_share` — bill_id, member_id, paise. Written once with the bill, largest-remainder split so the
  shares always sum to the total exactly.
- `bill_payment` — append-only, who settled which share and when. A mistake is corrected with a
  negated reversing row, never an UPDATE, exactly like `pool_entry`.

Equal split among current members, not presence-weighted — rent and Wi-Fi do not get cheaper because
someone went home for a weekend. If the cook should work differently, that is a later switch.

---

# Google Drive — you may be right, and it is worth 30 minutes to find out

My report said Drive was a trap because a Testing-mode OAuth app issues refresh tokens that expire
after 7 days. You pushed back: publishing the app fixes that, and your friend has it working.

You are probably right, and the detail that decides it is **which scope**. `drive.file` — access only
to files the app itself created — is a *non-sensitive* scope, which means publishing may need no
Google review at all. The scopes that trigger the verification ordeal are the ones that read a user's
whole Drive, which we never need.

So this is being re-checked properly rather than dismissed. If `drive.file` clears it, Drive becomes
a real option and you get photos in a folder you own. **It does not block anything:** photos are
being built against Supabase Storage behind a small interface, so Drive can be added later as a
destination — or as an export — without touching the screens.

---

# Still open

1. **pg_cron** — the two toggles above.
2. **The basket list.**
3. **One real barcode** from your kitchen.
4. Whether bills should be presence-weighted for the cook specifically.
