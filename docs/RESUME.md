# Where the navigation rebuild stands

The tab-navigation milestone is **integrated and walked**. Everything below is still **local only** —
the live app at flathub.vercel.app is on the pre-tabs build and is unaffected. Nothing has been
deployed and nothing touched the hosted Supabase project.

## The shape it landed in

Five tabs, daily things first:

| Tab | Holds |
| --- | --- |
| **Kitty** | balance, top-up card, quick add, avatars, recent entries |
| **Kitchen** | Fridge \| Shopping \| Stock behind one segmented switch |
| **Add** (centre) | opens the /spend modal — an action, not a destination |
| **Duties** | today's duties, the rota, where everyone stands |
| **Spending** | statistics, with the month-card statement archive beneath |

Away, To reimburse, Mates, Favourites, Statements and Record a top-up live behind the people icon
in the Kitty header (`src/app/flat.tsx`).

## What is done

- `nav/stats`, `nav2/shell`, `nav2/kitchen` and `nav2/spending-manage` are merged into `main`.
- Checks green: typecheck, lint, 58 domain tests, `supabase db reset/test db/db advisors` (all `--local`,
  96 pgTAP assertions).
- **All 14 routes walked in a browser and passing** — see the integration report. Deep links resolve,
  `/fridge` `/shopping` `/stock` redirect onto the right Kitchen segment, `/duties/manage` deep-linked
  falls back to the Kitty, and the Add tab opens `/spend` without ever taking the selected state.
- Spending's figures were cross-checked against `/statement/2026-09` and agree to the rupee.
- Screenshots of both themes in `docs/screenshots/nav/` (24 files).

- Both reviews are done: 14 findings, 13 fixed, 2 of the rest refused with a reason and 2 reviewer
  mistakes corrected (see the "Nav review" commits). The two criticals were real — Spending's
  Zepto/local percentages disagreed with the statement for the same month, and the category bars
  were scaled to the widest row rather than to the percentage printed beside them.
- The fridge's "expired" pill is now clay, the same treatment "Threw away" wears in the lot sheet.
  Expiring and low stay warm: a nudge is not a loss.
- A backgrounded Home Screen install now refetches on `visibilitychange` — `useFocusEffect` only
  fires on navigation, so tabs that stay mounted could serve hours-old figures after a resume.

## Still open

1. **Deploy.** Still not pushed and not deployed. The live flat is on the old build.
2. **Android APK** — `eas build -p android --profile preview`, free tier. iPhone sideloading needs
   Apple's $99/year account, so the Home Screen web app stays the answer there.
3. Push reminders for duties would need a service worker, VAPID keys and a Home Screen install on
   iPhone. Deliberately not built.

## Local seed

`/tmp/flathub-m4/seed/run.sh` (refuses anything but 127.0.0.1). `nav.sql` is the third file: it
re-anchors the fridge expiries to the day it runs, adds the one unreimbursed own-pocket spend, and
gives the favourites their default prices. `/tmp` is volatile — copy the seed into the repo if it
needs to outlive this machine.

## Flow upgrades from the Mobbin research

- **Wise / Revolut** — the Spending rhythm: period chips, month bars, category rows as
  name + amount + bar + percent, an average-per-month line.
- **Centr / Alexa** — shopping grouped by section; ticked items drop into a **Bought** block
  instead of vanishing, and can be unticked.
- **Greenlight** — duties manage reads as a sentence ("How often is this chore?") instead of a form.
- **Copilot** — tapping a fridge lot opens its own detail.
- **Refused:** Buddy's donut (colour-codes six categories; fails colourblind readers and print)
  and pairwise settle-up (the kitty replaces it by design).
