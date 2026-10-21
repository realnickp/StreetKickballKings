# Story mode — still art (Tasks 11 + 15)

Generated 2026-10-20 with Higgsfield. Stills are full-screen 9:16 backgrounds for the phone-text
scene player (spec §5). A phone mockup covers roughly the center 70% width, middle-to-bottom, so
every still keeps its interest in the top third + left/right edges and leaves the center-bottom calm.

## Art direction (Task 11)

- **Model:** `nano_banana_pro` (Google Nano Banana Pro, 2k, 9:16; Higgsfield reports the job
  model as `nano_banana_2`). 2 credits per image. Chosen over `soul_2` (accepts only one reference,
  character/fashion-oriented) and `gpt_image_2_5` because it takes multiple `image_references` and
  holds the environment-render look of our backdrops.
- **Style references** (uploaded via `media_upload` and passed as `image_references` on every
  generation):
  - `eebfbddb-393f-48b8-91d5-4c4985fdf548` = `public/assets/textures/backdrop-block-party-3d.jpg`
    (dusk row houses, warm string lights)
  - `f697d014-767c-46b4-8a02-9453d5569df5` = `public/assets/textures/backdrop-the-crown-3d.jpg`
    (night brick + floodlights)
  - `backdrop-neon-night-court-3d.jpg` was deliberately NOT used as a reference: it has readable
    neon sign words, which would invite text into the stills.
- **Test still:** `prologue-block` (job `1e36a371-78fb-45f7-8f5a-923ba0454a8d`) passed on the first
  try: matching render look, no text, small side-on figures at the left edge, calm blacktop
  center-bottom. The recipe below was used unchanged for the batch.

### Prompt recipe

```
Match the exact rendering style of the reference images: a cohesive stylized-realistic 3D render,
clean cinematic CG environment, soft global illumination, rich warm color grade, slightly
idealized, like a high-end video game environment backdrop. Do not copy the reference scenes, only
their look.

Scene: <per-still scene: place, light (golden hour / dusk / night), region cues, where the people
and the red kickball sit (edges), what's in the top third>

Composition for a vertical phone wallpaper, 9:16 portrait: all key detail (skyline, rooftops, sky,
lights, people) sits in the TOP THIRD of the frame and along the left and right edges. The center
and bottom center of the frame are calm, simple, uncluttered open ground (blacktop or court
surface) with soft light falloff and gentle texture only. Eye-level camera, slight low angle.

Rules: absolutely no text, no letters, no numbers, no signs with writing, no scoreboards with
digits, no logos, no brand names, no graffiti words, no team names on banners or jerseys (banners
are plain color fields or simple shapes only). No close-up faces; people are small, mid-distance,
seen from behind or in silhouette. Any ball is a red rubber kickball.
```

`recruit-handshake` uses the same style + rules blocks with a hands-only close-up scene (no faces,
red vs blue sleeves, blurred court bokeh below).

### Review rules (every still checked by eye)

1. No readable text, numbers, logos, brands, team names.
2. No close-up faces (crowds, backs, silhouettes, hands, small mid-distance figures only).
3. Interest in the top third + edges; center-bottom calm (phone mockup sits there).
4. Same stylized-realistic 3D look as the field backdrops; golden hour / dusk / night city light.
5. Reads as its region.

### Post-processing

`node scripts/story-stills.mjs process <rawDir>` — sharp cover-crop to exactly 1080×1920,
baseline (non-progressive) JPEG with optimised Huffman coding, quality stepped down from 88 until
≤ 350,000 bytes. No mozjpeg preset, because sharp's mozjpeg preset forces progressive scans.
`node scripts/story-stills.mjs sheet` — contact sheet `docs/reports/story-stills-sheet.jpg`.

## The stills (Task 15)

26 stills: `prologue-block` + 4 per region (20) + 5 specials (the brief said 25, but the list is 26).
All are 1080×1920 baseline JPEGs at ≤ 350,000 bytes (checked with sharp metadata: width, height,
`isProgressive=false`, size). Contact sheet: `docs/reports/story-stills-sheet.jpg`.

Credits: 2730.23 before, 2606.23 after, so 124 credits for 33 generations (26 kept, 7 re-rolls).
The preflight quoted 2 per image; the real charge came to about 3.8 per image.

