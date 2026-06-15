# Audio Asset Batch — Hip-Hop Beats + Announcer VO Variety

Generated via Higgsfield MCP on 2026-06-13. Job IDs recorded in `docs/higgsfield-jobs.json` under `batch4-audio-hiphop-vo`.

- **Music model:** `sonilo_music` — 30s, loopable, instrumental (no vocals), `.m4a`
- **VO model:** `inworld_text_to_speech` — hype radio-DJ delivery, ~1-2s, `.wav`
- **VO voices rotated for variety:** Vinny (en), Tyler (en), Nate (en)
- **Cost:** ~48 credits total (2 music ~3.8 + 22 VO ~44). Balance was 2517.75.

## Files downloaded

### Music — `public/assets/audio/music/`
| File | Vibe |
|------|------|
| `in-match-beat-1.m4a` | Golden-era boom-bap, thumping 90s bass, vinyl crackle, head-nod groove |
| `in-match-beat-2.m4a` | Hard-hitting boom-bap, deep sub bass, soul horn stabs, turntable accents |

### Announcer VO — `public/assets/audio/vo/`
Three distinct variants per event so lines stop repeating.

| File | Line | Voice |
|------|------|-------|
| `crowned-1.wav` | "He is CROWNED! That ball is OUTTA here, baby!" | Vinny |
| `crowned-2.wav` | "GONE! Say goodbye to that one!" | Vinny |
| `crowned-3.wav` | "OUTTA HERE! Nobody is catchin THAT!" | Tyler |
| `caught-1.wav` | "ROBBED! He stole that one right outta the air!" | Vinny |
| `caught-2.wav` | "DENIED! What a grab!" | Tyler |
| `caught-3.wav` | "SNAGGED IT! Are you kiddin me?!" | Nate |
| `pegged-1.wav` | "PEGGED! Right off the hip!" | Vinny |
| `pegged-2.wav` | "GOT HIM! No mercy out here!" | Tyler |
| `pegged-3.wav` | "DRILLED! He never saw it comin!" | Nate |
| `strike-1.wav` | "Swing and a WHIFF! Nothin but air!" | Vinny |
| `strike-2.wav` | "STEE-RIKE! He got served!" | Tyler |
| `strike-3.wav` | "Ohh, he missed it clean! Sit down!" | Nate |
| `safe-1.wav` | "SAFE! He beats the throw, easy money!" | Vinny |
| `safe-2.wav` | "Base knock! He is on and he is dangerous!" | Tyler |
| `safe-3.wav` | "Clean hit, he slides in SAFE!" | Nate |
| `playball-1.wav` | "Alright, let's KICK it off! PLAY BALL!" | Vinny |
| `playball-2.wav` | "Lace em up, it is GO time!" | Tyler |
| `playball-3.wav` | "Here we GO! Street kickball, baby, let's run it!" | Nate |
| `gameover-1.wav` | "And THAT is the ballgame! We got our KINGS!" | Vinny |
| `gameover-2.wav` | "It is OVER! Crown em up, they took the whole thing!" | Tyler |
| `gameover-3.wav` | "Game, set, STREET! That is a wrap, folks!" | Nate |

## Suggested wiring (main session — NOT applied here)

### `src/engine/audio.js` — `FILES.music` (new loopable in-match beats)
```js
music: {
  theme: 'assets/audio/theme-red-rubber-felony.mp3',
  beat:  'assets/audio/match-beat.m4a',           // existing
  'beat-1': 'assets/audio/music/in-match-beat-1.m4a',
  'beat-2': 'assets/audio/music/in-match-beat-2.m4a',
},
```

### `src/engine/audio.js` — `FILES.vo` variant pools
The current `vo(name)` plays a single file per id. To get variety, change the
vo map to arrays (or add a pool layer) and pick a random entry per event, e.g.:
```js
vo: {
  playball: ['assets/audio/vo/playball-1.wav','assets/audio/vo/playball-2.wav','assets/audio/vo/playball-3.wav'],
  crowned:  ['assets/audio/vo/crowned-1.wav','assets/audio/vo/crowned-2.wav','assets/audio/vo/crowned-3.wav'],
  caught:   ['assets/audio/vo/caught-1.wav','assets/audio/vo/caught-2.wav','assets/audio/vo/caught-3.wav'],   // robbed/caught-out
  pegged:   ['assets/audio/vo/pegged-1.wav','assets/audio/vo/pegged-2.wav','assets/audio/vo/pegged-3.wav'],
  strike:   ['assets/audio/vo/strike-1.wav','assets/audio/vo/strike-2.wav','assets/audio/vo/strike-3.wav'],
  safe:     ['assets/audio/vo/safe-1.wav','assets/audio/vo/safe-2.wav','assets/audio/vo/safe-3.wav'],
  gameover: ['assets/audio/vo/gameover-1.wav','assets/audio/vo/gameover-2.wav','assets/audio/vo/gameover-3.wav'],
}
```
Then in `vo(name)`: resolve `const pool = FILES.vo[name]; const url = Array.isArray(pool) ? pool[Math.random()*pool.length|0] : pool;`
Keep the existing string entries (`crushed`, `cointoss`) untouched, or map `crowned`→pool while leaving `crushed` as legacy.

Note: existing event ids in audio.js are `crowned`, `robbed`, `pegged`, `playball`, `gameover`.
New `caught-*` files map to the existing `robbed` id; new `strike-*`/`safe-*` are new events (currently `whiff` is a synth sfx, not VO).

### `src/data/assets.manifest.json` — suggested audio ids (if registered there)
`music-in-match-beat-1`, `music-in-match-beat-2`, and `vo-<event>-<n>` (e.g. `vo-crowned-1`).

## Quality note
All 24 jobs completed and files verified (music = valid M4A `ftyp` containers,
VO = valid `RIFF/WAVE`). Beats are bass-heavy boom-bap with strong street energy
and loop cleanly at 30s. VO lines are short, punchy, and the 3-voice rotation
plus 3 phrasings per event should kill the old repetitive/annoying feel.
Recommend a quick listen to the two beats to pick a favorite (or alternate them
per inning), and trim any leading/trailing silence on the WAVs if you want
tighter triggers.
