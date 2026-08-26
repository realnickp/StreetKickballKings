// AudioBus: WebAudio with music/sfx/vo channels, VO ducking, and tiny
// synthesized blips for utility sounds. Subscribes to 'sfx'/'vo' bus events.
// Array values = pools; one is picked at random per play so lines/beats vary.
import { CITY_TRACKS } from './audioTracks.js';

const FILES = {
  music: {
    theme: 'assets/audio/theme-red-rubber-felony.mp3',
    beat: ['assets/audio/music/in-match-beat-1.m4a', 'assets/audio/music/in-match-beat-2.m4a'],
    ...CITY_TRACKS, // one hip hop dialect per crew city (audioTracks.js)
  },
  sfx: {
    bassdrop: 'assets/audio/sfx/bassdrop.mp3',
    scratch: 'assets/audio/sfx/scratch.mp3',
    'crowd-cheer': 'assets/audio/sfx/crowd-cheer.mp3',
    'crowd-ambience': 'assets/audio/sfx/crowd-ambience.mp3',
    kick: 'assets/audio/sfx/kick.mp3',         // realistic rubber-ball kick thump
    peg: 'assets/audio/sfx/peg.mp3',           // ball smacks a runner
    fireball: 'assets/audio/sfx/fireball.mp3', // prominent perfect-kick whoosh+boom
    catch: 'assets/audio/sfx/catch.mp3',       // glove catch pop
    // SFX expansion (dev, 2026-08-05: "way more sound effects")
    bounce: 'assets/audio/sfx/bounce.mp3',     // rubber ball off asphalt
    fence: 'assets/audio/sfx/fence.mp3',       // chain-link rattle
    slide: 'assets/audio/sfx/slide.mp3',       // pavement scrape
    homer: 'assets/audio/sfx/homer.mp3',       // air horn + fireworks
    'crowd-ooh': 'assets/audio/sfx/crowd-ooh.mp3', // collective disappointment
    whoosh: 'assets/audio/sfx/whoosh.mp3',     // hard throw air whip
    swish: 'assets/audio/sfx/swish.mp3',       // leg swinging through air
    squeak: 'assets/audio/sfx/squeak.mp3',     // sneaker cut on pavement
    roll: 'assets/audio/sfx/roll.mp3',         // kickball rolling in on the pitch
  },
};

const pick = (v) => (Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v);

// gameplay sfx → file or synth recipe
const SFX_ALIAS = {
  crush: { file: 'kick', gain: 1.35 },
  kick: { file: 'kick', gain: 1.25 },         // real ball-off-the-foot thump (kicks must be HEARD)
  swing: { file: 'swish', gain: 0.85 },       // the leg cutting air as the kick clip starts
  peg: { file: 'peg', gain: 1.1 },            // real body impact
  fireball: { file: 'fireball', gain: 1.2 },  // PROMINENT perfect-kick whoosh+boom
  bassdrop: { file: 'bassdrop', gain: 1 },
  'crowd-cheer': { file: 'crowd-cheer', gain: 0.9 },
  'crowd-ooh': { file: 'crowd-ooh', gain: 0.9 }, // the block feels YOUR outs
  dodge: { file: 'scratch', gain: 0.7 },
  scratch: { file: 'scratch', gain: 0.9 },
  catchpop: { file: 'catch', gain: 1.0 },     // real glove pop
  catch: { file: 'catch', gain: 1.0 },        // bag-man pop (emitted as 'catch' — was silently unmapped)
  bounce: { file: 'bounce', gain: 0.75 },     // rubber hop off the blacktop
  fence: { file: 'fence', gain: 0.95 },       // ball into the chain-link
  slide: { file: 'slide', gain: 0.9 },        // pavement scrape on slides/tumbles
  homer: { file: 'homer', gain: 1.15 },       // air horn + fireworks on the crown
  pitch: { file: 'roll', gain: 0.85 },        // the rock rolling in (was a synth blip)
  whiff: { file: 'swish', gain: 1.0 },        // real air-cut (was a synth blip)
  throw: { file: 'whoosh', gain: 0.9 },       // real throw whip (was a synth blip)
  juke: { file: 'squeak', gain: 0.8 },        // real sneaker squeak (was a synth blip)
  'cointoss-flick': { synth: { type: 'triangle', from: 900, to: 1400, dur: 0.18, gain: 0.3 } },
};

