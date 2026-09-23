// The tier says how many rigs may cast a shadow; the camera says which. The
// pitcher, the kicker and the near infield are the shadows a phone player
// reads; a left fielder's shadow forty metres out is 25k triangles into the
// shadow map for nothing (audit B17). Pure — unit-tested.
export function pickCasters(chars, camPos, n) {
  const list = chars.filter((c) => c?.group);
  if (n >= list.length) return new Set(list);
  if (n <= 0) return new Set();
  const ranked = list.map((c) => ({ c, d: c.group.position.distanceToSquared(camPos) })).sort((a, b) => a.d - b.d);
  return new Set(ranked.slice(0, n).map((x) => x.c));
}

/** The meshes on this character the BUILD made casters (the body; decal
 *  patches and bands are built `castShadow = false` and stay that way).
 *  Memoised on the first call, which must happen before any pick switches
 *  them off. */
export function castersOf(char) {
  if (!char._casterMeshes) {
    const out = [];
    char.group?.traverse?.((o) => { if (o.isMesh && o.castShadow) out.push(o); });
    char._casterMeshes = out;
  }
  return char._casterMeshes;
}

/** Apply a pick: budgeted rigs cast, the rest don't. Returns how many cast. */
export function applyCasters(chars, picked) {
  let on = 0;
  for (const c of chars) {
    const cast = picked.has(c);
    for (const m of castersOf(c)) m.castShadow = cast;
    if (cast) on += 1;
  }
  return on;
}
