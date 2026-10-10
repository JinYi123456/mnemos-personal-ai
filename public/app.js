/* ===== Mnemos front-end: galaxy renderer + chat client ===== */
'use strict';

const $ = (id) => document.getElementById(id);
const els = {
  galaxy: $('galaxy'), stats: $('top-stats'), provider: $('btn-provider'),
  dream: $('btn-dream'), panelBtn: $('btn-panel'), panel: $('panel'),
  closePanel: $('btn-close-panel'), exportBtn: $('btn-export'),
  onboard: $('onboard'), ownerName: $('owner-name'), btnOwner: $('btn-owner'),
  dreamOverlay: $('dream-overlay'), dreamTitle: $('dream-title'),
  dreamStream: $('dream-stream'), dreamResult: $('dream-result'),
  dreamClose: $('btn-dream-close'), messages: $('messages'), input: $('input'),
  send: $('btn-send'), ticker: $('ticker'), toast: $('toast'),
  redzone: $('btn-redzone'), rzOverlay: $('redzone-overlay'), rzList: $('rz-list'),
  rzInput: $('redzone-input'), rzAdd: $('redzone-add'), rzClose: $('redzone-close'),
};

/* ---------- state ---------- */
const state = {
  owner: null,
  galaxy: { stars: [], links: [] },
  highlighted: new Set(),
  dreaming: false,
  busy: false,
};

/* ================= GALAXY RENDERER ================= */
const canvas = els.galaxy;
const ctx = canvas.getContext('2d');
/** @type {Array<{id:string,x:number,y:number,r:number,tw:number,base:number,text:string,tags:string[],seed:boolean,hue:number,speed:number,tx:number,ty:number}>} */
let stars = [];
/** @type {Array<{insightId:string,from:object,to:object,text:string,name:string|null}>} */
let links = [];
let W = 0, H = 0, t = 0;
const mouse = { x: -9999, y: -9999 };
/** @type {Set<string>} */
let flareIds = new Set();

/* --- deep-sky ambience: dust, nebulae, meteors, Milky Way band --- */
/** @type {Array<{x:number,y:number,r:number,a:number,ph:number,hue:number,layer:number}>} */
let dust = [];
/** @type {Array<{x:number,y:number,r:number,hue:number,a:number}>} */
let nebulae = [];
/** @type {Array<{x:number,y:number,vx:number,vy:number,life:number,len:number}>} */
let meteors = [];
let nextMeteor = 2 + Math.random() * 5;

function resize() {
  W = canvas.width = window.innerWidth * devicePixelRatio;
  H = canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  // rebuild ambience on resize (deterministic enough, cheap)
  buildAmbience();
  // relayout existing stars for the new viewport (same id → same relative spot)
  if (stars.length && state.galaxy.stars.length === stars.length) {
    stars.forEach((s, i) => {
      const pos = hashPos(s.id, i);
      s.x = pos.x; s.y = pos.y;
    });
  }
}
window.addEventListener('resize', resize);

function buildAmbience() {
  dust = [];
  const n = Math.round((W * H) / 26000 / (devicePixelRatio * devicePixelRatio));
  for (let i = 0; i < n; i += 1) {
    dust.push({
      x: Math.random() * W, y: Math.random() * H,
      r: (0.4 + Math.random() * 1.1) * devicePixelRatio,
      a: 0.08 + Math.random() * 0.3,
      ph: Math.random() * Math.PI * 2,
      hue: [200, 215, 45, 270][Math.floor(Math.random() * 4)],
      layer: 0.25 + Math.random() * 0.6,
    });
  }
  nebulae = [];
  const hues = [[265, 30], [205, 26], [330, 18], [45, 14]];
  for (let i = 0; i < 5; i += 1) {
    const [h, a] = hues[i % hues.length];
    nebulae.push({
      x: Math.random() * W, y: Math.random() * H * 0.9,
      r: (140 + Math.random() * 260) * devicePixelRatio,
      hue: h, a: a / 100,
    });
  }
}

