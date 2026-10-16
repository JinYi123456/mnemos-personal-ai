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
  askOverlay: $('ask-overlay'), askTitle: $('ask-title'), askDetail: $('ask-detail'),
  askInput: $('ask-input'), askOk: $('ask-ok'), askCancel: $('ask-cancel'),
  starPeek: $('star-peek'), chatTools: $('chat-tools'),
  chatCollapse: $('btn-chat-collapse'), chatClear: $('btn-chat-clear'),
  arranger: $('arranger-overlay'), arrangeArm: $('arrange-arm'), arrangeShape: $('arrange-shape'),
  arrangeApply: $('arrange-apply'), arrangeWord: $('arrange-word'), arrangeReset: $('arrange-reset'),
  arrangerClose: $('arranger-close'),
};

/* ---------- state ---------- */
const state = {
  owner: null,
  galaxy: { stars: [], links: [] },
  highlighted: new Set(),
  dreaming: false,
  busy: false,
};

/* birth animation: ids of stars freshly created during THIS session's chats */
const newborn = new Map(); // id → {bornAt, hue}
function markNewborns(newIds) {
  const known = new Set(state.galaxy.stars.map((s) => s.id));
  for (const id of newIds) {
    if (!known.has(id)) newborn.set(id, { bornAt: performance.now(), hue: 92 });
  }
}

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
/** star-drag: null when not dragging a star */
let dragStar = null;
let starMoved = false;
/** arranger armed → dragging grabs stars */
let starArranger = $('arranger-overlay');

/** nearest star to client coords, or null */
function starAt(clientX, clientY) {
  const wx = clientX * devicePixelRatio - view.x;
  const wy = clientY * devicePixelRatio - view.y;
  let best = null, bestD = Infinity;
  for (const s of stars) {
    const d = Math.hypot(s.tx - wx, s.ty - wy);
    const pickR = Math.max(18, s.r * 3) * Math.max(1, 1 / view.zoom);
    if (d < pickR && d < bestD) { best = s; bestD = d; }
  }
  return best;
}