// Booth discipline: play CALLS may hold the mic for one beat; flavor lines are
// dropped while a line is live (the announcers must never talk over each other).
const VO_CALLS = new Set([
  'playball', 'crowned', 'robbed', 'pegged', 'safe', 'forced', 'strike',
  'doubleplay', 'tripleplay', 'pickle', 'walk', 'gameover', 'gametime',
]);
const VO_QUEUE_FRESH_MS = 4000; // a held call older than this is stale news

export class AudioBus {
  constructor(bus) {
    this.ctx = null;
    this.buffers = new Map();
    this.musicSrc = null;
    this.ambienceSrc = null;
    this.userVol = { master: 1, music: 1, sfx: 1 }; // sound-editor volumes (0..1)
    this.announcer = null;   // pre-rendered ElevenLabs pack manifest
    this.annVoice = null;    // the booth voice chosen for the current match
    this._lastVo = {};       // per-pool memory for non-repeating lines
    this._voLive = false;    // a line is on the mic RIGHT NOW
    this._voHeld = null;     // the one queued play call: { url, at }
    this._voToken = 0;       // guards the end/timeout race per line
    bus.on('sfx', (name) => this.sfx(name));
    bus.on('vo', (e) => this.vo(e));
    // scenes drive the soundtrack through the bus ({ name } to spin, { stop } to kill)
    bus.on('music', (m) => { if (m?.stop) this.stopMusic(); else if (m?.name) this.music(m.name); });
    this._loadAnnouncer();
  }

  /** Decode the common gameplay SFX up front. The first kick/catch of a match
   *  was SILENT on-device: lazy fetch+decode loses the moment it belongs to. */
  warm() {
    for (const name of ['kick', 'peg', 'fireball', 'catch', 'bounce', 'fence', 'slide',
      'homer', 'crowd-ooh', 'whoosh', 'swish', 'squeak', 'roll', 'crowd-cheer', 'bassdrop', 'scratch']) {
      if (FILES.sfx[name]) this.buffer(FILES.sfx[name]);
    }
  }

  async _loadAnnouncer() {
    try {
      const r = await fetch('assets/audio/announcer/manifest.json');
      if (r.ok) { this.announcer = await r.json(); this.pickAnnouncerVoice(); }
    } catch { this.announcer = null; }
  }

  /** Choose a fresh announcer voice for the match (variety game-to-game). */
  pickAnnouncerVoice() {
    const vs = this.announcer?.voices;
    if (vs?.length) this.annVoice = vs[Math.floor(Math.random() * vs.length)];
  }

  _pickNonRepeat(key, pool) {
    const last = this._lastVo[key];
    const choices = pool.length > 1 ? pool.filter((f) => f !== last) : pool;
    const file = choices[Math.floor(Math.random() * choices.length)];
    this._lastVo[key] = file;
    return file;
  }

  /** ONE line on the mic at a time. A play CALL arriving mid-line waits in the
   *  single held slot (newest wins); flavor arriving mid-line is dropped. The
   *  held call plays only while it's still fresh — nobody announces a 10-second-
   *  old strikeout. (dev, 2026-08-05: "the announcers must never talk over each
   *  other") */
  _voEnqueue(url, isCall) {
    if (!this._voLive) return this._playAnnouncer(url);
    if (isCall) this._voHeld = { url, at: performance.now() };
  }

  _voEnded() {
    this._voLive = false;
    const held = this._voHeld;
    this._voHeld = null;
    if (held && performance.now() - held.at <= VO_QUEUE_FRESH_MS) this._playAnnouncer(held.url);
  }

