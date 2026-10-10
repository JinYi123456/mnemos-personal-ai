# Feedback: Nebius Token Factory, AI Cloud & NVIDIA Nemotron

*Required submission feedback from team Softmatter Labs — Mnemos was built during the Submission Period.*

## What we built

Mnemos — a privacy-first personal AI with a visual Memory Galaxy and a replayable Dream
Engine. Per user turn it makes three kinds of model calls (tool routing, final answer,
post-turn memory extraction), plus one reasoning-heavy consolidation call per dream.
That mix — **many tiny calls, few deep ones** — shaped everything below.

## Nebius Token Factory

**What we used it for.** All generation: Nemotron 3 Nano class for fast turns (recall,
extraction, tool routing), Nemotron 3 Super for dream-time consolidation reasoning.
OpenAI-compatible client at `https://api.tokenfactory.nebius.com/v1` — our provider
layer (`src/llm.js`) treats Nebius as primary with four free fallbacks behind it.

**What worked well.**

- **OpenAI compatibility is genuinely turnkey.** We migrated a plain `fetch` client in
  minutes; no SDK lock-in, which fits a zero-dependency codebase.
- **Model catalog via `GET /models` is programmatically usable.** Our boot sequence
  autodetects the exact model ID from your catalog (`nvidia/nemotron-3-*`), so our app
  survives catalog renames without a code change. More providers should do this.
- **Fast first tokens on the Nano class** made the memory-extraction call (~300 tokens,
  latency-critical, runs after every turn) feel free in the UI.

**What needs work.**

- **Model ID discovery is catalog-scavenging.** The website's model list, the docs, and
  the API disagree on exact IDs (e.g. `nvidia/nemotron-3-nano-omni-9b-v2` vs. variants).
  A canonical, versioned models page + one canonical API example per model would remove
  the single biggest onboarding friction we hit.
- **Chat Completions only goes so far for agents.** Our tool loop is a hand-rolled JSON
  protocol because we couldn't rely on native tool-calling parity across every model in
  the catalog. First-class, documented function-calling on Nemotron models (with
  examples that actually parse) would let teams delete a lot of glue code.
- **Latency for small requests:** a batch-style or low-latency tier for the "100 tiny
  calls" app pattern (extraction, classification, routing) would fit personal-AI
  architectures like ours better than one-size pricing.

**Onboarding (zero → hello world).** With the promo credit applied, minutes. Without
prior knowledge of which model ID is current, the first 404 is confusing — fix that and
onboarding is best-in-class.

**Would we build with it again?** Yes — the open-model catalog plus OpenAI-compatible
surface is exactly right for privacy-first products where the *weights* matter to the
pitch. It's our primary provider in Mnemos, not a checkbox.

## NVIDIA Nemotron (open models)

- **Routing Nano→Super per call is the killer pattern.** Nano handled tool routing and
  extraction at low latency; Super produced noticeably better cross-memory insights in
  Dream consolidation. Documenting this "fast/slow pair" pattern with token-cost numbers
  would help every Best Apps submission.
- **Strong JSON discipline.** Nemotron followed our strict JSON tool protocol reliably;
  our parser only ever needs fence-stripping and trailing-comma tolerance.
- **Wishlist:** a short official "agentic personal AI" cookbook (system prompt +
  tool-call + JSON-schema snippets) on the Token Factory side of the docs.

## Nebius AI Cloud / Serverless

We evaluated Serverless Jobs for scheduled nightly dreams. Our final architecture runs
the dream on demand (and the timer as a cron is a one-line change), so we didn't ship on
it — but for the Personal AI use case, a documented "cron → Serverless Job → Token
Factory" example would remove the last mile of guesswork. Also: the DevPods path for
dev+demo would benefit from a one-click "share a preview URL" feature for hackathon
submissions.

## Tavily

`web.search` integration was the fastest third-party onboarding in the whole build —
one POST, clean JSON, good snippets. Our agent uses it as a first-class tool.

## One-line summary

Token Factory + Nemotron let us build a *multi-provider, failover-safe, fully local*
personal AI in a zero-dependency codebase — give the model IDs a canonical home and
native tool-calling on all catalog models, and it's the best open-inference stack to
build on.
