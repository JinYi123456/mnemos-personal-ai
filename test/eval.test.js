/**
 * Hermetic tests for the evaluation harness (no network, no spend).
 *
 * Covers: dataset integrity, committed JSON reproducibility, the gold/update/
 * abstention guarantees the dataset claims, that the vault materialises into the
 * shipped Store, that all four mock arms run end-to-end and compute metrics, that
 * the metrics react to planted errors, and that two identical mock runs agree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.js';
import { buildDataset, validateDataset, memoryIdFor } from '../eval/build-vault.mjs';
import {
  loadDataset, materialiseStore, hashEmbed, mockAnswer, scoreQuestion, ABSTAIN_RE, citeAttempts,
} from '../eval/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EVAL = path.join(ROOT, 'eval');
const node = (/** @type {string[]} */ args) => execFileSync(process.execPath, args, {
  cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'],
});

/* ------------------------------------------------------------ dataset       */

test('eval dataset: generator emits a self-consistent LongMemEval-style set', () => {
  const ds = buildDataset();
  const errs = validateDataset(ds);
  assert.deepEqual(errs, [], `dataset integrity: ${errs.join('; ')}`);

  const ids = new Set(ds.memories.map((/** @type {any} */ m) => m.id));
  assert.equal(ds.questions.length, 40);
  assert.ok(ds.memories.length >= 40, 'a vault big enough to be a real distractor set');

  for (const q of ds.questions) {
    for (const g of q.gold) assert.ok(ids.has(g), `${q.id}: gold ${g.slice(0, 8)} exists in the vault`);
    if (q.answerable) {
      assert.ok(q.gold.length >= 1, `${q.id} has gold evidence`);
      assert.ok(q.goldAnswer && q.goldAnswer.length > 3, `${q.id} documents its expected answer`);
    } else {
      assert.equal(q.gold.length, 0, `${q.id}: abstention question carries no gold`);
      assert.deepEqual(q.mustAll, [], `${q.id}: abstention question has no positive oracle`);
    }
  }

  // taxonomy coverage, honestly counted
  const counts = ds.meta.counts.byAbility;
  assert.ok(counts['single-session-user'] >= 6, 'single-session-user');
  assert.ok(counts['multi-session'] >= 6, 'multi-session');
  assert.ok(counts['temporal-reasoning'] >= 5, 'temporal-reasoning');
  assert.ok(counts['knowledge-update'] >= 6, 'knowledge-update');
  assert.ok(counts['abstention'] >= 6, 'abstention');

  // ids really are the Store's own ids
  for (const m of ds.memories) assert.equal(m.id, memoryIdFor(m.text), `stable id for ${m.ref}`);
});

test('eval dataset: every knowledge-update pair keeps both sides, in order', () => {
  const ds = buildDataset();
  const byRef = new Map(ds.memories.map((/** @type {any} */ m) => [m.ref, m]));
  assert.ok(ds.updates.length >= 6, 'at least six update pairs');
  for (const u of ds.updates) {
    const oldM = byRef.get(u.oldRef);
    const newM = byRef.get(u.newRef);
    assert.ok(oldM && newM, `update ${u.topic}: both memories exist`);
    assert.ok(newM.day < oldM.day, `update ${u.topic}: the new memory is more recent`);
    assert.ok(newM.created > oldM.created, `update ${u.topic}: created timestamps agree`);
    const q = ds.questions.find((/** @type {any} */ x) => x.update === u.topic);
    assert.ok(q, `update ${u.topic}: covered by a question`);
    assert.equal(q.ability, 'knowledge-update');
    assert.equal(q.gold[0], u.newId, `${q.id}: gold[0] is the new value`);
    assert.ok(q.gold.includes(u.oldId), `${q.id}: the superseded memory stays listed as evidence`);
    for (const needle of q.mustAll) {
      assert.ok(!oldM.text.toLowerCase().includes(needle), `${q.id}: "${needle}" is not in the stale memory`);
      assert.ok(
        newM.text.toLowerCase().includes(needle) || needle === String(newM.day),
        `${q.id}: "${needle}" is in the new memory`,
      );
    }
    for (const stale of u.stale) {
      const owners = ds.memories.filter((/** @type {any} */ m) => m.text.toLowerCase().includes(stale));
      assert.equal(owners.length, 1, `stale marker "${stale}" is unique to ${u.oldRef}`);
      assert.equal(owners[0].ref, u.oldRef);
    }
  }
});

