# `notify`

The one sender for every FlatHub notification. Takes a trigger and a date, works out who should
hear about it, and posts an encrypted Web Push to each of their devices.

Spec: [docs/NOTIFICATIONS.md](../../../docs/NOTIFICATIONS.md). B9 ships the machine plus exactly one
trigger — **#1, "your duty is due today"** — because it is the only one of the 22 that needs no V3
schema that does not exist yet.

```
POST /functions/v1/notify
x-notify-secret: <NOTIFY_SECRET>
{ "trigger": "duty_due_today", "today": "2026-10-08" }

→ 200 { "trigger", "today", "recipients", "sent", "already", "off" }
```

`already` is the count that was claimed by an earlier run — a retry showing `already` and `sent: 0`
is the system working, not failing.

## What the owner must do before this works

Nothing here is deployed. Four secrets and two Vault rows, once.

### 1. Generate the VAPID keypair

One ECDSA P-256 pair, generated once, never rotated unless it leaks. Rotating it invalidates every
existing subscription, so every mate would have to tap the button again.

```bash
npx web-push generate-vapid-keys
```

Or with no new dependency (verified working on this machine):

```bash
node -e "const {subtle}=require('crypto').webcrypto;(async()=>{
  const k=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub=Buffer.from(await subtle.exportKey('raw',k.publicKey));
  const b64=b=>b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+\$/,'');
  console.log('public :',b64(pub));
  console.log('private:',(await subtle.exportKey('jwk',k.privateKey)).d);})()"
```

### 2. Set the function secrets

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=<the public key> \
  VAPID_PRIVATE_KEY=<the private key> \
  VAPID_SUBJECT=mailto:developer7gence@gmail.com \
  NOTIFY_SECRET=$(openssl rand -base64 32)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform — do not set them.

**`NOTIFY_SECRET` is the only thing standing between this function and anyone who has the client
bundle.** The function needs `verify_jwt = false` so `pg_net` can reach it without a JWT
(`supabase/config.toml`), so without the shared secret a stranger could fire the 08:00 reminder at
03:00. Make it long and random.

### 3. Put the public key in the web build

The **public** key is safe in the bundle and must be there, or the Turn-on button has nothing to
subscribe with. Add to `.env` locally and to the Vercel project's environment variables:

```
EXPO_PUBLIC_VAPID_PUBLIC_KEY=<the public key>
```

The private key must never appear in anything prefixed `EXPO_PUBLIC_`.

### 4. Tell pg_cron where to post, through Vault

The migration reads both of these by name, so neither the URL nor the secret is committed:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify', 'notify_url');
select vault.create_secret('<the same NOTIFY_SECRET as above>', 'notify_secret');
```

Until these exist the 02:30 UTC job raises a warning and posts nothing, which shows up in
`cron.job_run_details` and breaks nothing.

### 5. Deploy

```bash
supabase functions deploy notify
```

**One thing to watch on the first deploy.** `index.ts` imports
`../../../src/domain/duties.ts` — it reaches *outside* `supabase/functions/`. That is deliberate:
the rota is a fair-share deficit prorated by presence and absence with a last-did tiebreak, and a
second copy of it in PL/pgSQL that drifted would make this push name a different mate than the
Duties tab shows. One implementation, one test.

This import is **verified working under `supabase functions serve`** but was **not verified under
`supabase functions deploy`** — there is no linked project here and the two use different bundlers.
If deploy cannot resolve it, try `supabase functions deploy notify --use-api`, which bundles
server-side. If that also fails, the fallback is a copy step into `supabase/functions/_shared/`
(and then the copy must be regenerated whenever `src/domain/duties.ts` changes — which is exactly
the drift this design avoids, so reach for it last).

### 6. Walk round the flat, once

Each mate: Share → Add to Home Screen → open it from the new icon → **The flat → Notifications →
Turn on notifications**. Six taps, one Sunday evening.

On an iPhone the Home Screen install is **mandatory** — notifications never work from a Safari tab.
And the prompt only appears once: a mate who taps "Don't allow" cannot be asked again by the app,
only through their device settings. So say what it sends before they tap, which is what the screen
does.

## Rules this function enforces

1. **Only the 8 push triggers.** `PUSH` in `index.ts` is the whole list; anything else is a 400, and
   `notification_send`'s CHECK constraint says the same in the database. The other 14 triggers in
   the doc are an in-app count or the single 19:00 digest. Six people getting ten pushes on an
   ordinary Tuesday turn them all off inside a fortnight, and on iPhone that is close to permanent.
2. **One push per member, per trigger, per day.** Claimed by inserting `notification_send` *before*
   sending; its unique `(household_id, trigger, member_id, due_on)` makes a `pg_cron` retry a no-op.
   The claim-first order is deliberate: a claim followed by a failed send loses a reminder, and a
   lost reminder is cheaper than a phone buzzing twice for the same duty. Everything a notification
   says is already on the screen it points at, so a miss costs nothing.
3. **Never notify the actor.** Not reachable yet — the one shipped trigger has no actor — but every
   webhook trigger added later must exclude whoever wrote the row, or Ansh gets a push for every
   reimbursement he types in himself.
4. **Preferences are read, not owned.** `v3/b5-profile` owns `notification_pref`. A missing table, a
   missing row or any error at all means `sound`, the default: notifications must work before the
   settings screen exists and must never crash because of it.

## The empty slots

Each one is a branch here plus a line in the migration. The migration's footer lists them with the
cron expressions. Waiting on another branch's tables:

| # | Trigger | Waiting on |
|---|---|---|
| 3 | `duty_offered` | `v3/b4-duties` — the offer row |
| 4 | `duty_offer_claimed` | `v3/b4-duties` — the claim row |
| 22 | `duty_half_open` | `v3/b4-duties` — `duty.group_size` + `assignees()` |
| 21 | `meal_plan_missing` | `v3/b1-shell-home` — `meal_plan` + `duty.plans_meals` |

Needing no new schema, just a schedule and a branch here: `duty_not_ticked` (#2, 20:00 IST),
`topup_missing` (#7, monthly), `month_ready_to_close` (#17, monthly), `reimbursed` (#8, a webhook
on `pool_entry`).

## Proving it locally

```bash
# supabase/functions/.env (gitignored) with the four secrets above, then:
pnpm supabase functions serve --env-file supabase/functions/.env
curl -X POST http://127.0.0.1:54321/functions/v1/notify \
  -H 'Content-Type: application/json' -H 'x-notify-secret: <local secret>' \
  -d '{"trigger":"duty_due_today","today":"2026-10-08"}'
```

With no `push_subscription` rows it answers `recipients: N, sent: 0` — which still proves the rota
ran. To prove the encryption too, point a subscription's `endpoint` at a local server and decrypt
what arrives: the body is `aes128gcm`, the `Authorization` header is `vapid t=<JWT>, k=<key>`, and
the plaintext is the JSON `sw.js` reads.
