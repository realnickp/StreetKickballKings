import { it, expect } from 'vitest';
import fs from 'node:fs';
import { SFX_FILES, SFX_ALIAS, WARM_LIST } from '../src/engine/audio.js';

const NEW = ['ui-tap', 'ui-confirm', 'score', 'safe', 'out', 'tag', 'foul', 'inning',
  'crown-tick', 'crown-arm', 'countdown', 'unlock', 'stomp', 'cheer-big', 'boo'];

it('every alias resolves to a registered file that exists on disk', () => {
  for (const [alias, a] of Object.entries(SFX_ALIAS)) {
    if (a.synth) continue;
    expect(SFX_FILES[a.file], alias).toBeTruthy();
    expect(fs.existsSync(`public/${SFX_FILES[a.file]}`), `${alias} -> ${SFX_FILES[a.file]}`).toBe(true);
  }
});

it("the round's new sounds are all aliased and warmed", () => {
  for (const n of NEW) { expect(SFX_ALIAS[n], n).toBeTruthy(); expect(WARM_LIST, n).toContain(n); }
});
