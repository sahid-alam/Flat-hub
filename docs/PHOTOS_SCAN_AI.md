# Photos, barcode scanning, and the home-screen summary

Three features the owner asked for, in his words. Checked on **2026-10-08** against live APIs and
vendor docs; every number below is either cited or marked **unverified**. Nothing here is code —
it is the decision and the price of each decision.

Constraints that bind all three: free tiers only, nothing paid; the app ships as a **web build on
Vercel** opened from Home Screens (iPhone included); Supabase free tier; an Android APK is planned
but not built.

---

## 1. Photo storage

> *"there should be an option to add photos if someone didnt do his duty correctly, i can connect my
> drive to store images"* · *"The receipt photo: we will store the photos in google drive, so that we
> have the records."*

Two different photos, with different lifetimes:

| | Receipt photo | Duty-evidence photo |
|---|---|---|
| Why | settle "₹1,180? what was that?" | settle "I did mop the kitchen" |
| Where it hangs | `spend.receipt_path` — **already in the schema**, written and read by nothing (`AUDIT.md` M10) | **nowhere** — see the schema gap below |
| Volume | one per spend | rare, only when contested |

### The schema gap, which matters more than the bucket

`CLAUDE.md` now says: *"There is no skip. A duty past its due date that nobody has done is **missed** —
computed from the schedule, never recorded as an event."* So the photo the owner wants — proof that
someone **didn't** do his duty — has **no row to attach to**. A missed duty is a computation, not a
`chore_event`, and `chore_event` has no photo column either (`supabase/migrations/20261004160935_m4_duties.sql:32`).

Whatever storage wins, this needs its own small table keyed by the instance, not by an event:

```
duty_photo(id uuid pk, household_id, duty_id, due_on date, member_id,   -- whose instance
           raised_by uuid,                                              -- who photographed it
           path text, note text null, created_at)
```

Keying it to the **instance** (`duty_id`, `due_on`, `member_id`) rather than to a `chore_event` covers
both halves of what he asked for: he said *"didnt do his duty **correctly**"*, which is a duty logged
`done` but done badly — that one *does* have an event — as well as one never done at all, which has no
event to point at. One table, both cases.

That is the real work in this feature. Receipts need no new table: `receipt_path` is waiting.

### Supabase Storage, free tier

