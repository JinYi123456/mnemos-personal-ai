#!/usr/bin/env node
/**
 * Mnemos Vault Doctor — quality check for a memory vault before you trust it
 * in high-stakes use (presentations, medical/legal/finance contexts, demos).
 *
 * Usage:  node tools/vault-doctor.js [vaultDir]
 * Exit code: 0 = PASS, 1 = WARNINGS (fix before relying on recall),
 *            2 = FAIL (contamination detected — do not trust answers).
 *
 * Checks (all local, no model calls):
 *   C1  Every memory has an embedding vector → hybrid (semantic) recall active
 *   C2  Duplicate/near-duplicate memories (same normalized text)
 *   C3  Contradiction pairs: same tags, opposite sentiment markers
 *   C4  Stale memories: not recalled in decay-half-life window, low strength
 *   C5  Secrets: vault accidentally contains key material (nk_, tvly-, sk-…)
 *   C6  Extraction noise: memories that are still first-person ("I …")
 *   C7  Red zone terms appearing inside stored memories (overshoot)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECAY_HALF_LIFE_D, cosine } from '../src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] || path.resolve(__dirname, '..', 'vault');
const file = path.join(dir, 'vault.json');

if (!fs.existsSync(file)) {
  console.error(`vault not found: ${file}`);
  process.exit(2);
}
const vault = JSON.parse(fs.readFileSync(file, 'utf8'));
/** @type {any[]} */
const mems = vault.memories || [];

/** @type {string[]} */ const fail = [];
/** @type {string[]} */ const warn = [];
const sec = (/** @type {string} */ t) => console.log(`\n== ${t} ==`);

console.log(`✶ Mnemos Vault Doctor — ${file}`);
console.log(`   memories=${mems.length} insights=${(vault.insights || []).length} skills=${(vault.skills || []).length}`);

// C1 — embeddings
sec('C1 · embedding coverage');
const withVec = mems.filter((m) => Array.isArray(m.vec) && m.vec.length);
console.log(`   ${withVec.length}/${mems.length} memories have vectors`);
if (mems.length && withVec.length / mems.length < 0.95) {
  fail.push(`C1 only ${withVec.length}/${mems.length} memories embedded — semantic recall is degraded${'.'} POST /api/embed/backfill first.`);
}

// C2 — duplicates
sec('C2 · duplicates');
const norm = (/** @type {string} */ s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
/** @type {Map<string, string[]>} */
const byNorm = new Map();
for (const m of mems) {
  const k = norm(m.text).slice(0, 120);
  byNorm.set(k, [...(byNorm.get(k) || []), m.id]);
}
let dupCount = 0;
for (const [k, ids] of byNorm) if (ids.length > 1) { dupCount += 1; console.log(`   dup: ${ids.length}× “${k.slice(0, 70)}…”`); }
if (dupCount) fail.push(`C2 ${dupCount} duplicate group(s) in vault.`);

// C3 — contradictions (tag overlap + negation flip)
sec('C3 · contradiction scan');
const NEG = /\b(no|not|never|quit|stopped|hate|allergic|avoid)\b/;
const POS = /\b(love|like|enjoy|always|prefer|started)\b/;
let contra = 0;
for (let i = 0; i < mems.length; i += 1) {
  for (let j = i + 1; j < mems.length; j += 1) {
    const a = mems[i]; const b = mems[j];
    const tagOverlap = (/** @type {any} */ (a.tags) || []).filter((/** @type {any} */ t) => /** @type {any} */ ((b.tags || [])).includes(t)).length;
    const near = Array.isArray(a.vec) && Array.isArray(b.vec) && cosine(a.vec, b.vec) > 0.86;
    if (tagOverlap >= 2 || near) {
      const flipped = NEG.test(a.text) !== NEG.test(b.text) || POS.test(a.text) !== POS.test(b.text);
      if (flipped) {
        contra += 1;
        console.log(`   conflict: [${a.id.slice(0, 8)}] “${a.text.slice(0, 60)}” ↔ [${b.id.slice(0, 8)}] “${b.text.slice(0, 60)}”`);
      }
    }
  }
}
if (contra) warn.push(`C3 ${contra} possible contradiction pair(s) — verify the newer statement won.`);

// C4 — staleness
sec('C4 · staleness');
const HALF_LIFE_D = DECAY_HALF_LIFE_D;
/** @type {any[]} */
const stale = mems.filter((/** @type {any} */ m) => (Date.now() - m.lastUsed) / 86400000 > HALF_LIFE_D * 3 && m.uses < 2);
console.log(`   ${stale.length} memories unused in ${HALF_LIFE_D * 3}d with <2 recalls`);
if (stale.length > mems.length * 0.4) warn.push(`C4 ${stale.length} stale memories (${Math.round(100 * stale.length / mems.length)}%) — recall may surface outdated facts. Dream to decay them.`);

// C5 — secrets
sec('C5 · secret leakage');
const rx = /(sk-[A-Za-z0-9]{16,}|nk-[A-Za-z0-9_]{12,}|tvly-[A-Za-z0-9\-_]{12,}|Bearer +[A-Za-z0-9._-]{16,})/g;
let leaked = 0;
for (const m of [...mems, ...(vault.insights || [])]) {
  const hits = String(m.text || '').match(rx);
  if (hits) { leaked += hits.length; console.log(`   SECRET inside ${m.id.slice(0, 8)}: ${hits[0].slice(0, 10)}…`); }
}
if (leaked) fail.push(`C5 ${leaked} secret-shaped string(s) stored in vault — purge immediately.`);

// C6 — extraction noise
sec('C6 · first-person extraction noise');
const fp = mems.filter((m) => /^\s*(I|i|my|we)\b/.test(String(m.text)));
console.log(`   ${fp.length} memories start in first person`);
if (fp.length > mems.length * 0.2) warn.push(`C6 ${fp.length} first-person memories — extraction prompt drift. Reword to third person (“User prefers…”).`);

// C7 — red-zone overshoot
sec('C7 · red-zone overshoot');
const rz = vault.redZone || [];
let overshoot = 0;
for (const t of rz) {
  const needle = t.toLowerCase().split(/\s+/).find((/** @type {string} */ w) => w.length > 3);
  if (!needle) continue;
  for (const m of mems) if (String(m.text).toLowerCase().includes(needle)) { overshoot += 1; console.log(`   red-zone term “${t}” leaked into ${m.id.slice(0, 8)}`); }
}
if (overshoot) fail.push(`C7 ${overshoot} memory(ies) contain red-zone material — delete with /api/forget.`);

console.log('');
if (fail.length) { console.log('✗ FAIL'); for (const f of fail) console.log(`   ${f}`); }
else if (warn.length) { console.log('△ PASS WITH WARNINGS'); for (const w of warn) console.log(`   ${w}`); }
else console.log('✓ PASS — vault is clean, hybrid recall is armed, no contamination found.');
process.exit(fail.length ? 2 : warn.length ? 1 : 0);
