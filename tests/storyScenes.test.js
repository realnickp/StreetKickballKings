// Story scene scripts — validates every file under src/data/story/scenes/
// against the writers' brief (docs/superpowers/story-script-brief.md).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SCENE_DIR = path.join(ROOT, 'src/data/story/scenes');
const STILL_DIR = path.join(ROOT, 'public/assets/story');
const regionsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/story/regions.json'), 'utf8'));
const REGIONS = regionsData.regions;

const files = fs.existsSync(SCENE_DIR)
  ? fs.readdirSync(SCENE_DIR).filter((f) => f.endsWith('.json')).sort()
  : [];
const loaded = files.map((file) => ({
  file,
  data: JSON.parse(fs.readFileSync(path.join(SCENE_DIR, file), 'utf8')),
}));

// ── The brief's vocabularies ────────────────────────────────────────────────
const ALLOWED_STILLS = new Set([
  'prologue-block',
  ...REGIONS.flatMap((r) => ['open', 'turf', 'bracket', 'champ'].map((k) => `${r.id}-${k}`)),
  'nationals-open', 'nationals-crown', 'ending-king', 'loss-night', 'recruit-handshake',
]);
const ALLOWED_MUSIC = new Set([
  'beat', 'theme',
  'city-baltimore', 'city-new-york', 'city-brooklyn', 'city-philadelphia', 'city-akron',
  'city-washington-dc', 'city-chicago', 'city-phoenix', 'city-memphis', 'city-los-angeles',
]);
const PLACEHOLDERS = new Set(['crew', 'captain', 'rival', 'recruit', 'city', 'rivalLogo', 'crewLogo']);
const GROUP_VOICES = new Set(['Dre', 'Keys', 'Tasha', 'Pops', 'me']);
const DM_VOICES = new Set([...GROUP_VOICES, '{captain}', '{recruit}']);
// A literal organizer / named rival player, dm threads only: a plain name, no braces.
const LITERAL_NAME = /^[A-Z][A-Za-z0-9 .'-]{1,30}$/;
const BANNED = [
  'fuck', 'fucking', 'shit', 'bitch', 'ass', 'asshole', 'bastard', 'dick', 'piss', 'crap', 'slut', 'whore',
  'weed', 'crack', 'coke', 'cocaine', 'dope', 'molly', 'blunt', 'pills', 'stoned', 'drunk',
  'gang', 'gangs', 'crip', 'crips', 'bloods', 'thug', 'gun', 'guns', 'glock', 'shooter', 'opps',
];
const BANNED_RE = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'i');

const len = (s) => Array.from(s).length;
const placeholdersIn = (s) => [...String(s).matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);

const allScenes = loaded.flatMap(({ file, data }) =>
  Object.entries(data.scenes ?? {}).map(([key, scene]) => ({ file, key, scene })));

function requiredFor(file) {
  const base = file.replace(/\.json$/, '');
  if (base === 'prologue') return ['prologue'];
  if (base === 'nationals') {
    const finalists = REGIONS.map((r) => r.ladder[r.ladder.length - 1]);
    return ['nationals-open', 'ending', ...finalists.flatMap((t) => ['before', 'win', 'loss'].map((k) => `nationals-${t}-${k}`))];
  }
  const region = REGIONS.find((r) => r.id === base);
  if (!region) return null;
  const R = region.id;
  return [
    `${R}-open`, `${R}-bracket`, `${R}-champ`,
    ...region.ladder.flatMap((t) => ['before', 'win', 'loss', 'recruit'].map((k) => `${R}-${t}-${k}`)),
    ...['semi', 'final'].flatMap((g) => ['before', 'win', 'loss'].map((k) => `${R}-${g}-${k}`)),
  ];
}

