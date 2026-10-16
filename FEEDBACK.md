# Feedback — Nebius Token Factory, Nebius AI Cloud & NVIDIA open models

Team **Softmatter Labs** · Project **Mnemos** · Track **Personal AI**
Everything below was measured during the build on our own promo-credit account. Repro
commands are included so your team can confirm each finding without asking us for logs.

## What we used, and how heavily

| Surface | Used for | Volume in this build |
|---|---|---|
| Token Factory serverless (`/v1/chat/completions`) | every agent turn: tool routing, final answer, post-turn memory extraction | ~4 calls/turn, 1650 + 460 tokens typical |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | the fast tier — recall, tools, extraction | default for all chat |
| `nvidia/nemotron-3-super-120b-a12b` | reasoning tier (dream consolidation) | 1 call/dream |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | frontier tier: one "deep thought" + the morning brief per dream | 2 calls/dream |
| `nvidia/Nemotron-3.5-Super-VL` | reading attached photos/screenshots into memory | 1 call per image |
| `Qwen/Qwen3-Embedding-8B` | semantic recall (4096-d, truncated to 256 in-vault) | ~25 memories/backfill |
| `GET /v1/models` + `?verbose=true` | boot-time model self-heal and capability gating | 1 per boot |
| Tavily `/search` | agent tool `web.search` + the outward "web dream" | 1–2 calls/turn or dream |
| Nebius AI Cloud (Serverless Jobs/Endpoints) | **evaluated, not shipped** — see gap #7 |

A single chat turn with a web-search tool call costs about **$0.0004**; a whole dream
(three insights, one skill, one brief, on Ultra) cost about **$0.012**. The $25 promo
grant is therefore genuinely enough to build and demo this class of app — that is worth
saying out loud because it is what made our architecture possible.

## What worked well

1. **OpenAI compatibility is actually turnkey.** Mnemos is a zero-dependency Node app:
   one `fetch` to `/chat/completions`, no SDK, no lock-in. Migration from a different
   provider was a base-URL change.
2. **Native function calling on Nemotron 3 is real and good.** We replaced a hand-rolled
   JSON tool protocol with `tools` / `tool_calls` / `role:"tool"` and it worked first
   try on Nano 30B, returning platform-generated call ids (`chatcmpl-tool-b1baf…`).
   Multi-step chains (search → read result → answer with citations) behave correctly.
   The catalog's machine-readable `supported_features: ["tools","reasoning"]` is what
   let us *capability-gate* the router instead of discovering tool support by failing
   in front of a judge. Please document that field — it is under-sold.
3. **`?verbose=true` is the best onboarding endpoint in the stack.** Prices, context
   length, quantization, `per_request_limits`, regions and features in one call. Our
   "under the hood" drawer shows the platform's own numbers instead of a blog post.
4. **Price/performance spread across the Nemotron 3 family is usable as designed.**
   Nano for the every-turn path, Super for dreaming, Ultra for one flagship synthesis
   call per night. Tiered routing is a legitimate cost strategy here, not a hack.
