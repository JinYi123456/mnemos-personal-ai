/**
 * Mnemos evaluation harness — shared library.
 *
 * Deterministic pieces used by `eval/run.mjs`, `eval/report.mjs` and
 * `test/eval.test.js`. Mock mode touches no network and no money: retrieval is
 * the real `Store` code path, embeddings are a reproducible hashed bag of words,
 * and the answerer is a scripted extractive reader that can only use memories
 * that retrieval actually surfaced.
 *
 * The only project-internal APIs used here are public: `Store.addMemory`,
 * `Store.recall`, `Store.backfillVecs`, `cosine`, `EMBED_DIMS`, `Brain.runTurn`,
 * `Brain.formatRecall`, `Brain.extractCites`, `LLM.chat`, `LLM.embed`,
 * `LLM.costUSD`, `buildProviders`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/util.js';
import { Store, cosine, EMBED_DIMS } from '../src/store.js';
import { Brain } from '../src/brain.js';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const DATASET_FILE = path.join(HERE, 'dataset.json');
export const RESULTS_DIR = path.join(HERE, 'results');

export const ARMS = ['lexical', 'vector', 'hybrid', 'hybrid_cites'];
export const ARMS_WITH_EMBEDDINGS = ['vector', 'hybrid', 'hybrid_cites'];
export const ABILITIES = [
  'single-session-user', 'multi-session', 'temporal-reasoning', 'knowledge-update', 'abstention',
];

export const MOCK_EMBEDDER = 'mock-hash-bow-256';
export const MOCK_MODEL = 'mock-deterministic-reader';

/** A reply matching this is treated as "I don't remember" (also used live). */
export const ABSTAIN_RE =
  // Models abstain in more shapes than a regex author predicts: contracted *and*
  // uncontracted, first *and* second person, and sometimes with a trailing
  // "[No relevant memory IDs]" marker. Missing these scores honest declines as
  // hallucinations, which is a measurement bug, not a product one.
  /\b(i (do not|don'?t|dont) (remember|know|have|recall|see|mention)|do not|don'?t (remember|have (that|any)|recall|see|mention)|you (do not|don'?t) remember|no (record|memory|mention|information)( of| about)?|nothing (in|from) (my|the|your) (memory|vault|galaxy|notes)|not (in|saved|stored)( in)? (my|the|your) (memory|vault)|i can'?t find (any|that|it)|never (mentioned|told|stored|shared)|not something you (shared|told me)|i have no|\[\s*no relevant memory)\b/i;

/** Query terms that carry no topic; the mock reader ignores them. */
export const GENERIC_TERMS = new Set([
  'what', 'when', 'which', 'who', 'whom', 'whose', 'where', 'why', 'how',
  'kind', 'sort', 'blood', 'type', 'much', 'many', 'does', 'did', 'say', 'says', 'said',
  'tell', 'told', 'still', 'now', 'today', 'own', 'owns', 'get', 'gets', 'got',
  'have', 'has', 'had',
  'like', 'likes', 'want', 'wants', 'need', 'needs', 'going', 'thing', 'things',
  'happen', 'happens', 'happened', 'came', 'goes', 'called', 'asked',
  'older', 'newer', 'change', 'changes', 'changed', 'about', 'start', 'starts', 'started',
  'best', 'worst', 'right', 'actually', 'ago', 'long', 'time', 'name', 'life',
  'current', 'currently', 'recently', 'roughly', 'approximately', 'number', 'total',
  'list', 'remember', 'remembered', 'know', 'knew', 'known', 'work', 'working',
  'take', 'takes', 'took', 'use', 'uses', 'used', 'using', 'any', 'some', 'even',
  'just', 'very', 'really', 'there', 'here', 'one', 'keep', 'keeps', 'kept',
  'pay', 'pays', 'paid', 'amount', 'amounts', 'important', 'people', 'status',
  'situation', 'involve', 'involves', 'typical', 'look', 'looks', 'mean', 'means',
  'day', 'days', 'mentioned', 'mention', 'usual', 'normally', 'case', 'cases',
  'near', 'close', 'other', 'others', 'alone', 'same', 'different', 'own', 'own',
  'general', 'particular', 'specific', 'important', 'stuff', 'example', 'likely',
  'definitely', 'probably', 'maybe', 'person', 'answer', 'question', 'till',
]);

const CUE_OLDEST = /\b(first|earlier|earliest|before|older|oldest|longest ago|initially|originally|in order|which city first)\b/i;
const CUE_NEWEST = /\b(now|still|current|currently|latest|recent|recently|today|these days|anymore|newest)\b/i;
const CUE_AGE = /\bhow (many )?(days|weeks|long)\b.*\bago\b|\bdays ago\b|\bhow long ago\b/i;

const DAY = 86400000;

/* ------------------------------------------------------------------ dataset */

/** @param {string} [file] @returns {any} */
export function loadDataset(file = DATASET_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Build a real Store from the dataset, anchored on `now`.
 * Uses `Store.addMemory()` (so ids are the app's own sha256 ids), then patches
 * strength / uses / created / lastUsed — exactly what `src/seed.js` does — and
 * backfills vectors through `Store.backfillVecs()`.
 * @param {string} dir
 * @param {any} ds
 * @param {{now?: number, embedder?: null|{embed:(texts:string[])=>Promise<number[][]>}}} [opts]
 */
export async function materialiseStore(dir, ds, opts = {}) {
  const now = Number(opts.now) || Date.now();
  const store = new Store(dir);
  await store.load();
  for (const m of ds.memories) {
    const mem = store.addMemory(m.text, m.source || 'user', true);
    if (!mem) throw new Error(`dataset memory rejected by Store.addMemory: ${m.ref}`);
    if (mem.id !== m.id) throw new Error(`id drift for ${m.ref}: ${mem.id.slice(0, 8)} != ${m.short}`);
    mem.strength = m.strength;
    mem.uses = m.uses ?? 2;
    mem.created = now - m.day * DAY;
    mem.lastUsed = now - m.lastUsedDay * DAY;
  }
  store.vault.owner = 'Ola';
  store.vault.startedAt = now - 420 * DAY;
  if (opts.embedder) {
    const vectors = await opts.embedder.embed(ds.memories.map((/** @type {any} */ m) => m.text));
    /** @type {Map<string, number[]>} */
    const map = new Map();
    vectors.forEach((v, i) => map.set(ds.memories[i].id, v));
    store.backfillVecs(map);
  }
  return store;
}

/* ----------------------------------------------------------------- embedding */

/** FNV-1a over a string. @param {string} s @returns {number} */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic hash bag-of-words embedding (the mock stand-in for a real
 * embedding model). No training, no network, same text → same vector.
 * @param {string[]} texts
 * @param {number} [dims]
 * @returns {number[][]}
 */
export function hashEmbed(texts, dims = EMBED_DIMS) {
  return texts.map((t) => {
    const v = new Array(dims).fill(0);
    for (const term of tokenize(t)) {
      const h = fnv1a(term) % dims;
      v[h] += 1 + Math.log2(1 + term.length);
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => Math.round((x / norm) * 10000) / 10000);
  });
}

/**
 * @param {'mock'|'live'} mode
 * @param {{llm?: any}} [opts]
 * @returns {{name: string, mode: string, embed(texts:string[]): Promise<number[][]>, readonly model?: string}}
 */
export function makeEmbedder(mode, opts = {}) {
  if (mode === 'mock') {
    return { name: MOCK_EMBEDDER, mode, embed: async (/** @type {string[]} */ texts) => hashEmbed(texts) };
  }
  const llm = opts.llm;
  if (!llm) throw new Error('live embedder needs an LLM');
  let model = 'live';
  /** @type {{name: string, mode: string, embed(texts: string[]): Promise<number[][]>, readonly model: string}} */
  return {
    name: 'live-provider-embeddings',
    mode,
    /** @param {string[]} texts */
    async embed(texts) {
      const r = await llm.embed(texts);
      if (!r) throw new Error('provider returned no embeddings');
      model = r.model || model;
      return r.vectors.map((/** @type {number[]} */ v) => v.slice(0, EMBED_DIMS));
    },
    get model() {
      return model;
    },
  };
}

/* -------------------------------------------------------------- retrieval    */

/**
 * Arm → memory list. `lexical` and `hybrid` run the shipped `Store.recall()`
 * path; `vector` is a harness-side pure-cosine ranker over the same stored
 * vectors (the product has no pure-vector mode, so this is an ablation).
 * @param {Store} store
 * @param {'lexical'|'vector'|'hybrid'|'hybrid_cites'} arm
 * @param {string} query
 * @param {number[]|null|undefined} queryVec
 * @param {number} k
 * @returns {Array<{id: string, text: string}>}
 */
export function recallFor(store, arm, query, queryVec, k) {
  if (arm === 'lexical') return store.recall(query, k);
  if (arm === 'hybrid' || arm === 'hybrid_cites') return store.recall(query, k, queryVec || undefined);
  const vec = /** @type {number[]} */ (queryVec || []);
  return store.vault.memories
    .map((m) => ({ m, s: Array.isArray(m.vec) ? cosine(vec, m.vec) : 0 }))
    .sort((a, b) => b.s - a.s || a.m.created - b.m.created)
    .slice(0, k)
    .map((x) => x.m);
}

/* ------------------------------------------------------------- mock reader  */

/** Light morphological variants so the reader is not crippled by inflection.
 * @param {string} t @returns {Set<string>} */
export function tokenVariants(t) {
  const out = new Set([t]);
  const add = (/** @type {string} */ s) => {
    if (s.length >= 3) out.add(s);
  };
  if (t.endsWith('ies') && t.length > 4) add(`${t.slice(0, -3)}y`);
  if (t.endsWith('es') && t.length > 4) add(t.slice(0, -2));
  if (t.endsWith('ed') && t.length > 4) add(t.slice(0, -2));
  if (t.endsWith('d') && t.length > 4) add(t.slice(0, -1));
  if (t.endsWith('ing') && t.length > 5) {
    add(t.slice(0, -3));
    add(`${t.slice(0, -3)}e`);
  }
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) add(t.slice(0, -1));
  return out;
}

/** @param {string} a @param {string} b @returns {boolean} */
export function tokenMatch(a, b) {
  if (a === b) return true;
  const va = tokenVariants(a);
  const vb = tokenVariants(b);
  for (const x of va) {
    for (const y of vb) {
      if (x === y) return true;
      // shared-prefix match, but only on a stem long enough to mean something:
      // 'pass' must not match 'password', 'star' must not match 'start'
      if (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x))) return true;
    }
  }
  return false;
}

/** @param {string} text @returns {string[]} content terms, apostrophes folded */
export function readerTerms(text) {
  const seen = new Set();
  for (const raw of tokenize(text)) {
    const t = raw.replace(/['’].*$/, '');
    if (t.length > 2 && !GENERIC_TERMS.has(t)) seen.add(t);
  }
  return Array.from(seen);
}

/**
 * Which recalled lines are on-topic for this query.
 * A line is relevant when it shares at least one non-generic term with the
 * query — the deterministic stand-in for "this memory helps answer that".
 * @param {string[]} queryTerms
 * @param {string} text
 * @returns {number} number of matched query terms
 */
export function overlapCount(queryTerms, text) {
  const mine = readerTerms(text);
  let n = 0;
  for (const q of queryTerms) if (mine.some((t) => tokenMatch(q, t))) n += 1;
  return n;
}

/**
 * Parse the `MEMORY RECALL` block the Brain builds, so the mock reader works on
 * the shipped prompt format with no gold-labels peeking.
 * @param {string} userContent
 */
export function parseRecallBlock(userContent) {
  /** @type {Array<{sid: string, text: string, ageDays: number}>} */
  const lines = [];
  for (const m of String(userContent || '').matchAll(/^\[M([0-9a-f]{4,10})\]\s(.*)\s\((\d+)d old\)\s*$/gm)) {
    lines.push({ sid: m[1], text: m[2], ageDays: Number(m[3]) });
  }
  return lines;
}

/** @param {any[]} messages */
function extractUser(messages) {
  const list = messages || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const c = String(list[i]?.content || '');
    if (list[i]?.role === 'user' && !c.startsWith('[TOOL RESULT]')) return c;
  }
  return '';
}

/** @param {any[]} messages */
function extractRecall(messages) {
  for (const m of messages || []) {
    const c = String(m?.content || '');
    if (c.includes('MEMORY RECALL')) return c;
  }
  return '';
}

/** The question is either the bare user turn (Brain) or after `Question:` (ablation arms). */
/** @param {any[]} messages */
function questionFrom(messages) {
  const raw = extractUser(messages);
  const m = raw.match(/Question:\s*([\s\S]*)$/);
  const body = m ? m[1] : raw;
  return body
    .replace(/\n\nAnswer in one or two sentences[\s\S]*$/, '')
    .replace(/^Question:/, '')
    .trim();
}

export const MOCK_ABSTAIN_TEXT =
  "I don't remember — nothing in my vault covers that. Tell me and I'll store it.";

/**
 * Deterministic extractive reader. It can only use memories retrieval put in
 * the prompt, so retrieval failures show up as wrong or missing answers.
 *
 * Rules (documented in eval/README.md):
 *  1. no recalled line shares an informative term with the question → abstain;
 *  2. informative term overlap decides the primary; ties break on age, using
 *     "first/earliest/older" → oldest, anything else (incl. "now/current") → newest;
 *  3. an ordering or elapsed-time question answers from the primary alone;
 *     otherwise further lines within one overlap of the best are echoed (max 4),
 *     so multi-session answers can combine memories;
 *  4. an "how many days ago" question answers with the recalled memory's age;
 *  5. citations are exactly the echoed lines.
 * @param {{messages: any[]}} input
 * @param {{injectErrors?: boolean, errIdx?: number}} [opts]
 * @returns {{text: string, abstained: boolean, cited: string[], primary: string|null}}
 */
export function mockAnswer(input, opts = {}) {
  const messages = input.messages || [];
  const lines = parseRecallBlock(extractRecall(messages));
  const question = questionFrom(messages);
  const qTerms = readerTerms(question);
  const plant = (/** @type {string|null} */ primary, /** @type {string} */ body) => {
    if (!opts.injectErrors) return null;
    if (opts.errIdx === 0 && primary) return `You mentioned it once [M${primary}]`;
    if (opts.errIdx === 1) return `${body}\nI also recall [Mdeadbeef].`;
    // an unanswerable question answered anyway
    if (opts.errIdx === 2) return `Yes — I remember that clearly${body ? `: ${body}` : '.'}`;
    return null;
  };

  if (!lines.length) {
    const planted = plant(null, '');
    return planted
      ? { text: planted, abstained: false, cited: [], primary: null }
      : { text: MOCK_ABSTAIN_TEXT, abstained: true, cited: [], primary: null };
  }

  const scored = lines
    .map((l, rank) => ({ ...l, rank, ov: overlapCount(qTerms, l.text) }))
    .filter((l) => l.ov > 0);
  if (!scored.length) {
    const planted = plant(lines[0].sid, '');
    return planted
      ? { text: planted, abstained: false, cited: [lines[0].sid], primary: lines[0].sid }
      : { text: MOCK_ABSTAIN_TEXT, abstained: true, cited: [], primary: null };
  }

  const best = Math.max(...scored.map((l) => l.ov));
  const oldest = CUE_OLDEST.test(question);
  const newest = CUE_NEWEST.test(question);
  const asksAge = CUE_AGE.test(question);
  // ordering / current-state / elapsed-time questions compare only the best
  // matching lines; everything else may restate every line it judged relevant
  const band = (oldest || newest || asksAge
    ? scored.filter((l) => l.ov === best)
    : scored.filter((l) => l.ov >= Math.max(1, best - 1))
  ).sort(oldest
    ? (a, b) => b.ageDays - a.ageDays || b.ov - a.ov
    : (a, b) => b.ov - a.ov || a.ageDays - b.ageDays || a.rank - b.rank);
  const echoed = band.slice(0, oldest || newest || asksAge ? 1 : 6);
  const primary = echoed[0];

  const parts = echoed.map((l) => `${l.text.replace(/\.$/, '')} [M${l.sid}]`);
  let text;
  if (asksAge) text = `About ${primary.ageDays} days ago — ${parts[0]}`;
  else if (oldest) text = `The earliest of those was: ${parts[0]}`;
  else if (newest) text = `As of now: ${parts[0]}`;
  else text = `From what I remember: ${parts.join(' ')}`;

  if (opts.injectErrors && opts.errIdx === 0) text = `You mentioned it once [M${primary.sid}]`;
  if (opts.injectErrors && opts.errIdx === 1) text = `${text}\nI also recall [Mdeadbeef].`;
  if (opts.injectErrors && opts.errIdx === 2) text = `Yes — definitely ${parts[0]}`;

  return { text, abstained: false, cited: echoed.map((l) => l.sid), primary: primary.sid };
}

/**
 * Single-shot message shape used by the three retriever ablations. It carries
 * the same recall block Brain injects, but no tool protocol, no red zone and no
 * memory-extraction step, so an answer costs exactly one model call.
 * @param {Array<{id: string, text: string, created: number}>} recalled
 * @param {string} query
 * @param {number} now
 */
export function directMessages(recalled, query, now = Date.now()) {
  const withAge = recalled.map((m) => ({ ...m, created: m.created ?? now }));
  // formatRecall only reads id/text/created; the eval fixtures are partial on purpose.
  const block = Brain.formatRecall(/** @type {any[]} */ (withAge));
  const user = `MEMORY RECALL (auto):\n${block}\n\nQuestion: ${query}\n\nAnswer in one or two sentences from these memories only, citing the ids you used as [Mxxxxxxxx]. If none of them covers the question, say that you do not remember.`;
  return [
    { role: 'system', content: 'You are a careful memory assistant. Use only the supplied memories. Never invent one.' },
    { role: 'user', content: user },
  ];
}

/** @param {any[]} messages @returns {number} rough token count (chars / 4) */
export function estTokens(messages) {
  return Math.max(1, Math.round(messages.reduce((s, m) => s + String(m?.content || '').length, 0) / 4));
}

/* ------------------------------------------------------------------ scoring */

/** every `[Mxxxx]` citation the answer attempted, normalised to lowercase hex */
export function citeAttempts(/** @type {string} */ text) {
  return Array.from(new Set(
    Array.from(String(text || '').matchAll(/\[M([0-9a-f]{4,10})\]/g)).map((m) => /** @type {string} */ (m[1]).toLowerCase()),
  ));
}

/**
 * Score one (arm, question) pair. Ids are the 8-hex short ids the product shows.
 * @param {any} q dataset question
 * @param {{arm: string, retrieved: string[], answer: string|null, cites: string[],
 *   attempts?: string[], recalled: string[], mode: string, primary?: string|null,
 *   ms?: number, promptTokens?: number, completionTokens?: number,
 *   cachedTokens?: number, costUsd?: number, costKnown?: boolean, model?: string,
 *   error?: string}} row
 */
export function scoreQuestion(q, row) {
  const gold = q.goldShort || [];
  const retrieved = row.retrieved || [];
  const answer = row.answer ?? null;
  const abstained = answer === null || String(answer).trim() === '' || ABSTAIN_RE.test(answer);
  const answered = !abstained;
  const lower = String(answer || '').toLowerCase();
  // what the answer claimed (raw [Mxxxx] tokens) vs what actually resolved — a
  // model that invents an id must not pass as cited. `retrieved` is the set the
  // arm recorded, i.e. exactly what `Brain.extractCites` gets to resolve against.
  const attempts = row.attempts && row.attempts.length ? row.attempts : (row.cites || []);
  const resolves = attempts.filter((c) => retrieved.includes(c));
  const bad = attempts.filter((/** @type {string} */ c) => !retrieved.includes(c));

  const hits = gold.filter((/** @type {string} */ g) => retrieved.includes(g));
  const firstIdx = retrieved.findIndex((/** @type {string} */ r) => gold.includes(r));

  const missingAll = (q.mustAll || []).filter((/** @type {string} */ m) => !lower.includes(m));
  const anyOk = !(q.mustAny || []).length || (q.mustAny || []).some((/** @type {string} */ m) => lower.includes(m));
  const staleMarkers = [...(q.stale || []), ...(q.mustNot || [])].filter((/** @type {string} */ m) => lower.includes(m));

  /** @type {any} */
  const out = {
    id: q.id,
    ability: q.ability,
    update: q.update || null,
    abstainClass: q.abstainClass || null,
    arm: row.arm,
    query: q.query,
    answer,
    abstained,
    answered,
    retrieved,
    cites: row.cites || [],
    cite_attempts: attempts,
    primary: row.primary ?? null,
    // retrieval
    gold: gold,
    hit_at_k: gold.length ? hits.length > 0 : null,
    recall_at_k: gold.length ? hits.length / gold.length : null,
    mrr: gold.length ? (firstIdx >= 0 ? 1 / (firstIdx + 1) : 0) : null,
    first_hit_rank: firstIdx >= 0 ? firstIdx + 1 : null,
    // citations: an answered question must cite something that resolves
    cites_n: attempts.length,
    citation_valid: attempts.length ? resolves.length === attempts.length : !answered,
    cites_hallucinated: bad.length,
    cites_gold: attempts.filter((/** @type {string} */ c) => gold.includes(c)).length,
    cite_precision: attempts.length ? attempts.filter((/** @type {string} */ c) => gold.includes(c)).length / attempts.length : null,
    gold_cited: gold.length && answered ? gold.filter((/** @type {string} */ g) => attempts.includes(g)).length / gold.length : null,
    // answer correctness (oracle: mustAll + mustAny; abstention = a no-memory reply)
    markers_missing: missingAll.length,
    any_ok: anyOk,
    stale_markers: staleMarkers.length,
    answer_correct: q.answerable
      ? answered && missingAll.length === 0 && anyOk
      : !answered,
    hallucination: !q.answerable && answered,
    false_abstention: q.answerable && abstained,
    // cost / latency
    latency_ms: row.ms ?? null,
    prompt_tokens: row.promptTokens ?? 0,
    completion_tokens: row.completionTokens ?? 0,
    cached_tokens: row.cachedTokens ?? 0,
    cost_usd: row.costUsd ?? 0,
    cost_known: row.costKnown !== false,
    model: row.model || null,
    error: row.error || null,
  };

  if (q.ability === 'knowledge-update') {
    const newId = gold[0];
    const oldId = q.supersededShort || '';
    const gotNew = retrieved.includes(newId);
    const gotOld = retrieved.includes(oldId);
    out.update_new_retrieved = gotNew;
    out.update_old_retrieved = gotOld;
    // retrieval cleanly separated the two values: new in, stale out
    out.update_pair_correct = gotNew && !gotOld;
    out.update_stale_retrieved = !gotNew && gotOld;
    // an answer is stale only if it asserts the superseded value: the old memory
    // is the one it leans on, or the stale marker appears with no new value
    out.update_stale_answer = answered && (row.primary === oldId || (staleMarkers.length > 0 && (missingAll.length > 0 || !anyOk)));
    out.update_mentions_stale = staleMarkers.length > 0;
    out.update_answered_new = answered && gotNew && missingAll.length === 0 && anyOk;
  }
  return out;
}

const mean = (/** @type {Array<number|null>} */ xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((/** @type {number} */ s, /** @type {number|null} */ x) => s + Number(x || 0), 0) / v.length : null;
};
const share = (/** @type {any[]} */ rows, /** @type {(r:any)=>boolean} */ pred, /** @type {(r:any)=>boolean} */ of) => {
  const base = rows.filter(of);
  return base.length ? base.filter(pred).length / base.length : null;
};
const pct = (/** @type {number|null} */ x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);
const num3 = (/** @type {number|null} */ x) => (x === null || x === undefined ? '—' : x.toFixed(3));

/** Aggregate scored rows for one arm. @param {any[]} rows */
export function summariseArm(rows) {
  const answerable = rows.filter((r) => r.ability !== 'abstention');
  const abstu = rows.filter((r) => r.ability === 'abstention');
  const upd = rows.filter((r) => r.update);
  const sortedLat = rows.map((r) => r.latency_ms).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  const costTotal = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);
  return {
    n: rows.length,
    hit_at_k: mean(answerable.map((r) => r.hit_at_k ? 1 : 0)),
    hit_at_k_rate: share(answerable, (r) => r.hit_at_k, (r) => r.hit_at_k !== null),
    recall_at_k: mean(answerable.map((r) => r.recall_at_k)),
    mrr: mean(answerable.map((r) => r.mrr)),
    first_hit_rank: mean(answerable.map((r) => r.first_hit_rank)),
    answer_accuracy: share(answerable, (r) => r.answer_correct, () => true),
    false_abstention: share(answerable, (r) => r.false_abstention, () => true),
    abstain_accuracy: share(abstu, (r) => r.abstained, () => true),
    abstain_clean: share(abstu.filter((r) => r.abstainClass === 'clean'), (r) => r.abstained, () => true),
    abstain_near_miss: share(abstu.filter((r) => r.abstainClass === 'near-miss'), (r) => r.abstained, () => true),
    hallucination_rate: share(abstu, (r) => r.hallucination, () => true),
    citation_valid: share(rows, (r) => r.citation_valid, (r) => r.answered),
    gold_citation_recall: mean(answerable.map((r) => r.gold_cited)),
    hallucinated_citations: rows.reduce((s, r) => s + (r.cites_hallucinated || 0), 0),
    update_pair_retrieval: upd.length ? share(upd, (r) => r.update_pair_correct, () => true) : null,
    update_stale_retrieved: upd.length ? share(upd, (r) => r.update_stale_retrieved, () => true) : null,
    update_stale_answer: upd.length ? share(upd, (r) => r.update_stale_answer, () => true) : null,
    update_stale_mentioned: upd.length ? share(upd, (r) => r.update_mentions_stale, () => true) : null,
    latency_mean_ms: mean(rows.map((r) => r.latency_ms)),
    latency_p95_ms: sortedLat.length ? sortedLat[Math.min(sortedLat.length - 1, Math.floor(sortedLat.length * 0.95))] : null,
    prompt_tokens_mean: mean(rows.map((r) => r.prompt_tokens)),
    completion_tokens_mean: mean(rows.map((r) => r.completion_tokens)),
    cached_tokens_mean: mean(rows.map((r) => r.cached_tokens)),
    cost_usd_total: costTotal,
    cost_usd_per_100: rows.length ? (costTotal / rows.length) * 100 : null,
    cost_known: rows.every((r) => r.cost_known !== false),
    model: rows.find((r) => r.model)?.model || null,
  };
}

/**
 * Full summary: per arm, per arm×ability (hit@k + answer accuracy), totals.
 * @param {any[]} scored
 */
export function summarise(scored) {
  /** @type {Record<string, any>} */
  const byArm = {};
  for (const arm of ARMS) {
    const rows = scored.filter((r) => r.arm === arm);
    if (rows.length) byArm[arm] = summariseArm(rows);
  }
  /** @type {Record<string, Record<string, any>>} */
  const byArmAbility = {};
  for (const arm of Object.keys(byArm)) {
    byArmAbility[arm] = {};
    for (const ab of ABILITIES) {
      const rows = scored.filter((r) => r.arm === arm && r.ability === ab);
      if (!rows.length) continue;
      const answerable = rows.filter((r) => r.ability !== 'abstention');
      byArmAbility[arm][ab] = {
        n: rows.length,
        hit_at_k: answerable.length ? mean(answerable.map((r) => (r.hit_at_k ? 1 : 0))) : null,
        recall_at_k: answerable.length ? mean(answerable.map((r) => r.recall_at_k)) : null,
        mrr: answerable.length ? mean(answerable.map((r) => r.mrr)) : null,
        answer_accuracy: mean(rows.map((r) => (r.answer_correct ? 1 : 0))),
        abstain_accuracy: ab === 'abstention' ? mean(rows.map((r) => (r.abstained ? 1 : 0))) : null,
      };
    }
  }
  return { byArm, byArmAbility };
}

export { pct, num3, mean };

/* ------------------------------------------------------------- mock agent   */

/**
 * Drop-in stand-in for `LLM` used by `Brain.runTurn` in mock mode: deterministic
 * hashed embeddings, scripted extractive answers, zero spend, no network.
 */
export class MockLLM {
  /**
   * @param {{injectErrors?: boolean, errIdx?: number|null}} [opts] `errIdx` pins which
   *   planted error this agent produces; when unset the agent cycles 0..3 per call.
   */
  constructor(opts = {}) {
    this.injectErrors = !!opts.injectErrors;
    this.errIdx = opts.errIdx === undefined || opts.errIdx === null ? null : opts.errIdx;
    this.q = 0;
    /** no vision, no native tools: the mock drives the shipped prose protocol */
    this.vision = null;
    this.spend = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cachedTokens: 0, usd: 0, byTier: {} };
    /** @type {((rec: any) => void)|null} */
    this.onCall = null;
    /** @type {any} */
    this.last = null;
    this.embedCalls = 0;
  }

  get active() {
    return {
      id: 'mock', label: 'Mock', kind: 'openai', model: MOCK_MODEL,
      reasoningModel: MOCK_MODEL, embeddingModel: MOCK_EMBEDDER, nvidiaModel: false,
    };
  }

  /** The mock never emits native tool calls, so Brain uses the prose loop. */
  canTools() {
    return false;
  }

  status() {
    return { active: 'mock', nvidia: false, models: { chat: MOCK_MODEL, embedding: MOCK_EMBEDDER }, spend: this.spend };
  }

  /** @param {string[]} texts */
  async embed(texts) {
    this.embedCalls += 1;
    return { vectors: hashEmbed(texts), provider: 'mock', model: MOCK_EMBEDDER };
  }

  /** @param {{messages: any[], json?: boolean, maxTokens?: number}} opts */
  async chat(opts) {
    const promptTokens = estTokens(opts.messages || []);
    let text;
    let abstained = false;
    let primary = null;
    let completionTokens = Math.round(40 + promptTokens * 0.08);
    if (opts.json) {
      text = JSON.stringify({ memories: [] });
      completionTokens = 12;
    } else {
      const idx = this.errIdx === null ? this.q % 4 : this.errIdx;
      const a = mockAnswer({ messages: opts.messages }, { injectErrors: this.injectErrors, errIdx: idx });
      text = a.text;
      abstained = a.abstained;
      primary = a.primary;
      this.q += 1;
    }
    this.spend.calls += 1;
    this.spend.promptTokens += promptTokens;
    this.spend.completionTokens += completionTokens;
    this.spend.cachedTokens += 0;
    const cost = { usd: 0, known: true };
    this.spend.usd += cost.usd;
    const rec = {
      text, provider: 'mock', model: MOCK_MODEL, tier: opts.json ? 'extract' : 'fast', ms: 0,
      usage: { promptTokens, completionTokens, reasoningTokens: 0, cachedTokens: 0 },
      toolCalls: [], cost, abstained, primary,
    };
    this.last = rec;
    if (this.onCall) this.onCall({ ...rec, usage: rec.usage, costKnown: true });
    return rec;
  }

  async syncCatalog() {
    return { provider: 'mock', chat: MOCK_MODEL, reasoning: MOCK_MODEL, embedding: MOCK_EMBEDDER, catalogSize: 1, healed: [], verified: true };
  }
}

export { DAY };