test('eval dataset: abstention questions are genuinely outside the vault', () => {
  const ds = buildDataset();
  const hay = ds.memories.map((/** @type {any} */ m) => m.text.toLowerCase());
  const ab = ds.questions.filter((/** @type {any} */ q) => !q.answerable);
  assert.equal(ab.length, 7);
  assert.ok(ab.filter((/** @type {any} */ q) => q.abstainClass === 'clean').length >= 3, 'some have zero lexical support');
  assert.ok(ab.filter((/** @type {any} */ q) => q.abstainClass === 'near-miss').length >= 3, 'some are entity-known/attribute-missing');
  for (const q of ab) {
    for (const needle of q.absent) {
      assert.ok(!hay.some((/** @type {any} */ t) => t.includes(needle)), `${q.id}: absent phrase "${needle}" is nowhere in the vault`);
    }
    for (const m of ds.memories) {
      const all = q.informativeTerms.every((/** @type {any} */ t) => m.tokens.includes(t));
      assert.ok(!all, `${q.id}: no single memory covers every informative term`);
    }
  }
});

test('eval dataset: committed dataset.json is exactly what the generator emits', () => {
  const onDisk = JSON.parse(fs.readFileSync(path.join(EVAL, 'dataset.json'), 'utf8'));
  assert.deepEqual(onDisk, buildDataset(), 'regenerating the dataset changes nothing');
});

test('eval dataset: the vault materialises into the shipped Store with every id', async () => {
  const ds = loadDataset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-eval-store-'));
  const store = await materialiseStore(dir, ds, {
    now: Date.now(),
    embedder: { embed: async (/** @type {string[]} */ t) => hashEmbed(t) },
  });
  assert.equal(store.vault.memories.length, ds.memories.length);
  const ids = new Set(store.vault.memories.map((/** @type {any} */ m) => m.id));
  for (const m of ds.memories) assert.ok(ids.has(m.id), `${m.ref} present`);
  assert.ok(store.vault.memories.every((/** @type {any} */ m) => Array.isArray(m.vec) && m.vec.length === 256), 'vectors backfilled at EMBED_DIMS');

  const q = ds.questions.find((/** @type {any} */ x) => x.id === 'q27');
  const hits = store.recall(q.query, 6, hashEmbed([q.query])[0]);
  assert.ok(hits.length > 0 && hits.every((/** @type {any} */ h) => ids.has(h.id)), 'hybrid recall works on the built vault');
  assert.ok(
    hits.some((/** @type {any} */ h) => q.goldShort.includes(h.id.slice(0, 8))),
    'the new value is inside the recalled set for a knowledge-update query',
  );
});

/* ------------------------------------------------------------ scoring       */