  async _playAnnouncer(url) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this._voLive = true; // claim the mic BEFORE the async decode — racers must queue
    const token = ++this._voToken;
    this.gains.music.gain.cancelScheduledValues(ctx.currentTime);
    this.gains.music.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.12);
    const played = await this.playBuffer(url, 'vo');
    const finish = () => {
      if (token !== this._voToken) return; // a later line owns the mic now
      if (this.ctx) this.gains.music.gain.linearRampToValueAtTime(0.62, this.ctx.currentTime + 0.4);
      this._voEnded();
    };
    if (played) {
      played.src.onended = finish;
      // iOS belt-and-braces: a swallowed onended must never wedge the booth shut
      setTimeout(finish, (played.src.buffer?.duration ?? 4) * 1000 + 500);
    } else finish();
  }

  ensureCtx() {
    if (this.ctxDead) return null; // construction failed before: stay silent, never re-throw
    if (!this.ctx) {
      // iOS Safari can THROW here (context limit, interrupted media session, low
      // memory) and an uncaught throw takes the whole event handler down with it —
      // the game must keep playing without sound instead.
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('[skk] AudioContext unavailable, muting:', e?.message ?? e);
        this.ctxDead = true;
        return null;
      }
      // master → destination; each channel routes level-gain → user-gain → master
      // so ducking can drive the level while the sound editor drives the user gain.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.userVol.master;
      this.master.connect(this.ctx.destination);
      this.gains = {};
      this.userGains = {};
      for (const ch of ['music', 'sfx', 'vo']) {
        const lvl = this.ctx.createGain();
        const usr = this.ctx.createGain();
        usr.gain.value = ch === 'vo' ? 1 : this.userVol[ch];
        lvl.connect(usr);
        usr.connect(this.master);
        this.gains[ch] = lvl;
        this.userGains[ch] = usr;
      }
      this.gains.music.gain.value = 0.65;
      this.gains.sfx.gain.value = 0.9;
      this.gains.vo.gain.value = 1.0;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Sound editor: set a channel's user volume (0..1). ch = 'master' | 'music' | 'sfx'. */
  setVolume(ch, v) {
    v = Math.max(0, Math.min(1, v));
    this.userVol[ch] = v;
    if (!this.ctx) return; // applied on the next ensureCtx()
    if (ch === 'master') this.master.gain.value = v;
    else if (this.userGains?.[ch]) this.userGains[ch].gain.value = v;
  }
  getVolume(ch) { return this.userVol[ch] ?? 1; }

  async buffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    const p = fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => this.ensureCtx()?.decodeAudioData(ab) ?? null)
      .catch(() => null);
    this.buffers.set(url, p);
    return p;
  }

  async playBuffer(url, channel, { loop = false, gain = 1 } = {}) {
    const buf = await this.buffer(url);
    if (!buf) return null;
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.gains[channel]);
    src.start();
    return { src, g };
  }

  async music(name) {
    if (!FILES.music[name]) name = 'beat'; // unknown city / missing track → generic pool
    if (this.currentMusic === name && this.musicSrc) return; // already spinning
    this.ensureCtx();
    this.musicSrc?.src.stop();
    this.currentMusic = name;
    this.musicSrc = await this.playBuffer(pick(FILES.music[name]), 'music', { loop: true });
  }

  stopMusic() {
    this.musicSrc?.src.stop();
    this.musicSrc = null;
    this.currentMusic = null;
  }

  async ambience(on) {
    if (!on) {
      this.ambienceSrc?.src.stop();
      this.ambienceSrc = null;
      return;
    }
    this.ambienceSrc = await this.playBuffer(FILES.sfx['crowd-ambience'], 'sfx', { loop: true, gain: 0.35 });
  }

  sfx(name) {
    const def = SFX_ALIAS[name];
    if (!def) return;
    if (def.file) {
      this.playBuffer(FILES.sfx[def.file], 'sfx', { gain: def.gain });
    } else if (def.synth) {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = def.synth.type;
      o.frequency.setValueAtTime(def.synth.from, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, def.synth.to), ctx.currentTime + def.synth.dur);
      g.gain.setValueAtTime(def.synth.gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + def.synth.dur);
      o.connect(g);
      g.connect(this.gains.sfx);
      o.start();
      o.stop(ctx.currentTime + def.synth.dur + 0.02);
    }
  }

  /**
   * Play an announcer line. @param e a string event name ('playball','robbed',
   * 'foul','gameover',...) OR an object { event, gender:'he'|'she' } for any
   * gendered event (crowned/pegged/safe/strike/forced/pickle/walk — the booth
   * uses the SUBJECT'S pronouns) / { event:'nowkicking', team:'<id>' }.
   */
  vo(e) {
    const a = this.announcer;
    if (!a || !this.annVoice) return;
    const ev = typeof e === 'string' ? e : e?.event;
    if (!ev) return;
    if (ev === 'playball') this.pickAnnouncerVoice(); // new booth voice each match
    let pool = null, key = ev;
    if (ev === 'nowkicking') { pool = a.teams[e.team]; key = 'team_' + e.team; }
    else {
      const g = a.gendered?.[ev];
      const gender = typeof e === 'object' && (e.gender === 'she' || e.gender === 'he') ? e.gender : null;
      const neutral = a.events?.[ev] ?? [];
      if (g && gender) { pool = [...g[gender], ...neutral]; key = `${ev}_${gender}`; }
      // ungendered call on a gendered event: neutral lines only; if none exist,
      // legacy 'he' keeps the event audible (matches the old default)
      else pool = neutral.length ? neutral : g?.he;
    }
    if (!pool?.length) return;
    this._voEnqueue(`assets/audio/announcer/${this.annVoice}/${this._pickNonRepeat(key, pool)}`, VO_CALLS.has(ev));
  }
}
