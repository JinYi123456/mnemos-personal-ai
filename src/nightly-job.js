/**
 * Standalone "nightly dream" entrypoint — designed for Nebius Serverless Jobs
 * but runs anywhere Node 20+ runs:
 *
 *   NEBIUS_API_KEY=nk_... node src/nightly-job.js [vaultDir]
 *
 * Loads (or seeds) a vault, runs one dream with the provider chain, saves,
 * prints a summary, exits. Cloud storage sync (S3/OSS push of vault.json)
 * can be wrapped around this in your job spec.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { buildProviders, LLM } from './llm.js';
import { Dreamer } from './dream.js';
import { seedDemoVault } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const vaultDir = process.argv[2] || path.join(ROOT, 'vault');

const store = new Store(vaultDir);
await store.load();
if (store.vault.memories.length === 0) {
  seedDemoVault(store);
  await store.flush();
}

const llm = new LLM(buildProviders(ROOT));
const dreamer = new Dreamer(store, llm);

console.log(`✦ nightly dream starting · vault=${vaultDir} · memories=${store.vault.memories.length}`);
const result = await dreamer.run((ev) => {
  if (ev.phase === 'replay') console.log(`  replay · ${ev.text}`);
  if (ev.phase === 'insight') console.log(`  insight · ${ev.text}`);
  if (ev.phase === 'skill') console.log(`  skill · ${ev.name}`);
  if (ev.phase === 'constellation') console.log(`  constellation · “${ev.name}”`);
  if (ev.phase === 'done') console.log(`✦ done: ${JSON.stringify(result === undefined ? ev : ev)}`);
}, {});

console.log('✦ summary:', JSON.stringify(result));
await store.flush();
process.exit(0);
