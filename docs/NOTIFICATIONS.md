# Notifications

Answers R13 in [V3_BRIEF.md](V3_BRIEF.md): *"i dont know how we gonna achieve it, but i want proper
notifications for everything."*

Researched 2026-10-08. Every platform claim below has a URL. Anything I could not confirm from a
primary source is marked **unverified** — do not repeat it as fact.

## Where this project actually stands today

Verified by reading the repo, not from memory:

| Thing | State |
|---|---|
| `expo-notifications` | **not installed.** Not in `package.json`. |
| Web app manifest | **exists** — `public/manifest.webmanifest`, `display: standalone`, 192/512 icons. |
| Add to Home Screen metadata | **exists** — `apple-mobile-web-app-capable`, `apple-touch-icon` in `public/index.html`. |
| Service worker | **does not exist.** Nothing in the repo registers one. |
| Supabase Edge Functions | **already in use** — `supabase/functions/extract-spend`. |
| `pg_cron` / `pg_net` | **not enabled.** No migration references either. |
| Vercel build | `pnpm expo export --platform web` → static `dist`, all paths rewritten to `index.html` (`vercel.json`). **There is no serverless function in this deployment.** |

So: the Home Screen install half is done, and the push half is at zero. The gap is a service worker,
a subscription table, and one function that sends.

---

## What works on Android

**As the Home Screen web app you already ship — no APK needed.**

- Chrome for Android has full Push API support. caniuse records `and_chr` as `y` (full, no footnote)
  — checked locally against `caniuse-lite@1.0.30001814` in this repo's `node_modules`.
  <https://caniuse.com/push-api>
- A **service worker is required**; the browser decrypts the push and dispatches a `push` event to
  it. <https://web.dev/articles/push-notifications-overview>
- **No Firebase project is required.** Web push is the standardised Web Push Protocol with VAPID
  application server keys; the push service is the browser vendor's problem, not yours — "you don't
  have to care which push service the browser vendor is using."
  <https://web.dev/articles/push-notifications-overview>
- **No Home Screen install required** on Chrome Android — a plain tab can subscribe.
- **`navigator.setAppBadge` does not work on Chrome for Android.** MDN's browser-compat data records
  `chrome_android: version_added: false` — checked directly against
  <https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json>. Android's launcher dot
  comes from the notification itself, not from the Badging API. So the icon-count feature is an
  iPhone-only win; plan an in-app count for Android.

**If you later ship the EAS APK**, that is a *second, separate* notification stack:

- `expo-notifications` supports **Android and iOS only — Web is not supported.**
  <https://docs.expo.dev/versions/latest/sdk/notifications/>
- Android needs **FCM credentials** configured for the build.
  <https://docs.expo.dev/push-notifications/push-notifications-setup/>
- FCM itself is **no-cost on Firebase's Spark (free) plan**. <https://firebase.google.com/pricing>
- Expo's push service: *"There is no cost associated with sending notifications through Expo push
  notification service."* Rate limit 600 notifications/second per project — we need ~50 a *day*.
  It works in EAS production builds with your own credentials; it is **Expo Go that lost push
  support in SDK 53**, not standalone builds. <https://docs.expo.dev/push-notifications/faq/>

So the APK path is genuinely free too. It is just a different protocol, different tokens, different
send call — and it does nothing for the iPhone. **Do not build it first.**

## What works on iPhone

Web push works, with real conditions, and **it costs nothing**:

- **iOS/iPadOS 16.4 or newer.** The requirement, verbatim: *"A web app that has been added to the
  Home Screen can request permission to receive push notifications… as long as that request is in
  response to direct user interaction — such as tapping on a 'subscribe' button provided by the web
  app."* <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>
  - Both halves still hold. Nothing in 18.4 or 26 retracted them.
  - **Notifications do not work from a Safari tab.** Home Screen install is mandatory.
  - The permission prompt must come from a tap. A `useEffect` on mount will not do.
- **No Apple Developer Program membership.** Same post: *"You do not need to be a member of the
  Apple Developer Program to use it. Just be sure to allow URLs from `*.push.apple.com`."*
  This is the single most important fact here — the $99/year is not needed for notifications.
