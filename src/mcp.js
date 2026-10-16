#!/usr/bin/env node
/**
 * Mnemos MCP server — any external agent (NVIDIA's Hermes Agent, Claude Code,
 * Cursor, …) can read *and* write the user's Mnemos memory vault over the
 * Model Context Protocol. This is the headline integration: Mnemos becomes a
 * durable memory layer that lives outside whatever agent the user drives.
 *
 * TRANSPORT: newline-delimited JSON-RPC 2.0 over **stdio** — one message per
 * line. stdout is the protocol channel: nothing but framed JSON-RPC is ever
 * written there; every diagnostic goes to stderr.
 *
 * ZERO RUNTIME DEPENDENCIES: no @modelcontextprotocol/sdk, no zod, no npm
 * install — just Node builtins plus this repo's own src/ modules.
 *
 * Implemented subset (what real clients actually send on boot):
 *   initialize · notifications/initialized · ping · cancelled/initialized/
 *   root list changed (ignored) · tools/list · tools/call · resources/list ·
 *   resources/templates/list · resources/read
 *
 * PROTOCOL VERSION: the server advertises "2025-06-18". If the client asks for
 * a version in the known set the server echoes it back (negotiation); anything
 * else — including a missing protocolVersion — gets "2025-06-18" as the
 * server's choice, which is what the spec prescribes.
 *
 * ERRORS, the MCP way:
 *   · -32700 parse error, -32600 invalid request, -32601 method not found,
 *     -32602 invalid params (unknown tool / bad resource URI is a protocol
 *     error, per spec), -32002 resource not found (implementation range).
 *   · Everything that is the *tool's* problem (bad arguments, no such memory,
 *     duplicate text, offline model) comes back as a normal result with
 *     `isError: true` and a human-readable text block, because that is what
 *     lets the calling agent self-correct instead of dropping the connection.
 *
 * WHY NO HTTP TRANSPORT (deliberate omission): Streamable HTTP needs real
 * session bookkeeping — `Mcp-Session-Id` issued at initialize, required on
 * every later request, an SSE GET stream with resumability, and DELETE to
 * terminate. Both target clients spawn a stdio child process locally, and an
 * untested half-implementation would be a worse liability than an honest gap,
 * so this file ships stdio only. `--http` is accepted on the CLI and refused
 * with an explanation so nobody silently runs the wrong transport.
 *
 * VAULT CONCURRENCY: vault.json is a single file with no lock and src/server.js
 * keeps its own in-memory copy that it rewrites on every chat turn. Every
 * mutating tool therefore re-reads vault.json from disk right before it writes,
 * which shrinks (but cannot remove) the window where a running web UI could
 * clobber an MCP write. Never call this against a vault the web app has open if
 * the writes matter.
 *
 * USAGE
 *   node src/mcp.js                          # stdio, vault at ./vault
 *   node src/mcp.js --vault /path/to/vault   # explicit vault
 *   node src/mcp.js --skills /path/to/skills # where skill_export writes
 *   node src/mcp.js --help
 *
 * ENV
 *   MNEMOS_OFFLINE=1  force dream_run into offline mode (replay + decay only),
 *                     even if an API key is present. Used by test/mcp.test.js
 *                     to keep the suite hermetic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { LLM, buildProviders } from './llm.js';
import { Dreamer } from './dream.js';
import { clamp, safeText } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PROTOCOL_LATEST = '2025-06-18';
/** Versions this server is willing to echo back during negotiation. */
const KNOWN_PROTOCOLS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);
const SERVER_NAME = 'mnemos';
const JSONRPC = '2.0';

/** No-response sentinel (notifications must never produce a reply). */
const NO_REPLY = Symbol('no-reply');

// ---------- diagnostics (stderr ONLY) ----------

/**
 * @param {string} msg
 */
function log(msg) {
  try {
    process.stderr.write(`mnemos-mcp: ${msg}\n`);
  } catch {
    /* stderr closed — nothing sane left to do */
  }
}

/** Server version straight out of package.json (no import, no bundler). */
function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ---------- small helpers ----------

class RpcError extends Error {
  /** @param {number} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {unknown} v @param {number} lo @param {number} hi @param {number} dflt
 * @returns {number}
 */
function intArg(v, lo, hi, dflt) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.round(clamp(n, lo, hi));
}

/** @param {number} ms @returns {string|null} */
function iso(ms) {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

/** @param {number} days @returns {string} */
function humanAge(days) {
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 31) return `${Math.round(days)} days ago`;
  if (days < 365) return `${(days / 30.44).toFixed(1)} months ago`;
  return `${(days / 365.25).toFixed(1)} years ago`;
}

/**
 * Memory as an agent sees it: short id + the signals that matter.
 * @param {import('./store.js').Memory} m
 */
