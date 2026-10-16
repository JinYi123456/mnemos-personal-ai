import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from './store.js';
import { seedDemoVault } from './seed.js';

const SID_RE = /^[a-f0-9]{12,32}$/;

/**
 * One vault per visitor.
 *
 * The old build kept a single shared vault on the server, which meant two
 * visitors — or a judge and a stranger — were reading the same sky. That made
 * "your memory stays yours" a slogan rather than a property. Here every session
 * gets its own directory, its own Store, and nothing in between: no account, no
 * cross-session index, no telemetry. Delete the directory and the memory is gone
 * for real.
 */
export class Vaults {
  /**
   * @param {string} root directory holding one subdirectory per session
   * @param {{ttlDays?:number, maxLive?:number, seedEmpty?:boolean,
   *          onLog?: (msg:string)=>void}} [opts]
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.ttlDays = opts.ttlDays ?? 45;
    this.maxLive = opts.maxLive ?? 64;
    this.seedEmpty = opts.seedEmpty !== false;
    this.log = opts.onLog || (() => {});
    /** @type {Map<string, {store: Store, lastSeen: number}>} */
    this.live = new Map();
    this.opened = 0;
  }

  /** @returns {string} a fresh, unguessable session id */
  static newId() {
    return crypto.randomBytes(12).toString('hex');
  }

  /**
   * Validate a client-supplied id. Anything else (path separators, `..`, odd
   * lengths) is refused rather than sanitized, so a bad cookie can never walk
   * the filesystem.
   * @param {unknown} raw
   */
  static cleanId(raw) {
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return SID_RE.test(s) ? s : null;
  }

  /** @param {string} sid */
  dirFor(sid) {
    return path.join(this.root, sid);
  }

  /**
   * Load (or first-run create + seed) the vault for a session.
   * @param {string} sid
   * @returns {Promise<Store>}
   */
  async open(sid) {
    const clean = Vaults.cleanId(sid);
    if (!clean) throw new Error('invalid session id');
    const existing = this.live.get(clean);
    if (existing) {
      existing.lastSeen = Date.now();
      this.live.delete(clean);
      this.live.set(clean, existing);
      return existing.store;
    }
    this.#makeRoom();
    const dir = this.dirFor(clean);
    await fsp.mkdir(dir, { recursive: true });
    const store = new Store(dir);
    await store.load();
    if (this.seedEmpty && store.vault.memories.length === 0) {
      seedDemoVault(store);
      await store.flush();
    }
    this.live.set(clean, { store, lastSeen: Date.now() });
    this.opened += 1;
    return store;
  }

  /** Create a brand-new session vault. @returns {Promise<{sid:string, store:Store}>} */
  async create() {
    const sid = Vaults.newId();
    const store = await this.open(sid);
    return { sid, store };
  }

  /**
   * Forget everything this session ever told Mnemos.
   * @param {string} sid
   */
  async destroy(sid) {
    const clean = Vaults.cleanId(sid);
    if (!clean) return false;
    this.live.delete(clean);
    try {
      await fsp.rm(this.dirFor(clean), { recursive: true, force: true });
      return true;
    } catch (e) {
      this.log(`burn failed: ${String(/** @type {any} */ (e).message || e)}`);
      return false;
    }
  }

  /**
   * Stream the raw vault file to the visitor as a download — the memory
   * passport. It is plain JSON they can read in any editor and re-import into a
   * local install.
   * @param {string} sid
   * @returns {Promise<{file:string, size:number}|null>}
   */
  async exportPath(sid) {
    const clean = Vaults.cleanId(sid);
    if (!clean) return null;
    const file = path.join(this.dirFor(clean), 'vault.json');
    if (!fs.existsSync(file)) return null;
    return { file, size: fs.statSync(file).size };
  }

  /**
   * Import a vault a visitor exported earlier.
   * @param {string} sid
   * @param {unknown} rawJson
   * @returns {Promise<{memories:number, insights:number, skills:number}|null>}
   */
  async importInto(sid, rawJson) {
    const clean = Vaults.cleanId(sid);
    if (!clean) return null;
    let parsed;
    try {
      parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    } catch {
      return null;
    }
    if (!parsed || !Array.isArray(parsed.memories)) return null;
    const dir = this.dirFor(clean);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'vault.json'), JSON.stringify(parsed, null, 2), 'utf8');
    this.live.delete(clean);
    const store = await this.open(clean);
    return {
      memories: store.vault.memories.length,
      insights: store.vault.insights.length,
      skills: store.vault.skills.length,
    };
  }

  /**
   * Drop vaults untouched for longer than ttlDays. Sandbox hosts get reused by
   * strangers; expiring is part of the privacy promise.
   */
  async sweep() {
    /** @type {string[]} */
    let dirs = [];
    try {
      dirs = await fsp.readdir(this.root);
    } catch {
      return { removed: 0 };
    }
    const cutoff = Date.now() - this.ttlDays * 86400000;
    let removed = 0;
    for (const d of dirs) {
      const clean = Vaults.cleanId(d);
      if (!clean) continue;
      const live = this.live.get(clean);
      if (live && live.lastSeen > cutoff) continue;
      const dir = path.join(this.root, clean);
      try {
        const st = await fsp.stat(path.join(dir, 'vault.json'));
        if (st.mtimeMs > cutoff) continue;
      } catch {
        continue;
      }
      this.live.delete(clean);
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
      removed += 1;
    }
    if (removed) this.log(`swept ${removed} idle vault(s) older than ${this.ttlDays}d`);
    return { removed };
  }

  /** Bounded-memory guarantee for a public demo. */
  #makeRoom() {
    if (this.live.size < this.maxLive) return;
    const oldest = [...this.live.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
    if (oldest) {
      // Stores are flushed on every write, so dropping the handle loses nothing.
      this.live.delete(oldest[0]);
    }
  }

  /** @returns {{live:number, opened:number, root:string}} */
  stats() {
    return { live: this.live.size, opened: this.opened, root: this.root };
  }
}
