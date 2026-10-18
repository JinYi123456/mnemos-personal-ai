# Mnemos — self-use diary

_Impact evidence: real sessions where Mnemos remembered something useful and it
changed what the owner did next. Each entry is a genuine run against the live
demo, not a mock-up. Append-only; the scheduled dogfood job adds a dated entry
per session, and the owner can add their own._

## Format
- **Date / session #**
- **What I told it** (the memories stored that day)
- **What I asked it**
- **What it recalled + the `[M…]` receipts**
- **Did it change what I did?** (the actual impact — the point of the exercise)

---

## Day 0 — 2026-10-17 · setup
Scaffold created. The live demo at https://mnemos-personal-ai.onrender.com runs
one isolated vault per visitor (cookie-scoped), so dogfooding sessions here do
not touch what a judge sees. A scheduled job appends a real entry each day it
runs; the owner can also paste their own sessions.

_(No fabricated entries — a day only appears here once a real session ran.)_

## Day 1 — 2026-10-18 · scheduled dogfood session #1

**Session #** 2 turns against the live demo (`POST /api/chat`, SSE), one cookie-scoped
sandbox vault, model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. `/api/status` returned
200 before the run. Metered cost: $0.00013254 + $0.0001335 ≈ **$0.0003 total**.

**What I told it** (turn 1, verbatim): three project facts — (1) "Judging for the Nebius
x NVIDIA Global AI Hackathon runs Dec 1-15, 2026"; (2) "Our Mnemos demo is hosted on the
Render free tier and is kept awake by a GitHub Actions keep-alive workflow so the instance
never spins down before judging"; (3) "The 3-minute demo film is published on YouTube and
linked from the README."
It answered "Got it—I'll keep those details in mind for later use." with `learned: 3`,
no citations (`cites: []` — correct, it was storing, not recalling).

**What I asked it** (turn 2): "When does judging happen, and how is our demo kept online
through that window?"

**What it recalled + the `[M…]` receipts** — the answer it returned, verbatim:

> Judging for the Nebius × NVIDIA Global AI Hackathon runs from **December 1–15, 2026**.
> Your demo is kept online through that window using a GitHub Actions workflow that sends
> periodic "keep-alive" signals to prevent Render's free tier from auto-sleeping. This
> ensures your Mnemos demo remains accessible during judging.
> *(Referenced: [M44d63e58])*

Receipts from the `recall` event (6 stars surfaced, my 3 real ones first):
- `M44d63e58` — "Mnemos demo runs on Render's free tier and is kept alive with a GitHub
  Actions keep-alive workflow to prevent spinning down before judging" ← **the only chip**
- `Me5c828b` — "Judging for the Nebius x NVIDIA Global AI Hackathon runs Dec 1-15, 2026"
  — recalled and `matchedUncited` at overlap 8, but **not cited**, even though the reply
  states the date range as fact
- `Md72fbd3` — the YouTube demo-film memory (surfaced, correctly unused)
- `Mb5bf801`, `M5b52158`, `M6b3f807` — seeded demo-persona memories (Voicememos style,
  late-night screen time, robotics class). Not mine; they come with the sandbox vault.

Both facts in the answer were right and came only from what I stored 14 seconds earlier.

**Did it change what I did?** Partly yes, and the useful part was the failure. Recall was
correct and fast, so it changed nothing about the hackathon facts — I already knew them.
But reading the vault afterwards showed turn 2 came back with `learned: 3` from a message
that contained **no new facts**: it re-stored the same content as
`M1accf13` ("To prevent Render free tier auto-sleeping during judging window"),
`M93a723b` ("Demo stays online via GitHub Actions keep-alive signals") and `Mf3699e1`
("Judging runs December 1–15, 2026") — three duplicates of `Me5c828b` / `M44d63e58`, and
the vault is now 24 memories where 3 are near-copies. Two things I'll act on: dedupe or
skip learning from question turns, and require the date claim to carry its own chip
(`Me5c828b` was matched and left uncited). Also worth noting for honesty: 3 of the 6
recalled stars were seed-persona noise, so retrieval precision on a fresh sandbox vault
is ~50%, not 100%.

## Day 2 — 2026-10-18 · scheduled dogfood session #2

**Session #** 3 turns against the live demo (`POST /api/chat`, SSE), one cookie-scoped
sandbox vault (`mnemos_sid=27feee81…`), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
Metered cost: $0.0001422 + $0.00019968 + $0.00011706 ≈ **$0.00046 total**.