test('eval metrics: a correct answer scores; stale answers, fake citations and confabulations do not', () => {
  const ds = buildDataset();
  const byId = new Map(ds.memories.map((/** @type {any} */ m) => [m.id, m]));
  const ku = ds.questions.find((/** @type {any} */ q) => q.ability === 'knowledge-update');
  const newM = byId.get(ku.gold[0]);
  const oldM = byId.get(ku.supersededId);

  const good = scoreQuestion(ku, {
    arm: 'unit', retrieved: [newM.short], answer: `As of now: ${newM.text} [M${newM.short}]`,
    cites: [newM.short], attempts: [newM.short], recalled: [newM.short], mode: 'mock', primary: newM.short,
  });
  assert.equal(good.answer_correct, true);
  assert.equal(good.citation_valid, true);
  assert.equal(good.hit_at_k, true);
  assert.equal(good.update_pair_correct, true);
  assert.equal(good.update_stale_answer, false);

  const stale = scoreQuestion(ku, {
    arm: 'unit', retrieved: [oldM.short], answer: `As of now: ${oldM.text} [M${oldM.short}]`,
    cites: [oldM.short], attempts: [oldM.short], recalled: [oldM.short], mode: 'mock', primary: oldM.short,
  });
  assert.equal(stale.answer_correct, false, 'the superseded value is wrong');
  assert.equal(stale.update_stale_retrieved, true);
  assert.equal(stale.update_stale_answer, true);

  const phantom = scoreQuestion(ku, {
    arm: 'unit', retrieved: [newM.short], answer: `${newM.text} [M${newM.short}] also [Mdeadbeef]`,
    cites: [newM.short], attempts: citeAttempts(`${newM.text} [M${newM.short}] also [Mdeadbeef]`),
    recalled: [newM.short], mode: 'mock', primary: newM.short,
  });
  assert.equal(phantom.citation_valid, false, 'an unresolvable citation is caught');
  assert.equal(phantom.cites_hallucinated, 1);

  const ab = ds.questions.find((/** @type {any} */ q) => !q.answerable);
  const declined = scoreQuestion(ab, {
    arm: 'unit', retrieved: [], answer: "I don't remember — nothing in my vault covers that.",
    cites: [], attempts: [], recalled: [], mode: 'mock',
  });
  assert.equal(declined.abstained, true);
  assert.equal(declined.answer_correct, true);
  assert.equal(declined.hallucination, false);
  const confab = scoreQuestion(ab, {
    arm: 'unit', retrieved: [], answer: 'You drive a silver estate car.', cites: [], attempts: [], recalled: [], mode: 'mock',
  });
  assert.equal(confab.hallucination, true);
  assert.equal(confab.answer_correct, false);
  assert.ok(ABSTAIN_RE.test("I don't remember that"), 'the abstention pattern matches plain phrasing');
});

test('eval mock reader: uses only what retrieval gave it, and plants detectable errors on request', () => {
  const ds = buildDataset();
  const q = ds.questions.find((/** @type {any} */ x) => x.id === 'q02');
  const gold = q.gold.map((/** @type {any} */ i) => ds.memories.find((/** @type {any} */ m) => m.id === i));
  const block = gold.map((/** @type {any} */ m) => `[M${m.short}] ${m.text} (${m.day}d old)`).join('\n');
  const messages = [{ role: 'user', content: `MEMORY RECALL (auto):\n${block}\n\nQuestion: ${q.query}` }];

  const clean = mockAnswer({ messages });
  assert.equal(clean.abstained, false);
  assert.equal(clean.primary, gold[0].short);
  const cleanScored = scoreQuestion(q, {
    arm: 'unit', retrieved: gold.map((/** @type {any} */ m) => m.short), answer: clean.text, cites: clean.cited,
    attempts: clean.cited, recalled: gold.map((/** @type {any} */ m) => m.short), mode: 'mock', primary: clean.primary,
  });
  assert.equal(cleanScored.answer_correct, true);
  assert.equal(cleanScored.citation_valid, true);

  const empty = mockAnswer({
    messages: [{ role: 'user', content: 'MEMORY RECALL (auto):\n(no relevant memories found)\n\nQuestion: What is my blood type?' }],
  });
  assert.equal(empty.abstained, true, 'no recalled lines -> no invented answer');

  const badCite = mockAnswer({ messages }, { injectErrors: true, errIdx: 1 });
  assert.match(badCite.text, /\[Mdeadbeef\]/, 'planted an unresolvable citation');
  const attempts = citeAttempts(badCite.text);
  const scoredBad = scoreQuestion(q, {
    arm: 'unit', retrieved: gold.map((/** @type {any} */ m) => m.short), answer: badCite.text, cites: clean.cited,
    attempts, recalled: gold.map((/** @type {any} */ m) => m.short), mode: 'mock', primary: clean.primary,
  });
  assert.equal(scoredBad.citation_valid, false, 'the metric reacts to a planted citation error');
  assert.ok(scoredBad.cites_hallucinated >= 1);

  const abq = ds.questions.find((/** @type {any} */ x) => x.id === 'q34');
  const abBlock = gold.map((/** @type {any} */ m) => `[M${m.short}] ${m.text} (10d old)`).join('\n');
  const confabulated = mockAnswer(
    { messages: [{ role: 'user', content: `MEMORY RECALL (auto):\n${abBlock}\n\nQuestion: ${abq.query}` }] },
    { injectErrors: true, errIdx: 2 },
  );
  assert.equal(confabulated.abstained, false, 'planted a refusal to abstain');
  assert.equal(scoreQuestion(abq, {
    arm: 'unit', retrieved: gold.map((/** @type {any} */ m) => m.short), answer: confabulated.text, cites: [],
    attempts: citeAttempts(confabulated.text), recalled: gold.map((/** @type {any} */ m) => m.short), mode: 'mock',
  }).hallucination, true, 'the hallucination metric reacts');
});

