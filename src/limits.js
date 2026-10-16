const MINUTE = 60_000;
const HOUR = 3_600_000;

/**
 * Per-visitor and per-host spend guard.
 *
 * A public demo that calls a paid inference API with no ceiling is a denial of
 * service against your own credit balance — and one bored visitor is all it
 * takes. The gate is deliberately boring: fixed windows, in memory, no account
 * needed. What matters is that there are three independent ceilings (visitor,
 * IP, host) so no single leak can drain the run.
 */
export class Gate {
  /**
   * @param {{turnsPerMinutePerIp?:number, turnsPerHourPerSession?:number,
   *          dailyTokensPerSession?:number, dailyUsdPerSession?:number,
   *          dailyUsdHost?:number, sessionsPerIpPerDay?:number,
   *          dreamPerHourPerSession?:number}} [limits]
   */
  constructor(limits = {}) {
    this.limits = {
      turnsPerMinutePerIp: num(limits.turnsPerMinutePerIp, 6),
      turnsPerHourPerSession: num(limits.turnsPerHourPerSession, 30),
      dreamPerHourPerSession: num(limits.dreamPerHourPerSession, 3),
      dailyTokensPerSession: num(limits.dailyTokensPerSession, 400_000),
      dailyUsdPerSession: num(limits.dailyUsdPerSession, 0.75),
      dailyUsdHost: num(limits.dailyUsdHost, 8),
      sessionsPerIpPerDay: num(limits.sessionsPerIpPerDay, 12),
    };
    /** @type {Map<string|number, number>} */ this.ipMin = new Map();
    /** @type {Map<string|number, number>} */ this.sidHour = new Map();
    /** @type {Map<string|number, number>} */ this.sidDreamHour = new Map();
    /** @type {Map<string, {tokens:number, usd:number, day:string}>} */ this.sidDay = new Map();
    /** @type {Map<string, number>} */ this.ipDaySessions = new Map();
    this.hostDay = { usd: 0, day: today() };
    /** Fixed-window bookkeeping: which minute/hour bucket the counters belong to. */
    this.window = { minute: minKey(), hour: hourKey() };
  }

  /**
   * May this visitor start another agent turn right now?
   * @param {{ip:string, sid:string, kind?:'turn'|'dream'}} q
   * @returns {{ok:boolean, reason?:string, retryAfterMs?:number, left:Object<string,number>}}
   */
  check(q) {
    this.#rollDay();
    const kind = q.kind || 'turn';
    const left = this.remaining(q.ip, q.sid);
    if (this.hostDay.usd >= this.limits.dailyUsdHost) {
      return { ok: false, reason: 'host_budget', left };
    }
    const d = this.sidDay.get(q.sid);
    if (d && (d.usd >= this.limits.dailyUsdPerSession || d.tokens >= this.limits.dailyTokensPerSession)) {
      return { ok: false, reason: 'session_budget', left };
    }
    if (kind === 'dream') {
      const used = this.sidDreamHour.get(hourKey()) || 0;
      if (used >= this.limits.dreamPerHourPerSession) {
        return { ok: false, reason: 'dream_rate', retryAfterMs: HOUR - (Date.now() % HOUR), left };
      }
      return { ok: true, left };
    }
    const perIp = this.ipMin.get(minKey()) || 0;
    if (perIp >= this.limits.turnsPerMinutePerIp) {
      return { ok: false, reason: 'ip_rate', retryAfterMs: MINUTE - (Date.now() % MINUTE), left };
    }
    const perSid = this.sidHour.get(hourKey()) || 0;
    if (perSid >= this.limits.turnsPerHourPerSession) {
      return { ok: false, reason: 'session_rate', retryAfterMs: HOUR - (Date.now() % HOUR), left };
    }
    return { ok: true, left };
  }

  /** Record that a turn/dream is starting. @param {{ip:string, sid:string, kind?:string}} q */
  take(q) {
    const kind = q.kind || 'turn';
    if (kind === 'dream') this.sidDreamHour.set(hourKey(), (this.sidDreamHour.get(hourKey()) || 0) + 1);
    else {
      this.ipMin.set(minKey(), (this.ipMin.get(minKey()) || 0) + 1);
      this.sidHour.set(hourKey(), (this.sidHour.get(hourKey()) || 0) + 1);
    }
  }

  /**
   * Fold one metered model call into the visitor's and the host's ledger.
   * @param {{sid:string, tokens?:number, usd?:number}} rec
   */
  addCall(rec) {
    this.#rollDay();
    const day = today();
    let s = this.sidDay.get(rec.sid);
    if (!s) {
      s = { tokens: 0, usd: 0, day };
      this.sidDay.set(rec.sid, s);
    }
    s.tokens += Number(rec.tokens || 0);
    s.usd += Number(rec.usd || 0);
    this.hostDay.usd += Number(rec.usd || 0);
  }

  /**
   * True when a new vault may be created for this IP (blocks vault farming).
   * @param {string} ip
   */
  allowNewSession(ip) {
    this.#rollDay();
    const used = this.ipDaySessions.get(ip) || 0;
    if (used >= this.limits.sessionsPerIpPerDay) return false;
    this.ipDaySessions.set(ip, used + 1);
    return true;
  }

  /** @param {string} ip @param {string} sid */
  remaining(ip, sid) {
    this.#rollDay();
    const day = this.sidDay.get(sid);
    return {
      turnsThisMinuteForIp: Math.max(0, this.limits.turnsPerMinutePerIp - (this.ipMin.get(minKey()) || 0)),
      turnsThisHourForYou: Math.max(0, this.limits.turnsPerHourPerSession - (this.sidHour.get(hourKey()) || 0)),
      tokensLeftToday: Math.max(0, this.limits.dailyTokensPerSession - (day ? day.tokens : 0)),
      centsLeftToday: Math.round(Math.max(0, this.limits.dailyUsdPerSession - (day ? day.usd : 0)) * 100),
      hostCentsLeftToday: Math.round(Math.max(0, this.limits.dailyUsdHost - this.hostDay.usd) * 100),
    };
  }

  #rollDay() {
    const d = today();
    if (this.hostDay.day !== d) {
      this.hostDay = { usd: 0, day: d };
      this.sidDay.clear();
      this.ipDaySessions.clear();
    }
    // Fixed windows: reset the per-minute and per-hour counters when the clock
    // bucket changes, so a visitor who idles gets a full allowance back.
    const m = minKey();
    if (this.window.minute !== m) {
      this.window.minute = m;
      this.ipMin.clear();
    }
    const h = hourKey();
    if (this.window.hour !== h) {
      this.window.hour = h;
      this.sidHour.clear();
      this.sidDreamHour.clear();
    }
  }
}

function minKey() {
  return Math.floor(Date.now() / MINUTE);
}
function hourKey() {
  return Math.floor(Date.now() / HOUR);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
/** @param {unknown} v @param {number} d */
function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}
