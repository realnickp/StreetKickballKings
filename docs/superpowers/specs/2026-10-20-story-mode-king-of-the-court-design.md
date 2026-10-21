# Story Mode: KING OF THE COURT — Design

**Date:** 2026-10-20
**Source:** dev, in this session's brainstorm (decisions quoted or picked by number):
- "Some sort of story mode where everyone is competing to be the KING OF THE COURT" + "creating a
  lot more teams and making it more difficult as you go through, and there being tournaments."
- "no aliens… We don't need cinematics… just little cards that pop up to tell the story over still
  images we make using higgsfield."
- Format: "the image and then like the text messages coming up over the image… a phone over like
  a urban background image with like cool hip hop music playing." On the mockup
  (`.superpowers/brainstorm/405-1792542344/content/story-phone-scene.html`): "that's more like it.
  Kind of. Close enough." → "go".
- Picked: **five regions** (2), **your own crew from nothing** (2), **the ladder** (1),
  **recruit + train** (3). Full design summary approved: "Yep".

Supersedes the 2026-09-22 brainstorm (THE VISITORS aliens, play-as-one-of-ten, a city per state).

## 1. The pitch

You start a no-name crew from your block. Nobody knows you. You climb five regions, win each
region's tournament, and take Nationals. The crew that wins Nationals is **King of the Court**.
Hook line for the whole run: *nobody from our block ever made Nationals.*

## 2. Your crew

- **Create Crew screen** (first time you open Story): crew name (text, 14-char cap, profanity
  filter), primary/secondary colors from a curated swatch set (pairs that pass the light/dark kit
  rule in `kits.js`), logo from a set of ~12 stock marks tinted to your colors. One screen, one
  CONFIRM. Editable later from the Locker.
- **Roster:** 8 block players, built by the same procedural system as every crew
  (`buildTeamChars`, `look` + `stats` + `archetype` like `teams.json` rosters), generated once from a
  seed and saved. Starting stats are low (avg ~4/10) with one standout per player so the lineup
  still has a shape.
- Your crew is a real team object at match time: it goes through the same kit, decal, walk-up and
  booth paths as the ten existing crews (booth says the crew name via the generic lines, no VO
  needed for a custom name).
- Story replaces **RUN THE MAP** on the main menu. **Quick Play stays** (pick any two unlocked
  crews). Locker gear unlocks stay milestone-based (`unlocks.js`); "King of the Streets" copy
  becomes "King of the Court".

## 3. The map — five regions, ~27 crews

| Region | Existing crews | New crews (draft cities) |
|---|---|---|
| East | Monarchs (Baltimore), Metros (DC), Funk (Philly), Snappers (NY), Bullies (Brooklyn) | — |
| Midwest | Marauders (Akron), Kestrals (Chicago) | Detroit, St. Louis, Cleveland |
| South | Hustlers (Memphis) | Atlanta, New Orleans, Houston, Miami |
| Southwest | Gilas (Phoenix) | Dallas, Las Vegas, Denver, Albuquerque |
| West Coast | Threshers (LA) | Oakland, Seattle, San Diego, Portland |

New crews (~15–17) follow the existing crew recipe: name, colors, light/dark kits, logo, 8-player
roster with nicknames, home court. New crews play on the existing ten courts re-dressed (regional
backdrop/sky preset + crew banners) until they get their own fields; that is a content decision per
region round, not a blocker.

## 4. A region = a ladder, then a bracket

