# Mnemos retrieval & answer-quality benchmark

Dataset `mnemos-longmemeval-style-40` v1.0.0 · 59 memories in 9 sessions · 40 questions · 9 knowledge-update pairs · mode `mock` · k=6

Run at 2026-10-16T12:16:43.190Z (clock 2026-10-16T12:16:42.255Z) · embedder `mock-hash-bow-256` · answerer `mock-deterministic-reader`

> LongMemEval-style protocol (Wu et al., arXiv:2410.10813) on an in-house 40-question set. These numbers are **not** comparable with published LongMemEval scores. This run is the deterministic **mock** harness: it validates the pipeline and measures the retrieval arms; mock answers are a floor, not answer-quality results, and the term-overlap reader cannot do attribute-level abstention (its remaining abstention misses are the near-miss questions).

## Arm x metric

| Arm | n | hit@k | recall@k | MRR | first hit rank | answer acc | false abstain | abstain acc | abstain (clean) | abstain (near-miss) | hallucination | citation valid | gold cited | stale retrieved | stale answered | mean latency | mean in/out tok | USD / 100q |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lexical | 40 | 97.0% | 94.4% | 0.737 | 1.66 | 93.9% | 0.0% | 57.1% | 100.0% | 0.0% | 42.9% | 100.0% | 79.8% | 0.0% | 0.0% | 2.78ms | 185/55 | $0.0000 |
| vector | 40 | 75.8% | 66.4% | 0.612 | 1.56 | 60.6% | 9.1% | 57.1% | 100.0% | 0.0% | 42.9% | 100.0% | 60.3% | 11.1% | 11.1% | 1.18ms | 234/59 | $0.0000 |
| hybrid | 40 | 87.9% | 81.3% | 0.695 | 1.83 | 78.8% | 9.1% | 57.1% | 100.0% | 0.0% | 42.9% | 100.0% | 75.0% | 0.0% | 0.0% | 1.08ms | 214/57 | $0.0000 |
| hybrid_cites | 40 | 87.9% | 81.3% | 0.695 | 1.83 | 0.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | — | — | 0.0% | 0.0% | 1.13ms | 791/106 | $0.0000 |

Definitions: **hit@k** any gold memory in the top k · **recall@k** share of gold memories retrieved · **MRR** reciprocal rank of the first gold hit · **answer acc** substring oracle on answerable questions · **abstain acc** share of unanswerable questions the system declined · **hallucination** unanswerable questions answered anyway · **citation valid** every cited `[Mxxxx]` resolves to a memory that was actually recalled · **gold cited** share of gold memories the answer cited · **stale retrieved** knowledge-update questions where only the superseded memory was retrieved · **stale answered** answers that asserted the superseded value.

## Hit@k / answer accuracy by LongMemEval ability

| Ability | n | lexical (hit / answer) | vector (hit / answer) | hybrid (hit / answer) | hybrid_cites (hit / answer) |
| --- | --- | --- | --- | --- | --- |
| single-session-user | 9 | 88.9% / 88.9% | 77.8% / 77.8% | 88.9% / 88.9% | 88.9% / 0.0% |
| multi-session | 8 | 100.0% / 100.0% | 75.0% / 37.5% | 75.0% / 50.0% | 75.0% / 0.0% |
| temporal-reasoning | 7 | 100.0% / 85.7% | 85.7% / 71.4% | 100.0% / 85.7% | 100.0% / 0.0% |
| knowledge-update | 9 | 100.0% / 100.0% | 66.7% / 55.6% | 88.9% / 88.9% | 88.9% / 0.0% |
| abstention | 7 | 57.1% / 57.1% | 57.1% / 57.1% | 57.1% / 57.1% | 100.0% / 100.0% |

## Citation and cost detail

| Arm | citations emitted | hallucinated citations | mean prompt tok | mean completion tok | mean cached tok | USD total | model |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lexical | 78 | 0 | 185 | 55 | 0 | $0.0000 | mock-deterministic-reader |
| vector | 59 | 0 | 234 | 59 | 0 | $0.0000 | mock-deterministic-reader |
| hybrid | 65 | 0 | 214 | 57 | 0 | $0.0000 | mock-deterministic-reader |
| hybrid_cites | 0 | 0 | 791 | 106 | 0 | $0.0000 | mock-deterministic-reader |

Cost estimate basis: lowercased substring mustAll / mustAny / mustNot over the answer text; provider prices via LLM.costUSD. Mock mode spends nothing.

## Reproduce

```bash
node eval/build-vault.mjs           # regenerate eval/dataset.json (fails on any integrity problem)
node eval/run.mjs --mode mock --k 6 --out ..\..\AppData\Local\Temp\mnemos-eval-run-K1KlNU\mock-a.json
node eval/report.mjs ..\..\AppData\Local\Temp\mnemos-eval-run-K1KlNU\mock-a.json
npm test                            # hermetic: dataset integrity + mock arms + planted-error checks
```