/* ------------------------------------------------------------ CLI runs      */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-eval-run-'));
const runA = path.join(tmp, 'mock-a.json');
const runB = path.join(tmp, 'mock-b.json');
const runErr = path.join(tmp, 'mock-err.json');

const dropLatency = (/** @type {any} */ x) => {
  if (!x || typeof x !== 'object') return x;
  for (const key of ['latency_ms', 'latency_mean_ms', 'latency_p95_ms']) delete x[key];
  for (const key of Object.keys(x)) dropLatency(x[key]);
  return x;
};
const normalised = (/** @type {any} */ doc) => {
  const s = dropLatency(JSON.parse(JSON.stringify(doc)));
  delete s.meta.stamp;
  delete s.meta.clock;
  return s;
};

test('eval cli: mock arms run end to end and metrics compute', () => {
  const stdout = node(['eval/run.mjs', '--mode', 'mock', '--out', runA]);
  assert.ok(fs.existsSync(runA), 'results JSON written');
  const doc = JSON.parse(fs.readFileSync(runA, 'utf8'));
  assert.equal(doc.meta.mode, 'mock');
  assert.equal(doc.rows.length, 4 * doc.meta.dataset.questions, 'every arm x question ran');

  for (const arm of ['lexical', 'vector', 'hybrid', 'hybrid_cites']) {
    const s = doc.summary.byArm[arm];
    assert.ok(s, `${arm} summarised`);
    assert.equal(s.n, doc.meta.dataset.questions, `${arm} scored every question`);
    for (const key of [
      'hit_at_k', 'recall_at_k', 'mrr', 'answer_accuracy', 'abstain_accuracy', 'abstain_clean',
      'abstain_near_miss', 'citation_valid', 'update_stale_retrieved', 'update_stale_answer',
      'latency_mean_ms', 'cost_usd_per_100',
    ]) {
      assert.ok(key in s, `${arm}.${key} computed`);
      if (key !== 'cost_usd_per_100' && key !== 'latency_mean_ms') {
        assert.ok(s[key] === null || (s[key] >= 0 && s[key] <= 1), `${arm}.${key} within a rate range (${s[key]})`);
      }
    }
    assert.ok(s.hit_at_k > 0.5, `${arm} hit@k beats chance on a 59-memory vault (got ${s.hit_at_k})`);
    assert.ok(s.recall_at_k <= s.hit_at_k + 1e-9, `${arm} recall@k <= hit@k`);
    // With a relevance floor an arm can legitimately emit no citations at all
    // (nothing was relevant), so null is a pass, not a failure.
    assert.ok(s.citation_valid === null || s.citation_valid === 1,
      `${arm}: every mock citation resolves, or none were emitted (got ${s.citation_valid})`);
    assert.equal(s.cost_usd_per_100, 0, 'mock mode spends nothing');
    assert.equal(s.abstain_clean, 1, `${arm}: every zero-overlap abstention is declined`);
    // Before the relevance floor, near-miss abstentions were always the hard class
    // (< 1). With a floor, an arm can now decline them all — which is a better
    // result, not a broken metric — so assert the range and let the table show it.
    assert.ok(s.abstain_near_miss >= 0 && s.abstain_near_miss <= 1,
      `${arm}: near-miss abstention rate is a rate (got ${s.abstain_near_miss})`);
    assert.ok(doc.summary.byArmAbility[arm]['knowledge-update'].n >= 6, `${arm}: knowledge-update rows summarised`);
    assert.ok(s.prompt_tokens_mean > 0 && s.completion_tokens_mean > 0, `${arm} token accounting ran`);
  }
  // the shipped agent loop is exercised, not a stub: hybrid_cites pays the full prompt
  assert.ok(doc.summary.byArm.hybrid_cites.prompt_tokens_mean > doc.summary.byArm.hybrid.prompt_tokens_mean);
  assert.match(stdout, /hit@k/);
});

