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
 * @property {string} [embeddingModel]
 * @property {boolean} nvidiaModel
 */

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
    model: env.NEBIUS_MODEL || 'nvidia/nemotron-3-nano-omni-9b-v2',
    reasoningModel: env.NEBIUS_REASONING_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
    embeddingModel: env.NEBIUS_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
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
    'NEBIUS_API_KEY','NEBIUS_BASE_URL','NEBIUS_MODEL','NEBIUS_REASONING_MODEL','NEBIUS_EMBEDDING_MODEL',
    'OPENROUTER_API_KEY','OPENROUTER_MODEL','GROQ_API_KEY','GROQ_MODEL',
    'GOOGLE_API_KEY','GOOGLE_MODEL','NVIDIA_API_KEY','NVIDIA_MODEL',
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
    return {
      active: this.active?.id || null,
      nvidia: !!this.active?.nvidiaModel,
      chain: this.providers.map((p) => ({
        id: p.id,
        label: p.label,
        model: p.model,
        nvidia: p.nvidiaModel,
        ...(this.health[p.id] || {}),
      })),
    };
  }

  /**
   * Probe GET /models on the active OpenAI-compatible provider and pick a
   * model that actually exists (autodetect; keeps IDs correct over time).
   */
  async autodetect() {
    const p = this.active;
    if (!p || p.kind !== 'openai') return null;
    try {
      const res = await fetch(`${p.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${p.apiKey}` },
      });
      if (!res.ok) throw new Error(`models ${res.status}`);
      const data = /** @type {any} */ (await res.json());
      const ids = /** @type {string[]} */ ((/** @type {any[]} */ (data?.data || [])).map((/** @type {any} */ m) => m.id));
      const want = [/nemotron-3/i, /nemotron/i, /qwen3/i, /deepseek/i, /llama/i, // eslint-disable-line
        /gpt-oss/i, /mistral/i, /.*/];
      for (const rx of want) {
        const hit = ids.find((i) => rx.test(i) && i === p.model)
          || ids.find((i) => rx.test(i));
        if (hit) {
          p.model = hit;
          return { provider: p.id, model: hit, verified: true };
        }
      }
      return { provider: p.id, model: p.model, verified: false };
    } catch (e) {
      this.health[p.id].lastError = String(/** @type {any} */ (e).message || e);
      return { provider: p.id, model: p.model, verified: false, error: this.health[p.id].lastError };
    }
  }

  /**
   * One-shot completion returning text. Tries providers in order on failure.
   * @param {{messages: {role: string, content: string}[], json?: boolean, maxTokens?: number, reasoning?: boolean, signal?: AbortSignal}} opts
   * @returns {Promise<{text: string, provider: string, model: string}>}
   */
  async chat(opts) {
    if (!this.providers.length) {
      throw new Error(
        'No language core configured. Add a free API key to .env (see .env.example) — Nebius credits: code NEBIUS-DEVPOST-GLOBAL26 at nebius.com/promo-code, or use free OpenRouter/Groq/Google keys.',
      );
    }
    /** @type {Error[]} */
    const errors = [];
    const ordered = [this.active, ...this.providers.filter((p) => p.id !== this.activeId)]
      .filter(Boolean);
    for (const p of /** @type {Provider[]} */ (ordered)) {
      try {
        const text = p.kind === 'google'
          ? await this.#google(p, opts)
          : await this.#openai(p, opts);
        this.health[p.id].ok += 1;
        if (this.activeId !== p.id) this.activeId = p.id; // sticky failover
        return { text, provider: p.id, model: p.model };
      } catch (e) {
        const err = /** @type {Error} */ (e);
        this.health[p.id].fail += 1;
        this.health[p.id].lastError = err.message;
        errors.push(err);
      }
    }
    throw new Error(`All providers failed: ${errors.map((e) => e.message).join(' | ')}`);
  }

  /**
   * OpenAI-compatible chat completion (Nebius, OpenRouter, Groq, NVIDIA).
   * @param {Provider} p
   * @param {{messages: {role: string, content: string}[], json?: boolean, maxTokens?: number, reasoning?: boolean, signal?: AbortSignal}} opts
   * @returns {Promise<string>}
   */
  async #openai(p, opts) {
    const model = opts.reasoning && p.reasoningModel ? p.reasoningModel : p.model;
    const body = /** @type {any} */ ({
      model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 1200,
      temperature: 0.7,
    });
    if (opts.json) body.response_format = { type: 'json_object' };
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
    if (msg?.reasoning_content && !text) text = String(msg.reasoning_content);
    if (!text.trim()) throw new Error(`${p.id} empty response`);
    return text;
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
   * @returns {Promise<{vectors: number[][], provider: string, model: string}|null>}
   */
  async embed(texts) {
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
        return { vectors, provider: p.id, model };
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
