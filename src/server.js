import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Vaults } from './sessions.js';
import { Gate } from './limits.js';
import { LLM, buildProviders, readEnvFile } from './llm.js';
import { Brain } from './brain.js';
import { Dreamer } from './dream.js';
import { NightDreamer } from './night.js';
import { ablate } from './ablation.js';
import { safeText, num } from './util.js';
import { seedDemoVault } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = num(process.env.PORT, 8787) || 8787;
const PUBLIC_DIR = path.join(ROOT, 'public');

/**
 * Demo mode vs owner mode.
 *
 * Owner mode (MNEMOS_SINGLE_VAULT=1, the default when you run this on your own
 * machine) keeps one vault on disk — the one you actually live in, the one the
 * MCP server and the nightly dream share. Demo mode gives every visitor their
 * own vault directory and their own cookie, because a public sandbox where a
 * judge reads a stranger's memories would break the only promise this app makes.
 */
const SINGLE_VAULT = /^(1|true|yes)$/i.test(process.env.MNEMOS_SINGLE_VAULT || '');
const VAULT_DIR = path.join(ROOT, 'vault');
const SESSION_ROOT = path.join(ROOT, 'vaults');
const COOKIE = 'mnemos_sid';

// First run: create .env from the example so the user just fills keys in.
if (!fs.existsSync(path.join(ROOT, '.env'))) {
  fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, '.env'));
}

// ---------- boot ----------
const env = { ...readEnvFile(ROOT), ...process.env };
const vaults = new Vaults(SESSION_ROOT, {
  ttlDays: num(env.VAULT_TTL_DAYS, 45),
  onLog: (m) => console.log(`  ✦ ${m}`),
});
/** @type {Store|null} the single owner vault, when not in demo mode */
let ownerStore = null;
if (SINGLE_VAULT) {
  ownerStore = new Store(VAULT_DIR);
  await ownerStore.load();
  if (ownerStore.vault.memories.length === 0) {
    seedDemoVault(ownerStore);
    await ownerStore.flush();
  }
}

const llm = new LLM(buildProviders(ROOT));
const gate = new Gate({
  turnsPerMinutePerIp: num(env.GATE_TURNS_PER_MIN, 6),
  turnsPerHourPerSession: num(env.GATE_TURNS_PER_HOUR, 30),
  dailyTokensPerSession: num(env.GATE_TOKENS_PER_DAY, 400000),
  dailyUsdPerSession: num(env.GATE_USD_PER_SESSION, 0.75),
  dailyUsdHost: num(env.GATE_USD_HOST, 8),
});
// Every metered model call is charged back to the visitor who triggered it, so
// one person cannot spend the whole host budget — and so the under-the-hood
// drawer can say exactly what a turn cost.
llm.onCall = (/** @type {any} */ rec) => gate.addCall({
  sid: String(rec.account || 'owner'),
  tokens: rec.usage.promptTokens + rec.usage.completionTokens,
  usd: rec.cost.usd,
});

/**
 * Per-request services: the brain and dreamer are thin wrappers over a store,
 * so they are cheap to build and they carry the session id with them.
 * @param {Store} store
 * @param {string} sid
 */
function servicesFor(store, sid) {
  const brain = new Brain(store, llm, env.TAVILY_API_KEY || '', env.PUBLIC_BASE_URL || '', { account: sid });
  const dreamer = new Dreamer(store, llm, {
    searcher: brain.tavilyKey
      ? { search: (/** @type {string} */ q) => brain.execSearch(q) }
      : null,
    account: sid,
  });
  return { brain, dreamer };
}

/**
 * Pin every model ID to what the provider catalog serves *today* before the
 * first call. Catalogs drift (Nano-Omni was deprecated mid-hackathon), and a
 * stale pinned ID would otherwise take the whole public demo down.
 */
const boot = await llm.syncCatalog();
if (boot && boot.healed && boot.healed.length) {
  console.log(`  ✦ catalog self-heal on ${boot.provider}:`);
  for (const h of boot.healed) console.log(`    ${h}`);
}

// The nightly dream belongs to the owner's own machine, never to a sandbox.
let night = null;
if (SINGLE_VAULT && ownerStore) {
  night = new NightDreamer(ownerStore, llm, { log: (m) => console.log(`  ✦ ${m}`) });
  night.catchUpAtBoot().catch(() => {});
  night.start();
}

