// Fullscreen mp4 set-piece player (splash, team intros). Tap to skip.
import { isMuted } from '../engine/audio.js';

export function playVideo(url, { muted = false, skippable = true } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'video-cover'; // read by the render gate (renderGate.js): the canvas is covered while a clip plays
    wrap.style.cssText = 'position:absolute;inset:0;background:#000;z-index:50;display:flex;align-items:center;justify-content:center;';
    const video = document.createElement('video');
    video.src = url;
    video.playsInline = true;
    video.muted = muted || isMuted(); // ?mute: the team-intro set pieces stay silent too
    video.autoplay = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    const skip = document.createElement('div');
    skip.className = 'skip-hint';
    skip.textContent = 'TAP TO SKIP ▸';
    wrap.append(video, skip);
    (document.getElementById('stage') ?? document.body).appendChild(wrap);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // a removed <video> is still an AVPlayer until it is unloaded: a skipped
      // clip kept downloading and decoding behind the next screen (iOS counts
      // every live media element against the tab)
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* fine */ }
      wrap.remove();
      resolve();
    };
    video.onended = finish;
    video.onerror = finish;
    if (skippable) wrap.addEventListener('pointerdown', finish);
    video.play().catch((e) => {
      // autoplay with sound blocked → retry muted, and SAY SO: a silently
      // muted set piece reads as "the audio broke" on a phone
      console.warn('[skk] video autoplay with sound refused, retrying muted:', url, e?.name ?? e);
      video.muted = true;
      video.play().catch(finish);
    });
  });
}
