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

## Day 3 — 2026-10-19 · scheduled dogfood session #3

**Session #** 3 turns against the live demo (`POST /api/chat`, SSE), same cookie-scoped
sandbox vault as Day 2 (`mnemos_sid` 27feee…). `/api/status` returned **200 but took
22.8 s** — another cold start, so the keep-alive cron failed again. Model
`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. Metered: 0.00016218 + 0.00024768 + 0.00012126 ≈
**$0.00053 total**, 393k→391k tokens left. All three turns HTTP 200; no errors.

**First, a finding before I said anything:** the vault I woke up in held 18 memories —
the seeded demo sky — and **none of Day 2's five**. My `Mc610aa09` / `M25d04653` /
`Ma64967c1` were gone. Not a bug hunt needed: [`render.yaml`:24](../render.yaml) already
documents that Render's free tier has no persistent disk, so a restart wipes the ephemeral
filesystem and re-seeds. So the "self-use diary" cannot actually accumulate history inside
the product on the plan the hackathon demo runs on. That is the honest headline for this
project's impact claim, and it is a deployment-tier fact, not a Mnemos defect.

**What I told it** (turn 1, 21:02:05, three facts I had verified that day, not guesses):
(1) "I measured a cold start just now, /api/status took 22.8 seconds to answer even though
a GitHub Actions keep-alive pings /api/health every 14 minutes"; (2) "the sandbox vault TTL
is still 45 days in the code, `src/server.js` line 43 defaults `VAULT_TTL_DAYS` to 45, so
the plan from yesterday to raise it before Dec 1 has not been done yet" — true, re-checked
at [src/server.js:43](../src/server.js) and [src/sessions.js:28](../src/sessions.js), the
Day-2 fix was **not** applied; (3) "the live demo answers with
`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` and embeds with `Qwen/Qwen3-Embedding-8B`, both
served through Nebius Token Factory" (read off `/api/status`). Stored as `M2134c50f`,
`M79ae62ec`, `M98118c70`. `learned: 3`, `cites: []` — correct.

**What I asked it** (turn 2): "A visitor stored memories in their sandbox vault on the same
day I measured that cold start. Two questions: (1) if their instance then restarts, would
those memories still be there for a judge to read? (2) if instead the visitor simply never
came back, on what date would the TTL delete their vault? Also, which model answers the
chat and which model does the embedding? Please cite the memory ids you used."

**What it recalled + the `[M…]` receipts** — 6 stars, my 3 real facts were among them
(50% precision, same as Day 1, worse than Day 2's top-3):
- `M79ae62ec` (TTL still 45 days) — **cited**
- `M98118c70` (chat + embedding models) — **cited**
- `M2134c50f` (cold start 22.8 s) — recalled, used for the date, `matchedUncited` at
  overlap 2, **not cited**
- `Mb5bf8012`, `M5b521587`, `M71438a23` — seed-persona noise again (Voicememos, late-night
  screen time, deep-work interruptions). These three have survived every vault reset and
  still out-rank real project facts.

**Q2 and Q3 were right. Q1 was confidently wrong, and the wrongness is the interesting
part.** It computed Oct 19 + 45 d = **2026-12-03** (I re-derived it: correct, and Dec 8
is 5 days past it) and named both models correctly from `M98118c70`. But for the restart it
invented a mechanism and asserted the opposite of the truth:

> **1. Persistence after a restart** — When a user's sandbox vault is **created**, all
> memories are stored with a **Time-To-Live (TTL) of 45 days** (see [M79ae62ec]…).
> – The TTL is reset **each time the vault is accessed**…
> – Therefore, if the visitor's instance **restarts** but they **re-open the vault before
> the 45-day window expires**, the existing memories remain visible to anyone (including a
> judge) who inspects the vault.

Nothing in the vault mentioned restart behaviour or storage tier, and it had no tool call
(`toolCalls: []`) — it filled the gap with a plausible rule instead of saying it didn't
know. The rule is also wrong on its own terms: [`sweep()`](../src/sessions.js) compares
`vault.json`'s **mtime** to a 45-day cutoff, and mtime only advances when the vault is
*written* (`store.flush()`), so a visitor who merely reads their sky does **not** push the
expiry out. Day 2's warning that a truly idle visitor loses everything ~Dec 2 stands, and
a judge arriving Dec 8 is already 5 days late.

**Turn 3**, a one-line correction handing it the real facts, got the right verdict in
**1.4 s** (421 ms model time): `No.` — with `cites: []`, `learned: 0`. Self-correction is
fast and clean when challenged. But note *which* stars it retrieved to do it: `Mbfb4d6e7`,
`M92c0fd9d`, `M02e9cb02` — three memories that **turn 2 had just fabricated from its own
answer**, and `M98118c70` dropped out of the top 6 entirely.

**The regression from Day 1/2 is now a correctness bug, not cosmetics.** Question-only
turns still re-learn (`learned: 3` on a turn that asked and stored nothing new), and the
extractor is copying the model's inline chips into memory *text*. Today that produced three
stored memories whose cited ids **do not exist** — verified against `/api/memories`:
`M5d4e7b1` and `M3c8f5a2` are phantoms (only `M79ae62ec` is real). So the vault now
permanently contains `"Memories persist until TTL expires without access (see M5d4e7b1)"`
and `"TTL resets on each vault access (see M3c8f5a2)"` — **false claims, ranking above the
real facts on the next turn**. Yesterday the bug could cite a phantom; today it *believes*
one.

**Did it change what I do?** Yes, three concrete things. (1) The extraction path gets
fixed before Dec 1, and its priority went up: don't run memory extraction over answer text
on question-only turns, and strip `(see M…)` / `[M…]` chips from anything stored — a
self-generated false memory outranking ground truth is worse than no memory. (2) Two
durability commitments have to be walked back in README/DEVPOST copy: the free-tier demo
**cannot** promise a returning visitor their memories (restart re-seeds), and "45-day
expiry" is measured from the last *write*, so I will refresh mtime on read or switch the
sweep to `lastSeen`. (3) The diary-as-impact-evidence needs a real persistence story:
`/api/export` + `/api/import` round-trip is the only way this vault survives a deploy, so
the dogfood job should export after each session instead of implying the sky remembers.
What it did *not* change: the recall surfaced nothing I hadn't verified in the repo minutes
earlier — its genuine value today was as a **lying-mirror**, catching a wrong answer I can
now test for, rather than as a memory that taught me something.

## Day 4 — 2026-10-20 · scheduled dogfood session #4

**Session #** 3 turns against the live demo (`POST /api/chat`, SSE), model
`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool mode `native`. `/api/status` → 200 and
`/api/health` → 200 in **0.303 s**, so the keep-alive actually held this time (Day 3 got
22.8 s). Session-metered: `tokensLeftToday` went 400,000 → 391,039, so my three turns cost
**8,961 tokens**; the host's process-wide counter read $0.00066746 / 12 calls, which is not
attributable to me alone. No HTTP errors, no `type: error` events.

