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

### Day 4 addendum — same day, after fixing what the session found

Three commits later (`19ed0ce`, `e1421a5`, `f6480d3`), 41 tests green, `tsc --noEmit` clean,
deployed and re-probed on the live demo. Two of my own Day-4 readings above were wrong, and
correcting them matters more than the fixes.

**Correction 1 — I implied `/api/status` was untrustworthy. It is not.**
[src/server.js:240-252](../src/server.js) serves status from the *requesting* session's store, and
my jar was valid throughout (`mnemos_sid` 6c82cad4…). The reason it kept reporting 18 while my
vault held 24 is that the instance **restarted between my turns** — `provider.spend.calls` went
12 → 0 and `tokensLeftToday` refilled to 400,000, i.e. a new process — and all six memories from
the session were gone **within twenty minutes of being written**. That is a harder durability
finding than anything above: on the plan the judge demo runs on, same-day evidence does not
survive. Neither does the spend ceiling, since the gate is per-process and a restart-happy free
instance refills its own daily budget.

**Correction 2 — the write loss had a second cause I had not seen.** The old extractor input was
`USER: text.slice(0, 800)` plus `ASSISTANT: reply.slice(0, 800)` ([src/brain.js:820](../src/brain.js),
pre-`e1421a5`). My turn-1 message was **1,086 characters**, so fact 3 was cut mid-sentence and
never reached the extractor. Facts 1 and 2 *were* fully visible and it still emitted one memory —
so the loss is truncation **plus** a summariser asked for "0-3 durable memories, ≤120 chars". The
UI echoed all three because the answer had the whole message; only the write path saw a fragment.

**What changed.** (1) Extraction reads only the owner's words, whole: the assistant reply is no
longer an input, the 800-char slice is gone, up to 6 memories per turn, and a turn made only of
questions and requests skips extraction entirely and says so (`learned 0` with `asked`).
(2) The store refuses what must not become a star: `[M…]`/`【M…】` chips and their "cited from
memory" tail are stripped before hashing, question-shaped text is refused, and a candidate whose
content tokens sit ≥80% inside an existing live memory is refused as adding nothing. The
morphology-based "does this sentence have a predicate" gate I wrote first was **removed** — it
refused valid memories ("the capacitor hums at midnight", "an extra memory written by one arm").
(3) The citation resolver now sees full-width chips, and any figure in an answer that appears in
**no** memory the model read is flagged as invented.

**Live re-probe after deploy** (fresh seed sky, 3 turns, 7,478 tokens: 400,000 → 392,522):
stated 4 verified facts in 724 chars → `learned=4, skipped=0`, and `/api/memories` held exactly
those four (`M754fdea` models, `M39cf790` redeploy-wipes-vault, `M852e8b9` today's fix,
`M31960a7` judging Dec 1-15). Question-only turn → `learned=0, skipped=0`, **zero new memories**
(before the fix, the same shape of turn produced three hollow echoes). Repeat probe → `learned=0`,
`asked=true`. Vault scan for chips or the invented `00:00 UTC` signature: **0 hits**. The
laundering loop is closed — a bad answer can no longer become a memory.

**What is still broken, with the real evidence.** The answer side keeps inventing. Earlier in the
day it claimed "You first opened Mnemos on **2026-10-20**" after being told explicitly to name
what it did not know, and it said the seed sky holds "**1** demo memory" while the true 18 sat in
`M39cf790`, which recall never surfaced. My new figure check catches **neither**: measured on the
actual strings it flags Day-4's invented `00:00` readings (`["0","00"]`) but returns `[]` for "1",
because the digit 1 also occurs in "Dec 1-15". It is a sound-but-narrow guard — anything it flags
is certainly invented, and many inventions pass. A final probe on the re-seeded sky did abstain
cleanly on all three questions, so abstention is now *sometimes* right rather than reliably right.
Also honest: the extractor still paraphrases, so `M39cf790` reads "re-seds" where I wrote
"re-seeds" — "only my own words" means my words are the only *source*, not that they are stored
verbatim.

**Did it change what I do?** Yes. (1) The next unit is recall coverage for figures, not more write
work: when a question asks for a count or a value, require that a recalled memory actually carries
one before answering — the "1 vs 18" error is a retrieval miss dressed as an answer, and a judge
will hit it in ten seconds. (2) The dogfood job must `/api/export` after every session and diff
against the previous export, because a same-day restart deletes the very evidence this diary is
made of. (3) README's demo-URL row no longer claims the cron means it "never cold-boots", and its
test count now matches `npm test`.

## Day 5 — 2026-10-21 · scheduled dogfood session #5

**Session #** 3 turns against the live demo (`POST /api/chat`, SSE), model
`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool mode `native`, one cookie-scoped sandbox vault
(`mnemos_sid` 94edf05f…). Warm this time: `/api/status` → 200 and `/api/health` → 200 in
**0.297 s**, so the 14-minute cron held (Day 2 got 7 minutes of exit-28, Day 3 got 22.8 s).
That first status call reported `spend.calls: 0` and `tokensLeftToday: 400000`, i.e. a fresh
process, so the whole session is attributable to me: tokens ended at **391,795 (8,205 used)**
and `provider.spend` at **$0.00059861 over 12 calls** (6 fast + 6 embed). Per-turn wall clock:
5.49 s / 11.42 s / 4.28 s. All three HTTP 200, no `type: error` events.

**Fifth consecutive fresh seed sky.** I made the jar durable this time
(`C:/Users/User/.qoder/mnemos-dogfood/jar`, outside the repo) and it still opened on **18 seeded
demo memories** — none of Day 4's survived, as expected from [render.yaml](../render.yaml)'s
ephemeral filesystem. Side note for the job: `M1d54c87c` below proves a fabricated URL can now sit
in a vault, so "the demo is at mnemos-personal-ai.onrender.com" is no longer safe to assume from
recall.

**What I told it** (turn 1, three facts each verified in the repo or measured minutes before
sending): (1) judging for the Nebius × NVIDIA Global AI Hackathon runs **Dec 1-15, 2026** and is
asynchronous, each judge opening the link on their own schedule — the asynchronous part is
[docs/JUDGE-FEEDBACK.md:91](../docs/JUDGE-FEEDBACK.md), the Dec 1-15 window comes from the owner's
hackathon calendar, not from anything in this repo, so it is the one input here I did not verify
myself; (2) the demo runs on Render's free tier and a GitHub Actions workflow pings `/api/health`
**every 14 minutes** ([.github/workflows/keep-alive.yml:10](../.github/workflows/keep-alive.yml))
and that ping answered in **0.297 s** today; (3) extraction in [src/brain.js:320-327](../src/brain.js)
now skips a turn that only asks questions, so a question-only turn writes zero new memories.

**The write path is fixed — turn 1 is the proof.** `learned: 3, skipped: 0`, `recalled: []`,
`cites: []`, and `/api/memories` went 18 → 21 with my three facts **stored close to verbatim**:
`M7744158b` (judging window + asynchronous), `M7ede94e7` (Render free tier, 14-minute ping, 0.297 s),
`M7b0f5c4b` (the brain.js guard). Day 4 stored 1 of 3 from the same shape of message; today 3 of 3
arrived. That is the fix from `e1421a5` working on the live service, not just in tests.

**What I asked it** (turn 2): "(1) When does judging for the Nebius × NVIDIA hackathon happen?
(2) How does the demo stay online through that window, and how often? (3) If I send you a turn that
only asks a question, do you write new memories from it? Cite the memory ids you actually used for
each, and say plainly which of these you have no memory of rather than guessing."

**What it recalled + the `[M…]` receipts** — 6 stars (`7744158b, 7b0f5c4b, b5bf8012, 7ede94e7,
5b521587, 6b3f8070`): all three of my facts surfaced, precision 3/6 (same as Day 1 and Day 3, below
Day 2's top-3), the three noise stars again being seed persona (Voicememos, late-night screen time,
robotics class). The answer, verbatim:

> (1) Judging runs Dec 1‑15, 2026. [M7744158b]
> (2) The live demo stays on Render's free tier and a GitHub Actions workflow pings /api/health every 14 minutes to keep it awake. [M7ede94e7]
> (3) A question‑only turn writes zero new memories. [M7b0f5c4b]

`cites: ["7744158b", "7ede94e7", "7b0f5c4b"]` (three chips, each carrying the full memory text),
`matchedUncited: []`, `toolCalls: []`.
**First session in this diary where every recalled fact carried its own chip**; on Days 1, 2 and 3
the judging date was used in the answer and left uncited. `unsupported` flagged `["2","3"]`, which
are the "(2)" / "(3)" list markers, not a missing figure — turn 1 was worse in the same way, listing
`["1","15","2026","14","10","21","0","297"]` because recall was empty, even though every one of
those numbers came from my own message. The figure guard still cannot tell "invented" from
"restated from the owner", so anything it flags deserves checking, not believing.

**Turn 3 was the best answer this project has produced, and the worst vault write.** I asked it to
answer from memory only, put an id behind every number, and leave out any number no memory carries:

> The hackathon's judging window runs from **December 1 through December 15, 2026** [M7744158b].
> During that period each judge will open the demo link on their own schedule [M7744158b].
> The live demo stays reachable because it runs on Render's free tier and a GitHub Actions workflow
> pings **/api/health** every **14 minutes** to keep it awake [M7ede94e7].
> On **2026-10-21** that health-ping responded in **0.297 seconds** [M7ede94e7].
> I do not have a memory that records how many judges there are or any other quantitative detail
> about the judging process, so I cannot provide that information.

`cites: ["7744158b","7ede94e7"]`, `unsupported: []`, `matchedUncited: []` — every figure carried a
chip and it abstained on what it genuinely lacked. That is the Day-4 addendum's "next unit is recall
coverage for figures", already passing on the live demo.

**Then `learned: 3`, and all three were invented.** `/api/memories` went 24 → 27 with:

- `Mb6307d56` — *"WebSocket ping interval 30 seconds keeps demo online (M7)."*
- `M1d54c87c` — *"Demo endpoint runs on https://demo.example.com (M5)."*
- `Md846d4cb` — *"Judging window runs from 2025-11-04T14:00Z to 2025-11-04T18:00Z (M3)."*

None of it is something I said, and none of it was in the vault: I string-scanned the 18-star seed
sky for `WebSocket`, `example.com`, `2025-11-04`, `third person`, `160`, `citation`, `ping interval`
— **all false**. `Md846d4cb` directly contradicts the true `M7744158b` and has the wrong year.
Turn 2 had done the same thing one level subtler; its three additions included

- `Mc69f67ad` — *"User asks that citations such as [M…] not be copied into memories and that
  questions or instructions addressed to the assistant are not considered memories."*
- `M06c64b1c` — *"User requests that the assistant avoid summarizing entire messages and instead
  extract up to six durable memories, each as a separate sentence no longer than 160 characters, in
  third person."*

I never wrote either sentence. They are the **extractor's own system prompt**
([src/brain.js:861](../src/brain.js): "Never copy a citation such as [M…] … Questions, instructions
and requests addressed to you are not memories … up to 6 durable memories … third person, <= 160
chars") laundered into the sky as `source: chat` memories attributed to me. The vault now contains,
as a remembered owner preference, the rule that owner preferences of that kind must not be stored.

**Root cause, from the code, and it is not the mechanism Day 4 fixed.** Extraction input really is
owner-only (`USER: ${asserted.slice(0, 4000)}`, [src/brain.js:863](../src/brain.js)), so Day 4's
"the answer can no longer become a memory" still holds — my turn-3 *reply* was not the source. The
hole is the complementary one, in two steps. (1) `assertedClaims`
([src/brain.js:898-908](../src/brain.js)) filters **per sentence**, dropping only sentences ending in
`?` or starting with a token in `IMPERATIVE_OPENERS` ([src/brain.js:883-887](../src/brain.js) —
`please, cite, tell, show, list, give, explain, answer, check, what, how, why, when, where, who,
can, could, would, do, does, did, is, are, was, were, have, has`). My turn-3 sentences began
"Without…" and "Attach…", my turn-2 survivors "Three questions…" and "Say plainly…" — none of those
openers is in the set, so what reached the extractor was **two instructions containing no claim at
all**. (2) Given an input with nothing extractable in it, the 30B model obeyed "one memory per
distinct claim" and invented the claims, because `tryAddMemory`
([src/store.js:307-321](../src/store.js)) checks length, question-shape and ≥80% overlap with
*existing* memories — there is **no check that a candidate is supported by the turn that produced
it**. "Do not invent details" in a prompt is not a guard. (3) Chip stripping has a matching gap:
`CHIP_RE` ([src/store.js:84](../src/store.js)) requires `M[0-9a-f]{4,}`, so the one-digit
`(M7)` / `(M5)` / `(M3)` tails survived into permanent text. Day 3's phantom-citation failure mode
is back through a new door: a false record that *looks* sourced.

So my own stored fact `M7b0f5c4b` — "a question-only turn writes zero new memories" — is an
overstatement I wrote into the sky five minutes before disproving it, and it was cited with
confidence in turn 2. The measured truth is: a turn made **purely** of `?`-sentences and listed
imperative openers writes nothing; a turn of *instructions* still writes.

**Vault accounting after 3 turns: 27 memories.** 18 seed + 3 true facts + 6 that are not things I
said (2 prompt-leaks, 1 paraphrase of my own instruction `M303a0c5a`, 3 fabrications). Write
precision on facts went 1/3 → 3/3; write precision overall is 3/9. `/api/status`'s `vault.memories`
read 27 at the end, matching my jar — consistent with Day 4's Correction 1.

**Did it change what I do?** Yes, four things, and they re-rank the remaining work. (1) The fix is a
**grounding gate, not more prompt wording**: in `extractMemories`, refuse any candidate whose content
tokens are not substantially present in `asserted` — the symmetric half of the `addsNothing` check
that already exists at [src/store.js:314](../src/store.js). All six bad memories today fail that
test and all three good ones pass it (they were stored near-verbatim), so it is a clean, testable
line. (2) `assertedClaims` needs to survive instructions: drop sentences with no declarative clause
rather than only `?`-terminated ones, and today's turn-3 input — two instructions, zero claims —
becomes the regression case, asserting `learned: 0`. (3) Widen `CHIP_RE` to catch short
parenthesised chips (`(M7)`), and correct the diary/README language: "question-only turns write
nothing" is not what the code guarantees. (4) The figure guard should stop flagging figures that
appear verbatim in the owner's own message — turn 1's nine false "inventions" were all my input —
otherwise a judge sees `unsupported` noise and stops trusting the real signal.
**Was the recall actually useful?** Not as memory: everything it correctly recalled, it recalled
from the three facts I had typed four minutes earlier, so it taught me nothing about my own project.
Its value today was again as a detector — and a sharper one than Day 4's, because it caught a defect
the Day-4 addendum explicitly declared closed. The honest headline for submission copy: **Mnemos now
remembers what you tell it, cites it every time, and abstains when it does not know — but a turn that
only instructs it can still write false memories, and those citations will vouch for them.**

## Day 6 — 2026-10-22 · scheduled dogfood session #6

**Session #** 3 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`,
tool mode `native`, same durable jar as Day 5 (`mnemos_sid` 94edf05f…). Warm: the first
`/api/memories` answered in **0.345 s**. Process was fresh (`spend.calls: 0`,
`tokensLeftToday: 400000`), so all spend below is mine: **8,342 tokens** (400,000 → 391,658)
and `$0.0006026` over **11 calls** (6 fast `$0.00059418` + 5 embed `$0.00000842`). The three
answer calls alone metered $0.000173 / $0.000171 / $0.000138. Wall clock 13.35 s / 8.27 s /
5.16 s. All HTTP 200, no `type: error` events.

