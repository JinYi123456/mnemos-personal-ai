/* ===== Mnemos v3 front-end: under the hood, ablation, sound, ownership, tour =====
 * Loaded after app.js. Everything here is additive: it reads the app's existing
 * globals (els, api, stars, toast, refreshAll…) and hooks into the chat stream.
 */
'use strict';

/* ---------- Sound: tiny procedural chimes. No assets, never auto-enabled. ---------- */
const Sound = (() => {
  /** @type {AudioContext|null} */
  let actx = null;
  let on = false;
  const ready = () => {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  };
  function blip(freq, dur, type, gain, slide) {
    if (!on) return;
    try {
      const c = ready();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), c.currentTime + dur);
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(gain || 0.04, c.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    } catch { /* sound is decoration — it must never break a turn */ }
  }
  return {
    get enabled() { return on; },
    setEnabled(v) { on = !!v; if (on) blip(520, 0.1, 'triangle', 0.03); },
    born() { blip(880, 0.24, 'triangle', 0.05, 240); },
    think() { blip(392, 0.09, 'sine', 0.028); },
    tool() { blip(660, 0.07, 'square', 0.018); },
    dreamIn() { blip(220, 0.9, 'sine', 0.035, -70); },
    insight() { blip(784, 0.4, 'triangle', 0.045, 140); },
    wake() { blip(523, 0.3, 'sine', 0.04, 190); },
    nope() { blip(180, 0.2, 'sawtooth', 0.03, -50); },
  };
})();

