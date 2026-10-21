# Story script brief — King of the Court

The bible every scene writer follows. Spec: `docs/superpowers/specs/2026-10-20-story-mode-king-of-the-court-design.md` §5.

## The premise
You (the player, `me`) captain a no-name kickball crew off your block. The crew's name is whatever the
player typed: always write it as `{crew}`. Nobody outside the block knows you. Hook for the whole run:
**nobody from our block ever made Nationals.** You climb five regions (East → Midwest → South → Southwest →
West Coast), each a ladder of five crews weakest → strongest, then a regional bracket (semi + final),
then Nationals (rematches with the five regional finalists; the last game is on THE CROWN court in
Baltimore). Win that and you're **King of the Court**. Street kickball culture: red rubber ball, chain-link,
blacktop, block parties, group chats, rival crews posting on social, old heads, cousins with cars.

## Format (how it's shown)
A full-screen still image, a phone that swings up, texts landing one at a time. Threads: `group` (your
crew's group chat) or `dm` (a 1-on-1 — rival captain, a recruit, a tournament organizer). Optional
chapter `title` (`top` ≤ 28 chars, `sub` ≤ 32 chars) and an end `slam` (≤ 16 chars, ALL CAPS, e.g.
`GAME DAY`, `REGIONALS`, `WE UP NEXT`, `TOOK THE L`).

## The group chat — four fixed voices (+ you)
- **Dre** — hype man, all caps when excited, emojis, believes in the crew before anyone else does.
- **Keys** — the skeptic, dry, counts the numbers ("they hit .400 off lefties"), secretly the most loyal.
- **Tasha** — the planner, has the car, books the courts, handles the sign-ups, no nonsense, funny.
- **Pops** — the old head who ran this block in '98, short wise lines, calls everybody "youngin".
- **me** — the player. Short, confident replies ("say less", "we'll see saturday"). Never a paragraph.
Recruits who join stay out of the group chat (their personalities live in their own DMs).

## Rivals
Each rival crew is in `src/data/teams.json` (name, city, colors, `special.label`, roster with `nick` + `pos`).
Their captain is the roster player with `pos: "Captain"` — write them as `{captain}` in text and `from`
(the game fills in the nick). The crew name is `{rival}`, their city `{city}`. You may ALSO name specific
rival players by nick literally when it helps. Give every crew its own city voice (Baltimore club energy,
Brooklyn drill bravado, Philly soul, DC go-go, Chicago cold, Memphis phonk, Atlanta trap, New Orleans
second-line, Houston slab, Miami heat, Vegas hustle, Denver altitude, Oakland hyphy, Seattle rain, LA G-funk…).
Recruits are written as `{recruit}` (the game fills the nick of whoever offers).

## Rules
- Street, funny, never cruel. Trash talk about kickball, not about anyone's family, body, race, or gender.
  No slurs, no profanity stronger than "damn"/"hell", no drugs, no gang references, no real people/brands.
- ≤ 90 characters per message. ≤ 8 messages per thread. Loss scenes ≤ 3 messages total.
- Placeholders allowed ONLY: `{crew}` `{captain}` `{rival}` `{recruit}` `{city}` `{rivalLogo}` `{crewLogo}`.
- `from` is one of `Dre`, `Keys`, `Tasha`, `Pops`, `me`, `{captain}`, `{recruit}`, or (rare, only in dm
  threads) a literal organizer name like `Commissioner Lou` or a named rival player nick.
- Thread `avatar`: group chat uses `{crewLogo}`; a rival dm uses `{rivalLogo}`; recruit dm uses `{rivalLogo}`.
- Thread `name`: group chat `"{crew} 👑"`; rival dm `"{captain} · {rival}"`; recruit dm `"{recruit} · {rival}"`.
- Each scene is self-contained: the game fills vars for the crew the scene is about.

## Scene ids (the contract — the game plays exactly these)
Per region `R` (east, midwest, south, southwest, west) with ladder crews `T1…T5` (ids from
`src/data/story/regions.json`):
- `R-open` — chapter card + why we're here (title required: e.g. `CHAPTER 1 · THE EAST`).
- For each ladder crew `T`: `R-T-before` (rival DM trash talk + a beat of crew reaction), `R-T-win`
  (group chat celebrates, ≤ 8), `R-T-loss` (≤ 3 msgs, rival rubs it in or crew regroups), `R-T-recruit`
  (a `{recruit}` dm asking to join; end on the ask — the accept/decline card comes after).
- `R-bracket` — bracket eve (organizer + crew), slam `REGIONALS`.
- `R-semi-before|win|loss` (vs ladder crew 4, a rematch), `R-final-before|win|loss` (vs ladder crew 5, a rematch).
- `R-champ` — you won the region; set up the next region (slam e.g. `NEXT STOP: MIDWEST`).
Plus: `prologue` (the very first scene, title `CHAPTER 0 · THE BLOCK`, introduces the four voices and the
dream), `nationals-open`, `nationals-T-before|win|loss` for each of the five regional finalists
(`funk`, `cleveland`, `miami`, `albuquerque`, `portland`), and `ending` (King of the Court).

## Stills (pick per scene; files are `public/assets/story/<still>.jpg`)
`prologue-block`, `R-open`, `R-turf`, `R-bracket`, `R-champ` for each region, `nationals-open`,
`nationals-crown`, `ending-king`, `loss-night`, `recruit-handshake`.
Use `R-turf` for ladder before/win, `loss-night` for losses, `recruit-handshake` for recruit DMs,
`R-bracket` for bracket scenes, `R-champ` for the champ scene.

## Music
`music` is one of: `beat`, `theme`, or a city track id: `city-baltimore`, `city-new-york`, `city-brooklyn`,
`city-philadelphia`, `city-akron`, `city-washington-dc`, `city-chicago`, `city-phoenix`, `city-memphis`,
`city-los-angeles`. Use the rival's city track when it exists, otherwise the nearest-feeling one or `beat`.

## File format
`src/data/story/scenes/<file>.json` = `{ "scenes": { "<id>": { "id", "still", "music", "title"?, "threads": [...], "slam"? } } }`.
2-space indent. Files: `prologue.json` (prologue), `east.json`, `midwest.json`, `south.json`,
`southwest.json`, `west.json`, `nationals.json` (nationals-* + ending).
