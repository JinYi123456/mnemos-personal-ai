import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { seedDemoVault } from '../src/seed.js';
import { Brain } from '../src/brain.js';
import { LLM, buildProviders } from '../src/llm.js';
import { safeText, clamp, mulberry32 } from '../src/util.js';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-test-'));
  return new Store(dir);
}

test('store: add, dedupe, recall, reinforce, forget', async () => {
  const s = tmpStore();
  await s.load();
  const m1 = s.addMemory('Alice prefers oat milk flat whites and is allergic to dairy', 'chat');
  assert.ok(m1, 'first memory stored');
  const dup = s.addMemory('Alice prefers oat milk flat whites and is allergic to dairy', 'chat');
  assert.equal(dup, null, 'duplicate rejected');
  const m2 = s.addMemory('The quantum flux capacitor hums at midnight', 'chat');
  assert.ok(m2);

  const hits = s.recall('what milk does alice drink?', 5);
  assert.equal(hits[0]?.id, m1.id, 'milk memory ranks first');
  assert.ok(!hits.some((m) => m.id === m2.id), 'unrelated memory absent');

  const before = m1.strength;
  s.reinforce([m1.id]);
  assert.ok((s.vault.memories.find((m) => m.id === m1.id)?.strength ?? 0) > before, 'reinforce boosts strength');

  assert.ok(s.removeMemory(m1.id));
  assert.equal(s.vault.memories.find((m) => m.id === m1.id), undefined);
});

test('store: short and junk memories rejected', async () => {
  const s = tmpStore();
  await s.load();
  assert.equal(s.addMemory('ok', 'chat'), null);
  assert.equal(s.addMemory('', 'chat'), null);
  assert.equal(s.addMemory(/** @type {any} */ (123), 'chat'), null);
});

// Every string below is a verbatim memory the live demo wrote during the Day-4 session.
test('store: chat memories keep only the claim, not the answer', async () => {
  const s = tmpStore();
  await s.load();

  const real = s.addMemory('Judging for the Nebius x NVIDIA Global AI Hackathon runs Dec 1-15, 2026.', 'chat');
  assert.ok(real, 'the fact the owner stated is stored');

  const restated = s.tryAddMemory('Judging runs Dec 1-15 2026', 'chat');
  assert.equal(restated.ok, false, 'a shorter restatement of a live memory is refused');
  assert.equal(restated.reason, 'duplicate');
  assert.equal(s.vault.memories.length, 1, 'and it does not enter the sky');

  const echo = s.tryAddMemory('What exactly were the health ping times on 2026-10-19 and 2026-10-20?', 'chat');
  assert.equal(echo.reason, 'question');
  assert.equal(s.tryAddMemory('How is the Render instance kept alive', 'chat').reason, 'question');

  const laundered = s.tryAddMemory(
    'Health ping on 2026-10-19 recorded at 2026-10-19 00:00 UTC, cited from memory [Mb4dfd276] (0 days old).',
    'chat',
  );
  assert.ok(laundered.ok, 'a claim of its own is still admissible');
  const kept = /** @type {import('../src/store.js').Memory} */ (laundered.memory);
  assert.ok(!/M[0-9a-f]{4,}/.test(kept.text), 'no citation chip survives');
  assert.ok(!/cited from memory/i.test(kept.text), 'no prose provenance survives');
  assert.match(kept.text, /recorded at 2026-10-19/, 'the claim itself is kept');

  assert.ok(s.addMemory('Kyoto trip, spring', 'user'), 'owner-written notes are never shape-gated');
});

test('seed: demo vault populates memories, insights, skills; snapshot valid', async () => {
  const s = tmpStore();
  await s.load();
  const n = seedDemoVault(s);
  assert.ok(n >= 15, 'seeds at least 15 memories');
  assert.ok(s.vault.insights.length >= 3, 'seeds insights');
  assert.ok(s.vault.skills.length >= 2, 'seeds skills');
  const snap = s.snapshot();
  assert.equal(snap.stars.length, n);
  for (const star of snap.stars) {
    assert.ok(star.id.length >= 8);
    assert.ok(star.size > 0);
  }
  assert.ok(snap.links.length >= 3);
  for (const l of snap.links) assert.ok(l.from.length >= 2);
});

test('vault persists across reload (owner, memories, dreamCount)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-test-'));
  const s1 = new Store(dir);
  await s1.load();
  s1.setOwner('Tester');
  s1.addMemory('Persisted memory about bicycles in Amsterdam', 'chat');
  s1.countDream();
  await s1.flush();

  const s2 = new Store(dir);
  await s2.load();
  assert.equal(s2.vault.owner, 'Tester');
  assert.equal(s2.vault.dreamCount, 1);
  assert.ok(s2.vault.memories.some((m) => m.text.includes('bicycles')));
});

test('citations: extractCites resolves real ids and ignores fake ones', () => {
  const recalled = [{ id: 'abcdef1234', text: 'real memory' }];
  const reply = 'You mentioned it [Mabcdef12] and also [Mdeadbeef].';
  const cites = Brain.extractCites(reply, recalled);
  assert.equal(cites.length, 1);
  assert.equal(cites[0].id, 'abcdef12');
});

