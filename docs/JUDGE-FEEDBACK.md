# Judge feedback — Nebius × NVIDIA "Will It Ship" judging webinar

_Session: 2026-10-21 (Zoom webinar, project review of Mnemos). Captured from WhatsApp
voice notes, transcribed locally with ffmpeg + whisper.cpp (base.en — some words rough;
a clean `small.en` re-run is pending). More recordings may be appended below._

## ✅ What the judges praised
- **Memory ablation / "delete a memory"** — named explicitly; one judge said it's what drew
  them to look for it in the demo.
- **The sky metaphor** — "story feeling", stars, falling-star background: "looks really nice / cool".
- **Dreaming + morning brief** — "I love the dream aspect and the ideas."
- **"What do you remember?" recall** — "a lot of the value comes from here."
- **MCP server** — "transforms this from a personal assistant to a memory other agents can use —
  that's a bigger story." (They got the differentiator.)
- **Onboarding pop-up + falling stars** — "great implementation… super helpful for learning the tool."
  (Do NOT remove the onboarding card.)
- 🌟 **Strongest signal:** a judge who built a similar personal-AI system (morning brief, deadlines
  across email/calendar/clients) said **"this is a much prettier version of what I built for
  myself… This is great."**

## ⚠️ Concerns raised (actionable)
1. **Impact / use case not obvious** — "impact is where I'm missing a little bit… beyond keeping
   and deleting memories, what's the use case?" (Most-repeated point.)
2. **Per-visitor vault isolation wasn't visible** — "is this a single server? when I opened it it
   already had memory… is each person's memory separate?" It IS cookie-isolated, but the UI doesn't
   make that obvious; judges assumed a shared/seeded vault.
3. **Self-explanatory demo** — one judge hadn't read the description before reviewing; the demo has
   to communicate fast (the onboarding card helps — keep it).

## ✅ Actions from session 1 — all shipped 2026-10-21
- [x] **Impact**: the diary story is now one concrete paragraph in README and the Devpost
      description — day 3's wrong TTL claim, traced to the star it came from, fixed the same
      evening. "Not *it remembers*: a wrong belief becomes visible and deletable."
- [x] **Isolation visibility**: top-bar "🔒 your vault · Mxxxx" + the rail's own line.
- [x] **MCP prominence**: kept in the description's "It is yours" paragraph, which now sits
      above the implementation detail.
- [x] Onboarding pop-up + falling stars kept — the card only gained two buttons.
- [x] Transcript re-run: the second recording (the open Q&A) is transcribed in full in
      `docs/JUDGE-TRANSCRIPT-2-QA.txt`; nothing was truncated.


## Raw transcript (base.en, rough)
> Thank you. Let's see… would be the first thing that you're doing, looking at it — what does this
> tell you? I haven't read it before, to be honest, but I'd want to walk through it. I really like
> the delete-a-memory feature that the description mentioned, so I was interested in looking for that.
> Give me a "what do you remember" to see the memory baseline, or starting from scratch. Yeah, it
> says I already hold 18 memories in this vault — curious where the memories are… "How do you know
> this about me?" … That's cool. What I'm a little failing to understand: I can think of this as a
> memory I keep and delete — but beyond that, what's the use case? I'd love to hear if judges have
> other ideas. I love the story feeling, the star — looks cool, but impact is where I'm missing a
> little bit.
>
> [Second judge] I've actually been building something pretty similar — I have lots of emails, clients,
> calendar clients, live streams, conference talks. I've been trying to build a personal-AI system:
> "what deadlines are coming up?", a morning brief each morning of messages I might've missed. Looking
> at this, it's a much prettier version of what I built for myself. This is great. I love the dream
> aspect and the ideas, and the "what do you remember" — a lot of the value comes from here. I think a
> lot of value also comes from the integrations, though — if you can't hook into those other things
> it's hard to know exactly what's going on. Not that I'd expect a hackathon project to integrate all
> my calendars. But I like this one. The MCP server — that's what I understood — it transforms this
> from a personal assistant to a memory that other agents can use too, and that's a bigger story.
>
> [On the pop-up] If you refresh the page it looked like it wanted to give you a link to a video…
> there was a pop-up box that appeared… the falling star in the background looks really nice, and the
> pop-up that appeared initially so users can learn how to use your tool — that's always super helpful.
> Great implementation.
>
> [Single vs multi-user] I'm not sure if this is a single server — when I played it, it already had
> some memory. Are there sessions where different people have their own memory, or is it a single
> server? — I think it's pre-seated for the demo, but I'd love to hear if that's true.
>
> Thank you so much [Jin] for sharing your project. That was a fun one.

