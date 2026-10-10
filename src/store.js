import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256, uuid, num, safeText, clamp, tokenize } from './util.js';

const DECAY_HALF_LIFE_D = 21;
const MIN_SCORE = 0.04;

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
    };
    /** @type {Map<string, Set<string>>} */
    this.index = new Map();
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
        };
      } catch {
        // corrupted vault: start fresh rather than crash
      }
    }
    this.reindex();
  }

  reindex() {
    this.index = new Map();
    for (const m of this.vault.memories) {
      for (const t of new Set([...m.tags, ...tokenize(m.text)])) {
        let set = this.index.get(t);
        if (!set) this.index.set(t, (set = new Set()));
        set.add(m.id);
      }
    }
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
   * @returns {Memory[]}
   */
  recall(query, k = 6, queryVec) {
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
    if (vecReady) {
      const ranked = this.vault.memories
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
      return this.vault.memories.slice(0, k); // nothing matched at all → recency
    }

    if (scores.size === 0 && this.vault.memories.length) {
      // no lexical hit: return most recent as context
      return this.vault.memories.slice(0, k);
    }
    return Array.from(scores.entries())
      .map(([id, s]) => {
        const m = byId.get(id);
        if (!m) return null;
        return { m, score: s * (0.35 + 0.65 * decayedScore(m.strength, m.lastUsed)) };
      })
      .filter((x) => x && x.score > MIN_SCORE)
      .sort((a, b) => /** @type {any} */ (b).score - /** @type {any} */ (a).score)
      .slice(0, k)
      .map((x) => /** @type {any} */ (x).m);
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
      n += 1;
    }
    return n;
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

  countDream() {
    this.vault.dreamCount += 1;
    this.vault.lastDreamAt = Date.now();
  }
}