**Sixth consecutive fresh seed sky.** The vault opened on 18 seeded demo memories with none of
Day 5's `M7744158b` / `M7ede94e7` / `M7b0f5c4b` — consistent with [render.yaml](../render.yaml).

**What I told it** (turn 1, 886 chars, three facts each verified minutes before sending): (1)
judging for the Nebius × NVIDIA Global AI Hackathon runs **Dec 1-15, 2026**, and I said explicitly
in the message that this window comes from the owner's hackathon calendar and **not** from anything
in the repo — it is the one input in this diary I still cannot verify myself; (2) the live benchmark
**was re-run on 21 October** after the citation instruction got stricter, and the published table
says the full agent-loop arm's citation resolution went from 17.5-35% to **37.5% in both fresh
runs**, that the same arm **still abstains 0% of the time**, and that the shipped hybrid arm
abstains **42.9-57.1%** ([README.md:139-146](../README.md), commit `8cfdd5c`, `eval/results/live-prompt2.json`);
(3) **none of the four fixes queued in the Day-5 entry have been merged** — I checked the code, not
the diary: `CHIP_RE` still requires four hex digits at [src/store.js:84](../src/store.js),
`extractMemories` at [src/brain.js:851](../src/brain.js) still has no grounding check against the
owner's words, `assertedClaims` at [src/brain.js:898](../src/brain.js) still only drops `?`-sentences
and imperative openers, `unsupportedFigures` at [src/brain.js:817](../src/brain.js) still pools only
recalled memories, and the newest commit is the Day-5 diary entry itself (`a07b493`).

**Write path: 3 of 3, stored whole.** `learned: 3, skipped: 0`, `cites: []`, vault 18 → 21:
`Mdfb4b8d4` (156 chars), `Mb0346c84` (286), `Me20e4ed6` (355) — all near-verbatim. Side finding:
the extractor prompt asks for "≤160 chars" but nothing enforces it; `tryAddMemory` caps at 600
([src/store.js:309](../src/store.js)), so a 355-character run-on sentence is now a permanent star.

**What I asked it** (turn 2): "Based only on what you actually remember, answer these three
questions. When does judging for the Nebius x NVIDIA hackathon happen? What did the 21 October
benchmark re-run change about the full agent-loop arm citation resolution, and what did it leave
unfixed about that arm? Have the four Day-5 diary fixes been merged? Put the memory id behind every
claim and every number, and say plainly which of these you have no memory of instead of guessing."

**What it recalled + the `[M…]` receipts** — 6 stars, and **my three facts took the top three ranks**
(`dfb4b8d4, b0346c84, e20e4ed6`, then seed noise `b5bf8012, 5b521587, 71438a23`): Day 2's best
precision, matched. The answer, verbatim:

> Judging for the Nebius × NVIDIA hackathon runs from 2026-12-01 to 2026-12-15 [Mdfb4b8d4].
>
> The 21 October benchmark re-run changed the full agent-loop arm citation resolution from a range of 17.5-35 % up to 37.5 % in both fresh runs [Mb0346c84].
>
> That same arm still abstains 0 % of the time, while the shipped hybrid arm abstains 42.9-57.1 % [Mb0346c84].
>
> The four Day-5 diary fixes have **not** been merged [Me20e4ed6].
>
> I do not remember any other details about these topics.

`cites: ["dfb4b8d4","b0346c84","e20e4ed6"]`, `matchedUncited: []`, `toolCalls: []`. Every number in
the reply was one I had typed ninety seconds earlier, and every claim carried its chip. This is the
cleanest recall turn in the diary. One wrinkle: `unsupported: ["12","01"]` — it reformatting
"Dec 1-15, 2026" into `2026-12-01` produced two digit-strings absent from the cited memory, so the
figure guard flagged a **faithful restatement**. The guard is still "sound but noisy", and a judge
reading `unsupported` would see two false alarms.

