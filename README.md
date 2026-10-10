# ✶ Mnemos — the AI that dreams

**A private AI that remembers you, shows its memory as a living galaxy, and dreams.**

Mnemos is not another chatbot with a system prompt. It is a personal AI whose inner life you can *watch*:

- **Memory Galaxy** — every memory is a star. Bright stars are strong, recently used memories; faint ones are fading away. The sky *is* the vault.
- **Cited recall (anti-hallucination UX)** — when Mnemos answers from memory, it cites the exact stars it used (`M4f2b91a1`). Click a citation and the star flares in the galaxy. Cites that don't resolve are marked red — the UI shows you what the model *actually* remembered.
- **Dream Engine** — tell Mnemos to sleep. It replays memories one by one, distills non-obvious cross-memory insights (drawn as constellation lines), learns reusable skills, and lets forgotten things decay. You watch it happen, live.
- **Local vault** — all memories, insights and skills live in a plain JSON file (`vault/vault.json`). Read it, export it, carry it. Nothing leaves your machine except the model calls.
- **Transparent agentic loop** — tool calls (`memory.search`, `time.now`, `math.eval`, `web.fetch`, `web.search` via Tavily, `skill.run`) stream into the ticker as they happen.

Built for the **Nebius x NVIDIA Global AI Hackathon** (Best Apps and Agents track).

---

## Quick start

Requires **Node.js 20+** (no other dependencies — no `npm install` needed).

```bash
cp .env.example .env   # then add one API key (see below)
npm start              # opens http://localhost:8787
```

Give it your name on the welcome screen and talk. The vault ships with a seeded demo
sky so you can explore immediately; say "forget everything" or delete `vault/vault.json`
to start from a truly empty sky.

### Give it a language core (free)

Mnemos is **provider-agnostic with automatic failover**. It needs *one* key, any of these:

| Provider | Cost | Get a key | NVIDIA open model? |
|---|---|---|---|
| **Nebius Token Factory** (primary) | $25 free credits, code `NEBIUS-DEVPOST-GLOBAL26` | [nebius.com/promo-code](https://nebius.com/promo-code?utm_promo_event_code=2026-devpost-global-ai-hack&utm_promo_code_type=Token_Factory&utm_promo_activation_code=NEBIUS-DEVPOST-GLOBAL26) | ✅ Nemotron 3 |
| OpenRouter | free tier | [openrouter.ai/keys](https://openrouter.ai/keys) | ✅ Nemotron Nano (free) |
| Groq | free tier | [console.groq.com/keys](https://console.groq.com/keys) | — |
| Google AI Studio | free tier | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | — |
| NVIDIA NIM | free credits | [build.nvidia.com](https://build.nvidia.com) | ✅ Nemotron |

Keys go in `.env` (gitignored). On boot Mnemos **autodetects** the exact model ID from
the provider's `/models` endpoint, so model names stay correct as catalogs evolve.
Switch providers live via the provider pill in the top bar.

Optional: add `TAVILY_API_KEY` to give the agent live web search.

### Run tests

```bash
npm test
```

15 tests cover the store (dedupe/recall/reinforce/persistence), the Dream Engine
(with and without a model), the citation parser, provider failover, the red-block
system prompt, and a **full agent-loop integration test** against a fake
OpenAI-compatible server (tool call round-trip → citation → memory extraction).

---

## How it works

```
 you ──► /api/chat (SSE)
          │
          ▼
        Brain ── recalls locally (keyword × strength × recency decay)
          │      streams "recall" events → galaxy highlights the stars it's using
          ▼
        LLM loop (Nebius Nemotron 3 → free fallbacks, sticky failover)
          │      model replies with {"tool": …} JSON or the final answer
          ▼
        tools: memory.search/remember/forget · time · math · web.fetch (SSRF-guarded)
               web.search (Tavily) · skill.run (vault skills)
          │
          ▼
        post-turn extraction (one cheap JSON call) → new stars born
          │
          ▼
        Dream (on demand): replay → consolidate (insights + skills) → decay → forget
```

**Memory math.** Each memory carries `strength` (0–1). Recall boosts strength; dreams
decay it (weak + untouched × 30 days decays fast, below `0.045` it is *forgotten*).
Retrieval score = lexical match × decayed strength. No vector DB, no cloud — the vault
is one readable JSON file.

**Why stars?** Because you should be able to *see* what an AI remembers and *verify*
what it used. The galaxy layout is deterministic (hash-seeded), so the same vault
always paints the same sky — memories don't teleport between sessions.

## Where Nebius & NVIDIA fit

- All generation runs through **Nebius Token Factory** (OpenAI-compatible
  `https://api.tokenfactory.nebius.com/v1`) with **NVIDIA Nemotron 3 Nano** for fast
  turns (recall, extraction, tool routing) and **Nemotron 3 Super** as the reasoning
  model for Dream consolidation — route cheap/fast vs. deep reasoning per call.
- `POST /api/provider` switches cores live; failover keeps the app alive if a provider
  is down (four free fallbacks, two of them NVIDIA open models).
- The Dream consolidation prompt demonstrates why open models matter here: the vault,
  prompts and pipeline are fully inspectable in-repo.

See [FEEDBACK.md](FEEDBACK.md) for our detailed product feedback on Token Factory, AI Cloud, and Nemotron.

## Project layout

```
src/
  server.js   HTTP server: static files, JSON API, SSE streams for chat & dreams
  brain.js    agent loop, tool executor (SSRF-guarded fetch), citations, extraction
  dream.js    Dream Engine: replay → consolidate → decay, streamed phase events
  store.js    JSON vault: memories, insights, skills, decay math, keyword index
  llm.js      provider chain (Nebius first), autodetect, JSON parsing, failover
  seed.js     demo sky so the first run is alive
public/
  app.js      galaxy renderer (canvas), chat client, dream overlay, vault panel
  app.css     night-sky design system
vault/        your data (gitignored) — plain JSON
test/         15 node:test suites (unit + agent-loop integration)
```

## Privacy

- Memories, insights and skills never leave your machine. Only chat context and
  explicit tool calls reach the model provider you configured.
- The vault is a single JSON file; **Export** (in the Vault panel) downloads it.
- `web.fetch` is SSRF-guarded (private ranges blocked); every tool argument is
  sanitized before it reaches your files.

## License

MIT — see [LICENSE](LICENSE).