5. **Embeddings are strong.** Qwen3-Embedding-8B on paraphrased queries ("that nervous
   thing" → "nervous about the demo") retrieves memories lexical matching cannot. 4096-d
   with no `input_type` needed; truncating to 256 dims kept our JSON vault portable
   with little recall loss.
6. **Rate ceiling headroom.** Our account reported 800k tokens/min and 100 req/min on
   the serverless Nano endpoint — never a constraint for a personal-AI workload.
7. **Latency.** Sub-5s for a full 6-citation answer on Nano at 1.1k output tokens; 2.4s
   to read and structure a whiteboard photo on Super-VL. Fine for an interactive product.

## What needs work — specific, with repro

**1. Model IDs churn during a competition window, and nothing in the API tells you.**
`nvidia/nemotron-3-nano-omni-9b-v2` and `nvidia/Llama-3_1-Nemotron-Ultra-253B-v1` both
stopped resolving (see the [August 2026 deprecation notice](https://docs.tokenfactory.nebius.com/august-2026-deprecation-notice)).
Our pinned ID silently became invalid and every chat turn failed. Because the failure
mode is "provider chain exhausted → friendly fallback text", a broken deployment *looks
alive* — we only caught it by probing our own public URL.
*Ask:* put `deprecated_at` and `successor` on the verbose model objects, and 400 loudly
with a "did you mean" string instead of a generic model-not-found. Also: capitalisation
is significant (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` works, the lowercase form 404s) —
that is a footgun no doc warns about.

**2. `/no_think` does not do what everyone assumes it does.**
Nemotron 3 is a reasoning model. With a small `max_tokens`, `content` came back **empty**
(the budget was spent thinking) or, worse, as a 300-token chain-of-thought monologue
*inside* `content`, which corrupted every structured/JSON call — this is exactly what
killed our "outward web dream" Tavily query generation. We A/B'd three switches on the
same 8-word task:

```text
reasoning_effort:"none"                      -> status 200, content "",  16 tokens burned
/system "/no_think" chat-template string     -> status 200, content "" or full CoT, 200 tokens
chat_template_kwargs:{enable_thinking:false} -> status 200, clean JSON,  15 tokens
```

Only the third works. It also made a vision call **3.3× cheaper** ($0.0006 → $0.00018).
*Ask:* document one supported way to disable reasoning for serverless Nemotron, and make
`reasoning_effort:"none"` actually mean none. Every team building an agent loop hits this.

**3. Structured-output support is ambiguous for the models we were told to use.**
The docs point at a per-model "JSON mode" tag; no Nemotron 3 entry carries it in
`models_info`, yet `response_format:{type:"json_object"}` returns 200. Is it honoured or
ignored? We cannot tell from the response, so we still parse defensively.
*Ask:* either add `json_mode` to `supported_features`, or return an
`usage.structure_enforced: true|false`.

**4. `usage` has no cost, so every client reimplements your billing.**
`prompt_tokens_details.cached_tokens` exists (good — we surface KV-cache hits), but
USD must be computed client-side from prices we scraped from a marketing page.
*Ask:* `usage.cost_usd` on the response, and a per-project spend cap. There is currently
no documented way to say "never bill me more than $10"; for a *public demo* that is a
real safety issue, not a nicety. We built our own three-layer ceiling (per-IP, per-visitor,
per-host) because we had to.

**5. The credits/billing gap makes one encouraged feature unreachable.**
The rules *encourage* Serverless Endpoints/Jobs. Verified: Serverless AI has no pricing of
its own and bills under Compute VM quotas, promo credits are Token-Factory-only and cannot
pay invoices, and AI Cloud signup charges $25 to a card first. So an entrant running on the
hackathon grant literally cannot try the thing the brief recommends. We shipped a documented
`deploy/nebius-jobs/README.md` instead of pretending.
*Ask:* a small AI Cloud sandbox grant for hackathon participants, or drop "encouraged" from
the brief. Related: Token Factory onboarding requires a bank card even for free promo
credits, and the Devpost FAQ confirms several countries cannot activate at all while
remaining *eligible* to win — that combination is an entry barrier the rules did not intend.

**6. No request-scoped observability for serverless.**
Observability dashboards/Prometheus are dedicated-endpoint-only. For a serverless app,
"which of my calls hit cache, which model, how much" is only visible in the response body.
*Ask:* a lightweight per-project request log with model + tokens + cost, even for 7 days.

**7. Batch is referenced but does not exist.** The rate-limits and RBAC pages mention a
Batch API; there is no `/v1/batches` path in the published OpenAPI. We planned our 40-question
retrieval benchmark around batching and had to run it live (fine — Nano is cheap — but the
docs misled us for a day).

## NVIDIA open models — product observations

* **Quality scales where you'd hope — but we did not A/B it properly.** We moved the
  deep-thought pass (insights + morning brief) to Ultra and the results were clearly
  better at *linking three unrelated memories* (a 23:00 screen cutoff, a six-week 10K
  goal, a monthly reading habit) than what Super had produced for us earlier on the same
  vault. That is an impression across two runs, not a controlled comparison; a fair
  Nano/Super/Ultra insight-quality eval is on our list and is the honest caveat here.
* **`cached_tokens` is present but was 0 on all of our serverless traffic.** We surface the
  field in our UI and report it accurately as zero. If KV reuse is available on public
  serverless at all, tell us how to get it — our system prompt is stable across calls, which
  is exactly the pattern caching should reward.
* **Super-VL is genuinely useful, not a demo.** It transcribed a busy whiteboard into
  structured task/owner pairs correctly, unprompted. Two caveats: it is a reasoning model
  (see #2 above), and `image` pricing in the verbose card reads `0` for a text-output task,
  which is probably right but is undocumented.
* **Licensing needs one canonical place.** Nano/Super are "NVIDIA Open Model License",
  Ultra/Super-VL came back as OpenMDW-1.1 from the catalog. For a product decision
  (can I ship this?) that difference matters, and today you have to know to ask
  `?verbose=true` to find out.

## Tavily

Fastest third-party onboarding in the whole build: one POST, clean JSON, good snippets,
`basic` depth is 1 credit and enough for agent recall. Used twice — as an agent tool and
as the *world model the Dream Engine tests memories against* (the "outward dream"), which
is the interesting pattern and worth a cookbook page.

## Onboarding score, honestly

Zero → hello world with a promo code: **15 minutes** to a first completion. Zero → a
*reliably working* production demo: **two days**, and both days were spent on model-ID
validity (#1) and thinking-token behaviour (#2). Those two bugs are the difference between
"a hackathon that works on your laptop" and one that survives 18,000 other entrants
poking your public URL.

## Would we build on it again?

Yes, deliberately: Token Factory is the only mainstream inference surface where we can
say "an NVIDIA open model, on independent infrastructure, and here is the machine-readable
proof of which one, at what price, per answer." That claim is the heart of Mnemos' privacy
and portability story. Fix #1, #2 and #5 and it stops needing an asterisk.

— Softmatter Labs, October 2026. Contact via the Devpost submission.
