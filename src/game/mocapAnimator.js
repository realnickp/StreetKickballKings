// src/game/mocapAnimator.js — real mocap playback via THREE.AnimationMixer.
// Drop-in surface match for GlbCodeAnimator: play(name,{onContact,onDone,
// speedFactor,speed}), update(dt), ctx.speedFactor, name. Crossfade blending
// between states; loops follow ctx.speedFactor live (run cycle); one-shots
// fire onContact at the manifest-marked frame and onDone at the end.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from '../data/anims.manifest.json';

const FADE_S = 0.15;
const META = new Map(manifest.map((m) => [m.name, m]));

const clipsPromises = new Map();
/** Fetch + cache an animation set. Each archetype has its OWN bake (each Meshy
 *  rig has a different rest pose — a shared bake distorts the other rigs). */
export function loadMocapClips(url = '/assets/anims/mocap-locs.glb') {
  if (!clipsPromises.has(url)) {
    clipsPromises.set(url, new GLTFLoader().loadAsync(url)
      .then((g) => g.animations)
      .catch((e) => { clipsPromises.delete(url); throw e; }));
  }
  return clipsPromises.get(url);
}

// per-clip hip floor (fraction of rest hip height). stumble is a real fall
// that must stay ON the pavement; everything else keeps the low guard so
// legitimate low poses (dive/slide) survive.
const FLOOR_FRAC = { stumble: 0.5 };
const floorFrac = (name) => FLOOR_FRAC[name] ?? 0.15;

export class MocapAnimator {
  /** @param {THREE.Object3D} root character root containing the bone hierarchy
   *  @param {THREE.AnimationClip[]} clips retargeted clips named per the manifest */
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = new Map(clips.map((c) => [c.name, c]));
    this.ctx = { speedFactor: 1 };
    this.name = 'idle';
    this._active = null;
    this._meta = null;
    this._speed = 1;
    this.onContact = null; this.onDone = null;
    this._contactFired = false; this._doneFired = false;
    this._mixerFinished = (e) => {
      // one-shots keep playing while they crossfade OUT — their finish must
      // not count as the CURRENT clip completing (slide finishing mid-fade
      // was firing soccerSpin's onDone a few frames in)
      if (e.action !== this._active) return;
      if (!this._doneFired) {
        this._doneFired = true;
        const d = this.onDone; this.onDone = null; d?.();
      }
    };
    this.mixer.addEventListener('finished', this._mixerFinished);
    // hip FLOOR guard: some baked one-shots (stumble) drive the hips all the
    // way to local 0 = pelvis at ground = legs through the pavement ("players
    // sinking into the floor", dev). Clamp animated hips to lying-on-the-
    // ground height; dive's pavement pose (~0.17 of rest) stays untouched.
    this._hips = null;
    root.traverse((o) => { if (!this._hips && o.isBone && /hips/i.test(o.name)) this._hips = o; });
    this._hipRestY = this._hips ? Math.abs(this._hips.position.y) : 0;
    this._prevFloorName = null; this._prevFloorS = 0;
    if (this.clips.has('idle')) this.play('idle');
  }

  /** Merge lazily-loaded extras clips (mocap-<pack>-<arch>.glb — x = dances /
   *  special kicks, k = kicks / taunts) into this animator.
   *  Existing names win — extras never shadow the shipped base set. */
  addClips(clips) {
    for (const c of clips) if (!this.clips.has(c.name)) this.clips.set(c.name, c);
  }

  hasClip(name) { return this.clips.has(name); }

  play(name, { onContact = null, onDone = null, speedFactor = 1, speed = 1 } = {}) {
    if (!this.clips.has(name)) name = 'idle';
    const clip = this.clips.get(name);
    if (!clip) return;
    const meta = META.get(name) ?? { loop: true };
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.setLoop(meta.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true; // hold the final pose until the next play()
    const base = (meta.rate ?? 1) * speed;
    action.timeScale = meta.loop ? base * Math.max(0.35, speedFactor) : base;
    if (this._active && this._active !== action) {
      this._active.crossFadeTo(action, FADE_S, false);
      // the outgoing clip still has weight during the fade — keep its (possibly
      // higher) hip floor active so a stumble recovery doesn't re-sink briefly
      this._prevFloorName = this.name; this._prevFloorS = FADE_S;
    }
    action.play();
    this._active = action;
    this._meta = meta;
    this._speed = base;
    this.name = name;
    this.ctx.speedFactor = speedFactor;
    this.onContact = onContact; this.onDone = onDone;
    this._contactFired = false; this._doneFired = false;
  }

  /** Game-time seconds from play(name) until the clip's contact mark fires.
   *  Lets the scene sync world events (ball launch) to the animation. */
  contactDelayS(name) {
    const clip = this.clips.get(name);
    const meta = META.get(name);
    if (!clip || meta?.contactAt == null) return 0;
    return (clip.duration * meta.contactAt) / ((meta.rate ?? 1));
  }

  update(dt) {
    // loops track ctx.speedFactor live — matchScene writes it every frame for runs
    if (this._active && this._meta?.loop) {
      this._active.timeScale = this._speed * Math.max(0.35, this.ctx.speedFactor);
    }
    this.mixer.update(dt);
    // Hip floor: stumble gets a HIGHER floor for the WHOLE clip — at 0.15×rest
    // the sprawled legs clip under the court and the downed player reads as
    // "into the ground halfway" (dev, repeatedly). Half rest height is a real
    // fall that stays ON the pavement; dive/slide keep the low floor — their
    // flat pavement poses are legitimate. While a higher-floored clip is still
    // fading out, its floor stays in force (no dip mid-crossfade).
    let frac = floorFrac(this.name);
    if (this._prevFloorS > 0) {
      this._prevFloorS -= dt;
      frac = Math.max(frac, floorFrac(this._prevFloorName));
    }
    const minY = this._hipRestY * frac;
    if (this._hips && this._hips.position.y < minY) this._hips.position.y = minY;
    if (this._active && !this._contactFired && this._meta?.contactAt != null) {
      const clip = this._active.getClip();
      if (this._active.time / clip.duration >= this._meta.contactAt) {
        this._contactFired = true;
        this.onContact?.();
      }
    }
  }
}
