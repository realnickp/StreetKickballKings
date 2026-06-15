// AudioBus: WebAudio with music/sfx/vo channels, VO ducking, and tiny
// synthesized blips for utility sounds. Subscribes to 'sfx'/'vo' bus events.
// Array values = pools; one is picked at random per play so lines/beats vary.
const FILES = {
  music: {
    theme: 'assets/audio/theme-red-rubber-felony.mp3',
    beat: ['assets/audio/music/in-match-beat-1.m4a', 'assets/audio/music/in-match-beat-2.m4a'],
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
  },
};

const pick = (v) => (Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v);

// gameplay sfx → file or synth recipe
const SFX_ALIAS = {
  crush: { file: 'kick', gain: 1.1 },
  kick: { file: 'kick', gain: 1.0 },          // real ball-off-the-foot thump
  peg: { file: 'peg', gain: 1.1 },            // real body impact
  fireball: { file: 'fireball', gain: 1.2 },  // PROMINENT perfect-kick whoosh+boom
  bassdrop: { file: 'bassdrop', gain: 1 },
  'crowd-cheer': { file: 'crowd-cheer', gain: 0.9 },
  dodge: { file: 'scratch', gain: 0.7 },
  scratch: { file: 'scratch', gain: 0.9 },
  catchpop: { file: 'catch', gain: 1.0 },     // real glove pop
  pitch: { synth: { type: 'sine', from: 220, to: 160, dur: 0.12, gain: 0.25 } },
  whiff: { synth: { type: 'sawtooth', from: 200, to: 60, dur: 0.25, gain: 0.3 } },
  throw: { synth: { type: 'sine', from: 500, to: 700, dur: 0.1, gain: 0.2 } },
  juke: { synth: { type: 'square', from: 700, to: 900, dur: 0.07, gain: 0.15 } },
  'cointoss-flick': { synth: { type: 'triangle', from: 900, to: 1400, dur: 0.18, gain: 0.3 } },
};

export class AudioBus {
  constructor(bus) {
    this.ctx = null;
    this.buffers = new Map();
    this.musicSrc = null;
    this.ambienceSrc = null;
    this.announcer = null;   // pre-rendered ElevenLabs pack manifest
    this.annVoice = null;    // the booth voice chosen for the current match
    this._lastVo = {};       // per-pool memory for non-repeating lines
    bus.on('sfx', (name) => this.sfx(name));
    bus.on('vo', (e) => this.vo(e));
    this._loadAnnouncer();
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

  async _playAnnouncer(url) {
    const ctx = this.ensureCtx();
    this.gains.music.gain.cancelScheduledValues(ctx.currentTime);
    this.gains.music.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.12);
    const played = await this.playBuffer(url, 'vo');
    const restore = () => { if (this.ctx) this.gains.music.gain.linearRampToValueAtTime(0.62, this.ctx.currentTime + 0.4); };
    if (played) played.src.onended = restore; else restore();
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gains = {};
      for (const ch of ['music', 'sfx', 'vo']) {
        const g = this.ctx.createGain();
        g.connect(this.ctx.destination);
        this.gains[ch] = g;
      }
      this.gains.music.gain.value = 0.65;
      this.gains.sfx.gain.value = 0.9;
      this.gains.vo.gain.value = 1.0;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async buffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    const p = fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => this.ensureCtx().decodeAudioData(ab))
      .catch(() => null);
    this.buffers.set(url, p);
    return p;
  }

  async playBuffer(url, channel, { loop = false, gain = 1 } = {}) {
    const buf = await this.buffer(url);
    if (!buf) return null;
    const ctx = this.ensureCtx();
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
   * 'pegged','forced','safe','strike','foul','pickle','gameover') OR an object
   * { event:'crowned', gender:'he'|'she' } / { event:'nowkicking', team:'<id>' }.
   */
  vo(e) {
    const a = this.announcer;
    if (!a || !this.annVoice) return;
    if (e === 'playball') this.pickAnnouncerVoice(); // new booth voice each match
    let pool = null, key = '';
    if (typeof e === 'string') { pool = a.events[e]; key = e; }
    else if (e?.event === 'crowned') { pool = a.crowned[e.gender === 'she' ? 'she' : 'he']; key = 'crowned'; }
    else if (e?.event === 'nowkicking') { pool = a.teams[e.team]; key = 'team_' + e.team; }
    else if (e?.event) { pool = a.events[e.event]; key = e.event; }
    if (!pool?.length) return;
    this._playAnnouncer(`assets/audio/announcer/${this.annVoice}/${this._pickNonRepeat(key, pool)}`);
  }
}
