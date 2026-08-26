// Pre-render the ElevenLabs announcer pack into public/assets/audio/announcer/.
// The API key stays server-side (read from .env.local); only the mp3s ship.
// Resumable: existing files are skipped, so re-run after a quota top-up.
// Run: node scripts/gen-announcer.mjs
//
// PRONOUNS (dev, 2026-08-05: "they say he made it to a girl"): every pool entry
// is {file, text} with an explicit filename, so legacy "him/he" recordings keep
// their files and become the HE pools; SHE variants + new neutral lines generate
// fresh. EVENTS holds only pronoun-free lines; GENDERED holds he/she pairs.
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

const L = (file, text) => ({ file: `${file}.mp3`, text });

// Neutral pools — no pronouns anywhere in here. Filenames are pinned so the
// original recordings survive the reshuffle (indexes are NOT positional).
const EVENTS = {
  playball: [
    L('playball_0', 'Aight, let us run it — first pitch on the way!'),
    L('playball_1', 'It is kickball on the blacktop, baby — let us GO!'),
    L('playball_2', 'Lace em up, it is GO TIME!'),
  ],
  robbed: [
    L('robbed_0', 'ROBBED! Are you KIDDING me?!'),
    L('robbed_1', 'Snatched it right outta the sky — you are OUTTA here!'),
    L('robbed_2', 'DENIED! What a grab, man!'),
    L('robbed_3', 'Nah nah nah — reeled it in for the OUT!'),
  ],
  pegged: [
    L('pegged_1', 'Right off the back — sit DOWN!'),
  ],
  forced: [
    L('forced_0', 'OUT at the bag!'),
  ],
  safe: [
    L('safe_2', 'Aboard! Runner made it, no problem!'),
  ],
  strike: [
    L('strike_1', 'Strike three — sit it DOWN!'),
    L('strike_2', 'Down on strikes, c-mon now!'),
  ],
  foul: [
    L('foul_0', 'Foul ball!'),
    L('foul_1', 'Kicked it foul — still alive!'),
  ],
  pickle: [
    L('pickle_2', 'Rundown time, baby — somebody is getting COOKED!'),
  ],
  doubleplay: [
    L('doubleplay_0', 'DOUBLE PLAY! Two for the price of one!'),
    L('doubleplay_1', 'They turn TWO — what a play!'),
    L('doubleplay_2', 'Around the horn — DOUBLE play, gone!'),
  ],
  tripleplay: [
    L('tripleplay_0', 'TRIPLE PLAY! Are you SERIOUS?!'),
    L('tripleplay_1', 'THREE outs on one play — UNREAL!'),
  ],
  gameover: [
    L('gameover_0', 'And THAT is the BALLGAME!'),
    L('gameover_1', 'It is OVER — what a finish, man!'),
  ],
  // Fun Overhaul (Know It): elements, fire, balls and walks
  'element-el-train': [
    L('element-el-train_0', 'The el is rolling tonight — hold your nerve when she rumbles!'),
    L('element-el-train_1', 'Train is coming through, baby — time it through the shake!'),
  ],
  'element-steam-vents': [
    L('element-steam-vents_0', 'Steam is UP in the outfield — they cannot catch what they cannot see!'),
    L('element-steam-vents_1', 'Vents are cooking tonight — kick it into the fog!'),
  ],
  'element-dj-drop': [
    L('element-dj-drop_0', 'DJ is in the booth — kick it ON the beat for that extra sauce!'),
    L('element-dj-drop_1', 'Find the rhythm, baby — the drop pays POWER!'),
  ],
  'element-night-hustle': [
    L('element-night-hustle_0', 'Night hustle rules — them jumps are HOT under the neon!'),
    L('element-night-hustle_1', 'The neon is buzzing — runners eat FREE tonight!'),
  ],
  'element-sea-breeze': [
    L('element-sea-breeze_0', 'That sea breeze is blowing OUT — deep balls gonna FLY!'),
    L('element-sea-breeze_1', 'Wind off the water, baby — send one to the sand!'),
  ],
  'element-motorcade': [
    L('element-motorcade_0', 'Motorcade in the area — when them sirens sweep, arms go COLD!'),
    L('element-motorcade_1', 'Sirens rolling through — run on em while they flinch!'),
  ],
  'element-extra-bounce': [
    L('element-extra-bounce_0', 'Rubber ground tonight — this rock got BOUNCE!'),
    L('element-extra-bounce_1', 'Watch them hops, man — one big bounce is a FREE double!'),
  ],
  'element-the-hawk': [
    L('element-the-hawk_0', 'The HAWK is out tonight, Chicago — watch that flag!'),
    L('element-the-hawk_1', 'That wind will bend your best kick sideways — respect the Hawk!'),
  ],
  'element-heat-wave': [
    L('element-heat-wave_0', 'Heat wave, baby — the ball flies and the legs DIE!'),
    L('element-heat-wave_1', 'It is a scorcher — deep balls carry and fielders fade LATE!'),
  ],
  'element-heavy-air': [
    L('element-heavy-air_0', 'Heavy air off the harbor — bombs come here to DIE!'),
    L('element-heavy-air_1', 'Thick night at The Crown — small ball wins this one!'),
  ],
  fire: [
    L('fire_0', 'THEY ARE ON FIRE! Every kick is JUICED!'),
    L('fire_1', 'The bar is FULL, baby — this crew is BURNING!'),
  ],
  // Starting-lineup walkouts (dev: "have them walk out... announcer shit too,
  // like a real game would be")
  lineups: [
    L('lineups_0', 'STARTING LINEUPS, baby — let us meet the CREWS!'),
    L('lineups_1', 'Lights UP! Bring em out, bring em OUT!'),
  ],
  'walkout-captain': [
    L('walkout-captain_0', 'The CAPTAIN of the squad — show em how it is done!'),
    L('walkout-captain_1', 'Here comes the captain — this is THEIR block tonight!'),
  ],
  'walkout-power': [
    L('walkout-power_0', 'That boot is a PROBLEM — big power walking out!'),
    L('walkout-power_1', 'When this one connects, the ball LEAVES the neighborhood!'),
  ],
  'walkout-speed': [
    L('walkout-speed_0', 'Fastest feet on the block — no contest!'),
    L('walkout-speed_1', 'Blink and you missed em — pure WHEELS right here!'),
  ],
  'walkout-glove': [
    L('walkout-glove_0', 'Nothing drops in — them hands are MONEY!'),
    L('walkout-glove_1', 'Best glove on the block, walking out COOL as ever!'),
  ],
  'walkout-home': [
    L('walkout-home_0', 'And NOW — your HOME crew, make some NOISE!'),
    L('walkout-home_1', 'Your block, your squad — STAND UP!'),
  ],
  // ball/walk had MIXED subjects (pitcher vs kicker) — rewritten pronoun-free
  ball: [
    L('ball_2', 'Way outside — the count is climbing!'),
    L('ball_3', 'Nowhere NEAR the plate — that is a ball!'),
    L('ball_4', 'That rock was rolling somewhere else — take it!'),
  ],
  walk: [
    L('walk_3', 'Four wide ones — that is a FREE bag!'),
  ],
  // the dance number is over — the game starts NOW (the break beat)
  gametime: [
    L('gametime_0', 'Show is over, baby — it is GAME TIME!'),
    L('gametime_1', 'Aight aight, party is done — let us HOOP, kickball style!'),
  ],
};

