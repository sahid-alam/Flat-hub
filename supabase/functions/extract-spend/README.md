# extract-spend

Reads a Zepto/Blinkit order (PDF or screenshot), a photo of a shop bill, or pasted text, and returns
`{ extraction }` in the `Extraction` shape from `src/domain/extraction.ts`. Nothing is saved here: the
app runs `normalizeExtraction()` and shows a confirm card first. The client calls it through
`extractSpend()` in `src/lib/extract.ts`.

Request: `POST /functions/v1/extract-spend` with the signed-in user's JWT and
`{ input: { type: 'image', media_type, data } | { type: 'pdf', data } | { type: 'text', text } }`
(`data` is base64; a `data:` URL prefix is fine). Bodies over ~6 MB are rejected (413).
Errors come back as `{ error: string }`, written for the user.

Auth: the gateway's `verify_jwt` stays on, and the function also checks `/auth/v1/user`, because the
public anon key is a valid JWT too and must not be able to spend Anthropic credit.

## Settings

| Variable | Meaning |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key. Required in production. |
| `FLATHUB_EXTRACT_MODEL` | Optional. Defaults to `claude-opus-5-5` at low effort. Set `claude-sonnet-5-5` or `claude-haiku-4-5` to pay less per order. |
| `FLATHUB_EXTRACT_MOCK` | `1` with no API key returns a fixed Zepto order (items, fees, a coupon). Local development only. |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by Supabase automatically.

## Run locally

```sh
echo FLATHUB_EXTRACT_MOCK=1 > /tmp/extract.env   # or ANTHROPIC_API_KEY=sk-ant-... for real extraction
pnpm supabase functions serve --env-file /tmp/extract.env
```

## Deploy (by hand, when ready)

These touch the live project. Run them yourself; agents must not.

```sh
pnpm supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref odhpvfwvpgwfgqypijnw
pnpm supabase functions deploy extract-spend --project-ref odhpvfwvpgwfgqypijnw
```

Before deploying, check **Project Settings → JWT Keys** in the dashboard. If the project signs user
tokens with asymmetric keys (ES256) and the gateway rejects them, add this to `supabase/config.toml`
and deploy again; the in-function `/auth/v1/user` check still keeps signed-out callers away:

```toml
[functions.extract-spend]
verify_jwt = false
```