/* --- pan & zoom --- */
const view = { x: 0, y: 0, zoom: 1 };
let dragging = false, dragMoved = false, lastX = 0, lastY = 0;

canvas.addEventListener('mousedown', (e) => {
  dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX * devicePixelRatio;
  mouse.y = e.clientY * devicePixelRatio;
  if (dragging) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    view.x += dx * devicePixelRatio;
    view.y += dy * devicePixelRatio;
    lastX = e.clientX; lastY = e.clientY;
  }
});
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.deltaY < 0 ? 1.12 : 0.89;
  const nz = Math.min(3.2, Math.max(0.45, view.zoom * k));
  // zoom toward cursor
  const cx = e.clientX * devicePixelRatio, cy = e.clientY * devicePixelRatio;
  view.x = cx - (cx - view.x) * (nz / view.zoom);
  view.y = cy - (cy - view.y) * (nz / view.zoom);
  view.zoom = nz;
}, { passive: false });

function hashPos(id, i) {
  let h = 2166136261;
  for (let c = 0; c < id.length; c += 1) {
    h ^= id.charCodeAt(c);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h ^= h << 13; h = Math.imul(h, 1) >>> 0;
    h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
  const cx = W / 2 + Math.sin(i * 12.9898) * W * 0.04;
  const cy = H * 0.42 + Math.cos(i * 78.233) * H * 0.05;
  const angle = rnd() * Math.PI * 2;
  const arm = (i % 3) * (Math.PI * 2 / 3);
  const dist = (0.08 + 0.36 * Math.sqrt(rnd())) * Math.min(W, H);
  return {
    x: cx + Math.cos(angle + arm) * dist,
    y: cy + Math.sin(angle + arm) * dist * 0.72,
  };
}

/* Star palette: warm golds, ice blues, violet — weighted. */
function starHue(seed01) {
  const roll = seed01;
  if (roll < 0.5) return 45 + seed01 * 30;    // gold
  if (roll < 0.8) return 205 + seed01 * 25;   // ice blue
  return 262 + seed01 * 18;                    // violet
}

function buildStars() {
  const g = state.galaxy;
  const old = new Map(stars.map((s) => [s.id, s]));
  stars = g.stars.map((m, i) => {
    const prev = old.get(m.id);
    const pos = prev ? { x: prev.x, y: prev.y } : hashPos(m.id, i);
    // per-star hue/speed derived from id hash (stable across sessions)
    let h = 0;
    for (let c = 0; c < m.id.length; c += 1) h = (h * 31 + m.id.charCodeAt(c)) >>> 0;
    const rndSeed = (h / 4294967296);
    return {
      id: m.id, x: pos.x, y: pos.y,
      r: m.size * devicePixelRatio * 0.9,
      tw: Math.random() * Math.PI * 2,
      base: 0.45 + (m.seed ? 0.15 : 0),
      text: m.text, tags: m.tags, seed: m.seed,
      hue: prev ? prev.hue : starHue(rndSeed),
      speed: 0.35 + ((h >>> 8 & 255) / 255) * 0.9, // parallax drift speed
      tx: 0, ty: 0,
    };
  });
  links = [];
  for (const l of g.links) {
    if (!l.from || l.from.length < 2) continue;
    for (let i = 0; i + 1 < l.from.length; i += 1) {
      const a = stars.find((s) => s.id === l.from[i]);
      const b = stars.find((s) => s.id === l.from[i + 1]);
      if (a && b) links.push({ insightId: l.id, from: a, to: b, text: l.text, name: l.name || null });
    }
  }
}

function hsl(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

/** Ambient layer: nebulae, Milky-Way band, parallax dust. */
function drawAmbience() {
  // nebulae
  for (const n of nebulae) {
    const nx = n.x + view.x * 0.18, ny = n.y + view.y * 0.18;
    const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.r);
    g.addColorStop(0, hsl(n.hue, 70, 55, n.a * 0.5));
    g.addColorStop(0.55, hsl(n.hue, 70, 45, n.a * 0.16));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(nx, ny, n.r, 0, Math.PI * 2); ctx.fill();
  }
  // Milky Way band (diagonal, soft)
  const bx = W * 0.5 + view.x * 0.12, by = H * 0.42 + view.y * 0.12;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(-0.42);
  const bg = ctx.createLinearGradient(0, -H * 0.22, 0, H * 0.22);
  bg.addColorStop(0, 'rgba(190,200,255,0)');
  bg.addColorStop(0.5, 'rgba(190,200,255,0.05)');
  bg.addColorStop(1, 'rgba(190,200,255,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(-W * 1.2, -H * 0.22, W * 2.4, H * 0.44);
  ctx.restore();
  // parallax dust
  for (const d of dust) {
    const dx = d.x + view.x * d.layer, dy = d.y + view.y * d.layer;
    const a = d.a * (0.6 + 0.4 * Math.sin(t * 1.6 + d.ph));
    ctx.fillStyle = hsl(d.hue, 40, 85, a);
    ctx.beginPath(); ctx.arc(dx, dy, d.r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawMeteors(dt) {
  nextMeteor -= dt;
  if (nextMeteor <= 0) {
    nextMeteor = 4 + Math.random() * 9;
    const edge = Math.random() * W;
    meteors.push({
      x: edge, y: -40,
      vx: (0.6 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1) * devicePixelRatio,
      vy: (1.4 + Math.random() * 1.1) * devicePixelRatio,
      life: 1, len: (90 + Math.random() * 120) * devicePixelRatio,
    });
  }
  for (let i = meteors.length - 1; i >= 0; i -= 1) {
    const m = meteors[i];
    m.x += m.vx * dt * 60; m.y += m.vy * dt * 60; m.life -= dt * 0.35;
    if (m.life <= 0 || m.y > H + 60) { meteors.splice(i, 1); continue; }
    const nx = m.x + view.x * 0.1, ny = m.y + view.y * 0.1;
    const tailX = nx - m.vx / Math.hypot(m.vx, m.vy) * m.len;
    const tailY = ny - m.vy / Math.hypot(m.vx, m.vy) * m.len;
    const g = ctx.createLinearGradient(nx, ny, tailX, tailY);
    g.addColorStop(0, `rgba(255,245,220,${0.85 * m.life})`);
    g.addColorStop(1, 'rgba(255,245,220,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.6 * devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(tailX, tailY); ctx.stroke();
    ctx.fillStyle = `rgba(255,250,235,${0.9 * m.life})`;
    ctx.beginPath(); ctx.arc(nx, ny, 1.6 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
  }
}

let lastFrame = performance.now();
function draw() {
  const nowMs = performance.now();
  const dt = Math.min(0.1, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  t += dt;

  // self-heal: some webviews start with a 0×0 viewport and never fire resize
  if ((W === 0 || H === 0) && window.innerWidth > 0) resize();

  ctx.clearRect(0, 0, W, H);
  drawAmbience();
  drawMeteors(dt);

  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);
  const inv = 1 / view.zoom;

  // constellation lines
  ctx.lineWidth = 1 * devicePixelRatio * inv;
  for (const l of links) {
    const lit = state.highlighted.has(l.from.id) && state.highlighted.has(l.to.id);
    ctx.strokeStyle = lit ? 'rgba(255,217,160,0.85)' : 'rgba(143,123,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(l.from.x, l.from.y);
    ctx.lineTo(l.to.x, l.to.y);
    ctx.stroke();
    // constellation name at midpoint
    if (l.name) {
      ctx.fillStyle = `rgba(255,217,160,${lit ? 0.95 : 0.4})`;
      ctx.font = `${11 * devicePixelRatio * inv}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const mx = (l.from.x + l.to.x) / 2, my = (l.from.y + l.to.y) / 2;
      ctx.fillText(`✧ ${l.name}`, mx, my - 6 * devicePixelRatio * inv);
    }
  }

  for (const s of stars) {
    // gentle orbital drift: each star circles its home very slowly
    s.tx = s.x + Math.cos(t * 0.05 * s.speed + s.tw) * 8 * devicePixelRatio;
    s.ty = s.y + Math.sin(t * 0.04 * s.speed + s.tw) * 6 * devicePixelRatio;
    const wx = s.tx, wy = s.ty;
    const d = Math.hypot(wx + view.x - mouse.x, wy + view.y - mouse.y) * view.zoom;
    const hover = d < 26 * devicePixelRatio;
    const lit = state.highlighted.has(s.id);
    const flare = flareIds.has(s.id);
    const tw = 0.72 + 0.28 * Math.sin(t * 2.2 * s.speed + s.tw);
    let alpha = s.base * tw;
    let r = s.r;
    if (lit) { alpha = 1; r *= 1.6; }
    if (flare) { r *= 1.9; alpha = 1; }
    if (hover) { alpha = Math.min(1, alpha + 0.35); r *= 1.25; }

    const hue = s.seed ? (38 + s.hue * 0.2) : s.hue;
    const glowR = r * 6;
    const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, glowR);
    g.addColorStop(0, hsl(hue, 90, 82, 0.6 * alpha));
    g.addColorStop(0.25, hsl(hue, 80, 65, 0.2 * alpha));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(wx, wy, glowR, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = hsl(hue, 85, 88, alpha);
    ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();

    if (r > 5 * devicePixelRatio) {
      ctx.strokeStyle = hsl(hue, 80, 80, 0.35 * alpha);
      ctx.beginPath();
      ctx.moveTo(wx - r * 2.6, wy); ctx.lineTo(wx + r * 2.6, wy);
      ctx.moveTo(wx, wy - r * 2.6); ctx.lineTo(wx, wy + r * 2.6);
      ctx.stroke();
    }
  }
  ctx.restore();

  for (const [id] of flareIds) { /* decay handled below */ }
  requestAnimationFrame(draw);
}

canvas.addEventListener('click', (e) => {
  if (dragMoved) return; // was a pan, not a pick
  const wx = (e.clientX * devicePixelRatio - view.x);
  const wy = (e.clientY * devicePixelRatio - view.y);
  // nearest star within pick radius
  let best = null, bestD = Infinity;
  for (const s of stars) {
    const d = Math.hypot(s.tx - wx, s.ty - wy);
    const pickR = Math.max(18, s.r * 3) * Math.max(1, 1 / view.zoom);
    if (d < pickR && d < bestD) { best = s; bestD = d; }
  }
  if (best) {
    toast(best.text);
    state.highlighted.clear();
    state.highlighted.add(best.id);
    for (const l of links) {
      if (l.from === best || l.to === best) { state.highlighted.add(l.from.id); state.highlighted.add(l.to.id); }
    }
    return;
  }
  // constellation pick → naming ceremony
  let bl = null, bd = Infinity;
  for (const l of links) {
    const mx = (l.from.tx + l.to.tx) / 2, my = (l.from.ty + l.to.ty) / 2;
    const d = Math.hypot(mx - wx, my - wy);
    if (d < 40 * devicePixelRatio && d < bd) { bl = l; bd = d; }
  }
  if (bl) {
    const label = bl.name ? `“${bl.name}”` : 'an unnamed constellation';
    const name = prompt(`This constellation links:\n\n· ${bl.from.text}\n· ${bl.to.text}\n\nCurrently ${label}. Name it:`, bl.name || '');
    if (name && name.trim()) {
      nameConstellation(bl.insightId, name.trim());
    }
  }
});

async function nameConstellation(id, name) {
  try {
    await api('/api/constellation/name', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    await refreshAll();
    toast(`✧ Constellation named “${name}” — it will shine in every dream.`);
  } catch (err) { toast(`Could not name: ${err.message}`); }
}

/* ================= API HELPERS ================= */
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status}`);
  }
  return res.json();
}

const SSE = (path, body, onEvent) => {
  const ctrl = new AbortController();
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        if (line) {
          try { onEvent(JSON.parse(line.slice(6))); } catch { /* ignore */ }
        }
      }
    }
  }).catch(() => {});
  return ctrl;
};

/* ================= CHAT ================= */
function bubble(kind, html) {
  const div = document.createElement('div');
  div.className = `msg ${kind}`;
  div.innerHTML = `<div class="avatar">${kind === 'user' ? '☾' : '✶'}</div><div class="bubble">${html}</div>`;
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
  return div.querySelector('.bubble');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderReplyHtml(text, cites) {
  let html = esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[M([0-9a-f]{4,10})\]/g, '<span class="cite" data-id="M$1">M$1</span>')
    .replace(/\n- /g, '\n• ')
    .replace(/\n{2,}/g, '</p><p>');
  html = `<p>${html}</p>`;
  let extra = '';
  if (cites && cites.length) {
    const chips = cites.map((c) => `<button class="cite-chip" data-id="${c.id}">${esc(c.text)}</button>`).join('');
    extra = `<div class="cite-bar"><span style="font-size:11px;color:var(--ink-faint);width:100%">memories used ↓ click to locate</span>${chips}</div>`;
  }
  return html + extra;
}

function flareStar(id) {
  const s = stars.find((st) => st.id.startsWith(id.replace(/^M/, '')));
  if (!s) { toast('That memory has already faded.'); return; }
  state.highlighted.clear();
  state.highlighted.add(s.id);
  for (const l of links) {
    if (l.from === s || l.to === s) { state.highlighted.add(l.from.id); state.highlighted.add(l.to.id); }
  }
  flareIds.add(s.id);
  setTimeout(() => flareIds.delete(s.id), 1400);
  toast('✦ Memory located in the sky');
}

let tickerTimer = null;
function ticker(msg, sticky) {
  els.ticker.textContent = msg || '';
  clearTimeout(tickerTimer);
  if (msg && !sticky) tickerTimer = setTimeout(() => { els.ticker.textContent = ''; }, 4000);
}

async function sendChat() {
  const text = els.input.value.trim();
  if (!text || state.busy) return;
  state.busy = true;
  els.send.disabled = true;
  els.input.value = '';
  els.input.style.height = 'auto';
  bubble('user', esc(text));

  const b = bubble('ai', '<span class="thinking">✶ thinking…</span>');

  SSE('/api/chat', { text }, (ev) => {
    if (ev.type === 'recall') {
      state.highlighted.clear();
      for (const s of ev.stars || []) state.highlighted.add(s.id);
      ticker(`✦ recalling ${ev.stars ? ev.stars.length : 0} memories`, true);
    } else if (ev.type === 'tool') {
      ticker(`⊛ ${ev.name} (${ev.ms}ms)`);
      b.innerHTML += `<div style="font-size:11.5px;color:var(--cyan);margin-top:6px">⊛ ${esc(ev.name)}${ev.args && ev.args.query ? `: “${esc(ev.args.query)}”` : ''}</div>`;
    } else if (ev.type === 'learned') {
      ticker(`✦ learned ${ev.count} new memor${ev.count === 1 ? 'y' : 'ies'}`);
    } else if (ev.type === 'done') {
      b.innerHTML = renderReplyHtml(ev.reply, ev.cites);
      state.busy = false;
      els.send.disabled = false;
      els.input.focus();
      refreshAll();
    } else if (ev.type === 'error') {
      b.innerHTML = `<span style="color:var(--rose)">⚠ ${esc(ev.error)}</span>`;
      state.busy = false;
      els.send.disabled = false;
    }
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

// delegate cite clicks (bubbles are re-rendered)
els.messages.addEventListener('click', (e) => {
  const cite = e.target.closest('.cite');
  if (cite) { flareStar(cite.getAttribute('data-id')); return; }
  const chip = e.target.closest('.cite-chip');
  if (chip && chip.getAttribute('data-id')) flareStar(chip.getAttribute('data-id'));
});

/* ================= DREAM ================= */
els.dream.addEventListener('click', () => {
  if (state.dreaming) return;
  state.dreaming = true;
  els.dream.disabled = true;
  els.dreamOverlay.classList.remove('hidden');
  els.dreamTitle.textContent = 'Dreaming…';
  els.dreamStream.innerHTML = '';
  els.dreamResult.innerHTML = '';
  els.dreamClose.classList.add('hidden');

  SSE('/api/dream', {}, (ev) => {
    const line = document.createElement('div');
    line.className = 'dream-line';
    if (ev.phase === 'replay') {
      line.innerHTML = `<span class="ph">replay</span><span>…${esc(ev.text || '')}</span>`;
      if (ev.star) { state.highlighted.add(ev.star); }
    } else if (ev.phase === 'consolidate') {
      line.innerHTML = `<span class="ph">weave</span><span>${esc(ev.message || '')}</span>`;
    } else if (ev.phase === 'insight') {
      line.className += ' insight';
      line.innerHTML = `<span class="ph">insight</span><span>${esc(ev.text)}</span>`;
      for (const f of ev.from || []) state.highlighted.add(f);
    } else if (ev.phase === 'constellation') {
      line.className += ' insight';
      line.innerHTML = `<span class="ph">name</span><span>✧ the sky remembers this as “${esc(ev.name)}”</span>`;
    } else if (ev.phase === 'skill') {
      line.className += ' skill';
      line.innerHTML = `<span class="ph">skill</span><span>learned “${esc(ev.name)}” — ${esc(ev.description || '')}</span>`;
    } else if (ev.phase === 'decay') {
      line.innerHTML = `<span class="ph">decay</span><span>${esc(ev.message || '')}</span>`;
    } else if (ev.phase === 'done') {
      els.dreamTitle.textContent = 'A dream was had';
      const parts = [];
      if (ev.insights) parts.push(`<b>${ev.insights}</b> insight${ev.insights === 1 ? '' : 's'}`);
      if (ev.skills) parts.push(`<b>${ev.skills}</b> skill${ev.skills === 1 ? '' : 's'}`);
      parts.push(`<b>${ev.decayed || 0}</b> memor${(ev.decayed || 0) === 1 ? 'y' : 'ies'} faded`);
      if (ev.removed) parts.push(`<b>${ev.removed}</b> forgotten`);
      const summary = parts.length > 1 || ev.insights ? `✦ ${parts.join(' · ')}` : '✦ A quiet night — memories replayed and settled.';
      els.dreamResult.innerHTML = `${summary}<br><span style="font-size:12px;color:var(--ink-faint)">${((ev.ms || 0) / 1000).toFixed(1)}s of sleep</span>`;
      els.dreamClose.classList.remove('hidden');
    } else if (ev.phase === 'error') {
      els.dreamTitle.textContent = 'Restless night';
      els.dreamResult.innerHTML = `<span style="color:var(--rose)">${esc(ev.error)}</span>`;
      els.dreamClose.classList.remove('hidden');
    }
    els.dreamStream.appendChild(line);
    els.dreamStream.scrollTop = els.dreamStream.scrollHeight;
  });
});

els.dreamClose.addEventListener('click', () => {
  els.dreamOverlay.classList.add('hidden');
  state.dreaming = false;
  els.dream.disabled = false;
  state.highlighted.clear();
  refreshAll();
});

/* ================= PANEL ================= */
function openPanel() { els.panel.classList.remove('hidden'); renderPanel(); }
function closePanel() { els.panel.classList.add('hidden'); }
els.panelBtn.addEventListener('click', openPanel);
els.closePanel.addEventListener('click', closePanel);

function renderPanel() {
  const mems = state.vaultMemories || [];
  const insights = state.vaultInsights || [];
  const skills = state.vaultSkills || [];

  $('tab-memories').innerHTML = mems.length
    ? mems.map((m) => `
      <div class="mem-item">
        <div class="mem-top">
          <span class="mem-id">${esc(m.id)}</span>
          <span class="mem-meta">${m.uses} use${m.uses === 1 ? '' : 's'}</span>
          <button class="mem-forget" data-id="${esc(m.id)}" title="Forget this memory">forget</button>
        </div>
        <div>${esc(m.text)}</div>
        <div class="mem-tags">${(m.tags || []).map((tg) => `<span class="mem-tag">${esc(tg)}</span>`).join('')}</div>
      </div>`).join('')
    : '<p class="legend-p">No memories yet — talk to Mnemos.</p>';
  $('tab-insights').innerHTML = insights.length
    ? insights.map((i) => `<div class="insight-item"><span class="tag">✦ insight${i.name ? ` · “${esc(i.name)}”` : ''}</span>${esc(i.text)}${i.name ? `<button class="const-rename" data-id="${i.id}" data-name="${esc(i.name)}">rename</button>` : `<button class="const-rename" data-id="${i.id}" data-name="">name it</button>`}</div>`).join('')
    : '<p class="legend-p">No insights yet — let Mnemos dream.</p>';
  $('tab-skills').innerHTML = skills.length
    ? skills.map((s) => `<div class="skill-item"><b>${esc(s.name)}</b><p>${esc(s.description)}</p></div>`).join('')
    : '<p class="legend-p">No skills yet — dreams teach Mnemos routines.</p>';

  document.querySelectorAll('.mem-forget').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api('/api/forget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: btn.getAttribute('data-id') }) });
      toast('Memory released.');
      refreshAll();
      renderPanel();
    });
  });
  document.querySelectorAll('.const-rename').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = prompt('Name this constellation:', btn.getAttribute('data-name') || '');
      if (name && name.trim()) nameConstellation(btn.getAttribute('data-id'), name.trim());
    });
  });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-body').forEach((b) => b.classList.add('hidden'));
    $(`tab-${tab.getAttribute('data-tab')}`).classList.remove('hidden');
    renderPanel();
  });
});

