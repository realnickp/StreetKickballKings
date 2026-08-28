// Generate realistic gameplay SFX via ElevenLabs sound-generation, server-side.
// Run: node scripts/gen-sfx.mjs   (resumable — skips files that already exist)
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const ROOT = new URL('..', import.meta.url);
const key = fs.readFileSync(new URL('.env.local', ROOT), 'utf8').match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error('no ELEVENLABS_API_KEY'); process.exit(1); }
const OUT = new URL('public/assets/audio/sfx/', ROOT);
fs.mkdirSync(OUT, { recursive: true });

// punchy, dry, single-hit descriptions — no music, so they layer cleanly in-game
const SFX = [
  { file: 'kick.mp3',        text: 'A rubber playground kickball blasted with a massive kick, huge deep punchy thump with a sharp rubber snap on top, one single hit, dry, close-up, no music', dur: 1.0, infl: 0.7 },
  { file: 'peg.mp3',         text: "A rubber ball smacking violently into a person's back, loud wet rubber slap with a deep body thud, one single hit, dry, no music", dur: 0.8, infl: 0.7 },
  { file: 'fireball.mp3', text: 'A massive fiery whoosh igniting into a powerful explosive boom, cinematic fireball launch with deep bass impact, energetic and prominent, no music', dur: 2.5, infl: 0.6 },
  { file: 'catch.mp3',       text: 'A fastball smacking into a leather glove, loud sharp leather pop with a crack, one single hit, dry, close-up, no music', dur: 0.7, infl: 0.7 },
  // SFX expansion (dev, 2026-08-05: "way more sound effects"):
  { file: 'bounce.mp3',   text: 'A rubber playground kickball bouncing once on asphalt, hollow rubbery boing impact, one single bounce, dry, close-up, no music', dur: 0.6, infl: 0.7 },
  { file: 'fence.mp3',    text: 'A ball smacking into a chain-link fence, metallic chain rattle shaking then settling, one single impact, dry, no music', dur: 1.2, infl: 0.7 },
  { file: 'slide.mp3',    text: 'A ballplayer sliding hard across gritty asphalt, short rough gravelly scrape, one single slide, dry, no music', dur: 0.8, infl: 0.7 },
  { file: 'homer.mp3',    text: 'A stadium air horn blast with fireworks crackling behind it, triumphant home run celebration, big and loud, no music', dur: 2.5, infl: 0.6 },
  { file: 'crowd-ooh.mp3', text: 'A street crowd groaning a big disappointed OHHH together, one collective groan falling off, no music', dur: 1.3, infl: 0.7 },
  { file: 'whoosh.mp3',   text: 'A fast hard baseball throw cutting the air, sharp short air whip whoosh, one single whoosh, dry, no music', dur: 0.5, infl: 0.7 },
  { file: 'swish.mp3',    text: 'A powerful leg swinging hard through the air, deep whip whoosh, one single swing, dry, no music', dur: 0.5, infl: 0.7 },
  { file: 'squeak.mp3',   text: 'A basketball sneaker squeaking hard on pavement during a quick cut, one short sharp squeak, dry, no music', dur: 0.5, infl: 0.7 },
  { file: 'roll.mp3',     text: 'A rubber kickball rolling fast across rough asphalt toward the listener, continuous gritty rolling rumble, no impacts, no music', dur: 1.2, infl: 0.7 },
  { file: 'crowd-cheer.mp3', text: 'A big street crowd bursting into a loud excited cheer with claps and whistles, wide and energetic, no music', dur: 2.5, infl: 0.6 },
  // Sound-for-everything round (dev, 2026-08-25). One style line so they layer:
  // arcade-loud, punchy, dry, single hit, no music.
  { file: 'ui-tap.mp3',     text: 'A crisp arcade button tap, short bright click with a tiny low thump, one single hit, dry, no music', dur: 0.5, infl: 0.7 },
  { file: 'ui-confirm.mp3', text: 'A punchy arcade confirm blip, two quick rising tones locking in, short, dry, no music', dur: 0.5, infl: 0.7 },
  { file: 'score.mp3',      text: 'A triumphant arcade score sting, bright rising chime with a deep bass hit underneath, short, punchy, no music', dur: 1.0, infl: 0.6 },
  { file: 'safe.mp3',       text: 'A ballplayer sliding into a base with a sharp slap of a hand on the bag, gritty scrape then slap, one single hit, dry, no music', dur: 0.8, infl: 0.7 },
  { file: 'out.mp3',        text: 'A sharp referee whistle blast followed immediately by a deep dull thud, one single hit, dry, no music', dur: 0.8, infl: 0.7 },
  { file: 'tag.mp3',        text: 'A leather glove slapping hard against a person, sharp leather smack, one single hit, dry, close-up, no music', dur: 0.5, infl: 0.7 },
  { file: 'foul.mp3',       text: 'A dull hollow rubber thunk of a ball hitting the ground wrong followed by a short sharp whistle chirp, one hit, dry, no music', dur: 0.8, infl: 0.7 },
  { file: 'inning.mp3',     text: 'A short stadium horn blast, two quick punchy notes, big and bright, no music', dur: 1.2, infl: 0.6 },
  { file: 'crown-tick.mp3', text: 'A short bright rising arcade ping, single energetic power-up tick, dry, no music', dur: 0.5, infl: 0.7 },
  { file: 'crown-arm.mp3',  text: 'A powerful arcade power-up charge sound, rising electric whoosh into a solid metallic lock click, short, punchy, no music', dur: 1.0, infl: 0.6 },
  { file: 'countdown.mp3',  text: 'A single short sharp countdown beep, high clean digital tone, dry, no music', dur: 0.5, infl: 0.7 },
  { file: 'unlock.mp3',     text: 'A bright arcade unlock chime with a cash register ding and sparkle, short and rewarding, no music', dur: 1.2, infl: 0.6 },
  { file: 'stomp.mp3',      text: 'A single person walking with a confident swagger on asphalt, heavy sneaker footsteps, steady rhythm, two seconds, dry, no music', dur: 2.0, infl: 0.7 },
  { file: 'cheer-big.mp3',  text: 'A huge street crowd erupting in a massive roaring cheer with whistles and shouts, explosive and wide, no music', dur: 3.0, infl: 0.6 },
  { file: 'boo.mp3',        text: 'A street crowd booing loudly together, deep disapproving BOOO, one collective wave, no music', dur: 1.6, infl: 0.7 },
  // The kick is HEARD (dev, 2026-08-28: "there's no sound effect when the kick
  // meets the ball"). ROOT CAUSE, found by measuring: kick.mp3 came back from
  // THIS generator peaking at −23.5 dBFS — 23 dB under every other cue in this
  // table — so the contact thump was emitted, warmed and played, and simply
  // could not be heard under the beat. It is not a code bug.
  //
  // !! This generator renders short single-hit impacts VERY quiet, and does it
  // repeatably: four takes of 'strike' came back at −50.1, −43.2, −38.5 and
  // −16.2 dBFS peak. NEVER trust a fresh impact file — measure it, and if it
  // peaks below about −6 dBFS, peak-normalise before shipping:
  //   ffmpeg -i in.mp3 -af volumedetect -f null -      # read max_volume
  //   ffmpeg -i in.mp3 -af 'volume=<-1.5 - max>dB' -b:a 128k out.mp3
  // The shipped strike.mp3 is the 4th take (this prompt) lifted +14.7 dB that
  // way: 0.52 s, mean −17.7 dB, peak −1.9 dB — in family with peg and swish.
  { file: 'strike.mp3',    text: 'A powerful sneaker kick smashing a rubber ball, loud percussive thump and snap, one single hit, dry, close-up, no music', dur: 0.5, infl: 0.7 },
  { file: 'bigwhoosh.mp3', text: 'A fast martial-arts leg whoosh cutting the air, powerful sweeping air whip, one single swing, close, dry, no music', dur: 0.6, infl: 0.7 },
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
  console.log('ok  ', file, loudnessGate(out));
  return 'ok';
}