test('eval cli: two identical mock runs agree (deterministic harness)', () => {
  node(['eval/run.mjs', '--mode', 'mock', '--out', runB]);
  const a = normalised(JSON.parse(fs.readFileSync(runA, 'utf8')));
  const b = normalised(JSON.parse(fs.readFileSync(runB, 'utf8')));
  assert.deepEqual(a, b, 'same dataset + same mode => same metrics');
});

test('eval cli: planted errors move the metrics', () => {
  node(['eval/run.mjs', '--mode', 'mock', '--inject-errors', '--out', runErr]);
  const clean = JSON.parse(fs.readFileSync(runA, 'utf8'));
  const dirty = JSON.parse(fs.readFileSync(runErr, 'utf8'));
  for (const arm of ['lexical', 'vector', 'hybrid']) {
    assert.ok(
      dirty.summary.byArm[arm].citation_valid < clean.summary.byArm[arm].citation_valid,
      `${arm}: citation validity drops when a fake [Mxxxx] is planted`,
    );
    assert.ok(
      dirty.summary.byArm[arm].abstain_clean < clean.summary.byArm[arm].abstain_clean,
      `${arm}: abstention accuracy drops when refusals are sabotaged`,
    );
    assert.ok(dirty.summary.byArm[arm].hallucination_rate > clean.summary.byArm[arm].hallucination_rate);
    assert.ok(dirty.summary.byArm[arm].answer_accuracy <= clean.summary.byArm[arm].answer_accuracy);
  }
});

test('eval cli: report writes the markdown table and a self-contained SVG chart', () => {
  node(['eval/report.mjs', runA]);
  const dir = path.join(EVAL, 'results');
  const table = fs.readFileSync(path.join(dir, 'table.md'), 'utf8');
  const chart = fs.readFileSync(path.join(dir, 'chart.html'), 'utf8');
  assert.match(table, /hit@k/);
  assert.match(table, /citation valid/);
  assert.match(table, /LongMemEval/);
  assert.match(table, /arXiv:2410\.10813/);
  assert.match(table, /not\*\* comparable|NOT\*\* comparable|\*\*not\*\* comparable/i);
  assert.match(chart, /<svg /);
  assert.ok(!/<script|src=|href=["']https?:|@import/i.test(chart), 'chart must load nothing external');
  assert.match(chart, /citation validity/i);
  assert.match(chart, /cost \/ 100 questions/i);
  assert.match(chart, /arXiv:2410\.10813/);
});

test('eval store rebuild: one arm cannot leak memories into another', async () => {
  const ds = loadDataset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-eval-leak-'));
  const a = await materialiseStore(dir, ds, { now: Date.now() });
  const before = a.vault.memories.length;
  a.addMemory('An extra memory written by one arm only', 'chat');
  assert.equal(a.vault.memories.length, before + 1);
  const b = await materialiseStore(dir, ds, { now: Date.now() });
  assert.equal(b.vault.memories.length, before, 'rebuilding gives exactly the dataset vault back');
  assert.ok(b.vault.memories.every((/** @type {any} */ m) => ds.memories.some((/** @type {any} */ x) => x.id === m.id)));
  assert.ok(new Store(dir) instanceof Store);
});