els.exportBtn.addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify({ memories: state.vaultMemories || [], insights: state.vaultInsights || [], skills: state.vaultSkills || [], redZone: state.redZone || [] }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mnemos-vault-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('Vault exported — yours to keep.');
});

/* ================= RED ZONE ================= */
function openRedZone() {
  els.rzOverlay.classList.remove('hidden');
  renderRedZone();
  els.rzInput.focus();
}
function closeRedZone() { els.rzOverlay.classList.add('hidden'); }
els.redzone.addEventListener('click', openRedZone);
els.rzClose.addEventListener('click', closeRedZone);

function renderRedZone() {
  const list = state.redZone || [];
  els.rzList.innerHTML = list.length
    ? list.map((tpc, i) => `<div class="rz-item"><span>${esc(tpc)}</span><button class="rz-del" data-i="${i}" title="Remove">✕</button></div>`).join('')
    : '<p class="legend-p">No red zones. Mnemos will talk about anything you ask.</p>';
  els.rzList.querySelectorAll('.rz-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = (state.redZone || []).filter((_, i) => i !== Number(btn.getAttribute('data-i')));
      await saveRedZone(next);
    });
  });
}

async function saveRedZone(topics) {
  const r = await api('/api/redzone', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topics }),
  });
  state.redZone = r.redZone;
  renderRedZone();
  toast(topics.length ? `🛡 ${topics.length} red zone${topics.length === 1 ? '' : 's'} armed.` : 'Red zone cleared.');
}

