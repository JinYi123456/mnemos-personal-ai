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
    // Round 3 would be the extraction call — a pure question must not make one.
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
    assert.equal(result.learned, 0, 'a question-only turn stores nothing');
    assert.ok(events.some((e) => e.type === 'tool' && e.name === 'memory.search'));
    assert.ok(events.some((e) => e.type === 'learned' && e.asked), 'and the UI is told it was only a question');
    assert.equal(fake.calls(), 2, 'not even the extraction call is metered on a question turn');
    assert.equal(s.vault.memories.length, 1, 'the sky is unchanged by asking');
  } finally {
    await fake.close(); // never leak the server: it would keep the test process alive
  }
});

// Every string here comes from the Day-4 live session, where the answer's own words were
// written back into the vault and then outranked the facts on the next turn.
test('agent loop: learns what the owner said, never what it answered itself', async () => {
  const s = tmpStore();
  await s.load();

  /** @type {string[]} */
  const extractionBodies = [];
  const fake = await fakeOpenAI([
    // Round 1: an answer containing a reading the owner never gave, plus its own chip.
    'It pings every 14 minutes [Mdeadbeef]; the Oct 19 health ping was recorded at 2026-10-19 00:00 UTC.',
    // Round 2: the extraction call — one true claim, one question echo, one restatement.
    (/** @type {string} */ body) => {
      extractionBodies.push(body);
      return JSON.stringify({
        memories: [
          'The Mnemos demo is kept awake by a GitHub Actions workflow pinging /api/health every 14 minutes',
          'What exactly were the health ping times on 2026-10-19 and 2026-10-20?',
          'Demo kept awake by a GitHub Actions workflow pinging /api/health every 14 minutes',
        ],
      });
    },
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
    const result = await brain.runTurn({
      text: 'Our Mnemos demo is hosted on Render free tier, and a GitHub Actions workflow pings /api/health every 14 minutes to keep it awake. How often does it ping?',
      emit: (e) => events.push(e),
    });

    assert.equal(result.learned, 1, 'only the owner-sourced claim lands');
    assert.equal(result.skipped, 2, 'the echo and the restatement are refused, not counted');
    assert.ok(events.some((e) => e.type === 'learned' && e.count === 1 && e.skipped === 2));

    const sent = extractionBodies[0] || '';
    assert.match(sent, /every 14 minutes/, 'the extractor sees the owner statement whole');
    assert.ok(!sent.includes('00:00 UTC'), 'the model’s own answer is never an extraction source');
    assert.ok(!sent.includes('It pings every'), 'not even its phrasing');

    const texts = s.vault.memories.map((m) => m.text);
    assert.equal(texts.length, 1);
    assert.ok(!texts.some((t) => /M[0-9a-f]{4,}/.test(t)), 'no citation chip survives in the sky');
    assert.ok(!texts.some((t) => t.includes('00:00')), 'the invented reading never became a memory');
  } finally {
    await fake.close();
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
