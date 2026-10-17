#!/usr/bin/env node
/**
 * Video frame recorder — drives the real running app over the DevTools protocol
 * and records *actual* motion with Page.startScreencast (for the shots that must
 * prove the product is really running) plus crisp PNG stills (for panels that are
 * better read held still). Nothing here is a mock-up: every frame is a screenshot
 * of Mnemos doing the thing.
 *
 *   node tools/capture-video.mjs                # every shot
 *   node tools/capture-video.mjs sky recall      # a subset, in this order
 *
 * Needs the app up in owner mode on a clean, seeded vault:
 *   MNEMOS_SINGLE_VAULT=1 PORT=8792 node src/server.js
 *
 * Zero dependencies: Node's built-in fetch + WebSocket speak CDP directly.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CAP_APP || 'http://127.0.0.1:8792';
const OUT = process.env.CAP_OUT || 'assets/video';
const W = Number(process.env.CAP_W || 1920);
const H = Number(process.env.CAP_H || 1080);
const PORT = 9334;
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DREAM_INTENT = 'I have a 10K race in six weeks and a portfolio review Friday';
const PHOTO = path.join(ROOT, 'assets', 'vision-test.png');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('·', ...a);

const client = {
  /** @type {WebSocket|null} */ ws: null,
  n: 0,
  /** @type {Map<number,(v:any)=>void>} */ waiting: new Map(),
  /** @type {Map<string,(p:any)=>void>} */ events: new Map(),
  async connect(url) {
    this.ws = new WebSocket(url);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.waiting.has(msg.id)) { this.waiting.get(msg.id)(msg); this.waiting.delete(msg.id); }
      else if (msg.method && this.events.has(msg.method)) { this.events.get(msg.method)(msg.params || {}); }
    });
  },
  send(method, params = {}) {
    const id = ++this.n;
    return new Promise((res) => { this.waiting.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  },
  on(name, fn) { this.events.set(name, fn); },
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true,
    });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 240));
    return r.result?.result?.value;
  },
  async until(expr, timeoutMs = 60000) {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await this.eval(expr); } catch { /* busy */ }
      if (v) return v;
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout: ' + expr.slice(0, 70));
      await sleep(400);
    }
  },
  /** crisp still */
  async still(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, OUT, file), Buffer.from(r.result.data, 'base64'));
    return file;
  },
  /**
   * Record real motion. Screencast starts, `trigger` fires the action, we wait
   * for `settle` to become truthy (plus a tail), then stop. Frames land in a dir.
   * @param {string} name @param {()=>Promise<void>} trigger @param {string} settle @param {number} tailMs
   */
  async clip(name, trigger, settle, tailMs = 1200, maxMs = 40000) {
    const dir = path.join(ROOT, OUT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    let i = 0;
    this.on('Page.screencastFrame', (p) => {
      fs.writeFileSync(path.join(dir, String(i++).padStart(4, '0') + '.jpg'), Buffer.from(p.data, 'base64'));
      this.send('Page.screencastFrameAck', { sessionId: p.sessionId });
    });
    await this.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1, maxWidth: W, maxHeight: H });
    await sleep(250);
    const t0 = Date.now();
    if (trigger) await trigger();
    if (settle) { try { await this.until(settle, maxMs); } catch { /* tail still records the last state */ } }
    await sleep(tailMs);
    await this.send('Page.stopScreencast');
    await sleep(150);
    log('clip', name, '->', i, 'frames');
    return { name, frames: i };
  },
  async setFiles(selector, files) {
    const doc = await this.send('DOM.getDocument');
    const q = await this.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector });
    if (!q.result?.nodeId) throw new Error('no node for ' + selector);
    await this.send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files });
  },
};

