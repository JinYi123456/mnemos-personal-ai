#!/usr/bin/env node
/**
 * Frame capture harness — drives a real headless Chrome over the DevTools
 * protocol and waits for *actual application state* before shooting, so the
 * gallery and video frames are screenshots of things that really happened
 * rather than staged mock-ups.
 *
 *   node tools/capture-frames.mjs            # all frames
 *   node tools/capture-frames.mjs brief      # one frame
 *
 * Requires the app running locally (owner mode is easiest):
 *   MNEMOS_SINGLE_VAULT=1 node src/server.js
 *
 * No dependencies: Node's built-in fetch + WebSocket speak CDP directly.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CAP_APP || 'http://127.0.0.1:8791';
const OUT = process.env.CAP_OUT || 'assets';
const PORT = 9333;
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = {
  /** @type {WebSocket|null} */ ws: null,
  n: 0,
  /** @type {Map<number,(v:any)=>void>} */
  waiting: new Map(),
  /** @type {Map<string,(p:any)=>void>} */
  events: new Map(),
  /** @param {string} url */
  async connect(url) {
    this.ws = new WebSocket(url);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.waiting.has(msg.id)) {
        this.waiting.get(msg.id)(msg);
        this.waiting.delete(msg.id);
      } else if (msg.method && this.events.has(msg.method)) {
        this.events.get(msg.method)(msg.params || {});
      }
    });
  },
  /**
   * @param {string} method
   * @param {Record<string, any>} [params]
   */
  send(method, params = {}) {
    const id = ++this.n;
    return new Promise((res) => {
      this.waiting.set(id, res);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  },
  /** @param {string} name @param {(p:any)=>void} fn */
  on(name, fn) { this.events.set(name, fn); },
  /** @param {string} expr */
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      returnByValue: true, awaitPromise: true,
    });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
    return r.result?.result?.value;
  },
  /** @param {string} expr @param {number} timeoutMs */
  async until(expr, timeoutMs = 60000) {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await this.eval(expr); } catch { /* page still busy */ }
      if (v) return v;
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for: ' + expr.slice(0, 60));
      await sleep(500);
    }
  },
  /** @param {string} file */
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, OUT, file), Buffer.from(r.result.data, 'base64'));
    return file;
  },
  /** @param {string} selector @param {string[]} files */
  async setFiles(selector, files) {
    const doc = await this.send('DOM.getDocument');
    const q = await this.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector });
    if (!q.result?.nodeId) throw new Error('no node for ' + selector);
    await this.send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files });
  },
};

async function main() {
  const want = process.argv[2];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemos-capture-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let list = null;
    for (let i = 0; i < 60 && !list; i += 1) {
      await sleep(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const pages = await res.json();
        list = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      } catch { /* not up yet */ }
    }
    if (!list) throw new Error('chrome devtools endpoint never came up');
    await client.connect(list.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    /** @param {string} url */
    const go = async (url) => {
      const loaded = new Promise((res) => client.on('Page.loadEventFired', res));
      await client.send('Page.navigate', { url });
      await Promise.race([loaded, sleep(8000)]);
      await sleep(1400);
    };

    // ---- 1 · the morning brief a dream left behind -------------------------
    if (!want || want === 'brief') {
      // the brief lives in the transcript, so this frame keeps the chat visible
      await go(`${APP}/`);
      await client.until(`return !!document.querySelector('.brief-card')`, 20000);
      console.log('✓', await client.shot('gallery-04-morning-brief.png'));
    }

    // ---- 2 · memory ablation: same question, one memory withheld -----------
    if (!want || want === 'ablation') {
      await go(`${APP}/?hidechat=1`);
      // `state` is a top-level const in the page's global scope, not a window property
      await client.until(`return typeof Ablate !== 'undefined' && typeof state !== 'undefined' && state.galaxy.stars.length > 0`, 25000);
      await client.eval(`
        const s = state.galaxy.stars.find(x => /paper notebook|Kyoto|telescope/i.test(x.text)) || state.galaxy.stars[0];
        Ablate.run(s.id, s.text);
        return s.id;
      `);
      await client.until(`return !!document.querySelector('.ab-badge')`, 90000);
      await sleep(700);
      console.log('✓', await client.shot('gallery-05-ablation.png'));
    }

    // ---- 3 · photo memory: a whiteboard read by Nemotron-3.5-Super-VL ------
    if (!want || want === 'photo') {
      await go(`${APP}/`);
      await client.until(`return !!document.getElementById('attach-file')`, 20000);
      await client.setFiles('#attach-file', [path.join(ROOT, 'assets', 'vision-test.png')]);
      await client.until(`return !document.getElementById('attach-preview').classList.contains('hidden')`, 15000);
      await client.eval(`
        els.input.value = 'File this whiteboard photo into my memory.';
        document.getElementById('btn-send').click();
        return true;
      `);
      await client.until(`return !!document.querySelector('.seen-card')`, 90000);
      await sleep(1200);
      console.log('✓', await client.shot('gallery-06-photo-memory.png'));
    }
  } finally {
    chrome.kill('SIGKILL');
    // Chrome can hold the temp profile for a moment after SIGKILL on Windows.
    await sleep(1200);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* leftover temp dir is harmless */ }
  }
}

main().catch((e) => { console.error('capture failed:', e.message); process.exit(1); });