| Fact | Value | Source |
|---|---|---|
| File storage included | **1 GB** | [supabase.com/pricing](https://supabase.com/pricing) |
| Max single upload | **50 MB** | same |
| Egress / cached egress | **5 GB / 5 GB** per month | same |
| Counts against the 500 MB database? | **No** — separate line item | same |
| Free project paused after | **1 week of inactivity** (limit 2 active projects) | same |

**What happens at the limit is harsh and worth reading twice.** Exceeding an included quota puts the
*organisation* under a grace period with an email, and once restrictions land they hit the whole
project: the database can go **read-only**, storage uploads are blocked, auth signups rejected, API
calls return **402**. There is no second grace period after the first is used.
([Egress Exceeded · supabase/supabase#46282](https://github.com/supabase/supabase/issues/46282),
[Manage Storage size usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size))
That enforcement order comes from **user reports in that GitHub issue, not from a primary doc** — the
pricing page states the quotas but not what happens when you pass them, and the cost-control page says
only that the Free plan is never charged. Treat the sequence as likely, not guaranteed.
So a quota blown by photos does not degrade photos — it takes the kitty down with it. Compression is
therefore **mandatory**, not a nice-to-have.

The arithmetic, for six people:

| Per photo | Photos/month | Stored/month | 1 GB lasts | Egress/month (3 views each) |
|---|---|---|---|---|
| **200 KB** (compressed) | ~90 | 18 MB | **~4.5 years** | ~54 MB of 5 GB |
| 3 MB (raw iPhone) | ~90 | 270 MB | **~3.7 months** | ~810 MB of 5 GB |

(~90/month = ~60 receipts + ~30 duty photos; a guess, but the ratio between the rows is the point.)

RLS works exactly like the rest of the app, which is the whole argument for this option. Policies go
on `storage.objects`, and `storage.foldername(name)` splits the path — so a bucket laid out as
`<household_id>/receipts/<spend_id>.jpg` is scoped by its first path segment:

```sql
create policy "members read their household's photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'flathub'
  and (storage.foldername(name))[1] in (select household_id::text from public.member)
);
```

`member`'s own RLS already returns only the caller's households, so this is one policy per verb and
no new concepts. ([Storage access control](https://supabase.com/docs/guides/storage/security/access-control))

### Google Drive, honestly

| What it takes | Detail |
|---|---|
| Google Cloud project + OAuth consent screen | required before a single byte moves |
| Scope | `drive.file` (per-file access) is classified **non-sensitive** → only **basic** OAuth verification, not the sensitive-scope review ([Drive API auth](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)) |
| **Refresh tokens in "Testing"** | **expire in 7 days** with any Drive scope — only `name`/`email`/`profile` are exempt ([OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)). Practically: **the treasurer re-consents every week, forever**, or uploads silently start failing |
| Unverified / Testing user cap | **100 test users**; beyond that, new authorisations error ([Manage app audience](https://support.google.com/cloud/answer/15549945)) — irrelevant at six, the 7-day expiry is the killer |
| Getting out of it | publish + pass basic verification (needs a public homepage and a privacy policy on `flathub.vercel.app`) — then no 7-day expiry |
| Backend | yes. A refresh token must never sit in the Expo bundle; it needs an Edge Function plus a secrets row, i.e. a second credential store to keep RLS-safe |
| Whose Drive? | one person's. Ansh's, presumably, since he is the treasurer — so the flat's financial records live in his personal 15 GB, **shared with his Gmail**. He leaves, or revokes the grant in his Google account settings, and every receipt link in the app 404s. A *shared drive* fixes ownership but needs paid Google Workspace |
| Quota | 15 GB shared with Gmail and Photos — bigger than Supabase's 1 GB, but not dedicated |

Note the asymmetry: Supabase Storage's failure mode at the limit is loud and fixable (delete files).
Drive's failure mode is **a person** — one revoked grant or one departure and the archive is gone,
with no RLS and no audit of who downloaded what.

### Third options, same honesty

- **Cloudflare R2** — 10 GB-month storage and **zero egress fees**, genuinely generous and the best
  numbers here. Costs: a second vendor, a second auth story (R2 has no RLS, so every read needs a
  presigned URL minted by an Edge Function), and a **credit card on file** even for the free tier.
  For six people storing 18 MB a month, that is paying in complexity for headroom we never reach.
  (unverified: current free-tier terms not re-checked today)
- **Imgur-style free hosts** — no. Public-by-URL, no deletion guarantee, and bills with names and
  amounts on them are not something to put on an anonymous CDN.
- **Postgres `bytea` in the existing database** — tempting (no new service, RLS for free) but the free
  tier gives 500 MB of database and photos are the one thing guaranteed to eat it. No.

### Recommendation

**Supabase Storage, one private bucket, paths keyed by `household_id`. Plus a "download this month's
photos" button that zips them client-side.**

What the owner gains: zero new concepts — same auth, same RLS, same client library, one bucket and
four policies. Nothing to re-consent, nothing tied to one person's Google account, and a `receipt_path`
column that finally does something.

What he loses: 1 GB instead of 15 GB, and the photos are not sitting in a Drive folder he can browse
on his laptop.

**That last point is probably the actual requirement** — "so that we have the records" is a request
for records he can hold, not for the Drive API. A zip-download button gives him exactly that: he taps
it once a month and drops the zip in Drive himself. It is an afternoon's work against a week for OAuth,
it needs no Google Cloud project, no verification, no token store, and no weekly re-consent. An
*export-to-Drive* button would inherit the entire OAuth burden listed above to save him one drag.

Revisit Drive only if he wants the upload to land in Drive **live**, without him in the loop — and
then only after publishing + basic verification, so the 7-day expiry is gone.

### The practical bits, either way

- **Compression is the whole ballgame** and needs no library. On web, draw the picked file to a canvas
  capped at ~1600 px on the long edge and `canvas.toBlob('image/jpeg', 0.7)` — a 3 MB iPhone photo
  lands around 150–250 KB, still legible enough to read a bill total. On native, `import.tsx:137`
  already passes `ImagePicker` `quality: 0.7`, and the comment there records the exact trap: *"native:
  quality < 1 re-encodes to JPEG (smaller, no HEIC); web ignores it."* So web needs the canvas step;
  native already has it.
- **HEIC.** `import.tsx:46` refuses HEIC outright today, before upload. In practice Safari transcodes
  to JPEG when a HEIC photo goes through an `<input type="file">`, so the web path rarely sees one;
  the native path is covered by the `quality` re-encode. (**unverified** — needs one test on a real
  iPhone with iOS's "Formats: High Efficiency" setting on, which is the default.) The canvas step
  removes the question entirely on web: whatever decodes, re-encodes as JPEG.
- **`extract-spend` keeps working untouched.** It takes base64 of `image/jpeg|png|webp` in the request
  body (`supabase/functions/extract-spend/index.ts:14`), not a URL. Upload the *same* compressed JPEG
  blob that is sent for extraction — one compression, one byte-stream, two destinations. The 6 MB body
  cap (`MAX_BODY_CHARS`) also stops being a concern once photos are 200 KB.

**Cost:** **M.** Bucket + four RLS policies, a canvas compression helper, write `receipt_path` in
`/import`, show the thumbnail on the statement row (M10), the new `duty_photo` table and one screen.
The zip button is **S** on top. Drive instead of this: **L**, plus permanent weekly maintenance.

---

## 2. Barcode scanning

> *"can we have the barcode scan feature for products so we dont need to write the name n quantity
> again and can have other usefull datas i guess."*

### Does the web build have a scanner?

`CLAUDE.md` says Safari has no barcode detection. **Still true in 2026**, with a footnote:

| Browser | `BarcodeDetector` | Source |
|---|---|---|
| **Safari 17+ (desktop & iOS)** | present **only behind the "Shape Detection API" preference flag** | [MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json) |
| **Chrome Android 83+** | **full support** | same |
| Chrome / Edge / Opera desktop | partial — **ChromeOS and macOS only** | same |
| Firefox (all) | **no** ([bug 1553738](https://bugzil.la/1553738)) | same |

A feature flag a mate must switch on in iOS Settings is not support. MDN still labels the whole API
*experimental* and *"not Baseline"*. So: Android mates get it free, the iPhone mate gets nothing.

**The fallback, and the lazy shape of it.** Not a live camera stream — `<input type="file"
accept="image/*" capture="environment">` opens the native camera on both iOS and Android, hands back
one still, and `zxing-wasm` decodes it. One HTML element, no `getUserMedia` permission dance, no
standalone-PWA camera caveats, and it is the same picker pattern `/import` already uses. A still photo
of a barcode decodes well enough for a retry-on-fail flow, but **how well is unverified** — I did not
test it on a phone. The likely failure is near-focus blur, and curved packaging (a milk pouch, a
crumpled Parle-G wrapper) is worse than a flat box; a failed decode is one tap to re-shoot. A live
viewfinder is nicer and much more code. **quagga2**, the other library the brief named, is pure JS and
**1D-only** with no 2D fallback and no active maintenance — `zxing-wasm` is the better pick.

`zxing-wasm@3.1.5` unpacked is **3.7 MB** (npm registry, checked today) — but that is the full package
with every build variant. The reader-only WASM actually fetched is roughly 1.2–1.5 MB, loadable lazily
on first scan so it never touches first paint (**unverified** — needs a real bundle measurement).
Avoid `@zxing/library`, the pure-JS predecessor: **11.9 MB** unpacked and slower.

### In the planned Android APK

`expo-camera`'s `CameraView` with `onBarcodeScanned` covers 13 formats including **EAN-13**, which is
what Indian grocery uses. Cost: the `CAMERA` manifest permission (plus `NSCameraUsageDescription` on
iOS), and on Android the detection is **Google ML Kit**, which is the bundle weight. Expo exposes a
`barcodeScannerEnabled` config-plugin flag precisely because disabling it *"reduces app size"* — so
ML Kit is not small. ([expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/)) It is also a
**new dependency**: `expo-camera` is not in `package.json` today. Exact added APK megabytes:
**unverified**.

### The data question, which decides everything

A scanner is worthless if the lookup returns nothing. I queried Open Food Facts' product endpoint with
**32 real Indian EANs sourced independently** (from buycott.com and barcodelive.org, *not* from OFF),
paced to avoid rate limits, on 2026-10-08:

| Slice | Hit rate |
|---|---|
| **All 32** | **21 hits — 66%** |
| Amul (22 codes) | 17 — **77%** |
| **Everything else** (10 codes: Tata, Aashirvaad, Parle, Britannia, Surf Excel, Maggi) | 4 — **40%** |
| **Household non-food** (Surf Excel ×2) | **0 — 0%** |

**Read that 66% as a ceiling, not an estimate.** Every code came from a barcode directory, i.e. these
products are already catalogued *somewhere*. A barcode photographed off a random kirana shelf will do
worse.

Two findings matter more than the headline number:

1. **The names are not usable as typed.** Aashirvaad Atta came back as `"Shudh Chakki Atta"` with no
   brand; Amul's chocolate as `"Dark Chocolate"`; Britannia Marie Gold **hit with a blank name**.
   Quantity was present on only **16 of 21** hits. So even a hit is a *hint* that a mate must correct.
2. **Non-food is a different, far thinner database.** Open Food Facts is food. Detergent, soap and
   cleaning supplies — a real share of a flat's shopping — belong to **Open Products Facts**, which
   returned HTTP **500** on two of three probes and `product not found` on the third.

Other free databases with Indian coverage: **UPCitemdb** has a free tier but it is rate-capped at
roughly 100 lookups/day and its India coverage is thin (**unverified**); **Barcode Lookup**, **go-upc**
and **eandata** are paid or key-gated past a trivial trial. There is no free, well-covered Indian
grocery product database. (OFF's total India catalogue size: **unverified** — their search API returned
`503 Page temporarily unavailable` on every attempt today, while the per-product endpoint worked fine.)

### The fallback is not a fallback — it is the design

Scan once; if the barcode is unknown, the mate names it; store the mapping; never look it up again.
After a few weeks the flat's own map covers everything the flat actually buys, with the flat's own
names ("Amul Taaza 1L", not "Shudh Chakki Atta"), including detergent that no public database has.
Six people buying the same thirty products converge fast.

`product` has **no barcode column** today (`supabase/migrations/20261003210805_m2_capture.sql:5`). It
needs one mapping — a `product_barcode(household_id, barcode, product_id)` table, or `barcodes text[]`
on `product` alongside the existing `aliases text[]`, which is the same learned-identity idea the
codebase already uses. OFF becomes an **optional prefill** for the naming sheet, never the source of
truth.

### But check rung 1 first

A scan produces a product and a quantity. Those feed **stock put-away** — and `AUDIT.md` D2 records
that pipeline as severed at both ends: Quick Add never creates a lot, `/import` cannot create a
product, `min_qty` has no writer, and quantities are `pc`-only and meaningless. Meanwhile the spends
that actually dominate this flat — Zepto and Blinkit orders — already arrive as **named, quantified
lines** through `extract-spend`, with no typing at all. Barcode only helps the *kirana and supermarket*
path, and only once there is somewhere for the result to land.

### Recommendation

**Build it — but not before D2, and build the map, not the lookup.**

Order: (1) fix put-away so a product and a lot can be created; (2) add the barcode mapping column;
(3) `<input capture="environment">` + lazily-loaded `zxing-wasm` on web, which covers the iPhone mate
too and makes `BarcodeDetector` an unnecessary optimisation; (4) unknown barcode → the naming sheet,
with an OFF prefill that the mate may accept or overwrite; (5) `expo-camera` only when the APK is real.

Do **not** build it as "scan → OFF → done". At a 40% non-Amul hit rate, 0% on detergent, and names
like a blank string for Marie Gold, that version would feel broken more often than it worked.

**Cost:** **S** for the scanner and the map (one input element, one lazy import, one column, one sheet)
— sitting on top of an **L**, which is D2. Honest summary: the scanner is cheap, the thing that makes
the scanner useful is not.

---

## 3. An AI summary on the home screen

> the big kitty figure should shrink and *"instead of that we can have an ai customize and personalised
> summary after good morning in the big card."*

### What we have

`supabase/functions/extract-spend/` runs on **Ollama Cloud's free plan** with `gemma4:31b`, pinned by
`format: "json"` plus the literal shape in the prompt because *"Ollama ignores a JSON Schema passed as
`format`"* (its README). The README also lists the free models: `gemma4:31b` is the only free one that
reads images; `gpt-oss:20b`/`120b` and `nemotron-3-*` are free **text** models.

### Can the free plan do this?

| Fact | Value | Source |
|---|---|---|
| Concurrency | **"1 concurrent request"** — verbatim on the pricing page; the rest queue, then get rejected | [ollama.com/pricing](https://ollama.com/pricing), corroborated by [ollamatps.com/limits](https://ollamatps.com/limits/) |
| Requests/min, tokens/min | **not published** | [ollama.com/pricing](https://ollama.com/pricing) |
| Free allowance | "starter usage credits", "a smaller set of starter models" — **amount unquantified** (**unverified**); pricing moved to monthly credit pools on **2026-08-31** | same |
| Paid, for reference | Pro $20/mo ($60 credits), Max $100/mo | same |

**One concurrent request is the binding constraint, and it decides the architecture by itself.** Six
mates opening the app over breakfast is six simultaneous requests through a single-slot queue: mate one
waits ~2 s, mate six waits ~12 s or gets rejected. And generating on open multiplies the cost by app
opens — six mates × 4 opens = 24 requests/day for 6 pieces of information.

Also: `gemma4:31b` is a 31-billion-parameter vision model. Using it to write two sentences of text is
the wrong tool; a free text model (`gpt-oss:20b`) is cheaper and faster, and `FLATHUB_EXTRACT_MODEL`
already shows the override pattern.

### Generate on a schedule, server-side, cached — never on open

Supabase **Cron** → an Edge Function at 06:00 IST → one row per mate in a `daily_brief` table → the
home card reads that row like any other query. Six requests per day, **~180/month**, sequential, so the
one-slot queue never matters. Latency on open becomes zero: the card renders text that is already in
the database.

Two free bonuses: the cron job is activity, so it **keeps the free Supabase project from pausing after
a week of inactivity**; and a failed generation degrades to yesterday's row or the static greeting
rather than to a spinner on the money screen.

While it loads (first open of the day, or a cron miss): show the **greeting and the static facts** —
"Good morning, Sahid" with the duty chip and the expiry chip. Never a skeleton where a sentence about
money will appear.

### Rung 1, before rung 7: compute the facts, let the model only phrase them

The hard part of this feature is not the LLM — it is **deciding what is worth saying**, and that is
deterministic TypeScript over data the app already has, in the same style as `kitty.ts` and `duties.ts`.
Rank the triggers, take the top two:

1. a lot expiring **today or tomorrow** (`expiringSoon` in `domain/stock.ts` already computes this)
2. your duty due today, or your duty missed yesterday
3. an own-pocket spend of yours that Ansh has not reimbursed
4. the pool below ~a week of the flat's recent burn rate
5. your top-up not yet in for this month
6. a swap offer nobody has claimed
7. **nothing** → the static greeting, and no sentence at all

With those facts in hand there are two honest options:

- **Template them.** `"${name}, the ${product} expires tomorrow — it's at the front of the fridge."`
  Zero hallucination risk, zero cost, zero latency, and nobody can tell the difference in two sentences.
- **Let the model phrase only.** Pass the computed facts as JSON, ask for one or two sentences, and
  **guard the output: every digit sequence in the reply must appear in the input, or fall back to the
  template.** This is the same defensive posture `extract-spend` already takes by re-checking the shape
  before the app trusts it.

Start with the template. Add the model when the templates start feeling repetitive — and keep the
guard, because this card sits beside the kitty balance.

### Five good summaries, and one useless one

Flat: Sahid, Ansh (treasurer), Adnan, Anant, Ayan, Jatin. ₹2,000 each per month into the pool.

1. **Good morning, Sahid.** The Amul Taaza you bought Sunday goes off tonight — two cartons left.
   Your bathroom duty is due today.
2. **Good morning, Ansh.** Four of six have topped up; Anant and Jatin are short ₹4,000 between them,
   and the pool covers about six more days at this month's rate.
3. **Good morning, Adnan.** Ansh still owes you ₹680 for Friday's kirana run. Nobody has claimed Ayan's
   kitchen-mop swap for today.
4. **Good morning, Anant.** You missed the dustbin duty yesterday, so you're 3 points behind your share
   this month — the same duty comes round again Thursday.
5. **Good morning, Ayan.** Quiet one: nothing expiring, no duty due, and your top-up is in. The flat
   spent ₹3,240 this week, down from ₹4,100.

**Useless:** *"Good morning, Jatin! The kitty currently stands at ₹7,420. You have duties assigned and
there are items in the fridge. Have a great day!"* — it restates the figure the card already shows,
says "duties" and "items" without naming one, and would read identically on any day for any mate. If
the summary can be generated without looking at the data, it is decoration.

The test: **a good summary names a thing and a number the mate did not already have, and implies an
action.** "₹680" and "tonight" and "Thursday" are summaries. "You have duties assigned" is wallpaper.

### Failure modes

- **A hallucinated figure on a money screen is the serious one.** A sentence that says ₹7,420 when the
  balance is ₹7,240 destroys trust in the ledger itself, and the ledger is the entire product. The
  guard above — **reject any output containing a number not present in the input** — is cheap and
  non-negotiable. Templating sidesteps it completely.
- **Nothing to say.** The commonest case, and where most AI summaries start lying. Do not ask the model
  to fill the space. Fall back to the greeting plus one real static chip, or an honest quiet line like
  example 5. A card that says "quiet one" on a quiet day is more trustworthy than one that always finds
  drama.
- **Stale cache.** The row is stamped at 06:00; a spend at 14:00 is not in it. Stamp the row with its
  generation time and let the card's *other* chips stay live, so the sentence is clearly a morning
  briefing and not a real-time readout.
- **Ollama outage or an exhausted credit pool.** Degrade to the template, silently. Never show an error
  on the home screen.
- **Privacy inside the flat.** "Anant and Jatin are short ₹4,000" is fine for Ansh, who is the treasurer
  and sees it in the statement anyway. Generate **per mate**, and keep other mates' money out of
  everyone else's brief except the treasurer's.

### Recommendation

**Build it as computed facts + templates, generated by Supabase Cron into a `daily_brief` row, read
synchronously by the home card. Add the LLM later, as a phrasing layer behind a numbers-must-match
guard.**

The owner gets the personalised sentence he asked for, instantly, every morning, with no chance of a
wrong rupee figure. What he gives up is the variety of real generated prose — and at one or two
sentences, on his own flat's data, with six repeat readers who will notice a wrong number long before
they notice a repeated phrasing, that is the right trade.

**Cost:** **S** for the fact-ranking function, the table, the cron job and the templates (the ranking
is pure TS beside `kitty.ts`/`duties.ts` and gets one test, per `CLAUDE.md`). **+S** to add the Ollama
phrasing layer and its guard afterwards. Money cost: **₹0** — ~180 requests/month of a free text model,
sequential, well inside one concurrent slot.

---

## In one line each

| | Recommendation | Cost |
|---|---|---|
| **Photos** | Supabase Storage, one private bucket keyed by `household_id`, mandatory client-side compression to ~200 KB, plus a monthly zip-download button. Not Drive — the 7-day refresh-token expiry in Testing and one-person ownership are not worth 15 GB. **The real gap is that a missed duty has no row to hang a photo on.** | **M** (+S for zip) |
| **Barcode** | `<input capture="environment">` + lazy `zxing-wasm` (works on the iPhone, where `BarcodeDetector` does not). Build the flat's own barcode→product map; OFF as prefill only — **40% hit rate off-Amul, 0% on detergent, names unusable as typed.** Not before `AUDIT.md` D2. | **S** on top of an **L** |
| **AI summary** | Rank the facts in TypeScript, template the sentence, generate via Supabase Cron into a cached row. LLM phrasing later, behind a numbers-must-match guard. Never generate on open — the free plan allows **1 concurrent request**. | **S** (+S) |