---

# Analysis (owner diagnosis + transcript evidence + how they score)

## The real problem: a cold reviewer has no entry point
The owner's read is correct and the transcript backs it: the judges **hadn't read the
description or tried the demo beforehand**, didn't know **where to start**, and nobody
narrated it live. Mnemos' value is a *conceptual mapping* (star = memory, chip = citation,
dimming = decay, ablation = impact) that is invisible until explained. Cold, it reads as
"pretty stars + a chat box." The confusion is the signature of an un-explained model:
- "I haven't read it before, to be honest."
- "What does this tell you?" … "curious where the memories are" … "How do you know this about me?"
- "Is this a single server? when I opened it it already had memory…" (they mistook the
  per-visitor seeded sandbox for a shared/global vault)
- "if you refresh the page it looked like it wanted to give you a link to a video"
  (the onboarding card was misread as a video prompt)

**Strategic point:** the real judging (Dec) is **asynchronous** — a judge clicks the link with
no one to explain it. So the demo must onboard a cold reviewer *itself*. That is now the #1
fix, above anything else.

## What the judges said they reward (from the 15-min Q&A) — and where we stand
1. **Elegance over a big stack.** "Don't want a super complex tech stack for simple
   implementations… maybe just use one thing but implemented really well." "Solving a clear
   goal is better than implementing multiple integrations." → We should frame as **one
   platform (Nebius Token Factory) used deeply**, every integration has one job serving the
   explainable-memory story — not lead with breadth.
2. **"30 seconds to wow."** Each piece must serve the main story or be cut. → Our wow is the
   **ablation** ("what if it forgot this?") and the **live citations**. Put them first.
3. **Publishing failures/limitations = RIGOR, not weakness.** "I love seeing the failures…
   it speaks higher to me than a super polished product that looks good on the surface." →
   This is a direct endorsement of what we already do (honest benchmark ranges, the
   "matched-but-not-cited" self-audit, the diary's honest failure note). **Make it
   front-and-center, not buried.**
4. **Model attribution + performance metrics, surfaced not cluttered** (their answer about
   terminal/technical UIs). → Our ⚙ Telemetry drawer (model/tokens/latency/USD) is exactly
   this — call it out.
5. **Accessibility matters but is easy to glaze over — make it obvious.** → We respect
   `prefers-reduced-motion`, have aria-labels and keyboard support; **state it in the
   submission** so judges notice.
6. **Last-10-days advice:** talk to real users, budget time for packaging/narrative, zero-in
   on scope (don't add features), make the main features stand out. → Do NOT add scope;
   sharpen the guided path + description.

## Prioritized fixes — status after the 2026-10-21 session
- [x] **P0 — a "Review in 60 seconds" guided tour**: shipped in `2cc1759`. `?review=1` (and a
      button on the first-run card) opens a five-step rail — recall → click a citation →
      ablate it → telemetry → your vault — each step stating what to look for before it is
      clicked. Verified on the live demo, 1920×1080, real models, no console errors.
- [x] **P1 — make the seeded-vs-private vault unmistakable**: a persistent
      "🔒 your vault · Mxxxx" tag now sits in the top bar with the isolation explanation in its
      tooltip, and the rail states it again in the reviewer's own words.
- [x] **P1 — surface rigour**: the About tab leads with "Known limits — published on purpose"
      (measured numbers, not adjectives), and the rail footers every step with links to the
      benchmark, FEEDBACK.md and the diary.
- [x] **P2 — call out accessibility**: README + Devpost now state the reduced-motion, keyboard,
      aria-live and colour-not-alone facts that were true but invisible.
- [x] **P2 — reframe around elegance/depth**: "one platform used deeply, not five used wide"
      replaces the breadth framing in README and the submission text.
- [x] **P0 — a short "How to evaluate Mnemos" block** at the top of the Devpost description:
      drafted in `DEVPOST.md` §5 and applied to the live submission.
- [x] **Found while verifying**: the citation instruction was not being followed often enough to
      demo (two runs, zero chips) and a cited memory was *also* listed as "used but not cited" —
      both fixed in `71e8b8e`, with a regression test. The live benchmark is being re-run because
      the prompt change moves the published numbers.


Raw transcript of the open Q&A: `docs/JUDGE-TRANSCRIPT-2-QA.txt`.