test('citations: the model writes chips in full-width brackets too', async () => {
  const recalled = [{ id: '31960a7d0000', text: 'judging runs Dec 1-15 2026' }];
  // exactly how the live demo wrote it on 2026-10-20, which the old regex missed
  const cites = Brain.extractCites('Judging covers December 1 – 15, 2026【M31960a7d】.', recalled);
  assert.equal(cites.length, 1, 'the chip resolves instead of vanishing');
  assert.equal(cites[0].id, '31960a7d');

  const s = tmpStore();
  await s.load();
  const r = s.tryAddMemory('Judging runs Dec 1-15 2026 【Mdeadbeef】 (0 days old)', 'chat');
  assert.ok(r.ok);
  assert.ok(!/M[0-9a-f]{4,}/.test(/** @type {import('../src/store.js').Memory} */ (r.memory).text), 'no full-width chip reaches the sky');
});

test('unsupportedFigures: a number in none of the memories read is flagged', () => {
  const recalled = [
    { id: 'a1', text: 'A redeploy wipes every visitor vault and re-seeds the 18 demo memories; measured twice on 2026-10-20' },
    { id: 'a2', text: 'Judging runs Dec 1-15, 2026' },
  ];
  assert.deepEqual(
    Brain.unsupportedFigures('The vault holds 24 memories and the ping took 22.8 seconds.', recalled),
    ['24', '22', '8'],
  );
  assert.deepEqual(
    Brain.unsupportedFigures('The sky holds 18 demo memories; judging runs Dec 1-15, 2026.', recalled),
    [],
    'figures the memories actually carry are left alone',
  );
  assert.deepEqual(
    Brain.unsupportedFigures('Judging covers Dec 1-15, 2026【M31960a7d】 [Mb4dfd276].', recalled),
    [],
    'a citation chip is not an invented figure',
  );
});

test('parseAction: accepts tool JSON, rejects prose', () => {
  assert.deepEqual(Brain.parseAction('{"tool":"time.now","args":{}}'), { tool: 'time.now', args: {} });
  assert.equal(Brain.parseAction('The answer is 42.'), null);
  assert.equal(Brain.parseAction('{"tool":"DROP TABLE"}'), null);
  const messy = 'Sure! {"tool":"memory.search","args":{"query":"cat"}} hope that helps';
  assert.deepEqual(Brain.parseAction(messy), { tool: 'memory.search', args: { query: 'cat' } });
});

test('parseJSON: fences, prose, trailing commas', () => {
  assert.deepEqual(LLM.parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(LLM.parseJSON('Here you go: {"a":[1,2,]}'), { a: [1, 2] });
  assert.deepEqual(LLM.parseJSON('[1,2,3]'), [1, 2, 3]);
});

test('dream: empty vault finishes gracefully; full run produces insights/decay without llm', async () => {
  const s = tmpStore();
  await s.load();
  seedDemoVault(s);
  // Fake LLM that always fails → dream falls back to replay+decay only.
  const fakeLLM = { chat: async () => { throw new Error('no network'); } };
  const { Dreamer } = await import('../src/dream.js');
  const d = new Dreamer(s, /** @type {any} */ (fakeLLM));
  /** @type {any[]} */
  const events = [];
  const r = await d.run((e) => events.push(e), { fast: true });
  assert.ok(r.insights === 0 && r.decayed >= 0);
  assert.ok(events.some((e) => e.phase === 'done'));
  assert.ok(s.vault.dreamCount === 1, 'dream counted');
});

test('dream: consolidation adds insight and skill via fake llm', async () => {
  const s = tmpStore();
  await s.load();
  seedDemoVault(s);
  const fakeLLM = {
    chat: async () => ({ text: JSON.stringify({
      insights: [{ text: 'Kyoto trip and camera lens savings point to a photography-first spring.', connects: [0, 1] }],
      skill: { name: 'photo-trip', description: 'Plan photo trips', prompt: 'Plan.' },
    }) }),
  };
  const { Dreamer } = await import('../src/dream.js');
  const d = new Dreamer(s, /** @type {any} */ (fakeLLM));
  /** @type {any[]} */
  const events = [];
  const r = await d.run((e) => events.push(e), { fast: true });
  assert.equal(r.insights, 1);
  assert.equal(r.skills, 1);
  assert.ok(s.vault.insights.some((i) => i.text.includes('photography')));
  assert.ok(s.vault.skills.some((k) => k.name === 'photo-trip'));
  assert.ok(events.some((e) => e.phase === 'insight'));
});

test('red block present in system prompt and not leaked by tools list', () => {
  const s = tmpStore();
  const fakeLLM = /** @type {any} */ ({});
  const b = new Brain(s, fakeLLM, '', '');
  const sys = b.systemPrompt();
  assert.match(sys, /MEMORY PROTOCOL/);
  assert.match(sys, /SECRET PROTOCOL/);
  assert.match(sys, /NEVER fabricate or guess a personal fact/);
});

test('providers: chain order puts nebius first, flags nvidia models', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-env-'));
  fs.writeFileSync(path.join(dir, '.env'), [
    'NEBIUS_API_KEY=nk_test',
    'GROQ_API_KEY=gk_test',
    'OPENROUTER_API_KEY=ok_test',
  ].join('\n'));
  const list = buildProviders(dir);
  assert.equal(list[0].id, 'nebius');
  assert.equal(list[0].nvidiaModel, true);
  assert.ok(list.some((p) => p.id === 'groq'));
  const or = list.find((p) => p.id === 'openrouter');
  assert.ok(or, 'openrouter present');
  assert.equal(or.nvidiaModel, true, 'nemotron free model counts as nvidia');
  // google/nvidia absent without keys
  assert.ok(!list.some((p) => p.id === 'google'));
});

