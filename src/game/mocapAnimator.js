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
    this._mixerFinished = () => {
      if (!this._doneFired) {
        this._doneFired = true;
        const d = this.onDone; this.onDone = null; d?.();
      }
    };
    this.mixer.addEventListener('finished', this._mixerFinished);
    if (this.clips.has('idle')) this.play('idle');
  }

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

  update(dt) {
    // loops track ctx.speedFactor live — matchScene writes it every frame for runs
    if (this._active && this._meta?.loop) {
      this._active.timeScale = this._speed * Math.max(0.35, this.ctx.speedFactor);
    }
    this.mixer.update(dt);
    if (this._active && !this._contactFired && this._meta?.contactAt != null) {
      const clip = this._active.getClip();
      if (this._active.time / clip.duration >= this._meta.contactAt) {
        this._contactFired = true;
        this.onContact?.();
      }
    }
  }
}