- **Badging works, and this is the one place iPhone beats Android.** *"Home Screen web apps on iOS
  and iPadOS 16.4 now support the Badging API… web apps are now able to set their badge count."*
  Same post. MDN's compat data agrees: `safari_ios` 16.4, noting *"Badging is supported for web apps
  saved to the home screen"* and that passing `0` clears the badge.
  <https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json>
- **iOS 26 made install easier.** Every site added to the Home Screen now opens as a web app by
  default, and there are *zero* installability requirements in Safari.
  <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>
- Safari 18.4 added **Declarative Web Push** (`window.pushManager`) — push without an installed
  service worker. <https://webkit.org/blog/16535/webkit-features-in-safari-18-4/>
  We still need a service worker for Android, so write one anyway and treat this as a bonus.

**The real production problem is subscription loss.** A `PushSubscription` on iOS works for a while
and then silently disappears, and notifications stop. Reported repeatedly on Apple's own forums:
<https://developer.apple.com/forums/thread/728796> and
<https://developer.apple.com/forums/thread/770749>.
The mitigation is cheap and must be in from day one: **on every app open, re-read
`registration.pushManager.getSubscription()`, re-subscribe if it is gone, and upsert the endpoint.**
Delete rows on a 404/410 from the push service.

- Widely-quoted iOS delivery figures (e.g. "70–85%") come from marketing blogs with no methodology.
  **Unverified — do not quote a number to him.** Say "less reliable than Android, and subscriptions
  need re-checking on every open."
- caniuse still scores `ios_saf` as `a` (partial, footnoted) through 27.2 — partial, not full, even
  now. Checked locally in `caniuse-lite@1.0.30001814`. <https://caniuse.com/push-api>
- **What happens if a mate never opens the app for days: unverified.** I found no primary source on
  whether iOS throttles or drops push to a long-dormant Home Screen web app. Assume it may, and do
  not design anything that depends on a notification reaching a dormant iPhone.

## What works nowhere

- **`expo-notifications` on the web build.** Web is not a supported platform.
  <https://docs.expo.dev/versions/latest/sdk/notifications/> Our shipped app is the web build, so
  this library is irrelevant until an APK exists.
- **Vercel Cron on the Hobby plan, for anything time-of-day.** Hobby is limited to **once per day**
  with **per-hour precision (±59 min)**; more frequent expressions *fail at deploy*.
  <https://vercel.com/docs/cron-jobs/usage-and-pricing> A "duty due at 8am" reminder would land
  somewhere in the 8 o'clock hour at best. And our Vercel output is static — there is no function
  for a cron to call without adding one.
- **Posting to the flat's existing WhatsApp group, free.** The Cloud API Groups endpoint exists but
  requires an **Official Business Account**, and groups cap at **8 participants**.
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/>
  Pricing is **per delivered template message** since 2025-07-01 with **no free monthly tier**;
  utility templates are free only *inside* a customer service window the recipient opened.
  <https://developers.facebook.com/docs/whatsapp/pricing>
  An OBA is Meta's verification badge for notable, authentic businesses; a private six-person flat
  does not meet that bar. **Treat WhatsApp group posting as unavailable.**
  - Unofficial libraries that drive a logged-in personal account (Baileys, `whatsapp-web.js`,
    whapi.cloud and similar) break WhatsApp's Terms of Service and risk the number being banned.
    <https://www.whatsapp.com/legal/terms-of-service> **Not recommended, not going to be built.**
  - What *is* legitimate and free: a `wa.me/?text=…` click-to-chat link behind an in-app button, so
    a mate chooses to paste the message into the group themselves. User-initiated, no API.
    WhatsApp, "How to link to WhatsApp from a different app":
    <https://faq.whatsapp.com/425247423114725>
    (Page confirmed to exist and carry that title; its body renders client-side, so the exact
    `wa.me` parameter list is **unverified from the primary source** — it is long-standing and
    widely used, but check it when you build the button.)