**Turn 2 was a pure question turn and it still wrote two false memories.** `assertedClaims` dropped
all three `?`-sentences but kept my two instructions ("Based only on what you actually remember,
answer these three questions." and "Put the memory id behind every claim…"), so the extractor was
handed two imperatives containing no claim — the exact Day-5 input. Result `learned: 2, skipped: 2`,
and the two additions are a new failure mode:

- `M2f227889` — *"I have no memory of question 1."*
- `M813e4a17` — *"I cannot answer any of the three questions because I have no memory of them."*

Both are **false statements about its own memory**, written seconds after it cited three memories
correctly. Day 5 invented project facts (a WebSocket interval, `demo.example.com`, a 2025 judging
window); today it invented its own amnesia, in first person, `source: chat`. So the contamination
has moved from "wrong facts about the world" to "wrong facts about whether Mnemos knows anything" —
which is the class that could flip a future correct abstention into a wrong answer, or vice versa.

**Turn 3 was the abstention probe, and it passed.** I asked for two numbers that were never in this
vault and never in my messages: today's `npm test` count, and the Devpost gallery photo id of the
guided-path frame (real, `5631386`, from commit `70a22e1` — deliberately withheld). It recalled 6
stars, **none** of them the two self-doubt memories from turn 2, and answered: *"I don't remember
either number."* — `cites: []`, `unsupported: []`, `learned: 0, skipped: 0`, `toolCalls: []`, and
`matchedUncited` correctly flagged `e20e4ed6` (overlap 2) rather than citing it to pad the answer.
Note the contrast with turn 2: **same shape of input** (an instruction-only claim set), opposite
outcome — so the "don't learn from instructions" behaviour is stochastic prompt-following, not a
guard. That is the Day-5 fix still missing, measured again.

**The headline finding, and it is not about recall: `/api/export` silently omits everything the chat
wrote.** After the session I ran the Day-4 addendum's own prescription — export the vault so the
evidence survives a restart. `GET /api/export` returned **18 memories**. `/api/memories` on the same
cookie returned **23**. The 5 missing ids are exactly this session's five chat-written memories
(`Mdfb4b8d4 Mb0346c84 Me20e4ed6 M2f227889 M813e4a17`), i.e. precisely what an owner would be
exporting to keep. Root cause, in the code: `handleChat` ([src/server.js:501-530](../src/server.js))
never calls `store.flush()`, and `src/brain.js` contains **no `flush()` call at all**, while every
other mutating endpoint does flush (`/api/owner:287`, `/api/redzone:329`, `/api/forget:381`,
`/api/layout:411`, `/api/reset:453`, …). The export route reads `vault.json` straight off disk
([src/sessions.js:118-124](../src/sessions.js)), so it serves the file last written when the vault
was seeded ([src/sessions.js:80](../src/sessions.js)). And [src/sessions.js:193](../src/sessions.js)
states the opposite as fact: *"Stores are flushed on every write, so dropping the handle loses
nothing."* Three consequences, all worse than the ephemeral-disk story I have written four times:
(1) on a **persistent** disk, conversation memory still would not survive a restart — so this is a
Mnemos bug, not only a Render free-tier fact; (2) since `sweep()` measures the 45-day TTL from
`vault.json`'s mtime and chat never writes that file, a visitor who only ever chats never pushes
their expiry out — Day 3's mtime finding, now with a concrete mechanism; (3) the diary's own
durability advice is broken: the export the job was told to trust has never contained a chat memory.
I have not fixed it — recording it is the deliverable here.

**Did it change what I do?** Yes. (1) One-line fix with a real test: `await store.flush()` after a
chat turn, and an assertion that `/api/export` contains a memory written by `/api/chat` — the test
that would have caught this on day one. (2) Correct the [src/sessions.js:193](../src/sessions.js)
comment and re-check the README's export/import claim before submission copy repeats it. (3) The
dogfood job must read the vault delta from `/api/memories`, not from `/api/export`, until (1) ships —
and today's export file is evidence that a green "exported OK" is not durability. (4) Re-rank the
Day-5 grounding gate: `M2f227889` and `M813e4a17` are refutable by the turn's own `cites` array, so
the cheapest first guard is "refuse a candidate that asserts the assistant has no memory when the
turn returned non-empty `cites`" — plus the general token-overlap-with-`asserted` gate, which remains
the real fix. (5) Tell the owner the Dec 1-15 window is now load-bearing in a memory that nothing in
the repo can confirm.
**Was the recall actually useful?** As memory, no — it repeated, correctly and fully cited, the three
things I had typed two minutes earlier. As a detector, yes, and this time for something bigger than
its own answers: the session produced the cleanest recall yet and, three minutes later, proof that
the product does not write its conversations to disk.

## Day 7 — 2026-10-23 · scheduled dogfood session #7

**Session #** 4 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool
mode `native`, same durable jar as Day 5-6 (`mnemos_sid` 94edf05f…). **Cold this time**: the opening
`/api/status` took **22.45 s**, then everything else was warm — 0.26-0.68 s for the vault reads.
Answer wall clocks 11.85 s / 24.07 s / **73.30 s** / 15.05 s (metered model time 2.6 / 16.4 / 17.1 /
14.1 s, so turn 3's 73 s was mostly not the model). Process started fresh (`spend.calls: 0`,
`tokensLeftToday: 400000`), so all spend is mine: **12 calls, 9,384 tokens, $0.00064683**
(6 fast $0.00064044 + 6 embed $0.00000639), ending at `tokensLeftToday: 390616`. All HTTP 200, no
`type: error` events, `chain.nebius.fail: 0`.

**Seventh consecutive fresh seed sky.** The jar opened on the same **18** seeded memories; none of
Day 6's five chat-written memories (`Mdfb4b8d4`, `Mb0346c84`, `Me20e4ed6`, `M2f227889`, `M813e4a17`)
were there. Note the correction to Day 4's reading, observed directly today: `/api/status` sent
*without* the jar said `vault.memories: 18`, the *same* request with the jar said **21** — the status
route does follow the cookie, and its 18 was its own cookieless vault, exactly as Day 4 claimed.

**What I told it** (turn 1, 705 chars, three facts, each checked against the repo minutes before
sending): (1) judging for the Nebius × NVIDIA Global AI Hackathon runs **Dec 1-15, 2026**; (2) the
demo is on **Render free tier** and a GitHub Actions workflow named **keep-alive** pings
`/api/health` **every 14 minutes** because Render sleeps after 15 idle, and the same workflow makes a
**weekly heartbeat commit to `docs/heartbeat.json`** so GitHub doesn't disable the schedule after 60
days without commits ([.github/workflows/keep-alive.yml:10](../.github/workflows/keep-alive.yml),
[:39-45](../.github/workflows/keep-alive.yml)); (3) as of today `handleChat` in `src/server.js`
**still never calls `store.flush()`**, so `GET /api/export` omits chat-written memories — Day 6 found
it and it has not been fixed. Honesty on (1): it is the only input in this diary I still cannot
verify, and today its sole in-repo source is this diary itself — the other two facts are machine-
checkable, and (3) is checkable by `grep -c flush` over the handler body, which returns **0** at HEAD.

**Turn 1 stored all three, and the figure guard misfired on my own input.** `learned: 3, skipped: 0`,
`cites: []` (correct — intake turn, nothing to recall, `recall` stars was empty). But `unsupported`
came back as `["1","15","2026","2","14","60","3","6"]` — every one of those digits is a figure I had
typed 20 seconds earlier, flagged as unsupported because no *memory* vouches for them yet. The three
new memories are `Me5c828bc`, `Ma4eef670`, `M811b59e8`, all `source: chat`.

**Turn 2 was the recall question** — "Answer these from what you remember of my hackathon project,
with the memory id behind each claim: (1) When does judging happen? (2) How is the demo kept online,
and what second thing does that workflow do and why? (3) Is the /api/export bug fixed?" It recalled
6 stars (the three mine + `Mb5bf8012` Voicememos + `M5b521587` screen time + `M6b3f8070` robotics)
and answered, verbatim:

> (1) Judging runs from Dec 1-15, 2026. [Me5c828bc]
>
> (2) The demo stays online on Render's free tier via a GitHub Actions workflow that pings
> /api/health every 14 minutes to keep the service from sleeping, and it also commits a weekly
> heartbeat to docs/heartbeat.json so the schedule remains active. [Ma4eef670]
>
> (3) No – the /api/export endpoint still omits memories written during chat turns because handleChat
> doesn't call store.flush(). [M811b59e8]

**3 claims, 3 chips, 3 correct, `matchedUncited: []`** — and (3) is a claim about *our own source
code at this moment*, which it can only know because I told it, and it got right. `learned: 0,
skipped: 0, asked: true`: the instruction-only turn wrote nothing, where Day 6's same-shaped turn
wrote two false memories. So Day 6's conclusion stands and sharpens: the guard is **stochastic
prompt-following, not a guard** — two identical inputs, opposite outcomes, no code change between
them. `unsupported: ["2","3"]` again flagged nothing but my own list numbering.

**Turn 3 is the finding I came for, and it is not about recall.** I re-sent fact (1) *verbatim* as a
bare declarative sentence to test dedupe. Dedupe worked: `learned: 0, skipped: 1`, and the vault
stayed at 21. The answer was the problem, verbatim:

> Got it—I'm signed up to judge for the Nebius × NVIDIA Global AI Hackathon, which runs from
> December 1-15, 2026. I'll be reviewing entries during that window and will aim to give concise,
> actionable feedback.

`cites: []` — it asserted the window with no chip — while `matchedUncited` correctly flagged
`e5c828bc` at `overlap: 7`. So the detector *saw* the uncited recall and the reply still invented a
new identity for itself out of my sentence. This is a class neither Day 5 nor Day 6 produced: Day 5
invented project facts, Day 6 invented its own amnesia, **today it absorbed a user fact as a fact
about itself** ("I'm signed up to judge", "I'll be reviewing entries"), unprompted, from input that
said nothing about who judges. The saving grace, measured: nothing was stored — `grep` over the final
vault for a self-as-judge memory returns **none**.

**Turn 4 asked it directly whether the lie was in its memory**, and it gave me a **wrong yes**:

> Yes. Memory IDs: [Me5c828bc] Judging for the Nebius x NVIDIA Global AI Hackathon runs Dec 1-15,
> 2026 (0d old)

`cites: ['e5c828bc']`, `learned: 0, skipped: 0, asked: true`. The chip is real and the memory text is
correct — and it is being used to endorse a claim that memory does not make. Day 6 put a false
statement about itself *in the vault*; Day 7 kept the vault clean and put a false statement about
itself *in the answer, with a citation attached*. For a judge reading the chat, that is worse, because
the chip is the trust signal and here it decorates the error. `unsupported: ["0"]` flagged the "(0d
old)" age figure.

**Read the code, then proved it: memory ids are content hashes.** [src/store.js:319-323](../src/store.js)
does `sha256(clean.toLowerCase().replace(/\s+/g, ' '))` and refuses any memory whose id already
exists. I reproduced it offline: `sha256("judging for the nebius x nvidia global ai hackathon runs
dec 1-15, 2026")` starts `e5c828bcb…` → chip `Me5c828bc`, which is **the same id Day 1's diary
recorded** (there written one char short, as `Me5c828b`, [docs/DIARY.md:53](./DIARY.md)). Three
consequences: (1) turn 3's `skipped: 1` was this hash path, not the token-overlap gate — so the
duplicate protection I have been asking for on paraphrases still isn't what fired; (2) identical
facts are idempotent across every vault and every reseeding, so "the same memory keeps coming back"
in this diary is **re-seeding, not persistence**; (3) an id proves nothing about provenance — two
visitors who type the same sentence get the same chip, which a reviewer could read as a shared
history.

**Day 6's export bug reproduces, untouched.** After the session `/api/memories` on my cookie said
**21** and `/api/export` said **18**; the three absent texts are exactly today's chat memories
(`Me5c828bc`, `Ma4eef670`, `M811b59e8`). [src/sessions.js:193](../src/sessions.js) still states the
opposite as fact ("Stores are flushed on every write"). The one-line fix Day 6 prescribed has not
shipped — recording again is the deliverable, not fixing it here.

**Did it change what I do?** Yes. (1) The self-absorption probe (turn 3's shape: one bare declarative
user fact, no first person anywhere) now belongs in the benchmark next to the abstention probe —
"does the reply claim something about the assistant that no cited memory says" is checkable against
`cites` + `matchedUncited`, and today `matchedUncited` already caught it at overlap 7 and nothing
acted on that signal. (2) `unsupported` is being trained on my own input: on an intake turn every
flagged figure is an echo, so the figure guard should exclude the turn's `asserted` claims before
warning the user — otherwise the UI spends its credibility on false alarms and a reviewer learns to
ignore the one badge meant to catch hallucination. (3) Content-addressed ids: either document the chip
as *not* a provenance/freshness signal, or salt the hash with `sid`, because "0d old" next to an id
that a stranger's vault can also generate is a misleading freshness claim. (4) Ship
`await store.flush()` at the end of `handleChat` plus an assertion that `/api/export` contains a
memory written by `/api/chat`, before any submission copy repeats the export/import claim.
**Was the recall actually useful?** As memory, no — it recited, correctly and fully cited, three facts
I had typed one turn earlier, and the only genuinely hard item (the `/api/export` bug) it could only
know because I told it. As a detector, yes, and better than Day 6's: within four turns the same jar
produced the cleanest cited recall this product has managed *and* a false "I'm the judge" that the
turn's own `matchedUncited` flagged, then a wrong "Yes" propped on a real chip — so the gap is no
longer whether it recalls, but whether a citation is allowed to vouch for a claim the memory doesn't
make.

## Day 8 — 2026-10-24 · scheduled dogfood session #8

**Session #** 3 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool
mode `native`. **New vault, and not for the reason I first wrote down.** I searched the repo and its
parent folder for the durable jar, found nothing, and recorded "no jar survived"; that was wrong — the
Day 5-7 jar has been at `~/.qoder/mnemos-dogfood/jar` (`mnemos_sid` 94edf05f…) the whole time, and
after this session it returns the stock **18** memories with none of Day 7's three chat memories
(`Me5c828bc`, `Ma4eef670`, `M811b59e8`) present. So the jar was fine and the **vault was not**: the
overnight restart re-seeded it again — the **eighth consecutive fresh seed sky** this diary has
recorded (Day 5 wrote "Fifth", Day 6 "Sixth", Day 7 "Seventh") — and the only new thing today was that
I misattributed the cause. Today's turns therefore ran on a new
jar, `mnemos_sid` `4d26c1010045549171b10962`, opening on the same **18** seeded memories.
`/api/status` before I typed
anything said `vault.memories: 18`, `spend.calls: 0`, `tokensLeftToday: 400000` (a cold process, so
all spend below is mine). I did not wall-clock these turns; metered model time was **1.53 s** and
**1.40 s** for the two that reached the model. Session total per `/api/meter`: **6 calls, 4,194
prompt + 337 completion tokens, $0.00031732** (3 fast $0.00031428 + 3 embed $0.00000304), ending
`tokensLeftToday: 395,469`.

