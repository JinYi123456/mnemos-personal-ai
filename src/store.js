import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256, uuid, num, safeText, clamp, tokenize } from './util.js';

const DECAY_HALF_LIFE_D = 21;
const MIN_SCORE = 0.04;
/** Below this blended score a memory is not relevant to the question at all. */
const MIN_FUSED = 0.09;
export { DECAY_HALF_LIFE_D };

/** Embeddings are truncated (Matryoshka-style) to keep the JSON vault small. */
export const EMBED_DIMS = 256;

/**
 * @typedef {Object} Memory
 * @property {string} id
 * @property {string} text
 * @property {string[]} tags
 * @property {number} strength   0..1, boosted on recall (used-ness)
 * @property {number} lastUsed   epoch ms
 * @property {number} uses
 * @property {number} created    epoch ms
 * @property {string} source     'chat' | 'user' | 'dream'
 * @property {boolean} [seed]    true for demo-seeded memories
 * @property {number[]} [vec]    optional normalized embedding vector
 * @property {string} [supersededBy]  id of the newer memory that replaced this one
 */

/**
 * @typedef {Object} Insight
 * @property {string} id
 * @property {string} text
 * @property {string[]} fromIds
 * @property {number} created
 * @property {string} [name]     user-given constellation name
 */

/**
 * @typedef {Object} Skill
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} prompt
 * @property {number} created
 */

/**
 * @typedef {Object} Vault
 * @property {Memory[]} memories
 * @property {Insight[]} insights
 * @property {Skill[]} skills
 * @property {string[]} redZone  topics the AI must never engage with
 * @property {string|null} owner
 * @property {number} startedAt
 * @property {number} dreamCount
 * @property {number|null} lastDreamAt
 * @property {Record<string, {x:number, y:number}>} [layout]  dragged star positions (0..1 relative)
 * @property {{text:string, next:string[], intention:string, created:number, read:boolean}|null} [brief]
 *   the note the dream left for the morning
 */

/**
 * @param {number} strength
 * @param {number} lastUsed
 * @returns {number}
 */
