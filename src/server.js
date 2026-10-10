import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { LLM, buildProviders, readEnvFile } from './llm.js';
import { Brain } from './brain.js';
import { Dreamer } from './dream.js';
import { NightDreamer } from './night.js';
import { safeText, num } from './util.js';
import { seedDemoVault } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = num(process.env.PORT, 8787) || 8787;
const PUBLIC_DIR = path.join(ROOT, 'public');
const VAULT_DIR = path.join(ROOT, 'vault');

// First run: create .env from the example so the user just fills keys in.
if (!fs.existsSync(path.join(ROOT, '.env'))) {
  fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, '.env'));
}

// ---------- boot ----------
const store = new Store(VAULT_DIR);
await store.load();
if (store.vault.memories.length === 0) {
  seedDemoVault(store);
  await store.flush();
}

const env = readEnvFile(ROOT);
const llm = new LLM(buildProviders(ROOT));
const brain = new Brain(store, llm, env.TAVILY_API_KEY || process.env.TAVILY_API_KEY || '', env.PUBLIC_BASE_URL || '');
const dreamer = new Dreamer(store, llm);
const night = new NightDreamer(store, llm, { log: (m) => console.log(`  ✦ ${m}`) });

// Gentle boot catch-up if yesterday had no dream, then schedule 03:30 nightly.
night.catchUpAtBoot().catch(() => {});
night.start();

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
  if (p === '/api/status') {
    return json(res, {
      provider: llm.status(),
      tavily: !!brain.tavilyKey,
      vault: {
        owner: store.vault.owner,
        memories: store.vault.memories.length,
        insights: store.vault.insights.length,
        skills: store.vault.skills.length,
        dreamCount: store.vault.dreamCount,
        lastDreamAt: store.vault.lastDreamAt,
      },
    });
  }
  if (p === '/api/galaxy') {
    return json(res, store.snapshot());
  }
  if (p === '/api/autodetect' && req.method === 'POST') {
    const r = await llm.autodetect();
    return json(res, r || { verified: false, error: 'no provider' });
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
    return handleChat(req, res);
  }
  if (p === '/api/dream' && req.method === 'POST') {
    return handleDream(res);
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
    };
    seedDemoVault(store);
    await store.flush();
    return json(res, { ok: true });
  }
  return json(res, { error: 'not found' }, 404);
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleChat(req, res) {
  const body = await readBody(req);
  const text = safeText(body.text, 4000);
  if (!text) return json(res, { error: 'empty message' }, 400);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  /** @type {NodeJS.Timeout|null} */
  let ping = null;
  try {
    ping = setInterval(() => res.write(': ping\n\n'), 15000);
    const result = await brain.runTurn({
      text,
      emit: (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`),
    });
    res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: String(/** @type {any} */ (e).message || e) })}\n\n`);
  } finally {
    if (ping) clearInterval(ping);
    res.end();
  }
}

/**
 * @param {http.ServerResponse} res
 */
async function handleDream(res) {
  if (dreamer.running) return json(res, { error: 'already dreaming' }, 409);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  /** @type {NodeJS.Timeout|null} */
  let ping = null;
  try {
    ping = setInterval(() => res.write(': ping\n\n'), 15000);
    await dreamer.run((ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
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
  console.log('');
  console.log(`  LLM: ${llm.active ? `${llm.active.label} · ${llm.active.model}` : 'NO PROVIDER — add a key in .env (galaxy + memories + decay work offline; generation needs a model)'}`);
  console.log(`  Tavily web search: ${brain.tavilyKey ? 'enabled' : 'off (add a free key in .env)'}`);
  console.log('');
});

// graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n  Mnemos is going to sleep. Vault saved.');
    night.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
