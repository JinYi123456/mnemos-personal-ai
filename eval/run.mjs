/**
 * Mnemos evaluation harness — runner.
 *
 *   node eval/run.mjs --mode mock --arms lexical,vector,hybrid,hybrid_cites --k 6
 *   node eval/run.mjs --mode live --yes --budget 1.50          # the human runs this
 *
 * Each (arm x question) run is scored for retrieval (hit@k, recall@k, MRR,
 * first-hit rank), answer quality (substring oracle), citation behaviour (does
 * every [Mxxxx] resolve, was gold cited), knowledge-update handling (new value
 * vs superseded value), abstention, latency and token spend.
 *
 * Mock mode is offline and deterministic: retrieval is the shipped
 * `Store.recall()` code path, embeddings are a hashed bag of words, and answers
 * come from a scripted extractive reader that can only use memories retrieval
 * put in the prompt. Live mode imports the real Store/Brain/LLM, refuses to
 * spend without --yes, and stops before its spend estimate passes --budget.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { Store } from '../src/store.js';
import { Brain } from '../src/brain.js';
import { LLM, buildProviders } from '../src/llm.js';
import {
  ARMS, ARMS_WITH_EMBEDDINGS, DATASET_FILE, RESULTS_DIR, ROOT, MOCK_MODEL, MOCK_EMBEDDER,
  loadDataset, materialiseStore, makeEmbedder, recallFor, directMessages, estTokens,
  scoreQuestion, summarise, citeAttempts, MockLLM, mockAnswer,
} from './lib.mjs';

/* -------------------------------------------------------------------- CLI   */

const argv = process.argv.slice(2);
/** @type {Map<string, string|boolean>} */
const flags = new Map();
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) flags.set(key, true);
  else {
    flags.set(key, next);
    i += 1;
  }
}
const has = (/** @type {string} */ k) => flags.has(k) && flags.get(k) !== true;
const mode = String(flags.get('mode') || 'mock');
if (!['mock', 'live'].includes(mode)) {
  console.error(`--mode must be mock or live (got ${mode})`);
  process.exit(2);
}
const arms = String(flags.get('arms') || ARMS.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);
for (const a of arms) if (!ARMS.includes(a)) {
  console.error(`unknown arm ${a}; known: ${ARMS.join(', ')}`);
  process.exit(2);
}
const k = has('k') ? Number(flags.get('k')) : 6;
const budget = has('budget') ? Number(flags.get('budget')) : undefined;
const limit = has('limit') ? Number(flags.get('limit')) : undefined;
const only = has('only') ? String(flags.get('only')) : null;
const outFile = has('out') ? String(flags.get('out')) : null;
const injectErrors = flags.has('inject-errors');
const confirmed = flags.has('yes');
const verbose = flags.has('verbose');
const showAnswers = flags.has('answers');
const sleepMs = has('sleep') ? Number(flags.get('sleep')) : mode === 'live' ? 800 : 0;
if (!Number.isFinite(k) || k < 1) {
  console.error('--k must be a positive integer');
  process.exit(2);
}

const ds = loadDataset();
/** @type {any[]} */
let questions = ds.questions;
if (only) questions = questions.filter((q) => q.id === only || q.ability === only);
if (!questions.length) {
  console.error(`--only ${only} matched no questions`);
  process.exit(2);
}
const plan = arms.flatMap((arm) => questions.map((q) => ({ arm, q })));
const subset = Number.isFinite(limit) && limit > 0 ? plan.slice(0, limit) : plan;

/* -------------------------------------------------------------- live wiring */

/** @type {any} */
let llm = null;
let providers = [];
if (mode === 'live') {
  providers = buildProviders(ROOT);
  if (!providers.length) {
    console.error('live mode needs at least one provider key in .env — see .env.example');
    process.exit(2);
  }
  llm = new LLM(providers);
  const p = providers[0];
  const perChat = LLM.costUSD(p.model, 1600, 160).usd;
  const perEmbed = LLM.costUSD(p.embeddingModel || 'embedding', 60, 0).usd;
  const embedCalls = ds.memories.length + (arms.includes('hybrid_cites') ? subset.length : 0);
  const estimate = perChat * subset.length + perEmbed * embedCalls;
  console.log(`provider chain: ${providers.map((x) => `${x.id}/${x.model}`).join(', ')}`);
  console.log(`embedding model: ${p.embeddingModel || 'none (arms degrade to lexical)'}`);
  console.log(`plan: ${arms.join(', ')} x ${questions.length} questions = ${subset.length} runs`);
  console.log(`estimated spend: $${estimate.toFixed(3)}`);
  if (!confirmed) {
    console.log('\nDRY RUN — no request was sent and nothing was spent.');
    console.log('Rerun with --yes to execute, and --budget <usd> to cap spend.');
    process.exit(0);
  }
  if (!Number.isFinite(budget)) console.warn('no --budget given: defaulting to $2.00');
  try {
    const healed = await llm.syncCatalog();
    if (healed) console.log(`catalog: ${healed.catalogSize} models, chat=${healed.chat}, verified=${healed.verified}`);
  } catch {
    console.warn('catalog sync failed; continuing with configured model ids');
  }
}
const spendBudget = mode === 'live' ? (Number.isFinite(budget) ? budget : 2) : Number.POSITIVE_INFINITY;

