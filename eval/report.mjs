/**
 * Mnemos evaluation harness — report.
 *
 *   node eval/report.mjs                       # newest eval/results/*.json
 *   node eval/report.mjs eval/results/x.json   # a specific run
 *
 * Writes eval/results/table.md (arm x metric) and eval/results/chart.html, a
 * fully self-contained SVG page (no CDN, no scripts, no external fonts) that
 * compares hit@k, citation validity, error rates and mean cost per 100 questions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULTS_DIR, pct, num3 } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = RESULTS_DIR;

function newestResultsFile() {
  if (!fs.existsSync(resultsDir)) throw new Error(`no ${resultsDir} — run node eval/run.mjs --mode mock first`);
  const files = fs.readdirSync(resultsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(resultsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error('no results JSON yet — run node eval/run.mjs --mode mock');
  return path.join(resultsDir, files[0].f);
}

const argFile = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const inPath = argFile ? path.resolve(process.cwd(), argFile) : newestResultsFile();
const doc = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const arms = Object.keys(doc.summary.byArm);
if (!arms.length) throw new Error('results file has no arm summaries');

const esc = (/** @type {string} */ s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (/** @type {number|null} */ x) => (x === null || x === undefined ? '—' : `$${x.toFixed(4)}`);
const ms = (/** @type {number|null} */ x) => (
  x === null || x === undefined ? '—' : (x < 10 ? `${Math.round(x * 100) / 100}ms` : `${Math.round(x)}ms`)
);

/* --------------------------------------------------------------- table.md   */

const HEAD = [
  'Arm', 'n', 'hit@k', 'recall@k', 'MRR', 'first hit rank', 'answer acc', 'false abstain',
  'abstain acc', 'abstain (clean)', 'abstain (near-miss)', 'hallucination', 'citation valid',
  'gold cited', 'stale retrieved', 'stale answered', 'mean latency', 'mean in/out tok', 'USD / 100q',
];
const rowFor = (/** @type {string} */ arm) => {
  const s = doc.summary.byArm[arm];
  return [
    arm, s.n, pct(s.hit_at_k), pct(s.recall_at_k), num3(s.mrr),
    s.first_hit_rank === null ? '—' : s.first_hit_rank.toFixed(2),
    pct(s.answer_accuracy), pct(s.false_abstention), pct(s.abstain_accuracy),
    pct(s.abstain_clean), pct(s.abstain_near_miss), pct(s.hallucination_rate),
    pct(s.citation_valid), pct(s.gold_citation_recall),
    pct(s.update_stale_retrieved), pct(s.update_stale_answer),
    ms(s.latency_mean_ms),
    `${Math.round(s.prompt_tokens_mean || 0)}/${Math.round(s.completion_tokens_mean || 0)}`,
    money(s.cost_usd_per_100),
  ];
};

const abilityRows = [];
for (const ability of Object.keys(doc.meta.dataset.by_ability)) {
  const cells = [ability, doc.meta.dataset.by_ability[ability]];
  for (const arm of arms) {
    const s = doc.summary.byArmAbility?.[arm]?.[ability];
    cells.push(s ? `${pct(s.hit_at_k ?? s.abstain_accuracy)} / ${pct(s.answer_accuracy)}` : '— / —');
  }
  abilityRows.push(cells);
}