- Rival crews in a **fixed order, weakest → strongest**. One game per rung, on the rival's court.
- **Lose:** replay the same rung (no penalty beyond the rival's trash talk by text and fewer coins).
- **Top rung = the regional tournament:** a 4-crew bracket (you + the region's three strongest).
  Semi then final; lose either and you re-enter the bracket from the semi.
- Win the bracket → the next region unlocks. Region order is fixed: East → Midwest → South →
  Southwest → West Coast.
- **Nationals:** a gauntlet of rematches against the five crews you beat in each regional final,
  each scaled up ("they've been waiting on you"), in region order. The last game is on
  **THE CROWN** court. Winning it = King of the Court + the end-of-story scene + the King rewards
  (Gold Crowns cleats, Gold Rush kit, already defined).
- Post-story: the ladder stays replayable for coins; Nationals can be re-run as a "defend the
  crown" mode later (out of scope for the first rounds).

## 5. The story — phone scenes over a still

**The format (the scene player):** full-screen Higgsfield still with a slow drift/zoom; a hip hop
bed (existing music library, ducked under pings); optional chapter title slam at the top; a phone
swings up center-screen and messages land one at a time with typing dots and a ping; threads can
flip (group chat → DM); an end slam (`GAME DAY`, `REGIONALS`, `NATIONALS`). Tap = next message,
hold/skip button = jump to the end. Same behavior as the approved mockup.

**Scenes per rung (three):**
1. **Before:** the rival's DM (their captain, by nickname) + a beat of crew reaction.
2. **After:** the group chat reacts to the win or the loss (separate scripts; losses are short so a
   replay loop isn't a wall of text).
3. **Recruit** (wins only): a player from the beaten crew DMs to join (§6).

**Per region:** a chapter opener (where you are, what's at stake) + a bracket-eve scene + a
champion scene. **Stills:** ~3–4 Higgsfield stills per region (the block, the rival turf, the
tournament court, the celebration), shared across that region's scenes. Style = the cohesive
stylized-realistic look of our field backdrops; no faces that contradict the 3D crews.

**Data, not code:** every scene is JSON (`src/data/story/<region>.json`): still, music, title,
thread list, messages `{from, text, delayMs}`, end slam. Writers edit text without touching code.
The cast of your group chat: 3–4 recurring block voices with fixed nicknames (your crew's
personalities), plus each rival captain.

## 6. Getting stronger

**Recruiting (the story reward).** After every win, one player from that crew offers to join (the
script names who; usually their best player at one stat). Accept → pick which of your 8 sits (the
benched player stays on a bench list and can come back). Decline is allowed. By Nationals your crew
is your block plus the best of who you beat. Recruits keep their look and stats but wear your kit.

**Training (the grind).**
- Wins pay coins; losses pay a small amount; a bracket win and region title pay a bonus.
- Coins buy +1 to one stat (power, speed, arm, glove) on one player; cost rises with the stat
  level; cap 10.
- **Rival curve:** each rung's crew stats are scaled so a player who trains a little keeps pace,
  and a skilled player can still win under-trained. Numbers live in `tuning.json` (`story.*`) and get
  tuned by real play, not by tests.
- **Ads / purchases:** hook points only (double coins after a win, a coin pack). Stubbed in the
  PWA; they go live with the native app-store shell. Free path is always beatable; no paid random
  packs.

## 7. Save

Local, through `SaveManager` (`src/meta/save.js`), new keys under `story.*`: crew identity, roster
(with recruits + bench), coins, region/rung position, bracket state, seen-scene ids, King flag. A
version field so later regions can migrate the save.

## 8. Build order

**Round 1 — the spine + East (ships, dev playtests on phone):** Create Crew screen; your-crew team
object; region/ladder/bracket engine + save; the phone scene player; recruiting; coins + training
screen; East content (5 rungs + bracket, scripts, 3–4 stills, music picks); menu swap
(Story replaces RUN THE MAP).
**Rounds 2–5:** one region each (new crews + rosters + logos + stills + scripts + court dressing).
**Round 6:** Nationals + the King of the Court ending.

## 9. Verification

Unit tests for the ladder/bracket state machine, coin math, training costs, recruit swaps and save
migration. The scene player gets a Playwright pass (messages land in order, tap/skip work, audio
starts after a gesture, text fits a 390-px-wide phone). Then a real play-through of the East on the
dev's phone through the production PWA (per the deploy rule, merges gated on "push"). Claims of
"done" come from real play, not tests.

## 10. Out of scope (for now)

Real ads/IAP, online/leaderboards, per-state courts, video cinematics, VO for custom crew names,
defend-the-crown mode. The pending lag round, fielding ("the catch is a call"), blotchy skin, and
first-time coach marks stay on the list and are scheduled separately.
