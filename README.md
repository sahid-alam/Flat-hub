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

Locally, make a user in Studio (Authentication → Add user, auto-confirm) and sign in with that email and password.
On a physical phone, set `EXPO_PUBLIC_SUPABASE_URL` to your Mac's LAN IP instead of 127.0.0.1.

## Live

- App: https://flathub.vercel.app (Vercel, web build). Phones: open it and "Add to Home Screen".
- Backend: the free Supabase project `odhpvfwvpgwfgqypijnw`.
- Deploy: `vercel deploy --prod` (builds `expo export --platform web` with the Vercel env vars).
- Schema changes: `pnpm supabase db push --db-url <connection string>`; confirm first, it's the live database.

### Accounts

Sign-in is name + password. No email is ever sent, because Supabase's free sender only mails project team members.
Each mate's account is `<name>@flathub.test`; the sign-in screen adds the domain when you type a bare name.

- New mate: Supabase dashboard → Authentication → Add user → email `<name>@flathub.test`, a password, "Auto Confirm User".
- Forgotten password: Supabase dashboard → SQL editor:
  ```sql
  update auth.users set encrypted_password = extensions.crypt('new-password', extensions.gen_salt('bf'))
  where email = 'ayan@flathub.test';
  ```
- Anyone can change their own password in the app: Mates → Change password.

## Checks

```sh
pnpm test                    # domain maths: node --test "src/domain/*.test.ts"
pnpm supabase test db        # pgTAP: RLS + ledger invariants
pnpm typecheck
```
