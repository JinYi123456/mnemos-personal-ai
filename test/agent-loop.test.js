import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { LLM } from '../src/llm.js';
import { Brain } from '../src/brain.js';

/**
 * Fake OpenAI-compatible server with path routing:
 *  - POST /embeddings → always 501 (provider lacks embeddings) so the brain
 *    degrades to lexical recall — script counter is NOT consumed.
 *  - POST /chat/completions → scripted responses in order.
 */
function fakeOpenAI(/** @type {any[]} */ script) {
  let call = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if ((req.url || '').includes('/embeddings')) {
        res.writeHead(501, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'embeddings not implemented by fake' } }));
        return;
      }
      const step = script[Math.min(call, script.length - 1)];
      call += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: typeof step === 'function' ? step(body) : step } }],
      }));
    });
  });
  return new Promise((/** @type {(v: any) => void} */ resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        port: /** @type {import('node:net').AddressInfo} */ (server.address()).port,
        calls: () => call,
        close: () => /** @type {Promise<void>} */ (new Promise((resolve) => { server.close(() => resolve()); })),
      });
    });
  });
}

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-loop-'));
  return new Store(dir);
}

test('full agent loop: tool call round-trips and final reply cites memory', async () => {
  const s = tmpStore();
  await s.load();
  const mem = s.addMemory('User is preparing a demo of Nebula Notes for November 12', 'user');
  assert.ok(mem);

  const fake = await fakeOpenAI([
    // Round 1: model asks to search memory
    JSON.stringify({ tool: 'memory.search', args: { query: 'demo november preparation' } }),
    // Round 2: model answers using the recalled memory (cited)
    'Your demo of Nebula Notes is coming up [M' + mem.id.slice(0, 8) + '] — you scheduled rehearsals for it.',
    // Round 3 (extraction call): return a durable memory as JSON
    JSON.stringify({ memories: ['User rehearsed the Nebula Notes demo aloud'] }),
  ]);
  const llm = new LLM([{
    id: 'fake',
    label: 'Fake',
    kind: 'openai',
    baseUrl: `http://127.0.0.1:${fake.port}`,
    apiKey: 'test',
    model: 'fake-model',
    reasoningModel: 'fake-model',
    nvidiaModel: false,
  }]);
  const brain = new Brain(s, llm, '', `http://127.0.0.1:${fake.port}`);

  /** @type {any[]} */
  const events = [];
  try {
    const result = await brain.runTurn({ text: 'What am I preparing for?', emit: (e) => events.push(e) });

    assert.match(result.reply, /Nebula Notes/);
    assert.equal(result.cites.length, 1, 'final reply cites the recalled memory');
    assert.equal(result.cites[0].id, mem.id.slice(0, 8));
    assert.ok(result.toolCalls.some((t) => t.name === 'memory.search' && t.ok), 'memory.search tool ran');
    assert.ok(result.recalled.includes(mem.id.slice(0, 8)), 'auto-recall included the memory');
    assert.equal(result.learned, 1, 'extraction stored one new memory');
    assert.ok(events.some((e) => e.type === 'tool' && e.name === 'memory.search'));
    assert.ok(events.some((e) => e.type === 'learned'));

    // The extracted memory must be searchable in the vault.
    const hits = s.recall('Nebula Notes rehearsal', 5);
    assert.ok(hits.some((m) => m.text.includes('rehearsed')), 'extracted memory persisted and searchable');
  } finally {
    await fake.close(); // never leak the server: it would keep the test process alive
  }
});

test('agent falls back gracefully when every provider errors', async () => {
  const s = tmpStore();
  await s.load();
  const llm = new LLM([{
    id: 'dead',
    label: 'Dead',
    kind: 'openai',
    baseUrl: 'http://127.0.0.1:9', // nothing listens here
    apiKey: 'test',
    model: 'x',
    nvidiaModel: false,
  }]);
  const brain = new Brain(s, llm, '', '');
  const result = await brain.runTurn({ text: 'hello' });
  assert.match(result.reply, /couldn't reach my language core/i);
});

test('nightly catch-up: dreams run when last dream was yesterday; skip when same-day', async () => {
  const { NightDreamer } = await import('../src/night.js');
  const s = tmpStore();
  await s.load();
  s.addMemory('Evening walks calm the mind', 'chat');
  s.addMemory('Morning coffee is a small ritual', 'chat');
  const fakeLLM = { chat: async () => { throw new Error('offline'); } };
  const nd = new NightDreamer(s, /** @type {any} */ (fakeLLM));
  const ran = await nd.catchUpAtBoot();
  assert.equal(ran, true);
  assert.ok(s.vault.dreamCount >= 1);
  const nd2 = new NightDreamer(s, /** @type {any} */ (fakeLLM));
  const ranAgain = await nd2.catchUpAtBoot();
  assert.equal(ranAgain, false);
});