els.rzAdd.addEventListener('click', async () => {
  const v = els.rzInput.value.trim();
  if (!v) return;
  els.rzInput.value = '';
  await saveRedZone([...(state.redZone || []), v].slice(0, 20));
});
els.rzInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.rzAdd.click(); });

/* ================= PROVIDER PICKER ================= */
els.provider.addEventListener('click', async () => {
  const st = state.status;
  if (!st) return;
  const chain = st.provider.chain;
  const lines = chain.map((p, i) => `${i + 1}. ${p.label} — ${p.model}${p.nvidia ? '  [NVIDIA open model]' : ''}`).join('\n');
  const pick = prompt(`Language core (active: ${st.provider.active}):\n\n${lines}\n\nEnter a provider id to switch:`, st.provider.active);
  if (!pick) return;
  if (!chain.some((c) => c.id === pick.trim())) { toast('Unknown provider.'); return; }
  await api('/api/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pick.trim() }) });
  await refreshStatus();
  toast(`Switched to ${pick.trim()}.`);
});

/* ================= ONBOARDING ================= */
els.btnOwner.addEventListener('click', async () => {
  const name = els.ownerName.value.trim();
  if (!name) { els.ownerName.focus(); return; }
  await api('/api/owner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  state.owner = name;
  els.onboard.classList.add('hidden');
  bubble('ai', `Nice to meet you, <b>${esc(name)}</b>. I already hold ${state.galaxy.stars.length} memories in this vault — ask me anything, or press <code>☾ Dream</code> to watch me consolidate them. Your sky is above; everything in it is yours.`);
  els.input.focus();
});
els.ownerName.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.btnOwner.click(); });

