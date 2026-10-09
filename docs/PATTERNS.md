# PATTERNS — what to steal, from which app, for which FlatHub screen

Source: the six annotated references in `ui-refs/`, matched against real shipping apps found on Mobbin.
Every recommendation below names an app you can open. Nothing here is generic advice.

The six flatmates are **Sahid, Ansh, Adnan, Anant, Ayan and Jatin**. Ansh Rastogi is the treasurer.
The real screens are the five tabs — Kitty (`src/app/(tabs)/index.tsx`), Kitchen, Add, Duties, Spending —
plus `/topup`, `/spend`, `/reimburse`, `/statement/[month]`, `/mates`, `/away`, `/import`, `/duties/manage`.

**Four house rules override every pattern below.** Where a pattern breaks one, the fix is written out:

1. One accent per screen (brass). The tab bar is chrome and sits outside that budget.
2. Colour never carries meaning alone — every state also has a word.
3. No per-mate leaderboard. Top-ups are initials with ✓/○, alphabetical, no amounts, no ranking.
4. Pooled kitty, never pairwise debt. There is no "Adnan owes Ayan ₹300" in this app, ever.

---

## 1. HOME / DASHBOARD — the missing screen

The complaint is right: the app opens on the Kitty ledger, which is a *document*, not a home.
ref-4 ("Perfect Example") is a greeting + snapshot + today stack. Three apps ship exactly that shape.

