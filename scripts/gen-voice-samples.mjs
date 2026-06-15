// Generate short hype samples from candidate Black/NY announcer voices so the
// user can listen and pick. Outputs to public/assets/audio/samples/ + an index.
import fs from 'fs';
const ROOT = new URL('..', import.meta.url);
const key = fs.readFileSync(new URL('.env.local', ROOT), 'utf8').match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
const OUT = new URL('public/assets/audio/samples/', ROOT);
fs.mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  { id: 'brian',  name: 'Brian — African American Radio Jockey', voice_id: 'MEiBY6lrwud0dREUa5FQ' },
  { id: 'kirk',   name: 'Kirk — Pro Radio Host / DJ (African American)', voice_id: 'qCOg5eBuZbbbh4f3UZSR' },
  { id: 'carter', name: 'Carter — Charismatic NY street voice', voice_id: 'GorLj2SsI4u2JqL58gAA' },
  { id: 'reggie', name: 'Agent Reggie — Deep African American radio voice', voice_id: 'SALSvnohP4INnBtLmKhI' },
  { id: 'tony',   name: 'Tony — Authentic Brooklyn, NY accent', voice_id: 'ICwKbPHDHAM3eal5tHEZ' },
];
const LINE = "OH he CROWNED it — that ball is OUTTA here! And the Monarchs take the lead, let's GO!";
const SETTINGS = { stability: 0.32, similarity_boost: 0.85, style: 0.6, use_speaker_boost: true };

let ok = 0;
for (const c of CANDIDATES) {
  const out = new URL(`${c.id}.mp3`, OUT);
  if (fs.existsSync(out)) { console.log('skip', c.id); ok++; continue; }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${c.voice_id}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: LINE, model_id: 'eleven_multilingual_v2', voice_settings: SETTINGS }),
  });
  if (!r.ok) { console.error('FAIL', c.id, r.status, (await r.text()).slice(0, 120)); continue; }
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log('ok  ', c.id); ok++;
}

// a tiny listen page
const rows = CANDIDATES.map(c => `<div class="row"><b>${c.id.toUpperCase()}</b> — ${c.name}<br><audio controls src="assets/audio/samples/${c.id}.mp3"></audio></div>`).join('\n');
fs.writeFileSync(new URL('voice-samples.html', new URL('public/', ROOT)), `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>SKK Announcer Samples</title><style>body{background:#0d0f15;color:#fff;font-family:system-ui;padding:18px;max-width:640px;margin:auto}.row{background:#1c1f2a;border-radius:12px;padding:14px;margin:12px 0}audio{width:100%;margin-top:8px}b{color:#f5b312}</style><h1>Announcer voice samples</h1><p>Pick the one(s) you want and tell Claude.</p>${rows}`);
console.log(`\nDONE ok=${ok}. Open /voice-samples.html to listen.`);