- **Guaranteed delivery, delivery receipts, or read state.** Web push offers none of these on any
  platform. Every notification must be a *nudge to a screen that already shows the truth*, never
  the only place information appears.
- **Scheduled local notifications in the browser** (fire-at-8am without a server round trip). The
  Notification Triggers API never shipped beyond a Chromium origin trial. **Unverified for current
  Safari — assume unavailable.** All timing must come from the server.

---

## Recommended build

One mechanism, one scheduler, one sender. Not two stacks.

**Standard Web Push + VAPID, served from Supabase.** It covers Android and iPhone with the same
code, needs no Firebase, no Apple Developer Program, and no paid plan.

### Pieces

1. `public/sw.js` — a service worker with a `push` handler and a `notificationclick` handler that
   focuses or opens the deep link. Registered from the app on launch.
2. One table, `push_subscription (id, household_id, member_id, endpoint unique, p256dh, auth,
   user_agent, created_at, last_seen_at)`. Not a ledger — rows are upserted and deleted when the
   push service returns 404/410. RLS: a member sees and writes only their own rows, scoped by
   `household_id` like every other table.
3. One Edge Function, `notify` — takes `{member_ids, title, body, url}`, looks up subscriptions,
   signs a VAPID JWT, encrypts per RFC 8291, POSTs to each endpoint, deletes the dead ones.
4. **Two callers into that one function:**
   - **`pg_cron`** for anything on a clock. Supabase Cron runs inside Postgres, can run "anywhere
     from every second to once a year", and can `net.http_post` to an Edge Function. Recommended
     max 8 concurrent jobs. <https://supabase.com/docs/guides/cron>
   - **A Database Webhook** for anything that fires on a row landing. These are *"a convenience
     wrapper around triggers using the `pg_net` extension"*, asynchronous so they do not block the
     INSERT, and they can POST to an Edge Function.
     <https://supabase.com/docs/guides/database/webhooks>

### Cost

Zero, with one caveat to check before promising it.

