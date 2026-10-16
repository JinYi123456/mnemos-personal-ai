import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} Provider
 * @property {string} id
 * @property {string} label
 * @property {string} kind      'openai' | 'google'
 * @property {string} baseUrl
 * @property {string} apiKey
 * @property {string} model
 * @property {string} [reasoningModel]
 * @property {string} [frontierModel]
 * @property {string} [embeddingModel]
 * @property {string} [visionModel]
 * @property {boolean} nvidiaModel
 * @property {boolean} [toolsSupported]
 * @property {boolean} [reasoningSupported]
 */

/**
 * Model-family preference used when catalog IDs drift. Ordered best-first.
 * These match features rather than exact IDs so the app survives a rebrand.
 */
const CHAT_PREFERENCE = [
  /nemotron-3-nano/i,
  /nemotron[^/]*nano/i,
  /nemotron/i,
  /qwen3(?!.*embed)/i,
  /deepseek-v3/i,
  /llama-3\.3/i,
  /gpt-oss/i,
  /.*/,
];
const REASONING_PREFERENCE = [
  /nemotron-3-super/i,
  /nemotron[^/]*super/i,
  /deepseek-r1/i,
  /qwen3.*thinking/i,
  /nemotron/i,
];
/** Frontier tier: only used for the nightly synthesis showpiece, never per-turn. */
const FRONTIER_PREFERENCE = [/nemotron-3-ultra/i, /nemotron[^/]*(ultra|super)/i, /nemotron/i];
const EMBEDDING_PREFERENCE = [/qwen3-embedding/i, /embedding/i, /embed/i];
const VISION_PREFERENCE = [/nemotron.*-vl/i, /vision/i, /vl-/i];

/**
 * Token Factory published list prices, USD per 1M tokens, keyed by family pattern
 * (verified against nebius.com/services/token-factory/nemotron, Oct 2026).
 * Override without touching code via NEBIUS_PRICING_JSON='{"nano":[0.06,0.24]}'.
 * @type {Array<[RegExp, {input:number, output:number}]>}
 */
const PRICING = [
  [/nemotron-3-nano|lightning/i, { input: 0.06, output: 0.24 }],
  [/nemotron-3-super|super-vl/i, { input: 0.30, output: 0.90 }],
  [/nemotron-3-ultra/i, { input: 1.00, output: 3.00 }],
  [/embedding/i, { input: 0.01, output: 0 }],
];
const PRICE_OVERRIDES = (() => {
  try {
    const raw = process.env.NEBIUS_PRICING_JSON;
    if (!raw) return [];
    return Object.entries(JSON.parse(raw)).map(
      ([k, v]) => /** @type {[RegExp, {input:number, output:number}]} */ ([new RegExp(k, 'i'), { input: Number(/** @type {any} */ (v)[0]), output: Number(/** @type {any} */ (v)[1]) }]),
    );
  } catch {
    return [];
  }
})();
/** @param {string} model @returns {{input:number, output:number}|null} */
function priceFor(model) {
  const m = String(model || '').toLowerCase();
  for (const [rx, rate] of [...PRICE_OVERRIDES, ...PRICING]) if (rx.test(m)) return rate;
  return null;
}

/**
 * Read .env from disk (no dotenv dependency).
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function readEnvFile(root) {
  /** @type {Record<string, string>} */
  const out = {};
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

/**
 * Build the provider chain in priority order: Nebius Token Factory first
 * (hackathon requirement), then free fallbacks so the app always runs.
 * @param {string} root
 * @returns {Provider[]}
 */