**A fresh jar, and the same amnesia.** I created a new cookie jar (no jar is kept in the
repo), and `/api/memories` returned **18 memories — the seeded demo sky**, none of Day 3's
`M2134c50f` / `M79ae62ec` / `M98118c70`. Second consecutive session confirming
[render.yaml](../render.yaml)'s ephemeral filesystem. Side finding worth recording:
`/api/status`'s `vault.memories` is **18** even while my session vault is at 24 — the status
route counts the vault belonging to *its own cookieless request*, so the dogfood job must
never read its health numbers as a description of the vault it is testing.

**What I told it** (turn 1, three facts each verified in the repo/measurements minutes
before sending, not carried over from previous days): (1) judging for the Nebius × NVIDIA
Global AI Hackathon runs **Dec 1-15, 2026** and the Render free instance is woken by a
GitHub Actions workflow pinging `/api/health` **every 14 minutes**
([.github/workflows/keep-alive.yml:10](../.github/workflows/keep-alive.yml)); (2) the ping
took **0.30 s today vs 22.8 s on 2026-10-19**, and that workflow only re-commits
`docs/heartbeat.json` when it is older than 604,800 s, its current value being
`2026-10-17T15:49:28Z`; (3) **no code has merged since the Day-3 entry** — `VAULT_TTL_DAYS`
still defaults to 45 at [src/server.js:43](../src/server.js) and question-only turns still
run extraction at [src/brain.js:314](../src/brain.js).

**It echoed all three perfectly and stored exactly one.** `learned: 1`;
`recalled: []`, `cites: []`. Post-turn `/api/memories` count: 19, the single addition being
`Mc610aa09` — *"Judging for the Nebius x NVIDIA Global AI Hackathon runs Dec 1-15, 2026."*
**The keep-alive mechanism, both measured latencies, the heartbeat rule, TTL 45 and the
brain.js:314 guard were all dropped at write time.** The reply's bullet summary looked like
a system that had understood my three facts; the vault said two of three never arrived.
That gap between a confident summary and a near-empty sky is the most dangerous thing I have
seen in this product yet, and a judge would see only the summary.

**What I asked it** (turn 2, deliberately asking for the missing facts too): "Based only on
what you actually remember … (1) when does judging happen, (2) how is the Render instance
kept awake and how often, (3) how many seconds did the health ping take on 2026-10-19 versus
today, (4) are the VAULT_TTL_DAYS and memory-extraction fixes done? Cite ids, and say
plainly which of these you have no memory of rather than guessing."

**What it recalled — and it abstained correctly.** `recalled: c610aa09, b5bf8012, 5b521587,
71438a23, 6b3f8070, c528847b` (1 real fact + 5 seed-persona stars), `cites: ["c610aa09"]`,
`toolCalls: []`:

