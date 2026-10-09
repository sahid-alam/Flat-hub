# Importing from Zepto, Blinkit, Instamart & co.

A feasibility report, researched 2026-10-07. Every claim about a company's API or terms carries a
URL. Where something could not be checked it says **unverified** rather than guessing.

**The short version.** Nobody but Swiggy offers any way to read a cart or an order. Swiggy does,
through a free, open-signup developer programme that reached real Instamart tools in 2026 — the only
genuine integration on the table, though whether it reads a *flatmate's* orders in itemised detail
is the one thing a day of free prototyping would settle. Everything else is a link that opens their app, a screenshot you
read with the model you already pay nothing for, or scraping, which their terms forbid in words
specific enough to quote. The cheapest useful thing in this document is a prompt tweak and a
one-line `CHECK` constraint.

---

## 1. Public APIs, per company

Three buckets: **documented and open to sign up**, **partner programme behind a sales contact**, and
**nothing**.

| Company | Read user's cart | Read order history | Search catalogue | Place order | Bucket |
| --- | --- | --- | --- | --- | --- |
| **Swiggy Instamart** | yes (`get_cart`, per-item prices unverified) | a `get_orders` tool exists; itemised lines/amounts **unverified** | yes (`search_products`) | yes (`checkout`) | **documented, open signup** |
| **Zepto** | no | no | no | no | nothing |
| **Blinkit** | no | no | no | no | nothing (seller-side only) |
| **BigBasket** | no | no | no | no | nothing |
| **JioMart** | no | no | no | no | nothing |
| **Flipkart (incl. Minutes)** | no | no | partial, legacy | no | affiliate API, sign-ups closed |
| **Amazon (incl. Amazon Now)** | no | no | yes, gated | no | affiliate API, sales-gated |

### Swiggy Instamart — the one real option