const md = [
  `# Mnemos retrieval & answer-quality benchmark`,
  '',
  `Dataset \`${doc.meta.dataset.name}\` v${doc.meta.dataset.version} · ${doc.meta.dataset.memories} memories in `
    + `${doc.meta.dataset.sessions} sessions · ${doc.meta.dataset.questions} questions · `
    + `${doc.meta.dataset.update_pairs} knowledge-update pairs · mode \`${doc.meta.mode}\` · k=${doc.meta.k}`,
  '',
  `Run at ${doc.meta.stamp} (clock ${doc.meta.clock}) · embedder \`${doc.meta.retrieval.embedder}\` · `
    + `answerer \`${doc.meta.answerer.model || doc.meta.answerer.kind}\``,
  '',
  '> LongMemEval-style protocol (Wu et al., arXiv:2410.10813) on an in-house 40-question set. '
    + 'These numbers are **not** comparable with published LongMemEval scores. '
    + (doc.meta.mode === 'mock'
      ? 'This run is the deterministic **mock** harness: it validates the pipeline and measures the retrieval arms; mock answers are a floor, not answer-quality results, and the term-overlap reader cannot do attribute-level abstention (its remaining abstention misses are the near-miss questions).'
      : 'This run used the live provider, so answer-level and abstention metrics reflect real model output.'),
  '',
  '## Arm x metric',
  '',
  `| ${HEAD.join(' | ')} |`,
  `| ${HEAD.map(() => '---').join(' | ')} |`,
  ...arms.map((a) => `| ${rowFor(a).join(' | ')} |`),
  '',
  'Definitions: **hit@k** any gold memory in the top k · **recall@k** share of gold memories retrieved · '
    + '**MRR** reciprocal rank of the first gold hit · **answer acc** substring oracle on answerable questions · '
    + '**abstain acc** share of unanswerable questions the system declined · **hallucination** unanswerable questions answered anyway · '
    + '**citation valid** every cited `[Mxxxx]` resolves to a memory that was actually recalled · '
    + '**gold cited** share of gold memories the answer cited · **stale retrieved** knowledge-update questions where only the superseded memory was retrieved · '
    + '**stale answered** answers that asserted the superseded value.',
  '',
  '## Hit@k / answer accuracy by LongMemEval ability',
  '',
  `| Ability | n | ${arms.map((a) => a + ' (hit / answer)').join(' | ')} |`,
  `| --- | --- | ${arms.map(() => '---').join(' | ')} |`,
  ...abilityRows.map((r) => `| ${r.join(' | ')} |`),
  '',
  '## Citation and cost detail',
  '',
  '| Arm | citations emitted | hallucinated citations | mean prompt tok | mean completion tok | mean cached tok | USD total | model |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...arms.map((a) => {
    const s = doc.summary.byArm[a];
    const rows = doc.rows.filter((r) => r.arm === a);
    const cites = rows.reduce((n, r) => n + r.cites_n, 0);
    const bad = rows.reduce((n, r) => n + r.cites_hallucinated, 0);
    return `| ${a} | ${cites} | ${bad} | ${Math.round(s.prompt_tokens_mean || 0)} | ${Math.round(s.completion_tokens_mean || 0)} | ${Math.round(s.cached_tokens_mean || 0)} | ${money(s.cost_usd_total)} | ${esc(s.model || '—')} |`;
  }),
  '',
  `Cost estimate basis: ${doc.meta.grading.oracle}; provider prices via LLM.costUSD. ${doc.meta.llm_spend ? `Ledger: ${doc.meta.llm_spend.calls} calls, $${doc.meta.llm_spend.usd.toFixed(4)}.` : 'Mock mode spends nothing.'}`,
  '',
  '## Reproduce',
  '',
  '```bash',
  'node eval/build-vault.mjs           # regenerate eval/dataset.json (fails on any integrity problem)',
  `node eval/run.mjs --mode ${doc.meta.mode} --k ${doc.meta.k} --out ${path.relative(path.resolve(here, '..'), inPath)}`,
  `node eval/report.mjs ${path.relative(path.resolve(here, '..'), inPath)}`,
  'npm test                            # hermetic: dataset integrity + mock arms + planted-error checks',
  '```',
  '',
].join('\n');

/* -------------------------------------------------------------- chart.html  */

const PALETTE = {
  bg0: '#030514', bg1: '#070b22', ink: '#e8ecff', dim: '#9aa3c7', faint: '#6b7399',
  gold: '#ffd9a0', violet: '#8f7bff', cyan: '#7fd7e8', rose: '#ff9db0',
};
const ARM_COLORS = [PALETTE.gold, PALETTE.rose, PALETTE.cyan, PALETTE.violet];

function barChart(/** @type {string} */ title, /** @type {string} */ sub, /** @type {Array<{label:string, value:number|null, color:string}>} */ bars, opts = {}) {
  const w = 320;
  const h = 190;
  const padL = 10;
  const padB = 46;
  const top = 34;
  const max = opts.max !== undefined ? opts.max : Math.max(1, ...bars.map((b) => (b.value || 0) * 1.15));
  const innerW = w - padL * 2;
  const bw = Math.min(58, innerW / Math.max(1, bars.length) - 14);
  const step = innerW / Math.max(1, bars.length);
  const parts = [`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">`];
  parts.push(`<text x="${padL}" y="16" class="t">${esc(title)}</text>`);
  parts.push(`<text x="${padL}" y="29" class="s">${esc(sub)}</text>`);
  parts.push(`<line x1="${padL}" y1="${h - padB}" x2="${w - padL}" y2="${h - padB}" stroke="${PALETTE.faint}" stroke-width="1"/>`);
  bars.forEach((b, i) => {
    const x = padL + step * i + (step - bw) / 2;
    const v = b.value === null || b.value === undefined ? 0 : b.value;
    const bh = Math.max(0, (v / (max || 1)) * (h - padB - top));
    const y = h - padB - bh;
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${b.color}" opacity="${v === 0 && (b.value === null || b.value === undefined) ? 0.25 : 0.92}"/>`);
    const label = b.value === null || b.value === undefined ? '—' : (opts.pct ? `${(v * 100).toFixed(1)}%` : opts.money ? `$${v.toFixed(4)}` : v.toFixed(1));
    parts.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="v">${esc(label)}</text>`);
    parts.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${h - padB + 16}" class="l">${esc(b.label)}</text>`);
    if (opts.sublabels && bars[i].sub) {
      parts.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${h - padB + 30}" class="s">${esc(bars[i].sub)}</text>`);
    }
  });
  parts.push('</svg>');
  return `<div class="card">${parts.join('')}</div>`;
}