function memoryView(m) {
  const now = Date.now();
  const ageDays = Math.max(0, (now - m.created) / 86400000);
  return {
    id: `M${m.id.slice(0, 8)}`,
    text: m.text,
    tags: m.tags,
    source: m.source,
    strength: Math.round(m.strength * 100) / 100,
    uses: m.uses,
    ageDays: Math.round(ageDays * 10) / 10,
    age: humanAge(ageDays),
    created: iso(m.created),
    lastSeen: iso(m.lastUsed),
    hasEmbedding: Array.isArray(m.vec),
  };
}

/**
 * Full or short (`M<hex>`) id → full id, the way the web API resolves stars.
 * @param {Store} store @param {unknown} raw
 * @returns {{id?: string, error?: string}}
 */
function resolveMemoryId(store, raw) {
  const s = safeText(String(raw ?? ''), 80)
    .toLowerCase()
    .replace(/^m/, '')
    .replace(/[^0-9a-f]/g, '');
  if (s.length < 4) {
    return { error: 'id must be a memory id — either the full hex or the short M<hex> form (at least 4 hex characters)' };
  }
  const hits = store.vault.memories.filter((m) => m.id.startsWith(s));
  if (hits.length === 0) return { error: `no memory with id "${raw}" — run memory_search first` };
  if (hits.length > 1) {
    return { error: `id "${raw}" matches ${hits.length} memories — supply more characters` };
  }
  return { id: hits[0].id };
}

/** @param {unknown} v @returns {Record<string, any>} */
function asArgs(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : {};
}

/**
 * @param {unknown} obj
 * @returns {{content: {type:"text",text:string}[]}}
 */
function ok(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Tool-level failure: a result, flagged, never a protocol error.
 * @param {string} message @param {Record<string, unknown>} [extra]
 * @returns {{content: {type:"text",text:string}[], isError: true}}
 */
function fail(message, extra) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, ...(extra || {}) }, null, 2) }],
    isError: true,
  };
}

// ---------- SKILL.md rendering (Hermes / NemoClaw / Agent-Skills convention) ----------

/**
 * Filesystem/YAML-safe slug: lowercase, a-z0-9 and dashes only.
 * @param {string} name
 * @returns {string}
 */
function slug(name) {
  const s = safeText(name, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'skill';
}

/**
 * A skill as a Hermes-loadable SKILL.md document.
 * @param {import('./store.js').Skill} skill
 * @returns {string}
 */
function skillMarkdown(skill) {
  const description = safeText(skill.description || `Skill learned by Mnemos on ${iso(skill.created) || 'unknown date'}`, 300)
    .replace(/\s+/g, ' ')
    .trim();
  const yamlQuote = `"${description.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const body = safeText(skill.prompt, 2000).trim();
  return [
    '---',
    `name: ${slug(skill.name)}`,
    `description: ${yamlQuote}`,
    '---',
    '',
    `# ${skill.name}`,
    '',
    body || '(Mnemos recorded this skill without a prompt body.)',
    '',
    '## Provenance',
    '',
    `- Learned by **Mnemos** (a local memory vault) on ${iso(skill.created) || 'unknown date'}.`,
    `- Mnemos skill id: \`${skill.id}\``,
    '- Retrieved over MCP by the `skill_export` tool; the source of truth stays in the vault.',
    '',
  ].join('\n');
}

// ---------- sky shapes: headless port of public/app.js shapePoints() ----------

/** 12 zodiac skeletons, normalized 0..1, [x1,y1,x2,y2] segments (mirrors app.js). */
const ZODIAC = {
  aries: [[0.25, 0.55, 0.45, 0.42], [0.45, 0.42, 0.78, 0.38]],
  taurus: [[0.28, 0.35, 0.42, 0.48], [0.42, 0.48, 0.72, 0.48], [0.72, 0.48, 0.82, 0.6], [0.82, 0.6, 0.7, 0.66]],
  gemini: [[0.3, 0.3, 0.34, 0.75], [0.62, 0.3, 0.6, 0.75], [0.34, 0.75, 0.6, 0.75], [0.3, 0.3, 0.32, 0.5], [0.62, 0.3, 0.61, 0.5]],
  cancer: [[0.32, 0.35, 0.5, 0.5], [0.5, 0.5, 0.68, 0.62]],
  leo: [[0.22, 0.45, 0.35, 0.32], [0.35, 0.32, 0.5, 0.38], [0.5, 0.38, 0.52, 0.55], [0.52, 0.55, 0.78, 0.6], [0.78, 0.6, 0.72, 0.38], [0.72, 0.38, 0.52, 0.55]],
  virgo: [[0.2, 0.6, 0.34, 0.48], [0.34, 0.48, 0.32, 0.3], [0.32, 0.3, 0.48, 0.28], [0.48, 0.28, 0.62, 0.42], [0.62, 0.42, 0.85, 0.4]],
  libra: [[0.24, 0.35, 0.55, 0.3], [0.55, 0.3, 0.5, 0.68], [0.5, 0.68, 0.78, 0.72]],
  scorpio: [[0.25, 0.32, 0.4, 0.4], [0.4, 0.4, 0.52, 0.35], [0.52, 0.35, 0.6, 0.5], [0.6, 0.5, 0.72, 0.72], [0.72, 0.72, 0.62, 0.8]],
  sagittarius: [[0.28, 0.6, 0.42, 0.42], [0.42, 0.42, 0.56, 0.56], [0.56, 0.56, 0.42, 0.68], [0.42, 0.68, 0.28, 0.6], [0.56, 0.56, 0.78, 0.45]],
  capricorn: [[0.24, 0.35, 0.45, 0.3], [0.45, 0.3, 0.55, 0.6], [0.55, 0.6, 0.78, 0.7]],
  aquarius: [[0.22, 0.4, 0.4, 0.32], [0.4, 0.32, 0.58, 0.45], [0.58, 0.45, 0.8, 0.5], [0.8, 0.5, 0.78, 0.66]],
  pisces: [[0.24, 0.7, 0.42, 0.6], [0.42, 0.6, 0.5, 0.4], [0.5, 0.4, 0.66, 0.3], [0.66, 0.3, 0.82, 0.32]],
};