async function main() {
  const want = process.argv.slice(2).filter(Boolean);
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-vid-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    // unthrottle rAF so the animated canvas actually repaints fast enough to record smoothly
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--disable-features=CalculateNativeWinOcclusion',
    `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let list = null;
    for (let i = 0; i < 80 && !list; i += 1) {
      await sleep(400);
      try {
        const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        list = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      } catch { /* not up */ }
    }
    if (!list) throw new Error('chrome devtools endpoint never came up');
    await client.connect(list.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    // the breathing sky is the whole point of the opening — never let reduced-motion freeze it
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

    /** @param {string} url */
    const go = async (url) => {
      const loaded = new Promise((res) => client.on('Page.loadEventFired', res));
      await client.send('Page.navigate', { url });
      await Promise.race([loaded, sleep(9000)]);
      await sleep(1500);
    };
    const ready = async () => {
      await client.until(`return typeof state !== 'undefined' && state.galaxy && state.galaxy.stars.length > 0`, 25000);
      // kill the onboarding card with an inline style (survives the app's class toggles)
      await client.eval(`
        state.owner = state.owner || 'Luna';
        if (typeof els !== 'undefined' && els.onboard) els.onboard.style.display = 'none';
        const o = document.getElementById('onboard'); if (o) o.style.display = 'none';
        return true;
      `);
      await client.until(`return !(document.getElementById('onboard') && document.getElementById('onboard').offsetHeight > 0)`, 8000).catch(() => {});
    };

    const run = {
      // ---- opening: the sky breathing on its own ---------------------------
      async sky() {
        await go(`${APP}/?hidechat=1`); await ready();
        await client.eval(`document.getElementById('composer').style.display='none'; return true;`);
        await sleep(1500);
        await client.clip('s01-sky', null, null, 9000, 9000); // ~9s of pure ambient motion
      },
      // ---- watch it think: recall lights stars, answer arrives with chips ---
      async recall() {
        await go(`${APP}/`); await ready();
        await client.clip('s02-recall',
          async () => { await client.eval(`state.busy=false; els.input.value='What do you remember about me? Tell me what to plan next.'; sendChat(); return true;`); },
          `return state.busy===false && !!document.querySelector('.cite-chip')`, 2200, 45000);
        await client.still('s02-recall-still.png');
      },
      // ---- telemetry drawer: every call metered live -----------------------
      async telemetry() {
        await go(`${APP}/?demo=1`); await ready();
        await client.until(`return state.busy===false && !!document.querySelector('.cite-chip')`, 45000).catch(() => {});
        await client.eval(`if (document.getElementById('hood').classList.contains('hidden')) Hood.toggle(); return true;`);
        await sleep(900);
        await client.still('s03-telemetry.png');
      },
      // ---- the agent reaches for a web tool (Tavily) -----------------------
      async tavily() {
        await go(`${APP}/`); await ready();
        await client.clip('s04-tavily',
          async () => { await client.eval(`state.busy=false; els.input.value='Search the web for the best week to see cherry blossoms in Kyoto.'; sendChat(); return true;`); },
          `return state.busy===false && !!document.querySelector('.cite-chip, .msg')`, 2000, 45000);
        await client.still('s04-tavily-still.png');
      },
      // ---- THE money shot: ablate one memory, watch the answer change ------
      async ablation() {
        await go(`${APP}/`); await ready();
        await client.clip('s05-ablation',
          async () => {
            await client.eval(`
              const s = state.galaxy.stars.find(x => /Kyoto|cherry|paper notebook|telescope|half marathon/i.test(x.text)) || state.galaxy.stars[0];
              window.__ab = s; Ablate.run(s.id, s.text); return s.id;
            `);
          },
          `return !!document.querySelector('.ab-badge')`, 2600, 60000);
        await client.still('s05-ablation-still.png');
      },
      // ---- it dreams on purpose: replay -> insight -> constellation -> brief
      async dream() {
        await go(`${APP}/`); await ready();
        await client.eval(`els.dream.click(); return true;`);
        await client.until(`return !document.getElementById('ask-overlay').classList.contains('hidden')`, 8000);
        await client.eval(`
          els.askInput.value = ${JSON.stringify(DREAM_INTENT)};
          els.askOk.click(); return true;
        `);
        await client.clip('s06-dream', null,
          `return !!document.querySelector('#dream-stream') && /A dream was had/.test(document.getElementById('dream-title').textContent)`, 2600, 90000);
        await client.still('s06-dream-still.png');
      },
      // ---- wake up to the brief it left at the door ------------------------
      async brief() {
        await go(`${APP}/`); await ready();
        await client.until(`return !!document.querySelector('.brief-card')`, 12000).catch(() => {});
        await sleep(600);
        await client.still('s07-brief.png');
      },
      // ---- a whiteboard read into new stars by the vision model ------------
      async photo() {
        await go(`${APP}/`); await ready();
        await client.until(`return !!document.getElementById('attach-file')`, 15000);
        await client.setFiles('#attach-file', [PHOTO]);
        await client.until(`return !document.getElementById('attach-preview').classList.contains('hidden')`, 15000);
        await client.clip('s08-photo',
          async () => { await client.eval(`state.busy=false; els.input.value='File this whiteboard photo into my memory.'; sendChat(); return true;`); },
          `return !!document.querySelector('.seen-card')`, 2600, 60000);
        await client.still('s08-photo-still.png');
      },
      // ---- the agent reshapes the sky into a constellation (Leo) -----------
      async shapes() {
        await go(`${APP}/`); await ready();
        await client.clip('s09-shapes',
          async () => { await client.eval(`state.busy=false; els.input.value='Arrange my sky like Leo.'; sendChat(); return true;`); },
          `return state.busy===false`, 2400, 45000);
        await client.still('s09-shapes-still.png');
      },
      // ---- receipts: the raw vault JSON behind the pretty sky --------------
      async json() {
        await go(`${APP}/api/galaxy`); await sleep(1200);
        await client.still('s10-json.png');
      },
    };

    const order = want.length ? want : Object.keys(run);
    for (const name of order) {
      if (!run[name]) { console.error('unknown shot:', name); continue; }
      console.log('\n=== shot', name, '===');
      await run[name]();
    }
    log('done. output in', OUT);
  } finally {
    chrome.kill('SIGKILL');
    await sleep(1200);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* harmless */ }
  }
}

main().catch((e) => { console.error('capture failed:', e.message); process.exit(1); });
