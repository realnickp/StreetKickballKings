// Pre-render the ElevenLabs announcer pack into public/assets/audio/announcer/.
// The API key stays server-side (read from .env.local); only the mp3s ship.
// Resumable: existing files are skipped, so re-run after a quota top-up.
// Run: node scripts/gen-announcer.mjs
import fs from 'fs';

const ROOT = new URL('..', import.meta.url);
const key = fs.readFileSync(new URL('.env.local', ROOT), 'utf8').match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error('no ELEVENLABS_API_KEY'); process.exit(1); }
const OUT = new URL('public/assets/audio/announcer/', ROOT);
fs.mkdirSync(OUT, { recursive: true });

// the "booth": urban, American, high-energy hype voices (one chosen per match).
// Low stability + high style = excited, dynamic delivery for streetball play-by-play.
const VOICES = [
  { id: 'tony',   voice_id: 'ICwKbPHDHAM3eal5tHEZ' }, // Authentic Brooklyn, NY accent
  { id: 'carter', voice_id: 'GorLj2SsI4u2JqL58gAA' }, // Charismatic NY street voice
];
const MODEL = 'eleven_multilingual_v2'; // richer emotion than turbo for pre-rendered hype lines
const SETTINGS = { stability: 0.32, similarity_boost: 0.85, style: 0.6, use_speaker_boost: true };

const TEAMS = JSON.parse(fs.readFileSync(new URL('src/data/teams.json', ROOT), 'utf8')).teams;

const EVENTS = {
  playball: ['Aight, let us run it — first pitch on the way!', "It is kickball on the blacktop, baby — let us GO!", 'Lace em up, it is GO TIME!'],
  robbed:   ['ROBBED! Are you KIDDING me?!', 'Snatched it right outta the sky — you are OUTTA here!', 'DENIED! What a grab, man!', "Nah nah nah — reeled it in for the OUT!"],
  pegged:   ['PEGGED him! Drilled him GOOD!', 'Right off the back — sit DOWN!', 'BULLSEYE! He is OUTTA here!', 'Nailed him clean! That is an OUT!'],
  forced:   ['OUT at the bag!', 'Force out — GOT him!', 'Ball beat the runner — he is DONE!'],
  safe:     ['SAFE! He beat the throw!', 'He is IN there — SAFE!', 'Aboard! Runner made it, no problem!'],
  strike:   ['WHIFF! Struck him OUT!', 'Strike three — sit it DOWN!', 'Down on strikes, c-mon now!'],
  foul:     ['Foul ball!', 'Kicked it foul — still alive!'],
  pickle:   ['He is in a PICKLE!', 'Caught in the rundown — he is TRAPPED!'],
  doubleplay: ['DOUBLE PLAY! Two for the price of one!', 'They turn TWO — what a play!', 'Around the horn — DOUBLE play, gone!'],
  tripleplay: ['TRIPLE PLAY! Are you SERIOUS?!', 'THREE outs on one play — UNREAL!'],
  gameover: ['And THAT is the BALLGAME!', 'It is OVER — what a finish, man!'],
};
const CROWNED = {
  he:  ['CROWNED! He sent that to the MOON!', 'Oh that is GONE — no-doubt BOMB off his foot!', 'GET UP, get up — SEE YA! Home run!'],
  she: ['CROWNED! She sent that to the MOON!', 'Oh that is GONE — no-doubt BOMB off her foot!', 'GET UP, get up — SEE YA! Home run!'],
};
const nowKicking = (name) => [`Now kicking — the ${name}, let us GO!`, `Up next, it is the ${name}!`];

async function tts(voice_id, text, outURL) {
  if (fs.existsSync(outURL)) return 'skip';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (!r.ok) { console.error('  TTS FAIL', r.status, (await r.text()).slice(0, 140)); return 'fail'; }
  fs.writeFileSync(outURL, Buffer.from(await r.arrayBuffer()));
  return 'ok';
}

const manifest = { voices: VOICES.map(v => v.id), events: {}, crowned: { he: [], she: [] }, teams: {} };
let ok = 0, skip = 0, fail = 0;
const tally = (s) => { if (s === 'ok') ok++; else if (s === 'skip') skip++; else fail++; };

for (const v of VOICES) {
  const dir = new URL(`${v.id}/`, OUT);
  fs.mkdirSync(dir, { recursive: true });
  const first = v === VOICES[0];
  for (const [ev, lines] of Object.entries(EVENTS)) {
    if (first) manifest.events[ev] = [];
    for (let i = 0; i < lines.length; i++) {
      const fn = `${ev}_${i}.mp3`;
      const s = await tts(v.voice_id, lines[i], new URL(fn, dir)); tally(s);
      if (first && s !== 'fail') manifest.events[ev].push(fn);
    }
  }
  for (const g of ['he', 'she']) {
    for (let i = 0; i < CROWNED[g].length; i++) {
      const fn = `crowned_${g}_${i}.mp3`;
      const s = await tts(v.voice_id, CROWNED[g][i], new URL(fn, dir)); tally(s);
      if (first && s !== 'fail') manifest.crowned[g].push(fn);
    }
  }
  for (const t of TEAMS) {
    if (first) manifest.teams[t.id] = [];
    const lines = nowKicking(t.name);
    for (let i = 0; i < lines.length; i++) {
      const fn = `team_${t.id}_${i}.mp3`;
      const s = await tts(v.voice_id, lines[i], new URL(fn, dir)); tally(s);
      if (first && s !== 'fail') manifest.teams[t.id].push(fn);
    }
  }
  console.log(`voice ${v.id} done (ok=${ok} skip=${skip} fail=${fail})`);
  if (fail > 3) { console.error('too many failures (quota?) — stopping; manifest reflects what generated'); break; }
}
fs.writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));
console.log(`\nDONE — ok=${ok} skip=${skip} fail=${fail}. manifest written.`);