/**
 * Pure-math port of the client's shapePoints(): n normalized {x,y} targets.
 * `letter` (word:) needs a browser canvas to rasterize glyphs, so it returns
 * null here and the caller queues the request instead.
 * @param {string} kind @param {number} n @returns {{x:number,y:number}[]|null}
 */
function shapePoints(kind, n) {
  if (n <= 0) return [];
  /** same LCG as app.js so an MCP-shaped sky matches the UI-shaped sky */
  let seedNum = 9301 ^ (n * 7919);
  const rnd = () => {
    seedNum = (seedNum * 9301 + 49297) % 233280;
    return seedNum / 233280;
  };
  const jitter = () => (rnd() - 0.5) * 0.035;
  const pts = [];
  if (kind === 'spiral') {
    const turns = 1.6;
    for (let i = 0; i < n; i += 1) {
      const t = i / n;
      const r = 0.08 + t * 0.38;
      const a = t * turns * Math.PI * 2 + (i % 2 ? Math.PI : 0);
      pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.45 + Math.sin(a) * r * 0.62 });
    }
  } else if (kind === 'heart') {
    for (let i = 0; i < n; i += 1) {
      const t = (i / n) * Math.PI * 2;
      pts.push({
        x: 0.5 + 0.42 * Math.pow(Math.sin(t), 3),
        y: 0.42 - (0.36 * Math.cos(t) - 0.14 * Math.cos(2 * t) - 0.05 * Math.cos(3 * t) - 0.02 * Math.cos(4 * t)),
      });
    }
  } else if (kind === 'ring') {
    for (let i = 0; i < n; i += 1) {
      const t = (i / n) * Math.PI * 2;
      pts.push({ x: 0.5 + Math.cos(t) * 0.36, y: 0.45 + Math.sin(t) * 0.36 });
    }
  } else if (kind === 'bigdipper') {
    const dip = [[0.22, 0.38], [0.32, 0.42], [0.42, 0.44], [0.5, 0.46], [0.6, 0.52], [0.68, 0.6], [0.74, 0.66]];
    for (let i = 0; i < n; i += 1) {
      const p = dip[i % 7];
      pts.push({ x: p[0] + jitter(), y: p[1] + jitter() });
    }
  } else if (kind === 'cassiopeia') {
    const cas = [[0.2, 0.55], [0.32, 0.44], [0.46, 0.52], [0.6, 0.4], [0.76, 0.5]];
    for (let i = 0; i < n; i += 1) {
      const p = cas[i % 5];
      pts.push({ x: p[0] + jitter(), y: p[1] + jitter() });
    }
  } else if (ZODIAC[/** @type {keyof typeof ZODIAC} */ (kind)]) {
    const segs = ZODIAC[/** @type {keyof typeof ZODIAC} */ (kind)];
    const total = segs.reduce((acc, s) => acc + Math.hypot(s[2] - s[0], s[3] - s[1]), 0);
    let placed = 0;
    for (const s of segs) {
      const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      const cnt = Math.max(1, Math.round((len / total) * n));
      for (let i = 0; i < cnt && placed < n; i += 1, placed += 1) {
        const f = (i + 0.5) / cnt;
        pts.push({ x: s[0] + (s[2] - s[0]) * f + jitter(), y: s[1] + (s[3] - s[1]) * f + jitter() });
      }
    }
    while (placed < n) {
      const anchor = segs[placed % segs.length];
      pts.push({ x: anchor[0] + jitter() * 2, y: anchor[1] + jitter() * 2 });
      placed += 1;
    }
  } else {
    return null; // 'letter' — glyph rasterization needs a canvas
  }
  return pts;
}

// ---------- the server ----------