// he/she pools. HE reuses the legacy recordings wherever one exists.
const GENDERED = {
  crowned: {
    he: [
      L('crowned_he_0', 'CROWNED! He sent that to the MOON!'),
      L('crowned_he_1', 'Oh that is GONE — no-doubt BOMB off his foot!'),
      L('crowned_he_2', 'GET UP, get up — SEE YA! Home run!'),
    ],
    she: [
      L('crowned_she_0', 'CROWNED! She sent that to the MOON!'),
      L('crowned_she_1', 'Oh that is GONE — no-doubt BOMB off her foot!'),
      L('crowned_she_2', 'GET UP, get up — SEE YA! Home run!'),
    ],
  },
  pegged: {
    he: [
      L('pegged_0', 'PEGGED him! Drilled him GOOD!'),
      L('pegged_2', 'BULLSEYE! He is OUTTA here!'),
      L('pegged_3', 'Nailed him clean! That is an OUT!'),
    ],
    she: [
      L('pegged_she_0', 'PEGGED her! Drilled her GOOD!'),
      L('pegged_she_1', 'BULLSEYE! She is OUTTA here!'),
      L('pegged_she_2', 'Nailed her clean! That is an OUT!'),
    ],
  },
  safe: {
    he: [
      L('safe_0', 'SAFE! He beat the throw!'),
      L('safe_1', 'He is IN there — SAFE!'),
    ],
    she: [
      L('safe_she_0', 'SAFE! She beat the throw!'),
      L('safe_she_1', 'She is IN there — SAFE!'),
    ],
  },
  strike: {
    he: [L('strike_0', 'WHIFF! Struck him OUT!')],
    she: [L('strike_she_0', 'WHIFF! Struck her OUT!')],
  },
  forced: {
    he: [
      L('forced_1', 'Force out — GOT him!'),
      L('forced_2', 'Ball beat the runner — he is DONE!'),
    ],
    she: [
      L('forced_she_0', 'Force out — GOT her!'),
      L('forced_she_1', 'Ball beat the runner — she is DONE!'),
    ],
  },
  pickle: {
    he: [
      L('pickle_0', 'He is in a PICKLE!'),
      L('pickle_1', 'Caught in the rundown — he is TRAPPED!'),
    ],
    she: [
      L('pickle_she_0', 'She is in a PICKLE!'),
      L('pickle_she_1', 'Caught in the rundown — she is TRAPPED!'),
    ],
  },
  walk: {
    he: [
      L('walk_0', 'Ball four — take a walk, big man!'),
      L('walk_1', 'Four bad ones and he STROLLS on down!'),
    ],
    she: [
      L('walk_she_0', 'Ball four — she takes the stroll!'),
      L('walk_she_1', 'Four bad ones and she STRUTS on down!'),
    ],
  },
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

const manifest = { voices: VOICES.map(v => v.id), events: {}, gendered: {}, teams: {} };
let ok = 0, skip = 0, fail = 0;
const tally = (s) => { if (s === 'ok') ok++; else if (s === 'skip') skip++; else fail++; };

for (const v of VOICES) {
  const dir = new URL(`${v.id}/`, OUT);
  fs.mkdirSync(dir, { recursive: true });
  const first = v === VOICES[0];
  for (const [ev, lines] of Object.entries(EVENTS)) {
    if (first) manifest.events[ev] = [];
    for (const l of lines) {
      const s = await tts(v.voice_id, l.text, new URL(l.file, dir)); tally(s);
      if (first && s !== 'fail') manifest.events[ev].push(l.file);
    }
  }
  for (const [ev, pools] of Object.entries(GENDERED)) {
    if (first) manifest.gendered[ev] = { he: [], she: [] };
    for (const g of ['he', 'she']) {
      for (const l of pools[g]) {
        const s = await tts(v.voice_id, l.text, new URL(l.file, dir)); tally(s);
        if (first && s !== 'fail') manifest.gendered[ev][g].push(l.file);
      }
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