/* ---------- Under the hood: live per-call telemetry from Token Factory ---------- */
const Hood = (() => {
  /** @type {any[]} */
  const calls = [];
  let open = false;
  /** @type {any} */
  let totals = null;
  /** @type {any} */
  let card = null;

  const fmtUsd = (/** @type {number} */ n) => (!n ? '$0.0000' : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(3)}`);

  function render() {
    const elCalls = $('hood-calls');
    const elModels = $('hood-models');
    const elTotal = $('hood-total');
    if (!elCalls || !elModels) return;
    elCalls.innerHTML = calls.slice(-16).reverse().map((c) => `
      <div class="hood-call${c.native ? '' : ' prose'}" title="${esc(String(c.model || ''))}">
        <span class="tg">${esc(String(c.tier || 'fast'))}${c.native ? '' : ' ·prose'}</span>
        <span class="mm">${(c.promptTokens || 0)}+${(c.completionTokens || 0)} tok${c.cachedTokens ? ` · kv ${c.cachedTokens}` : ''} · ${Math.round(c.ms || 0)}ms</span>
        <span class="cs">${c.costKnown === false ? '—' : fmtUsd(c.cost)}</span>
      </div>`).join('')
      || '<div class="hood-call"><span class="tg">idle</span><span class="mm">no model calls yet in this drawer</span><span class="cs"></span></div>';
    if (totals) {
      const s = totals.spend || {};
      const toks = (s.promptTokens || 0) + (s.completionTokens || 0);
      elTotal.textContent = `${s.calls || 0} calls · ${toks.toLocaleString()} tok · ${fmtUsd(s.usd || 0)}`;
      const m = totals.models || {};
      const b = totals.budget || {};
      const rows = [
        ['fast · routing+tools', m.chat],
        ['reason · dreaming', m.reasoning],
        ['frontier · synthesis', m.frontier],
        ['embed · recall', m.embedding],
        ['catalog', totals.catalog ? `${totals.catalog.size} models live` : '—'],
        ['left for you today', `${b.centsLeftToday != null ? (b.centsLeftToday / 100).toFixed(2) + ' ¢' : '—'} · ${((b.tokensLeftToday || 0) / 1000) | 0}k tok`],
      ];
      if (card && card.pricing) {
        // Token Factory quotes per-token prices; show them the way judges read them.
        const perM = (/** @type {any} */ x) => (x == null ? '—' : `$${(Number(x) * 1e6).toFixed(2)}`);
        rows.push(['platform price', `${perM(card.pricing.prompt)} in · ${perM(card.pricing.completion)} out per 1M`]);
      }
      if (card && card.supported_features) {
        rows.push(['platform says', card.supported_features.join(' · ')]);
      }
      if (card && card.context_length) {
        const lim = card.per_request_limits || {};
        rows.push(['context / ceiling', `${(card.context_length / 1024).toFixed(0)}k ctx · ${card.quantization || ''} · ${lim.tokens_per_minute ? (lim.tokens_per_minute / 1000).toFixed(0) + 'k tok/min' : ''}`]);
      }
      elModels.innerHTML = rows.map(([k, v]) => `<div class="tier"><span>${k}</span><span title="${esc(String(v || '—'))}">${esc(String(v || '—'))}</span></div>`).join('');
    }
  }

  async function pull() {
    try {
      totals = await api('/api/meter');
      if (card === null) card = await api('/api/modelcard').catch(() => undefined);
    } catch { /* an offline demo still shows the calls it saw */ }
    render();
  }

  return {
    /** @param {any} ev */
    record(ev) {
      calls.push(ev);
      if (open) render();
    },
    toggle() {
      open = !open;
      $('hood').classList.toggle('hidden', !open);
      if (open) pull();
    },
    refresh() { if (open) pull(); },
  };
})();

/* ---------- Ablation: click a star, see what changes if Mnemos forgets it ---------- */
const Ablate = (() => {
  let lastQuery = '';

  /**
   * @param {Array<{op:string,w:string}>} diff
   * @param {'with'|'without'} side
   */
  function words(diff, side) {
    return (diff || []).map((d) => {
      if (d.op === 'same') return esc(d.w);
      if (d.op === 'del') return side === 'with' ? `<span class="d-w d-del">${esc(d.w)}</span>` : '';
      return side === 'without' ? `<span class="d-w d-add">${esc(d.w)}</span>` : '';
    }).join(' ').replace(/\s{2,}/g, ' ');
  }

  /** @param {string} id @param {string} text */
  async function run(id, text) {
    const wrap = $('ablate-overlay');
    const body = $('ablate-body');
    wrap.classList.remove('hidden');
    $('ablate-held').innerHTML = `<b>M${String(id).slice(0, 8)}</b> · ${esc(text || '')}`;
    body.innerHTML = '<div class="thinking">answering the same question twice — once with this memory, once without…</div>';
    Sound.think();
    const q = lastQuery || 'What do you remember about me that matters right now?';
    /** @type {any} */
    let r;
    try {
      r = await api('/api/ablation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, query: q }),
      });
    } catch (e) {
      body.innerHTML = `<div class="ab-verdict"><span class="ab-badge null">experiment failed</span> ${esc(String(/** @type {any} */ (e).message || e))}</div>`;
      Sound.nope();
      return;
    }
    if (!r || !r.ok) {
      body.innerHTML = `<div class="ab-verdict"><span class="ab-badge null">${esc(r && r.error ? r.error : 'no result')}</span>${r && r.resting ? ' The demo is resting — generation budget is paused.' : ''}</div>`;
      Sound.nope();
      return;
    }
    const v = r.verdict || {};
    body.innerHTML = `
      <div class="ab-metrics"><span>question · <b>${esc(q)}</b></span></div>
      <div class="ab-cols">
        <div class="ab-col with"><h3>With the memory</h3><p>${words(r.diff, 'with')}</p>
          <div class="ab-metrics" style="margin-top:10px"><span>cites <b>${(r.with.cites || []).length}</b></span><span>${Math.round(r.with.ms)}ms</span><span>${esc(String(r.with.model || '').split('/').pop())}</span></div></div>
        <div class="ab-col without"><h3>Without it</h3><p>${words(r.diff, 'without')}</p>
          <div class="ab-metrics" style="margin-top:10px"><span>cites <b>${(r.without.cites || []).length}</b></span><span>${Math.round(r.without.ms)}ms</span></div></div>
      </div>
      <div class="ab-verdict">
        <span class="ab-badge ${r.loadBearing ? 'load' : 'null'}">${r.loadBearing ? 'load-bearing memory' : 'changed nothing'}</span>
        <span>${esc(v.why || 'the two answers differ; no model verdict was available')}</span>
      </div>
      <div class="ab-metrics">
        <span>similarity <b>${Math.round((r.similarity || 0) * 100)}%</b></span>
        <span>citations lost <b>${(r.lostCites || []).length}</b></span>
        <span>impact <b>${v.strength != null ? `${v.strength}/5` : '—'}</b></span>
        <span>context <b>${r.context.with} → ${r.context.without}</b></span>
        <span>experiment cost <b>$${(r.costUSD || 0).toFixed(5)}</b></span>
      </div>`;
    if (r.loadBearing) Sound.insight(); else Sound.tool();
  }

  $('ablate-close').addEventListener('click', () => $('ablate-overlay').classList.add('hidden'));
  $('ablate-overlay').addEventListener('click', (e) => { if (e.target === $('ablate-overlay')) $('ablate-overlay').classList.add('hidden'); });

  return { run, /** @param {string} q */ setQuery(q) { if (q && q.length > 3) lastQuery = q; } };
})();

/* ---------- Recall replay: light travels along the stars it actually read ---------- */
function tracePulse(/** @type {string[]} */ ids) {
  (ids || []).slice(0, 8).forEach((id, i) => setTimeout(() => {
    const s = stars.find((st) => st.id.startsWith(String(id).replace(/^M/, '')));
    if (!s) return;
    flareIds.add(s.id);
    Sound.tool();
    setTimeout(() => flareIds.delete(s.id), 900);
  }, i * 140));
}

/* ---------- First-run tour: think → cite → test → own (45s, skippable) ---------- */
const Tour = (() => {
  let running = false;
  const wait = (/** @type {number} */ ms) => new Promise((res) => setTimeout(res, ms));
  async function start() {
    if (running) return;
    running = true;
    $('hood').classList.remove('hidden');
    Hood.toggle(); Hood.toggle();
    toast('✶ Tour — watch it think, then test it. Press Esc to stop.');
    els.input.value = 'What do you remember about me, and what should I plan next?';
    sendChat();
    await wait(9000);
    els.input.value = 'Search the web for the best week to see cherry blossoms in Kyoto.';
    sendChat();
    await wait(11000);
    const pick = stars.find((st) => !st.seed) || stars[0];
    if (pick) Ablate.run(pick.id, pick.text);
    await wait(9000);
    $('ablate-overlay').classList.add('hidden');
    els.input.value = 'Remember this: I want to run a half marathon before my 30th birthday.';
    sendChat();
    await wait(10000);
    running = false;
    toast('✦ That green star did not exist one minute ago. It is yours to keep, export, or burn.');
    refreshAll();
    Hood.refresh();
  }
  return { start, get running() { return running; } };
})();

/* ---------- Ownership: sandbox identity, import, burn ---------- */
async function renderOwnership() {
  const el = $('panel-privacy');
  if (!el) return;
  try {
    const s = await api('/api/session');
    el.innerHTML = s.mode === 'sandbox'
      ? `Your own sandbox vault <code>M${String(s.sid).slice(0, 8)}</code> — no account, no shared index, no telemetry. Only your model calls leave this browser. Export it, or burn it; idle vaults expire on their own.`
      : 'Owner vault on this machine — the same file the MCP server and the nightly dream read.';
  } catch {
    el.textContent = '';
  }
}

$('btn-hood').addEventListener('click', () => Hood.toggle());
$('hood-close').addEventListener('click', () => Hood.toggle());
$('sound-toggle').addEventListener('change', (e) => {
  Sound.setEnabled(/** @type {any} */ (e.target).checked);
  if (/** @type {any} */ (e.target).checked) Sound.born();
});
$('btn-burn').addEventListener('click', async () => {
  const sure = await ask(
    'Burn this vault?',
    'Every memory, insight and skill in this sandbox is deleted from the server. There is no undo — export first if you want a copy.\n\nType BURN to confirm.',
    '',
  );
  if (sure === null) return;
  if (String(sure).trim().toUpperCase() !== 'BURN') { toast('Not burned — type BURN to confirm.'); return; }
  try {
    await api('/api/burn', { method: 'POST' });
    toast('🔥 Vault burned. Waking a fresh sky…');
    Sound.nope();
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    toast(`Could not burn: ${/** @type {any} */ (e).message}`);
  }
});
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const f = /** @type {any} */ (e.target).files && /** @type {any} */ (e.target).files[0];
  if (!f) return;
  const raw = await f.text();
  try {
    const r = await api('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!r.ok) { toast(r.error || 'not a Mnemos vault file'); return; }
    toast(`⇧ Imported ${r.memories} memories · ${r.insights} insights · ${r.skills} skills`);
    Sound.wake();
    refreshAll();
  } catch (err) {
    toast(`Import failed: ${/** @type {any} */ (err).message}`);
  }
  /** @type {any} */ (e.target).value = '';
});

/* star peek gains the ablation action, without rewriting the card itself */
const _showStarPeek = showStarPeek;
showStarPeek = function (/** @type {any} */ s, /** @type {any} */ clickEvent) {
  _showStarPeek(s, clickEvent);
  const card = els.starPeek;
  const act = document.createElement('div');
  act.className = 'peek-act';
  act.innerHTML = `<button data-abl="${esc(s.id)}">🧪 What if it forgot this?</button>`;
  card.appendChild(act);
  act.querySelector('[data-abl]').addEventListener('click', (ev) => {
    ev.stopPropagation();
    Ablate.run(ev.currentTarget.getAttribute('data-abl'), s.text);
    hideStarPeek();
  });
  positionStarPeek(s, clickEvent);
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('ablate-overlay').classList.contains('hidden')) $('ablate-close').click();
    if (!$('hood').classList.contains('hidden')) Hood.toggle();
  }
});

/* tour entry point: skip the name prompt, just show the machine working */
const tourBtn = $('btn-tour');
if (tourBtn) tourBtn.addEventListener('click', () => {
  $('onboard').classList.add('hidden');
  Tour.start();
});

/* the vault panel explains whose vault you are in, every time it opens */
$('btn-panel').addEventListener('click', () => { renderOwnership(); });
renderOwnership();

/* expose for app.js's chat stream hooks (loaded earlier, called later) */
Object.assign(window, { Sound, Hood, Ablate, Tour, tracePulse, renderOwnership });
