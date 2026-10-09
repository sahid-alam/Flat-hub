# Deploying V3

Six people use this app for real money. V3 changes almost every screen and adds seven migrations to a
database that already holds the flat's August, September and October books.

**Read this once before starting.** The whole thing is about 30 minutes, and most of it is waiting.

---

## Before you start

| | |
|---|---|
| Hosted project | `odhpvfwvpgwfgqypijnw` |
| Live app | https://flathub.vercel.app |
| Migrations already applied there | **8** (through `20261004170413_m4_chore_event_points`) |
| Migrations this adds | **7** (`20261008094500` … `20261008220000`) |
| `pg_cron` / `pg_net` | **already enabled** — you did this on 8 Oct |

All seven new migrations sort *after* everything already applied, so ordering needs no special
handling. None adds a NOT NULL column without a default. B8's `drop constraint` is a widening — every
existing `zepto`/`local`/`other` row stays valid, and so do the old `skipped` duty rows.

### Take a backup first

Non-negotiable. Five months of the flat's money lives in that database.

```sh
supabase db dump --db-url "$FLATHUB_DB_URL" -f ~/flathub-backup-$(date +%F).sql
```

`FLATHUB_DB_URL` is the direct connection string from
**Dashboard → Project Settings → Database → Connection string → URI**.
Check the file is more than a few KB before continuing.

---

## 1. Migrations go FIRST, app second

This order matters and is not interchangeable. B8 widens the set of shops a spend may come from; if
the app ships first, choosing Blinkit errors until the constraint lands. The reverse is safe: the new
tables simply do not exist yet, and `src/lib/books.tsx` reads them non-fatally, so the old app keeps
working against the new schema.

```sh
supabase link --project-ref odhpvfwvpgwfgqypijnw     # not linked yet
supabase db push
```

It should report 7 migrations applied. If it stops partway, stop and tell me — do not re-run blindly.

**Then check the flat still works before going further.** Open https://flathub.vercel.app on your
phone: the kitty figure, the recent feed, duties. The old build against the new schema should be
completely unaffected. If it is not, we stop here and the backup goes back.

---

## 2. Notifications (optional, and skippable)

Nothing else depends on this. If you would rather ship the app today and do push next week, skip
straight to step 3 — the app works fine without it and the settings screen simply has nothing to turn on.

```sh
# one key pair, generated once. Rotating it later invalidates every subscription.
npx web-push generate-vapid-keys

supabase secrets set \
  VAPID_PUBLIC_KEY=<public> \
  VAPID_PRIVATE_KEY=<private> \
  VAPID_SUBJECT=mailto:developer7gence@gmail.com \
  NOTIFY_SECRET=$(openssl rand -base64 32)

supabase functions deploy notify
```

Then two Vault rows, so neither the URL nor the secret is ever committed — in the SQL editor:

```sql
select vault.create_secret(
  'https://odhpvfwvpgwfgqypijnw.supabase.co/functions/v1/notify', 'notify_url');
select vault.create_secret('<the same NOTIFY_SECRET>', 'notify_secret');
```

And the **public** key into Vercel as `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, for the web build.

Until those Vault rows exist the nightly job logs a warning and posts nothing, which harms nothing.

> **The one thing that might surprise us.** The `notify` function imports from `src/domain/` so the
> push names the same mate the Duties tab shows. That resolves under `functions serve`, which was
> tested — but `deploy` uses a different bundler and could not be tested without a linked project. If
> the deploy fails to resolve the import, the fallback is `supabase functions deploy notify --use-api`.

---

## 3. The app

```sh
npx vercel deploy --prod
```

Then check on a phone, not a laptop: Home, the nav animation, Duties, Bills, Profile.

---

## 4. The six of you, once each (two minutes)

Only needed for notifications.

1. Open https://flathub.vercel.app in Safari or Chrome
2. Share → **Add to Home Screen** *(mandatory on iPhone — web push does not work in a tab)*
3. Open it **from the icon**, not the browser
4. The flat → Notifications → **Turn on**, and accept the prompt

**Say this to the flat before they tap.** The permission prompt appears once. A browser that has been
told "no" will not ask again, and the app cannot ask its way back — on iPhone the only route back is
the system settings, which nobody could confirm is simple. So: tap Allow, and mute individual
notifications inside the app afterwards if any of them annoy you. There is no master switch on purpose.

---

## If something goes wrong

**The app looks broken but the data is fine** — roll the app back, keep the schema:
```sh
npx vercel rollback
```
The new schema is backwards-compatible with the old build. This is the safe, boring fix and it should
be the first thing tried.

**The data looks wrong** — stop. Do not write anything, do not "fix" a figure by hand. Every ledger is
append-only, so nothing is lost and a correction is a reversing entry, never an edit. Tell me what is
on screen and what you expected.

**A migration failed partway** — Supabase applies each in a transaction, so the failed one rolled back.
Send me the error. Do not re-run.

---

## What the flat will notice on day one

Worth saying in the group so nobody thinks it is broken.

- **Low stock will look alarming** — everything has a minimum and nothing has been bought through the
  new system yet. It settles after one grocery run.
- **Quick Add shows placeholder prices.** Nobody has sent the real basket list yet, so the figures are
  plausible Delhi-NCR guesses rather than what the flat actually pays. Editing any product fixes it,
  and re-seeding later keeps whatever has been corrected.
- **Duty points start at zero** for the month.
- The old `/fridge`, `/shopping`, `/stock` links still work — anything saved or shared keeps resolving.