// LOUDNESS GATE (2026-08-28): this generator renders single-hit impacts at
// -23…-51 dBFS (kick, ui-tap, scratch all shipped inaudible). Every new take is
// measured; anything peaking under -6 dBFS is peak-normalised to -1.9 dBFS in
// place. Needs ffmpeg on PATH; if it is missing the take is kept and flagged.
function loudnessGate(outUrl) {
  const path = fileURLToPath(outUrl);
  const peak = () => {
    const log = execFileSync('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
      + '';
    const m = /max_volume:\s*(-?[\d.]+) dB/.exec(log);
    return m ? parseFloat(m[1]) : null;
  };
  try {
    const before = peak();
    if (before == null) return '(peak unknown)';
    if (before >= -6) return `(peak ${before} dBFS ok)`;
    const tmp = path.replace(/\.mp3$/, '.norm.mp3');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path, '-af', `volume=${(-1.9 - before).toFixed(2)}dB`, '-codec:a', 'libmp3lame', '-q:a', '2', tmp], { stdio: 'ignore' });
    fs.renameSync(tmp, path);
    return `(peak ${before} dBFS → normalised to ${peak()} dBFS)`;
  } catch (e) {
    return `(loudness gate skipped: ${String(e.message).slice(0, 80)})`;
  }
}

let ok = 0, fail = 0;
for (const s of SFX) { const r = await gen(s); if (r === 'ok') ok++; else if (r === 'fail') fail++; }
console.log(`\nDONE — ok=${ok} fail=${fail}`);