function decayedScore(strength, lastUsed) {
  const days = (Date.now() - lastUsed) / 86400000;
  const decay = Math.pow(0.5, days / DECAY_HALF_LIFE_D);
  return clamp(strength * decay, 0, 1);
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function deriveTags(text) {
  return Array.from(new Set(tokenize(text))).slice(0, 6);
}

/**
 * Cosine similarity between two equal-length vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class Store {
  /**
   * @param {string} dir absolute path to vault dir
   */
  constructor(dir) {
    this.dir = dir;
    /** @type {Vault} */
    this.vault = {
      memories: [],
      insights: [],
      skills: [],
      redZone: [],
      owner: null,
      startedAt: Date.now(),
      dreamCount: 0,
      lastDreamAt: null,
      layout: {},
      brief: null,
    };
    /** @type {Map<string, Set<string>>} */
    this.index = new Map();
    /** @type {Map<string, number>} document length in tokens */
    this.dl = new Map();
    /** @type {Map<string, Map<string, number>>} term frequency per document */
    this.tf = new Map();
    /** @type {number} */
    this.avgdl = 1;
  }

  async load() {
    await fsp.mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, 'vault.json');
    if (fs.existsSync(file)) {
      try {
        const raw = JSON.parse(await fsp.readFile(file, 'utf8'));
        this.vault = {
          memories: Array.isArray(raw.memories) ? raw.memories.slice(0, 2000) : [],
          insights: Array.isArray(raw.insights) ? raw.insights.slice(0, 500) : [],
          skills: Array.isArray(raw.skills) ? raw.skills.slice(0, 100) : [],
          redZone: Array.isArray(raw.redZone)
            ? raw.redZone.filter((/** @type {unknown} */ x) => typeof x === 'string').slice(0, 20)
            : [],
          owner: typeof raw.owner === 'string' ? raw.owner : null,
          startedAt: num(raw.startedAt, Date.now()),
          dreamCount: num(raw.dreamCount, 0),
          lastDreamAt: num(raw.lastDreamAt, 0) || null,
          layout: raw.layout && typeof raw.layout === 'object' ? raw.layout : {},
          brief: raw.brief && typeof raw.brief === 'object' && typeof raw.brief.text === 'string' ? {
            text: String(raw.brief.text).slice(0, 700),
            next: Array.isArray(raw.brief.next) ? raw.brief.next.filter((/** @type {any} */ x) => typeof x === 'string').slice(0, 3) : [],
            intention: typeof raw.brief.intention === 'string' ? raw.brief.intention.slice(0, 120) : '',
            created: num(raw.brief.created, Date.now()),
            read: raw.brief.read === true,
          } : null,
        };
      } catch {
        // corrupted vault: start fresh rather than crash
      }
    }
    this.reindex();
  }

  reindex() {
    this.index = new Map();
    this.tf = new Map();
    this.dl = new Map();
    let total = 0;
    for (const m of this.vault.memories) {
      const terms = tokenize(m.text);
      this.dl.set(m.id, terms.length || 1);
      total += terms.length || 1;
      /** @type {Map<string, number>} */
      const freq = new Map();
      for (const t of terms) freq.set(t, (freq.get(t) || 0) + 1);
      this.tf.set(m.id, freq);
      for (const t of new Set([...m.tags, ...terms])) {
        let set = this.index.get(t);
        if (!set) this.index.set(t, (set = new Set()));
        set.add(m.id);
      }
    }
    this.avgdl = this.vault.memories.length ? total / this.vault.memories.length : 1;
  }

  /**
   * Okapi BM25 over the memory index — term frequency saturation (k1) plus
   * length normalisation (b) and inverse document frequency, so a two-word
   * memory that mentions "Kyoto" once and a long one that mentions it four times
   * are not treated as identical. This is the lexical half of the hybrid scorer.
   * @param {string[]} terms
   * @param {{k1?:number, b?:number}} [params]
   * @returns {Map<string, number>}
   */
  bm25(terms, params = {}) {
    const k1 = params.k1 ?? 1.5;
    const b = params.b ?? 0.75;
    const N = this.vault.memories.length;
    /** @type {Map<string, number>} */
    const scores = new Map();
    for (const t of new Set(terms)) {
      const postings = this.index.get(t);
      if (!postings) continue;
      const df = postings.size;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (const id of postings) {
        const freqs = this.tf.get(id);
        const freq = freqs ? (freqs.get(t) || 0) : 0;
        const len = this.dl.get(id) || 1;
        const norm = freq * (k1 + 1) / (freq + k1 * (1 - b + b * (len / (this.avgdl || 1))));
        scores.set(id, (scores.get(id) || 0) + idf * norm);
      }
    }
    return scores;
  }

  async flush() {
    const tmp = path.join(this.dir, 'vault.json.tmp');
    await fsp.writeFile(tmp, JSON.stringify(this.vault, null, 2), 'utf8');
    await fsp.rename(tmp, path.join(this.dir, 'vault.json'));
  }

  /**
   * @param {string} text
   * @param {string} [source='chat']
   * @param {boolean} [seed=false]
   * @returns {Memory|null} null when a near-duplicate exists
   */
  addMemory(text, source = 'chat', seed = false) {
    const clean = safeText(text, 600);
    if (clean.length < 8) return null;
    const hash = sha256(clean.toLowerCase().replace(/\s+/g, ' '));
    const dup = this.vault.memories.find((m) => m.id === hash);
    if (dup) return null;

    const mem = {
      id: hash,
      text: clean,
      tags: deriveTags(clean),
      strength: seed ? 0.72 : 0.42,
      lastUsed: Date.now(),
      uses: seed ? 2 : 0,
      created: Date.now(),
      source,
      ...(seed ? { seed: true } : {}),
    };
    this.vault.memories.unshift(mem);
    if (this.vault.memories.length > 2000) this.vault.memories.length = 2000;
    for (const t of new Set([...mem.tags, ...tokenize(mem.text)])) {
      let set = this.index.get(t);
      if (!set) this.index.set(t, (set = new Set()));
      set.add(mem.id);
    }
    return mem;
  }

  /**
   * Recall memories. Hybrid when a query embedding is supplied and at least one
   * memory carries a vector: score = 0.45·normalized-lexical + 0.55·cosine.
   * Falls back to pure lexical (with recency padding) otherwise.
   * @param {string} query
   * @param {number} [k=6]
   * @param {number[]} [queryVec] optional normalized query embedding
   * @param {{mode?: 'lexical'|'bm25'|'vector'|'fusion', alpha?: number, decayWeight?: number, floor?: number}} [opts]
   * @returns {Memory[]}
   */
  recall(query, k = 6, queryVec, opts = {}) {
    const mode = opts.mode || (queryVec ? 'fusion' : 'lexical');
    if (mode === 'fusion' || mode === 'bm25' || (mode === 'vector' && queryVec)) {
      return this.#recallHybrid(query, k, queryVec, mode, opts);
    }
    const terms = tokenize(query);
    /** @type {Map<string, number>} */
    const scores = new Map();
    const bump = (/** @type {string} */ id, /** @type {number} */ v) =>
      scores.set(id, (scores.get(id) || 0) + v);

    for (const t of terms) {
      const ids = this.index.get(t);
      if (ids) for (const id of ids) bump(id, 1);
      // light stemming: prefix match
      for (const [key, ids] of this.index) {
        if (key.length > 3 && key.startsWith(t.slice(0, Math.max(3, t.length - 1)))) {
          for (const id of ids) bump(id, 0.4);
        }
      }
    }
    const byId = new Map(this.vault.memories.map((m) => [m.id, m]));
    const maxLex = scores.size ? Math.max(...scores.values()) : 0;

    const vecReady = !!queryVec && this.vault.memories.some((m) => Array.isArray(m.vec));
    const live = (/** @type {Memory} */ m) => !m.supersededBy;
    if (vecReady) {
      const ranked = this.vault.memories.filter(live)
        .map((m) => {
          const lex = maxLex ? (scores.get(m.id) || 0) / maxLex : 0;
          const cos = Array.isArray(m.vec) ? cosine(queryVec, m.vec) : 0;
          const sem = Math.max(0, cos);
          const total = 0.45 * lex + 0.55 * sem * (0.35 + 0.65 * decayedScore(m.strength, m.lastUsed));
          return { m, total, pass: lex > 0 || sem > 0.2 };
        })
        .filter((x) => x.pass)
        .sort((a, b) => b.total - a.total)
        .slice(0, k)
        .map((x) => x.m);
      if (ranked.length) return ranked;
      // Only if every live memory was superseded do we look at history at all.
      return this.vault.memories.slice(0, k);
    }

    if (scores.size === 0) return []; // nothing matched: say so, do not improvise
    const hits = Array.from(scores.entries())
      .map(([id, sc]) => {
        const m = byId.get(id);
        if (!m) return null;
        return { m, score: (sc / (maxLex || 1)) * (0.35 + 0.65 * decayedScore(m.strength, m.lastUsed)) };
      })
      .filter((x) => x && x.score >= (opts.floor ?? MIN_FUSED))
      .sort((a, b) => /** @type {any} */ (b).score - /** @type {any} */ (a).score)
      .slice(0, k)
      .map((x) => /** @type {any} */ (x).m);
    return hits;
  }

  /**
   * Hybrid retrieval: BM25 and cosine are min-max normalised per channel, then
   * blended (alpha weights the lexical channel), then nudged by retention so a
   * fading star ranks below an equally relevant bright one.
   * @param {string} query
   * @param {number} k
   * @param {number[]|undefined} queryVec
   * @param {string} mode
   * @param {{alpha?:number, decayWeight?:number, floor?:number}} opts
   * @returns {Memory[]}
   */
  #recallHybrid(query, k, queryVec, mode, opts) {
    const alpha = opts.alpha ?? 0.5;
    const decayWeight = opts.decayWeight ?? 0.25;
    const lex = this.bm25(tokenize(query));
    const maxLex = lex.size ? Math.max(...lex.values()) : 0;
    const useVec = mode !== 'bm25' && !!queryVec && this.vault.memories.some((m) => Array.isArray(m.vec));
    /** @type {Array<{m: Memory, score: number}>} */
    const ranked = [];
    for (const m of this.vault.memories) {
      const l = maxLex ? (lex.get(m.id) || 0) / maxLex : 0;
      const c = useVec && Array.isArray(m.vec) ? Math.max(0, cosine(queryVec, m.vec)) : 0;
      if (mode === 'bm25') {
        if (l < (opts.floor ?? MIN_FUSED)) continue;
        ranked.push({ m, score: l });
        continue;
      }
      if (mode === 'vector') {
        if (c < (opts.floor ?? MIN_FUSED)) continue;
        ranked.push({ m, score: c });
        continue;
      }
      const fused = alpha * l + (1 - alpha) * c;
      // A floor is the whole difference between a memory system and a text
      // spinner. Below it there is nothing relevant, and the honest answer is
      // "I don't remember" — not the six nearest stars.
      if (fused < (opts.floor ?? MIN_FUSED)) continue;
      const decay = decayedScore(m.strength, m.lastUsed);
      ranked.push({ m, score: fused * (1 - decayWeight + decayWeight * decay) });
    }
    ranked.sort((a, b) => b.score - a.score);
    // No recency fallback here on purpose: silently handing the model six
    // unrelated memories is how a memory system learns to confabulate.
    return ranked.slice(0, k).map((x) => x.m);
  }

  /**
   * The memories that define the sky right now, strongest-retained first. Used
   * for genuinely open questions ("what do you remember about me?"), where there
   * is nothing to match against and recency-plus-strength *is* the right answer —
   * as opposed to a specific question that nothing clears, which must abstain.
   * @param {number} k
   * @returns {Memory[]}
   */
  strongest(k = 6) {
    return [...this.vault.memories]
      .filter((m) => !m.supersededBy)
      .sort((a, b) => decayedScore(b.strength, b.lastUsed) - decayedScore(a.strength, a.lastUsed))
      .slice(0, k);
  }

  /**
   * Store vectors for memories that don't have one yet (lazy backfill).
   * Vectors are truncated to EMBED_DIMS and re-normalized (Matryoshka-style).
   * @param {Map<string, number[]>} vecById full-id → raw embedding
   */
  backfillVecs(vecById) {
    let n = 0;
    for (const [id, raw] of vecById) {
      const m = this.vault.memories.find((x) => x.id === id);
      if (!m || !Array.isArray(raw) || raw.length === 0) continue;
      const cut = raw.slice(0, EMBED_DIMS);
      const norm = Math.sqrt(cut.reduce((s, v) => s + v * v, 0)) || 1;
      m.vec = cut.map((v) => Math.round((v / norm) * 10000) / 10000);
      this.#supersede(m);
      n += 1;
    }
    return n;
  }

  /**
   * When a memory's vector arrives, check whether it *replaces* an older one:
   * same subject (cosine ≥ 0.84) but different wording. Marking the old one
   * superseded is what makes "I moved to Berlin" beat "I live in Kuala Lumpur"
   * without deleting history — the sky still shows the old star, dimmer, and the
   * model is told it was replaced.
   * @param {Memory} fresh
   */
  #supersede(fresh) {
    if (!Array.isArray(fresh.vec)) return;
    for (const older of this.vault.memories) {
      if (older.id === fresh.id || !Array.isArray(older.vec) || older.supersededBy) continue;
      if (older.created > fresh.created) continue;
      if (cosine(fresh.vec, older.vec) < 0.84) continue;
      older.supersededBy = fresh.id;
      older.strength = Math.min(older.strength, 0.2);
    }
  }

  /**
   * Mark memories as used (boost strength — they are clearly valuable).
   * @param {string[]} ids
   */
  reinforce(ids) {
    for (const id of ids) {
      const m = this.vault.memories.find((x) => x.id === id);
      if (m) {
        m.uses += 1;
        m.lastUsed = Date.now();
        m.strength = clamp(m.strength + 0.06, 0, 1);
      }
    }
  }

  /** @param {string} text @param {string[]} fromIds */
  addInsight(text, fromIds) {
    const clean = safeText(text, 500);
    if (clean.length < 8) return null;
    const insight = { id: uuid(), text: clean, fromIds: fromIds.slice(0, 6), created: Date.now() };
    this.vault.insights.unshift(insight);
    if (this.vault.insights.length > 500) this.vault.insights.length = 500;
    return insight;
  }

  /**
   * Name a constellation (user ceremony). Persists on next flush.
   * @param {string} id insight id (uuid)
   * @param {string} name
   */
  setInsightName(id, name) {
    const ins = this.vault.insights.find((i) => i.id === id);
    if (!ins) return null;
    ins.name = safeText(name, 40) || undefined;
    return ins;
  }

  /**
   * Replace the personal red zone (topics the AI must never engage with).
   * @param {unknown} topics
   * @returns {string[]}
   */
  setRedZone(topics) {
    if (!Array.isArray(topics)) return this.vault.redZone;
    this.vault.redZone = topics
      .filter((t) => typeof t === 'string')
      .map((t) => safeText(t, 80))
      .filter(Boolean)
      .slice(0, 20);
    return this.vault.redZone;
  }

  /** @param {{name: string, description: string, prompt: string}} s */
  addSkill(s) {
    const skill = {
      id: uuid(),
      name: safeText(s.name, 60) || 'Unnamed skill',
      description: safeText(s.description, 300),
      prompt: safeText(s.prompt, 2000),
      created: Date.now(),
    };
    this.vault.skills.unshift(skill);
    if (this.vault.skills.length > 100) this.vault.skills.length = 100;
    return skill;
  }

  /** @param {string} id */
  removeMemory(id) {
    const i = this.vault.memories.findIndex((m) => m.id === id);
    if (i === -1) return false;
    this.vault.memories.splice(i, 1);
    this.reindex();
    return true;
  }

  /** Global visualization snapshot: layout + sizes + insight links. */
  snapshot() {
    const mems = this.vault.memories;
    const now = Date.now();
    return {
      owner: this.vault.owner,
      startedAt: this.vault.startedAt,
      dreamCount: this.vault.dreamCount,
      lastDreamAt: this.vault.lastDreamAt,
      stars: mems.map((m) => ({
        id: m.id,
        text: m.text,
        tags: m.tags,
        source: m.source,
        seed: !!m.seed,
        uses: m.uses,
        size: 1.6 + 5.4 * decayedScore(m.strength, m.lastUsed),
        ageDays: Math.max(0, (now - m.created) / 86400000),
        ...(this.vault.layout && this.vault.layout[m.id] ? { layout: this.vault.layout[m.id] } : {}),
      })),
      links: this.vault.insights.map((i) => ({
        id: i.id,
        from: i.fromIds,
        text: i.text,
        ...(i.name ? { name: i.name } : {}),
      })),
    };
  }

  /** @param {string|null} name */
  setOwner(name) {
    this.vault.owner = name ? safeText(name, 40) : null;
  }

  /**
   * Persist a dragged star position (relative 0..1, so it survives resizes).
   * @param {string} id memory id
   * @param {number} rx 0..1 across width
   * @param {number} ry 0..1 down height
   * @param {number} w canvas width in device px
   * @param {number} h canvas height in device px
   * @returns {{x:number, y:number}|null}
   */
  setStarPos(id, rx, ry, w, h) {
    const m = this.vault.memories.find((x) => x.id === id);
    if (!m || !w || !h) return null;
    const x = clamp(Math.round((rx / w) * 1000) / 1000, 0, 1);
    const y = clamp(Math.round((ry / h) * 1000) / 1000, 0, 1);
    if (!this.vault.layout) this.vault.layout = {};
    this.vault.layout[id] = { x, y };
    return this.vault.layout[id];
  }

  /** @param {string} id */
  clearStarPos(id) {
    if (this.vault.layout) delete this.vault.layout[id];
  }

  /** Reset all dragged positions → deterministic hash layout returns. */
  clearLayout() {
    this.vault.layout = {};
  }

  /**
   * Leave a morning brief behind after a dream — the part of memory work that
   * turns into something the owner can act on today.
   * @param {{text: string, next?: string[], intention?: string}} b
   */
  setBrief(b) {
    const text = safeText(b.text, 700);
    if (text.length < 12) return null;
    this.vault.brief = {
      text,
      next: (Array.isArray(b.next) ? b.next : []).map((t) => safeText(t, 160)).filter(Boolean).slice(0, 3),
      intention: safeText(b.intention || '', 120),
      created: Date.now(),
      read: false,
    };
    return this.vault.brief;
  }

  markBriefRead() {
    if (this.vault.brief) this.vault.brief.read = true;
    return this.vault.brief;
  }

  countDream() {
    this.vault.dreamCount += 1;
    this.vault.lastDreamAt = Date.now();
  }
}
