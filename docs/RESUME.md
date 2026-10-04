# Where the navigation rebuild stopped

Paused 5 October 2026, part-way through the tab-navigation milestone. Everything below is
**local only** — the live app at flathub.vercel.app is still on the pre-tabs build and is
unaffected.

## The decision that was made

Five tabs, daily things first (the user chose this over an earlier plan that buried duties):

| Tab | Holds |
| --- | --- |
| **Kitty** | balance, top-up card, quick add, avatars, recent entries |
| **Kitchen** | Fridge \| Shopping \| Stock behind one segmented switch |
| **Add** (centre) | opens the /spend modal — an action, not a destination |
| **Duties** | today's duties, the rota, where everyone stands |
| **Spending** | statistics, with the month-card statement archive beneath |

Away, To reimburse, Mates and Favourites moved behind the people icon in the Kitty header
(`src/app/flat.tsx`).

## What is done

- Three build branches finished and merged into `main`: `nav2/shell`, `nav2/kitchen`,
  `nav2/spending-manage`, plus `nav/stats` (the stats domain, `src/domain/stats.ts`).
- `main` is at a WIP commit. Typecheck, lint and 58 domain tests pass.

## What is NOT done — do these on resume

1. **Walk all 14 routes in a browser.** This is the important one: the milestone moved every
   screen, and nothing has been clicked yet. `/spend /topup /import /favourites /fridge /stock
   /shopping /duties /duties/manage /away /reimburse /mates /statement /statement/2026-09`
2. **Screenshots** of all five tabs, each Kitchen segment, and the new flows, dark and light,
   into `docs/screenshots/nav/`.
3. **The two reviews** — navigation/regression and design QA — then the fix pass.
4. Confirm the Spending figures match the month statement for the same month.

## Flow upgrades from the Mobbin research (board row at the bottom of the design canvas)

- **Wise / Revolut** — the Spending rhythm: period chips, month bars, category rows as
  name + amount + bar + percent, an average-per-month line.
- **Centr / Alexa** — shopping grouped by section; ticked items drop into a **Bought** block
  instead of vanishing, and can be unticked.
- **Greenlight** — duties manage reads as a sentence ("How often is this chore?") instead of a form.
- **Copilot** — tapping a fridge lot opens its own detail.
- **Refused:** Buddy's donut (colour-codes six categories; fails colourblind readers and print)
  and pairwise settle-up (the kitty replaces it by design).

## How to resume

```
Workflow({scriptPath: "~/.claude/projects/-Users-sahidalam-Developer-Personal-POS-FlatHub/e4aeb237-1ac2-493a-b270-dfc92ca7d409/workflows/scripts/flathub-nav-v2-wf_aff63e2a-39b.js",
          resumeFromRunId: "wf_aff63e2a-39b"})
```
Finished agents replay from cache; the integrator and everything after it run live. The local
Supabase stack must be up first (`pnpm supabase start`), and Docker with it.

## Still open, unrelated to this milestone

- **Android APK** — `eas build -p android --profile preview`, free tier. Worth doing once the
  tabs land. iPhone sideloading needs Apple's $99/year account, so the Home Screen web app
  stays the answer there.
- Push reminders for duties would need a service worker, VAPID keys and a Home Screen install
  on iPhone. Deliberately not built.
