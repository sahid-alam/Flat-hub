# V3 plan

What V2 shipped was a correct ledger with a navigation bar bolted on. V3 makes it an app the six of
them want to open. The brief is `docs/V3_BRIEF.md`; the evidence is `docs/AUDIT.md`,
`docs/NATIVE_FEEL.md`, `docs/PATTERNS.md` and `docs/IMPORT_OPTIONS.md`.

Nothing below is started. The concept drawings (`docs/design/concept.html`) come first, and the owner
corrects them before any code is written.

---

## The four things wrong, in his words

1. **"this doesn't have a proper home screen."** The app opens on a ledger. There is no home.
2. **"It feels like a website, then a real app."** Nothing animates, and cold start is 3.2 seconds of
   blank canvas on a mid-range phone.
3. **The colours, and type "a little big, not too big."**
4. **Things are in the wrong places** — the shopping list buried in Kitchen, UPI unfindable, the Zepto
   import five taps deep, the treasurer blind to his own work.

Everything in the sequence below is traceable to one of those.

---

## Sequence

Each milestone is shippable on its own. Money rules get a runnable test, per CLAUDE.md.

### V3.0 — Concept review *(no code)*
The screens drawn and corrected before anything is built. **← we are here**

### V3.1 — The shell
Palette, type scale down ~10–15%, the floating capsule nav, and motion. None of it depends on which
screens survive, because colour and type live as tokens in `src/ui/kit.tsx`.

- The chosen palette as tokens. One accent per screen survives.
- **Transitions**, which are already in the bundle and switched off: `animation: 'shift'` on the tabs,
  and the `expo-router/js-stack` platform split for real stack and sheet transitions. See
  `docs/NATIVE_FEEL.md` §A1 — the single biggest perceived-quality win available.
- **The capsule nav**, built as FLIP (measure once, move with transforms). Never animate `width`:
  that bulges the row 19px mid-flight and snaps 27.5px on a double tap.
- **Cold start.** 3,178ms LCP at 6× CPU on Slow 4G, almost all render delay, 620ms of it fonts. Paint
  a shell immediately and fill it in.
- Two small repairs found along the way: the browser's own black focus ring on the amount field, and
  long-press-to-reverse fighting the browser's text-selection and context menu on a phone.

### V3.2 — Home
The screen that does not exist. Asana's skeleton plus Zopa's snapshot block (`PATTERNS.md` §1).
Personalised: what *you* are owed or must pay, *your* duty points, today's duties, expiring lots, a
one-row Quick Add, Recent. Exactly one alert card, and only when there is something to say.
Ansh sees a treasurer's version.

Kills the complaint directly, and retires the `/flat` sheet he disliked.

### V3.3 — Profile
A missing feature, not a restyle. Name, photo, cover, and **the UPI ID that is currently unfindable**.
Absorbs the personal things from `/flat`. Hypelist + CRED (`PATTERNS.md` §2).

### V3.4 — Product metadata and the real basket
Unblocks four dead things at once. Nothing in the app writes `category`, `min_qty`, `track_stock` or
`base_unit`, so **Spending's category chart is one grey "Other" bar in production** and the low-stock
list can never render (`AUDIT.md` §0, confirmed). Add the editor, then seed the flat's actual basket
including the gas cylinder and water cans.

**Blocked on him:** the basket list and the real prices.

### V3.5 — Import, merged and widened
One action that takes a screenshot or a photo — he is right that these were two buttons doing one job.
Then widen the `source` enum beyond `'zepto'` (one `CHECK` at `kitty.sql:51` plus ~10 files); the
extractor's prompt already names Blinkit and Instamart, so **Blinkit, Instamart and BigBasket import
ships in an afternoon for ₹0** (`IMPORT_OPTIONS.md` §8).
Plus the per-line **"this one's mine"** toggle for the 11pm case where a mate's own chips ride on the
flat's bill (`AUDIT.md` M1).

### V3.6 — Kitchen, reorganised
The shopping list stops being buried. The fridge gains **personal items** (tracked as that person's own
spend, never the kitty) and **leftovers**. Deep-link buttons to Zepto/Blinkit from the shopping list —
opening the app works, adding to a cart does not.

### V3.7 — Duties
The date strip from ref-1. The **inert tick** — someone else's turn shows a muted ring and "Adnan's
turn", never a tap that gets rejected. **Swipe** for Skip and Swap, with buttons kept as a second route.
Co-assignment for 2–3 people. Rota reordering behind an explicit Edit, or it fights the swipe. A real
Add form. Swap must work on a future duty, not just today's.

### V3.8 — Spending, and the stat vocabulary
2-up tiles, the dot-matrix grid, big figures (`PATTERNS.md` §4). Also fixes **"₹166.67 a head"**, which
divides by six flat while the statements divide by presence-weighted days — two different numbers for
the same month in two places (`AUDIT.md` G8).

### V3.9 — People
Guests add a share; a leaving date with a final settle. Both touch `presenceWeights`, so they are one
job, and both need a test that fails if fairness breaks.

### V3.10 — The second pot for bills
Last, deliberately. The largest item, and the one most likely to feel different after living with the
rest. Raising the top-up and recording bills as ordinary spends gets ~90% of it for a tenth of the work;
he has chosen the separation knowingly.

### V3.11 — Android APK
`eas build -p android --profile preview`, free tier. iPhone stays a Home Screen web app — sideloading
needs Apple's $99/year account.

---

## Not being built, and why

| Asked for | Why not |
|---|---|
| Import or link a Zepto/Blinkit **cart** | No vendor publishes a cart or order API. Share-cart links are their own feature with server-minted tokens we cannot create or read. (`IMPORT_OPTIONS.md` §1, §4) |
| "Add our card" to Comparify | Comparify is real and covers every app he named, but it takes no payments — it only deep-links onward. There is no card to add. (§5) |
| Scraping prices | Blinkit's terms forbid data mining and derivative use of prices; it 403s every non-browser request. (§6) |
| A paid aggregator API | ₹500–₹24,000, resells scraped data, catalogue only — no cart, no orders. It cannot do what he asked. (§7) |
| ref-2's trend curve | No axis and no units; it decorates rather than informs. (`PATTERNS.md` §4) |
| ref-5's progress ring | The kitty has a balance, not a goal. A ring implies a target that does not exist. (§4) |
| A radial/arc + menu | No shipping app uses one, because of where a thumb sits at the bottom centre. Pinterest's three-tile sheet instead. (§7) |
| Pairwise settle-up | Forbidden by CLAUDE.md; this flat pools by design. |
| Push reminders | Needs a service worker, VAPID keys and a Home Screen install on iPhone. Revisit with the APK. |

**Worth one free day:** Swiggy's Builders Club shipped Instamart tools this year — `search_products`,
`get_cart`, `get_orders`, `checkout`, free to prototype. Two unknowns their docs do not answer: whether
`get_orders` is itemised, and whether it reads a *flatmate's* account or only the developer's. Not
promised to anyone until both are settled.

---

## Open questions

1. **"the Escape option should also show Suraj for that day."** Read as Skip, but there is no Suraj
   among the six. What should Skip show?
2. **The basket list and prices** — blocks V3.4, the cheapest real win on the audit.
3. **The palette** — four directions are drawn; none chosen. Blocks V3.1.
4. **Nav destinations.** V3 adds Home and Profile to a bar built for five. Both candidate answers are
   drawn in the concept for him to pick.