const RESOURCE_STARS = 'mnemos://vault/stars';
const RESOURCE_TIMELINE = 'mnemos://vault/timeline';
const RESOURCE_SKILLS = 'mnemos://vault/skills';
const MEMORY_URI_PREFIX = 'mnemos://memory/';

class MnemosMcp {
  /**
   * @param {{vaultDir:string, skillsDir:string}} opts
   */
  constructor(opts) {
    this.vaultDir = opts.vaultDir;
    this.skillsDir = opts.skillsDir;
    this.store = new Store(opts.vaultDir);
    this.offline = process.env.MNEMOS_OFFLINE === '1';
    this.providers = this.offline ? [] : buildProviders(ROOT);
    this.negotiated = PROTOCOL_LATEST;
    this.initialized = false;
    this.clientInfo = null;
    /** @type {Promise<void>} serializes handling so writes never interleave */
    this.chain = Promise.resolve();
    /** @type {Record<string, {desc:string, schema:Record<string,unknown>, run:(a:Record<string,any>)=>Promise<any>}>} */
    this.tools = this.defineTools();
  }

  // ----- tools -----

  defineTools() {
    /** @type {Record<string, {desc:string, schema:Record<string,unknown>, run:(a:Record<string,any>)=>Promise<any>}>} */
    const tools = {
      memory_search: {
        desc: 'Semantic+lexical recall over the user\'s memories. Read-only: it does not boost or modify the vault. Returns short ids (M<hex>) usable by memory_forget and mnemos://memory/{id}.',
        schema: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 400, description: 'What to look for, in plain language.' },
            k: { type: 'integer', minimum: 1, maximum: 50, default: 8, description: 'Max memories to return (default 8).' },
          },
          required: ['query'],
          additionalProperties: false,
        },
        run: async (a) => {
          const query = safeText(a.query, 400).trim();
          if (query.length < 2) return fail('query must be at least 2 characters');
          await this.refresh();
          const k = intArg(a.k, 1, 50, 8);
          const hits = this.store.recall(query, k);
          return ok({
            ok: true,
            query,
            count: hits.length,
            totalMemories: this.store.vault.memories.length,
            note: hits.length ? 'ranked best-first; read-only, vault untouched' : 'nothing matched — the vault has no memory close to this',
            results: hits.map(memoryView),
          });
        },
      },

      memory_remember: {
        desc: 'Store a durable memory about the user (facts, preferences, plans, people, decisions). Dedupe-aware: near-identical text is rejected instead of duplicated.',
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string', minLength: 8, maxLength: 600, description: 'One atomic fact in the user\'s own terms, max 600 chars.' },
            source: {
              type: 'string',
              maxLength: 24,
              default: 'external',
              description: 'Where it came from, e.g. "hermes", "claude-code", "external", "user".',
            },
          },
          required: ['text'],
          additionalProperties: false,
        },
        run: async (a) => {
          const text = safeText(a.text, 600).trim();
          if (text.length < 8) return fail('text must be at least 8 characters — store one concrete fact, not a word');
          await this.refresh();
          const source = safeText(typeof a.source === 'string' && a.source.trim() ? a.source : 'external', 24).trim();
          const mem = this.store.addMemory(text, source);
          if (!mem) {
            return fail('a near-duplicate memory already exists — nothing was stored', {
              hint: 'search first with memory_search; if the existing memory is wrong, memory_forget it and remember the correction',
            });
          }
          await this.store.flush();
          return ok({ ok: true, stored: memoryView(mem), deduped: false });
        },
      },

      memory_forget: {
        desc: 'Delete a memory permanently (the user asked, or it is stale/wrong). Accepts the short M<hex> id or the full id.',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 4, maxLength: 80, description: 'Memory id, e.g. "M1a2b3c4d" (from memory_search / memory_list).' },
          },
          required: ['id'],
          additionalProperties: false,
        },
        run: async (a) => {
          await this.refresh();
          const r = resolveMemoryId(this.store, a.id);
          if (!r.id) return fail(String(r.error));
          const gone = this.store.vault.memories.find((m) => m.id === r.id);
          const text = gone ? gone.text : '';
          if (!this.store.removeMemory(r.id)) return fail('delete failed — the memory vanished between read and write');
          await this.store.flush();
          return ok({ ok: true, forgotten: `M${r.id.slice(0, 8)}`, text, remaining: this.store.vault.memories.length });
        },
      },

      memory_list: {
        desc: 'List the newest memories (newest first) — a quick survey when there is nothing specific to search for.',
        schema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 20, description: 'How many to return (default 20).' },
          },
          additionalProperties: false,
        },
        run: async (a) => {
          await this.refresh();
          const limit = intArg(a.limit, 1, 200, 20);
          const all = this.store.vault.memories;
          return ok({
            ok: true,
            total: all.length,
            returned: Math.min(limit, all.length),
            memories: all.slice(0, limit).map(memoryView),
          });
        },
      },

      vault_snapshot: {
        desc: 'The memory galaxy as data: every star (memory) with its size/age/uses plus the constellation links (insights) between them, including saved positions. Lets a client render the sky.',
        schema: { type: 'object', properties: {}, additionalProperties: false },
        run: async () => {
          await this.refresh();
          const snap = this.store.snapshot();
          return ok({ ok: true, ...snap, counts: {
            stars: snap.stars.length,
            links: snap.links.length,
            skills: this.store.vault.skills.length,
            redZone: this.store.vault.redZone.length,
          } });
        },
      },

      dream_run: {
        desc: 'Run one Mnemos dream: replay (reinforce the strong/recent), consolidate (LLM finds cross-memory insights + proposes a skill), decay (weak, untouched memories fade and drop out). Offline-safe: with no API key it still does replay + decay and reports that consolidation was skipped.',
        schema: {
          type: 'object',
          properties: {
            fast: { type: 'boolean', default: true, description: 'Pace the replay events at 60ms rather than 420ms (default true — headless clients should not wait).' },
          },
          additionalProperties: false,
        },
        run: async (a) => {
          await this.refresh();
          if (!this.store.vault.memories.length) {
            return fail('the vault is empty — nothing to dream about; call memory_remember first');
          }
          /** @type {any[]} */
          const events = [];
          const llm = new LLM(this.providers);
          const dreamer = new Dreamer(this.store, llm);
          const result = await dreamer.run((e) => events.push(e), { fast: a.fast !== false });
          if (result && result.error) return fail(String(result.error));
          await this.store.flush();
          const skippedOffline = events.some((e) => typeof e.message === 'string' && /Offline dream/.test(e.message));
          const offline = this.providers.length === 0;
          return ok({
            ok: true,
            ...result,
            replayed: events.filter((e) => e.phase === 'replay' && e.star).length,
            insights: result.insights ?? 0,
            skills: result.skills ?? 0,
            consolidation: offline || skippedOffline
              ? 'skipped — no model reachable (MNEMOS_OFFLINE=1 or no provider API key): replay + decay only'
              : 'ran with model',
            providers: this.providers.map((p) => p.id),
            dreamCount: this.store.vault.dreamCount,
            lastDreamAt: iso(this.store.vault.lastDreamAt ?? 0),
            phases: events.map((e) => e.phase),
          });
        },
      },

      skill_export: {
        desc: 'Export Mnemos\' learned skills as SKILL.md files (front-matter name + description, prompt body) so another agent — NVIDIA Hermes/NemoClaw style, or Claude Code — can load them. Returns the written paths.',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 60, description: 'Optional substring of a skill name; omit to export every skill.' },
          },
          additionalProperties: false,
        },
        run: async (a) => {
          await this.refresh();
          const filter = safeText(a.name, 60).trim().toLowerCase();
          const all = this.store.vault.skills;
          const selected = filter ? all.filter((s) => s.name.toLowerCase().includes(filter)) : all;
          if (!selected.length) {
            return fail(filter ? `no skill matching "${filter}"` : 'the vault has no learned skills yet', {
              available: all.map((s) => s.name),
              hint: 'skills appear from dream_run consolidation',
            });
          }
          /** @type {{name:string, slug:string, file:string, skillId:string}[]} */
          const written = [];
          const used = new Set();
          for (const skill of selected) {
            let base = slug(skill.name);
            if (used.has(base)) base = `${base}-${written.length + 2}`;
            used.add(base);
            const dir = path.resolve(this.skillsDir, base);
            if (!dir.startsWith(path.resolve(this.skillsDir) + path.sep)) {
              return fail(`refusing to write outside the skills directory: ${skill.name}`);
            }
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, 'SKILL.md');
            fs.writeFileSync(file, skillMarkdown(skill), 'utf8');
            written.push({ name: skill.name, slug: base, file, skillId: skill.id });
          }
          return ok({ ok: true, skillsDir: path.resolve(this.skillsDir), written: written.length, files: written });
        },
      },

      sky_shape: {
        desc: 'Arrange the user\'s memory stars into a shape and persist it, exactly the way dragging stars in the web UI does (vault.layout). Same contract as the app\'s sky.shape tool: spiral|heart|ring|bigdipper|cassiopeia|<zodiac>|word:<text>, plus "reset" to clear positions. Word shapes need a browser canvas, so they are queued in the vault dir for the web UI to honour.',
        schema: {
          type: 'object',
          properties: {
            shape: {
              type: 'string',
              minLength: 3,
              maxLength: 60,
              description: 'spiral|heart|ring|bigdipper|cassiopeia|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces|word:hello|reset',
            },
          },
          required: ['shape'],
          additionalProperties: false,
        },
        run: (a) => this.skyShape(safeText(a.shape, 60)),
      },
    };
    return tools;
  }

  /**
   * Mirrors the validation + response contract of `sky.shape` in src/brain.js,
   * then persists positions through Store.setStarPos/clearLayout.
   * @param {string} rawShape
   */
  async skyShape(rawShape) {
    const raw = String(rawShape || '').toLowerCase().trim();
    const WORD_KINDS = ['spiral', 'heart', 'ring', 'bigdipper', 'cassiopeia', 'letter'];
    const kind = raw.startsWith('word:') ? 'letter' : WORD_KINDS.includes(raw) ? raw : raw;
    const word = raw.startsWith('word:') ? raw.slice(5) : '';

    // Extension over the app tool: an MCP client has no reset button. Checked
    // before validation, because "reset" is not a shape the browser knows.
    if (raw === 'reset' || raw === 'clear') {
      await this.refresh();
      this.store.clearLayout();
      await this.store.flush();
      return ok({ ok: true, shape: 'reset', cleared: true, note: 'all saved positions dropped — the deterministic hash layout returns' });
    }

    const valid = WORD_KINDS.includes(kind) || [
      'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
      'sagittarius', 'capricorn', 'aquarius', 'pisces',
    ].includes(kind);
    if (!valid) {
      return fail('unknown shape', { hint: 'spiral|heart|ring|bigdipper|cassiopeia|word:<text>|reset' });
    }
    await this.refresh();

    const stars = this.store.snapshot().stars;
    if (!stars.length) return fail('the vault has no stars to arrange — call memory_remember first');

    // Word shapes rasterize glyphs through a canvas in public/app.js; headless
    // we cannot, so queue the request for the web UI instead of faking a layout.
    if (kind === 'letter') {
      const cleanWord = safeText(word.replace(/[^a-z0-9]/g, ''), 9);
      if (!cleanWord) return fail('word:<text> needs letters, e.g. word:hello');
      const queueFile = path.join(this.vaultDir, 'pending-shape.json');
      const request = {
        kind: 'letter',
        word: cleanWord,
        stars: stars.length,
        requestedAt: new Date().toISOString(),
        requestedBy: 'mcp',
        note: 'queued by the MCP server; glyph shapes need the browser canvas, so the web UI applies it on next load',
      };
      fs.writeFileSync(queueFile, JSON.stringify(request, null, 2), 'utf8');
      return ok({
        ok: true,
        shape: kind,
        word: cleanWord,
        persisted: 'queued',
        queueFile,
        note: 'client reshapes the sky when it sees this event',
      });
    }

    const pts = shapePoints(kind, stars.length);
    if (!pts || !pts.length) return fail(`shape "${kind}" produced no points`);
    // Brightest stars claim the first points — same rule as the UI.
    const order = stars.slice().sort((a, b) => b.size - a.size);
    let moved = 0;
    order.forEach((s, i) => {
      const p = pts[i % pts.length];
      if (this.store.setStarPos(s.id, p.x, p.y, 1, 1)) moved += 1;
    });
    await this.store.flush();
    return ok({
      ok: true,
      shape: kind,
      ...(word ? { word } : {}),
      persisted: 'layout',
      moved,
      note: 'saved to vault.layout — the web UI pins these stars everywhere it opens',
    });
  }

  // ----- resources -----

  /**
   * @param {string} uri
   * @returns {{json?:any, unknown?:string, notFound?:string}}
   */
  resourceFor(uri) {
    const u = String(uri || '').trim();
    if (u === RESOURCE_STARS) {
      const snap = this.store.snapshot();
      return { json: { owner: snap.owner, startedAt: iso(snap.startedAt), dreamCount: snap.dreamCount, lastDreamAt: iso(snap.lastDreamAt ?? 0), stars: snap.stars, links: snap.links } };
    }
    if (u === RESOURCE_TIMELINE) {
      const now = Date.now();
      const mems = this.store.vault.memories.slice().sort((a, b) => a.created - b.created);
      return { json: {
        owner: this.store.vault.owner,
        startedAt: iso(this.store.vault.startedAt),
        dreamCount: this.store.vault.dreamCount,
        lastDreamAt: iso(this.store.vault.lastDreamAt ?? 0),
        memories: mems.map((m) => ({
          id: `M${m.id.slice(0, 8)}`,
          created: iso(m.created),
          ageDays: Math.round((Math.max(0, now - m.created) / 86400000) * 10) / 10,
          source: m.source,
          text: m.text,
        })),
        insights: this.store.vault.insights.slice().sort((a, b) => a.created - b.created).map((i) => ({
          id: i.id,
          created: iso(i.created),
          name: i.name || null,
          text: i.text,
          from: i.fromIds.map((id) => `M${id.slice(0, 8)}`),
        })),
      } };
    }
    if (u === RESOURCE_SKILLS) {
      return { json: { skills: this.store.vault.skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        prompt: s.prompt,
        created: iso(s.created),
        skillMd: skillMarkdown(s),
      })) } };
    }
    if (u.startsWith(MEMORY_URI_PREFIX)) {
      const r = resolveMemoryId(this.store, u.slice(MEMORY_URI_PREFIX.length));
      if (!r.id) return { notFound: String(r.error) };
      const m = this.store.vault.memories.find((x) => x.id === r.id);
      const links = this.store.vault.insights.filter((i) => i.fromIds.includes(String(r.id)));
      return { json: { ...memoryView(/** @type {any} */ (m)), links: links.map((i) => ({ id: i.id, name: i.name || null, text: i.text })) } };
    }
    return { unknown: u };
  }

  // ----- lifecycle -----

  async refresh() {
    await this.store.load();
  }

  /**
   * @param {string} dir
   */
  async boot(dir) {
    await this.store.load();
    // A brand-new --vault directory gets a valid empty vault on disk. Never
    // seeded: an MCP client must not sprinkle demo memories into a real user's
    // sky (src/server.js owns the demo seeding, for the demo vault only).
    if (!fs.existsSync(path.join(dir, 'vault.json'))) await this.store.flush();
    log(`vault ${dir} — ${this.store.vault.memories.length} memories, ${this.store.vault.skills.length} skills`);
    log(`providers: ${this.providers.length ? this.providers.map((p) => p.id).join(',') : 'none (dream consolidation will be skipped)'}`);
  }

  // ----- framing -----

  /**
   * @param {any} payload
   */
  send(payload) {
    const line = `${JSON.stringify(payload)}\n`;
    return new Promise((resolve) => {
      process.stdout.write(line, 'utf8', () => resolve(undefined));
    });
  }

  /**
   * @param {string} line one JSON-RPC message
   */
  async handleLine(line) {
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      await this.send({ jsonrpc: JSONRPC, id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== JSONRPC || typeof msg.method !== 'string') {
      await this.send({
        jsonrpc: JSONRPC,
        id: msg && typeof msg.id !== 'undefined' ? msg.id : null,
        error: { code: -32600, message: 'Invalid Request' },
      });
      return;
    }
    const isRequest = typeof msg.id === 'number' || typeof msg.id === 'string';
    /** @type {any} */
    let result;
    try {
      result = await this.dispatch(msg.method, msg.params);
    } catch (e) {
      const err = e instanceof RpcError ? e : new RpcError(-32603, String(/** @type {any} */ (e).message || e));
      if (isRequest) {
        await this.send({ jsonrpc: JSONRPC, id: msg.id, error: { code: err.code, message: err.message } });
      } else {
        log(`notification ${msg.method} failed: ${err.message}`);
      }
      return;
    }
    if (!isRequest || result === NO_REPLY) return;
    await this.send({ jsonrpc: JSONRPC, id: msg.id, result: result === undefined ? {} : result });
  }

  /**
   * @param {string} method
   * @param {any} params
   */
  async dispatch(method, params) {
    switch (method) {
      case 'initialize': {
        const asked = params && typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        this.negotiated = KNOWN_PROTOCOLS.has(asked) ? asked : PROTOCOL_LATEST;
        this.initialized = true;
        this.clientInfo = params && params.clientInfo ? params.clientInfo : null;
        log(`initialize from ${this.clientInfo ? `${this.clientInfo.name || 'client'} ${this.clientInfo.version || ''}`.trim() : 'client'} → ${this.negotiated}`);
        return {
          protocolVersion: this.negotiated,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            logging: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            title: 'Mnemos memory vault',
            version: readVersion(),
          },
          instructions:
            'Mnemos is the user\'s local memory vault. Use memory_search before answering anything about their past, ' +
            'memory_remember for anything worth keeping (one atomic fact per call), memory_forget when the user corrects ' +
            'a memory. dream_run consolidates memories into insights and skills; skill_export hands those skills back as ' +
            'SKILL.md files. Writes persist to vault.json immediately. Never invent a memory id.',
        };
      }

      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/roots/list_changed':
      case 'logging/setLevel':
      case 'notifications/progress':
        return NO_REPLY;

      case 'ping':
        return {};

      case 'tools/list':
        return {
          tools: Object.entries(this.tools).map(([name, t]) => ({
            name,
            title: name.replace(/_/g, ' '),
            description: t.desc,
            inputSchema: t.schema,
          })),
        };

      case 'tools/call': {
        const p = asArgs(params);
        const name = typeof p.name === 'string' ? p.name : '';
        const tool = this.tools[name];
        if (!tool) throw new RpcError(-32602, `Unknown tool: ${name || '(missing name)'}`);
        const args = asArgs(p.arguments);
        try {
          return await tool.run(args);
        } catch (e) {
          log(`tool ${name} threw: ${String(/** @type {any} */ (e).stack || e)}`);
          return fail(`tool failed: ${String(/** @type {any} */ (e).message || e)}`);
        }
      }

      case 'resources/list':
        return {
          resources: [
            { uri: RESOURCE_STARS, name: 'Vault stars', title: 'Memory galaxy (stars + constellation links)', description: 'Every memory with size/age/uses plus the insight links between them.', mimeType: 'application/json' },
            { uri: RESOURCE_TIMELINE, name: 'Vault timeline', title: 'Chronological memories and insights', description: 'The life story in order of when Mnemos learned it.', mimeType: 'application/json' },
            { uri: RESOURCE_SKILLS, name: 'Vault skills', title: 'Learned skills', description: 'Each learned skill plus its SKILL.md text.', mimeType: 'application/json' },
          ],
        };

      case 'resources/templates/list':
        return {
          resourceTemplates: [
            { uriTemplate: `${MEMORY_URI_PREFIX}{id}`, name: 'One memory', title: 'A single memory by id', description: 'Full record of one memory plus the insight links it takes part in. {id} accepts the short M<hex> form.', mimeType: 'application/json' },
          ],
        };

      case 'resources/read': {
        const p = asArgs(params);
        const uri = typeof p.uri === 'string' ? p.uri : '';
        await this.refresh();
        const r = this.resourceFor(uri);
        if (r.unknown) throw new RpcError(-32002, `Resource not found: ${uri || '(missing uri)'}`);
        if (r.notFound) throw new RpcError(-32002, r.notFound);
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(r.json, null, 2) }],
        };
      }

      default:
        throw new RpcError(-32601, `Method not found: ${method}`);
    }
  }

  /**
   * Read stdin line by line; handle messages one at a time so vault writes and
   * their responses never interleave.
   */
  serveStdio() {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        this.chain = this.chain
          .then(() => this.handleLine(line))
          .catch((e) => {
            log(`fatal while handling a line: ${String(/** @type {any} */ (e).message || e)}`);
          });
      }
    });
    process.stdin.on('end', () => {
      this.chain.then(() => process.exit(0));
    });
    process.stdin.on('error', (e) => {
      log(`stdin error: ${e.message}`);
      process.exit(0);
    });
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(0));
    log('listening on stdio (newline-delimited JSON-RPC 2.0)');
  }
}