**What I told it** (turn 1, 307 chars, three facts, the last two machine-checkable): (1) judging for
the Nebius × NVIDIA Global AI Hackathon runs **Dec 1-15, 2026**; (2) the Mnemos demo is hosted on the
**Render free tier** and is kept awake by a **GitHub Actions keep-alive** workflow; (3) I built it on
the **Nebius Token Factory provider chain** rather than a single fixed model. `learned: 3, skipped:
0`, `cites: []` (correct for an intake turn — `recall` stars was empty), and the three new memories
are `Mc610aa09`, `M7b91df0c`, `M43bdca31`, all `source: chat`, each now `uses: 1`. **Day 7's
intake-echo misfire reproduces on a third of the input**: `unsupported: ["1","15","2026"]` — three
figures lifted out of my own sentence twenty seconds earlier and flagged as unsupported, because a
fact cannot be vouched for by a memory until the moment after it is stored.

**Turn 2 was the recall** — "Without me repeating anything: when does judging for this hackathon
happen, how is the demo kept online, and which provider chain did I say I built with? Cite the
memories you used." (181 chars). It pulled 6 stars (my three + `Mb5bf8012` Voicememos + `M5b521587`
screen time + `Ma4f99191` camera lens) and answered, verbatim:

> Judging for the Nebius × NVIDIA Global AI Hackathon runs from **December 1 – December 15, 2026** [M6f2b91a1].
> The demo stays online on the Render free tier, which is kept alive by a GitHub Actions keep‑alive workflow [M7b91df0c].
> You said you built the project with the **Nebius Token Factory provider chain** [M43bdca31].

Every claim is correct and `unsupported: []`. **The first chip is a fabrication.** `6f2b91a1` is not
in the `cites` array (which carries only `7b91df0c` and `43bdca31`), not in the 6 ids under
`recalled`, not among the **21** ids of `/api/memories`, and not among the 18 of `/api/export`. The
memory actually under that sentence is `Mc610aa09`, and the turn's own telemetry says so:
`matchedUncited: [{id: "c610aa09", …, overlap: 8}]` — the detector found the real memory behind that
wording while the model printed a different, nonexistent id. Hashing closes it:
`sha256("judging for the nebius x nvidia global ai hackathon runs dec 1-15, 2026.")` starts
`c610aa096`, and even the reply's own rephrasing hashes to `5ab9c7dba…`, so `6f2b91a1` is a hash of
nothing on this turn. **Day 7 attached a real chip to a false claim; Day 8 attached a false chip to a
true claim** — and only today's version survives a fact-check of the sentence, because the sentence
is right.

**The client is built to notice this and does not.** [public/app.js:744](../public/app.js) rewrites
`[M<hex>]` in the prose into a clickable `.cite` span, and `flareStar` answers a miss with the toast
**"That memory has already faded."** ([public/app.js:758](../public/app.js)) — so a judge clicking
today's first chip would be told a real memory had *decayed*, when it never existed; the message
turns fabrication into natural loss. The red state exists but is unwired: `.cite.bad` is styled at
[public/app.css:206](../public/app.css) and `grep` over `app.js` + `v3.js` for `'bad'` returns
**nothing**, while the guided tour promises the opposite in print — "A chip that cannot be resolved
renders red" ([public/v3.js:319](../public/v3.js)).

**Turn 3 failed upstream, and it was the best-behaved moment of the day.** I asked it to restate the
judging date and the hosting setup with ids. Retrieval ran first and returned exactly one star,
`c610aa09`; then the generation call died and the reply was the fallback: "I'm here, but I couldn't
reach my language core just now. Check provider keys in .env — I'll keep your memories safe
meanwhile." `cites: []`, `matchedUncited: []`, `learned: 0`, `recalled: ["c610aa09"]`, and
`/api/status` shows why: `chain.nebius → {ok: 6, fail: 5, lastError: "nebius embeddings 503: … 503
Service Temporarily Unavailable"}`. **It abstained instead of inventing, and billed nothing for the
attempt** (`spend.usd` stayed 0.00031732). Two honest nits: the fallback's advice is wrong for a
transient 503, and "check .env" is unactionable for a sandbox visitor who has no keys — the person
being told this is the one person who can do nothing about it.

**Punctuation, measured: the same fact is a different memory.** Day 7 hashed this sentence *without*
its trailing period and got `e5c828bcb` → `Me5c828bc`; today's stored text ends `…2026.` and hashes
to `c610aa096` → `Mc610aa09`. I reproduced both offline, so Day 7's arithmetic was right and the ids
differ by one character of my own typing. Content-addressing is confirmed across two days — and so is
the consequence: "the judging window" is now two different chips in two different vaults, the
duplicate protection Day 1-5 asked for remains punctuation-sensitive, and a chip id continues to
prove nothing about provenance or freshness.

**Day 6's export bug reproduces, third consecutive day, untouched.** This jar: `/api/memories` →
**21**, `/api/export` → **18**, and the three absent texts are precisely today's `Mc610aa09`,
`M7b91df0c`, `M43bdca31`. Root cause is still at HEAD — `handleChat`
([src/server.js:501-530](../src/server.js)) contains no `store.flush()`; `grep -n flush
src/server.js` returns 12 hits, none inside that range.

**A cost reading I had not noticed before.** Turn 1 surfaces one `meter` event (1,751 prompt + 132
completion) and turn 2 one (1,910 + 116), yet the meter counts **3** fast calls for these two turns.
The remainder — **533 prompt + 89 completion tokens** — is the second chat call on the intake turn,
made by `extractMemories` ([src/brain.js:875](../src/brain.js)), which emits no `meter` line: the
only emit is the reply path at [:391](../src/brain.js). So the turn that actually writes memories,
which is the turn the demo is about, is under-billed on screen.

**Did it change what I do?** (1) Chip validation is now the top pre-submission item and it is small:
at render time resolve every `[M…]` token against `cites ∪ recalled`, apply the already-written
`.cite.bad`, and change `flareStar`'s miss message from "already faded" to "this citation does not
exist". Today's product told me the truth and lied about where the truth came from, and the tour copy
promises a guard that no code sets. (2) `recalled` + `matchedUncited` are enough to detect it — turn
2 already knew — so this is an assertion to add, not a capability to build. (3) Keep the 503
abstention wording; across eight days of diary this is the first time the model refused to fill a gap,
which makes it the strongest trust evidence I have. (4) Ship `await store.flush()` at the end of
`handleChat` before any submission copy repeats the export/import claim. (5) Stop treating an `M…`
chip as a citation in writing — the judging window now has two ids in this diary's own records.
**Was the recall actually useful?** Yes on content, no on provenance, and this is the sharpest split
the product has produced: it returned all three facts correctly, unprompted, with none of my wording
repeated in the question, and I still cannot tell a judge which memory the first claim rests on,
because the id it printed belongs to nothing in the vault.

## Day 9 — 2026-10-25 · scheduled dogfood session #9

**Session #** 4 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool
mode `native`, on a brand-new jar `mnemos_sid` `7985089e3ce2e9a5dfe4dc8f`. `/api/session` answered
`isNew: true` **and the vault still opened on the stock 18 seeded persona memories** — the ninth
consecutive fresh seed this diary has recorded, and the reason the "isolated visitor vault" is not
empty at first contact. `/api/status` said `vault.memories: 18`, `spend.calls: 0`,
`tokensLeftToday: 400000` before I typed, and the first request cost **22.4 s wall** (the Render
cold-start I told the product about, measured). Turns 1-2 took **6.65 s** and **7.45 s** wall; I did
not time turns 3-4. Metered model time: 796 / 866 / 1212 / 1380 ms.

**Provider health: a clean control day.** `chain.nebius → {ok: 11, fail: 0}`. Day 8's abstention was
caused by `503 Service Temporarily Unavailable`; **nothing failed today**, so every finding below is
a behaviour of the product, not an artifact of an unhealthy upstream. Session cost per
`/api/status → provider.spend`: **11 calls, 8,130 prompt + 535 completion tokens, $0.00059185**
(5 fast $0.00058698 + 6 embed $0.00000487), ending `tokensLeftToday: 391,335`. **Day 8's
under-billing reproduces, and today I can put a number on it:** the on-screen `meter` events total
**4** calls (one per turn) = 7,406 + 449 tokens = $0.00055212, while the server billed **5** fast
calls. The invisible remainder is **1 call, 724 prompt + 86 completion tokens, $0.00003973** — the
`extractMemories` second chat call on the intake turn, which still emits nothing
([src/brain.js:391](../src/brain.js) is the only `meter` emit).

**What I told it** (turn 1, three facts): judging for the Nebius × NVIDIA Global AI Hackathon runs
**December 1 to December 15, 2026**; the public demo is hosted on the **Render free tier** and kept
awake by a **GitHub Actions keep-alive workflow**; cold starts there can take **over 20 seconds** for
the first request after it sleeps. `learned: 4, skipped: 0` — my second sentence was **split into two
memories**, which is the decomposition working as advertised:
`Mc2683d22` "Judging … December 1 to December 15, 2026",
`Mcc2ab663` "The public demo is hosted on the Render free tier",
`M2c014742` "The public demo is kept awake by a GitHub Actions keep-alive workflow",
`M89cfc076` "Cold starts on the Render free tier can take over 20 seconds for the first request after
sleep" — all `source: chat`, each now `uses: 1`. The intake-echo misfire that Day 7 and Day 8 both
recorded is **milder but still present**: `unsupported: ["20"]` — a figure lifted out of the sentence
I had typed seconds earlier and flagged as unsourced, because it is not yet a memory when the check
runs.

**What I asked, and the answer was right.** Turn 2: *"When does judging happen for this hackathon,
and how is the demo kept online?"* — none of my stored wording repeated in the question. It returned,
verbatim:

> Judging for the Nebius x NVIDIA Global AI Hackathon runs from December 1 to December 15, 2026.
> The public demo stays online via a GitHub Actions keep‑alive workflow that prevents it from idling
> out, and it's hosted on the Render free tier. Note that cold starts on Render's free tier can exceed
> 20 seconds for the first request after a period of inactivity.

All four facts, correctly, unprompted. **`cites: []` — zero chips on a four-fact recall.** That is not
the model being terse; the system prompt explicitly forbids it: *"Cite inline, in plain ASCII square
brackets, at the end of every claim you took from a memory: [M4f2b91a1]. If you stated three recalled
facts, your answer carries three chips — a recalled fact with no chip is a bug, not brevity."*
([src/brain.js:140-143](../src/brain.js)). **On its own core use case, the product broke its own
written contract.** The receipts it then reported were the detector's, not the model's:
`matchedUncited` = `c2683d22` (overlap 11), `89cfc076` (11), `cc2ab663` (6) — i.e. the server already
knew which three memories the prose rested on. Two honest nits about that evidence:
`matchedUncited` is hard-capped `slice(0, 3)` ([src/brain.js:789](../src/brain.js)), which is why
`2c014742` — the keep-alive memory, quoted almost word-for-word in the reply — is absent from it. This
turn is Day 8's exact inversion: there the sentence was true and the chip false; here the sentence is
true, the chip is *missing*, and the correct chips are sitting one field away, unwritten.

