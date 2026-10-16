# Mnemos evaluation harness

A reproducible retrieval + answer-quality benchmark for Mnemos, organised along the
**LongMemEval ability taxonomy** — Wu et al., *LongMemEval: Benchmarking Chat Assistants on
Long-Term Interactive Memory*, **arXiv:2410.10813** (ICLR 2025).

It exists because almost nobody brings evidence to a memory-product hackathon. This does: one
command, one JSON, one table, one chart — deterministic and offline, or against the real model.

---

## 1. Run it

```bash
# 0. optional: rebuild the dataset (refuses to write if any integrity check fails)
node eval/build-vault.mjs

# 1. mock mode — offline, deterministic, zero spend, no API key needed
node eval/run.mjs --mode mock
node eval/run.mjs --mode mock --arms lexical,vector,hybrid,hybrid_cites --k 6
node eval/run.mjs --mode mock --verbose --answers     # per-question trace, with answers
node eval/run.mjs --mode mock --inject-errors          # harness self-check (see §5)

# 2. report — writes eval/results/table.md and eval/results/chart.html
node eval/report.mjs                                   # newest eval/results/*.json
node eval/report.mjs eval/results/live-arms.json

# 3. live mode — this costs real money; the dry run makes no request at all
node eval/run.mjs --mode live                          # plan + estimated spend, nothing called
node eval/run.mjs --mode live --yes --budget 1.50 \
  --out eval/results/live-arms.json
node eval/report.mjs eval/results/live-arms.json

# 4. hermetic checks (dataset, update pairs, abstention, mock arms end to end)
npm test
```

Each run writes `eval/results/<mode>-<utc-stamp>.json` (override with `--out`) containing the run
metadata, the per-arm summary, the per-arm × per-ability breakdown, and one row per
(arm × question) with retrieved ids, the answer text, the citations and the token/cost ledger.

Flags: `--mode mock|live` · `--arms a,b,c` · `--k <n>` (6) · `--out <path>` · `--limit <n>` ·
`--only <qid|ability>` · `--budget <usd>` (live, stops before the estimate is exceeded) ·
`--yes` (live, required to actually spend) · `--sleep <ms>` (live pacing, 800) · `--verbose` ·
`--answers` · `--inject-errors`.

## 2. Arms

| Arm | Retrieval | What it tells you |
| --- | --- | --- |
| `lexical` | `Store.recall(query, k)` — inverted index, light stemming, 21-day decay | the no-embedding baseline |
| `vector` | pure cosine over the stored vectors (harness-side ranker) | the no-lexical baseline; an ablation, the product has no pure-vector mode |
| `hybrid` | `Store.recall(query, k, queryVec)` — the shipped 0.45 lexical / 0.55 cosine blend with decay | what Mnemos actually runs |
| `hybrid_cites` | same retrieval, through `Brain.runTurn`: agent loop, tool protocol, `[Mxxxx]` citation extraction | the product as a judge sees it |

`lexical`, `hybrid` and `hybrid_cites` call the shipped code unchanged. `vector` reuses the same
stored vectors (`EMBED_DIMS = 256`, the same truncation/renormalisation as `Store.backfillVecs`) and
the shipped `cosine()`, without the lexical term and without the decay term.

## 3. Metrics

Per arm, over the whole question set:

- **hit@k** any gold memory in the top k (precision-style retrieval success) · **recall@k** share of
  gold memories retrieved · **MRR** and **first-hit rank** where the evidence landed
- **answer accuracy** against the substring oracle (§4) · **false abstention** answerable questions
  the system declined
- **abstain accuracy**, split by class: **clean** (nothing in the vault even partially matches) and
  **near-miss** (the entity is known, the requested attribute is not), and **hallucination rate**
  (unanswerable questions answered anyway)
- **citation validity** — every `[Mxxxx]` the answer *attempted* resolves to a memory that was
  actually recalled. Attempts are counted from the raw answer text, so a model that invents an id is
  caught even though `Brain.extractCites` silently drops it. Also **gold cited** and the count of
  hallucinated citations.
- **knowledge-update handling** — **stale retrieved** (only the superseded memory came back),
  **stale answered** (the answer asserted the superseded value), **pair correct** (new in, stale out)
- **latency** (mean, p95) · **prompt / completion / cached tokens** · **model name** ·
  **estimated USD** · **cost per 100 questions**

## 4. The dataset

`eval/dataset.json` — **59 memories, 9 sessions, 40 questions, 9 knowledge-update pairs** — is
emitted by `eval/build-vault.mjs`. Edit the generator, never the JSON. The narrative is one person's
life across ~14 months: a cognitive-science master's student and freelance UI designer who moves
Kraków → Wrocław, changes job, changes design tool and teaching slot, revises her coffee habit,
starts a relationship, keeps slipping a thesis deadline, and adopts a cat named **Vega** after the
star in Lyra.