describe('story scenes', () => {
  it('has scene files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every file is a known script file with a { scenes } object', () => {
    for (const { file, data } of loaded) {
      expect(requiredFor(file), `${file} is not a known scene file`).not.toBeNull();
      expect(data && typeof data.scenes === 'object' && !Array.isArray(data.scenes), file).toBe(true);
    }
  });

  it('ids are unique across files and equal their key', () => {
    const seen = new Map();
    for (const { file, key, scene } of allScenes) {
      expect(scene.id, `${file}:${key}`).toBe(key);
      expect(seen.has(key), `${key} in ${file} and ${seen.get(key)}`).toBe(false);
      seen.set(key, file);
    }
  });

  it('every file carries every id the brief requires for it', () => {
    for (const { file, data } of loaded) {
      const ids = Object.keys(data.scenes ?? {});
      for (const id of requiredFor(file) ?? []) expect(ids, `${file} missing ${id}`).toContain(id);
    }
  });

  const stillsOnDisk = fs.existsSync(STILL_DIR) && fs.readdirSync(STILL_DIR).some((f) => f.endsWith('.jpg'));

  for (const { file, key, scene } of allScenes) {
    describe(`${file} › ${key}`, () => {
      it('shape, still, music', () => {
        const allowedKeys = new Set(['id', 'still', 'music', 'title', 'threads', 'slam']);
        for (const k of Object.keys(scene)) expect(allowedKeys.has(k), `unknown key ${k}`).toBe(true);
        expect(ALLOWED_STILLS.has(scene.still), `still ${scene.still}`).toBe(true);
        if (stillsOnDisk) expect(fs.existsSync(path.join(STILL_DIR, `${scene.still}.jpg`)), `${scene.still}.jpg`).toBe(true);
        expect(ALLOWED_MUSIC.has(scene.music), `music ${scene.music}`).toBe(true);
        expect(Array.isArray(scene.threads) && scene.threads.length > 0).toBe(true);
      });

      it('title and slam limits', () => {
        const needsTitle = key === 'prologue' || /^[a-z]+-open$/.test(key);
        if (needsTitle) expect(scene.title, 'title required').toBeTruthy();
        if (key === 'prologue') expect(scene.title.top).toBe('CHAPTER 0 · THE BLOCK');
        if (scene.title) {
          expect(typeof scene.title.top).toBe('string');
          expect(len(scene.title.top), 'title.top').toBeLessThanOrEqual(28);
          if (scene.title.sub !== undefined) expect(len(scene.title.sub), 'title.sub').toBeLessThanOrEqual(32);
        }
        if (scene.slam !== undefined) {
          expect(len(scene.slam), 'slam length').toBeLessThanOrEqual(16);
          expect(scene.slam, 'slam ALL CAPS').toBe(scene.slam.toUpperCase());
        }
        if (key.endsWith('-bracket')) expect(scene.slam).toBe('REGIONALS');
      });

      it('threads, voices, message limits', () => {
        let total = 0;
        for (const t of scene.threads) {
          expect(['group', 'dm'], `kind ${t.kind}`).toContain(t.kind);
          expect(typeof t.name === 'string' && t.name.length > 0).toBe(true);
          expect(Array.isArray(t.messages) && t.messages.length > 0).toBe(true);
          expect(t.messages.length, `${t.name}: ≤ 8 messages`).toBeLessThanOrEqual(8);
          if (t.kind === 'group') {
            expect(t.name).toBe('{crew} 👑');
            expect(t.avatar).toBe('{crewLogo}');
          } else {
            expect(['{rivalLogo}', '{crewLogo}']).toContain(t.avatar);
          }
          for (const m of t.messages) {
            total += 1;
            for (const k of Object.keys(m)) expect(['from', 'text', 'delayMs']).toContain(k);
            expect(typeof m.text === 'string' && m.text.trim().length > 0).toBe(true);
            expect(len(m.text), `"${m.text}"`).toBeLessThanOrEqual(90);
            if (m.delayMs !== undefined) expect(Number.isFinite(m.delayMs) && m.delayMs >= 0).toBe(true);
            if (t.kind === 'group') expect(GROUP_VOICES.has(m.from), `group from ${m.from}`).toBe(true);
            else expect(DM_VOICES.has(m.from) || LITERAL_NAME.test(m.from), `dm from ${m.from}`).toBe(true);
          }
        }
        if (key.endsWith('-loss')) expect(total, 'loss scenes ≤ 3 messages').toBeLessThanOrEqual(3);
        if (key.endsWith('-recruit')) {
          const last = scene.threads.at(-1).messages.at(-1);
          expect(last.from, 'recruit scene ends on the ask').toBe('{recruit}');
          expect(last.text.trim().endsWith('?'), 'recruit scene ends on a question').toBe(true);
        }
      });

      it('placeholders and banned words', () => {
        const strings = [
          scene.title?.top, scene.title?.sub, scene.slam,
          ...scene.threads.flatMap((t) => [t.name, t.avatar, ...t.messages.flatMap((m) => [m.from, m.text])]),
        ].filter((s) => typeof s === 'string');
        for (const s of strings) {
          for (const p of placeholdersIn(s)) expect(PLACEHOLDERS.has(p), `{${p}} in "${s}"`).toBe(true);
          expect(BANNED_RE.test(s), `banned word in "${s}"`).toBe(false);
        }
      });
    });
  }
});
