import { Dreamer } from './dream.js';

/**
 * Nightly dream scheduler. Runs the Dreamer at a fixed local hour each night
 * (default 03:30) while the server is alive, plus one opportunistic catch-up
 * dream at boot if the last dream was on a previous calendar day.
 */
export class NightDreamer {
  /**
   * @param {import('./store.js').Store} store
   * @param {import('./llm.js').LLM} llm
   * @param {{hour?: number, minute?: number, log?: (msg: string) => void}} [opts]
   */
  constructor(store, llm, opts = {}) {
    this.hour = Number.isInteger(opts.hour) ? /** @type {number} */ (opts.hour) : 3;
    this.minute = Number.isInteger(opts.minute) ? /** @type {number} */ (opts.minute) : 30;
    this.log = opts.log || ((m) => console.log(`  ✦ ${m}`));
    /** @type {Dreamer} */
    this.dreamer = new Dreamer(store, llm);
    /** @type {NodeJS.Timeout|null} */
    this.timer = null;
  }

  /**
   * If the vault wasn't dreamed on a previous calendar day, dream now
   * (slow enough to be gentle at boot; LLM errors degrade gracefully).
   * @returns {Promise<boolean>} whether a catch-up dream ran
   */
  async catchUpAtBoot() {
    const v = this.dreamer.store.vault;
    const last = v.lastDreamAt ? new Date(v.lastDreamAt) : null;
    const today = new Date();
    const sameDay = last && last.getFullYear() === today.getFullYear()
      && last.getMonth() === today.getMonth() && last.getDate() === today.getDate();
    if (sameDay || v.memories.length === 0 || this.dreamer.running) return false;
    this.log('catching up on missed sleep (nightly dream)…');
    const result = await this.dreamer.run((e) => {
      if (e.phase === 'done') this.log(`nightly dream done: ${e.insights || 0} insights, ${e.decayed || 0} faded`);
    }, {});
    return !!result && !result.empty;
  }

  start() {
    const tick = () => {
      const now = new Date();
      if (now.getHours() === this.hour && now.getMinutes() === this.minute) {
        if (!this.dreamer.running) {
          this.log('the clock struck dream-o\'clock — starting nightly dream…');
          this.dreamer.run((e) => {
            if (e.phase === 'done') this.log(`nightly dream done: ${e.insights || 0} insights, ${e.skills || 0} skills, ${e.decayed || 0} faded`);
          }, {}).catch(() => {});
        }
      }
      // re-arm for the next minute (unref'd so tests and one-shot runs can exit)
      this.timer = setTimeout(tick, 60_000);
      if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
    };
    // first tick aligned to the next minute boundary
    const s = 60 - new Date().getSeconds();
    this.timer = setTimeout(tick, Math.max(5, s) * 1000);
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
    this.log(`nightly dream scheduled at ${String(this.hour).padStart(2, '0')}:${String(this.minute).padStart(2, '0')} local time`);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
