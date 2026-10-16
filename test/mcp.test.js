import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.js';
import { seedDemoVault } from '../src/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MCP_JS = path.join(ROOT, 'src', 'mcp.js');

/**
 * Seeded temp vault — same pattern as core.test.js, so nothing touches ./vault.
 * @returns {Promise<{base:string, vaultDir:string, skillsDir:string, store:Store}>}
 */
async function seededVault() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-mcp-'));
  const vaultDir = path.join(base, 'vault');
  const store = new Store(vaultDir);
  await store.load();
  seedDemoVault(store);
  await store.flush();
  // Skills are exported *inside* the vault directory, so an exported vault
  // carries its learned skills with it.
  return { base, vaultDir, skillsDir: path.join(vaultDir, 'skills'), store };
}

/** @template T @param {Promise<T>} p @param {number} ms @param {string} label */
function deadline(p, ms, label) {
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let t;
  const guard = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, guard]).finally(() => clearTimeout(t));
}

/**
 * Minimal newline-delimited JSON-RPC client over a spawned server.
 * Any stdout line that is not a JSON-RPC frame is recorded as a protocol
 * violation, because stdout is the protocol channel.
 */
class McpClient {
  /** @param {import('node:child_process').ChildProcess} child */
  constructor(child) {
    this.child = child;
    this.n = 0;
    /** @type {Map<string|number, (v:any)=>void>} */
    this.pending = new Map();
    /** @type {any[]} */
    this.unsolicited = [];
    /** @type {((v:any)=>void)[]} */
    this.waiters = [];
    /** @type {string[]} */
    this.violations = [];
    /** @type {string[]} */
    this.stderrLines = [];
    /** @type {Promise<any>} */
    this.onceExit = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
    let buf = '';
    const stdout = /** @type {import('node:stream').Readable} */ (child.stdout);
    this.stdin = /** @type {import('node:stream').Writable} */ (child.stdin);
    const stderr = /** @type {import('node:stream').Readable} */ (child.stderr);
    stdout.setEncoding('utf8');
    stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        /** @type {any} */
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          this.violations.push(line);
          continue;
        }
        const key = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? String(msg.id) : null;
        /** @type {((v:any)=>void)|undefined} */
        const settle = key === null ? undefined : this.pending.get(key);
        if (settle && key !== null) {
          this.pending.delete(key);
          settle(msg);
        } else if (this.waiters.length) {
          /** @type {(v:any)=>void} */ (this.waiters.shift())(msg);
        } else {
          this.unsolicited.push(msg);
        }
      }
    });
    stderr.setEncoding('utf8');
    stderr.on('data', (chunk) => {
      for (const l of String(chunk).split('\n')) if (l.trim()) this.stderrLines.push(l);
    });
  }

  /** @param {string[]} args @param {string} vaultDir */
  static async start(vaultDir, args = []) {
    /** @type {Record<string, string|undefined>} */
    const env = { ...process.env, MNEMOS_OFFLINE: '1' };
    // no provider keys reach the child: the suite must never touch the network
    for (const k of ['NEBIUS_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GOOGLE_API_KEY', 'NVIDIA_API_KEY', 'TAVILY_API_KEY']) {
      delete env[k];
    }
    const child = spawn(process.execPath, [MCP_JS, '--vault', vaultDir, ...args], {
      cwd: ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const client = new McpClient(child);
    return client;
  }

  /** @param {string} method @param {any} [params] @param {number} [ms] */
  request(method, params, ms = 20000) {
    const id = (this.n += 1);
    const line = `${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`;
    const wait = new Promise((resolve) => this.pending.set(String(id), resolve));
    this.stdin.write(line);
    return deadline(wait, ms, `request ${method}`);
  }

  /** @param {string} method @param {any} [params] */
  notify(method, params) {
    this.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })}\n`);
  }

  /** @param {string} text @param {number} [ms] */
  sendRaw(text, ms = 5000) {
    this.stdin.write(text.endsWith('\n') ? text : `${text}\n`);
    if (this.unsolicited.length) return Promise.resolve(this.unsolicited.shift());
    return deadline(new Promise((r) => this.waiters.push(r)), ms, 'raw response');
  }

  /** @param {number} [ms] */
  async initialize(ms) {
    const res = await this.request(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: { roots: { listChanged: true } },
        clientInfo: { name: 'test-harness', version: '0' },
      },
      ms,
    );
    assert.ok(res.result, 'initialize returned a result');
    this.notify('notifications/initialized');
    return res.result;
  }

  /** @param {string} name @param {Record<string, any>} [args] */
  async call(name, args) {
    const res = await this.request('tools/call', { name, arguments: args || {} });
    assert.ok(res.result, `tools/call ${name} returned a result, got ${JSON.stringify(res.error)}`);
    const r = res.result;
    assert.ok(Array.isArray(r.content), 'tool result has a content array');
    assert.ok(r.content.every((/** @type {(c: any) => boolean} */ (c) => c.type === 'text' && typeof c.text === 'string')), 'content blocks are text');
    /** @type {any} */
    const parsed = JSON.parse(r.content[0].text);
    return { ...parsed, _isError: !!r.isError };
  }

  async stop() {
    this.stdin.end();
    await deadline(this.onceExit, 5000, 'server exit').catch(() => {
      this.child.kill();
    });
  }
}

/**
 * Parse the JSON text payload of a resource read.
 * @param {McpClient} c
 * @param {string} uri
 */
async function readResource(c, uri) {
  const res = await c.request('resources/read', { uri });
  assert.ok(res.result, `resources/read ${uri} failed: ${JSON.stringify(res.error)}`);
  const contents = res.result.contents;
  assert.ok(Array.isArray(contents) && contents.length === 1, 'one content block');
  assert.equal(contents[0].uri, uri);
  assert.equal(contents[0].mimeType, 'application/json');
  return JSON.parse(contents[0].text);
}

test('mcp: stdio handshake, tools/list, remember → search → forget, resources/read', async () => {
  const { base, vaultDir } = await seededVault();
  const c = await McpClient.start(vaultDir);
  try {
    const init = await c.initialize();
    assert.equal(init.protocolVersion, '2025-06-18');
    assert.equal(init.serverInfo.name, 'mnemos');
    assert.equal(init.serverInfo.title, 'Mnemos memory vault');
    assert.match(init.serverInfo.version, /^\d+\.\d+\.\d+/, 'version comes from package.json');
    assert.equal(init.capabilities.tools.listChanged, false);
    assert.ok(init.capabilities.resources, 'resources capability advertised');
    assert.ok(typeof init.instructions === 'string' && init.instructions.length > 40);

    const ping = await c.request('ping');
    assert.deepEqual(ping, { jsonrpc: '2.0', id: ping.id, result: {} });

    const list = await c.request('tools/list');
    const names = list.result.tools.map((/** @type {any} */ t) => t.name);
    for (const expected of ['memory_search', 'memory_remember', 'memory_forget', 'memory_list', 'vault_snapshot', 'dream_run', 'skill_export', 'sky_shape']) {
      assert.ok(names.includes(expected), `tool ${expected} listed`);
    }
    for (const t of list.result.tools) {
      assert.ok(t.description.length > 20, `${t.name} documented`);
      assert.equal(t.inputSchema.type, 'object', `${t.name} has an object schema`);
      assert.equal(t.inputSchema.additionalProperties, false, `${t.name} rejects junk args`);
      for (const req of t.inputSchema.required || []) {
        assert.ok(t.inputSchema.properties[req], `${t.name}.${req} required but undeclared`);
      }
    }

    // the app seeds a "cat named Pixel" memory — search must find it
    const before = await c.call('memory_search', { query: 'cat pixel keyboard', k: 5 });
    assert.equal(before.ok, true);
    assert.ok(before.results.length >= 1 && /Pixel/.test(before.results[0].text), 'seeded memory recalled');
    assert.match(before.results[0].id, /^M[0-9a-f]{8}$/);
    assert.ok(typeof before.results[0].strength === 'number' && typeof before.results[0].uses === 'number');
    assert.ok(before.results[0].age, 'human age present');

    const stored = await c.call('memory_remember', { text: 'Prefers the standing desk for Friday afternoons', source: 'hermes' });
    assert.equal(stored.ok, true);
    assert.match(stored.stored.id, /^M[0-9a-f]{8}$/);
    assert.equal(stored.stored.source, 'hermes');
    const written = JSON.parse(fs.readFileSync(path.join(vaultDir, 'vault.json'), 'utf8'));
    assert.ok(written.memories.some((/** @type {any} */ m) => m.text.includes('standing desk')), 'persisted to vault.json');

    const dup = await c.call('memory_remember', { text: 'Prefers the standing desk for Friday afternoons' });
    assert.equal(dup._isError, true, 'duplicate is a tool-level error');
    assert.equal(dup.ok, false);
    assert.match(dup.error, /near-duplicate/);

    const found = await c.call('memory_search', { query: 'standing desk fridays' });
    assert.ok(found.results.some((/** @type {any} */ r) => r.text.includes('standing desk')), 'agent can recall what it wrote');

    const id = stored.stored.id;
    const forgot = await c.call('memory_forget', { id });
    assert.equal(forgot.ok, true);
    assert.equal(forgot.forgotten, id);
    const gone = await c.call('memory_search', { query: 'standing desk' });
    assert.ok(!gone.results.some((/** @type {any} */ r) => r.id === id), 'forgotten memory is gone');

    const badForget = await c.call('memory_forget', { id: 'Mdeadbeef' });
    assert.equal(badForget._isError, true);
    assert.match(badForget.error, /no memory with id/);

    const listed = await c.call('memory_list', { limit: 5 });
    assert.equal(listed.memories.length, 5);
    assert.ok(listed.total >= 18);

    const snap = await c.call('vault_snapshot', {});
    assert.ok(snap.stars.length >= 15, 'snapshot has stars');
    assert.ok(snap.links.length >= 3, 'snapshot has constellation links');
    assert.ok(snap.links.every((/** @type {any} */ l) => l.from.length >= 2));
    assert.ok(snap.stars.every((/** @type {any} */ s) => s.size > 0 && typeof s.text === 'string'));
    assert.equal(snap.counts.skills, 2);

    // resources
    const resList = await c.request('resources/list');
    const uris = resList.result.resources.map((/** @type {any} */ r) => r.uri);
    assert.deepEqual(uris, ['mnemos://vault/stars', 'mnemos://vault/timeline', 'mnemos://vault/skills']);
    const stars = await readResource(c, 'mnemos://vault/stars');
    assert.ok(stars.stars.length >= 15 && Array.isArray(stars.links));
    const timeline = await readResource(c, 'mnemos://vault/timeline');
    assert.ok(timeline.memories.length >= 15);
    const times = timeline.memories.map((/** @type {any} */ m) => Date.parse(m.created));
    assert.deepEqual([...times].sort((a, b) => a - b), times, 'timeline is chronological');
    const skillsRes = await readResource(c, 'mnemos://vault/skills');
    assert.equal(skillsRes.skills.length, 2);
    assert.match(skillsRes.skills[0].skillMd, /^---\nname: [a-z0-9-]+\ndescription: "/, 'SKILL.md text is front-mattered');
    const tmpl = await c.request('resources/templates/list');
    assert.match(tmpl.result.resourceTemplates[0].uriTemplate, /mnemos:\/\/memory\/\{id\}/);

    // stdout carried protocol frames only
    assert.deepEqual(c.violations, [], 'no non-JSON traffic on stdout');
  } finally {
    await c.stop();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('mcp: memory/{id} resource, skill_export writes SKILL.md, sky_shape persists layout', async () => {
  const { base, vaultDir, skillsDir } = await seededVault();
  const c = await McpClient.start(vaultDir);
  try {
    await c.initialize();
    const short = (await c.call('memory_list', { limit: 1 })).memories[0].id;
    const one = await readResource(c, `mnemos://memory/${short}`);
    assert.equal(one.id, short);
    assert.ok(typeof one.text === 'string' && one.text.length > 8);

    const exp = await c.call('skill_export', {});
    assert.equal(exp.ok, true);
    assert.equal(exp.written, 2);
    assert.equal(path.resolve(exp.skillsDir), path.resolve(skillsDir), 'defaults to skills/ inside the vault');
    for (const f of exp.files) {
      assert.ok(fs.existsSync(f.file), `${f.file} exists`);
      const md = fs.readFileSync(f.file, 'utf8');
      assert.match(md, /^---\nname: [a-z0-9-]+\n/);
      assert.match(md, /\ndescription: ".+"\n---/);
      assert.match(md, /## Provenance/);
      assert.ok(md.split('\n').length > 8, 'body is more than front matter');
    }
    const single = await c.call('skill_export', { name: 'trip-planner' });
    assert.equal(single.written, 1);
    assert.match(single.files[0].file, /trip-planner[\\/]SKILL\.md$/);
    const none = await c.call('skill_export', { name: 'no-such-skill' });
    assert.equal(none._isError, true);
    assert.ok(Array.isArray(none.available) && none.available.length === 2, 'tells the agent what does exist');

    // sky_shape: spiral → every star gets a saved 0..1 position, like a UI drag
    const shape = await c.call('sky_shape', { shape: 'spiral' });
    assert.equal(shape.ok, true);
    assert.equal(shape.shape, 'spiral');
    assert.equal(shape.persisted, 'layout');
    const laid = JSON.parse(fs.readFileSync(path.join(vaultDir, 'vault.json'), 'utf8'));
    const ids = laid.memories.map((/** @type {any} */ m) => m.id);
    assert.equal(Object.keys(laid.layout).length, ids.length, 'one layout entry per memory');
    for (const v of Object.values(/** @type {Record<string, any>} */ (laid.layout))) {
      assert.ok(v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1, 'normalized position');
    }
    // the galaxy snapshot carries the positions back out, so a client can render it
    const snap = await c.call('vault_snapshot', {});
    assert.ok(snap.stars.every((/** @type {any} */ s) => s.layout && typeof s.layout.x === 'number'));

    const zodiac = await c.call('sky_shape', { shape: ' Scorpio ' });
    assert.equal(zodiac.shape, 'scorpio');
    const bad = await c.call('sky_shape', { shape: 'hexagram' });
    assert.equal(bad._isError, true);
    assert.match(bad.error, /unknown shape/);
    assert.match(bad.hint, /spiral\|heart\|ring/, 'mirrors the app hint');

    // word shapes need a browser canvas → queued, not faked
    const word = await c.call('sky_shape', { shape: 'word:hello' });
    assert.equal(word.persisted, 'queued');
    assert.equal(word.word, 'hello');
    assert.ok(fs.existsSync(word.queueFile));

    const reset = await c.call('sky_shape', { shape: 'reset' });
    assert.equal(reset.cleared, true);
    const cleared = JSON.parse(fs.readFileSync(path.join(vaultDir, 'vault.json'), 'utf8'));
    assert.deepEqual(cleared.layout, {}, 'reset drops positions');

    assert.deepEqual(c.violations, []);
  } finally {
    await c.stop();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('mcp: dream_run is offline-safe — replay + decay, consolidation reported as skipped', async () => {
  const { base, vaultDir } = await seededVault();
  const c = await McpClient.start(vaultDir);
  try {
    await c.initialize();
    const run = await c.call('dream_run', { fast: true });
    assert.equal(run.ok, true);
    assert.equal(run.providers.length, 0, 'no providers in offline mode');
    assert.match(run.consolidation, /skipped/, 'tells the agent consolidation did not run');
    assert.ok(run.replayed > 0, 'replay happened');
    assert.ok(run.dreamCount >= 1 && run.lastDreamAt, 'dream counted');
    assert.ok(run.phases.includes('replay') && run.phases.includes('decay'));
    const disk = JSON.parse(fs.readFileSync(path.join(vaultDir, 'vault.json'), 'utf8'));
    assert.equal(disk.dreamCount, run.dreamCount, 'dream persisted without any network');
    assert.ok(disk.memories.length > 0, 'the sky survived the dream');
    assert.deepEqual(c.violations, []);
  } finally {
    await c.stop();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('mcp: protocol errors have the right shapes, notifications get no reply', async () => {
  const { base, vaultDir } = await seededVault();
  const c = await McpClient.start(vaultDir);
  try {
    await c.initialize();

    const parseErr = await c.sendRaw('{not json at all');
    assert.equal(parseErr.jsonrpc, '2.0');
    assert.equal(parseErr.id, null);
    assert.equal(parseErr.error.code, -32700);

    const noSuch = await c.request('sessions/list');
    assert.equal(noSuch.error.code, -32601, 'method not found');
    assert.match(noSuch.error.message, /Method not found/);

    const badTool = await c.request('tools/call', { name: 'memory_teleport', arguments: {} });
    assert.equal(badTool.error.code, -32602, 'unknown tool is a protocol error');
    assert.match(badTool.error.message, /Unknown tool/);

    const badUri = await c.request('resources/read', { uri: 'mnemos://vault/nope' });
    assert.equal(badUri.error.code, -32002, 'resource not found');

    const junk = await c.request('garbage/shape', 'not-an-object');
    assert.ok(junk.error, 'bad params rejected');

    // notifications must never produce a frame — proven by the reply that follows
    c.notify('notifications/unknown/thing');
    const after = await c.request('ping');
    assert.deepEqual(after, { jsonrpc: '2.0', id: after.id, result: {} });
    assert.equal(c.unsolicited.length, 0, 'the notification was silent, as required');

    // tool-level argument failure (not a protocol error)
    const shortText = await c.call('memory_remember', { text: 'ok' });
    assert.equal(shortText._isError, true);
    assert.equal(shortText.ok, false);
    assert.match(shortText.error, /at least 8 characters/);

    assert.deepEqual(c.violations, []);
  } finally {
    await c.stop();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('mcp: negotiates the protocol version the client asks for', async () => {
  const { base, vaultDir } = await seededVault();
  const c = await McpClient.start(vaultDir);
  try {
    for (const asked of ['2024-11-05', '2025-03-26', '2025-06-18']) {
      const res = await c.request('initialize', {
        protocolVersion: asked,
        capabilities: {},
        clientInfo: { name: `probe-${asked}`, version: '1' },
      });
      assert.equal(res.result.protocolVersion, asked, `${asked} echoed back`);
    }
    const future = await c.request('initialize', { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'time-traveller' } });
    assert.equal(future.result.protocolVersion, '2025-06-18', 'unknown version falls back to ours');
    const missing = await c.request('initialize', { capabilities: {} });
    assert.equal(missing.result.protocolVersion, '2025-06-18');
    assert.deepEqual(c.violations, []);
  } finally {
    await c.stop();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('mcp: an empty vault is usable, and --help / --http behave without touching stdio', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-mcp-empty-'));
  const vaultDir = path.join(base, 'vault');
  const c = await McpClient.start(vaultDir);
  try {
    await c.initialize();
    const empty = await c.call('memory_search', { query: 'anything at all here' });
    assert.equal(empty.ok, true);
    assert.equal(empty.count, 0);
    const dream = await c.call('dream_run', {});
    assert.equal(dream._isError, true, 'nothing to dream about yet');
    const shape = await c.call('sky_shape', { shape: 'ring' });
    assert.equal(shape._isError, true);
    const skills = await c.call('skill_export', {});
    assert.equal(skills._isError, true);
    assert.ok(fs.existsSync(path.join(vaultDir, 'vault.json')), 'empty vault file created, no demo memories injected');
    const disk = JSON.parse(fs.readFileSync(path.join(vaultDir, 'vault.json'), 'utf8'));
    assert.equal(disk.memories.length, 0, 'the user vault is never seeded by the MCP server');
  } finally {
    await c.stop();
    fs.rmSync(base, { recursive: true, force: true });
  }

  const cli = await runCli(['--help']);
  assert.equal(cli.code, 0);
  assert.match(cli.stdout, /Usage: node src\/mcp\.js/);
  assert.match(cli.stdout, /memory_search/);

  const http = await runCli(['--http', '8791']);
  assert.equal(http.code, 2, 'HTTP transport is refused, not silently ignored');
  assert.match(http.stderr, /--http is not implemented/);
  assert.match(http.stderr, /stdio-only/);
  assert.equal(http.stdout, '', 'refusal never speaks on the protocol channel');

  const junk = await runCli(['--nope']);
  assert.equal(junk.code, 2);
  assert.match(junk.stderr, /unknown argument/);
});

/**
 * @param {string[]} args
 * @returns {Promise<{code:number|null, stdout:string, stderr:string}>}
 */
function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MCP_JS, ...args], {
      cwd: ROOT,
      env: { ...process.env, MNEMOS_OFFLINE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.end();
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}
