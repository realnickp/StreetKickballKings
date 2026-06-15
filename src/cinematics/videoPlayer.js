// Fullscreen mp4 set-piece player (splash, team intros). Tap to skip.
export function playVideo(url, { muted = false, skippable = true } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;background:#000;z-index:50;display:flex;align-items:center;justify-content:center;';
    const video = document.createElement('video');
    video.src = url;
    video.playsInline = true;
    video.muted = muted;
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
      wrap.remove();
      resolve();
    };
    video.onended = finish;
    video.onerror = finish;
    if (skippable) wrap.addEventListener('pointerdown', finish);
    video.play().catch(() => {
      // autoplay with sound blocked → retry muted
      video.muted = true;
      video.play().catch(finish);
    });
  });
}