**Cold start, recorded honestly.** The first four probes (`/api/status` at 60s and 150s,
a HEAD on `/` at 45s, `/api/health` at 120s) all returned **curl exit 28, 0 bytes, HTTP 000**
against a resolved origin IP — about 7 minutes of dead demo. A patient retry at 21:07:28
then returned 200 in **0.76s**. The instance was fully asleep, not slow: the keep-alive
workflow pings `/api/health` with `--max-time 60`, so the schedule was firing and still
did not keep the free instance up. That contradicts the workflow's own comment
("never sleeps… no 50-second cold start") and matters directly for judging.

**What I told it** (turn 1, 21:08:55, verbatim): three facts I had just verified in this
repo — (1) "judging for the Nebius x NVIDIA Global AI Hackathon runs Dec 1-15, 2026";
(2) "idle sandbox vaults on the live Mnemos demo expire after 45 days and the vault
sweeper runs every 6 hours" (`src/server.js:43`, `src/server.js:112`, `src/sessions.js:166`);
(3) "a GitHub Actions keep-alive workflow pings /api/health every 14 minutes and commits
a weekly heartbeat to docs/heartbeat.json" (`.github/workflows/keep-alive.yml`).
Stored as `Mc610aa09`, `M25d04653`, `Ma64967c1`. `learned: 3`, `cites: []` — correct.

**What I asked it** (turn 2): "A judge opens the demo on Dec 8, 2026. Suppose a visitor
first created their sandbox vault today, Oct 18, 2026, and never came back. Would their
memories still be there on Dec 8? Give the date they stop being there. Second: what keeps
the Render instance awake through the judging window? Cite the memory ids you used."

**What it recalled + the `[M…]` receipts** — 6 stars surfaced, my 3 real ones were the
**top 3** (better precision than Day 1's 50%):
- `M25d04653` (45-day expiry) — cited
- `Ma64967c1` (keep-alive workflow) — cited
- `Mc610aa09` (judging Dec 1-15) — recalled, used in the phrase "while the hackathon
  judging is active", `matchedUncited` at overlap 5, **not cited**
- `Mb5bf8012`, `M5b521587`, `M71438a23` — seed-persona noise (Voicememos, late-night
  screen time, deep-work interruptions)

The answer, verbatim (excerpt):

> 1. **Yes.** The sandbox vault will still exist on Dec 8, 2026.
>    – Created = Oct 18, 2026 → expiration = Oct 18 + 45 days = **Dec 2, 2026**.
>    – Since Dec 8 is after Dec 2, the vault (and its memories) are already gone.
>    **Date they stop being there:** Dec 2, 2026.

**The headline verdict was wrong and the reasoning was right.** It computed the correct
expiry (Dec 2 — I re-derived it: Oct 18 + 45d = Dec 2, and `sweep()` deletes on
`vault.json` mtime past a 45-day cutoff, so a truly idle visitor really does lose the
sky ~Dec 2) and then led with "Yes". Turn 3, a one-line challenge, got an immediate
self-correction: **"Dec 2, 2026"** in 1.4s, `cites: []`, `learned: 0`. So the failure is
a verdict-consistency slip, not a retrieval or arithmetic failure.

Two other real defects:
- The question turn again returned `learned: 2`, re-storing content with no new facts:
  `M9dbfc4ba` and `M313c58da`. Day 1 flagged this; it is **still unfixed**, and turn 3's
  recall now leads with the duplicate `M9dbfc4ba` — the duplicates are already competing
  with the originals for retrieval slots.
- `M313c58da`'s stored **text begins with a citation chip, `[Ma6490a50]`, which does not
  exist** in this vault (the real id is `Ma64967c1`). The extractor is copying the model's
  inline chips into memory text and inventing ids, so a future turn can cite a phantom.

**Did it change what I do?** Yes, three concrete things — which is the point of this
exercise. (1) A 45-day TTL expires Oct/Nov sandbox users around **Dec 2, inside the
judging window**, and the diary vault itself would die mid-judging: I will raise
`VAULT_TTL_DAYS` on the Render service (or exclude active vaults from the sweep) before
Dec 1. (2) The keep-alive cron is not actually preventing cold starts — 7 minutes of
000/exit-28 today — so the demo is *not* "instant for judges" as the workflow claims;
needs a shorter idle threshold or a warm-up that survives, and the README shouldn't
promise otherwise. (3) Two code fixes queued: skip memory extraction on question-only
turns (or dedupe), and strip `[…]` chips from extracted memory text. What it did *not*
change: nothing about the hackathon facts — the recall was accurate but told me nothing I
hadn't written into the code five minutes earlier.