const pick = (/** @type {(s:any)=>number|null} */ f) => arms.map((a, i) => ({
  label: a.replace('_', '\u2423'), value: f(doc.summary.byArm[a]), color: ARM_COLORS[i % ARM_COLORS.length],
  sub: doc.summary.byArm[a].n ? `n=${doc.summary.byArm[a].n}` : '',
}));

const headline = (() => {
  const best = [...arms].sort((a, b) => (doc.summary.byArm[b].hit_at_k || 0) - (doc.summary.byArm[a].hit_at_k || 0))[0];
  const worst = [...arms].sort((a, b) => (doc.summary.byArm[a].hit_at_k || 0) - (doc.summary.byArm[b].hit_at_k || 0))[0];
  const s = doc.summary.byArm[best];
  const w = doc.summary.byArm[worst];
  const stale = s.update_stale_retrieved === null ? null : s.update_stale_retrieved;
  return `${best.toUpperCase()} retrieves ${(s.hit_at_k * 100).toFixed(0)}% of gold evidence at k=${doc.meta.k} vs ${(w.hit_at_k * 100).toFixed(0)}% for ${worst}, `
    + `cites resolve ${pct(s.citation_valid)} of the time, and unanswerable questions are declined ${pct(s.abstain_accuracy)} — at ${money(s.cost_usd_per_100)} per 100 questions.`
    + (stale === null ? '' : ` Stale-value retrieval happens on ${pct(doc.summary.byArm[worst].update_stale_retrieved)} of update questions on ${worst}.`);
})();