export function buildProviders(root) {
  const env = { ...readEnvFile(root), ...pickProcessEnv() };
  /** @type {Provider[]} */
  const list = [];
  const push = (/** @type {Provider} */ p) => { if (p.apiKey) list.push(p); };

  push({
    id: 'nebius',
    label: 'Nebius Token Factory',
    kind: 'openai',
    baseUrl: env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1',
    apiKey: env.NEBIUS_API_KEY || '',
    model: env.NEBIUS_MODEL || 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
    reasoningModel: env.NEBIUS_REASONING_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
    frontierModel: env.NEBIUS_FRONTIER_MODEL || '',
    embeddingModel: env.NEBIUS_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
    visionModel: env.NEBIUS_VISION_MODEL || '',
    nvidiaModel: true,
  });
  const orModel = env.OPENROUTER_MODEL || 'nvidia/nemotron-nano-9b-v2:free';
  push({
    id: 'openrouter',
    label: 'OpenRouter (free)',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: env.OPENROUTER_API_KEY || '',
    model: orModel,
    reasoningModel: orModel,
    nvidiaModel: /nemotron/i.test(orModel),
  });
  push({
    id: 'groq',
    label: 'Groq (free tier)',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: env.GROQ_API_KEY || '',
    model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    reasoningModel: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    nvidiaModel: false,
  });
  push({
    id: 'google',
    label: 'Google AI Studio (free tier)',
    kind: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: env.GOOGLE_API_KEY || '',
    model: env.GOOGLE_MODEL || 'gemini-2.0-flash',
    reasoningModel: env.GOOGLE_MODEL || 'gemini-2.0-flash',
    nvidiaModel: false,
  });
  push({
    id: 'nvidia',
    label: 'NVIDIA NIM (free credits)',
    kind: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: env.NVIDIA_API_KEY || '',
    model: env.NVIDIA_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct',
    reasoningModel: env.NVIDIA_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct',
    nvidiaModel: true,
  });
  return list;
}

/**
 * Only read known env var names from process.env (never wholesale).
 * @returns {Record<string, string>}
 */
function pickProcessEnv() {
  const keys = [
    'NEBIUS_API_KEY','NEBIUS_BASE_URL','NEBIUS_MODEL','NEBIUS_REASONING_MODEL','NEBIUS_FRONTIER_MODEL','NEBIUS_EMBEDDING_MODEL',
    'OPENROUTER_API_KEY','OPENROUTER_MODEL','GROQ_API_KEY','GROQ_MODEL',
    'NEBIUS_VISION_MODEL','GOOGLE_API_KEY','GOOGLE_MODEL','NVIDIA_API_KEY','NVIDIA_MODEL',
    'TAVILY_API_KEY','PUBLIC_BASE_URL',
  ];
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of keys) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

