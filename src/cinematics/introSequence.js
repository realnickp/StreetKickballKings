// Hype set-pieces shown between the team intro videos and the coin toss:
//   showVsScreen  — a quick "AWAY  VS  HOME" slam, logos crashing in from the sides
//   showLogoClash — the two team logos collide with fire + lightning + graffiti,
//                   then settle. The last beat before the match begins.
// Both are pure DOM/CSS on purpose: the matchup is 1-of-90 logo pairings, so it
// must be composited live from the two logos — a pre-rendered video can't cover
// every combination (in-engine comic panels stay for in-PLAY moments).
// Each returns a Promise that resolves when the beat ends. Tap to skip.

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

function overlay(cls) {
  const o = document.createElement('div');
  o.className = `intro-fx ${cls}`;
  (document.getElementById('stage') ?? document.body).appendChild(o);
  return o;
}

/** Skippable timed beat: resolves on timeout or tap, whichever comes first. */
function timedBeat(o, dur, resolve) {
  let done = false;
  const finish = () => { if (done) return; done = true; o.remove(); resolve(); };
  o.addEventListener('pointerdown', finish);
  const t = setTimeout(finish, dur);
  o._cancel = () => { clearTimeout(t); finish(); };
}

/**
 * "AWAY  VS  HOME" — two colour wedges slam in from the sides carrying each
 * team's logo + name, a lightning streak rips across, the VS badge punches in.
 */
export function showVsScreen(awayTeam, homeTeam, { dur = 2600 } = {}) {
  injectStyles();
  return new Promise((resolve) => {
    const o = overlay('vs-screen');
    o.innerHTML = `
      <div class="vs-half vs-left" style="--c:${awayTeam.colors.primary};--c2:${awayTeam.colors.secondary}">
        <img class="vs-logo" src="${awayTeam.logo}" alt="" />
        <div class="vs-name">${awayTeam.name}</div>
      </div>
      <div class="vs-half vs-right" style="--c:${homeTeam.colors.primary};--c2:${homeTeam.colors.secondary}">
        <img class="vs-logo" src="${homeTeam.logo}" alt="" />
        <div class="vs-name">${homeTeam.name}</div>
      </div>
      <div class="vs-bolt"></div>
      <div class="vs-badge">VS</div>`;
    timedBeat(o, dur, resolve);
  });
}

/**
 * The logo clash: both crests fly in from opposite sides, collide dead-centre in
 * a fireball with lightning forks and a graffiti spray, the screen kicks, then
 * they settle either side of a VS. The hard cut into the coin toss.
 */
export function showLogoClash(awayTeam, homeTeam, { dur = 3300 } = {}) {
  injectStyles();
  return new Promise((resolve) => {
    const o = overlay('logo-clash');
    o.style.setProperty('--ca', awayTeam.colors.primary);
    o.style.setProperty('--cb', homeTeam.colors.primary);
    o.innerHTML = `
      <div class="clash-graffiti"></div>
      <div class="clash-stage">
        <img class="clash-logo clash-a" src="${awayTeam.logo}" alt="" />
        <img class="clash-logo clash-b" src="${homeTeam.logo}" alt="" />
        <div class="clash-vs">VS</div>
        <div class="clash-burst"></div>
        <div class="clash-bolt clash-bolt1"></div>
        <div class="clash-bolt clash-bolt2"></div>
      </div>
      <div class="clash-flash"></div>
      <div class="clash-tale">
        <span style="--c:${awayTeam.colors.primary}">${awayTeam.name.toUpperCase()}</span>
        <b>THROW DOWN</b>
        <span style="--c:${homeTeam.colors.primary}">${homeTeam.name.toUpperCase()}</span>
      </div>`;
    timedBeat(o, dur, resolve);
  });
}