const html = `<!doctype html>
<meta charset="utf-8">
<title>Mnemos — retrieval &amp; answer-quality benchmark</title>
<style>
  :root { --ink:${PALETTE.ink}; --dim:${PALETTE.dim}; --faint:${PALETTE.faint}; --line:${PALETTE.violet}33; }
  * { box-sizing: border-box; }
  body { margin:0; padding:26px 22px 34px; color:var(--ink); background:radial-gradient(120% 90% at 70% -10%, #10163a 0%, ${PALETTE.bg1} 44%, ${PALETTE.bg0} 100%); font-family:'Segoe UI','SF Pro Display',system-ui,-apple-system,sans-serif; }
  h1 { font-size:19px; margin:0 0 4px; letter-spacing:.02em; }
  .sub { color:var(--dim); font-size:12.5px; margin-bottom:6px; }
  .story { color:${PALETTE.gold}; font-size:14px; max-width:980px; margin:8px 0 20px; line-height:1.45; }
  .grid { display:flex; flex-wrap:wrap; gap:14px; }
  .card { background:rgba(10,14,34,.86); border:1px solid var(--line); border-radius:14px; padding:10px 12px 4px; }
  svg { width:320px; height:190px; display:block; }
  .t { fill:var(--ink); font-size:12.5px; font-weight:600; }
  .s { fill:var(--faint); font-size:9.5px; }
  .l { fill:var(--dim); font-size:10px; text-anchor:middle; }
  .v { fill:var(--ink); font-size:10.5px; text-anchor:middle; font-weight:600; }
  table { border-collapse:collapse; margin-top:20px; font-size:12.5px; }
  th, td { border-bottom:1px solid var(--line); padding:5px 9px; text-align:right; }
  th:first-child, td:first-child { text-align:left; }
  thead th { color:var(--dim); font-weight:600; }
  .note { color:var(--faint); font-size:11.5px; margin-top:16px; max-width:980px; line-height:1.5; }
  .badge { display:inline-block; margin-left:8px; padding:2px 8px; border-radius:999px; font-size:11px; background:${PALETTE.violet}22; color:var(--ink); border:1px solid var(--line); }
</style>
<h1>Mnemos — retrieval &amp; answer-quality benchmark<span class="badge">${esc(doc.meta.mode)} · k=${doc.meta.k}</span></h1>
<div class="sub">dataset ${esc(doc.meta.dataset?.name || doc.meta.dataset.name)} v${esc(doc.meta.dataset.version)} · ${doc.meta.dataset.memories} memories · ${doc.meta.dataset.questions} questions · ${doc.meta.dataset.update_pairs} update pairs · generated ${esc(doc.meta.stamp)}</div>
<div class="story">${esc(headline)}</div>
<div class="grid">
  ${barChart('hit@k — gold evidence retrieved', 'higher is better', pick((s) => s.hit_at_k), { pct: true, max: 1 })}
  ${barChart('answer accuracy — substring oracle', 'answerable questions only', pick((s) => s.answer_accuracy), { pct: true, max: 1 })}
  ${barChart('citation validity', 'every [Mxxxx] resolves', pick((s) => s.citation_valid), { pct: true, max: 1 })}
  ${barChart('stale value asserted', 'knowledge-update questions', arms.map((a, i) => ({ label: a.replace('_', '\u2423'), value: doc.summary.byArm[a].update_stale_answer, color: ARM_COLORS[i % ARM_COLORS.length] })), { pct: true, max: 1 })}
  ${barChart('mean cost / 100 questions', doc.meta.mode === 'mock' ? 'mock mode spends nothing — labels show mean latency' : 'estimated USD · labels show mean latency', arms.map((a, i) => ({
    label: a.replace('_', '\u2423'),
    value: doc.summary.byArm[a].cost_usd_per_100,
    color: ARM_COLORS[i % ARM_COLORS.length],
    sub: ms(doc.summary.byArm[a].latency_mean_ms),
  })), { money: true, sublabels: true, max: Math.max(0.0001, ...arms.map((a) => doc.summary.byArm[a].cost_usd_per_100 || 0)) * 1.2 })}
  ${barChart('errors — unanswerable answered &amp; stale asserted', 'lower is better', arms.map((a, i) => ({
    label: a.replace('_', '\u2423'),
    value: doc.summary.byArm[a].hallucination_rate,
    color: ARM_COLORS[i % ARM_COLORS.length],
    sub: `${pct(doc.summary.byArm[a].update_stale_answer)} stale`,
  })), { pct: true, max: 1, sublabels: true })}
</div>
<table>
  <thead><tr><th>Arm</th><th>hit@k</th><th>recall@k</th><th>MRR</th><th>answer</th><th>abstain</th><th>halluc.</th><th>cite ok</th><th>stale ans</th><th>latency</th><th>$/100q</th></tr></thead>
  <tbody>
  ${arms.map((a) => {
    const s = doc.summary.byArm[a];
    return `<tr><td>${esc(a)}</td><td>${pct(s.hit_at_k)}</td><td>${pct(s.recall_at_k)}</td><td>${num3(s.mrr)}</td><td>${pct(s.answer_accuracy)}</td><td>${pct(s.abstain_accuracy)}</td><td>${pct(s.hallucination_rate)}</td><td>${pct(s.citation_valid)}</td><td>${pct(s.update_stale_answer)}</td><td>${ms(s.latency_mean_ms)}</td><td>${money(s.cost_usd_per_100)}</td></tr>`;
  }).join('\n  ')}
  </tbody>
</table>
<div class="note">
  Protocol: LongMemEval-style ability taxonomy (Wu et al., <em>LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory</em>, arXiv:2410.10813) applied to an
  in-house ${doc.meta.dataset.questions}-question vault narrative. Scores are <strong>not</strong> comparable with published LongMemEval numbers, and answers are graded by
  lowercased substring oracles that can miss correct rephrasings. Lexical and hybrid retrieval run the shipped <code>Store.recall()</code> path unchanged;
  <code>vector</code> is a pure-cosine ablation over the same stored vectors; <code>hybrid_cites</code> runs the shipped <code>Brain.runTurn</code> agent loop.
  ${doc.meta.mode === 'mock' ? 'This run is the deterministic mock harness: retrieval metrics are real, mock answers are a plumbing floor and abstention accuracy is limited by the reader’s single-term relevance test.' : ''}
</div>
`;

fs.mkdirSync(resultsDir, { recursive: true });
const tablePath = path.join(resultsDir, 'table.md');
const chartPath = path.join(resultsDir, 'chart.html');
fs.writeFileSync(tablePath, md, 'utf8');
fs.writeFileSync(chartPath, html, 'utf8');

console.log(`read   ${path.relative(path.resolve(here, '..'), inPath)}`);
console.log(`wrote  ${path.relative(path.resolve(here, '..'), tablePath)}`);
console.log(`wrote  ${path.relative(path.resolve(here, '..'), chartPath)} (self-contained SVG, no external assets)`);
console.log('');
console.log(md.split('\n').slice(0, 24).join('\n'));