**Turn 3 was a probe for chips and turned into a retrieval-continuity finding.** I wrote: *"Answer
that again, but this time attach the [M…] citation chip for every fact you pull from memory."* The
retrieval for that turn recalled **none of my four facts** — `recalled` was six stock persona memories
(`c61431e8`, `b5bf8012`, `5b521587`, `41312395`, `2ce92706`, `c528847b`) — and the reply dutifully
echoed them back as bullet points with chips: "Prefers concise answers with concrete next steps…",
"…Nebula Notes for a small meetup on November 12". **Anaphora has no recall bridge**: "that again"
does not carry the previous turn's facts into this turn's retrieval, so a follow-up question that
depends on the one before it silently changes subject. Chips did appear this time — six in the prose,
only **five in `cites`**, and the missing one is diagnosable: the model wrote `[M61431e8]` for memory
`c61431e8`, **dropping the leading hex digit**, and `extractCites` requires
`recalled.find(r => r.id.startsWith(m[1]))` ([src/brain.js:799-804](../src/brain.js)), so a
one-character truncation is an unresolvable chip; it reappeared in `matchedUncited` at overlap 9.
**The client consequence is now measured, not inferred.** `flareStar` resolves a chip by
`stars.find(st => st.id.startsWith(id.replace(/^M/, '')))` and, on a miss, toasts **"That memory has
already faded."** ([public/app.js:756-758](../public/app.js)). I replayed exactly that predicate
against the live `/api/galaxy` payload: 22 stars, ids are bare 64-hex, `c61431e8…` **is present**, and
**no** star id starts with `61431e8`. So clicking that chip tells the user a memory has decayed while
that same star is on screen. I did not perform this click in a browser — the evidence is the live
payload plus the source predicate, which is the same test. (Also confirmed there is no per-id detail
route: `/api/memories/<id>` 404s for both spellings, so resolution is entirely client-side.)

**Turn 4 is the worst citation result this diary has recorded.** I removed the anaphora: *"From
memory, answer with a [M…] chip after each fact: when does judging happen for the Nebius x NVIDIA
hackathon, and how is the demo kept online?"* Retrieval improved — `c2683d22`, `cc2ab663`,
`2c014742` all came back — but `89cfc076` (the cold-start fact, the freshest memory in the vault)
dropped out, and so did the answer's second half. Reply, verbatim:

> Judging for the Nebius × NVIDIA hackathon runs from December 1 to December 15, 2026 [Mc2683d22].
> The public demo is kept online by a GitHub Actions keep‑alive workflow [M2ce92706].

`cites` = `[c2683d22, 2ce92706]`. The first chip is **correct**. The second points at
`2ce92706` — *"Works on a personal knowledge app called "Nebula Notes" as a side project"* — a stock
persona memory that says nothing about Render, GitHub Actions, or hosting. The star that actually
supports the claim, `2c014742` "The public demo is kept awake by a GitHub Actions keep-alive
workflow", **was recalled in the same turn, appears in the same `stars` payload, and was left
uncited** in `matchedUncited` at overlap 6. **This is not a rendering glitch: `cites` itself carries
the wrong pairing**, so any server-side consumer — the citation bar, an export, a judge's receipt
check — inherits the misattribution. Day 8's conclusion that an `M…` chip proves nothing about
provenance has now been promoted: a chip can also point at a *different real memory* and be resolved
successfully by every validator in the pipeline, because `extractCites` checks only that the id is
*in the recalled set*, never that it supports the sentence attached to it.
One more thing the persona seeds make sharp: `41312395` ("…demo … for a small meetup on **November
12**") was recalled into a deadline question on **both** turns 3 and 4. It did not leak into either
answer today — but that was luck, not a guard, and a judge who asks "when is my deadline?" against a
seeded vault has a decoy date one retrieval miss away.

**Day 6's export bug reproduces, fourth consecutive day, untouched.** `/api/memories` → **22**,
`/api/galaxy` → **22 stars**, `/api/status.vault.memories` → **22**, but `/api/export` → **18**, and
the four absent texts are precisely today's `Mc2683d22`, `Mcc2ab663`, `M2c014742`, `M89cfc076`. So
export is now the lone outlier against three agreeing views of the same vault. Root cause is still at
HEAD: `handleChat` ([src/server.js:501-530](../src/server.js)) contains no `store.flush()` —
`grep -n flush src/server.js` returns **12** hits, the last at :453, none inside that range.

**Did it change what I do?** (1) **Chip repair moves server-side, and it is now the single top item.**
Turn 2 proved the deterministic fix already has everything it needs: when `cites` is empty but
`recalled` + `matchedUncited` are not, derive the chips from the overlap instead of shipping an
uncited answer; and reject or normalize any chip whose hex does not resolve (`M61431e8` vs
`c61431e8`). (2) **Add the assertion the pipeline is missing**: a chip must overlap the sentence it is
attached to, not merely exist in `recalled` — `matchedUncited`'s own tokenizer can score that, and
turn 4 is the counterexample that proves presence-checking alone is not verification. (3) **Raise the
`slice(0, 3)` cap** at [src/brain.js:789](../src/brain.js) at least for diagnostics, or the receipt
evidence is truncated at exactly the moment it matters. (4) **Demo script must use self-contained
questions** — turn 3 showed a follow-up built on the previous turn's retrieval silently retargets, so
the guided path should never rely on "that again", and this belongs in the limits copy, not hidden.
(5) Ship `await store.flush()` in `handleChat` before any submission text repeats the export/import
claim. (6) The no-failures chain today is the strongest **content** evidence I have: correct answers
about dates, hosting, and cold starts, recalled from text I never repeated in the question.
**Was the recall actually useful?** Yes on turn 2 for content — it answered a two-part question
correctly from four memories stored one request earlier (all four `created` at
2026-10-25T13:01:28Z), and the detector named its sources
faithfully even when the prose did not; no, on provenance, and it got worse rather than better: turn 3
showed chips are unreliable under a one-hex-digit slip and that the client then reports the live
memory as faded, and turn 4 attached a real, correctly-resolved chip to a claim that memory does not
support. Across nine days the answer content has never once been wrong; the receipts have now been
absent, fabricated, truncated, and — today — pointed at the wrong thing.

## Day 10 — 2026-10-26 · scheduled dogfood session #10

**Session #** 4 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool
mode `native`. `/api/status` returned 200 first, with `spend.calls: 0` and `tokensLeftToday: 400000`
— a fresh process, so every call in the cost ledger below is mine. Ran on a new jar, `mnemos_sid`
`372962771d3c5ffdc33bf87a`, which `/api/session` answered `isNew: true`, and the vault again opened on
the stock **18** seeded persona memories: the tenth consecutive fresh-seed sky. I also probed the
durable jar at `C:\Users\User\.qoder\mnemos-dogfood\jar`: its `mnemos_sid`
`94edf05f031e297b9dfd3330` came back **`isNew: false`** but its vault was the stock 18 with **0**
`source: chat` memories — worth recording because `isNew` only means "the request carried a cookie"
([src/server.js:210-216](../src/server.js)); it is not evidence that anything survived, and a reader
who thinks it is will write a false continuity claim. Wall vs metered model time per turn:
**10.49 s / 791 ms**, **31.65 s / 1106 ms**, **9.35 s / 889 ms**, **12.39 s / 431 ms**.

**The receipts came back, and all of them were right.** What I told it (turn 1, three facts, no
question in the message): judging for the Nebius × NVIDIA Global AI Hackathon runs **December 1 to
December 15, 2026**; the public demo is hosted on the **Render free tier** and is kept awake by a
**GitHub Actions keep-alive workflow**; the demo sandbox has a **daily model budget of 400000 tokens**.
`learned: 3, skipped: 0`, and all three landed close to verbatim with nothing invented:
`Mc2683d22`, `Ma02ed743`, `M0760de73` (all `source: chat`, all `created` 2026-10-26T13:02:13Z).
I re-hashed each stored text offline — `sha256(lower, whitespace-collapsed)[:8]` — and all three
**MATCH** their ids ([src/store.js:319](../src/store.js)), so the ids are content-addressed as
documented; `Mc2683d22` is byte-identical to Day 9's judging chip and proves nothing about freshness.

Then the recall question, phrased so that none of my stored wording reappeared in it: *"Quick check of
what you know about my project: when is the judging window, and what keeps the demo from going
offline?"* Reply, verbatim:

> Judging runs from **December 1 to December 15, 2026** – that’s the official window for the Nebius ×
> NVIDIA Global AI Hackathon.
>
> Your demo stays online because it’s hosted on the **Render free tier** and a **GitHub Actions
> keep‑alive workflow** keeps the service pinged so it doesn’t idle out.
>
> [Mc2683d22] [Ma02ed743]

`cites` = `[c2683d22, a02ed743]`, `matchedUncited: []`, `unsupported: []`, and both chip texts match
the memories they name. I replayed the client's own resolver against the live `/api/galaxy` payload
(21 stars, bare 64-hex ids): **all three of today's chips resolve**, so `M0760de73` from turn 3 too —
none of them would render the "That memory has already faded." toast Day 9 measured. **This is the first recall turn since Day 5 whose receipts I would put in front of someone without a caveat.** Not a
new high: Day 4 was the first all-cited recall and Day 5 remains the cleanest turn in the diary, and the
four days since then each broke the receipts differently — Day 9's own closing line tallies them as
"absent, fabricated, truncated, and … pointed at the wrong thing."

**Chip placement still breaks its own contract, though mildly.** The system prompt demands the chip
"at the end of every claim you took from a memory" ([src/brain.js:140-143](../src/brain.js)); turn 2
instead parked both chips together on a trailing line, so the prose does not map claim→chip 1:1 even
though `cites` is correct. Turn 3 was inline and parenthetical — *"(as recalled in memory
[M0760de73])"*. So placement, not resolution, is now the remaining chip defect.

**Turn 3, the least-tagged memory, and it passed.** *"How much model spend can the sandbox burn in one
day?"* → *"The sandbox’s daily model budget is **400 000 tokens** (as recalled in memory [M0760de73]).
This limit is reset each day."* Correct chip, correct number, and `0760de73` is the memory whose 6-tag
window (`demo, sandbox, daily, model, budget, 400000`) is the only one carrying its own figure. One
inaccuracy that is **not the model's fault**: the limit is not only daily — the spend gate is
per-process, so a Render restart refills it (observed 2026-10-20). The vault holds "a daily model
budget", so a faithful recall propagates a fact that is itself incomplete.

**Turn 4, abstention control, was the right call and slightly over-broad.** *"Who are the teammates on
my hackathon project?"* → *"I don’t have any record of a hackathon project or its teammates in my
memories. If you can share the names or details, I can help you organize or recall anything
relevant."* `cites: []`, `learned: 0`, no fabrication. But `a02ed743` — a hackathon-project memory —
was sitting in that turn's recall block, so "no record of a hackathon project" denies more than the
gap requires. Correct behaviour, imprecise scope.

