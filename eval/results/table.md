# Mnemos retrieval & answer-quality benchmark

Dataset `mnemos-longmemeval-style-40` v1.0.0 · 59 memories in 9 sessions · 40 questions · 9 knowledge-update pairs · mode `live` · k=6

Run at 2026-10-16T12:24:22.244Z (clock 2026-10-16T12:17:10.097Z) · embedder `live-provider-embeddings` · answerer `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`

> LongMemEval-style protocol (Wu et al., arXiv:2410.10813) on an in-house 40-question set. These numbers are **not** comparable with published LongMemEval scores. This run used the live provider, so answer-level and abstention metrics reflect real model output.

## Arm x metric

| Arm | n | hit@k | recall@k | MRR | first hit rank | answer acc | false abstain | abstain acc | abstain (clean) | abstain (near-miss) | hallucination | citation valid | gold cited | stale retrieved | stale answered | mean latency | mean in/out tok | USD / 100q |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lexical | 40 | 97.0% | 94.4% | 0.737 | 1.66 | 75.8% | 0.0% | 71.4% | 75.0% | 66.7% | 28.6% | 88.6% | 75.8% | 0.0% | 22.2% | 650ms | 226/49 | $0.0025 |
| vector | 40 | 100.0% | 94.4% | 0.909 | 1.24 | 78.8% | 0.0% | 57.1% | 50.0% | 66.7% | 42.9% | 91.7% | 79.3% | 0.0% | 44.4% | 498ms | 298/43 | $0.0028 |
| hybrid | 40 | 97.0% | 92.9% | 0.824 | 1.59 | 75.8% | 3.0% | 42.9% | 25.0% | 66.7% | 57.1% | 86.1% | 79.7% | 0.0% | 11.1% | 551ms | 299/48 | $0.0029 |
| hybrid_cites | 40 | 97.0% | 92.9% | 0.824 | 1.59 | 78.8% | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 35.0% | 34.3% | 0.0% | 11.1% | 2447ms | 74764/7733 | $0.0139 |

Definitions: **hit@k** any gold memory in the top k · **recall@k** share of gold memories retrieved · **MRR** reciprocal rank of the first gold hit · **answer acc** substring oracle on answerable questions · **abstain acc** share of unanswerable questions the system declined · **hallucination** unanswerable questions answered anyway · **citation valid** every cited `[Mxxxx]` resolves to a memory that was actually recalled · **gold cited** share of gold memories the answer cited · **stale retrieved** knowledge-update questions where only the superseded memory was retrieved · **stale answered** answers that asserted the superseded value.

## Hit@k / answer accuracy by LongMemEval ability

| Ability | n | lexical (hit / answer) | vector (hit / answer) | hybrid (hit / answer) | hybrid_cites (hit / answer) |
| --- | --- | --- | --- | --- | --- |
| single-session-user | 9 | 88.9% / 66.7% | 100.0% / 88.9% | 88.9% / 77.8% | 88.9% / 66.7% |
| multi-session | 8 | 100.0% / 75.0% | 100.0% / 62.5% | 100.0% / 75.0% | 100.0% / 87.5% |
| temporal-reasoning | 7 | 100.0% / 85.7% | 100.0% / 85.7% | 100.0% / 71.4% | 100.0% / 85.7% |
| knowledge-update | 9 | 100.0% / 77.8% | 100.0% / 77.8% | 100.0% / 77.8% | 100.0% / 77.8% |
| abstention | 7 | 71.4% / 71.4% | 57.1% / 57.1% | 42.9% / 42.9% | 0.0% / 0.0% |

## Citation and cost detail

| Arm | citations emitted | hallucinated citations | mean prompt tok | mean completion tok | mean cached tok | USD total | model |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lexical | 57 | 1 | 226 | 49 | 0 | $0.0010 | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B |
| vector | 59 | 0 | 298 | 43 | 0 | $0.0011 | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B |
| hybrid | 57 | 1 | 299 | 48 | 0 | $0.0012 | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B |
| hybrid_cites | 24 | 0 | 74764 | 7733 | 0 | $0.0056 | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B |

Cost estimate basis: lowercased substring mustAll / mustAny / mustNot over the answer text; provider prices via LLM.costUSD. Ledger: 389 calls, $0.0089.

## Reproduce

```bash
node eval/build-vault.mjs           # regenerate eval/dataset.json (fails on any integrity problem)
node eval/run.mjs --mode live --k 6 --out eval\results\live.json
node eval/report.mjs eval\results\live.json
npm test                            # hermetic: dataset integrity + mock arms + planted-error checks
```