// Idle sandbox vaults expire — part of the privacy promise, not a footnote.
if (!SINGLE_VAULT) {
  const sweep = setInterval(() => { vaults.sweep().catch(() => {}); }, 6 * 3600_000);
  sweep.unref?.();
  vaults.sweep().catch(() => {});
}

// ---------- static files ----------
const MIME = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
});

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function serveStatic(req, res) {
  const url = new URL(req.url || '/', 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    // SPA fallback for extension-less paths
    if (!p.includes('.')) {
      sendFile(res, path.join(PUBLIC_DIR, 'index.html'), MIME['.html']);
    } else {
      res.writeHead(404).end('not found');
    }
    return;
  }
  const ext = path.extname(file).toLowerCase();
  sendFile(res, file, MIME[ext] || 'application/octet-stream');
}

/**
 * @param {http.ServerResponse} res
 * @param {string} file
 * @param {string} type
 */
function sendFile(res, file, type) {
  const stream = fs.createReadStream(file);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  stream.pipe(res);
  stream.on('error', () => res.end());
}

// ---------- cookies ----------
/** @param {http.IncomingMessage} req @returns {Record<string,string>} */
function parseCookies(req) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * @param {http.ServerResponse} res
 * @param {string} sid
 * @param {boolean} [clear]
 */