export class LLM {
  /** @param {Provider[]} providers */
  constructor(providers) {
    this.providers = providers;
    /** @type {string|null} */
    this.activeId = providers.length ? providers[0].id : null;
    /** @type {Record<string, {ok: number, fail: number, lastError?: string}>} */
    this.health = {};
    for (const p of providers) this.health[p.id] = { ok: 0, fail: 0 };
    /** @type {{size:number, at:number, chat?:any, reasoning?:any, frontier?:any, vision?:any}|null} last catalog sync */
    this.catalog = null;
    /** @type {Record<string, any>|null} verbose model metadata keyed by id */
    this.modelMeta = null;
    /**
     * Running spend ledger — every model call is metered so the app can show
     * judges exactly what a turn cost, and stop before burning a credit budget.
     * @type {{calls:number, promptTokens:number, completionTokens:number, reasoningTokens:number, usd:number, byTier:Record<string,{calls:number, usd:number}>}}
     */
    this.spend = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, usd: 0, byTier: {} };
    /** @type {((rec:any)=>void)|null} called after every metered completion */
    this.onCall = null;
  }

  /** @returns {Provider|null} */
  get active() {
    return this.providers.find((p) => p.id === this.activeId) || this.providers[0] || null;
  }

  /** @param {string} id */
  setActive(id) {
    if (this.providers.some((p) => p.id === id)) this.activeId = id;
  }

  status() {
    const p = this.active;
    return {
      active: this.active?.id || null,
      nvidia: !!this.active?.nvidiaModel,
      models: p
        ? { chat: p.model, reasoning: p.reasoningModel || p.model, frontier: p.frontierModel || null, embedding: p.embeddingModel || null }
        : null,
      catalog: this.catalog,
      spend: this.spend,
      chain: this.providers.map((c) => ({
        id: c.id,
        label: c.label,
        model: c.model,
        nvidia: c.nvidiaModel,
        ...(this.health[c.id] || {}),
      })),
    };
  }

  /**
   * Estimated USD cost of one completion from the public per-million token
   * rates. Unknown models cost 0 here and are labelled `estimate: false` so the
   * UI never shows a made-up number.
   * @param {string} model
   * @param {number} promptTokens
   * @param {number} completionTokens
   */
  static costUSD(model, promptTokens, completionTokens) {
    const rate = priceFor(model);
    if (!rate) return { usd: 0, known: false };
    return {
      usd: (promptTokens / 1e6) * rate.input + (completionTokens / 1e6) * rate.output,
      known: true,
    };
  }

  /**
   * Fold one metered completion into the spend ledger.
   * @param {{tier?: string, model?: string, provider?: string, account?: string, usage?: {promptTokens:number, completionTokens:number, reasoningTokens:number, cachedTokens?: number}, ms?: number}} rec
   */
  #meter(rec) {
    const u = rec.usage || { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 };
    const c = LLM.costUSD(rec.model || '', u.promptTokens, u.completionTokens);
    const tier = rec.tier || 'fast';
    this.spend.calls += 1;
    this.spend.promptTokens += u.promptTokens;
    this.spend.completionTokens += u.completionTokens;
    this.spend.reasoningTokens += u.reasoningTokens;
    this.spend.usd += c.usd;
    if (!this.spend.byTier[tier]) this.spend.byTier[tier] = { calls: 0, usd: 0 };
    this.spend.byTier[tier].calls += 1;
    this.spend.byTier[tier].usd += c.usd;
    if (this.onCall) this.onCall({ ...rec, usage: u, cost: c, costKnown: c.known, tier });
  }

  /**
   * Pull the provider's live model catalog and pin every role (chat, reasoning,
   * embedding) to an ID that actually exists right now. Provider catalogs drift
   * (e.g. Nemotron 3 Nano moved from `nano-omni-9b` to `Nano-30B-A3B`), so a
   * pinned ID that was correct last month can hard-fail the whole demo.
   *
 * An explicitly configured ID is kept whenever the catalog still serves it;
   * otherwise the best available model of the same family is chosen.
   * @returns {Promise<{provider:string, chat:string, reasoning:string, embedding:string,
   *                    catalogSize:number, healed:string[], verified:boolean}|null>}
   */
  async syncCatalog() {
    const p = this.active;
    if (!p || p.kind !== 'openai') return null;
    const rows = await this.#listModels(p);
    const ids = (rows || []).map((r) => r.id);
    if (!ids.length) {
      return { provider: p.id, chat: p.model, reasoning: p.reasoningModel || p.model,
        embedding: p.embeddingModel || '', catalogSize: 0, healed: [], verified: false };
    }
    // OpenRouter-style free router IDs must keep their `:free` suffix.
    const freeOnly = /:free$/i.test(p.model);
    const pool = freeOnly ? ids.filter((i) => /:free$/i.test(i)) : ids;
    /** @type {string[]} */
    const healed = [];
    const pin = (/** @type {RegExp[]} */ want, /** @type {string} */ current, /** @type {string} */ role) => {
      if (current && pool.includes(current)) return current;
      for (const rx of want) {
        const hit = pool.find((i) => rx.test(i));
        if (hit) {
          healed.push(`${role}: ${current || 'unset'} → ${hit}`);
          return hit;
        }
      }
      return current;
    };
    p.model = pin(CHAT_PREFERENCE, p.model, 'chat');
    if (p.kind === 'openai') p.reasoningModel = pin(REASONING_PREFERENCE, p.reasoningModel || p.model, 'reasoning');
    if (typeof p.frontierModel === 'string') p.frontierModel = pin(FRONTIER_PREFERENCE, p.frontierModel, 'frontier') || '';
    if (p.embeddingModel || p.id === 'nebius') {
      p.embeddingModel = pin(EMBEDDING_PREFERENCE, p.embeddingModel || '', 'embedding');
    }
    if (typeof p.visionModel === 'string' && p.visionModel) {
      p.visionModel = pin(VISION_PREFERENCE, p.visionModel, 'vision') || '';
    } else if (p.id === 'nebius') {
      // Discover the multimodal tier from the catalog rather than hard-coding it.
      const found = pool.find((i) => VISION_PREFERENCE.some((rx) => rx.test(i)));
      if (found) { p.visionModel = found; healed.push(`vision: auto → ${found}`); }
    }
    // Capability map for the three tiers we actually use — the router reads this
    // instead of discovering tool support by getting a 400 in front of a judge.
    /** @type {Record<string, any>} */
    const meta = Object.fromEntries((rows || []).map((r) => [r.id, r]));
    this.modelMeta = meta;
    const feats = (/** @type {string} */ id) => /** @type {string[]} */ (meta?.[id]?.supported_features || []);
    p.toolsSupported = feats(p.model).length ? feats(p.model).some((f) => /tool|function/i.test(f)) : undefined;
    p.reasoningSupported = feats(p.reasoningModel || p.model).some((f) => /reason/i.test(f));
    this.catalog = {
      size: pool.length,
      at: Date.now(),
      chat: { id: p.model, features: feats(p.model), context: meta?.[p.model]?.context_length, quantization: meta?.[p.model]?.quantization, pricing: meta?.[p.model]?.pricing, limits: meta?.[p.model]?.per_request_limits, regions: (meta?.[p.model]?.regions || []).map((/** @type {any} */ r) => r.name) },
      reasoning: { id: p.reasoningModel, features: feats(p.reasoningModel || p.model) },
      frontier: p.frontierModel ? { id: p.frontierModel, features: feats(p.frontierModel) } : null,
      vision: p.visionModel ? { id: p.visionModel, modality: meta?.[p.visionModel]?.architecture?.modality } : null,
    };
    return {
      provider: p.id,
      chat: p.model,
      reasoning: p.reasoningModel || p.model,
      embedding: p.embeddingModel || '',
      catalogSize: pool.length,
      healed,
      verified: true,
    };
  }

  /**
   * Model catalog with metadata. `?verbose=true` costs one request and returns
   * price, context length, quantization, rate ceiling and — the part that matters
   * — `supported_features`, e.g. ["tools","reasoning"]. If a provider ignores the
   * flag we still get IDs, so the fallback path is just less informed.
   * @param {Provider} p @returns {Promise<any[]|null>}
   */
  async #listModels(p) {
    try {
      const res = await fetch(`${p.baseUrl}/models?verbose=true`, {
        headers: { Authorization: `Bearer ${p.apiKey}` },
        signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
      });
      if (!res.ok) throw new Error(`models ${res.status}`);
      const data = /** @type {any} */ (await res.json());
      const rows = /** @type {any[]} */ (data?.data || []);
      return rows.filter((r) => r && r.id);
    } catch (e) {
      this.health[p.id].lastError = String(/** @type {any} */ (e).message || e);
      return null;
    }
  }

  /**
   * Does the active model officially support native tool calls? Unknown (other
   * providers, no metadata) is treated as "try it", an explicit absence as "no".
   */
  canTools() {
    const p = this.active;
    return !p || p.toolsSupported === undefined ? true : p.toolsSupported;
  }

  /**
   * Machine-readable model card from `GET /v1/models?verbose=true` — published
   * price, context length, rate ceiling, quantization. The under-the-hood drawer
   * reads real numbers off this instead of quoting a blog post.
   * @param {string} model
   */
  async modelCard(model) {
    const p = this.active;
    if (!p || p.kind !== 'openai' || !model) return null;
    // boot already pulled the verbose catalog — serve it from there
    if (this.modelMeta && this.modelMeta[model]) return this.modelMeta[model];
    if (this.#cardCache && this.#cardCache.at > Date.now() - 600000) {
      return this.#cardCache.map[model] || null;
    }
    try {
      const res = await fetch(`${p.baseUrl}/models?verbose=true`, {
        headers: { Authorization: `Bearer ${p.apiKey}` },
      });
      if (!res.ok) return null;
      const data = /** @type {any} */ (await res.json());
      /** @type {Record<string, any>} */
      const map = {};
      for (const m of /** @type {any[]} */ (data?.data || [])) {
        if (m?.id) {
          map[m.id] = {
            id: m.id,
            object: m.object,
            owned_by: m.owned_by,
            created: m.created,
            ...m,
          };
        }
      }
      this.#cardCache = { at: Date.now(), map };
      return map[model] || null;
    } catch {
      return null;
    }
  }

  /** @type {{at:number, map:Record<string,any>}|null} */
  #cardCache = null;

  /**
   * Look at an image with an NVIDIA multimodal open model. The photo never
   * leaves for a third party: it goes to Token Factory and back as a data URL.
   * @param {{prompt: string, dataUrl: string, maxTokens?: number, account?: string}} opts
   * @returns {Promise<{text:string, model:string, provider:string, ms:number, cost:{usd:number, known:boolean}, usage:any}|null>}
   */
  async vision(opts) {
    const ordered = [this.active, ...this.providers.filter((p) => p.id !== this.activeId)].filter(Boolean);
    for (const p of /** @type {Provider[]} */ (ordered)) {
      if (p.kind !== 'openai' || !p.visionModel) continue;
      const t0 = Date.now();
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: p.visionModel,
            // Super-VL is a reasoning model: without the toggle it can spend the
            // whole budget thinking and return content:null.
            messages: [
              { role: 'system', content: '/no_think' },
              { role: 'user', content: [
                { type: 'text', text: opts.prompt },
                { type: 'image_url', image_url: { url: opts.dataUrl } },
              ] },
            ],
            max_tokens: opts.maxTokens ?? 700,
            temperature: 0.2,
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`${p.id} vision ${res.status}: ${t.slice(0, 180)}`);
        }
        const data = /** @type {any} */ (await res.json());
        const msg = data?.choices?.[0]?.message;
        let text = String(msg?.content || '');
        if (!text.trim()) {
          if (data?.choices?.[0]?.message?.reasoning_content) text = String(msg.reasoning_content);
          else throw new Error(`${p.id} vision empty response`);
        }
        const u = data?.usage || {};
        const usage = {
          promptTokens: Number(u.prompt_tokens ?? 0),
          completionTokens: Number(u.completion_tokens ?? 0),
          reasoningTokens: Number(u.completion_tokens_details?.reasoning_tokens ?? 0),
          cachedTokens: Number(u.prompt_tokens_details?.cached_tokens ?? 0),
        };
        this.health[p.id].ok += 1;
        const cost = LLM.costUSD(p.visionModel, usage.promptTokens, usage.completionTokens);
        this.#meter({ tier: 'vision', model: p.visionModel, provider: p.id, usage, ms: Date.now() - t0, account: opts.account });
        return { text: text.trim(), model: p.visionModel, provider: p.id, ms: Date.now() - t0, cost, usage };
      } catch (e) {
        this.health[p.id].fail += 1;
        this.health[p.id].lastError = String(/** @type {any} */ (e).message || e);
        if (LLM.isModelError(String(/** @type {any} */ (e).message || e))) await this.syncCatalog();
      }
    }
    return null;
  }

  /**
   * Back-compatible entry point used by the UI on first load.
   */
  async autodetect() {
    const r = await this.syncCatalog();
    return r ? { provider: r.provider, model: r.chat, verified: r.verified, healed: r.healed } : null;
  }

  /**
   * True when a provider error means "this model ID is gone / unusable", which
   * is worth a catalog re-sync + retry rather than a failover.
   * @param {string} msg
   */
  static isModelError(msg) {
    return /empty response|not found|404|does not exist|unsupported|invalid model|no such model|unknown model/i.test(msg);
  }

  /**
   * One-shot completion. Tries providers in order on failure and re-reads the
   * model catalog once when a failure looks like a stale model ID — that keeps
   * the public demo on Nebius instead of silently failing over to a fallback.
   * @param {{messages: any[], json?: boolean, maxTokens?: number, temperature?: number,
   *          tier?: 'fast'|'reason'|'frontier', tools?: any[], signal?: AbortSignal,
   *          account?: string}} opts
   * @returns {Promise<{text: string, provider: string, model: string, tier: string, ms: number,
   *          usage: {promptTokens:number, completionTokens:number, reasoningTokens:number, cachedTokens:number},
   *          toolCalls: any[], cost: {usd:number, known:boolean}}>}
   */
  async chat(opts) {
    if (!this.providers.length) {
      throw new Error(
        'No language core configured. Add a free API key to .env (see .env.example) — Nebius credits: code NEBIUS-DEVPOST-GLOBAL26 at nebius.com/promo-code, or use free OpenRouter/Groq/Google keys.',
      );
    }
    const tier = opts.tier || 'fast';
    /** @type {Error[]} */
    const errors = [];
    const ordered = [this.active, ...this.providers.filter((p) => p.id !== this.activeId)]
      .filter(Boolean);
    for (const p of /** @type {Provider[]} */ (ordered)) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const t0 = Date.now();
        try {
          const raw = p.kind === 'google'
            ? { text: await this.#google(p, opts), model: p.model, usage: {}, toolCalls: [] }
            : await this.#openai(p, opts, tier);
          const u = /** @type {any} */ (raw.usage || {});
          const usage = {
            promptTokens: Number(u.prompt_tokens ?? u.input_tokens ?? 0),
            completionTokens: Number(u.completion_tokens ?? u.output_tokens ?? 0),
            reasoningTokens: Number(u.completion_tokens_details?.reasoning_tokens ?? 0),
            cachedTokens: Number(u.prompt_tokens_details?.cached_tokens ?? 0),
          };
          this.health[p.id].ok += 1;
          if (this.activeId !== p.id) this.activeId = p.id; // sticky failover
          const model = raw.model || p.model;
          const cost = LLM.costUSD(model, usage.promptTokens, usage.completionTokens);
          const out = {
            text: raw.text, provider: p.id, model, tier, ms: Date.now() - t0, usage,
            toolCalls: raw.toolCalls || [], cost,
          };
          this.#meter({ tier, model, provider: p.id, usage, ms: out.ms, account: opts.account });
          return out;
        } catch (e) {
          const err = /** @type {Error} */ (e);
          // Token Factory rate limits are per-minute and return 429 once sustained;
          // backing off the same provider beats failing over off Nebius.
          if (attempt === 0 && /429|over.limit/i.test(err.message)) {
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
          if (attempt === 0 && p.kind === 'openai' && LLM.isModelError(err.message)) {
            const healed = await this.syncCatalog();
            if (healed && healed.healed && healed.healed.length) continue;
          }
          this.health[p.id].fail += 1;
          this.health[p.id].lastError = err.message;
          errors.push(err);
          break;
        }
      }
    }
    throw new Error(`All providers failed: ${errors.map((e) => e.message).join(' | ')}`);
  }

  /**
   * OpenAI-compatible chat completion (Nebius, OpenRouter, Groq, NVIDIA).
   * @param {Provider} p
   * @param {{messages: any[], json?: boolean, maxTokens?: number, temperature?: number,
   *          reasoning?: boolean, tier?: string, tools?: any[], signal?: AbortSignal}} opts
   * @param {string} [tier]
   * @returns {Promise<{text: string, model: string, usage: any, toolCalls: any[]}>}
   */
  async #openai(p, opts, tier) {
    const wantReason = tier === 'frontier' || tier === 'reason' || opts.reasoning === true;
    const model = tier === 'frontier' && p.frontierModel
      ? p.frontierModel
      : (tier === 'reason' && p.reasoningModel ? p.reasoningModel : p.model);
    const body = /** @type {any} */ ({
      model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 1200,
      temperature: opts.temperature ?? 0.7,
    });
    // Nemotron reasoning models spend their budget thinking unless toggled off;
    // an empty `content` (burned on reasoning) would break the tool loop.
    // NEBIUS_KEEP_REASONING=1 leaves the toggle out so you can measure reasoning.
    if (/nemotron/i.test(model) && !wantReason && process.env.NEBIUS_KEEP_REASONING !== '1') {
      body.messages = [{ role: 'system', content: '/no_think' }, ...opts.messages];
    }
    // Reasoning tiers need room to think before the answer, and JSON mode is
    // dropped for them — a thinking model forced to obey a response schema has
    // historically returned an empty `content` here.
    if (wantReason) {
      body.max_tokens = Math.max(3000, opts.maxTokens ?? 0);
    } else if (opts.json) {
      body.response_format = { type: 'json_object' };
    }
    // Native function calling: every Nemotron 3 model on Token Factory is tagged
    // `function_calling`, so the agent loop uses real tool_calls instead of a
    // hand-rolled JSON protocol. `tool_choice` only accepts "auto" here.
    if (opts.tools && opts.tools.length) {
      body.tools = opts.tools;
      body.tool_choice = 'auto';
    }
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        'Content-Type': 'application/json',
        ...(p.id === 'openrouter'
          ? { 'HTTP-Referer': 'https://github.com/softmatter-labs/mnemos', 'X-Title': 'Mnemos' }
          : {}),
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`${p.id} ${res.status}: ${t.slice(0, 220)}`);
    }
    const data = /** @type {any} */ (await res.json());
    const msg = data?.choices?.[0]?.message;
    let text = String(msg?.content || '');
    // Reasoning models return hidden thinking under `reasoning` (Nemotron 3)
    // or `reasoning_content` (DeepSeek-style). If content is empty because the
    // budget was spent thinking, fall back so the call never hard-fails.
    if (!text && msg?.reasoning_content) text = String(msg.reasoning_content);
    if (!text && msg?.reasoning) text = String(msg.reasoning);
    const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
    // A reply that is only tool calls is a valid, non-empty completion.
    if (!text.trim() && !toolCalls.length) throw new Error(`${p.id} empty response`);
    return { text, model, usage: data?.usage || {}, toolCalls };
  }

  /**
   * Google generateContent (free tier fallback).
   * @param {Provider} p
   * @param {{messages: {role: string, content: string}[], json?: boolean, maxTokens?: number, reasoning?: boolean, signal?: AbortSignal}} opts
   * @returns {Promise<string>}
   */
  async #google(p, opts) {
    const sys = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const res = await fetch(
      `${p.baseUrl}/models/${encodeURIComponent(p.model)}:generateContent?key=${encodeURIComponent(p.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
          generationConfig: {
            maxOutputTokens: opts.maxTokens ?? 1200,
            temperature: 0.7,
            ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: opts.signal,
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`google ${res.status}: ${t.slice(0, 220)}`);
    }
    const data = /** @type {any} */ (await res.json());
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((/** @type {any} */ part) => part.text || '')
      .join('');
    if (!text.trim()) throw new Error('google empty response');
    return text;
  }

  /**
   * Embed a batch of texts. Tries providers in order; returns null when no
   * provider supports embeddings — callers must degrade to lexical recall.
   * @param {string[]} texts
   * @param {string} [account] who is paying (spend ledger)
   * @returns {Promise<{vectors: number[][], provider: string, model: string, usd: number}|null>}
   */
  async embed(texts, account) {
    /** @type {Error[]} */
    const errors = [];
    const ordered = [this.active, ...this.providers.filter((p) => p.id !== this.activeId)]
      .filter(Boolean);
    for (const p of /** @type {Provider[]} */ (ordered)) {
      if (p.kind !== 'openai') {
        errors.push(new Error(`${p.id}: embeddings not supported for kind '${p.kind}'`));
        continue;
      }
      try {
        const model = p.embeddingModel || 'Qwen/Qwen3-Embedding-8B';
        const res = await fetch(`${p.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, input: texts }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`${p.id} embeddings ${res.status}: ${t.slice(0, 160)}`);
        }
        const data = /** @type {any} */ (await res.json());
        const rows = /** @type {any[]} */ (data?.data || []);
        const vectors = rows
          .slice()
          .sort((a, b) => (a.index || 0) - (b.index || 0))
          .map((r) => /** @type {number[]} */ (r.embedding || []));
        if (vectors.length !== texts.length || vectors.some((v) => !v.length)) {
          throw new Error(`${p.id}: embedding count/dimension mismatch`);
        }
        this.health[p.id].ok += 1;
        const promptTokens = Number(data?.usage?.prompt_tokens ?? 0) || Math.ceil(texts.join(' ').length / 4);
        const cost = LLM.costUSD(model, promptTokens, 0);
        this.#meter({ tier: 'embed', model, provider: p.id, account, ms: 0, usage: { promptTokens, completionTokens: 0, reasoningTokens: 0, cachedTokens: 0 } });
        return { vectors, provider: p.id, model, usd: cost.usd };
      } catch (e) {
        const err = /** @type {Error} */ (e);
        this.health[p.id].fail += 1;
        this.health[p.id].lastError = err.message;
        errors.push(err);
      }
    }
    if (errors.length) {
      console.warn(`  embeddings unavailable: ${errors.map((e) => e.message).join(' | ').slice(0, 200)}`);
    }
    return null;
  }

  /**
   * Robust JSON extraction: strips fences / leading prose / trailing commas.
   * @param {string} raw
   * @returns {any}
   */
  static parseJSON(raw) {
    let s = String(raw).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const start = Math.min(
      ...[s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0).concat([Number.MAX_SAFE_INTEGER]),
    );
    if (start < s.length && start > 0) s = s.slice(start);
    const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (lastBrace >= 0) s = s.slice(0, lastBrace + 1);
    try {
      return JSON.parse(s);
    } catch {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    }
  }
}