Ability counts (one label per question, LongMemEval taxonomy):
`single-session-user` 9 · `multi-session` 8 · `temporal-reasoning` 7 · `knowledge-update` 9 ·
`abstention` 7 (4 clean, 3 near-miss).

Structural guarantees, asserted by `validateDataset()` and by `npm test`:

- every gold id exists in the vault; memory ids are the same `sha256(normalised text)` ids
  `Store.addMemory()` makes, so ids and gold cannot drift apart; no short-id collisions
- every knowledge-update pair keeps **both** sides with the new memory more recent, is covered by a
  `knowledge-update` question whose gold is `[new, superseded]`, and its stale marker occurs in
  **exactly one** memory — so "the answer still contains the old value" is a sound signal
- abstention questions have no gold and no positive oracle, **no single memory contains every
  informative term** of the query, and their `absent` phrases appear nowhere in the vault
- dates are day-offsets from an injected `now`. The committed JSON uses a fixed clock; the runner
  re-anchors the vault on the live clock so the 21-day decay half-life behaves the same whenever you
  run it
- the deterministic reader is replayed against the dataset during validation: each answer-bearing
  gold memory must be reachable from its own question, gold-only context must produce an
  oracle-passing answer, the reader's primary must be a gold memory (and the new one for updates),
  and no abstention item may be fully covered. A question that is only hard because of its phrasing
  cannot enter the set.

## 5. Honest scope — read before quoting a number

- **LongMemEval-style protocol, not LongMemEval.** No subset, no haystack format, no published
  question overlap: an in-house 40-question set that borrows the ability taxonomy from
  arXiv:2410.10813. The numbers are **not comparable** with the published benchmark. `table.md` and
  `chart.html` say this on their face — keep that line in any screenshot.
- **Answers are graded by lowercased substring oracles** (`mustAll` / `mustAny` / `mustNot`). They
  reward the right fact appearing and penalise the superseded value reappearing; they can miss a
  correct rephrasing and they cannot judge style. Every question carries a human-readable
  `goldAnswer`, so any row can be audited by a human — or by an LLM judge as a follow-up.
- **Mock answers are not answer-quality results.** `--mode mock` uses a hashed bag-of-words embedder
  and a scripted extractive reader that can only restate what retrieval put in the prompt. Its
  retrieval metrics are real (they exercise `Store.recall`), its answer accuracy is a floor, and by
  construction it fails the **near-miss abstention** class: a term-overlap reader has no
  attribute-level checking, so 0% of near-miss abstentions are declined (clean abstentions are 100%).
  That gap is exactly what the live arm measures. The hash embedder has no synonym space either, so
  `vector` / `hybrid` look weaker in mock than they will with a real embedding model.
- Live cost is an **estimate** from published per-million token rates (`LLM.costUSD`); unknown model
  ids are recorded with `cost_known: false` instead of being guessed. The live budget guard stops
  before an estimated call would exceed `--budget`, and the results file records `stopped_on_budget`.
- 40 questions × 4 arms = 160 runs. Small set, wide error bars: treat ±1 question as noise and quote
  deltas, not decimals.

## 6. Proving the harness itself

1. `npm test` — dataset integrity, the update/abstention guarantees above, gold-only oracle
   satisfiability, stale-answer detection, unresolvable-citation detection, all four mock arms
   end-to-end, and byte-for-byte agreement between two identical mock runs (latency aside).
2. `node eval/run.mjs --mode mock --inject-errors` — plants three known error classes on a
   deterministic cycle: a truncated answer missing its gold markers, a fabricated `[Mdeadbeef]`
   citation, and a confident answer to an unanswerable question. The test asserts citation validity
   drops, abstention accuracy drops, hallucination rises and answer accuracy does not rise. A metric
   that cannot go down when an error is inserted is not a metric.
3. `node eval/build-vault.mjs` exits non-zero and refuses to write `dataset.json` if any integrity
   check fails, so a broken dataset cannot be committed by accident.

## 7. Files

```
eval/build-vault.mjs   deterministic vault + question generator (source of truth)
eval/dataset.json      emitted dataset: memories, questions, gold ids, update pairs
eval/lib.mjs           vault materialisation, mock/live embedders, arms, scoring, aggregation
eval/run.mjs           CLI runner (mock | live, arms, k, budget guard)
eval/report.mjs        table.md + self-contained SVG chart.html (no CDN, no scripts)
eval/results/          run JSONs, table.md, chart.html  (generated output)
test/eval.test.js      hermetic tests for all of the above
```

Nothing outside `eval/` and `test/eval.test.js` is touched. `src/*` is imported, never modified: the
harness measures the app as shipped.

## 8. The command for the live arm

```bash
node eval/run.mjs --mode live --yes --budget 1.50 --out eval/results/live-arms.json
node eval/report.mjs eval/results/live-arms.json
```

Run the dry run first (`--mode live` without `--yes`) to see the plan and the estimated spend; it
makes no request.
