import { createHash, randomUUID } from 'node:crypto';

/**
 * @param {string} s
 * @returns {string}
 */
export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * @returns {string}
 */
export function uuid() {
  return randomUUID();
}

/**
 * Deterministic pseudo-random generator (same seed → same layout).
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Clamp a number into [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Parse a number defensively.
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
export function num(v, fallback) {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Human-friendly token-ish unit estimate.
 * @param {string} text
 * @returns {string}
 */
export function unit(text) {
  const toks = Math.max(1, Math.round(text.length / 4));
  return `${toks} tok`;
}

/**
 * Strip control chars and hard-trim text to a max length.
 * @param {unknown} v
 * @param {number} [max=4000]
 * @returns {string}
 */
export function safeText(v, max = 4000) {
  if (typeof v !== 'string') return '';
  return v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, max)
    .trim();
}

/**
 * Very small tokenizer for keyword indexing.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','at','for','with','about',
  'is','are','was','were','be','been','being','do','does','did','have','has','had',
  'i','you','he','she','it','we','they','me','him','her','us','them','my','your',
  'this','that','these','those','as','by','from','so','if','then','than','not',
]);

/**
 * Sleep helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Read only allowed string keys from an object (defense against junk tool args).
 * @param {unknown} obj
 * @param {string[]} allowed
 * @returns {Record<string, string>}
 */
export function pickStrings(obj, allowed) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of allowed) {
    const v = /** @type {any} */ (obj)[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}
