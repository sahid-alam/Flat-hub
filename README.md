# FlatHub

The flat's kitty, on the fridge door. See [CLAUDE.md](CLAUDE.md) and [docs/PLAN.md](docs/PLAN.md).

## Run it locally

```sh
pnpm install
cp .env.example .env
pnpm supabase start          # Docker; Studio on :54323, sign-in emails on Mailpit :54324
pnpm supabase db reset       # apply migrations to a fresh database
npx expo start --ios         # or scan the QR with Expo Go
```

Sign in with any email: the 6-digit code arrives in Mailpit (http://127.0.0.1:54324).
On a physical phone, set `EXPO_PUBLIC_SUPABASE_URL` to your Mac's LAN IP instead of 127.0.0.1.

## Checks

```sh
pnpm test                    # domain maths: node --test "src/domain/*.test.ts"
pnpm supabase test db        # pgTAP: RLS + ledger invariants
pnpm typecheck
```