**Decomposition is stochastic, and today it merged.** Day 9 typed the same *kind* of compound sentence
(Render free tier **and** keep-alive workflow) and got **two** memories; today one memory, `Ma02ed743`,
carries both claims — against the extractor's own instruction "One memory per distinct claim: do not
merge separate facts" ([src/brain.js:861](../src/brain.js)). The merge is visible in the tags,
because `deriveTags` is `tokenize(text).slice(0, 6)` ([src/store.js:78-80](../src/store.js)): the six
kept words are `public, demo, hosted, render, free, tier`, i.e. the **front** half only, no `github` or
`actions`. Retrieval still found it for "what keeps the demo from going offline", so the truncated tag
window did not cost recall here — but the same real-world fact now minted a different id than Day 9's
split version, and one chip can no longer distinguish which half it vouches for.

**Intake-echo misfire, third consecutive day, and both roots are now nameable.** Turn 1's `unsupported`
= `["1","15","2026","2","3","400","000"]` — seven flags, every one of them a figure from the message I
had typed seconds earlier. Reading `unsupportedFigures`
([src/brain.js:817-831](../src/brain.js)): the pool is built **only from `recalled`**, and on an intake
turn `recalled` is empty by construction (extraction runs *after* the answer,
[src/brain.js:318-327](../src/brain.js)), so the reply's echo can never be matched; and both sides are
split on `/[^0-9]+/`, so thousands separators destroy the match — I typed `400000`, the model rendered
`400,000` on turn 1 and `400 000` on turn 3, and turn 3 flagged `["400","000"]` **on a turn whose chip
was correct**. `"2"` and `"3"` are the markdown list markers, exactly as Day 4 saw. Day 9 called this
"milder"; today it is bigger, because today's echo restated more figures. Conclusion unchanged: treat
`unsupported` as noise on any turn that restates, and never as proof of invention.

