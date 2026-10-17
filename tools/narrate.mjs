#!/usr/bin/env node
/**
 * Narration generator — Microsoft David (SAPI5) per shot, one WAV each, then
 * ffprobe-measured durations so the edit is cut to the VOICE, not the other way
 * round. Zero budget, zero network.
 *
 *   node tools/narrate.mjs
 *
 * Writes assets/video/audio/<id>.wav and assets/video/audio/timings.json
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'video', 'audio');
const RATE = Number(process.env.NARRATE_RATE || 0); // 0 ≈ natural; 1 ≈ 147 wpm
const VOICE = process.env.NARRATE_VOICE || 'Microsoft David Desktop';

/** Ordered narration. Keep the exact product + provider names spoken aloud. */
const SEGMENTS = [
  ['sky', `This is somebody's memory. Not a database row — a sky. Every assistant you use either forgets you when the tab closes, or remembers you in a box you cannot open. ChatGPT and Claude now dream over your data in the background. You never see it. You cannot argue with it.`],
  ['recall', `This is Mnemos. Watch it think. It recalls by lighting up the exact stars it read. It answers with receipts — every chip is a real memory id. Click one, and that star flares. And if a citation cannot be resolved, it turns red. You see the model overreach, instead of trusting it.`],
  ['telemetry', `Every call is metered live. The model, the tokens, the latency, the cost in dollars — read straight off Nebius Token Factory. That one turn cost four ten-thousandths of a cent, on an NVIDIA Nemotron 3 open model.`],
  ['tavily', `It can also go look things up. That is Tavily, called at runtime as one of its tools.`],
  ['ablation', `But here is the part nobody shows you. Click any memory, and ask: what if it forgot this? Mnemos answers the same question twice — with that memory, and without it. Same model, same question. The only difference is the memory. It lost two citations, the answer got vaguer, and it scores how much that mattered. Trust stops being a claim. It becomes an experiment you can run in four seconds.`],
  ['dream', `At night it dreams — on purpose. Give it an intention, and tonight's replay leans toward it. Nemotron 3 Super and Ultra find links between memories that never say each other out loud, draw them as constellations, learn a reusable skill, and write a morning brief.`],
  ['brief', `You wake up to three things to do that your own notes never told you.`],
  ['photo', `Show it a whiteboard, and an NVIDIA vision model reads it into new stars.`],
  ['evidence', `One vault per visitor. Plain JSON you can export or burn. A zero dependency MCP server, so any other agent can use your memory. And retrieval is measured: forty questions, LongMemEval style, four modes.`],
  ['title', `Mnemos. Memory you can see, question, and own — built on Nebius Token Factory with NVIDIA Nemotron 3.`],
];

fs.mkdirSync(OUT, { recursive: true });

const ps = `
Add-Type -AssemblyName System.Speech
$ErrorActionPreference = 'Stop'
$voice = [Environment]::GetEnvironmentVariable('NARRATE_VOICE')
$rate = [int][Environment]::GetEnvironmentVariable('NARRATE_RATE')
$outDir = [Environment]::GetEnvironmentVariable('NARRATE_OUT')
$map = Get-Content -Raw -Encoding UTF8 ([Environment]::GetEnvironmentVariable('NARRATE_MAP')) | ConvertFrom-Json
foreach ($seg in $map) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try { $s.SelectVoice($voice) } catch { Write-Host "voice fallback: $voice" }
  $s.Rate = $rate
  $wav = Join-Path $outDir ($seg.id + '.wav')
  $s.SetOutputToWaveFile($wav)
  $s.Speak($seg.text)
  $s.Dispose()
  Write-Host "wrote $wav"
}
`;

fs.writeFileSync(path.join(OUT, '_map.json'), JSON.stringify(SEGMENTS.map(([id, text]) => ({ id, text }))));

const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
  env: {
    ...process.env,
    NARRATE_VOICE: VOICE, NARRATE_RATE: String(RATE),
    NARRATE_OUT: OUT, NARRATE_MAP: path.join(OUT, '_map.json'),
  },
  encoding: 'utf8',
});
process.stdout.write(r.stdout || '');
if (r.status !== 0) { process.stderr.write(r.stderr || ''); process.exit(1); }

// measure durations
const timings = [];
for (const [id] of SEGMENTS) {
  const wav = path.join(OUT, id + '.wav');
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', wav], { encoding: 'utf8' });
  const dur = Number((p.stdout || '0').trim());
  timings.push({ id, dur });
  console.log('·', id, dur.toFixed(2) + 's');
}
const total = timings.reduce((a, t) => a + t.dur, 0);
fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify({ voice: VOICE, rate: RATE, total, timings }, null, 1));
console.log('TOTAL narration', total.toFixed(2) + 's');