/* ================= BOOT / REFRESH ================= */
async function refreshStatus() {
  state.status = await api('/api/status');
  const v = state.status.vault;
  els.stats.innerHTML = `<span><b>${v.memories}</b> memories</span><span><b>${v.insights}</b> insights</span><span><b>${v.skills}</b> skills</span><span><b>${v.dreamCount}</b> dreams</span>`;
  const p = state.status.provider;
  const activeChain = p.chain.find((c) => c.id === p.active);
  els.provider.textContent = p.active ? `${p.nvidia ? '◆' : '◇'} ${p.active}` : '◇ demo mode';
  els.provider.title = activeChain ? `${activeChain.label} · ${activeChain.model}` : 'No language core yet — add a free API key in .env';
  // returning user: restore identity and skip onboarding
  if (!state.owner && v.owner) {
    state.owner = v.owner;
    els.onboard.classList.add('hidden');
  }
}

async function refreshAll() {
  const [galaxy, mems, insights, skills, redzone] = await Promise.all([
    api('/api/galaxy'),
    api('/api/memories').then((r) => r.memories),
    api('/api/insights').then((r) => r.insights),
    api('/api/skills').then((r) => r.skills),
    api('/api/redzone').then((r) => r.redZone).catch(() => []),
  ]);
  state.galaxy = galaxy;
  state.vaultMemories = mems;
  state.vaultInsights = insights;
  state.vaultSkills = skills;
  state.redZone = redzone;
  buildStars();
  if (!els.panel.classList.contains('hidden')) renderPanel();
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

/* chips */
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    els.input.value = chip.getAttribute('data-q');
    sendChat();
  });
});

/* composer */
els.send.addEventListener('click', sendChat);
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
els.input.addEventListener('input', () => {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(140, els.input.scrollHeight)}px`;
});

/* keyboard: space = reset view */
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.rzOverlay.classList.contains('hidden')) closeRedZone();
  if (e.code === 'Space' && document.activeElement === document.body) {
    view.x = 0; view.y = 0; view.zoom = 1;
    toast('Sky recentered.');
  }
});

/* boot */
(async function boot() {
  await refreshStatus();
  await refreshAll();
  buildAmbience();
  // autodetect model + lazy-embed older memories on first load
  try { await api('/api/autodetect', { method: 'POST' }); await refreshStatus(); } catch { /* offline */ }
  try { await api('/api/embed/backfill', { method: 'POST' }); } catch { /* no embeddings provider */ }
  if (!state.owner) els.onboard.classList.remove('hidden');
})();