function setSessionCookie(res, sid, clear = false) {
  const secure = /^https:/.test(env.PUBLIC_BASE_URL || '') ? '; Secure' : '';
  const attrs = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 60 * 60 * 24 * 365}${secure}`;
  const head = res.getHeader('Set-Cookie');
  /** @type {string[]} */
  const prior = Array.isArray(head) ? head.map(String) : head ? [String(head)] : [];
  res.setHeader('Set-Cookie', [...prior, `${COOKIE}=${sid || ''}${attrs}`]);
}

// ---------- API ----------
/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function api(req, res) {
  const url = new URL(req.url || '/', 'http://x');
  const p = url.pathname;

  if (p === '/api/health') {
    return json(res, { ok: true, t: Date.now() });
  }

  // --- resolve who is being served ---
  const cookies = parseCookies(req);
  const ip = clientIp(req);
  let sid = SINGLE_VAULT ? 'owner' : Vaults.cleanId(cookies[COOKIE]);
  let isNew = false;
  if (!SINGLE_VAULT && !sid) {
    if (gate.allowNewSession(ip)) {
      sid = Vaults.newId();
      isNew = true;
      setSessionCookie(res, sid);
    } else {
      // This IP is creating vaults faster than anyone should: serve it a sky,
      // but set no cookie, so nothing it writes survives the reload.
      sid = Vaults.newId();
    }
  }
  if (!sid) {
    sid = Vaults.newId();
    setSessionCookie(res, sid);
  }
  let store;
  try {
    store = SINGLE_VAULT && ownerStore ? ownerStore : await vaults.open(sid);
  } catch {
    sid = Vaults.newId();
    setSessionCookie(res, sid);
    store = await vaults.open(sid);
  }
  const { brain, dreamer } = servicesFor(store, sid);

  if (p === '/api/session') {
    return json(res, { sid, isNew, mode: SINGLE_VAULT ? 'owner' : 'sandbox' });
  }
  if (p === '/api/status') {
    return json(res, {
      provider: llm.status(),
      tavily: !!brain.tavilyKey,
      mode: SINGLE_VAULT ? 'owner' : 'sandbox',
      vault: {
        owner: store.vault.owner,
        memories: store.vault.memories.length,
        insights: store.vault.insights.length,
        skills: store.vault.skills.length,
        dreamCount: store.vault.dreamCount,
        lastDreamAt: store.vault.lastDreamAt,
      },
      budget: gate.remaining(clientIp(req), sid),
    });
  }
  if (p === '/api/meter') {
    return json(res, {
      spend: llm.spend,
      catalog: llm.catalog,
      models: llm.active
        ? { chat: llm.active.model, reasoning: llm.active.reasoningModel, frontier: llm.active.frontierModel, embedding: llm.active.embeddingModel }
        : null,
      budget: gate.remaining(clientIp(req), sid),
      sessions: vaults.stats(),
    });
  }
  if (p === '/api/modelcard') {
    // Machine-readable pricing + limits straight from Token Factory.
    const card = await llm.modelCard(llm.active?.model || '');
    return json(res, card || { error: 'catalog unavailable' });
  }
  if (p === '/api/galaxy') {
    return json(res, store.snapshot());
  }
  if (p === '/api/autodetect' && req.method === 'POST') {
    const r = await llm.syncCatalog();
    return json(res, r ? { provider: r.provider, model: r.chat, verified: r.verified, healed: r.healed } : { verified: false, error: 'no provider' });
  }
  if (p === '/api/provider' && req.method === 'POST') {
    const body = await readBody(req);
    llm.setActive(safeText(body.id, 40));
    return json(res, { ok: true, provider: llm.status() });
  }
  if (p === '/api/owner' && req.method === 'POST') {
    const body = await readBody(req);
    store.setOwner(safeText(body.name, 40));
    await store.flush();
    return json(res, { ok: true, owner: store.vault.owner });
  }
  if (p === '/api/timeline') {
    const now = Date.now();
    return json(res, {
      memories: store.vault.memories
        .map((m) => ({
          id: `M${m.id.slice(0, 8)}`,
          text: m.text,
          tags: m.tags,
          source: m.source,
          uses: m.uses,
          created: m.created,
          ageDays: Math.max(0, (now - m.created) / 86400000),
        }))
        .sort((a, b) => b.created - a.created)
        .slice(0, 200),
    });
  }
  if (p === '/api/memories') {
    return json(res, {
      memories: store.vault.memories.map((m) => ({
        id: `M${m.id.slice(0, 8)}`,
        text: m.text,
        tags: m.tags,
        uses: m.uses,
        created: m.created,
        source: m.source,
      })),
    });
  }
  if (p === '/api/insights') {
    return json(res, { insights: store.vault.insights.slice(0, 50) });
  }
  if (p === '/api/skills') {
    return json(res, { skills: store.vault.skills });
  }
  if (p === '/api/redzone' && req.method === 'POST') {
    const body = await readBody(req);
    const topics = Array.isArray(body.topics) ? body.topics : [];
    store.setRedZone(topics);
    await store.flush();
    return json(res, { ok: true, redZone: store.vault.redZone });
  }
  if (p === '/api/redzone') {
    return json(res, { redZone: store.vault.redZone });
  }
  if (p === '/api/constellation/name' && req.method === 'POST') {
    const body = await readBody(req);
    const ins = store.setInsightName(safeText(body.id, 60), safeText(body.name, 40));
    if (!ins) return json(res, { ok: false, error: 'no such constellation' }, 404);
    await store.flush();
    return json(res, { ok: true, insight: ins });
  }
  if (p === '/api/embed/backfill' && req.method === 'POST') {
    const n = await brain.backfillEmbeddings(24);
    await store.flush();
    return json(res, { ok: true, embedded: n, total: store.vault.memories.length });
  }
  if (p === '/api/chat' && req.method === 'POST') {
    return handleChat(req, res, { store, brain, sid });
  }
  if (p === '/api/ablation' && req.method === 'POST') {
    const body = await readBody(req);
    const short = safeText(body.id, 20).replace(/^M/, '');
    const full = store.vault.memories.find((m) => m.id.startsWith(short));
    if (!full) return json(res, { ok: false, error: 'no such memory' }, 404);
    const q = safeText(body.query, 800) || 'What do you remember about me?';
    const allowed = gate.check({ ip: clientIp(req), sid });
    if (!allowed.ok) return json(res, budgetReply(allowed), 429);
    gate.take({ ip: clientIp(req), sid });
    const out = await ablate(brain, store, { query: q, holdoutId: full.id });
    await store.flush();
    return json(res, out);
  }
  if (p === '/api/dream' && req.method === 'POST') {
    return handleDream(res, { dreamer, sid, ip });
  }
  if (p === '/api/forget' && req.method === 'POST') {
    const body = await readBody(req);
    const short = safeText(body.id, 20).replace(/^M/, '');
    const full = store.vault.memories.find((m) => m.id.startsWith(short));
    if (!full) return json(res, { ok: false, error: 'no such memory' }, 404);
    store.removeMemory(full.id);
    await store.flush();
    return json(res, { ok: true });
  }
  if (p === '/api/star/pos' && req.method === 'POST') {
    const body = await readBody(req);
    const short = safeText(body.id, 20).replace(/^M/, '');
    const full = store.vault.memories.find((m) => m.id.startsWith(short));
    if (!full) return json(res, { ok: false, error: 'no such memory' }, 404);
    const pos = store.setStarPos(full.id, Number(body.x) || 0, Number(body.y) || 0, Number(body.w) || 0, Number(body.h) || 0);
    if (!pos) return json(res, { ok: false, error: 'bad position' }, 400);
    await store.flush();
    return json(res, { ok: true, id: `M${full.id.slice(0, 8)}`, layout: pos });
  }
  if (p === '/api/layout/reset' && req.method === 'POST') {
    store.clearLayout();
    await store.flush();
    return json(res, { ok: true });
  }
  if (p === '/api/layout' && req.method === 'POST') {
    // Persist a whole arrangement (shape applied by the client or the agent).
    const body = await readBody(req);
    const layout = body.layout;
    if (!layout || typeof layout !== 'object') return json(res, { ok: false, error: 'bad layout' }, 400);
    store.vault.layout = {};
    for (const [id, pos] of Object.entries(layout)) {
      const p2 = /** @type {{x:number,y:number}} */ (pos);
      if (store.vault.memories.some((m) => m.id.startsWith(id)) && Number.isFinite(p2?.x) && Number.isFinite(p2?.y)) {
        store.vault.layout[id] = { x: Math.min(1, Math.max(0, p2.x)), y: Math.min(1, Math.max(0, p2.y)) };
      }
    }
    await store.flush();
    return json(res, { ok: true, placed: Object.keys(store.vault.layout).length });
  }
  if (p === '/api/export') {
    const exp = SINGLE_VAULT
      ? { file: path.join(VAULT_DIR, 'vault.json'), size: fs.existsSync(path.join(VAULT_DIR, 'vault.json')) ? fs.statSync(path.join(VAULT_DIR, 'vault.json')).size : 0 }
      : await vaults.exportPath(sid);
    if (!exp || !fs.existsSync(exp.file)) return json(res, { error: 'nothing to export' }, 404);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="mnemos-vault.json"`,
      'Content-Length': String(exp.size),
    });
    fs.createReadStream(exp.file).pipe(res);
    return;
  }
  if (p === '/api/import' && req.method === 'POST') {
    if (SINGLE_VAULT) return json(res, { ok: false, error: 'owner mode: drop the file into vault/ instead' }, 400);
    const body = await readBody(req);
    const out = await vaults.importInto(sid, typeof body.raw === 'string' ? body.raw : body.vault);
    if (!out) return json(res, { ok: false, error: 'not a Mnemos vault file' }, 400);
    return json(res, { ok: true, ...out });
  }
  if (p === '/api/burn' && req.method === 'POST') {
    if (SINGLE_VAULT) return json(res, { ok: false, error: 'refusing to burn your own vault from a web request' }, 400);
    const gone = await vaults.destroy(sid);
    setSessionCookie(res, '', true);
    return json(res, { ok: gone, gone });
  }
  if (p === '/api/reset' && req.method === 'POST') {
    store.vault = {
      memories: [],
      insights: [],
      skills: [],
      redZone: store.vault.redZone,
      owner: store.vault.owner,
      startedAt: Date.now(),
      dreamCount: 0,
      lastDreamAt: null,
      layout: {},
    };
    seedDemoVault(store);
    await store.flush();
    return json(res, { ok: true });
  }
  return json(res, { error: 'not found' }, 404);
}