| id | bytes | job id | description |
|---|---|---|---|
| prologue-block | 339591 | 1e36a371-78fb-45f7-8f5a-923ba0454a8d | Dusk row houses with marble stoops, crew leaning on chain-link at left, red ball on a cracked chalk-diamond lot |
| east-open | 330669 | 210def2a-7c4a-4a3b-935b-7828f2b09225 | Golden-hour row-house canyon under an elevated train, water towers, crew at right, ball at left curb |
| east-turf | 304888 | e33f687f-029b-4191-b28f-601a6e4c2c7d | Brooklyn caged court at night, sodium lights, fire escapes, abstract mural, steam, rivals on far fence |
| east-bracket | 235038 | 8dfca2f8-8aae-46b4-99b4-368d6389cf05 | Packed night court, pennants + string lights, fans climbing the fences, El train behind (re-roll) |
| east-champ | 242804 | 8ddf8edc-2832-44fb-992e-50fdb7419272 | Crew silhouettes with arms up under string lights, crown trophy raised, El train at dusk |
| midwest-open | 327694 | 1e84301d-1258-4efc-9e89-7ffcf3197906 | Cold blue dusk, El tracks over a snowy court, brick three-flats, two hooded figures, ball in snow |
| midwest-turf | 328064 | ff510957-840f-4d1e-8fce-85ce557f10ee | Industrial lot by a factory smokestack + truss bridge, cold floodlight, snowbanks, rivals far |
| midwest-bracket | 342156 | 3ebe2ebc-03f4-4a30-9e03-65df80b6bd6d | Winter-coat crowd on the fences, plain color banners, El train, breath steam, snow (re-roll) |
| midwest-champ | 350000 | 20f4a55d-68db-45a9-baca-29cc2dc11d2c | Crew in beanies from behind, crown trophy raised in snowfall, El train + floodlights (re-roll) |
| south-open | 345139 | d089811d-81cf-4d26-93d1-b3a667740c67 | Pastel shotgun houses, mossy live oak + palms, abstract neon corner store, porch crew, golden hour |
| south-turf | 243162 | 6031e629-bca5-409c-a7bf-2b5c78900df0 | Pink/teal art-deco neon, palms, humid haze, abstract mural fence, ball under the light |
| south-bracket | 326551 | c487a4d1-7b55-4013-9a08-42ba49ba72b6 | New Orleans porches packed with fans, string lights in a live oak, brass band silhouettes (re-roll) |
| south-champ | 348771 | 458e0aab-4d19-4bb7-a9ee-20756fbbadde | Crew raising the crown under fireworks, palms + mossy oak, pink neon glow |
| southwest-open | 269884 | fcb47488-19f3-4d6a-bb2a-bc62584ba209 | Desert sunset, adobe block + saguaros, red-rock mesas, distant neon strip, ball bottom-right |
| southwest-turf | 307958 | ebcc2885-3fda-4563-a450-f488325e5dce | Stucco motel with abstract neon shapes, palms, desert mountains, dust haze, rivals on fence |
| southwest-bracket | 256255 | d2ae2d15-0ce6-4dea-ac53-cd44ef0d1d4c | Starry desert night, fans on pickup trucks, pennants, adobe walls, ball at left fence (re-roll) |
| southwest-champ | 345503 | 1f96da99-1a3d-4daa-86c1-7c652f78e3b3 | Crew raising the crown before red-rock spires at sunset, sparklers, cactus + sage at edges |
| west-open | 333969 | 4dfc5f73-c015-4c6c-a404-8481060da7f8 | Tall palms, hazy suspension bridge, hillside bungalows, pastel sky, chalk diamond |
| west-turf | 246158 | 8d53e1a6-dd06-409d-a333-4932fc3d3a53 | Hilltop court over a night bay skyline, fog, palms, abstract wildstyle mural (no letters) |
| west-bracket | 307681 | bf38898d-a4f6-4647-b2fd-d56a953bd929 | Beach court at sunset, pier + ocean, pennants, crowd on boardwalk fences |
| west-champ | 232212 | 50711989-5815-45e7-9aa8-74ffc1b45962 | Crew silhouettes raising the crown against a setting sun over the sea, palms |
| nationals-open | 315642 | f4929877-289d-4fa2-bd18-e0b998584d33 | Stadium floodlights, packed bleachers, row of colored banners with only shapes, skyline (re-roll) |
| nationals-crown | 316408 | 3f095d35-d989-4951-aea2-27dafd65402b | THE CROWN: gold crown painted on blacktop before the brick warehouse + floodlights, gold haze (re-roll) |
| ending-king | 341819 | 833bdc05-8f98-4911-b509-311fa77661e0 | Crew on a podium raising the crown trophy, gold confetti, fireworks, a roaring crowd |
| loss-night | 299149 | 321a1104-d573-4ce6-9aed-7c00017f56cb | Empty wet court, one streetlight, ball against the fence, quiet row houses, blue night |
| recruit-handshake | 168818 | 99f29886-86fb-4a2b-b3aa-19bdd57e10db | Close-up dap: red vs blue sleeves, wristbands, blurred court bokeh below, no faces |

### Rejected first takes (re-rolled)

| id | rejected job | why |
|---|---|---|
| east-bracket | 0a6b1c05-d15d-44d1-a224-b7f1c62e8f8f | Ball on home plate dead center-bottom (my prompt asked for it), under the phone |
| midwest-bracket | 27278d01-d612-4d3c-8c63-50d455005e12 | Ball center-bottom |
| midwest-champ | c39006cc-9453-4892-b8ae-256a3509bddb | Large ball center-bottom |
| south-bracket | 8b705f88-0a99-4740-b9c9-82c3d0beccbe | Vertical neon signs with pseudo-letters |
| southwest-bracket | 002fda2a-f3a3-4728-ae76-a9ac4850a293 | Ball center-bottom |
| nationals-open | e339280e-14b6-47ec-bf7c-b6115fbe436e | Ball center-right in the phone zone |
| nationals-crown | 0a3fe3e1-0052-4178-9326-acbd9e1940ed | Ball + home plate center-bottom |

Lesson for future stills: never put the ball "on home plate" or anywhere without an edge position.
Say "small, far away, at the left/right edge" and "no objects, no ball in the lower half".

### Watch list

- `nationals-crown`: the painted crown sits at about 42–50% height, so the top of the phone may
  clip its lower rim. The rejected first take had the crown higher (28–36%) but a ball in the
  phone zone.
- `southwest-open`: the distant Vegas-style strip has tiny neon blobs. They aren't readable at
  1080 px, but they're the closest thing to signage in the set. The ball sits bottom-right at
  roughly 75–90% width and may peek out beside the phone.
- `midwest-champ`: the figures are large, foreground and seen from behind (no faces), so its
  scale differs from the other champ stills.
- `ending-king`: a few extra red balls at the court edges, which is harmless.
- `west-open` / `west-turf`: a recognisable Golden Gate-style bridge and SF-style skyline. These
  are landmarks, not brands.
