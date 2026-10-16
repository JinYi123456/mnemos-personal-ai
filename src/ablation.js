import { LLM } from './llm.js';

/**
 * Memory ablation — "what if it forgot this?"
 *
 * Every assistant that cites its memory asks you to believe the citation. This
 * does not ask: it answers the same question twice, once with the memory in
 * context and once with that memory surgically removed, then diffs the two
 * answers and asks a cheap model to say whether the difference is material.
 * A star that changes nothing when it is gone is a star that was never load
 * bearing — and you can see that, not read that.
 */

/**
 * Word-level diff via longest-common-subsequence backtracking. Answers here are
 * short (tens of words), so the O(n·m) table is fine and dependency-free.
 * @param {string} a
 * @param {string} b
 * @returns {Array<{op:'same'|'del'|'add', w:string}>}
 */
export function diffWords(a, b) {
  const A = tokenizeWords(a);
  const B = tokenizeWords(b);
  const n = A.length;
  const m = B.length;
  /** @type {Uint16Array[]} */
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  /** @type {Array<{op:'same'|'del'|'add', w:string}>} */
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ op: 'same', w: A[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: 'del', w: A[i] });
      i += 1;
    } else {
      out.push({ op: 'add', w: B[j] });
      j += 1;
    }
  }
  while (i < n) out.push({ op: 'del', w: A[i++] });
  while (j < m) out.push({ op: 'add', w: B[j++] });
  return out;
}

/** @param {string} s */
function tokenizeWords(s) {
  return String(s || '').split(/(\s+)/).filter((t) => t.trim().length > 0);
}

/**
 * @param {Array<{op:string}>} diff
 * @returns {number} 0..1 similarity between the two texts
 */
export function similarityFromDiff(diff) {
  const same = diff.filter((d) => d.op === 'same').length;
  const total = diff.filter((d) => d.op !== 'add').length || 1;
  return Math.round((same / total) * 100) / 100;
}

/**
 * Run one ablation.
 * @param {import('./brain.js').Brain} brain
 * @param {import('./store.js').Store} store
 * @param {{query: string, holdoutId: string, k?: number}} req
 */
export async function ablate(brain, store, req) {
  const query = String(req.query || '').slice(0, 800);
  const k = Math.min(12, Math.max(1, Number(req.k) || 6));
  const held = store.vault.memories.find((m) => m.id === req.holdoutId || m.id.startsWith(req.holdoutId));
  if (!held) return { ok: false, error: 'no such memory' };

  let queryVec = null;
  const qv = await brain.embedTexts([query]);
  if (qv && qv[0]) {
    const cut = qv[0].slice(0, 256);
    const norm = Math.sqrt(cut.reduce((s, v) => s + v * v, 0)) || 1;
    queryVec = cut.map((v) => v / norm);
  }
  const full = store.recall(query, k, queryVec ?? undefined);
  const without = full.filter((m) => m.id !== held.id);

  const withAnswer = await brain.answerWith(query, full);
  const withoutAnswer = await brain.answerWith(query, without);

  const diff = diffWords(withAnswer.text, withoutAnswer.text);
  const similarity = similarityFromDiff(diff);
  const lostCites = withAnswer.cites.filter((c) => !withoutAnswer.cites.some((d) => d.id === c.id));

  /** @type {{changed:boolean, why:string, strength:number}|null} */
  let verdict = null;
  try {
    const { text } = await brain.llm.chat({
      account: brain.account,
      maxTokens: 260,
      messages: [
        {
          role: 'system',
          content: 'You compare two answers from a memory-augmented assistant. The only difference is that one memory was withheld from the second answer. Decide whether the second answer is materially worse (it lost a fact, became vague, or contradicts the withheld memory). Reply ONLY JSON: {"changed":true|false,"strength":0-5,"why":"<=160 chars"}',
        },
        {
          role: 'user',
          content: `WITHHELD MEMORY: ${held.text}\n\nWITH IT:\n${withAnswer.text}\n\nWITHOUT IT:\n${withoutAnswer.text}`,
        },
      ],
    });
    const j = LLM.parseJSON(text);
    if (j && typeof j.changed === 'boolean') {
      verdict = { changed: j.changed, why: String(j.why || '').slice(0, 200), strength: Math.max(0, Math.min(5, Number(j.strength) || 0)) };
    }
  } catch {
    verdict = null;
  }

  return {
    ok: true,
    query,
    held: { id: `M${held.id.slice(0, 8)}`, text: held.text, uses: held.uses, source: held.source },
    context: { with: full.length, without: without.length },
    with: { text: withAnswer.text, cites: withAnswer.cites, ms: withAnswer.ms, model: withAnswer.model },
    without: { text: withoutAnswer.text, cites: withoutAnswer.cites, ms: withoutAnswer.ms, model: withoutAnswer.model },
    diff,
    similarity,
    lostCites,
    verdict,
    loadBearing: !!(verdict?.changed || lostCites.length || similarity < 0.85),
    costUSD: withAnswer.cost.usd + withoutAnswer.cost.usd,
  };
}