**Build first: [Asana's home](https://mobbin.com/screens/53b9bc89-e6fe-4844-8476-93e1ad99d0c5).**
It is the closest structural match to ref-4 and the cheapest to build: date line → "Good morning, Sam" →
one *alert* card ("A task is due in 3 days") → "My tasks" with a filter dropdown → Recents. Swap in:

- `Fri, 7 November` / **`Good morning, Sahid`** — small date, large greeting, no avatar needed at the top.
- One alert card, and only when there is something to alert: **"₹340 to get back from Ansh"** with a *Statement* button,
  or **"Your ₹2,000 top-up isn't in yet"** with a *Pay Ansh* button (the existing `upi://pay` link).
  Note the wording: rule 5 of DESIGN.md says *"Pay"/"Get back"*, never *"owe"*. So the first card reads
  **"₹340 to get back from Ansh"**, not "Ansh owes you ₹340".
  Asana shows one and only one. Copy that discipline — never two alert cards.
- **"Today in the flat"** — today's duties, each with whose turn it is, and expiring lots from the fridge.
- **"Recent"** — the last four pool entries, tappable through to the Kitty tab.

**Take the snapshot card from [Zopa Bank](https://mobbin.com/screens/4c79c7fd-77a4-45d2-a6ff-53265b2954d0).**
A dark header block with just `Hi Sahid`, then two cards that each carry one figure and a circular arrow
affordance. That is FlatHub's figures exactly: **In the kitty ₹11,400** and **Your position +₹340**. Add a third,
because the owner asked for it by name — **Your duty points 412** — as a plain figure beside the position,
not a ranking against the other five (rule 3).
Zopa also ships the empty case inline — "No upcoming payments" as plain text under a heading — which is the
right weight for a home screen (full illustrated empty states belong on destination screens, see §5).

**Take the personal framing from [Withings Health Mate](https://mobbin.com/screens/6d692992-1c7c-4c7d-8b8b-53727f300aa9).**
"Good morning, John" → "Today's Missions" as a checkable list → "Latest Measurements" with the figure
*inside* the row. FlatHub's "Today's Missions" is your duties, and the mission rows have the one property
the owner asked for: only *your* rows are tickable.

**Leave:** [Lloyds](https://mobbin.com/screens/ab46bcea-57a7-41ad-8175-805fc86efc26) stacks nine account
cards — nothing is primary. [ClickUp's dashboard](https://mobbin.com/screens/e24a00f3-4beb-4c42-aaaf-548c3173b7ab)
is user-configurable widgets; six flatmates will never configure a dashboard. Ship one fixed layout.
[Kit](https://mobbin.com/screens/856cdd7d-789a-4b27-b75f-779f4d36d326) throws scattered draggable widgets at
you — charming, unreadable, and it breaks the one-accent rule four times over.

**Conflict:** ref-4 colours everything peach — chart, budget tile, spent tile, three status pills.
FlatHub gets **one** brass element on home. Make it the kitty figure block. The position figure, the
duty rows and the recent list are all `surface`/`raised` with ink and muted text.
Rule 3 also kills ref-4's "2+" avatar stacks with progress bars per person — on Duties, use the existing
`Avatars` component (alphabetical, ✓/○, no amounts).

**ref-1's date strip:** keep it, but put it on **Duties**, not home. Home is "today" and nothing else;
a date strip invites scrolling through a week of chores, which is the Duties tab's job.
[Structured](https://mobbin.com/screens/26fae4e6-2163-4d93-8c47-5bd9839cb369) is the better reference than
ref-1: date strip, then a *time gutter* with a connecting rail down the left and a tick circle on the right
of each row. That rail is what makes ref-1's timeline read as a day rather than a list.
[Microsoft Outlook](https://mobbin.com/screens/3a21d1a0-0bec-472b-9c07-8a33dddf45cf) shows the cheaper
version: date strip + date-grouped rows, no gutter. Start there; add the gutter if duties get times.

---

## 2. PROFILE — "I can't see anywhere where I can add my UPI"

There is no profile screen at all today; `/mates` lists the household. This is the biggest functional gap
of the seven.

**Build first: [Hypelist's profile](https://mobbin.com/screens/70c0caa3-220d-453a-8fb2-093c88304d09).**
Cover photo bleeding behind a circular avatar that overlaps the card edge, name, handle, one line of bio,
then a row of stats and an **Edit Profile** pill. It is exactly ref-3's profile card with a cover image
added, and it is one screen. FlatHub's version:

- Cover image (optional, from the camera roll), avatar, **Sahid**, `@sahid`.
- Instead of "5 following / 0 followers": **`Joined Mar 2025`** and **`412 duty points`** as two plain stats.
  Two numbers, no ranking against the other five. Rule 3 holds.
- An **Edit profile** pill, not inline editing.

**Take the edit form from [X](https://mobbin.com/screens/766c9852-1c75-406e-9c40-d36a4e827f23).**
Cancel / Edit profile / Save header, cover image with a camera badge, avatar with a camera badge, then a
plain label-and-value list. The pattern worth copying specifically: **the camera badge sits on both images**,
so "change the background picture" needs no explanation. [Whatnot](https://mobbin.com/screens/58e720f5-c656-4845-b0e1-16e02af7f0c6)
does the same with a required-field marker, which FlatHub needs for Name.

**Take the UPI row from [CRED](https://mobbin.com/screens/8fbbea30-c3a1-439c-b4b8-7094ad394411)** — the one
Indian reference in this sweep, and it is already dark. "linked UPI accounts" → bank cards with a masked
account, a *primary account* chip, and an `Add bank account` outline button. FlatHub only needs one field,
not a bank linkage: **`UPI ID — sahid@okhdfcbank`** with an *Edit* chevron, and under it a line of copy that
earns it: *"Ansh pays you back here."* That sentence is the whole reason the field exists.
[Starling](https://mobbin.com/screens/ce39716e-8da6-4714-961d-5c787d65d2ea) shows the grouping to use around
it: one card of personal details, then a separate card of settings rows with a title and a subtitle each.

**Leave:** [Instagram's edit profile](https://mobbin.com/screens/968761ca-7201-48ba-a822-06e3f5c6620a) has
eleven fields; [Shop](https://mobbin.com/screens/6eeea5e4-c6f4-4c0d-aaa9-aa82998c6255) has shoe size. Six
flatmates need: name, photo, cover, UPI ID, notification toggles, Away dates (link to `/away`), sign out.
Seven rows. Resist the rest.

**Where it lives:** the avatar in the home header, top-right, like
[Withings](https://mobbin.com/screens/6d692992-1c7c-4c7d-8b8b-53727f300aa9) and
[Deel](https://mobbin.com/screens/cf5f0f21-c5e6-443a-93d0-ffb021425ff7). Not a sixth tab — the five-tab
shell is right.

---

## 3. CHORES / ROTA — swipes, co-assignment, reordering, a real add form

**Build first: [GoHenry's "Add a task"](https://mobbin.com/screens/1e92107f-045b-4c3d-8f9b-84829a7f82d9).**
This is the duty form, already drawn. Task name field → **Amount** as four chips (£0.50 / £1 / £1.50 / other)
→ **Frequency** as three chips (Daily / Weekly / One-off) → one full-width Add button. Rename Amount to
**Points** (1 / 2 / 3 / other) and Frequency to the real cadences in `src/domain/duties.ts`
(`every_days` / `weekdays`), add a **Who's in** row of the six initials as multi-select chips, and the form
is done. It maps straight onto FlatHub's existing `Choice` component — 48pt pill chips with a check on the
selected one. No pickers, no modal stack.

GoHenry is worth a second look for another reason: it is the only app in this sweep that has already solved
*who may tick a chore off*. [Its permission screen](https://mobbin.com/screens/5f0fbb1d-6266-49e1-bec2-678ddebb3cd2)
asks "Who would you like to tick off completed tasks?" as a two-option radio. FlatHub doesn't need the
question — the rule is fixed, only the assigned mate ticks their own duty — but it needs the *consequence*:
an unticked circle on someone else's row must be visibly inert, not just rejected on tap. Render it as a
muted ring with no press feedback, and put the name beside it: `Adnan's turn`. The existing Duties screen
already writes `${who}'s turn`, so the wording is there.

**Swipe actions: [Shopee's chat list](https://mobbin.com/screens/cc2f6159-8bee-4851-b2d7-c76b0f37a12f).**
Three stacked colour panels revealed by one left swipe (Unread / Mute / Delete). It is the only
*multi-action* swipe in the sweep — every other result (X, GoFundMe, The Atlantic, MyFitnessPal) reveals a
single red Delete. Take the three-panel geometry; FlatHub needs exactly two: **Skip** and **Swap**.

Two things to get right, because a swipe that ships wrong is worse than the buttons it replaces:

- **Rule 2 applies inside the panel.** Each panel carries its word, not just a colour. `Skip` on `warnBg`,
  `Swap` on `raised`. Neither is `negative` — clay means a failed save, and a skip is a legitimate outcome
  (`outcome: 'skipped'` in the domain), not an error.
- **Swipe is never the only way.** Keep the existing Skip/Swap controls reachable by tapping the row open.
  A swipe-only action is invisible to a flatmate who has never been told it exists, and five of the six
  will never be told.

Swap needs a target. Use the picker from [Attio](https://mobbin.com/screens/4acba944-a96d-4cec-bbe9-48c82e5e8d16):
an "Edit Assignees" sheet, searchable, with a check on each chosen person. FlatHub's version is five rows
(everyone but you), no search box, and it is the same sheet that answers **multiple people on one duty** —
check two, and both names appear on the row. The data model already allows this reading: a `chore_event`
carries one `member_id`, so a two-person duty becomes two rows under one duty name rather than one row with
two owners. Cheaper, and it keeps "only the assigned person can tick it" true per row.

**Reordering the rota: [Freeform](https://mobbin.com/screens/b5b4b8a5-3571-4224-8381-825515a5ad79).**
A three-line grab handle on the right of each row and a red minus on the left, in an explicit edit mode.
Note what it *isn't*: a long-press-to-drag on the live list. With swipe already bound to Skip/Swap, drag
must live behind an **Edit** button on `/duties/manage`, or the two gestures will fight.

**Leave:** [Me+](https://mobbin.com/screens/6e2bf356-c595-4b72-9881-c75fc79e7ccf) gives every chore its own
pastel row colour — seven accents on one screen, and the colour means nothing. Straight into rule 1.
[Angi](https://mobbin.com/screens/c80853ab-e6a7-489e-999f-ac6bc0162e14) has a good greeting header
("Hey Jessica, let's check off your home to dos") but its rows are checkbox + title + chevron with no owner —
useless for a rota. [Todoist](https://mobbin.com/screens/8643e852-4778-4536-9378-a5f4e0997f16) and
[ClickUp](https://mobbin.com/screens/ecb1790e-e9b8-494c-8022-224b41476d34) are project tools; their
Overdue-in-red treatment conflicts with the house wording ("Not yet", never "Overdue").

---

## 4. STATS — ref-2's vocabulary, in onyx

ref-2 is a light fitness app. The best *dark* execution of the same vocabulary is
**[Bevel](https://mobbin.com/screens/ac7933a1-0142-40f5-9b84-41c875470981)**, and it should be the model for
the Spending tab.

**Build first: Bevel's dot-matrix month grid.** Two months side by side, 7 columns, one lozenge per day, with
a three-step legend underneath (`1 activity` / `2 activities` / `3+`). It is ref-2's "Activity Grid · Last 5
Weeks", done dark, and it is the single highest-value chart for FlatHub because it answers a real question
at a glance: **which days did this flat spend nothing?** Render it as spend-days per month on Spending, and
as duty-completion days on a duty's detail.

Rules 1 and 2 reshape it: Bevel uses lime / teal / grey, three hues carrying the whole meaning. FlatHub uses
**one hue at three opacities**, with the legend spelling out what each step is.
That hue is **ink**, not brass — the filled stat tile below is the tab's one accent, and a brass grid plus a
brass tile is two. Grid in `ink` at 100% / 55% / 20% over `raised`; brass stays with the tile.

**Take the stat tiles from [Gentler Streak](https://mobbin.com/screens/81ddb60b-a773-448c-b64a-92cef5221268).**
Four tiles, 2-up, and **exactly one is filled** — the one you have selected — while the other three stay
grey. This is ref-2's filled "Duration" card and ref-4's budget/spent tiles, except it comes with a reason
for the fill, and that reason happens to satisfy rule 1 for free. FlatHub's four: **Spent this month**,
**Left in kitty**, **Entries**, **Avg per day**. Tapping one fills it and redraws the chart above — which is
also the §6 interaction, done cheaply.

**Take the streak hero from [Strava](https://mobbin.com/screens/1c996718-ab94-4247-85b3-80885bab44c9).**
Big numeral, a one-word unit under it, and a seven-circle M-T-W-T-F-S-S row where done days are filled.
That is ref-2's "24 Day Streak" with a week strip attached. FlatHub's honest streak is **not** "days without
spending" (nobody wants that) — it is **"days every duty got done"**, and it belongs on Duties, as a flat
figure with the word under it. [adidas Running](https://mobbin.com/screens/9d27ac65-a9fa-4bad-98e6-3b48462e1337)
shows the restrained version: `1 week / 5 activities / current streak` as three stacked lines, with the flame
kept down to a small icon beside them rather than made the hero.
Take adidas's wording and Strava's week row.

**Bar chart with trend curve:** keep the bars, **drop the curve**. ref-2's curve is decoration — it has no
axis and no units. [stoic.](https://mobbin.com/screens/3f2ab7d0-acd5-4540-91f4-09bfe6fdc861) shows what a
bare bar chart with a right-hand scale and a bolded current day looks like, and it is more legible than ref-2
with no second mark at all. If a trend line must exist, do it as Bevel does on its Activity Summary: one line
with real dots, its own card, and a visible date axis.

**Leave:** [Fitbit's](https://mobbin.com/screens/260cc0b3-2846-4d3f-ac4c-f09837a98310) maroon dot grid — the
dots are near-invisible against the fill. [Me+'s](https://mobbin.com/screens/31f0effa-fda1-4d0d-952a-28a68b7ed083)
Gold/Silver/Bronze badges are a leaderboard in costume; rule 3.
ref-5's big progress ring (habit tracker) is the weakest of the six references for this app — a ring says
"% of a goal", and the kitty has no goal, it has a balance. The one place a ring earns its keep is
**top-ups collected this month: 4 of 6**, and even there two lines of text say it better. Skip the ring.

---

## 5. EMPTY STATES — ref-3's illustrated page

Today's empty strings are bare sentences (`'No duties due today.'`). ref-3 wants a drawn page.

**Build first: [Buddy](https://mobbin.com/screens/23b3306f-840e-409a-821e-87710d8a6243)** — and look at it
twice, because Buddy is a *shared household budget app* and the only direct competitor in this sweep. Its
empty state is: month stepper (`December 2023 / NO TRANSACTIONS`), a three-card illustration, **"No
transactions... Yet."**, one line of body, and a full-width dark **+ Add transaction** button. That is the
whole template for `/statement/[month]` with no entries, and for the Kitty tab in a fresh month.

Buddy's [second empty state](https://mobbin.com/screens/698ca92d-15f8-4e14-822d-46913061e5d2) is worth
stealing outright for FlatHub's onboarding gap: two tilted avatar cards showing other people's categories,
headline **"Budget together"**, body *"Invite your partner, roommate or anyone else…"*, and an
`Invite budget member` button. FlatHub's version sits on `/mates` before all six have joined.

**The shape to standardise on**, which every good result here shares — Buddy, [Coinbase](https://mobbin.com/screens/28f76e7d-e27b-4577-8a05-cd55ae306e65),
[Ubank](https://mobbin.com/screens/0f38d793-9dc5-4c87-b22f-c4c0290797fa),
[Acorns](https://mobbin.com/screens/693af295-5f32-4bd8-a19c-ac4eeb7a38fd): **illustration → headline →
one line of body → one action.** Never two actions. Write them now, one per screen:

| Screen | Headline | Body | Action |
|---|---|---|---|
| Kitty, new month | Nothing out of the kitty yet. | Entries show up here the moment someone logs a spend. | Log a spend |
| `/reimburse` (Ansh) | Nobody's out of pocket. | When a mate pays from their own pocket, it lands here for you to pay back. | — |
| Duties, all done | Every duty's done today. | Next one is Adnan's, tomorrow. | — |
| Fridge | The fridge is empty. | Put away a Zepto order and the lots show up here. | Import an order |
| `/statement/[month]` | No entries in March. | — | View another month |

Two of those have no button, and that is correct: "Nobody's out of pocket" is good news, not a task.
[Redfin](https://mobbin.com/screens/97b08a0e-8fbd-4f9c-a62f-5f7027d02dc0) and
[Meetup](https://mobbin.com/screens/2a0f499b-355f-4dc0-a999-fd559fdfbefd) both use a plain text link instead
of a button when the action is secondary — use that for `View another month`.

**Illustration style:** the flat vector people of [Upside](https://mobbin.com/screens/157753ab-fbc1-4edd-9a7b-021cf92a9662)
and [Zomato](https://mobbin.com/screens/6c5bfb79-1c18-4a88-ac6a-9d4d68edfafc) will cost you a designer and
will fight the onyx canvas. ref-3's own answer is better and matches this app: a **single line-drawn object**
(a ticket, a torn stub) in one colour. Draw one object per empty screen — an empty bowl, a flat wallet, a
broom at rest — as a stroked SVG in `muted`, 96–120pt. One colour, no fills, works in both modes, and the
brass stays free for the action.

**Leave:** [GoPay's](https://mobbin.com/screens/792ad5c3-2d43-436c-be26-a482ffb3be31) full-bleed mascot
illustration — too loud, and it needs an illustrator on retainer.

---

## 6. EXPANDING CARD → SHEET (ref-6)

**Build first: [Copilot Money](https://mobbin.com/flows/a7d67c9d-bf99-4969-8044-850102ba71ef).**
Tap a card in a list, the list dims behind a scrim, a rounded sheet rises with a grab handle, and the sheet
leads with the *same artwork* that was on the card — the orange Discover tile — above its figures (balance /
limit / utilised), a full-width chart, and one action. This is ref-6's frame-by-frame expansion, shipped, in
a money app.

What makes it read well, and what ref-6 is actually showing you across its eight frames:

1. **The card's own content arrives first.** In ref-6 the "363.2k total volume" figure is legible in the
   second frame, before the sheet has finished travelling. Copilot does the same with the card tile. The
   sheet is not a new screen that loads — it is the card, grown.
2. **The list stays visible and dimmed.** Both ref-6 and Copilot keep the source list behind a scrim.
   FlatHub already has a `scrim` token for this.
3. **A grab handle at the top**, from the first frame, so the way out is obvious before the motion ends.

Where to use it in FlatHub, in order:
**(a) A pool entry on the Kitty tab** → sheet with the amount, who paid, pool or own pocket, the lot lines
from the receipt, and `Reverse this entry` (which writes a reversing entry — never a delete).
**(b) A duty row on Duties** → sheet with its cadence, its points, the last six outcomes, Skip / Swap.
**(c) A `MonthCard`** → the month's statement. The existing `MonthCard` with its giant Righteous month name
is already the best-looking card in the app and the obvious thing to expand.

**Take the cheap version from [Gentler Streak](https://mobbin.com/flows/cdfe56f0-afc7-4850-93d6-a0b9240cf80b)**
if the sheet is too much work for v1: tapping a tile fills it and redraws the chart above, in place, no sheet
at all. Same gesture, same feedback, a tenth of the code — and it is already §4's stat tiles.

**Implementation note:** this is one shared-element transition, not a bespoke animation per screen. Build it
once, as a `Block` that can expand, and the three uses above are configuration. The `Block` component already
has the 0.97 press scale, which is the first frame of ref-6 for free.

**Leave:** [Perplexity's app detail](https://mobbin.com/flows/220a0b42-6129-4b5d-97d6-35c61def2694) is a full
push navigation dressed as a card tap — the card does not expand, the screen replaces. That is what FlatHub
does today, and it is the thing the owner is complaining about.

---

## 7. OVERFLOW FROM THE FLOATING NAV

The owner's idea: tap the centre +, a squarish rounded menu comes up with the actions that don't fit.

**Build first: [Pinterest](https://mobbin.com/screens/8179c54b-06e0-4032-a69b-3ff497a9d05e).** The centre
button raises a short bottom sheet with a close X, the title **"Start creating now"**, and exactly **three**
rounded-square icon tiles in a row (Pin / Collage / Board). It is literally the "squarish, rounded-corner
menu" described, it is the pattern most phone users have already met, and it is about forty lines of code.

FlatHub's four tiles, replacing the current two-option modal in `src/app/(tabs)/_layout.tsx`:
**Log a spend** · **Import a Zepto order** · **Top up the kitty** · **Scan a receipt**.
Four fits one row at 2-up on a narrow phone, or one row of four at 48pt tiles. Do not go past six.

**Take the plain-list fallback from [Obsidian](https://mobbin.com/screens/93c23c06-f037-4143-a56d-e2a4d91ab315)** —
three stacked full-width pills and a Close. Less pretty, zero ambiguity, and it is what to ship if the icons
for "Top up" and "Log a spend" turn out to be indistinguishable at 24pt. Which they will. Label every tile.

**On the radial / arc idea: don't.** No app in this sweep ships one, and that is the finding. The reason is
mechanical: the centre of the tab bar is at the bottom-centre of the screen, so an arc of buttons puts half
its targets under the thumb's own knuckle and the other half at a distance that requires a grip change. A
sheet rising from the bottom puts every target in the same reachable band.
[Docusign](https://mobbin.com/screens/97cf44d9-c61a-4b69-8832-b504883f3ca6) shows the other failure mode — the
centre + opens a *side drawer*, and the connection between what you tapped and what appeared is lost.

**On the floating pill itself:** ref-1, ref-4 and ref-6 all float the bar over the content. FlatHub's bar is
currently pinned, opaque, with `TAB_BAR + insets.bottom` and a hairline. If it goes floating, the two
examples to follow are [ElevenLabs](https://mobbin.com/screens/67cbbe26-95bc-4408-8029-3f9126b859a3) and
[Gentler Streak](https://mobbin.com/screens/2d8d8f0d-f00a-40c7-8750-97f70ab1aa62), both of which keep the +
as a *separate* circle beside the pill rather than inside it — which is honest, because Add is an action and
the other four are destinations. FlatHub's tab layout already says exactly that in a comment. Two things must
survive the change: the labels stay (six flatmates should not have to guess an icon), and `padBottom` grows,
because a floating pill covers content a pinned one doesn't.

---

## Build order

1. **Home** (Asana + Zopa). Nothing else matters until the app opens somewhere that feels like a home.
2. **Profile with the UPI field** (Hypelist + CRED). It is a missing feature, not a restyle.
3. **The duty form and the inert tick** (GoHenry ×2). Swipes come after, not before.
4. **Empty states** (Buddy). Five screens, one template, half a day.
5. **Stat tiles and the dot grid** (Gentler Streak + Bevel).
6. **Card → sheet** (Copilot), built once and reused three times.
7. **The + sheet** (Pinterest), which is the smallest of the seven and can slot in anywhere.