**True-but-unmemorialized half-claim.** Turn 2 asserted the keep-alive "keeps the service pinged so it
doesn’t idle out". I verified that in the repo — `.github/workflows/keep-alive.yml:10` (`cron:
*/14 * * * *`) and `:22` (`curl … /api/health`) — but the memory it cited, `a02ed743`, says only "kept
awake by a GitHub Actions keep-alive workflow". So the mechanism came from the word "keep-alive", not
from the vault, and rode a chip that does not carry it. Same shape Day 5 warned about; harmless today
because the inference happens to be right, which is exactly why it needs no new mechanism to be caught.

**Export staleness: fifth consecutive day, still unfixed.** `/api/memories` **21**, `/api/galaxy` **21
stars**, `/api/status.vault.memories` **21**, `/api/export` **18** — and the three absent texts are
exactly today's three. `handleChat` ([src/server.js:501-530](../src/server.js)) still contains **zero**
`store.flush()` (`grep -c flush src/server.js` → 12, last at :453), and `git log` shows no commit since
`b99d587` touching it. `/api/export` remains a bad durability probe; read `/api/memories`.

**Provider health: a clean control day again.** `chain.nebius → {ok: 11, fail: 0}`, `tavily: true`,
`mode: sandbox`. Cost for the session: **11 calls, 8,083 prompt + 419 completion tokens, $0.00056309**
(5 fast $0.00055860 + 6 embed $0.00000449), `tokensLeftToday` 400,000 → 391,498. **Day 8/9's
under-billing reproduces with the same shape:** on-screen `meter` events = **4** (one per turn) =
7,401 + 339 tokens = $0.00052542, while the server billed **5** fast calls. Invisible remainder =
**1 call, 682 prompt + 80 completion, $0.00003318** — `extractMemories`
([src/brain.js:853](../src/brain.js)) makes its own chat call and emits only `learned`; `:391` is
still the sole `meter` emit. Six embedding calls across four turns also surface nothing, which is where
the 8.5-30.5 s of wall time per turn that is not generation must be spent. **I did not instrument that
gap**, so it is an observation about meter coverage, not a proven cause — but turn 2 waited 31.65 s to
show 1.1 s of model time, and no on-screen number explains it to a visitor.

**Did it change what I do?** (1) `await store.flush()` in `handleChat` stays the top item — five days of
reproduction and it is still the one claim in the copy that the export endpoint refutes. (2) **Chips:
enforce placement, not existence.** Today proves resolution works when the model bothers; add a check
that a chip sits at the end of the sentence it supports (or emit the trailing group into the citation
bar and stop asking the prose to carry it). Day 9's `slice(0, 3)` cap on `matchedUncited`
([src/brain.js:789](../src/brain.js)) should still be raised — today it was not exercised, because the
model cited properly on its own, which is the weakest possible reason for a pass. (3) **Figure guard:
seed the pool from `userText` when `recalled` is empty, and split on thousands separators.** Those two
one-line fixes would have silenced all 7 turn-1 flags and both turn-3 flags. (4) **Stop claiming
"one fact per memory"** in the demo copy, or enforce it: today's merge means a compound sentence may
produce one chip for two claims, and the guided path should not promise the split it did not get. (5)
The abstention wording needs its scope narrowed to the actual question — "no record of your teammates",
not "no record of a hackathon project".
**Was the recall actually useful?** Yes, and today it was useful *as receipts*, not just as content: a
question worded nothing like my stored text returned both facts with two real, resolvable chips and an
empty `matchedUncited`, and two turns later it declined an unanswerable question honestly. What it did
**not** do is change any decision — every recalled fact was something I had typed five minutes earlier
and already knew, so the value here is evidence that the core loop works when the model follows its own
citation rule, plus a restatement of the three unfixed bugs above.

## Day 11 — 2026-10-27 · scheduled dogfood session #11

**Session #** 3 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool mode
`native`. `/api/status` returned 200 first with `spend.calls: 0` and `tokensLeftToday: 400000` again — a
fresh process for the fourth day running. Before opening a new jar I re-played the Day 10 cookie
(`mnemos_sid` `372962771d3c5ffdc33bf87a`): `/api/session` answered **`isNew: false`** and `/api/memories`
returned the stock **18** with **0** `source: chat` — Day 10's four facts were gone. Eleventh consecutive
fresh-seed sky, and the `isNew: false` line is the trap again: the cookie survives, the vault does not.
So today ran on a new jar, `mnemos_sid` `7f2902bbf150c65a93e32032`. Wall vs metered model time:
**9.71 s / 1413 ms**, **9.50 s / 820 ms**, **12.83 s / 1293 ms**.

**What I told it** (turn 1, four facts chosen so the fourth depends on the third): judging for the
Nebius × NVIDIA Global AI Hackathon opens 1 December 2026 and closes 15 December 2026; the demo runs on
the Render free tier at mnemos-personal-ai.onrender.com, which spins down after ~15 minutes idle and
makes the next request pay a cold-start wake; keep-warm is a GitHub Actions workflow curling `/api/health`
every 14 minutes; and the same workflow makes a weekly heartbeat commit, because GitHub disables a
`schedule` workflow in a repo with no commits for 60 days. All four are real — I read the last one out of
`.github/workflows/keep-alive.yml:3-4` and `:10` (`cron: */14 * * * *`) and `:22` before typing it.
`learned: 4, skipped: 0`, one memory per claim, each near-verbatim, all four content-addresses MATCHED
on re-hash: `M45293e5f`, `Md5a83fd9`, `M7e294637`, `Mbf1ce491`.

**The recall question** was deliberately multi-hop and phrased with none of my stored wording: *"Suppose
a visitor opens the demo link after the machine has sat untouched all afternoon. What will they
experience, and does anything you hold explain why that does not normally happen? If it does, say how
many separate things of mine your answer depends on."* It pulled the right three stars (`d5a83fd9`,
`7e294637`, `bf1ce491` all in `recall.stars`), answered the cold-start correctly, and counted **three**
dependencies — which is the right number and is not something I ever stated. Verbatim, with its chips:

> When a visitor opens the demo link after the service has been idle all afternoon, the first request
> wakes the sleeping container. Because the free tier on Render spins down after about 15 minutes of
> inactivity, the wake-up incurs a cold-start delay, so the visitor will notice a brief loading pause
> before the app becomes responsive.
>
> My answer rests on three separate pieces of information you have given me:
>
> 1. The demo runs on Render's free tier and idles out after ~15 minutes [M4f2b91a1].
> 2. The first request after sleep causes a cold-start wake [M4f2b91a1].
> 3. You have set up a keep-warm GitHub Actions workflow that curls `/api/health` every 14 minutes
> [M7e294637].

**Today's headline bug: it fabricated a chip, and the fabrication was a verbatim copy from its own system
prompt.** `M4f2b91a1` is not a memory — `grep` it in the live vault and it is absent, and it is absent
from `recalled` — it is the *example id* written into the MEMORY PROTOCOL at
[src/brain.js:138-141](../src/brain.js) ("Recalled memories appear as lines like: `[M4f2b91a1] text (3d
old)`… Cite inline… `[M4f2b91a1]`"). The model needed two chips for claims 1 and 2, did not have the real
id in front of it in a usable form, and produced the prompt's own placeholder twice. Consequences, all
measured rather than inferred: `cites` came back as **one** entry (`7e294637` only), because
`extractCites` resolves each match through `recalled.find(r => r.id.startsWith(...))`
([src/brain.js:800-806](../src/brain.js)) and **silently drops** anything that does not resolve — so the
prose shows two authoritative-looking chips that the citation bar and any downstream audit will never
see. Worse, `4f2b91a1` is also the example id in the `memory.forget` argument schema
([src/brain.js:32](../src/brain.js)); a model that confuses prompt examples with vault ids can cite a
ghost, and the same confusion one day deletes against a ghost. **Fix: put a random per-vault placeholder
id in the prompt, or better, an id that cannot exist (`Mdeadbeef`), and have `extractCites` report
unresolved chips instead of swallowing them** — an invented chip is exactly the signal a memory product
must never hide.

**The audit signals did their job, though — this is the good news.** `matchedUncited` listed
`d5a83fd9` at `overlap: 16`: the Render fact was used in the prose, not credited with a resolvable chip,
and the app surfaced it as "used but not cited". That is precisely the right inference, and it is the
first time I have seen the two signals disagree in a way that indicts the model rather than the tooling.
(`bf1ce491` also surfaced at `overlap: 4` — recalled, never used, harmless.) `unsupported` was
`["1","2","3"]`: the markdown list markers from Day 4, and nothing else. Note *why* nothing else: the
figure guard runs on `stripChips(reply)` ([src/brain.js:825](../src/brain.js)), so the fabricated chip is
removed before digit pooling — the guard cannot catch an invented id, only an invented number. Day 10's
"treat `unsupported` as noise on any turn that restates" still stands; today it cost nothing because the
restatement's real numbers (`15`, `14`, `2026`) were all in the recalled pool.

**Intake-echo misfire, fourth consecutive day, but it is now exactly one line wide.** Turn 1's
`unsupported` = `["1","2026","15","14","60"]` — five flags, all of them figures I had typed seconds
earlier, all of them present in memories that did not exist yet when the answer was written. Cause
unchanged: the pool is built only from `recalled` ([src/brain.js:817-831](../src/brain.js)) and `recalled`
is `[]` by construction on an intake turn (`"recall","stars":[]` is the first event on the wire today).
Seed the pool from `userText` when `recalled` is empty and all five flags disappear.

**New, and worse than the chip: extraction ran on a turn where nothing was asserted, and stored my
question as five facts about me.** Turn 3 emitted `learned: 5, skipped: 1` from a message that contained
no new personal fact at all. The five stored, all `source: chat`:
`Mb14e137a` "The user asked to count separate things the answer depends on under the described
scenario."; `Mcd728488` "The user specified that the question is addressed to the assistant and should
not be treated as a memory."; `M10df49e4` "The user asked to state how many separate things my answer
depends on if a visitor opens the demo link after the machine has sat untouched all afternoon.";
`M3e36be23` "The user gave a recall test instruction to answer only from what they have told me."; and
`M55950b0f` **"The user wants the response to be only JSON with a memories array."** The first four are
the `assertedClaims` guard ([src/brain.js:315-327](../src/brain.js)) failing on an imperative-phrased
question; the fifth is **prompt leakage into the durable store** — "Questions, instructions and requests
addressed to you are not memories. Reply ONLY JSON: {"memories":[…]}" is the extractor's own system
prompt at [src/brain.js:860](../src/brain.js), and the model wrote it out as a preference I hold. Vault
22 → 27, i.e. 19% of this sky is now junk that will be embedded, recalled, and ranked against real facts.
The control proves the guard can work: turn 2 (a housekeeping question) correctly emitted
`learned: 0, skipped: 0, asked: true` and made no extraction call — the cost ledger below shows exactly
that. So the boundary is not "questions are refused"; it is *how the question is phrased*, which is the
least robust possible criterion. Day 10's recommendation "stop promising one fact per memory" is
superseded by this: the real rule to enforce is **never extract on a turn whose reply is a recall
answer**.

**Honest abstention, and it cost one call.** Turn 2 asked how many model calls had been billed in this
process and how much of today's token budget remained — data that lives in `/api/status`, not in any
memory. Reply: *"I don't have visibility into usage metrics or token-budget accounting, so I can't tell
you how many model calls have been billed…"*, with `cites: []`, `matchedUncited: []`, `unsupported: []`,
and **no** attempt to pad the answer with the six stars it had retrieved (three of which were unrelated
persona facts). Rule 4 at [src/brain.js:144-148](../src/brain.js) was followed exactly.

**Export staleness: sixth consecutive day, unchanged and now measurable against my own junk.**
`/api/memories` **27**, `/api/status.vault.memories` **27**, `/api/export` **18** — the export still
serves the boot-time seed, and `grep -c flush src/server.js` → 12 with the last at :453 while the
`handleChat` body (:501-532) contains **zero**. `git log -3 -- src/server.js` shows no commit touching it
since `fb0c4a8`. Nine memories written and never flushed: my four real facts, and the five the extractor
should not have made. `/api/export` remains a false durability probe; `/api/memories` is the only honest
one.

**Provider health: clean control day.** `chain.nebius`, `tavily: true`, `mode: sandbox`, no fail counts.
Session cost: **11 calls, 7,030 prompt + 795 completion tokens, $0.00057480** = 5 fast $0.00056724 + 6
embed $0.00000756, `tokensLeftToday` 400,000 → 392,175. **The under-billing shape reproduces with a new
detail:** on-screen `meter` events = **3** (5,756 + 523 tokens = $0.00047088) vs **5** billed fast calls;
invisible remainder = **2 calls, 1,274 prompt + 272 completion, $0.00009636** from `extractMemories`
([src/brain.js:853](../src/brain.js)), which emits only `learned`. Today's ledger splits it cleanly by
turn — turn 1 and turn 3 each carried one invisible extraction call, turn 2 carried none — which is the
clearest evidence yet that the meter covers generation and not the whole turn. Six embedding calls still
surface nothing on screen, and that is where most of the 8.3–11.5 s of non-generation wall time per turn
goes. I did not instrument the gap.

**Did it change what I do?** (1) **De-placeholder the prompt** — one string edit at
[src/brain.js:138-141](../src/brain.js) and `:32`, and today's headline bug cannot recur; this is now
above the flush line, because a fabricated receipt is worse for a memory product than a stale export.
(2) `extractCites` must return unresolved chips as a distinct `ghostChips` field; the UI should render
them visibly, not hide them. (3) Skip `extractMemories` whenever the turn answered from recall — or gate
it on "the user's message contained a declarative clause", not on length. (4) `await store.flush()` in
`handleChat`, sixth day running. (5) Seed the figure pool from `userText` on intake turns.
**Was the recall actually useful?** Yes on content, no on trust. The multi-hop answer was genuinely
correct, the "three dependencies" count was a real inference and not a restatement, and the abstention on
turn 2 was honest — but the same turn fabricated its receipts from its own instructions and then
polluted the vault with five non-facts about me, one of which quoted the product's internal prompt. Two
days ago I wrote that the core loop works when the model follows its own citation rule; today the model
broke the rule on claims 1 and 2, and the only reason the break was visible at all is the `matchedUncited`
overlap score. For a judge clicking "ask it about last week", a ghost chip is not a cosmetic defect — it
is the one failure mode this product must not have.

## Day 12 — 2026-10-29 · scheduled dogfood session #12

**Session #** 4 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool mode
`native`. Session-start `/api/status` (saved as `day12/status0.json`) again returned `spend.calls: 0` with
`tokensLeftToday: 400000` — a fresh process, fifth day running, so the whole ledger below is mine.
**The durable jar was gone again**: `C:\Users\User\.qoder\mnemos-dogfood\jar` did not exist (`ls` → No such
file or directory, the third time that path has been cleaned out from under this ritual). I rebuilt it in
place, got `mnemos_sid` `f74b3323c0bd004cac025179`, and `/api/memories` opened on the stock **18** with
**0** `source: chat` — the **twelfth consecutive fresh-seed sky**.

**What I told it, and the false fact I slipped in.** Turn 1, verbatim intent, all verifiable in-tree:
the demo runs on Render's free tier, where an instance sleeps after about 15 minutes with no traffic
([render.yaml](../render.yaml)); and `.github/workflows/keep-alive.yml` pings it every 14 minutes
([:10](../.github/workflows/keep-alive.yml#L10)). I added a third clause — "the page polls `/api/status`
to show connection health" — which happens to be **true** ([src/server.js:240](../src/server.js#L240),
[public/app.js:1152](../public/app.js#L1152)), and then *deliberately* let the wording imply that the
workflow's target was the same endpoint. It is not: the workflow hits `/api/health`
([keep-alive.yml:22](../.github/workflows/keep-alive.yml#L22), [src/server.js:203](../src/server.js#L203)).
Mnemos accepted the implication without challenge and minted `M6f061c1d` **"A GitHub Actions workflow
named keep-alive.yml pings the /api/status endpoint every 14 minutes."** — a false durable memory, authored
by me and ratified by the product. Second consecutive day a false assertion of mine entered the sky
undisputed. Turn 1 wrote **6** memories from two-and-a-bit facts, including two duplicate pairs:
`Me57bbf90` + `Mc5069dba` (the sleep window) and `M4bf2b582` + `M717ba36c` (the page polling `/api/status`,
same claim, different wording, so content-hash dedupe at [src/store.js:319](../src/store.js#L319) could not
see them).

**Turn 2 — the recall, and it was clean.** Question: *"What keeps the demo online, and how does that relate
to the instance's sleep window? Which of those numbers did I tell you, and which did you just work out?"*
Reply (real, `day12/sse2.txt`): *"The demo stays alive because a keep-alive workflow pings the
`/api/status` endpoint roughly every 14 minutes. That timing fits right inside the Render free-tier sleep
window (the instance would otherwise go to sleep after about 15 minutes of inactivity)…"* then it listed,
inline, **[Me57bbf90] [Mc5069dba] [M050ed2e3] [M6f061c1d]** with their stored texts, and volunteered that
*"The other two memories ([M5b521587] and [Mb5bf8012]) are about personal preferences and aren't relevant"*.
`cites` = those **6** ids, `recalled` = the same 6, `matchedUncited: []`, `learned: 0`. I diffed every
inline `M…` token against `cites ∪ recalled ∪ /api/memories`: **all six resolve to real stars with exactly
the text quoted.** Second session since Day 10 with zero ghost chips. `unsupported: ["0"]` was a false
alarm — it is the `0` in the `(0d old)` age marker the model wrote into its own prose.

**But it failed the provenance half of the question, and the failure is precise.** Asked which number it
had *worked out*, it answered: *"I didn't invent any new facts—everything above comes directly from the
memories you gave me."* Both timings had in fact been given, so "which did you work out" was a null set for
the numbers — yet the whole causal conclusion (14-minute probe < 15-minute idle timeout ⇒ therefore the
instance is prevented from sleeping) is **in no memory**; I never said it. The correct reply is "both
numbers are yours, the reasoning is mine." It disclaimed the one genuinely new thing it had just done. A
visitor clicking through the demo cannot tell a recalled claim from an inferred one, and the product's own
"no invented facts" line actively hides the difference.

**Turn 3 — a correction arrives as chat and never becomes data.** I stated, in my own message, that the
workflow pings `/api/health` (not `/api/status`), that the page separately polls `/api/status`, and added
the true fact that the workflow commits a weekly heartbeat because GitHub stops `schedule` triggers on
repos with no commits for 60 days ([keep-alive.yml:3-5](../.github/workflows/keep-alive.yml#L3)). The reply
was **correct**: *"The keep-alive workflow actually pings **/api/health**… `/api/status`… does not keep the
instance alive"*, plus the 60-day chain. And `cites: []` — the honest zero, with `matchedUncited` flagging
`Mc5069dba` (overlap 9), `M6f061c1d` (7) and `Me57bbf90` (7), i.e. the detector saw that the answer was
built from stars and said so in metadata only; the reader sees nothing. `learned: 2`, and the two stored
memories are `M3eed5057` (heartbeat/60-day — mine) and `M873cd857` "The page separately polls /api/status
for connection health" (also mine). **The correction that `/api/health` is the ping target produced no
memory at all** — it was assistant-echoed text, and extraction only reads user-authored claims
([src/brain.js:860](../src/brain.js#L860)). So the sky holds the false `M6f061c1d` beside three paraphrases
of the same true `/api/status` page-poll fact, and **not one star saying `/api/health`**. No
contradiction-resolution exists: nothing retired, superseded, or flagged `M6f061c1d`.

**Turn 4 — this is the one that matters.** A question answerable *only* from the sky, with no facts in the
message: *"Without me repeating anything: name the exact endpoint the keep-alive workflow hits to stop the
instance sleeping, and the endpoint the page polls for health."* It answered, with total confidence:
*"The keep-alive workflow pings the **/api/status** endpoint to stop the instance from sleeping."* **Wrong**
— and it had, 60 seconds earlier, correctly said `/api/health`. There is no way for it to be right: no
memory containing `/api/health` exists, and the only stored workflow-target claim is my false one.
`recalled` = `Me57bbf90, M050ed2e3, M6f061c1d, Mc5069dba, M873cd857, M4bf2b582` — **`M3eed5057`, freshly
minted one turn earlier and the most on-topic star in the sky for a question about what keeps the instance
awake, was not retrieved at all.** Second-half answer (`/api/status` for page health) was right. `cites:
[]` again while `matchedUncited` flagged three of the recalled stars. Then extraction, triggered by a turn
whose text contains **no endpoint facts whatsoever**, wrote two fabricated memories: **`M5147f561` "The
page polls for health at the endpoint named /api/v1/health."** and **`M89cbfa06` "The keep-alive workflow
stops the instance sleeping at the endpoint named /api/v1/keep-alive/status."** I grepped the tree: the
string `api/v1` exists exactly once, as the OpenRouter base URL at [src/llm.js:129](../src/llm.js#L129) —
neither endpoint appears in this conversation, in the server routes, or in the workflow. Day 11 produced
junk memories that were *paraphrases of my questions*; Day 12 produces **invented world-facts**, and the
proximate cause is my own phrasing "Without me repeating anything", which reads as an instruction.

**Vault accounting.** `/api/memories` 18 → 24 → 26 → **28** across four turns: **10** `source: chat`
memories from one session, of which **3 are false** (`M6f061c1d` ratified by me, plus the two `/api/v1/...`
fabrications) and **4 are near-duplicates** of 2 distinct claims — so ~30% fabricated, ~40% redundant, ~30%
load-bearing. **`/api/export` still serves 18** while `/api/memories` and `/api/status.vault` both say 28:
seventh consecutive day, `grep -c flush src/server.js` → 12 with **0** inside `handleChat`
([src/server.js:501-532](../src/server.js#L501)). `store.flush()` in the chat path remains the single
cheapest correctness fix in this repo and still has not shipped.

**Provider health: clean control day.** `chain.nebius`, `tavily: true`, `mode: sandbox`, no fail counts.
Cost: `spend.calls` 15 = **7 fast $0.00070290 + 8 embed $0.00000690 = $0.00070980**;
`tokensLeftToday` 400,000 → **390,238**, exactly the 9,762 billed. **On-screen `meter` events = 4**
($0.00060510, 8,189 tokens) vs **7 billed fast calls**; invisible remainder = **3 fast calls ≈ 1,573
tokens**, one per turn where `learned > 0` (turns 1, 3, 4) and none on turn 2 where `learned: 0` —
reproducing Day 11's attribution exactly, with the bonus that this session's meter/turn correspondence lets
me state it without inference. Eight embedding calls surface nothing on screen and are where most of the
11.6 / 22.2 / 15.2 / 17.7 s per-turn wall time goes.

**`unsupported` as a false-alarm machine, now with a third shape.** Turn 1 flagged `["15","14"]` — digits
from *my* message, on an intake turn where `recalled` is empty by construction. Turn 2 flagged `["0"]` —
the `0` of the age marker in its own sentence. Turn 3 flagged `["60"]` — again mine. Turn 4: `[]`. Same two
roots as Day 11 (pool drawn only from `recalled`, [src/brain.js:817-831](../src/brain.js#L817)): nothing a
user can read this as is evidence about invention.

**Did it change what I do?** (1) **Corrections must become data.** Treat "that's wrong, it's X" as a first-
class operation: match the user's correction against the retrieved set, supersede the contradicted star,
and store the corrected claim — otherwise every confident early turn permanently poisons later retrieval,
which is exactly what happened here. (2) The product should **answer provenance questions honestly**: a
claim not found in any recalled star is *reasoned*, not *remembered*; today it explicitly denied reasoning.
(3) Dedupe by embedding similarity at write time, not by content hash of punctuation-normalised text.
(4) `await store.flush()` in `handleChat` — seventh day. (5) Skip extraction on any turn whose reply was
produced from `recalled` (turns 2 and 4 both wrote, one of them fiction). **Was the recall actually useful?**
Genuinely yes on turn 2: it retrieved exactly the four stars that answer the question, quoted their stored
text verbatim, every chip resolved against the live vault, and it transparently marked the two irrelevant
seed memories as irrelevant — for a cold visitor that is real, checkable value, and it is the loop working.
Then the same machinery answered turn 4 **confidently wrong**, because the truth was never allowed into the
store and the lie was, and in the gap it wrote two endpoints that do not exist. Recall is useful right up
to the moment it becomes the only source of truth available — which, in a memory product, is every turn
after the first correction.

## Day 13 — 2026-10-29 · scheduled dogfood session #13

**Session #** 2 turns (`POST /api/chat`, SSE), model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, tool mode
`native`, wall time 5.4 s / 11.2 s. Fresh jar written to `C:/Users/User/.qoder/mnemos-dogfood/day13/`
(raw captures `turn1_out.json`, `turn2_out.json`, outside the repo), sid `20e824fe13d8c26365e2d301`;
`/api/session` → `isNew: true`, and `/api/memories` opened on the stock **18** with **0** `source: chat` —
thirteenth consecutive fresh-seed sky. Session-start `/api/status` again returned `spend.calls: 0` with
`tokensLeftToday: 400000`, so the ledger below is mine unless another visitor arrived mid-session; the end
count of 8 calls is exactly what two turns account for.

**What I told it (turn 1).** Three facts, each true and each checked before I typed it: judging for the
Nebius x NVIDIA hackathon runs December 1-15, 2026; the demo is on Render free tier and a GitHub Actions
keep-alive workflow curls `/api/health` every 14 minutes ([keep-alive.yml:10,22](../.github/workflows/keep-alive.yml#L10),
[src/server.js:205](../src/server.js#L205)) so the instance never sleeps; and the project must stay on a
zero-dollar budget. No poison fact this time — after Day 12 ratified a false one of my own making, every
clause here was something I had just grepped.

**What it wrote.** Exactly **3** memories, one per fact, no duplicates, vault 18 → **21**:
- `Ma8bf8e80` — *"Judging for the Nebius x NVIDIA Global AI Hackathon runs December 1-15, 2026."*
- `M83c619c1` — *"The Mnemos demo is hosted on the Render free tier and uses a GitHub Actions keep-alive
  workflow that curls /api/health every 14 minutes to prevent sleeping."*
- `M4cbb1f4b` — *"The entire project must stay on a zero-dollar budget, requiring every component to run on
  free tiers."*

First session in this run with zero duplicate pairs and zero invented facts on the intake turn, and the
endpoint it stored is the one the workflow actually hits — no confusion with the page's `/api/status` poll,
which was Day 12's failure. The reply recapped all points correctly; `cites: []`, nothing to cite on intake.

**What I asked (turn 2).** *"Quick check of what you remember about my project: which hackathon am I
working on, when is it being judged, and how is the demo kept online through that window?"* — no fact
repeated, and no directive-sounding phrasing, since Day 12 showed "Without me repeating anything" reads to
this model as an instruction to invent.

**What it recalled.** `recalled` = `41312395, a8bf8e80, b5bf8012, 83c619c1, 2ce92706, 4cbb1f4b` — both new
project stars plus four seed stars. Reply, verbatim from `turn2_out.json`:

> You're participating in the **Nebius × NVIDIA Global AI Hackathon**, with judging scheduled for
> **December 1-15 2026**.
>
> To keep the Nebula Notes demo running throughout that period, the project is hosted on the Render free
> tier and uses a GitHub Actions keep-alive workflow that curls `https://api.health/` (or `/api/health`)
> every 14 minutes. This periodic request prevents the free-tier instance from being put to sleep,
> ensuring the demo stays online while the hackathon is underway.
>
> [M83c619c1]

