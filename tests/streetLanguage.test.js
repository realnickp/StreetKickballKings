// Street language audit (spec: docs/superpowers/specs/2026-08-28-homers-and-language-design.md
// §2, dev verbatim: "ditch the baseball language... glove up and shit like that").
//
// Greps every user-facing string source for banned baseball words. Kickball
// KEEPS: strike, ball, foul, inning, pitch/pitcher, base, steal, pickle,
// home run/HR/homer, catch, out, plate, kicker. Banned on screen and in the
// booth: glove, batter, at-bat/at bat, slugger, RBI, dugout, bat (the
// object), "hit" as a noun/verb for a kick, hitter, bullpen, on deck,
// walk-off, no-hitter.
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const BANNED_WORDS = [
  'glove', 'batter', 'at-bat', 'at bat', 'slugger', 'rbi', 'dugout', 'bat',
  'hit', 'hitter', 'bullpen', 'on deck', 'walk-off', 'no-hitter',
  'glv', // the old on-screen glove-stat abbreviation (spec: GLV -> HND)
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const BANNED_RES = BANNED_WORDS.map((w) => ({ word: w, re: new RegExp(`\\b${escapeRe(w)}\\b`, 'i') }));

// (There is deliberately NO "allowed phrase" pre-strip here. The kept phrases
// — "home run", "hr" — contain no banned word, so stripping them could never
// clear a hit; all it could do is SPLICE two halves of an innocent word into a
// banned one, e.g. "bathrobe" -> "bat robe" -> a false "bat". It was removed
// 2026-08-28 for exactly that reason.)

// Exact-match exceptions for internal (never displayed) identifiers that
// legitimately still spell a banned word, per spec — scoped BY FILE, not
// global. The `glove` stat DATA KEY stays unchanged (only its on-screen label
// became HANDS/HND), and it is a key in exactly one place: `avg('glove')` in
// screens.js. The `walkout-glove` VO pool id also stays unchanged (only its
// spoken text changed): the EVENTS object key in gen-announcer.mjs. Scoping
// matters — a GLOBAL allowance for `'glove'` would also excuse a literal
// `hud.stamp('GLOVE')` in matchScene, which is the exact thing this audit
// exists to catch. Anything not listed here is audited everywhere.
const ALLOWED_LITERALS_BY_FILE = {
  'src/ui/screens/screens.js': new Set(['glove']),
  'scripts/gen-announcer.mjs': new Set(['walkout-glove']),
};
const NO_ALLOWANCE = new Set();

// Hand-rolled scanner (not a blind regex): JS template literals can nest
// arbitrarily (`${ `${x}` }`) and can contain comments/strings inside their
// ${...} expressions, and comments/strings can themselves contain characters
// ('the player's', 'https://...') that would desync a naive quote-matching
// regex. This walks the source once, tracking real lexical state, so a
// comment never gets mistaken for a string and a nested template never gets
// truncated at its own inner backtick.
function scanSingleQuoted(src, i, quote) {
  const n = src.length;
  let j = i + 1;
  let content = '';
  while (j < n && src[j] !== quote) {
    if (src[j] === '\\') { content += src.slice(j, j + 2); j += 2; continue; }
    content += src[j]; j++;
  }
  return { content, endIndex: j + 1 };
}

function scanTemplate(src, start) {
  const n = src.length;
  let i = start + 1;
  const chunks = [];
  let cur = '';
  while (i < n) {
    const c = src[i];
    if (c === '\\') { cur += src.slice(i, i + 2); i += 2; continue; }
    if (c === '`') { chunks.push(cur); return { chunks, endIndex: i + 1 }; }
    if (c === '$' && src[i + 1] === '{') {
      chunks.push(cur); cur = '';
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        const ch = src[i];
        const ch2 = src[i + 1];
        if (ch === '/' && ch2 === '/') { i += 2; while (i < n && src[i] !== '\n') i++; continue; }
        if (ch === '/' && ch2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        if (ch === '{') { depth++; i++; continue; }
        if (ch === '}') { depth--; i++; continue; }
        if (ch === "'" || ch === '"') { const r = scanSingleQuoted(src, i, ch); i = r.endIndex; continue; }
        if (ch === '`') { const r = scanTemplate(src, i); i = r.endIndex; continue; }
        i++;
      }
      continue;
    }
    cur += c; i++;
  }
  chunks.push(cur);
  return { chunks, endIndex: i };
}

function literalsFrom(src, allowed = NO_ALLOWANCE) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') { i += 2; while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"') {
      const r = scanSingleQuoted(src, i, c);
      if (!allowed.has(r.content.toLowerCase())) out.push(r.content);
      i = r.endIndex;
      continue;
    }
    if (c === '`') {
      const r = scanTemplate(src, i);
      for (const chunk of r.chunks) if (!allowed.has(chunk.toLowerCase())) out.push(chunk);
      i = r.endIndex;
      continue;
    }
    i++;
  }
  return out;
}

// matchScene.js is a huge, mostly-internal file (comments, event-bus keys,
// stat variable reads). Per the round's scope, only its actual on-screen
// stamps/calls/hints are audited — not every string literal in the file
// (e.g. crownFeed('hit') and `char.data.stats.glove` are internal, not
// displayed). Extract only the argument list of each HUD display call.
// EVERY method that puts words on the screen (widened 2026-08-28: the list
// carried `showCall` — 2 sites — but not `call`, the workhorse with 44 sites,
// so the biggest source of on-screen prose in the game was never audited).
const HUD_CALL_METHODS = [
  'stamp', 'hint', 'call', 'showCall', 'goalPop', 'callout', 'showGo', 'showDuel',
  'gearToast', 'showSpecial', 'elementIntro', 'heatFloat', 'pitchGrade', 'fireBadge', 'showReverse',
];
const HUD_CALL_RE = new RegExp(`\\.(?:${HUD_CALL_METHODS.join('|')})\\(`, 'g');