canvas.addEventListener('mousedown', (e) => {
  // arranger armed: a star under the cursor is grabbed instead of the map pan
  const s = starAt(e.clientX, e.clientY);
  if (s && arrangeArmed) {
    dragStar = s; starMoved = false; return;
  }
  dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX * devicePixelRatio;
  mouse.y = e.clientY * devicePixelRatio;
  if (dragStar) {
    // move the star with the cursor (device px), remember it moved
    dragStar.x = mouse.x - view.x;
    dragStar.y = mouse.y - view.y;
    dragStar.homeX = dragStar.x; dragStar.homeY = dragStar.y;
    starMoved = true;
    return;
  }
  if (dragging) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    view.x += dx * devicePixelRatio;
    view.y += dy * devicePixelRatio;
    lastX = e.clientX; lastY = e.clientY;
  }
});
async function endDrag() {
  if (dragStar) {
    const s = dragStar; dragStar = null;
    if (starMoved) {
      try {
        await api('/api/star/pos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: s.id, x: s.x, y: s.y, w: W, h: H }),
        });
      } catch { /* offline — layout stays local for this session */ }
    }
    starMoved = false;
  }
  dragging = false;
}
window.addEventListener('mouseup', endDrag);
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
  // any star not previously rendered but present in `newborn` is BORN NOW
  for (const m of g.stars) {
    if (!old.has(m.id) && newborn.has(m.id)) {
      newborn.get(m.id).bornAt = performance.now(); // arm the pop-in
    } else if (!old.has(m.id) && !newborn.has(m.id)) {
      // star existed before this page session — no animation
    }
  }
  stars = g.stars.map((m, i) => {
    const prev = old.get(m.id);
    // priority: dragged+saved layout > previous session position > hash layout
    const pos = prev ? { x: prev.x, y: prev.y }
      : (m.layout ? { x: m.layout.x * W, y: m.layout.y * H } : hashPos(m.id, i));
    // per-star hue/speed derived from id hash (stable across sessions)
    let h = 0;
    for (let c = 0; c < m.id.length; c += 1) h = (h * 31 + m.id.charCodeAt(c)) >>> 0;
    const isBorn = !prev && newborn.has(m.id);
    return {
      id: m.id, x: pos.x, y: pos.y,
      homeX: pos.x, homeY: pos.y,
      r: m.size * devicePixelRatio * 0.9,
      bornAt: isBorn ? performance.now() : 0,
      tw: Math.random() * Math.PI * 2,
      base: 0.45 + (m.seed ? 0.15 : 0),
      text: m.text, tags: m.tags, seed: m.seed,
      hue: isBorn ? 92 /* spring green — a just-learned memory */ : (prev ? prev.hue : starHue(h / 4294967296)),
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
      wishable: true, // click it before it burns out
    });
  }
  for (let i = meteors.length - 1; i >= 0; i -= 1) {
    const m = meteors[i];
    m.x += m.vx * dt * 60; m.y += m.vy * dt * 60; m.life -= dt * 0.35;
    if (m.life <= 0 || m.y > H + 60) { meteors.splice(i, 1); continue; }
    m.sx = m.x + view.x * 0.1; m.sy = m.y + view.y * 0.1;
    const nx = m.sx, ny = m.sy;
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

/** make a wish: clicking a live meteor turns it into a new memory */
async function wishOnMeteor(m) {
  m.life = 0;
  const phrase = 'Wished on a shooting star: ';
  try {
    const r = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${phrase}remember that I saw this comet and it felt lucky` }) });
    const reader = r.body && r.body.getReader ? r.body.getReader() : null;
    if (reader) { try { await reader.cancel(); } catch { /* stream is best-effort */ } }
  } catch { /* offline — the wish still felt nice */ }
  toast('✦ Wish made on a shooting star — Mnemos keeps it as a memory.');
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
    // tx/ty are the per-frame drifted positions — lines follow stars as they fly or are dragged
    ctx.beginPath();
    ctx.moveTo(l.from.tx, l.from.ty);
    ctx.lineTo(l.to.tx, l.to.ty);
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
    // ease the anchor home toward its target (drag + shape Apply both set homeX/homeY)
    s.x += (s.homeX - s.x) * 0.12;
    s.y += (s.homeY - s.y) * 0.12;
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

    // birth animation: a new memory pops in green and settles to its palette hue
    let birthGlow = 0;
    if (s.bornAt) {
      const age = (performance.now() - s.bornAt) / 1000;
      if (age < 4) {
        const k = age / 4;
        birthGlow = Math.sin(k * Math.PI); // 0→1→0 over 4s
        r *= 1 + 0.9 * birthGlow;
        alpha = Math.min(1, alpha + birthGlow * 0.7);
      } else {
        s.bornAt = 0;
        newborn.delete(s.id);
      }
    }

    const hue = birthGlow > 0.05 ? (92 + (s.hue - 92) * (1 - birthGlow)) : s.hue;
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

canvas.addEventListener('click', async (e) => {
  if (dragMoved) return; // was a pan, not a pick
  const wx = (e.clientX * devicePixelRatio - view.x);
  const wy = (e.clientY * devicePixelRatio - view.y);
  // a live meteor can be clicked for a wish — rarest pick in the sky
  let hitMeteor = null, hitMd = Infinity;
  for (const m of meteors) {
    if (!m.wishable) continue;
    const d = Math.hypot((m.sx || m.x) - e.clientX * devicePixelRatio, (m.sy || m.y) - e.clientY * devicePixelRatio);
    if (d < 46 * devicePixelRatio && d < hitMd) { hitMeteor = m; hitMd = d; }
  }
  if (hitMeteor) { wishOnMeteor(hitMeteor); return; }
  // nearest star within pick radius
  let best = null, bestD = Infinity;
  for (const s of stars) {
    const d = Math.hypot(s.tx - wx, s.ty - wy);
    const pickR = Math.max(18, s.r * 3) * Math.max(1, 1 / view.zoom);
    if (d < pickR && d < bestD) { best = s; bestD = d; }
  }
  if (best) {
    // toggle: clicking the same star again dismisses the peek card
    if (!els.starPeek.classList.contains('hidden') && els.starPeek.dataset.id === best.id) {
      hideStarPeek();
    } else {
      showStarPeek(best, e);
    }
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
    const name = await ask('Name this constellation', `This constellation links:\n· ${bl.from.text}\n· ${bl.to.text}\n\nCurrently ${label}.`, bl.name || '');
    if (name) {
      nameConstellation(bl.insightId, name);
    }
  }
});

/* ---- star peek: memory card anchored next to the star, out of the chat's way ---- */
function showStarPeek(s, clickEvent) {
  const card = els.starPeek;
  card.dataset.id = s.id;
  card.innerHTML = `${esc(s.text)}<div class="peek-meta">${s.seed ? 'seed · ' : ''}M${s.id.slice(0, 8)}${s.tags && s.tags.length ? ' · ' + s.tags.slice(0, 4).join(', ') : ''}</div>`;
  card.classList.remove('hidden');
  positionStarPeek(s, clickEvent);
}
function positionStarPeek(s, clickEvent) {
  const card = els.starPeek;
  if (card.classList.contains('hidden')) return;
  // device-px star position → css px
  const sx = (s.tx + view.x) / devicePixelRatio;
  const sy = (s.ty + view.y) / devicePixelRatio;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let x = sx + 18, y = sy - ch / 2;
  if (x + cw > window.innerWidth - 12) x = sx - cw - 18;
  x = Math.max(12, x);
  y = Math.max(12, Math.min(window.innerHeight - ch - 12, y));
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(y)}px`;
}
function hideStarPeek() {
  els.starPeek.classList.add('hidden');
  els.starPeek.dataset.id = '';
}
document.addEventListener('mousedown', (e) => {
  if (!els.starPeek.classList.contains('hidden') && !els.starPeek.contains(e.target)) {
    hideStarPeek();
  }
});

/* ================= STAR ARRANGER — design your sky ================= */
let arrangeArmed = false;
els.arrangeArm.addEventListener('click', () => {
  arrangeArmed = !arrangeArmed;
  els.arrangeArm.textContent = arrangeArmed ? '✋ Drag stars: ON' : '✋ Drag stars: off';
  els.arrangeArm.style.borderColor = arrangeArmed ? 'rgba(255,217,160,0.6)' : '';
  toast(arrangeArmed ? 'Grab any star and drag it.' : 'Dragging off — the map pans again.');
});
els.arrangeShape.addEventListener('change', () => {
  els.arrangeWord.classList.toggle('hidden', els.arrangeShape.value !== 'letter');
});
els.arrangerClose.addEventListener('click', () => els.arranger.classList.add('hidden'));
els.arrangeReset.addEventListener('click', async () => {
  try { await api('/api/layout/reset', { method: 'POST' }); } catch { /* offline */ }
  await refreshAll();
  toast('Sky returned to its natural order.');
});

/* 12 zodiac constellations — hand-plotted main-star skeletons (normalized 0..1, [x1,y1,x2,y2] segments) */
const ZODIAC = {
  aries: [[0.25, 0.55, 0.45, 0.42], [0.45, 0.42, 0.78, 0.38]],
  taurus: [[0.28, 0.35, 0.42, 0.48], [0.42, 0.48, 0.72, 0.48], [0.72, 0.48, 0.82, 0.6], [0.82, 0.6, 0.7, 0.66]],
  gemini: [[0.3, 0.3, 0.34, 0.75], [0.62, 0.3, 0.6, 0.75], [0.34, 0.75, 0.6, 0.75], [0.3, 0.3, 0.32, 0.5], [0.62, 0.3, 0.61, 0.5]],
  cancer: [[0.32, 0.35, 0.5, 0.5], [0.5, 0.5, 0.68, 0.62]],
  leo: [[0.22, 0.45, 0.35, 0.32], [0.35, 0.32, 0.5, 0.38], [0.5, 0.38, 0.52, 0.55], [0.52, 0.55, 0.78, 0.6], [0.78, 0.6, 0.72, 0.38], [0.72, 0.38, 0.52, 0.55]],
  virgo: [[0.2, 0.6, 0.34, 0.48], [0.34, 0.48, 0.32, 0.3], [0.32, 0.3, 0.48, 0.28], [0.48, 0.28, 0.62, 0.42], [0.62, 0.42, 0.85, 0.4]],
  libra: [[0.24, 0.35, 0.55, 0.3], [0.55, 0.3, 0.5, 0.68], [0.5, 0.68, 0.78, 0.72]],
  scorpio: [[0.25, 0.32, 0.4, 0.4], [0.4, 0.4, 0.52, 0.35], [0.52, 0.35, 0.6, 0.5], [0.6, 0.5, 0.72, 0.72], [0.72, 0.72, 0.62, 0.8]],
  sagittarius: [[0.28, 0.6, 0.42, 0.42], [0.42, 0.42, 0.56, 0.56], [0.56, 0.56, 0.42, 0.68], [0.42, 0.68, 0.28, 0.6], [0.56, 0.56, 0.78, 0.45]],
  capricorn: [[0.24, 0.35, 0.45, 0.3], [0.45, 0.3, 0.55, 0.6], [0.55, 0.6, 0.78, 0.7]],
  aquarius: [[0.22, 0.4, 0.4, 0.32], [0.4, 0.32, 0.58, 0.45], [0.58, 0.45, 0.8, 0.5], [0.8, 0.5, 0.78, 0.66]],
  pisces: [[0.24, 0.7, 0.42, 0.6], [0.42, 0.6, 0.5, 0.4], [0.5, 0.4, 0.66, 0.3], [0.66, 0.3, 0.82, 0.32]],
};

/** Generate n normalized (0..1) points for a shape. */
function shapePoints(kind, n, word) {
  const pts = [];
  let seedNum = 9301 ^ (n * 7919);
  const rnd = () => { seedNum = (seedNum * 9301 + 49297) % 233280; return seedNum / 233280; };
  const jitter = () => (rnd() - 0.5) * 0.035;
  if (kind === 'spiral') {
    const arms = 2, turns = 1.6;
    for (let i = 0; i < n; i++) {
      const tt = i / n, r = 0.08 + tt * 0.38;
      const a = tt * turns * Math.PI * 2 + (i % 2 ? Math.PI : 0);
      pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.45 + Math.sin(a) * r * 0.62 });
    }
  } else if (kind === 'heart') {
    for (let i = 0; i < n; i++) {
      const t2 = (i / n) * Math.PI * 2;
      pts.push({ x: 0.5 + 0.42 * Math.pow(Math.sin(t2), 3), y: 0.42 - (0.36 * Math.cos(t2) - 0.14 * Math.cos(2 * t2) - 0.05 * Math.cos(3 * t2) - 0.02 * Math.cos(4 * t2)) });
    }
  } else if (kind === 'ring') {
    for (let i = 0; i < n; i++) {
      const t3 = (i / n) * Math.PI * 2;
      pts.push({ x: 0.5 + Math.cos(t3) * 0.36, y: 0.45 + Math.sin(t3) * 0.36 });
    }
  } else if (kind === 'bigdipper') {
    const dip = [[0.22, 0.38], [0.32, 0.42], [0.42, 0.44], [0.50, 0.46], [0.60, 0.52], [0.68, 0.60], [0.74, 0.66]];
    for (let i = 0; i < n; i++) {
      const p = dip[i % 7];
      pts.push({ x: p[0] + jitter(), y: p[1] + jitter() });
    }
  } else if (kind === 'cassiopeia') {
    const cas = [[0.20, 0.55], [0.32, 0.44], [0.46, 0.52], [0.60, 0.40], [0.76, 0.50]];
    for (let i = 0; i < n; i++) {
      const p = cas[i % 5];
      pts.push({ x: p[0] + jitter(), y: p[1] + jitter() });
    }
  } else if (ZODIAC[kind]) {
    // zodiac constellations: star-line skeleton sampled evenly along each segment
    const segs = ZODIAC[kind];
    const total = segs.reduce((acc, s) => acc + Math.hypot(s[2] - s[0], s[3] - s[1]), 0);
    let placed = 0;
    for (const s of segs) {
      const seg = Math.hypot(s[2] - s[0], s[3] - s[1]);
      const cnt = Math.max(1, Math.round((seg / total) * n));
      for (let i = 0; i < cnt && placed < n; i++, placed++) {
        const f = (i + 0.5) / cnt;
        pts.push({ x: s[0] + (s[2] - s[0]) * f + jitter(), y: s[1] + (s[3] - s[1]) * f + jitter() });
      }
    }
    while (placed < n) {
      const anchor = segs[placed % segs.length];
      pts.push({ x: anchor[0] + jitter() * 2, y: anchor[1] + jitter() * 2 });
      placed++;
    }
  } else if (kind === 'letter' && word) {
    const s = 180;
    const oc = document.createElement('canvas'); oc.width = s; oc.height = s;
    const octx = oc.getContext('2d');
    octx.fillStyle = '#fff';
    octx.font = 'bold 110px monospace';
    octx.textAlign = 'center'; octx.textBaseline = 'middle';
    octx.fillText(word.slice(0, 9), s / 2, s / 2);
    const data = octx.getImageData(0, 0, s, s).data;
    const lit = [];
    for (let y = 0; y < s; y += 2) {
      for (let x = 0; x < s; x += 2) {
        if (data[(y * s + x) * 4 + 3] > 120) lit.push([x / s, y / s]);
      }
    }
    if (lit.length) {
      for (let i = 0; i < n; i++) {
        const p = lit[Math.floor(rnd() * lit.length) % lit.length];
        pts.push({ x: 0.5 + (p[0] - 0.5) * 0.85 + jitter(), y: 0.45 + (p[1] - 0.5) * 0.85 + jitter() });
      }
    }
  }
  return pts;
}