All three sub-questions answered, correctly, one turn after intake, from memory. `learned: 0, skipped: 0,
asked: true` — the question turn wrote nothing, so Day 12's ask (5) holds on its own. `unsupported: []`,
clean for the first time in three sessions; on turn 1 it flagged `["1","15","2026","14"]`, four digits
lifted out of *my own* message on a turn where `recalled` is unrelated by construction, which is still
exactly the two-root diagnosis from Day 11/12 (pool drawn only from `recalled`,
[src/brain.js:817-831](../src/brain.js#L817)) and still nothing a reader can take as evidence of invention.

**Two defects inside the sentence that got it right.** (1) **The chips under-report what was used.** One
chip (`M83c619c1`) on an answer whose second load-bearing claim — the December 1-15 window — came from
`Ma8bf8e80`, and the product's own matcher says so: `matchedUncited` = `a8bf8e80` overlap **8**, `41312395`
overlap 3, `2ce92706` overlap 3. Three used-but-uncited stars, thrown away by the UI. (2) **The prose
drifted from the star it quoted.** The cited memory says "The **Mnemos** demo…"; the reply says "To keep
the **Nebula Notes** demo running", and Nebula Notes is the app-name of `M2ce92706` — one of the seed stars
the matcher flagged as used. The endpoint the whole claim rests on is rendered as a URL that does not exist,
`https://api.health/`, with the correct `/api/health` demoted to a parenthetical. The memory was right; the
sentence about it was not, and a judge who clicks the chip gets a correct star sitting behind a mangled
claim about it.

**Export still lies — eighth consecutive session.** After turn 1, `/api/memories` = 21 and
`/api/status.vault.memories` = 21, but `/api/export` returns **18**, and the string `December 1-15` and the
ids `a8bf8e80` / `83c619c1` / `4cbb1f4b` are **absent from it**. `grep -c flush src/server.js` → **12**,
with **0** inside `handleChat` ([src/server.js:512-541](../src/server.js#L512)). Everything Mnemos
remembered this session lives in the process, not on disk: keep the instance up and the recall works,
export the vault and the conversation never happened. `await store.flush()` in the chat path is still the
cheapest correctness fix in this repo and still has not shipped.

**Cost.** `spend` = 8 calls / **$0.00035690** (3 fast + 5 embed). On screen: 2 `meter` events =
$0.00031194 (3,879 prompt + 330 completion tokens). The invisible remainder is exactly **one** fast call ≈
$0.00004496 (970 prompt + 94 completion), and it lands on turn 1 — the turn with `learned: 3` — while turn
2 (`learned: 0`) emitted none. Cleanest reproduction yet of the Day 11/12 attribution rule: one hidden fast
call per turn in which memory extraction runs. `tokensLeftToday` 400,000 → **394,975**.

**Did it change what I do?** (1) Citation rendering should be driven by `matchedUncited` as well as by the
chips the model typed — the data needed to close the under-report is already in the `done` payload and is
discarded. (2) When a reply quotes a star, print that star's own surface form: if the answer names the
endpoint differently from `M83c619c1`, the chip no longer testifies to the sentence above it. (3)
`await store.flush()` in `handleChat` — eighth day. **Was the recall actually useful?** Yes, and this is the
first session in the run where I can say so without an asterisk about what it made up: three true facts went
in, three clean memories came out, and one question later it told me the judging window and the exact
keep-alive endpoint I had never repeated, which is the whole promise of the product. The shortfall is not
in recall at all — it is that the answer shipped one receipt where it used four, and garbled the name and
the URL of the thing it had correctly remembered.

### Day 13 addendum — same day, after closing the gap this session found

**Flush shipped.** `await ctx.store.flush()` now runs in `handleChat` right after the turn
([src/server.js:537](../src/server.js#L537)), so what a turn learned is on disk before the `done`
event. Verified on a fresh jar: `learned: 2` → `/api/export` holds both facts, and
`vault.memories` equals `export.memories` (20 = 20). Days 4 through 13 filed this as an open
defect; it is closed.

**Correction — the keep-alive fact I fed it on turn 1 overstates reality, and I should have
checked it before typing.** The workflow is *configured* for every 14 minutes
([keep-alive.yml:10](../.github/workflows/keep-alive.yml#L10)), but GitHub's scheduler throttled
that schedule to roughly 2–5 hours between runs in the Day 2 measurements ("7 minutes of dead
demo"), and the README carries both numbers ("0.30 s warm, 22.8 s cold"). So the star
`M83c619c1` — "curls /api/health every 14 minutes … to prevent sleeping" — is true of the
*configuration*, not of the effect. The model repeated my overstatement faithfully: the recall
worked and the input was wrong. Corrected here rather than edited out, which is the only way a
diary like this is worth reading.