Swiggy runs a developer programme, **Swiggy Builders Club**, at
[mcp.swiggy.com/builders](https://mcp.swiggy.com/builders/), alongside its portal at
[developers.swiggy.com](https://developers.swiggy.com/). As of 2026 it exposes three MCP servers —
Swiggy Food (20 tools), **Instamart (19 tools)**, and Dineout (12) — described as "Search grocery
products, manage cart, checkout, and track instant deliveries"
([source](https://mcp.swiggy.com/builders/developers/)).

Instamart tool names seen in the docs: `search_products`, `update_cart`, `get_cart`, `checkout`,
`track_order`, `get_orders`.

What is **confirmed** from the public pages:

- **Development is free and ungated.** "You can start immediately — prototype on localhost with no
  approval and no cost."
- **Production needs approval**, roughly two weeks: tell them who you are, show a demo, pass a
  review of use case and security setup. Whether a private six-person household app clears that
  review is **unverified** — the page welcomes anyone building "real products" that users "actually
  use", but says nothing about private/non-commercial apps.
- **No pricing is published.** Rate limits are "solid defaults", unquantified.

What is **strongly indicated but not confirmed** — and all of it is what the localhost prototype
would settle in a day:

- **Whose data the tools return.** Authentication is OAuth and production approval involves getting
  your "OAuth redirect URLs allowlisted", which points to user-delegated access — i.e. a flatmate
  authorises and the app reads *their* real Swiggy account. But the docs never say so outright:
  asked directly, the pages "[don't] specify what `get_cart` and `get_orders` return or whose data
  they access." If it turns out to be developer-account-only, the order-history idea is dead.
- **Whether `get_orders` returns itemised lines with amounts** rather than order summaries. The
  public page doesn't say; the detail is in `/builders/docs/reference/instamart/` or behind
  `builders@swiggy.in`. Summaries alone would not feed our confirm card.
- It is **MCP, not REST**: our Deno edge function would have to speak MCP. Doable, but it is not a
  `fetch` call.

### Zepto, Blinkit, BigBasket, JioMart — nothing

No consumer or partner API for cart, orders, catalogue or ordering from any of these. Blinkit has a
*seller* onboarding path (GST/e-invoicing credentials for brands listing products) which is the
opposite direction from what we want —
[guide](https://www.scribd.com/document/814647161/Blinkit-Seller-Guide). Everything marketed as a
"Blinkit API" or "Zepto API" is a third-party scraping reseller (see §4 and §5), not the company.

One note worth acting on: **Zepto now uses `zepto.com`, and the two domains are not
interchangeable.** The terms page redirected to `www.zepto.com` in a browser, and the live terms are
at [zepto.com/s/terms-of-service](https://www.zepto.com/s/terms-of-service). But `zeptonow.com` is
still served directly, not redirected — it answers `robots.txt` (200), its own
`apple-app-site-association` (200) and `/search` (202). The scope of the redirect is **unverified**.
What matters is that the two domains serve **different** `robots.txt` and **different** app-link
files (see §2 and §5), so use `zepto.com` for anything new and treat `zeptonow.com` in our code or
docs as stale.

### Flipkart — affiliate API exists, sign-ups closed

The [Flipkart Affiliate API docs](https://affiliate.flipkart.com/api-docs/af_overview.html) are
still online and describe product feed and search endpoints, where several endpoints (Delta Feed,
keyword search, product-ID search, feed download) are marked deprecated and the release notes have
not moved since 2016. That public affiliate **sign-ups are now closed** is reported by third parties
([haulpack](https://www.haulpack.com/blog/how-to-start-flipkart-affiliate-marketing/),
[ipwebai](https://ipwebai.com/what-is-flipkart-affiliate-api/)) and is **unverified against
affiliate.flipkart.com itself**. Either way it is a catalogue API, not a cart or order-history API.
Not a path.

### Amazon — PA-API, gated behind actual sales

[Product Advertising API 5.0](https://webservices.amazon.com/paapi5/documentation/locale-reference/india.html)
covers amazon.in. It requires an Amazon Associates account and **at least 3 qualifying sales in the
past 30 days to keep access**
([requirements](https://affiliate-program.amazon.in/help/node/topic/GVJ2BJP35457CLML)). A six-person
flat will not generate qualifying affiliate sales. It is also catalogue-only — no cart, no orders.
Not a path.

---

## 2. Deep links — the part that actually works

This is the strongest verified result in the report. I pulled each site's
`/.well-known/apple-app-site-association` (iOS universal links) and
`/.well-known/assetlinks.json` (Android App Links) directly. These files are the companies' own
declarations of which URLs open their app, so this is documentation, not folklore.

The **path column is iOS data** (from each AASA). On Android, `assetlinks.json` carries the relation
`delegate_permission/common.handle_all_urls`, which is the *relation name* — it verifies domain
ownership only. Actual Android path filters live in the APK's intent filters, which I cannot read,
except where a site also ships `dynamic_app_link_components` (Zepto does). So "Android package
verified" below means ownership is confirmed, not that any particular path opens the app.

| Company | iOS app ID | Android package (ownership verified) | iOS universal-link paths declared |
| --- | --- | --- | --- |
| **Zepto** (`zepto.com`) | `A2G5Q5P68Y.com.zeptonow.customer` | `com.zeptoconsumerapp` | `"*"` — every URL, minus `NOT` exclusions for `/investor-relations*`, `/bestsellers`, `/delivery-in-*`, `/ProcessOrder`, `/buy-*`, `/lite`, **`/category/*`**, **`/brand/*`**. `/search` is **not** excluded. Android mirrors this via `dynamic_app_link_components`. |
| **Zepto** (old `zeptonow.com`) | same app ID | `com.zeptoconsumerapp` | `["*"]`, no exclusions — a different, older file |
| **Blinkit** | `E7FS5EWD29.com.grofers.consumer` | `com.grofers.customerapp` | `/`, `/brand/*`, `/s/*`, `/cn/*`, `/prn/*`, `/cln/*`, **`/cart`**, **`/share/cart/*`**, `/store/*`, `/recipe/*` |
| **Instamart** | `9X7BN9YP4C.bundl.instamart` | `in.swiggy.android.instamart` | `/instamart/*`, `/stores/instamart/*` (recipes excluded) |
| **BigBasket** | `P8APB44D6G.com.bigbasket.mobileapp` | `com.bigbasket.mobileapp` | `/ps/*`, `/pd/*`, **`/basket/`**, **`/share-basket/*`**, `/member/smart-basket/`, … |
| **JioMart** | `VSQ9KLSSUY.com.jio.jiomart` | `com.jpl.jiomart` | `/`, `/sections/*`, **`/checkout/cart`**, `/checkout/*`, `/customer/mylist`, … (login and payment-gateway paths excluded) |
| **Flipkart** | `25JQ655X97.com.appflipkart.flipkart` | `com.flipkart.android` | `["*"]` — every URL |

(Blinkit's files 403 a plain `curl` behind Cloudflare; its values above were read from a real
browser session, which returned them fine. More on that in §5.)

**What this means in practice.**

- **Opening the app from a link: yes, everywhere.** A plain `<a href="https://www.zepto.com/...">`
  tapped on a phone with Zepto installed opens the Zepto app, because `zepto.com`'s AASA declares
  `"*"` and `/search` is not among its exclusions. Same for Blinkit search (`/s/*`), Instamart
  (`/instamart/*`), BigBasket (`/ps/*`).
- **Opening a search: probably.** The search URLs resolve —
  `https://www.zepto.com/search?query=milk`, `https://blinkit.com/s/?q=milk`,
  `https://www.swiggy.com/instamart/search?query=milk`, `https://www.bigbasket.com/ps/?q=milk`.
  That the *path* opens the app is documented by the AASA files. Whether each app honours the
  `?query=`/`?q=` parameter when cold-opened via deep link, rather than dumping the user on the home
  screen, is **unverified** — it needs a mate to tap it on a real phone with the app installed. Test
  this before promising it.
- **Adding items to a cart from a link: no.** Nobody declares an "add to cart" URL. Blinkit's
  `/share/cart/*` and BigBasket's `/share-basket/*` are their *own* share-a-cart features: one user
  builds a cart in the app and the app mints a link. We cannot construct one of those tokens, and
  if a mate pastes one to us we cannot read what is in it. Blinkit's shared carts are also reported
  to be static snapshots that don't sync
  ([case study](https://medium.com/@isharaghvani/case-study-designing-a-family-group-cart-for-blinkit-4ba8860261e8)) —
  design write-ups, not vendor docs, so treat as **unverified**.
- **No URL scheme guesswork needed.** `zeptoconsumer://`-style custom schemes are folklore; the
  `https://` universal links above are the documented mechanism and are what to use.

**Does web-vs-APK change this?** For *outbound* links, no — universal links and App Links both fire
from a tap on a link in a web page, whether that page is in Safari, in an iOS Home Screen install,
or in an Android WebView. General platform behaviour worth designing around (not a finding I
verified): universal links are more dependable on a **user tap of an `<a>` element** than on a
programmatic `window.location = …`. Cheap to honour — build it as a real link, not a JS redirect —
and worth confirming on a device.

For *inbound* sharing, web-vs-APK matters enormously — see §6.

---

## 3. Order history via email

**The premise is shakier than it sounds, and it should be checked before any work is costed.**

What is verified: these platforms put the invoice **in the app**. Blinkit's documented path is
Profile → Your Orders → order → View order summary → Download Invoice, which yields a **PDF**
([walkthrough](https://revealthat.com/download-blinkit-invoice/)). Zepto invoices likewise circulate
as downloaded PDFs. Whether Zepto, Blinkit or Instamart reliably *email* an itemised order
confirmation to the registered address is **unverified** — the sources that say so are SEO blogs
hedging with "you'll most likely receive a receipt", not vendor documentation. I found no vendor
page confirming an itemised order email from any of them.

If it did work, the build is not small:

- A dedicated inbox and some way to receive mail into Supabase (an inbound-email webhook). Free
  tiers exist but this is new infrastructure, new secrets, new failure modes.
- **The PDF problem, which is ours specifically.** `supabase/functions/extract-spend/README.md`
  states plainly that PDFs are unsupported, because the free Ollama model that reads images
  (`gemma4:31b`) takes images only — and `index.ts:63-65` returns a 400 telling the user to
  screenshot instead. An emailed-PDF-invoice path therefore needs a PDF→image or PDF→text step that
  does not exist anywhere in the pipeline. That is a real cost line, not a footnote.
- What breaks: every template change silently; HTML emails that are mostly images; promotional mail
  misfiled as orders; and a shared inbox holding the flat's purchase history, which is a privacy
  question six people should agree to rather than have sprung on them.

**Verdict:** not a realistic first move. If someone wants it, the cheap experiment costs nothing —
place one order on each app, see whether an itemised email actually lands. Do that before building.

---

## 4. "Compareify"

The owner has the name slightly wrong. The thing he means is almost certainly **Comparify**, at
[comparify.pro](https://comparify.pro/about) — an Indian app that compares groceries across Blinkit,
Swiggy Instamart, Zepto, BigBasket, Flipkart Minutes, JioMart and DMart, and cabs across
Uber/Ola/Rapido/Namma Yatri. Its own description matches his: *"see which app has the lowest price
for every item"*, with per-gram/ml pricing
([grocery page](https://comparify.pro/grocery-price-comparison)).

**On "maybe we can add our card there":** no. Comparify's own about page says it *"aggregates
real-time data"* and then **"Choose the best deal and get redirected to complete your purchase"**,
offering *"deep links for quick booking on your preferred platform."* **Comparify does not process
payments.** You cannot add a card to it and check out through it; it hands you to Zepto or Blinkit
and you pay there as usual. Paying for a flat's groceries through an aggregator is not a thing that
exists in this market. That part of the idea should be dropped.

Comparify publishes **no API and no developer access** — nothing on the site mentions either, and
the page does not even name who operates it. No pricing, no terms for third parties.

The others checked:

| Service | What it is | API? | Cost | Terms |
| --- | --- | --- | --- | --- |
| **Comparify** ([comparify.pro](https://comparify.pro/about)) | Consumer price-comparison app, redirects to retailers | none published | — | operator not named |
| **Quick Compare** ([quickcompare.in](https://quickcompare.in/), [App Store](https://apps.apple.com/in/app/quick-compare-app/id6737258065)) | Same idea; by Mobinet Innovations Pvt. Ltd. | none found; site is a marketing shell | — | **unverified** |
| **QuickCommerce API** ([quickcommerceapi.com](https://quickcommerceapi.com/)) | Third-party data reseller, 11 platforms | **yes, public** | ₹500 / 2,500 credits … ₹24,000 / 200,000. **100 free credits on signup** | silent on legality or retailer affiliation |
| Actowiz, Foodspark, ProductDataScrape, Parse.bot | Scraping-as-a-service vendors | yes, sales-contact | quote-based | — |

**QuickCommerceAPI is the only aggregator with a real, documented, self-serve API**, and it is
worth being blunt about what it is: a **scraping reseller**. It is not affiliated with any retailer,
it does not say where its data comes from, and it says nothing about compliance. It offers
**catalogue, price, stock, ETA and deep links only — no cart, no order history**, which means it
cannot do the thing the owner actually asked for. The free 100 credits are enough to evaluate and
nothing more; after that it is **paid, from ₹500**. Flag that loudly: everything in FlatHub today
runs on free tiers.

---

## 5. Scraping, and where the line is

If you skip Swiggy, scraping is the only remaining path. It is also the one I will not help build,
because their terms say so in words that leave no room:

> **Blinkit**: "This license does not include/permit any resale or commercial use of the Blinkit
> Platform or its contents; **any collection, use or derivative use of the Blinkit Platform, its
> contents, any product listings, descriptions, or prices**; any downloading or copying of
> information for the benefit of another third party; or **any use of data mining, robots, or
> similar data gathering and extraction tools.**"
> — [blinkit.com/terms](https://blinkit.com/terms)

> **Zepto**: users must not "reverse engineer, modify, copy, distribute, transmit, display, perform,
> reproduce, publish, license, **create derivative works from**, transfer, or sell **any information
> or software obtained from the Platform**."
> — [zepto.com/s/terms-of-service](https://www.zepto.com/s/terms-of-service)

That is explicit prohibition of exactly the mechanism, naming product listings and prices. "It's
only six people" is not an exception these terms grant. The private-use argument changes the
practical risk (nobody is sending a cease-and-desist to a flat), but it does not change the terms,
and it is the lead's call to make knowingly rather than mine to make quietly.

**robots.txt** — fetched directly, verbatim, today:

- **Zepto** — the two domains differ, and the live one is the stricter:
  - `www.zepto.com`: `Allow: /` but `Disallow: /search`, `/cart/`, `/order/`, `/api/`, `/account*`,
    `/ProcessOrder/`, `/location/`, `/buy/*`. **The search path is disallowed to crawlers.**
  - `www.zeptonow.com` (old): `User-agent: * / Allow: /` — fully permissive. Stale; don't cite it.

  Note the distinction that matters for §6 item 2: `Disallow: /search` governs *crawling* that path,
  not a human tapping a link that opens the app. The deep-link button is not a robots.txt question.
- **Blinkit**: `Disallow: /cart`, `/checkout`, `/account`, **`/s/*`** (search), `/cln/*`, `/bct/*`.
  The search path we would want is explicitly disallowed.
- **Swiggy**: `Disallow: /cart`, `/checkout`, `/payment`, `/my-account`, `/invoice/*`,
  `/track-order/*`, `/auth*` — every path that holds a user's own order data.
- **BigBasket**: `Disallow: /p/`, `/product/`, `/ps/`, `/*?page=` — product and search pages.
- **JioMart**, **Flipkart**: broadly permissive to major crawlers, with carve-outs
  (Flipkart: `Disallow: /viewcart`).

Note the pattern: **cart, checkout, account and invoice are disallowed everywhere they appear.**
The exact data we'd want is the data they most clearly fence off.

**Bot detection is real and already biting.** Every `curl` to `blinkit.com` — including
`robots.txt` — returned **HTTP 403** from Cloudflare with a 564 KB error page. Only a real browser
session got through. Zepto and Swiggy sit behind CloudFront. So a scraper is not a `fetch` in an
edge function; it is a headless browser with fingerprint evasion, which is both squarely against
their terms and a maintenance burden that breaks on any layout or challenge change — for a flat of
six whose grocery runs number a handful a week.

**Conclusion:** scraping is technically possible, contractually prohibited in named terms, and
operationally brittle. It is the worst value-per-effort option in this document and I am not
recommending or building it.

---

## 6. What I would actually build, ranked

### 1. Teach the existing extractor the other four apps — do this first

**Effort: an afternoon. Cost: ₹0. Risk: near zero.**

The screenshot path already works and it is already most of the way there. `extract-spend/index.ts`
is not Zepto-specific: the prompt at line 29 *already* says "Zepto, Blinkit, Instamart, or a local
kirana/supermarket bill", and an LLM reading a screenshot does not care about layout the way a
parser would. What is actually Zepto-specific is one enum. `source` is
`'zepto' | 'local' | 'other'` in:

- `supabase/migrations/20261002122729_kitty.sql:51` — the `CHECK` constraint (needs a migration)
- `src/domain/extraction.ts:15,23`, `src/domain/kitty.ts:14,191`, `src/lib/books.tsx:25`
- `src/ui/activity.tsx:13`, `src/ui/fridge.tsx:267`, `src/app/statement/[month].tsx:45`
- the `Choice` options in `src/app/import.tsx:326` and `src/app/spend.tsx:115`

Widen it to `blinkit | instamart | bigbasket | jiomart` alongside `zepto`, add the names to the
prompt's `source` rule, and the "import a Blinkit order" feature ships. The confirm card,
`normalizeExtraction`, the balance check and the alias learning all work unchanged. Statement
breakdowns get more useful for free, because the flat can finally see where the money goes by app.

This is the highest value per unit of effort by a wide margin, and it is the only item that needs
nothing from anyone outside the flat.

### 2. A shopping-list deep link with the list on the clipboard

**Effort: small. Cost: ₹0. Caveat: needs one real-phone test.**

On the shopping list, a row of buttons — Zepto, Blinkit, Instamart — that copy the list to the
clipboard and open that app's search. Build them as real `<a>` links (see §2), not JS redirects.
Base URLs, each on a path its vendor's own app-link file declares (§2):
`https://www.zepto.com/search?query=…`, `https://blinkit.com/s/?q=…`,
`https://www.swiggy.com/instamart/search?query=…`, `https://www.bigbasket.com/ps/?q=…`. All four
resolve over HTTP; that the *app* honours the query parameter is the device test below.

Honest about what this is: a convenience, not an integration. The mate still adds every item by
hand. **Before promising it, have someone tap each link on a phone with the app installed** and
confirm the app lands on the search rather than its home screen — that specific behaviour is
unverified.

### 3. Swiggy Instamart via Builders Club — the only real integration, so prototype it

**Effort: real. Cost: ₹0 to prototype, unknown in production. Needs approval.**

This is the one thing in the report that could genuinely read a cart and an order. Prototyping is
free, needs no approval, and answers the two open questions nothing else will: does `get_orders`
return itemised lines with amounts, and does a private six-person app pass their production review.

I would spend a day on the localhost prototype before committing to anything, precisely because it
is cheap to find out. Two things to go in with eyes open about: the edge function would need to
speak **MCP rather than REST**, and production access is a ~2-week human review with an
unpublished verdict for an app like ours. It covers **one of five** apps — so it supplements item 1,
it does not replace it.

### 4. An Android share-sheet target — later, and Android-only

**Effort: moderate. Blocked on iOS.**

Letting a mate share a Zepto order straight into FlatHub is a genuinely nice flow, and it is the
natural shape for this problem. But **iOS Safari does not support the Web Share *Target* API** — it
is Android/WebAPK and ChromeOS only, and remains an open WebKit request
([bug 194593](https://bugs.webkit.org/show_bug.cgi?id=194593), which I did not open — cited as the
tracking issue the write-ups point to; the current compat table is MDN's `manifest/share_target`).
Don't be misled by `caniuse.com/web-share` showing iOS support: that is the *outgoing* Web Share
API, which iOS does have and which is a different feature. Since the flat includes at
least one iPhone, which is the reason the app is Expo rather than a PWA at all, a share target
reaches some of the flat and not the rest until the EAS APK ships. Park it behind the APK; revisit
then, when it becomes an Android share intent rather than a web feature.

### 5. Email parsing — don't, yet

Blocked on an unverified premise (§3) and on a PDF step the pipeline doesn't have. Run the
zero-cost experiment first: place an order, see if an itemised email arrives.

### Not recommended

- **Scraping** (§5) — prohibited in Blinkit's and Zepto's named terms, 403s on sight, brittle.
- **QuickCommerceAPI or any reseller** (§4) — **paid, from ₹500**, scraped provenance, and it serves
  catalogue data only, so it cannot read a cart or an order anyway.
- **"Add our card to Comparify"** (§4) — Comparify takes no payments. This isn't a thing.
- **Flipkart affiliate / Amazon PA-API** (§1) — closed sign-ups and a 3-sales-per-30-days gate.

---

## What to tell the owner, in one breath

Zepto, Blinkit, BigBasket and JioMart have no API for anyone — no cart, no orders, nothing — and
their terms specifically forbid scraping it out. Swiggy is the exception and has a free developer
programme with real Instamart cart and order tools, so that one is worth a day of prototyping to
find out how much of it we can actually use. Compareify is **Comparify**, it's real, but it takes no payments — it just hands you to
Zepto — so there's no card to add. What we *can* do cheaply and immediately: make the screenshot
reader we already have work for Blinkit, Instamart, BigBasket and JioMart as well as Zepto, and put
buttons on the shopping list that open those apps with the list copied. That covers most of what he
wants, costs nothing, and ships this week.