- **Edge Functions: verified.** The Free plan includes **500,000 invocations/month**
  (<https://supabase.com/pricing>). At ~50 notifications a day with batching we are under 2,000.
- **Cron and Database Webhooks on the Free plan: unverified.** This is the thing the brief asked me
  to verify rather than remember, so here is exactly what I found. Supabase documents Cron
  (<https://supabase.com/docs/guides/cron>), the `pg_cron` extension
  (<https://supabase.com/docs/guides/database/extensions/pg_cron>) and Database Webhooks
  (<https://supabase.com/docs/guides/database/webhooks>) **without any plan gating** — none of
  those pages mentions tiers at all. The plan comparison table on <https://supabase.com/pricing>
  has rows for Database, Auth, Storage, Edge Functions, Realtime, Dashboard, Security and Support,
  and **no row for Cron, Webhooks or Postgres extensions in either direction.** So I could not find
  a page that says "included on Free", nor one that excludes it. Both are plain Postgres
  extensions you enable from the dashboard, which is why I expect them to be there — but
  **confirm it by enabling `pg_cron` and `pg_net` on project `odhpvfwvpgwfgqypijnw` and scheduling
  one throwaway job.** That is a two-minute check and it settles the whole plan.

Two further risks on the free tier, both worth telling him plainly:

- **Free projects are paused after 1 week of inactivity**, max 2 active free projects
  (<https://supabase.com/pricing>). Six people using it daily keeps it awake. A paused project
  sends nothing.
- Whether `pg_cron` jobs resume by themselves after an unpause: **unverified.** Content farms claim
  they do not; I found no Supabase statement either way. If the project ever pauses, check the cron
  jobs by hand afterwards.

### VAPID setup, concretely

VAPID keys are one ECDSA P-256 keypair, generated once, never rotated unless they leak. The public
key is a 65-byte uncompressed point, base64url; the private key is the JWK `d` value.

```bash
# Simplest:
npx web-push generate-vapid-keys

# Equivalent with no new dependency — verified working on this machine (Node 26):
node -e "const {subtle}=require('crypto').webcrypto;(async()=>{
  const k=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub=Buffer.from(await subtle.exportKey('raw',k.publicKey));
  const b64=b=>b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+\$/,'');
  console.log('public :',b64(pub));
  console.log('private:',(await subtle.exportKey('jwk',k.privateKey)).d);})()"
```

Then:

```bash
# Private key + contact: server-side secrets, never in the bundle.
supabase secrets set VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:developer7gence@gmail.com
```

The **public** key is safe in the client bundle and is passed to
`registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
`userVisibleOnly: true` is mandatory — every push must show a notification.

> **Unverified:** whether `npm:web-push` imports cleanly in Supabase's Deno edge runtime. Deno is
> not installed on this machine, so I could not run the import. Fallback if it does not: sign the
> VAPID JWT with Deno's Web Crypto directly — the same `crypto.subtle` P-256 flow I *did* verify
> above (keygen produced a correct 65-byte public key), plus HKDF/AES-GCM for RFC 8291.
> Settle this with one `deno eval` before committing to a library.

### The smallest first step

**Ship exactly one notification: "Your duty is due today."**

1. Enable `pg_cron` and `pg_net`.
2. Add `public/sw.js` and register it.
3. Add `push_subscription` + a single "Turn on notifications" button, on a real tap, in Settings.
4. Add the `notify` Edge Function.
5. One `pg_cron` job at 02:30 UTC (= 08:00 IST) that computes today's `rota()` assignees and POSTs
   to `notify`.

That is one clock, one sender, one trigger, end to end. It proves VAPID, proves the service worker,
proves iPhone install, and exposes the pause risk — on the notification that is most useful anyway.
Then walk round the flat with each mate's phone: Share → Add to Home Screen → open it → tap the
button. Six taps, once. It is a funnel problem for a product; here it is a Sunday evening.

Everything below is step two, and each one is then a few lines in the same function.

---

## The full trigger table

"Notifications for everything", translated into this app's actual tables.

Two columns carry the decisions. **Machine** is the infrastructure: a schedule and a row-event are
different pieces of plumbing, and a *conditional* schedule is a different query again. **Channel**
is whether it is allowed to buzz a phone at all — only 8 of these 22 are, for the reasons in
*"Everything" should not all be push* above. Read the Channel column as binding: a row marked
**in-app** must not be wired to the push sender, however easy it would be.

| # | Notification | To | Channel | Machine | Fires from |
|---|---|---|---|---|---|
| 1 | Your duty is due today | today's assignee | **push** | **cron** — 08:00 IST daily | `rota()` over `duty` + `chore_event`; no row has been written yet, so nothing can trigger |
| 2 | Your duty is still not ticked | assignee | **push** | **conditional cron** — 20:00 IST daily | same, filtered to instances with no `chore_event` for `due_on = today` |
| 3 | A duty was offered — anyone can take it | all other active, non-absent members | **push, once** — the judgement call | **DB event** | INSERT on the V3 offer row (`chore_event.outcome = 'swapped'` today; V3 splits offer from claim — see [V3_PLAN.md](V3_PLAN.md) line 91. **The offer/claim tables do not exist yet**) |
| 4 | The duty you offered has been claimed | the original assignee | **push** | **DB event** | INSERT of the claim row |
| 5 | Nobody claimed your offer — it is due today | the original assignee | **in-app** | **conditional cron** — with #1 | open offers whose `due_on = today` |
| 6 | Someone vouched that you did it | the assignee | **in-app** | **DB event** | INSERT on the vouch row (**does not exist yet** — [V3_BRIEF.md](V3_BRIEF.md) line 65) |
| 7 | Your ₹2,000 top-up is not in yet | each member with `suggested_topup(m) > 0` | **push** | **conditional cron** — monthly, 5th 10:00 IST | derived from `pool_entry`; nothing is inserted when a mate *fails* to pay, so only a clock can notice |
| 8 | Ansh has reimbursed you | the `member_id` on the entry | **push** | **DB event** | INSERT on `pool_entry` where `kind = 'reimbursement'` |
| 9 | Your top-up was recorded | the contributor | **in-app** | **DB event** | INSERT on `pool_entry` where `kind = 'contribution'` |
| 10 | The kitty is running low | the treasurer (`household.pool_holder_id`) | **in-app** | **DB event**, debounced | INSERT on `spend` → recompute `pool_cash`; flag only on crossing a threshold downward |
| 11 | Milk expires tomorrow | **nobody is pushed** — shows on the fridge screen, counts toward the 19:00 digest | **in-app / digest** | **cron** — 07:00 IST daily, **computes, does not send** | `lot.expiry_date = tomorrow` and the lot's `Σ stock_move.delta_qty > 0`. A date arriving is not a row event |
| 12 | Something expired and is still in the fridge | as #11 | **in-app / digest** | **cron** — with #11, computes only | `lot.expiry_date < today`, on-hand `> 0` |
| 13 | Below minimum — add to the list | shows on the shopping screen | **in-app** | **DB event** | INSERT on `stock_move` with `delta_qty < 0` → on-hand now under `product.min_qty` |
| 14 | A Zepto order was imported and needs put-away | the importer only | **in-app** | **DB event** | INSERT on `spend` where `source = 'zepto'` with `track_stock` lines and no `lot` yet. *No "then everyone after an hour" chaser — that was a broadcast and it is cut.* |
| 15 | Someone added to the shopping list | all members, in the one 19:00 digest | **digest** | **cron** — 19:00 IST | `shopping_item` rows added today with `done_at is null`. Per-row push here would be spam |
| 16 | A spend was reversed | the payer and the treasurer | **in-app** | **DB event** | INSERT on `spend` or `pool_entry` with `reverses_id not null` |
| 17 | The month is ready to close | the treasurer only | **push** | **conditional cron** — 1st of the month, 10:00 IST | no `month_close` row for the previous month |
| 18 | The month was closed | all members | **in-app** | **DB event** | INSERT on `month_close` |
| 19 | A new mate joined the flat | all members | **in-app** | **DB event** | INSERT on `member` |
| 20 | You are marked away from *date* | the absent member | **in-app** | **DB event** | INSERT on `member_absence` (confirms someone else logged it for you) |
| 21 | You're on dishes today — what's for lunch and dinner? | today's assignees on the `plans_meals` duty | **push** | **conditional cron** — 10:30 IST daily | today's `assignees()` for the duty with `plans_meals = true`, **only if** no `meal_plan` row exists for `(household_id, today)`. See *Conditional crons* below. ([V3_BRIEF.md](V3_BRIEF.md) R11 / line 145 — `duty.plans_meals` and `meal_plan` **do not exist yet**) |
| 22 | Ayan ticked the bins — your half is still open | the co-assignee who has *not* ticked | **push** | **DB event** | INSERT on `chore_event` with `outcome = 'done'` for a duty whose `group_size > 1`; notify the other members of `assignees(duty, due_on)` with no `done` row for that `due_on`. `chore_event` itself is unchanged — each co-assignee ticks their own row ([V3_BRIEF.md](V3_BRIEF.md) R2 / line 140; **`duty.group_size` and `assignees()` do not exist yet**) |

**Push: 1, 2, 3, 4, 7, 8, 17, 21, 22.** That is 9 rows, because #3 is the one marked as a
judgement call and the first to demote — 8 if you drop it. Everything else is in-app or the single
19:00 digest.

### Conditional crons — the shape most of these actually are

Most of what he wants is not "send at 8am". It is **"send at 8am *unless* the thing already
happened"**: #1, #2, #5, #7, #12, #17 and #21 are all of this shape. The difference is worth stating
because it changes the SQL, not the infrastructure:

- An **unconditional** cron sends a list. The query is "who is on duty today".
- A **conditional** cron sends a *difference*. The query is "who is on duty today **and** has no
  row proving they did it". The absence of a row is the trigger, and nothing but a clock can ever
  notice an absence — that is precisely why these cannot be database triggers.

Three rules for them, learned from the shape rather than the platform:

1. **The condition lives in the SQL, not in the Edge Function.** The cron's query must return an
   already-filtered recipient list, so a cron that has nothing to say POSTs nothing at all. Do not
   send an empty job to the function and filter there.
2. **Make it idempotent and at-most-once-a-day.** `pg_cron` can retry, and a job that overlaps
   itself would double-send. Key the send on `(trigger_name, member_id, due_on)` and let the
   uniqueness of that key do the work.
3. **Late is better than wrong.** If the project was paused or the job was missed, do not catch up
   by firing yesterday's reminders this morning. Scope every conditional query to *today* in IST
   (`Asia/Kolkata`, the same boundary as `istDate()` and the month-close guards) and let a missed
   day stay missed.

Notes that keep this from becoming spam:

- **Cron: 7 jobs, not 22 — and only 4 of them send a push.** One 07:00 daily that **computes
  expiry counts and sends nothing** (#11, #12, feeding the in-app count and the evening digest);
  one 08:00 daily (#1 pushes, #5 updates the count); one 10:30 daily (#21); one 19:00 daily that
  sends the single combined digest (#15, plus whatever #11/#12 found); one 20:00 daily (#2); and
  two monthly — the 1st for #17 and the 5th for #7, since they fall on different dates. Supabase
  recommends no more than 8 concurrent jobs
  (<https://supabase.com/docs/guides/cron>) and this sits inside that.
- **Never notify the actor.** Rows 8, 9, 16, 18, 19, 20 must exclude whoever wrote the row —
  otherwise Ansh gets a push for every reimbursement he types in himself. Row 22 is this rule doing
  real work: the mate who just ticked must not be told that someone ticked.
- **Rows 3, 4, 6, 21, 22 depend on V3 schema that does not exist yet** — offer/claim, vouch,
  `duty.plans_meals` + `meal_plan`, and `duty.group_size` + `assignees()`. They are the *reason* to
  build the mechanism now and the triggers later; do not promise dates on them.
- Every notification deep-links to the screen that already shows the fact. A missed push must cost
  nothing, because on iPhone some will be missed.

## "Everything" should not all be push — and this is the real risk

The platform research above says notifications are achievable. This section is the part that
actually decides whether they survive, and it is worth saying plainly rather than letting him find
out: **the failure mode here is not technical, it is six people turning notifications off in week
two.**

A denial is expensive and hard to undo. The permission prompt may only appear "in response to
direct user interaction" (<https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>),
and a browser that has already been told no does not show it again on the next tap — so **the page
cannot re-prompt its way back**, and recovery runs through the OS or browser settings. Combined with
the subscription loss described above, assume a mate who switches notifications off is a mate you
have stopped reaching.

> **Unverified:** the precise recovery path on iOS — which Settings screen, and whether a Home
> Screen web app's notification permission can be re-granted without deleting and re-adding the
> icon. I found no primary source. Do not promise him it is easy to undo; the safe assumption is
> that it is not.

The arithmetic is unforgiving. 22 triggers, and the broadcast ones go to all six. If rows 3, 9–16
and 18–20 each push to everyone, an ordinary Tuesday is eight to twelve pushes per mate for things
like "someone added coriander to the list". That is the exact volume that teaches people the app
cries wolf. And it lands in a flat that **already has a WhatsApp group carrying the real chatter** —
so FlatHub is not filling a silence, it is competing with a channel they already read. It only wins
by being the one that is never noise: WhatsApp is where the flat talks, FlatHub is where it is
*your turn* or *your money*.

**The recommendation, plainly: 8 of the 22 should ever be push. The other 14 should be an in-app
count and nothing more.**

| Push — addressed to one person, actionable by them, time-bound | Why it earns the interrupt |
|---|---|
| #1 your duty is due today | the core of the app; one person, one day |
| #2 still not ticked (20:00) | the one that actually changes behaviour |
| #4 the duty you offered has been claimed | you were waiting on an answer |
| #22 your half of the bins is still open | one named person, blocking a partner |
| #21 declare lunch and dinner | one or two people, and the flat eats on it |
| #7 your ₹2,000 top-up is not in yet | money, monthly, one person |
| #8 Ansh has reimbursed you | money arriving, one person |
| #17 the month is ready to close | treasurer only, monthly |

Everything else — #5, #6, #9, #10, #11, #12, #13, #14, #15, #16, #18, #19, #20 — is **in-app
only**: a count on the tab bar and the fact on the screen. Nobody needs their phone to buzz because
a lot expired; they need to see it when they next open the fridge screen.

Row **#3 ("a duty was offered — anyone can take it") is the one genuine judgement call.** It is a
broadcast to five people, which is the spam-prone shape, but an offer nobody sees is an offer nobody
takes, and with Skip removed that duty just gets missed. Recommendation: push it, **once**, never
re-nudged, and treat it as the first thing to demote if anyone complains.

That leaves a mate with roughly **one or two pushes on a day they are on duty, and zero on a day
they are not.** That is a volume people keep. Three cheap things protect it:

- **One digest, not a stream.** Where several in-app facts pile up, the 19:00 job sends at most one
  combined message, never one per row.
- **Per-trigger switches, per mate, from the second trigger onward.** With one notification shipped
  the on/off button is the switch; the moment there are two, they need separate switches. A mate
  who finds the 20:00 nudge naggy must be
  able to turn off *that one* in Settings instead of revoking the whole permission at the OS level.
  This is the single most important piece of spam insurance, because it is the only alternative to
  the OS-level switch we may not be able to talk them back out of.
- **Collapse by tag.** Give each trigger a stable `tag` on the notification so a second send
  replaces the first in the tray rather than stacking.

## Honest fallbacks, in the order to reach for them

1. **An in-app count on the tab bar — build this regardless, not as a fallback.** It needs no
   permission, no subscription and no push service, so it is the one piece that cannot fail on
   either phone. Note that `src/` currently makes **no Realtime subscriptions at all** (zero
   `.channel(` calls), so this count would refresh on app open and on the queries the screens
   already run — adding Realtime is a separate decision.
   - The **OS icon badge** on top of that is iPhone-only: `setAppBadge` on Home Screen web apps
     from iOS 16.4 (<https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>,
     <https://developer.mozilla.org/en-US/docs/Web/API/Badging_API>) and **not implemented on
     Chrome for Android** (see *What works on Android*). Call it a bonus, not the plan.
2. **Email digest.** Resend's free plan is 3,000 emails/month, 100/day, 3 domains
   (<https://resend.com/pricing>). Six mates × one daily digest = ~180/month. A reasonable safety
   net for #7 and #17, the two that genuinely matter in money terms. Note Supabase's own SMTP is
   for auth mail only — use a real sender.
3. **A `wa.me` share button.** The flat already lives in a WhatsApp group; a one-tap "share today's
   duties to the group" that opens WhatsApp with the text prefilled is free, legitimate, and
   requires no API. It needs a human to press send, which is the whole reason it is allowed.
4. **Automated WhatsApp group posting: not available to us.** See *What works nowhere*.

## What to tell him, in one breath

Notifications are achievable on both phones, for ₹0, using one mechanism. The iPhone needs each
mate to add FlatHub to their Home Screen and tap a button once — which they have effectively already
done to use the app — and the iPhone will drop its subscription occasionally, so the app re-subscribes
every time it opens. Android is strictly easier and does not need the APK — though the OS icon badge
is iPhone-only. "Everything" comes to 22 real triggers; 7 scheduled jobs and ~13 database triggers
cover all of them, and five are waiting on V3 tables that do not exist yet. Nothing here needs a
paid plan, with one thing left to confirm by hand: that the free Supabase project will let us enable
`pg_cron` and `pg_net`.

Two things he should hear even though he did not ask: **only 8 of the 22 should ever buzz a phone**
— the rest belong on the tab-bar count, because six people getting ten pushes a day will all turn
them off inside a fortnight, and on iPhone a revoked permission is close to unrecoverable. And most
of what he wants is a *conditional* reminder ("unless it is already done"), which is a different
query from a plain daily send even though it is the same machinery.

The first notification to ship is "your duty is due today."
