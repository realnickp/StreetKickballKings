// Generate realistic gameplay SFX via ElevenLabs sound-generation, server-side.
// Run: node scripts/gen-sfx.mjs   (resumable — skips files that already exist)
import fs from 'fs';
const ROOT = new URL('..', import.meta.url);
const key = fs.readFileSync(new URL('.env.local', ROOT), 'utf8').match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error('no ELEVENLABS_API_KEY'); process.exit(1); }
const OUT = new URL('public/assets/audio/sfx/', ROOT);
fs.mkdirSync(OUT, { recursive: true });

// punchy, dry, single-hit descriptions — no music, so they layer cleanly in-game
const SFX = [
  { file: 'kick.mp3',     text: 'A hard rubber playground kickball struck with a powerful kick, deep punchy low thump impact, one single solid hit, dry, close-up, no music', dur: 1.0, infl: 0.7 },
  { file: 'peg.mp3',      text: "A rubber ball smacking hard into a person's body, heavy dull thud impact, one single hit, dry, no music", dur: 0.8, infl: 0.7 },
  { file: 'fireball.mp3', text: 'A massive fiery whoosh igniting into a powerful explosive boom, cinematic fireball launch with deep bass impact, energetic and prominent, no music', dur: 2.5, infl: 0.6 },
  { file: 'catch.mp3',    text: 'A ball smacking firmly into a leather baseball glove, sharp snappy leather catch pop, one single hit, dry, no music', dur: 0.7, infl: 0.7 },
];

async function gen({ file, text, dur, infl }) {
  const out = new URL(file, OUT);
  if (fs.existsSync(out)) { console.log('skip', file); return 'skip'; }
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: dur, prompt_influence: infl }),
  });
  if (!r.ok) { console.error('FAIL', file, r.status, (await r.text()).slice(0, 160)); return 'fail'; }
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log('ok  ', file);
  return 'ok';
}

let ok = 0, fail = 0;
for (const s of SFX) { const r = await gen(s); if (r === 'ok') ok++; else if (r === 'fail') fail++; }
console.log(`\nDONE — ok=${ok} fail=${fail}`);