// ---------- CLI ----------

function helpText() {
  return [
    'Mnemos MCP server — Model Context Protocol access to a Mnemos memory vault.',
    '',
    'Usage: node src/mcp.js [--vault <dir>] [--skills <dir>] [--help]',
    '',
    '  --vault <dir>    Vault directory holding vault.json (default: ./vault next to',
    '                   the repo root). Created empty if missing — Mnemos never seeds',
    '                   demo memories into a real user vault.',
    '  --skills <dir>   Where skill_export writes <slug>/SKILL.md',
    '                   (default: "skills" alongside the vault directory).',
    '  --http [port]    Not supported — stdio only (see the header of src/mcp.js).',
    '  --help           This message.',
    '',
    'Transport: newline-delimited JSON-RPC 2.0 over stdio. stdout is the protocol',
    'channel; diagnostics go to stderr. Tools: memory_search, memory_remember,',
    'memory_forget, memory_list, vault_snapshot, dream_run, skill_export, sky_shape.',
    'Resources: mnemos://vault/stars, mnemos://vault/timeline, mnemos://vault/skills,',
    'mnemos://memory/{id}.',
    '',
    'Env: MNEMOS_OFFLINE=1 forces dream_run to skip model consolidation.',
    '',
  ].join('\n');
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{vaultDir:string, skillsDir:string, help:boolean, bad:string|null, httpRequested:boolean}} */
  const out = {
    vaultDir: path.join(ROOT, 'vault'),
    skillsDir: '',
    help: false,
    bad: null,
    httpRequested: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--vault') out.vaultDir = path.resolve(argv[++i] || '.');
    else if (a === '--skills') out.skillsDir = path.resolve(argv[++i] || 'skills');
    else if (a === '--http') {
      out.httpRequested = true;
      const next = argv[i + 1];
      if (next && /^\d+$/.test(next)) i += 1;
      out.bad = '--http is not implemented: this server is stdio-only. See the header comment in src/mcp.js for why (Streamable HTTP needs real Mcp-Session-Id + SSE resumability bookkeeping, and both target clients — Hermes Agent and Claude Code — spawn a stdio child process anyway).';
    } else if (a.startsWith('--vault=')) out.vaultDir = path.resolve(a.slice(8));
    else if (a.startsWith('--skills=')) out.skillsDir = path.resolve(a.slice(9));
    else out.bad = out.bad || `unknown argument: ${a}`;
  }
  if (!out.skillsDir) out.skillsDir = path.join(path.dirname(out.vaultDir), 'skills');
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  process.stdout.write(helpText());
  process.exit(0);
}
if (opts.bad) {
  process.stderr.write(`${opts.bad}\n\n${helpText()}`);
  process.exit(2);
}

fs.mkdirSync(opts.vaultDir, { recursive: true });
const server = new MnemosMcp(opts);
await server.boot(opts.vaultDir);
server.serveStdio();