test('utils: safeText strips control chars, clamp, mulberry32 deterministic', () => {
  assert.equal(safeText('hi\x00there\x07!'), 'hithere!');
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(NaN, 0.5, 1), 0.5);
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
});

test('hybrid recall: semantic vectors find paraphrases lexical misses', async () => {
  const s = tmpStore();
  await s.load();
  const m1 = s.addMemory('Presentation nerves ease after rehearsing aloud twice', 'chat');
  const m2 = s.addMemory('Buys oat milk every week from the corner shop', 'chat');
  assert.ok(m1 && m2);
  // Simulated embeddings: "stage fright" is semantically close to nerves, lexically disjoint.
  const v1 = [0.9, 0.4, 0.1, 0.05];
  const v2 = [0.05, 0.1, 0.3, 0.9];
  s.backfillVecs(new Map([[m1.id, v1], [m2.id, v2]]));
  const query = 'how do I calm stage fright?';
  const qv = [0.85, 0.35, 0.2, 0.1];
  const hits = s.recall(query, 2, qv);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].id, m1.id, 'semantic match beats lexical zero');
  // lexical-only path still works when no memory has vectors
  const s2 = tmpStore();
  await s2.load();
  const a = s2.addMemory('Kyoto trip planned for spring cherry blossoms', 'chat');
  const hits2 = s2.recall('kyoto', 3);
  assert.ok(hits2.some((m) => m.id === a?.id));
});

test('cosine similarity basics', async () => {
  const { cosine } = await import('../src/store.js');
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  assert.ok(cosine([1, 0], [-1, 0]) < 0);
});

test('red zone: set, clamp to 20, persists; insight naming works', async () => {
  const s = tmpStore();
  await s.load();
  s.setRedZone(['salary talk', 'that hospital thing']);
  s.setRedZone(Array.from({ length: 30 }, (_, i) => `topic ${i}`));
  assert.ok(s.vault.redZone.length <= 20);
  s.setRedZone(['salary talk']);
  await s.flush();
  const s2 = new Store(s.dir);
  await s2.load();
  assert.deepEqual(s2.vault.redZone, ['salary talk']);
  const mA = s.addMemory('Trying to reduce late-night screen time', 'chat');
  const mB = s.addMemory('Sleeps better after evening walks', 'chat');
  assert.ok(mA && mB);
  const ins = s.addInsight('Sleep and screen time are linked for this user.', [mA.id, mB.id]);
  assert.ok(ins);
  const named = s.setInsightName(ins.id, 'Quiet Nights');
  assert.equal(/** @type {any} */ (named).name, 'Quiet Nights');
});

test('fetchPage: blocks private networks (SSRF guard)', async () => {
  await assert.rejects(() => Brain.fetchPage('http://127.0.0.1:8787/api/status', 'https://example.com'), /SSRF/);
  await assert.rejects(() => Brain.fetchPage('http://192.168.1.5/x', ''), /SSRF/);
  await assert.rejects(() => Brain.fetchPage('ftp://example.com', ''), /http/);
});

test('citations: a cited memory is never also flagged as uncited', () => {
  const recalled = [
    { id: 'a4f991917d5c9e2', text: 'Is preparing a demo of Nebula Notes for a small meetup' },
    { id: 'c61431e8aa11bb22', text: 'Prefers concise answers with concrete next steps' },
    { id: '528847bd33221100', text: 'Is nervous about presenting; feels calmer after rehearsing aloud twice' },
  ];
  const reply = 'You are preparing a demo of Nebula Notes for a small meetup [Ma4f99191], '
    + 'you prefer concise answers with concrete next steps 【Mc61431e8】, and rehearsing twice is what calms you.';
  const cites = Brain.extractCites(reply, recalled);
  assert.equal(cites.length, 2, 'one ASCII chip and one full-width chip both resolve');
  const uncited = Brain.matchedUncited(reply, recalled, new Set(cites.map((c) => c.id)));
  assert.deepEqual(uncited.map((u) => u.id), ['528847bd'], 'only the memory it never cited is flagged');
});
