// Validate the ElevenLabs key + list voices + render one test line. Run: node scripts/eleven-test.mjs
import fs from 'fs';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const key = env.match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error('NO KEY in .env.local'); process.exit(1); }

const vr = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
if (!vr.ok) { console.error('voices call failed:', vr.status, (await vr.text()).slice(0, 300)); process.exit(1); }
const voices = (await vr.json()).voices ?? [];
console.log(`KEY OK — ${voices.length} voices. First 12:`);
for (const v of voices.slice(0, 12)) console.log(`  ${v.name.padEnd(16)} ${v.voice_id}  ${v.labels?.gender ?? '?'}/${v.labels?.accent ?? ''}`);

const vid = voices[0]?.voice_id;
const tr = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
  method: 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: "And it's CROWNED! A no-doubt home run for the Maryland Monarchs!", model_id: 'eleven_turbo_v2_5' }),
});
if (!tr.ok) { console.error('TTS failed:', tr.status, (await tr.text()).slice(0, 300)); process.exit(1); }
const buf = Buffer.from(await tr.arrayBuffer());
fs.writeFileSync(new URL('../eleven-test.mp3', import.meta.url), buf);
console.log(`TTS OK — wrote eleven-test.mp3 (${buf.length} bytes) with voice ${voices[0]?.name}`);