function matchSceneDisplayLiterals(src) {
  const out = [];
  let m;
  HUD_CALL_RE.lastIndex = 0;
  while ((m = HUD_CALL_RE.exec(src))) {
    const start = m.index + m[0].length;
    const window = src.slice(start, start + 600);
    const close = /\)\s*;/.exec(window);
    const argsText = close ? window.slice(0, close.index) : window;
    out.push(...literalsFrom(argsText));
  }
  return out;
}

function auditText(text, label, hits) {
  for (const { word, re } of BANNED_RES) {
    if (re.test(text)) hits.push(`${label}: banned "${word}" in ${JSON.stringify(text)}`);
  }
}

function auditGenericJsFile(relPath, hits) {
  const url = new URL(`../${relPath}`, import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  const allowed = ALLOWED_LITERALS_BY_FILE[relPath] ?? NO_ALLOWANCE;
  for (const lit of literalsFrom(src, allowed)) auditText(lit, relPath, hits);
}

function auditMatchScene(relPath, hits) {
  const url = new URL(`../${relPath}`, import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  for (const lit of matchSceneDisplayLiterals(src)) auditText(lit, `${relPath} (hud call)`, hits);
}

// teams.json "copy" fields — the parts a player actually reads. Skips ids,
// asset paths, hex colors, etc.
const TEAMS_COPY_KEYS = ['name', 'city', 'musicGenre', 'label', 'nick', 'pos'];

function walkCopyFields(node, keys, label, hits) {
  if (Array.isArray(node)) {
    for (const v of node) walkCopyFields(v, keys, label, hits);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && keys.includes(k)) auditText(v, `${label} [${k}]`, hits);
      else walkCopyFields(v, keys, label, hits);
    }
  }
}

function auditTeamsJson(relPath, hits) {
  const url = new URL(`../${relPath}`, import.meta.url);
  const data = JSON.parse(fs.readFileSync(url, 'utf8'));
  walkCopyFields(data, TEAMS_COPY_KEYS, relPath, hits);
}

// manifest.json holds only filenames (e.g. "walkout-glove_1.mp3") and voice
// ids — no prose — but audit every string VALUE anyway (never its object
// keys, which are internal VO pool ids kept unchanged per spec).
function walkValues(node, label, hits) {
  if (Array.isArray(node)) {
    for (const v of node) walkValues(v, label, hits);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) walkValues(v, label, hits);
  } else if (typeof node === 'string') {
    auditText(node, label, hits);
  }
}

function auditManifestJson(relPath, hits) {
  const url = new URL(`../${relPath}`, import.meta.url);
  const data = JSON.parse(fs.readFileSync(url, 'utf8'));
  walkValues(data, relPath, hits);
}

const UI_JS_FILES = [
  'src/ui/lockerModel.js',
  'src/ui/lockerPreview.js',
  'src/ui/router.js',
  'src/ui/runnerArrows.js',
  'src/ui/screens/hud.js',
  'src/ui/screens/lockerScreen.js',
  'src/ui/screens/screens.js',
  'src/ui/screens/tutorial.js',
];

const CINEMATICS_JS_FILES = [
  'src/cinematics/director.js',
  'src/cinematics/fx.js',
  'src/cinematics/introSequence.js',
  'src/cinematics/replay.js',
  'src/cinematics/videoPlayer.js',
];

const OTHER_JS_FILES = [
  'src/game/tutorialDirector.js',
  'src/meta/unlocks.js',
  'scripts/gen-announcer.mjs',
];

describe('street language audit', () => {
  const hits = [];
  for (const f of UI_JS_FILES) it(`no banned baseball words in ${f}`, () => {
    const local = [];
    auditGenericJsFile(f, local);
    hits.push(...local);
    expect(local, local.join('\n')).toEqual([]);
  });
  for (const f of CINEMATICS_JS_FILES) it(`no banned baseball words in ${f}`, () => {
    const local = [];
    auditGenericJsFile(f, local);
    hits.push(...local);
    expect(local, local.join('\n')).toEqual([]);
  });
  for (const f of OTHER_JS_FILES) it(`no banned baseball words in ${f}`, () => {
    const local = [];
    auditGenericJsFile(f, local);
    hits.push(...local);
    expect(local, local.join('\n')).toEqual([]);
  });
  it('no banned baseball words in matchScene.js HUD stamps/calls/hints', () => {
    const local = [];
    auditMatchScene('src/game/matchScene.js', local);
    hits.push(...local);
    expect(local, local.join('\n')).toEqual([]);
  });
  it('no banned baseball words in teams.json copy (name/city/musicGenre/label/nick/pos)', () => {
    const local = [];
    auditTeamsJson('src/data/teams.json', local);
    hits.push(...local);
    expect(local, local.join('\n')).toEqual([]);
  });
  it('no banned baseball words in the announcer manifest', () => {
    const local = [];
    auditManifestJson('public/assets/audio/announcer/manifest.json', local);
    hits.push(...local);
    expect(local, local.join('\n')).toEqual([]);
  });
});