/**
 * Only data URLs are accepted, and only images: a visitor cannot make the server
 * fetch a remote URL through the vision path.
 * @param {unknown} raw
 */
function readImageDataUrl(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]{16,}$/i.test(s)) return null;
  // ~1.5 MB of source image is plenty for a whiteboard or screenshot
  return s.length <= 2_000_000 ? s : null;
}

/** @param {http.IncomingMessage} req */
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.socket?.remoteAddress || 'unknown');
}

/** @param {{reason?:string, retryAfterMs?:number}} allowed */
function budgetReply(allowed) {
  /** @type {Record<string, string>} */
  const copy = {
    ip_rate: 'That is a lot of questions at once. Mnemos pauses for a minute so the demo stays available to everyone.',
    session_rate: 'You have used this sandbox hour fairly hard. It refills on the hour.',
    session_budget: 'This sandbox has reached its daily model budget. Your sky is safe — ask again tomorrow, or run Mnemos on your own machine with your own key.',
    host_budget: 'The demo host budget for today is spent. Mnemos still remembers everything; generation is resting.',
    dream_rate: 'Dreaming takes the big model. Give this sky a little time between dreams.',
  };
  return {
    ok: false,
    resting: true,
    error: copy[/** @type {any} */ (allowed.reason)] || 'resting',
    reason: allowed.reason,
    retryAfterMs: allowed.retryAfterMs || 60000,
  };
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {{store: Store, brain: Brain, sid: string}} ctx
 */
async function handleChat(req, res, ctx) {
  const body = await readBody(req);
  const text = safeText(body.text, 4000);
  const image = readImageDataUrl(body.image);
  if (!text && !image) return json(res, { error: 'empty message' }, 400);
  const allowed = gate.check({ ip: clientIp(req), sid: ctx.sid });
  if (!allowed.ok) return json(res, budgetReply(allowed), 429);
  gate.take({ ip: clientIp(req), sid: ctx.sid });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  /** @type {NodeJS.Timeout|null} */
  let ping = null;
  try {
    ping = setInterval(() => res.write(': ping\n\n'), 15000);
    const result = await ctx.brain.runTurn({
      text,
      image,
      emit: (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`),
    });
    res.write(`data: ${JSON.stringify({ type: 'done', ...result, budget: gate.remaining(clientIp(req), ctx.sid) })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: String(/** @type {any} */ (e).message || e) })}\n\n`);
  } finally {
    if (ping) clearInterval(ping);
    res.end();
  }
}

/**
 * @param {http.ServerResponse} res
 * @param {{dreamer: Dreamer, sid: string, ip: string}} ctx
 */
async function handleDream(res, ctx) {
  if (ctx.dreamer.running) return json(res, { error: 'already dreaming' }, 409);
  const allowed = gate.check({ ip: ctx.ip, sid: ctx.sid, kind: 'dream' });
  if (!allowed.ok) return json(res, budgetReply(allowed), 429);
  gate.take({ ip: ctx.ip, sid: ctx.sid, kind: 'dream' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  /** @type {NodeJS.Timeout|null} */
  let ping = null;
  try {
    ping = setInterval(() => res.write(': ping\n\n'), 15000);
    await ctx.dreamer.run((ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
  } catch (e) {
    res.write(`data: ${JSON.stringify({ phase: 'error', error: String(/** @type {any} */ (e).message || e) })}\n\n`);
  } finally {
    if (ping) clearInterval(ping);
    res.end();
  }
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (/** @type {any} */ c) => {
      data += c;
      if (data.length > 100000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * @param {http.ServerResponse} res
 * @param {any} obj
 * @param {number} [code=200]
 */
function json(res, obj, code = 200) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(s);
}

// ---------- server ----------
const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) {
    api(req, res).catch((e) => {
      try {
        json(res, { error: String(/** @type {any} */ (e).message || e) }, 500);
      } catch { /* response already gone */ }
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✦ Mnemos is awake');
  console.log(`    http://localhost:${PORT}`);
  console.log(`    memory mode: ${SINGLE_VAULT ? 'owner vault (vault/)' : 'one sandbox vault per visitor (vaults/)'}`);
  console.log('');
  console.log(`  LLM: ${llm.active ? `${llm.active.label} · ${llm.active.model}` : 'NO PROVIDER — add a key in .env (galaxy + memories + decay work offline; generation needs a model)'}`);
  console.log(`  Tavily web search: ${process.env.TAVILY_API_KEY || readEnvFile(ROOT).TAVILY_API_KEY ? 'enabled' : 'off (add a free key in .env)'}`);
  console.log('');
});

// graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n  Mnemos is going to sleep. Vault saved.');
    if (night) night.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
