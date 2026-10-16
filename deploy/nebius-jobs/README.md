# Nightly dream on Nebius Serverless Jobs — what is actually true

**Status: not shipped. Documented here so nobody has to rediscover the gap.**

The hackathon rules say a project must run on Token Factory **or** AI Cloud, and
that Serverless Endpoints/Jobs are encouraged *"though neither is required"*.
Mnemos satisfies the rule with runtime Token Factory calls on every turn, so we
did not spend money we do not have to run a Job.

## Why we did not fake it

Verified against [docs.nebius.com/serverless/pricing-quotas](https://docs.nebius.com/serverless/pricing-quotas):
Serverless AI has **no pricing of its own** — it bills under **Compute VM per-second
pricing** and counts against Compute quotas. The hackathon promo credits
(`NEBIUS-DEVPOST-GLOBAL26`, and the Builders Program grant) are **Token Factory
credits**, which cannot pay an invoice. So a Job needs AI Cloud billing enabled,
which is a card, which a "free-tier only" entrant cannot do.

An earlier draft of this repo shipped a `nebius-nightly-dream.yaml` with
`tasks:` / `restartPolicy:` and told you to run `nebius jobs run`. **None of that
is real** — we deleted it rather than submit an unverified config.

## The real commands (verified from the CLI reference)

```text
nebius ai job run [file.py] [-- args...]
```

* The script's whole directory is packaged — **limit ≤ 64 KiB gzip**.
* `--platform` (or `platform:` in `nebius.yaml`) is **required**.
* `--preset` (or `preset:` in `nebius.yaml`) is **required**.
* Exit codes: `0` job COMPLETED (or detached submission accepted), `1` job FAILED
  or unknown error. `--detach` exists, plus `nebius ai job get` / `logs`.
* Reference: [nebius ai job run](https://docs.nebius.com/cli/reference/ai/job/run)

Note the packaging limit and the Python-first entrypoint: Mnemos is Node. A real
Job would be a thin Python wrapper that POSTs to a scheduled trigger, or a
container via `nebius ai endpoint`, not `node src/nightly-job.js`.

## What we ship instead

`src/nightly-job.js` — runs one dream against a vault directory and exits, so any
cron on your own machine (or a CI scheduler) is the worker. `src/night.js` runs the
same thing at 03:30 local time inside the app, and catches up on boot if a night
was missed.

```bash
NEBIUS_API_KEY=... node src/nightly-job.js --vault ./vault
```
