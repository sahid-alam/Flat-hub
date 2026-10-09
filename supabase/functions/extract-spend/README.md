# extract-spend

Reads a Zepto/Blinkit order screenshot, a photo of a shop bill, or pasted text, and returns
`{ extraction }` in the `Extraction` shape from `src/domain/extraction.ts`. Nothing is saved here: the
app runs `normalizeExtraction()` and shows a confirm card first. The client calls it through
`extractSpend()` in `src/lib/extract.ts`.

Request: `POST /functions/v1/extract-spend` with the signed-in user's JWT and
`{ input: { type: 'image', media_type, data } | { type: 'text', text } }`
(`data` is base64; a `data:` URL prefix is fine). Bodies over ~6 MB are rejected (413).
Errors come back as `{ error: string }`, written for the user.

**PDFs are not supported.** Ollama takes images only, so `type: 'pdf'` returns a 400 telling the mate
to screenshot the order instead — which is the faster path on a phone anyway.

Auth: the gateway's `verify_jwt` stays on, and the function also checks that the caller is a household
member (RLS on `member` only returns the caller's own households), because the public publishable key
is a valid JWT too and must not be able to spend anyone's quota.

## Backend: Ollama Cloud, free plan

The flat is on [Ollama](https://ollama.com)'s **free** plan. These models are available on it:

| Model | Reads images? |
| --- | --- |
| `gemma4:31b` | **yes** — the default, and the only free one that does |
| `gpt-oss:20b`, `gpt-oss:120b` | no — text only |
| `nemotron-3-nano:30b`, `nemotron-3-super`, `nemotron-3-ultra` | no — text only |

Everything else in Ollama's catalogue (minimax, glm, kimi, deepseek, mistral-large) needs a paid plan
and returns HTTP 402; the function turns that into a plain "needs a paid Ollama plan" message rather
than a user-facing error.

Ollama **ignores a JSON Schema passed as `format`** — it returned its own field names in a markdown
fence when given one. The shape is pinned instead with `format: "json"` plus the literal shape written
into the prompt, and the function re-checks the shape before replying. Verified on a real Zepto bill:
items, both fees and the coupon came back correct, and the lines summed exactly to the total.

## Settings

| Variable | Meaning |
| --- | --- |
| `OLLAMA_API_KEY` | Ollama Cloud key. Required in production. |
| `FLATHUB_EXTRACT_MODEL` | Model override. Defaults to `gemma4:31b`. Keep it to a free model from the table above. |
| `FLATHUB_OLLAMA_URL` | Endpoint override. Defaults to `https://ollama.com/api/chat`. |
| `FLATHUB_EXTRACT_MOCK` | `1` returns a fixed Blinkit fixture when no key is set — for local work. |

## Deploy

```sh
supabase secrets set OLLAMA_API_KEY=... --project-ref <ref>
supabase functions deploy extract-spend --project-ref <ref>
```

## Local

```sh
printf 'OLLAMA_API_KEY=...\n' > /tmp/fn.env        # or FLATHUB_EXTRACT_MOCK=1 for the fixture
pnpm supabase functions serve --env-file /tmp/fn.env
```

Then POST with a local member's JWT. Delete the env file afterwards — it holds a real key.
