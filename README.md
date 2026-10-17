<div align="center">

# ✶ Mnemos

### Memory you can see, question, and own.

**Nebius × NVIDIA Global AI Hackathon · Personal AI track · Team Softmatter Labs**

▶ [Live demo](https://mnemos-personal-ai.onrender.com) ·
[3-minute video](https://youtu.be/7Cq7HQzpTZQ) ·
[Feedback on the platform](FEEDBACK.md)

`Nebius Token Factory` · `NVIDIA Nemotron 3 Nano/Super/Ultra/Super-VL` · `Tavily` · MIT · 37 tests

![Mnemos: the memory sky with the live telemetry drawer open](assets/gallery-01-telemetry.png)

</div>

---

Every AI assistant you use either forgets you when the tab closes, or remembers you in a
box you cannot open. Mnemos is a private, always-on personal AI whose memory is a **sky
you can watch**: each memory is a star, brighter while it is being used, dimming as it
fades. It cites the exact memories behind each answer, you can **delete one memory and
watch the answer change**, it consolidates overnight into insights and a morning brief,
and the whole vault is one readable JSON file that you can export or burn.

Three beats, in the order you should try them:

| | | |
|---|---|---|
| **Watch it think** | Ask a question and see the retrieval happen: the stars it reads pulse, the tool calls stream by (`memory_search`, `web_search`, `sky_shape`…), and the answer arrives with `[M…]` citation chips. Click one and that exact star flares. A citation that cannot be resolved renders **red** — you see the model overreach instead of trusting it. And because models are not perfectly disciplined about receipts, the app audits its own: a memory that overlaps the answer but was never cited appears as a dashed amber *matched but not cited* chip, so an uncited claim is still traceable. The **⚙ Telemetry** drawer shows the model, tier, tokens, KV-cache hits, latency and USD of every call, with prices read live from the platform. |
| **Test it** | Click any star → **"🧪 What if it forgot this?"** Mnemos answers the same question twice, once with that memory and once without, diffs the two sentences, counts the citations it lost, and scores whether the memory was load-bearing. Trust is not a claim here; it is an experiment you can run in four seconds. |
| **Own it** | Export your vault, import it into a local install, or burn it. Attach a whiteboard photo and an NVIDIA vision model reads it into new stars. Ask for a dream with an intention — *"10K race in six weeks, portfolio review Friday"* — and you wake up to a brief with three concrete actions, written from insights your own notes never stated out loud. |

---

## Does it meet the rules? (checked, not asserted)

| Requirement | Where it is true |
|---|---|
| Runs on Nebius Token Factory | every turn, every dream, every embedding is a runtime call to `https://api.tokenfactory.nebius.com/v1`. The UI's **⚙ Under the hood** drawer shows the model, tier, tokens, latency and USD for each live call. |
| ≥1 NVIDIA open-source model | four: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (fast tier), `nvidia/nemotron-3-super-120b-a12b` (reasoning), `nvidia/Nemotron-3-Ultra-550b-a55b` (frontier: dream synthesis + morning brief), `nvidia/Nemotron-3.5-Super-VL` (photo → memory). |
| Personal AI track | persistent memory + reusable skills (`SKILL.md`) + your choice of tools + tasks across daily workflows + data under your control, and it uses the named toolchain: MCP memory server for **NVIDIA Hermes / NemoClaw** hosts, plus an **OpenShell** default-deny policy in [`deploy/openshell/`](deploy/openshell/README.md). |
| Working demo URL | https://mnemos-personal-ai.onrender.com (free tier, keep-alive cron so it never cold-boots on a judge). |
| Public repo + open-source licence | MIT, visible in the repo's About panel. |
| Best Use of Tavily | `web.search` is a native agent tool **and** the Dream Engine's world model ("outward dream": tonight's replay turns one memory into a query, searches, and wakes with new stars). Runtime calls, not a mention. |
| New in the Submission Period | first commit **6 October 2026** — inside the window. Nothing predates it. |
| Feedback | [FEEDBACK.md](FEEDBACK.md), with repro commands and two findings you can reproduce in a minute. |

## How it works

```
 Browser (galaxy canvas · chat · ablation · under-the-hood)
     │  SSE + cookie session                    ┌──────────────────────────────┐
     ▼                                          │ MCP clients: Hermes Agent,   │
 Gateway ── per-visitor vault ──► Store (JSON)  │ Claude Code, any MCP host    │
     │        one directory each                └──────────────┬───────────────┘
     ├── Write path   Nano extracts durable facts → dedupe → embed → star is born
     ├── Read path    BM25 ⊕ cosine (hybrid fusion) → top-k → native tool_calls → cited answer
     ├── Dream path   replay (biased by your intention) → Ultra insights → constellation →
     │                SKILL.md → morning brief → 21-day half-life decay
     └── Outward path Tavily query → new stars from the wider world
```

**Model routing is capability-gated, not guessed.** On boot the app reads
`GET /v1/models?verbose=true`, checks each model's `supported_features`, and only offers
native tool schemas when the platform says the model has them. If an ID stops resolving,
it is healed to a live one automatically — we learned that the hard way when Nebius
retired a model mid-hackathon and took our own demo down.

| Tier | Model | Used for | Published price / 1M |
|---|---|---|---|
| fast | Nemotron 3 Nano 30B-A3B | routing, tools, extraction, answers | $0.06 / $0.24 |
| reason | Nemotron 3 Super 120B-A12B | dream consolidation | $0.30 / $0.90 |
| frontier | Nemotron 3 Ultra 550B-A55B | one deep-thought pass + morning brief per dream | $1.00 / $3.00 |
| vision | Nemotron 3.5 Super-VL | photos and screenshots → memories | $0.30 / $0.90 |
| embed | Qwen3-Embedding-8B (4096-d → 256) | semantic recall | $0.01 / — |

Measured on our own account: **a chat turn with a web-search tool call ≈ $0.0004**,
**a full dream ≈ $0.012**, **a whiteboard read ≈ $0.00018**. Every visitor is capped
(per-IP, per-session and per-host) and can see their remaining budget in the drawer.

## Retrieval, measured

`eval/` holds a reproducible benchmark: **59 seeded memories across 9 sessions** and
**40 questions** built on the **LongMemEval** ability taxonomy (arXiv:2410.10813) —
single-session, multi-hop, temporal, **knowledge-update** (a fact changes and the new
value must win) and **abstention** (the answer is not in the vault, so the system must
say so). Every arm is scored for retrieval quality, answer correctness against an oracle,
citation validity, staleness, latency and spend, using the real provider.

Two independent live runs of the same shipped code, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
+ `Qwen/Qwen3-Embedding-8B`, k=6. Retrieval metrics are deterministic and identical across
runs; answer-side metrics are shown as the range the two runs produced, because the model is
sampled and pretending otherwise would be fake precision:

| Arm | hit@6 | recall@6 | MRR | answer acc | stale answer | citations resolve | abstains | $ / 100 q |
|---|---|---|---|---|---|---|---|---|
| lexical only | 97.0% | 94.4% | 0.737 | 75.8–81.8% | 0.0–22.2% | 80.0–88.6% | 57.1–71.4% | $0.0024 |
| embedding only | 100.0% | 94.4% | **0.909** | 78.8–81.8% | 33.3–44.4% | 91.7–91.9% | 42.9–57.1% | $0.0028 |
| **hybrid (shipped)** | 97.0% | 92.9% | 0.824 | 69.7–75.8% | 11.1–22.2% | 83.3–86.1% | 42.9–57.1% | $0.0028 |
| full agent loop | 97.0% | 92.9% | 0.824 | 69.7–78.8% | 11.1% | 17.5–35.0% | 0% | $0.0137 |

**What the numbers made us fix.** The first live run reported that the system answered
unanswerable questions almost every time, which flatly contradicted our own
anti-hallucination claim. Reading the model's actual output instead of trusting the metric
found two separate causes:

1. `recall()` returned *the six most recent memories* whenever nothing matched — an
   invitation to confabulate. It now has a relevance floor and returns nothing, and the agent
   is told when retrieval is weak instead of being handed padding.
2. The abstention detector only matched contracted English, so "**I do not remember**" was
   being scored as a hallucination. A measurement bug, fixed and re-run.

After both, the shipped arm abstains on 43–57% of unanswerable questions (up from 0–43%
before, where part of that gap was the detector itself), and marking a replaced memory
`supersededBy` and dimming it holds stale-fact assertions to 11–22%.

**What is still weak, stated plainly.** The full agent-loop arm abstains 0% of the time and
only 35% of its citations resolve against the *initial* recall set — because in a tool loop
the agent legitimately retrieves more memories mid-turn, which this scorer does not credit,
and because its conversational system prompt is less strict about declining than the
direct-answer arms. Both are real: the loop is more useful and less careful than the
single-shot path. Tightening it is the top item after the hackathon.

```bash
node eval/build-vault.mjs          # deterministic vault + 40 questions
node eval/run.mjs --mode mock      # prove the harness offline, spends nothing
node eval/run.mjs --mode live --yes --budget 1.50
node eval/report.mjs               # eval/results/table.md + chart.html
```

Scope, honestly: this is a *LongMemEval-style protocol on a 40-question in-house set*. It is
not score-comparable with published LongMemEval numbers. Full definitions in
[`eval/README.md`](eval/README.md); raw rows in `eval/results/live.json`.

## Portability: your memory is not trapped in this app

`src/mcp.js` is a **zero-dependency MCP server** (newline-delimited JSON-RPC over stdio,
protocol negotiated from 2025-03-26 to 2025-06-18, stdout is protocol-only). Eight tools —
`memory_search`, `memory_remember`, `memory_forget`, `memory_list`, `vault_snapshot`,
`dream_run`, `skill_export`, `sky_shape` — and resources `mnemos://vault/{stars,timeline,skills}`
plus a per-memory template. Point any MCP host at your vault:

```bash
node src/mcp.js --vault ./vault            # stdio
# Hermes Agent / Claude Code config: see mcp.example.json
```

Skills that Mnemos learns while dreaming export as **`SKILL.md`** files — the same
convention NVIDIA's Hermes/NemoClaw self-evolving agents use — so a second agent can pick
up a routine your memory engine figured out. That is the portability claim, and it is
testable: `node --test test/mcp.test.js` drives the server as a real subprocess.

## Privacy as architecture, not as a promise

* **One vault per visitor.** Cookie-scoped directory, no shared index, no cross-session
  recall, nothing persisted for a visitor that is creating vaults too fast. Idle vaults
  expire. Verified: a fact stored by visitor A is absent from visitor B's retrieval.
* **Your data leaves the browser only to two hosts** — Token Factory and Tavily. Inside an
  [OpenShell](deploy/openshell/README.md) sandbox that becomes kernel-enforced default-deny.
* **Red zone**: name topics the assistant must never discuss; the list is injected
  server-side, so it is not something a user can prompt out of it.
* **Receipts, audited**: cited chips, dashed *matched but not cited* chips, and red
  unresolvable chips are three different states on purpose. The system never upgrades a
  guess into a citation.
* **Anti-injection plumbing**: input wrapping, secret protocol in a separate system block,
  SSRF guard on `web.fetch`, 100 KB body cap, images accepted only as data URLs.
* **No accounts, no telemetry, no analytics script.** The drawer's numbers come from the
  provider's own usage fields.

## Try it without typing anything

The demo accepts deep links, so a judge (or a screen recording) can open it already in
motion. No text is taken from the URL — the four prompts are hard-coded, so a shared link
cannot inject a question into somebody else's sandbox.

| Link | What you see |
|---|---|
| `?demo=1#telemetry` | a real turn in flight with the telemetry drawer open |
| `?demo=2` | the agent calling Tavily mid-answer and citing the result |
| `?demo=1&ablate=1` | the ablation experiment on the first cited memory |
| `?demo=3` | "arrange my sky like Leo" — the agent reshapes the galaxy itself |
| `?dream=1` | the dream overlay: replay → insights → constellation → brief |

## Run it

Requires Node ≥ 20. No `npm install` for the app itself — runtime dependencies: zero.

```bash
cp .env.example .env        # add NEBIUS_API_KEY (and optionally TAVILY_API_KEY)
npm start                   # → http://localhost:8787
```

$25 of free Token Factory credit is available for this hackathon with activation code
`NEBIUS-DEVPOST-GLOBAL26`; Tavily credits via `BBDEVPOST`. With no key at all the app still
runs: the galaxy, decay, timeline, vault tools and dream replay all work, and generation
degrades politely.

| Env | Default | Notes |
|---|---|---|
| `NEBIUS_API_KEY` | — | the only required key |
| `NEBIUS_MODEL` / `_REASONING_MODEL` / `_FRONTIER_MODEL` / `_VISION_MODEL` / `_EMBEDDING_MODEL` | catalog-derived | healed against `/v1/models?verbose=true` on boot |
| `TAVILY_API_KEY` | empty | enables `web.search` + outward dreams |
| `MNEMOS_SINGLE_VAULT=1` | off | owner mode: one local vault (your own machine) instead of per-visitor sandboxes |
| `GATE_TURNS_PER_MIN` / `GATE_TURNS_PER_HOUR` / `GATE_TOKENS_PER_DAY` / `GATE_USD_PER_SESSION` / `GATE_USD_HOST` | 6 / 30 / 400k / $0.75 / $8 | spend ceilings for a public demo |
| `VAULT_TTL_DAYS` | 45 | sandbox vaults expire |

```bash
npm test            # 37 tests: store, decay, citations, hybrid recall, agent loop,
                    # SSRF guard, dream engine, nightly catch-up, MCP protocol
npm run typecheck                   # strict JS type-check over src/, public/, eval/, test/
npm run eval                        # the live benchmark (spends ~$0.01, asks for --yes)
npm run eval:mock                   # the same harness offline, spends nothing
npm run doctor                      # vault audit: embedding coverage, dupes, contradictions,
                                    # staleness, secret leakage, red-zone overshoot
```

## Repo map

```
src/llm.js        provider chain, catalog self-heal + capability map, tiered routing,
                  native tool calls, vision calls, cost meter, 429 back-off
src/brain.js      agent loop (native tool_calls with prose fallback), hybrid recall,
                  citation extraction, photo reading, memory extraction, red zone, SSRF guard
src/store.js      vault schema, Okapi BM25, hybrid fusion, 21-day decay, reinforce, layout, brief
src/dream.js      replay → outward Tavily web-dream → Ultra consolidation → constellation
                  naming → SKILL.md → intention-conditioned morning brief → decay
src/sessions.js   per-visitor vault directories, export/import/burn, TTL sweep
src/limits.js     three-layer spend gate
src/ablation.js   answer-with / answer-without, word diff, impact verdict
src/mcp.js        zero-dependency MCP server (stdio)
src/server.js     HTTP gateway, SSE, cookies, budget, telemetry endpoints
src/night.js      03:30 nightly dream + catch-up on boot
public/           galaxy renderer, chat, ablation card, under-the-hood drawer, tour, sound
eval/             LongMemEval-style benchmark harness + dataset + results
deploy/           OpenShell policy + Nebius Jobs notes (honest, verified-or-labelled)
test/             37 tests · tools/vault-doctor.js · .github/workflows/keep-alive.yml
```

## The pitch in three minutes

Video: *link goes here* — 0:00 the sky, 0:25 citations that flare, 0:55 **the ablation**,
1:25 a dream with an intention and the morning brief, 2:05 Hermes/Claude reading the vault
over MCP, 2:35 the measured retrieval chart, 2:50 "Nebius Token Factory, NVIDIA Nemotron 3."

## Prior art we do not pretend otherwise about

OpenAI's ChatGPT memory ("Dreaming") and Anthropic's Dreams research preview both
consolidate memory in the background, and Letta's sleep-time compute published the idea in
2025. **We are not claiming offline consolidation as new.** What none of them do is let you
*watch* the consolidation, click the memory behind a sentence, delete it, and see what the
answer loses. Mnemos is the observable, falsifiable version of that feature — plus the
portability (JSON vault, MCP, SKILL.md) they do not offer.

## Licence

MIT — see [LICENSE](LICENSE). Built in the open during the hackathon window; contributions
welcome.