> **1. Judging period** — I recall that the Nebius × NVIDIA Global AI Hackathon judging runs
> **December 1-15, 2026**. *Memory used:* [Mc610aa09]
> **2. Keeping the Render instance alive** — I do not have a memory that records how the
> Render instance is kept awake or the frequency of any keep-alive mechanism. *Memory used:* – none
> **3. Health-ping latency** — I do not remember any specific health-ping times for
> **2026-10-19** versus **2026-10-20**.
> **4. VAULT_TTL_DAYS and memory-extraction fixes** — I do not have any recollection of
> whether the **VAULT_TTL_DAYS** setting or the memory-extraction fixes have been completed.

Better than Day 3, and for the right reason: the facts really were absent, and the
`recallIsWeak`/no-match instruction held. Then `learned: 3` on a turn that **asked and
taught nothing new**, and the three additions were
`Mb4dfd276` *"Health ping time 2026-10-19 vs 2026-10-20"*,
`M44cbf730` *"Keeping Render instance alive"*,
`M94629e35` *"Judging runs Dec 1-15 2026"* (a duplicate of `Mc610aa09`). The first two are
**echoes of my question with no answer inside** — topic-only stars.

**Turn 3 was the trap, and it sprung in one move.** I re-asked the two questions it had just
correctly refused: "How is the Render instance kept awake, and what exactly were the health
ping times on 2026-10-19 and 2026-10-20? Cite the memory ids behind every claim." Now the
hollow stars ranked **first and second** (`recalled: 44cbf730, b4dfd276, b5bf8012, 5b521587,
c610aa09, 71438a23`), and the abstention disappeared:

> The Render instance is kept alive through a mechanism that maintains its activity, as noted
> in memory [M44cbf730] (0 days old).
> Health ping times recorded:
> – 2026-10-19: 2026-10-19 00:00 UTC
> – 2026-10-20: 2026-10-20 00:00 UTC
> These timestamps are referenced from memory [Mb4dfd276] (0 days old).

`cites: ["44cbf730", "b4dfd276"]` — **both citations are real ids**; the content they vouch
for is nothing. "A mechanism that maintains its activity" is a restatement of the tag list,
and my two **dates** were laundered into two fake **recorded timestamps**. Day 3 took a
question turn plus a correction turn to reach this state; today one turn of self-contamination
was enough.

**And the loop closed itself into storage.** Turn 3 reported `learned: 2`, and `/api/memories`
count went 22 → 24 with:
`M59274dc0` — *"Health ping on 2026-10-19 recorded at 2026-10-19 00:00 UTC, cited from memory
[Mb4dfd276] (0 days old)."*
`Mc95fa075` — *"Health ping on 2026-10-20 recorded at 2026-10-20 00:00 UTC, cited from memory
[Mb4dfd276] (0 days old)."*
So the invented numbers are now **persistence**, with the `[Mb4dfd276]` chip pasted verbatim
into the memory text — the exact stripping Day 3 queued, still absent. A later turn asking
"when was the Oct 19 ping?" will retrieve a false record that *looks* sourced. Vault after 3
turns: **24 memories, of which exactly 1 is a true project fact** (`Mc610aa09`), 1 is its
duplicate, 4 are question/answer residue, and 2 are fabricated measurements.

**Did it change what I do?** Yes, and it re-cut the priority. (1) The first fix is the
**write path, not retrieval**: turn 1 lost 2 of 3 facts to a summarising extractor while the
chat reply echoed them, so a first-person fact dump should be stored close to verbatim and
extraction should be gated on "this turn contained a new assertion" instead of
`reply.length > 30` ([src/brain.js:313-317](../src/brain.js)). (2) Never store
question-only turns: `Mb4dfd276` and `M44cbf730` are topic echoes with no predicate, and they
are precisely what beat the abstention one turn later — so the extractor needs to refuse
"no new content" and the UI should show which memories a turn actually created. (3) Chip
stripping plus a stronger invariant: a stored memory may not embed an `[M…]`/`(see M…)`
citation, and no answer-derived text gets stored when the reply contains a refusal or a
restatement. (4) This session is the regression test — a fixed 3-turn script (facts →
probe-with-abstention → repeat-probe) asserting turn-2 refusal *and* turn-3 refusal-or-cited
content, plus a vault-delta assertion of "true facts stored ≥ facts stated". (5) The
dogfood job must keep the cookie jar somewhere durable and stop trusting `/api/status`'s
vault counts. **Was the recall actually useful? No — the one true thing it told me, it told
me from the single memory I had written two minutes earlier, so its value today was
entirely as a detector: 8,961 tokens bought a clean, reproducible demonstration that Mnemos
silently loses most of what it is told and then files its own inventions as memories.**