/* --------------------------------------------------------------- workspace  */

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = outFile ? path.resolve(ROOT, outFile) : path.join(RESULTS_DIR, `${mode}-${stamp}.json`);
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-eval-'));

async function main() {
  const embedder = makeEmbedder(mode, { llm });
  const now = Date.now();
  const materialised = await materialiseStore(path.join(tmpBase, 'vault'), ds, { now, embedder });
  const vectors = materialised.vault.memories.filter((m) => Array.isArray(m.vec)).length;
  const degraded = vectors === 0 && arms.some((a) => ARMS_WITH_EMBEDDINGS.includes(a));
  if (degraded) console.warn('embeddings unavailable: vector/hybrid arms fall back to their lexical path');
  const pristine = JSON.stringify(materialised.vault);

  /** @type {any[]} */
  const rows = [];
  let spent = 0;
  let stopped = false;
  let lastPrompt = 1600;
  let lastCompletion = 160;

  for (const { arm, q } of subset) {
    if (stopped) break;
    if (mode === 'live') {
      const guess = LLM.costUSD(llm.active.model, lastPrompt + 1500, lastCompletion).usd;
      if (spent + guess > spendBudget) {
        stopped = true;
        console.warn(`budget guard: stopped after $${spent.toFixed(4)} of $${spendBudget.toFixed(2)} (next call ~$${guess.toFixed(4)})`);
        break;
      }
    }

    // a fresh copy per run: reinforce(), lazy embedding and the product's own
    // memory extraction must not leak between questions or arms
    const store = new Store(path.join(tmpBase, 'scratch'));
    store.vault = JSON.parse(pristine);
    store.reindex();

    const queryVec = ARMS_WITH_EMBEDDINGS.includes(arm) && vectors
      ? (await embedder.embed([q.query]))[0] || null
      : null;

    /** @type {any} */
    const rec = { arm, id: q.id, retrieved: [], cites: [], answer: null, primary: null };
    let usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
    let costUsd = 0;
    let costKnown = mode === 'mock';
    let model = mode === 'live' ? llm.active.model : MOCK_MODEL;
    const t0 = Date.now();

    try {
      if (arm === 'hybrid_cites') {
        // the product as shipped: hybrid recall + tool loop + citation extraction
        const agent = mode === 'live' ? llm : new MockLLM({ injectErrors, errIdx: rows.length % 4 });
        const brain = new Brain(store, agent, '', '');
        const before = mode === 'live' ? llm.spend.usd : 0;
        const r = await brain.runTurn({ text: q.query });
        rec.answer = r.reply;
        rec.cites = (r.cites || []).map((c) => c.id);
        rec.retrieved = r.recalled || [];
        rec.primary = (r.recalled || [])[0] || null;
        const spend = agent.spend || { promptTokens: 0, completionTokens: 0 };
        usage = {
          promptTokens: spend.promptTokens || 0,
          completionTokens: spend.completionTokens || 0,
          cachedTokens: spend.cachedTokens || 0,
        };
        if (mode === 'live') {
          costUsd = llm.spend.usd - before;
          costKnown = llm.spend.usd > 0;
          lastPrompt = Math.round((usage.promptTokens || lastPrompt) / 3);
          lastCompletion = Math.round((usage.completionTokens || lastCompletion) / 3);
        }
      } else {
        const recalled = recallFor(store, arm, q.query, queryVec, k);
        rec.retrieved = recalled.map((m) => m.id.slice(0, 8));
        rec.primary = recalled[0] ? recalled[0].id.slice(0, 8) : null;
        store.reinforce(recalled.map((m) => m.id));
        const messages = directMessages(recalled, q.query, now);
        if (mode === 'live') {
          const before = llm.spend.usd;
          const r = await llm.chat({ messages, maxTokens: 700 });
          rec.answer = r.text;
          rec.cites = Brain.extractCites(r.text, recalled).map((c) => c.id);
          model = r.model || model;
          usage = { promptTokens: r.usage.promptTokens, completionTokens: r.usage.completionTokens, cachedTokens: r.usage.cachedTokens };
          costUsd = llm.spend.usd - before;
          costKnown = r.cost.known;
          lastPrompt = usage.promptTokens || lastPrompt;
          lastCompletion = usage.completionTokens || lastCompletion;
        } else {
          const a = mockAnswer({ messages }, { injectErrors, errIdx: rows.length % 4 });
          rec.answer = a.text;
          rec.cites = a.cited;
          rec.primary = a.primary;
          const pt = estTokens(messages);
          usage = { promptTokens: pt, completionTokens: Math.round(40 + pt * 0.08), cachedTokens: 0 };
        }
      }
    } catch (err) {
      rec.error = String((err && err.message) || err);
      rec.answer = null;
    }
    const ms = Date.now() - t0;
    spent += costUsd;

    const row = scoreQuestion(q, {
      arm,
      retrieved: rec.retrieved,
      answer: rec.answer,
      cites: rec.cites,
      attempts: citeAttempts(rec.answer),
      recalled: rec.retrieved,
      primary: rec.primary,
      mode,
      ms,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedTokens: usage.cachedTokens,
      costUsd,
      costKnown,
      model,
      error: rec.error,
    });
    row.query_vec = !!queryVec;
    row.recall_degraded = ARMS_WITH_EMBEDDINGS.includes(arm) && !queryVec;
    rows.push(row);

    if (verbose) {
      console.log(
        `${arm.padEnd(12)} ${q.id} ${String(q.ability).padEnd(19)}`
        + ` hit=${row.hit_at_k === null ? '-' : row.hit_at_k ? 'Y' : 'n'}`
        + ` ok=${row.answer_correct ? 'Y' : 'n'} abst=${row.abstained ? 'Y' : 'n'}`
        + ` cite=${row.cites.join(',') || '-'}`
        + `${row.citation_valid ? '' : ' BAD-CITE'}${row.error ? ` ERR ${row.error.slice(0, 70)}` : ''}`,
      );
      if (showAnswers) console.log(`   ${String(row.answer || '').slice(0, 320)}`);
    }
    if (rows.length % 20 === 0) {
      console.log(`  ${rows.length}/${subset.length} runs${mode === 'live' ? `  spent $${spent.toFixed(4)}` : ''}`);
    }
    if (sleepMs) await new Promise((r) => setTimeout(r, sleepMs));
  }

  const summary = summarise(rows);
  const doc = {
    meta: {
      kind: 'mnemos-eval',
      harness: '1',
      stamp: new Date().toISOString(),
      mode,
      k,
      arms,
      budget_usd: mode === 'live' ? spendBudget : null,
      spent_usd: Number(spent.toFixed(6)),
      stopped_on_budget: stopped,
      injected_errors: injectErrors,
      node: process.version,
      clock: new Date(now).toISOString(),
      dataset: {
        name: ds.meta.name,
        version: ds.meta.version,
        questions: questions.length,
        memories: ds.memories.length,
        sessions: ds.meta.counts.sessions,
        update_pairs: ds.updates.length,
        by_ability: ds.meta.counts.byAbility,
        protocol: ds.meta.protocol,
      },
      retrieval: {
        embedder: embedder.name,
        embedding_model: mode === 'live' ? providers[0].embeddingModel || null : MOCK_EMBEDDER,
        vectors_stored: vectors,
        dims: 256,
        degraded_to_lexical: degraded,
        note: 'lexical and hybrid run Store.recall verbatim; hybrid_cites runs Brain.runTurn verbatim; vector is a harness-side pure-cosine ranker over the same stored vectors',
      },
      answerer: mode === 'live'
        ? { kind: 'Brain.runTurn + LLM.chat', provider: llm.active.id, model: llm.active.model }
        : {
            kind: 'deterministic extractive reader',
            model: MOCK_MODEL,
            note: 'mock answers validate the pipeline and measure retrieval coverage; they are not answer-quality results',
          },
      grading: {
        oracle: 'lowercased substring mustAll / mustAny / mustNot over the answer text',
        abstain: 'regular expression over I-do-not-remember phrasings',
        citations: 'every cited short id must appear in the recalled set',
        updates: 'new value must be retrieved and the superseded value must stay out',
        limitation: 'substring oracles can miss correct rephrasings — see eval/README.md before quoting',
      },
      llm_spend: mode === 'live' ? llm.spend : null,
    },
    summary,
    rows,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  console.log(`\nwrote ${path.relative(ROOT, outPath)}`);
  console.log('arm           hit@k  recall   mrr   answer  staleR  staleA  citeOK  abstain  $/100');
  for (const arm of arms) {
    const s = summary.byArm[arm];
    if (!s) continue;
    const f = (/** @type {number|null} */ x) => (x === null ? '    —  ' : `${(x * 100).toFixed(1)}%`.padStart(7));
    console.log(
      arm.padEnd(14)
      + f(s.hit_at_k) + f(s.recall_at_k) + String(s.mrr === null ? '—' : s.mrr.toFixed(3)).padStart(8)
      + f(s.answer_accuracy) + f(s.update_stale_retrieved) + f(s.update_stale_answer)
      + f(s.citation_valid) + f(s.abstain_accuracy)
      + (s.cost_usd_per_100 === null ? '—' : `$${s.cost_usd_per_100.toFixed(4)}`).padStart(10),
    );
  }
  if (stopped) console.log('\nstopped early by the live budget guard; results are partial.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => {
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch {
    /* windows can hold the handle briefly */
  }
});
