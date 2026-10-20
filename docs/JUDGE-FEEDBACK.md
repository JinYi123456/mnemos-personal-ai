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

## 📋 Recommended actions (decided, not yet done — awaiting go-ahead)
- [ ] **Impact**: condense the real self-use story (`docs/DIARY.md`) into one concrete line in the
      Devpost description — "who uses it daily, for what, what it changed."
- [ ] **Isolation visibility**: surface "this is YOUR private, per-visitor vault (isolated, expiring)"
      in the top bar / onboarding / morning brief so judges can't mistake it for a shared server.
- [ ] **MCP prominence**: it landed well — consider one more line up top of the description.
- [ ] Keep the onboarding pop-up + falling stars (judges liked it).
- [ ] Re-run the transcript with `small.en` for a clean verbatim record (optional).

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