const CSS = `
.intro-fx{position:absolute;inset:0;z-index:60;overflow:hidden;
  background:radial-gradient(circle at 50% 45%,#1a1320 0%,#070409 75%);
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  font-family:'Anton','Arial Black',sans-serif;-webkit-user-select:none;user-select:none;}

/* ---------------- VS SCREEN ---------------- */
.vs-screen .vs-half{position:absolute;top:0;bottom:0;width:62%;display:flex;
  flex-direction:column;align-items:center;justify-content:center;gap:2vh;
  background:linear-gradient(135deg,var(--c) 0%,color-mix(in srgb,var(--c) 55%,#000) 100%);}
.vs-screen .vs-left{left:0;clip-path:polygon(0 0,100% 0,72% 100%,0 100%);
  animation:vsSlideL .5s cubic-bezier(.2,1.3,.4,1) both;align-items:flex-start;padding-left:8vw;}
.vs-screen .vs-right{right:0;clip-path:polygon(28% 0,100% 0,100% 100%,0 100%);
  animation:vsSlideR .5s cubic-bezier(.2,1.3,.4,1) both;align-items:flex-end;padding-right:8vw;}
.vs-screen .vs-logo{width:min(38vw,230px);filter:drop-shadow(0 6px 18px rgba(0,0,0,.6));
  animation:vsPop .6s .15s both;}
.vs-screen .vs-name{color:#fff;font-size:clamp(20px,6vw,40px);letter-spacing:1px;
  text-shadow:0 3px 0 rgba(0,0,0,.5);max-width:46vw;text-align:center;line-height:.95;
  animation:vsPop .6s .25s both;}
.vs-screen .vs-badge{position:relative;z-index:3;color:#fff;font-size:clamp(60px,22vw,180px);
  -webkit-text-stroke:4px #111;text-shadow:0 0 28px #ff5a2c,0 8px 0 #b3231a;
  transform:rotate(-8deg);animation:vsBadge .5s .35s both;}
.vs-screen .vs-bolt{position:absolute;inset:0;z-index:2;pointer-events:none;
  background:linear-gradient(115deg,transparent 46%,#fff 49%,#9fe9ff 50%,transparent 53%);
  mix-blend-mode:screen;opacity:0;animation:vsBolt .7s .3s 2;}
@keyframes vsSlideL{from{transform:translateX(-105%)}to{transform:translateX(0)}}
@keyframes vsSlideR{from{transform:translateX(105%)}to{transform:translateX(0)}}
@keyframes vsPop{from{opacity:0;transform:translateY(14px) scale(.9)}to{opacity:1;transform:none}}
@keyframes vsBadge{0%{opacity:0;transform:rotate(-8deg) scale(2.6)}
  60%{opacity:1;transform:rotate(-8deg) scale(.86)}100%{transform:rotate(-8deg) scale(1)}}
@keyframes vsBolt{0%,100%{opacity:0}10%{opacity:.9}20%{opacity:0}}

/* ---------------- LOGO CLASH ---------------- */
.logo-clash{animation:clashShake .5s .52s both;}
.logo-clash .clash-graffiti{position:absolute;inset:-10%;opacity:.5;mix-blend-mode:screen;
  background:
    radial-gradient(circle at 22% 30%,color-mix(in srgb,var(--ca) 70%,transparent) 0,transparent 12%),
    radial-gradient(circle at 80% 24%,color-mix(in srgb,var(--cb) 70%,transparent) 0,transparent 12%),
    repeating-linear-gradient(60deg,transparent 0 26px,rgba(255,255,255,.04) 26px 28px);
  animation:clashGraf 3.3s linear both;}
.logo-clash .clash-stage{position:relative;width:100%;height:46vh;display:flex;
  align-items:center;justify-content:center;}
.logo-clash .clash-logo{position:absolute;width:min(46vw,250px);
  filter:drop-shadow(0 0 24px rgba(0,0,0,.7));}
.logo-clash .clash-a{animation:clashInL 3.3s cubic-bezier(.5,0,.5,1) both;}
.logo-clash .clash-b{animation:clashInR 3.3s cubic-bezier(.5,0,.5,1) both;}
.logo-clash .clash-vs{position:relative;z-index:4;color:#fff;font-size:clamp(40px,14vw,120px);
  -webkit-text-stroke:4px #111;text-shadow:0 0 26px #ff5a2c;transform:rotate(-7deg) scale(0);
  animation:clashVs .5s 2.1s both;}
.logo-clash .clash-burst{position:absolute;left:50%;top:50%;width:8vw;height:8vw;
  transform:translate(-50%,-50%) scale(0);border-radius:50%;z-index:3;
  background:radial-gradient(circle,#fff 0,#ffe66b 18%,#ff9a2c 38%,#ff3b1f 58%,transparent 72%);
  animation:clashBurst 1s .5s both;}
.logo-clash .clash-bolt{position:absolute;left:50%;top:50%;width:60vw;height:5px;z-index:3;
  background:linear-gradient(90deg,transparent,#cfefff,#fff,#cfefff,transparent);
  transform-origin:center;opacity:0;}
.logo-clash .clash-bolt1{animation:clashBolt .6s .5s both;transform:translate(-50%,-50%) rotate(24deg);}
.logo-clash .clash-bolt2{animation:clashBolt .6s .58s both;transform:translate(-50%,-50%) rotate(-31deg);}
.logo-clash .clash-flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:5;
  pointer-events:none;animation:clashFlash 1s .5s both;}
.logo-clash .clash-tale{position:absolute;bottom:11vh;left:0;right:0;display:flex;
  align-items:center;justify-content:center;gap:3vw;opacity:0;animation:vsPop .5s 2.3s both;}
.logo-clash .clash-tale span{color:var(--c);font-size:clamp(15px,4.4vw,30px);
  -webkit-text-stroke:1px rgba(0,0,0,.6);letter-spacing:1px;max-width:32vw;text-align:center;line-height:.95;}
.logo-clash .clash-tale b{color:#fff;font-size:clamp(13px,3.6vw,24px);letter-spacing:3px;opacity:.8;}
@keyframes clashInL{0%{left:-40%;transform:rotate(-30deg) scale(.7)}
  55%{left:50%;margin-left:-9vw;transform:translateX(-50%) rotate(0) scale(1.18)}
  70%{margin-left:-13vw;transform:translateX(-50%) rotate(0) scale(1)}
  100%{left:50%;margin-left:-30vw;transform:translateX(-50%) rotate(-4deg) scale(.9)}}
@keyframes clashInR{0%{left:140%;transform:rotate(30deg) scale(.7)}
  55%{left:50%;margin-left:9vw;transform:translateX(-50%) rotate(0) scale(1.18)}
  70%{margin-left:13vw;transform:translateX(-50%) rotate(0) scale(1)}
  100%{left:50%;margin-left:30vw;transform:translateX(-50%) rotate(4deg) scale(.9)}}
@keyframes clashBurst{0%{transform:translate(-50%,-50%) scale(0);opacity:1}
  55%{transform:translate(-50%,-50%) scale(7);opacity:1}100%{transform:translate(-50%,-50%) scale(11);opacity:0}}
@keyframes clashBolt{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
@keyframes clashFlash{0%{opacity:0}12%{opacity:.95}40%{opacity:0}100%{opacity:0}}
@keyframes clashVs{0%{transform:rotate(-7deg) scale(2.8);opacity:0}
  60%{transform:rotate(-7deg) scale(.85);opacity:1}100%{transform:rotate(-7deg) scale(1)}}
@keyframes clashGraf{from{opacity:0}30%{opacity:.5}to{opacity:.5}}
@keyframes clashShake{0%,100%{transform:translate(0,0)}15%{transform:translate(-12px,8px)}
  30%{transform:translate(10px,-9px)}45%{transform:translate(-8px,-6px)}
  60%{transform:translate(7px,7px)}80%{transform:translate(-4px,3px)}}
`;
