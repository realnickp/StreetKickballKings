// THE PHONE OVER THE STREET (story spec §5, dev-approved mockup 2026-10-20):
// a full-screen Higgsfield still drifting behind a phone that swings up, texts
// landing one at a time with typing dots and a ping, the thread flipping from
// the group chat to a rival's DM, an end slam. A hip hop bed underneath.
//
// Tap = the next text NOW. SKIP ▸ = everything on screen at once. When it's
// all there, one more tap moves on. No video, ever — just a still and a phone.
import { fillText } from '../../meta/storyText.js';

const TYPING_MS = 700;
const PER_CHAR_MS = 55;
const MAX_WAIT_MS = 2200;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const stillUrl = (still) => (still ? `assets/story/${still}.jpg` : '');

/** Play one scene into `root`. Resolves when the player taps past the end. */
export function playStoryScene(root, scene, { audio = null, bus = null, vars = {} } = {}) {
  return new Promise((resolve) => {
    const s = el(`
      <div class="screen story-scene">
        <div class="ss-bg"></div><div class="ss-vig"></div>
        <div class="ss-title"><b></b><small></small></div>
        <div class="ss-phone">
          <div class="ss-notch"></div>
          <div class="ss-hd"><i class="ss-av"></i><span class="ss-nm"></span></div>
          <div class="ss-msgs"><div class="ss-typing"><i></i><i></i><i></i></div></div>
        </div>
        <div class="ss-slam"></div>
        <button class="ss-skip">SKIP ▸</button>
        <div class="ss-next">TAP TO CONTINUE ▸</div>
      </div>`);
    root.appendChild(s);
    const $ = (q) => s.querySelector(q);
    const msgs = $('.ss-msgs');
    const typing = $('.ss-typing');
    const still = stillUrl(scene.still);
    if (still) $('.ss-bg').style.backgroundImage = `url(${still})`;
    if (scene.title) {
      $('.ss-title b').textContent = fillText(scene.title.top, vars);
      $('.ss-title small').textContent = fillText(scene.title.sub ?? '', vars);
      s.classList.add('has-title');
    }
    if (audio && scene.music !== null) audio.music(scene.music ?? 'beat');

    // one cancellable wait at a time: a tap cuts it short
    let cut = null;
    let skipping = false;
    let done = false;
    const wait = (ms) => new Promise((r) => {
      const t = setTimeout(() => { cut = null; r(); }, skipping ? 0 : ms);
      cut = () => { clearTimeout(t); cut = null; r(); };
    });

    const setThread = (th) => {
      msgs.querySelectorAll('.ss-b,.ss-who').forEach((n) => n.remove());
      s.dataset.kind = th.kind;
      $('.ss-nm').textContent = fillText(th.name, vars);
      const av = fillText(th.avatar ?? '', vars);
      $('.ss-av').style.backgroundImage = av && !av.includes('{') ? `url(${av})` : '';
    };
    let lastWho = null;
    const addMsg = (th, m) => {
      const me = !!m.me || m.from === 'me';
      const who = me ? null : fillText(m.from ?? '', vars);
      if (th.kind === 'group' && who && who !== lastWho) {
        msgs.insertBefore(el(`<div class="ss-who"></div>`), typing).textContent = who;
      }
      lastWho = who;
      const b = el(`<div class="ss-b ${me ? 'me' : 'them'}${th.kind === 'dm' && !me ? ' rival' : ''}"></div>`);
      b.textContent = fillText(m.text, vars);
      msgs.insertBefore(b, typing);
      requestAnimationFrame(() => b.classList.add('show'));
      if (!skipping) bus?.emit('sfx', 'crown-tick');
    };

    const finish = () => {
      if (done) return;
      done = true;
      s.classList.add('ended');
    };

    s.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ss-skip')) {
        skipping = true;
        cut?.();
        return;
      }
      if (done) {
        s.remove();
        resolve();
        return;
      }
      cut?.();
    });

    (async () => {
      await wait(500);
      $('.ss-phone').classList.add('in');
      await wait(900);
      for (const [ti, th] of (scene.threads ?? []).entries()) {
        if (ti > 0) { await wait(700); }
        setThread(th);
        lastWho = null;
        for (const m of th.messages ?? []) {
          const me = !!m.me || m.from === 'me';
          if (!me && !skipping) { typing.classList.add('on'); msgs.appendChild(typing); }
          await wait(me ? 500 : TYPING_MS);
          typing.classList.remove('on');
          addMsg(th, m);
          await wait(Math.min(MAX_WAIT_MS, 500 + String(m.text).length * PER_CHAR_MS));
        }
      }
      if (scene.slam) {
        await wait(400);
        $('.ss-slam').textContent = fillText(scene.slam, vars);
        $('.ss-slam').classList.add('on');
        bus?.emit('sfx', 'bassdrop');
      }
      finish();
    })();
  });
}

/** Play several scenes back to back (skipping missing ids). */
export async function playStoryScenes(root, ids, scenes, opts) {
  for (const id of ids) {
    const sc = scenes[id];
    if (sc) await playStoryScene(root, sc, typeof opts === 'function' ? opts(id) : opts);
  }
}