/** Assign every star a target home on the shape (largest stars claim the first points). */
function flyToShape(kind, word) {
  const pts = shapePoints(kind, stars.length, word);
  if (!pts.length) return;
  const order = stars.slice().sort((a, b) => b.r - a.r);
  order.forEach((s, i) => {
    const p = pts[i % pts.length];
    s.homeX = p.x * W;
    s.homeY = p.y * H;
  });
}

els.arrangeApply.addEventListener('click', async () => {
  const kind = els.arrangeShape.value;
  const word = (els.arrangeWord.value || '').toLowerCase().replace(/[^a-z]/g, '');
  flyToShape(kind, word);
  for (const s of stars) {
    try {
      await api('/api/star/pos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, x: s.homeX, y: s.homeY, w: W, h: H }),
      });
    } catch { /* offline — keep local */ }
  }
  toast('Sky reshaped — saved, everywhere you open it.');
});

/* ---- transcript controls: collapse hides it (sky fully visible), clear empties it ---- */
els.chatCollapse.addEventListener('click', () => {
  const hidden = els.messages.style.display === 'none';
  els.messages.style.display = hidden ? '' : 'none';
  els.chatCollapse.textContent = hidden ? '⌃ Hide chat' : '⌄ Show chat';
  if (hidden) els.messages.scrollTop = els.messages.scrollHeight;
});
els.chatClear.addEventListener('click', () => {
  els.messages.innerHTML = '';
  els.chatTools.classList.add('hidden');
  els.messages.style.display = '';
  els.chatCollapse.textContent = '⌃ Hide chat';
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

function sendChat() {
  const text = els.input.value.trim();
  if (!text || state.busy) return;
  state.busy = true;
  els.send.disabled = true;
  els.input.value = '';
  els.input.style.height = 'auto';
  bubble('user', esc(text));
  els.chatTools.classList.remove('hidden'); // the transcript is clearable from now on

  const b = bubble('ai', '<span class="thinking">✶ thinking…</span>');
  if (window.Ablate) Ablate.setQuery(text);
  if (window.Sound) Sound.think();

  const payload = { text, image: window.Photo && Photo.dataUrl ? Photo.dataUrl : undefined };
  if (payload.image && window.Photo) {
    b.innerHTML += `<div class="seen-card">📎 photo attached — an NVIDIA vision model will read it into memory</div>`;
  }
  SSE('/api/chat', payload, (ev) => {
    if (ev.type === 'recall') {
      state.highlighted.clear();
      for (const s of ev.stars || []) state.highlighted.add(s.id);
      if (window.tracePulse) tracePulse((ev.stars || []).map((s) => s.id));
      ticker(`✦ recalling ${ev.stars ? ev.stars.length : 0} memories`, true);
    } else if (ev.type === 'seeing') {
      ticker(`◉ ${String(ev.model || 'vision model').split('/').pop()} reading your photo…`, true);
    } else if (ev.type === 'seen') {
      if (ev.error) { b.innerHTML += `<div class="seen-card">⚠ ${esc(ev.error)}</div>`; }
      else {
        b.innerHTML += `<div class="seen-card"><b>${esc(String(ev.model).split('/').pop())}</b> read your photo in ${Math.round(ev.ms)}ms ($${(ev.cost || 0).toFixed(5)}):<br>${esc(ev.text).slice(0, 600)}</div>`;
        if (window.Sound) Sound.born();
      }
    } else if (ev.type === 'meter') {
      if (window.Hood) Hood.record(ev);
      if (ev.cost) ticker(`⚙ ${ev.tier} · ${ev.model.split('/').pop()} · ${Math.round(ev.ms)}ms · $${ev.cost.toFixed(5)}`);
    } else if (ev.type === 'note') {
      ticker(`· ${ev.text}`);
    } else if (ev.type === 'tool') {
      if (window.Sound) Sound.tool();
      ticker(`⊛ ${ev.name} (${ev.ms}ms)`);
      b.innerHTML += `<div style="font-size:11.5px;color:var(--cyan);margin-top:6px">⊛ ${esc(ev.name)}${ev.args && ev.args.query ? `: “${esc(ev.args.query)}”` : ''}</div>`;
      // agent-driven sky reshape: Mnemos can rearrange the stars at its owner's request
      if ((ev.name === 'sky.shape' || ev.name === 'sky_shape') && ev.args && ev.args.shape) {
        const raw = String(ev.args.shape).toLowerCase().trim();
        flyToShape(raw.startsWith('word:') ? 'letter' : raw, raw.startsWith('word:') ? raw.slice(5) : '');
        // persist the arrangement so it survives reloads
        setTimeout(() => {
          for (const s of stars) {
            api('/api/star/pos', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: s.id, x: s.homeX, y: s.homeY, w: W, h: H }),
            }).catch(() => {});
          }
        }, 0);
        toast(`✧ Mnemos reshaped your sky: ${raw}`);
      }
    } else if (ev.type === 'learned') {
      if (window.Sound) Sound.born();
      ticker(`✦ learned ${ev.count} new memor${ev.count === 1 ? 'y' : 'ies'}`);
      // stamp ids that exist now but weren't in the sky before this turn:
      // the next buildStars() (on 'done') will paint them NEWBORN GREEN.
      api('/api/galaxy').then((r) => {
        const known = new Set(state.galaxy.stars.map((s) => s.id));
        for (const s of r.stars) {
          if (!known.has(s.id) && !newborn.has(s.id)) newborn.set(s.id, { bornAt: 0, hue: 92 });
        }
      }).catch(() => { /* cosmetic only */ });
    } else if (ev.type === 'done') {
      b.innerHTML = renderReplyHtml(ev.reply, ev.cites);
      state.busy = false;
      els.send.disabled = false;
      els.input.focus();
      if (window.Photo) Photo.clear();
      refreshAll();
      if (window.Hood) Hood.refresh();
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
els.dream.addEventListener('click', async () => {
  if (state.dreaming) return;
  // An intention turns "dreaming" from a demo gimmick into a task: the replay
  // leans toward the memories that bear on it and the brief is written for it.
  const intention = await ask(
    'Dream about something specific?',
    'Optional — tonight’s replay leans toward memories that bear on this, and you wake up with a brief written for it.',
    '',
  );
  if (intention === null) return;
  state.dreaming = true;
  els.dream.disabled = true;
  els.dreamOverlay.classList.remove('hidden');
  els.dreamTitle.textContent = intention ? `Dreaming about: ${intention}` : 'Dreaming…';
  els.dreamStream.innerHTML = '';
  els.dreamResult.innerHTML = '';
  els.dreamClose.classList.add('hidden');

  SSE('/api/dream', { intention }, (ev) => {
    const line = document.createElement('div');
    line.className = 'dream-line';
    if (ev.phase === 'replay') {
      line.innerHTML = `<span class="ph">replay</span><span>…${esc(ev.text || '')}</span>`;
      if (ev.star) { state.highlighted.add(ev.star); }
    } else if (ev.phase === 'consolidate') {
      line.innerHTML = `<span class="ph">weave</span><span>${esc(ev.message || '')}</span>`;
    } else if (ev.phase === 'insight') {
      if (window.Sound) Sound.insight();
      line.className += ' insight';
      line.innerHTML = `<span class="ph">insight</span><span>${esc(ev.text)}</span>`;
      for (const f of ev.from || []) state.highlighted.add(f);
    } else if (ev.phase === 'constellation') {
      line.className += ' insight';
      line.innerHTML = `<span class="ph">name</span><span>✧ the sky remembers this as “${esc(ev.name)}”</span>`;
    } else if (ev.phase === 'skill') {
      line.className += ' skill';
      line.innerHTML = `<span class="ph">skill</span><span>learned “${esc(ev.name)}” — ${esc(ev.description || '')}</span>`;
    } else if (ev.phase === 'brief') {
      if (ev.text) {
        line.className += ' insight';
        line.innerHTML = `<span class="ph">brief</span><span>☀︎ ${esc(ev.text)}${(ev.next || []).length ? `<br>→ ${ev.next.map(esc).join('  ·  ')}` : ''}</span>`;
        if (window.Sound) Sound.wake();
      } else {
        line.innerHTML = `<span class="ph">brief</span><span>${esc(ev.message || '')}</span>`;
      }
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
  const timeline = state.timeline || [];

  $('tab-timeline').innerHTML = timeline.length
    ? timeline.map((m) => {
      const d = new Date(m.created);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const icon = m.source === 'web' ? '⌕' : m.source === 'dream' ? '☾' : m.source === 'user' ? '✦' : '✶';
      const src = m.source === 'web' ? 'web-dream' : m.source;
      return `
      <div class="tl-item">
        <div class="tl-rail"><span class="tl-dot"></span></div>
        <div class="tl-card">
          <div class="tl-top"><span class="tl-date">${dateStr}</span><span class="tl-time">${timeStr}</span><span class="tl-src">${icon} ${src}</span></div>
          <div class="tl-text">${esc(m.text)}</div>
        </div>
      </div>`;
    }).join('')
    : '<p class="legend-p">No memories yet — talk to Mnemos.</p>';
  
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
      const name = await ask('Name this constellation', 'Insight constellations deserve names you choose.', btn.getAttribute('data-name') || '');
      if (name) nameConstellation(btn.getAttribute('data-id'), name);
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
document.getElementById('btn-arranger').addEventListener('click', () => {
  els.arranger.classList.remove('hidden');
});
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
/** Promise-based in-app prompt (replaces window.prompt — native dialogs break the night-sky look). */
function ask(title, detail, initial) {
  return new Promise((resolve) => {
    els.askTitle.textContent = title;
    els.askDetail.textContent = detail || '';
    els.askInput.value = initial || '';
    els.askOverlay.classList.remove('hidden');
    els.askInput.focus();
    els.askInput.select();
    const done = (val) => {
      els.askOverlay.classList.add('hidden');
      els.askOk.removeEventListener('click', ok);
      els.askCancel.removeEventListener('click', cancel);
      els.askInput.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const ok = () => done(els.askInput.value.trim());
    const cancel = () => done(null);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); ok(); }
      if (e.key === 'Escape') cancel();
    };
    els.askOk.addEventListener('click', ok);
    els.askCancel.addEventListener('click', cancel);
    els.askInput.addEventListener('keydown', onKey);
  });
}

els.provider.addEventListener('click', async () => {
  const st = state.status;
  if (!st) return;
  const chain = st.provider.chain;
  const detail = `Active core: ${st.provider.active}\n\nAvailable:\n${chain.map((p, i) => `${i + 1}. ${p.id} — ${p.model}${p.nvidia ? '  [NVIDIA open model]' : ''}`).join('\n')}`;
  const pick = await ask('Language core', detail, st.provider.active);
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
  const badge = $('provider-badge');
  if (badge) badge.classList.toggle('hidden', !p.nvidia);
  // returning user: restore identity and skip onboarding
  if (!state.owner && v.owner) {
    state.owner = v.owner;
    els.onboard.classList.add('hidden');
  }
}

async function refreshAll() {
  const [galaxy, mems, insights, skills, redzone, timeline] = await Promise.all([
    api('/api/galaxy'),
    api('/api/memories').then((r) => r.memories),
    api('/api/insights').then((r) => r.insights),
    api('/api/skills').then((r) => r.skills),
    api('/api/redzone').then((r) => r.redZone).catch(() => []),
    api('/api/timeline').then((r) => r.memories).catch(() => []),
  ]);
  state.galaxy = galaxy;
  state.vaultMemories = mems;
  state.vaultInsights = insights;
  state.vaultSkills = skills;
  state.redZone = redzone;
  state.timeline = timeline;
  buildStars();
  if (!els.panel.classList.contains('hidden')) renderPanel();
}

function toast(msg) {
  els.toast.textContent = msg;
  // anchor the toast just above the composer so it never covers the input
  const composer = document.getElementById('composer');
  if (composer) {
    const r = composer.getBoundingClientRect();
    els.toast.style.bottom = `${Math.round(window.innerHeight - r.top + 12)}px`;
  } else {
    els.toast.style.bottom = '24px';
  }
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
resize();
draw(); // start the render loop immediately — the sky should never wait on the network
(async function boot() {
  await refreshStatus();
  await refreshAll();
  buildAmbience();
  // autodetect model + lazy-embed older memories on first load
  try { await api('/api/autodetect', { method: 'POST' }); await refreshStatus(); } catch { /* offline */ }
  try { await api('/api/embed/backfill', { method: 'POST' }); } catch { /* no embeddings provider */ }
  if (!state.owner) els.onboard.classList.remove('hidden');
})();
