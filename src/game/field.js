// Procedural Blacktop diorama. Everything is primitives + canvas textures so
// Higgsfield art can replace materials later without touching geometry.
// Coordinates: home plate at origin, field extends toward -Z, Y up.
// Bases: 1st (+X,-Z), 2nd (0,-2Z), 3rd (-X,-Z). Pitcher on the home→2nd line.
import * as THREE from 'three';

export const FIELD_LAYOUT = {
  home: new THREE.Vector3(0, 0, 0),
  first: new THREE.Vector3(11.3, 0, -11.3),
  second: new THREE.Vector3(0, 0, -22.6),
  third: new THREE.Vector3(-11.3, 0, -11.3),
  pitcher: new THREE.Vector3(0, 0, -12),
};

// Per-sky lighting. Every field is FLOODLIT bright enough to clearly read the
// players and court (night stadiums use lights, they aren't dim) — mood comes
// from light COLOUR, not darkness. ACES tone-mapping + the vignette eat a lot of
// low light, so intensities stay high across the board. Keyed by fields.json `sky`.
const SKY_PRESETS = {
  'day':           { hemiSky: '#cfe0ff', hemiGround: '#7a756a', sun: '#fff4e0', sunI: 2.1, hemiI: 1.35, amb: '#5b6172', ambI: 0.25 },
  'sodium-night':  { hemiSky: '#6a6486', hemiGround: '#4a4030', sun: '#ffd6a0', sunI: 2.3, hemiI: 1.3,  amb: '#5a4f46', ambI: 0.4 },
  'dusk':          { hemiSky: '#b3a3c6', hemiGround: '#5a4f55', sun: '#ffcaa0', sunI: 2.1, hemiI: 1.35, amb: '#5a5260', ambI: 0.35 },
  'neon-night':    { hemiSky: '#7e7cba', hemiGround: '#403a58', sun: '#d2c4ff', sunI: 2.1, hemiI: 1.3,  amb: '#4a4670', ambI: 0.4 },
  'golden-hour':   { hemiSky: '#d2e2f2', hemiGround: '#6a5642', sun: '#ffd9a0', sunI: 2.2, hemiI: 1.35, amb: '#6a5a4a', ambI: 0.3 },
  'shaft-light':   { hemiSky: '#b4c0cc', hemiGround: '#52525a', sun: '#fff2dd', sunI: 2.1, hemiI: 1.25, amb: '#56565e', ambI: 0.3 },
  'overcast':      { hemiSky: '#cdd2d8', hemiGround: '#6a665e', sun: '#e8e4dc', sunI: 1.8, hemiI: 1.7,  amb: '#888c92', ambI: 0.35 },
  'winter':        { hemiSky: '#dde8f5', hemiGround: '#aab4c0', sun: '#f4f8ff', sunI: 2.1, hemiI: 1.7,  amb: '#9aa6b4', ambI: 0.35 },
  'desert-sunset': { hemiSky: '#d6b6c6', hemiGround: '#7a5642', sun: '#ffc88e', sunI: 2.2, hemiI: 1.35, amb: '#6a544a', ambI: 0.3 },
  'stadium-night': { hemiSky: '#868eba', hemiGround: '#42424f', sun: '#ffffff', sunI: 2.5, hemiI: 1.35, amb: '#4a4a5a', ambI: 0.4 },
};

export function buildField(fieldData, scene) {
  const root = new THREE.Group();
  root.name = `field-${fieldData.id}`;
  const palette = fieldData.palette ?? {};
  const handles = { root, layout: FIELD_LAYOUT };

  // --- ground ---------------------------------------------------------------
  // generated art when the field defines it, canvas placeholder otherwise
  const groundTex = fieldData.textures?.ground
    ? new THREE.TextureLoader().load(fieldData.textures.ground, (t) => { t.colorSpace = THREE.SRGBColorSpace; })
    : makeAsphaltTexture(palette.ground ?? '#3c3f44');
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(10, 10);
  // A subtle procedural normal map gives the blacktop floodlit micro-texture (the
  // light catches its grain) so it stops reading as a flat painted plane. Kept low.
  const groundNormal = makeAsphaltNormal();
  groundNormal.repeat.set(10, 10);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.92,
    normalMap: groundNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  handles.groundMat = groundMat;

  // --- painted lines and bases ----------------------------------------------
  const lineMat = new THREE.MeshBasicMaterial({ color: palette.lines ?? '#e8e6df' });
  lineMat.polygonOffset = true;
  lineMat.polygonOffsetFactor = -1;

  for (const sign of [1, -1]) {
    const foul = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 44), lineMat);
    foul.rotation.x = -Math.PI / 2;
    foul.rotation.z = sign * (Math.PI / 4);
    foul.position.set(sign * 15.5, 0.02, -15.5);
    root.add(foul);
  }

  for (const key of ['first', 'second', 'third']) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.9),
      new THREE.MeshStandardMaterial({ color: '#f5f2e8', roughness: 0.5, envMapIntensity: 0.6 }),
    );
    base.position.copy(FIELD_LAYOUT[key]).setY(0.04);
    base.rotation.y = Math.PI / 4;
    root.add(base);
  }
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.06, 5),
    new THREE.MeshStandardMaterial({ color: '#f5f2e8', roughness: 0.6 }),
  );
  plate.position.set(0, 0.03, 0);
  root.add(plate);

  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.9, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.9 }),
  );
  mound.position.copy(FIELD_LAYOUT.pitcher).setY(0.06);
  root.add(mound);

  // --- chain-link outfield fence ---------------------------------------------
  const fenceTex = makeChainLinkTexture();
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
  const fenceMat = new THREE.MeshStandardMaterial({
    map: fenceTex,
    transparent: true,
    alphaTest: 0.3,
    side: THREE.DoubleSide,
    color: palette.fence ?? '#9aa0a6',
    metalness: 0.4,
    roughness: 0.6,
    envMapIntensity: 0.7, // hold the env reflection back so the wire mesh doesn't go glary
  });
  const postMat = new THREE.MeshStandardMaterial({ color: '#6f7578', roughness: 0.5, metalness: 0.6, envMapIntensity: 0.7 });
  const R = fieldData.fenceM;
  const fh = fieldData.fenceHeightM ?? 4.5; // tall enough that only well-lofted bombs clear
  fenceTex.repeat.set(4, fh / 2);
  const segments = 14;
  const arcStart = -Math.PI / 4; // first-base foul line direction
  const arcEnd = Math.PI + Math.PI / 4;
  for (let i = 0; i < segments; i++) {
    const a0 = arcStart + ((arcEnd - arcStart) * i) / segments;
    const a1 = arcStart + ((arcEnd - arcStart) * (i + 1)) / segments;
    const p0 = new THREE.Vector3(Math.cos(a0) * R, 0, -Math.abs(Math.sin(a0)) * R - 0);
    const p1 = new THREE.Vector3(Math.cos(a1) * R, 0, -Math.abs(Math.sin(a1)) * R - 0);
    const width = p0.distanceTo(p1);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, fh), fenceMat);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    panel.position.set(mid.x, fh / 2, mid.z);
    panel.lookAt(0, fh / 2, 0);
    root.add(panel);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, fh + 0.3, 6), postMat);
    post.position.set(p0.x, (fh + 0.3) / 2, p0.z);
    root.add(post);
  }

  // --- backstop + side fences near home --------------------------------------
  for (const sign of [1, -1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(10, fh), fenceMat);
    side.position.set(sign * 7, fh / 2, 2.5);
    side.rotation.y = sign * -Math.PI / 3.2;
    root.add(side);
  }

  // TRUE 3D WORLD (hero field): loads async; on success the flat backdrop +
  // skyline hide and real geometry takes the horizon. On failure nothing
  // changes — the legacy backdrop below is the fallback.
  const world3d = !!fieldData.world3d;
  if (world3d) {
    import('./world/blacktop.js').then(async ({ loadBlacktopWorld }) => {
      const world = await loadBlacktopWorld();
      root.add(world);
      if (handles.backdrop) handles.backdrop.visible = false;
      if (handles.backdropVideo) { try { handles.backdropVideo.pause(); } catch { /* fine */ } }
      if (handles.skyline) handles.skyline.visible = false;
    }).catch((e) => console.warn('[skk] 3d world unavailable, keeping backdrop:', e));
  }

  // --- backdrop: ONE cohesive Higgsfield-designed scene (fans + city + sky),
  //     animated as a looping video, in the SAME stylized-realistic 3D render
  //     style as the players. Wraps the field and replaces the old stitched
  //     skyline + 2D crowd layers. -------------------------------------------
  const hasBackdrop = !!(fieldData.textures?.backdrop || fieldData.textures?.backdropVideo);
  if (hasBackdrop) {
    // MIRRORED horizontal wrap + EVEN repeat = a fully SEAMLESS ring: the panorama
    // reflects at every boundary (including the cylinder's own wrap point), so
    // there is no hard edge anywhere — the non-tileable image can't show a seam.
    // Vertical crop drops the lowest crowd row so the fans read as a thinner band
    // over the fence (a distant stadium crowd) instead of full looming bodies.
    const tuneTex = (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.MirroredRepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      // 4 horizontal tiles keeps the fans small/distant (a 2-tile crowd looked too big).
      // Still EVEN so the mirrored ring stays seamless at every boundary (incl. the wrap point).
      t.repeat.set(4, 0.82); t.offset.y = 0.18;
    };
    // Put the still poster IN the material from the start (so it actually renders),
    // then swap to the looping video once it really starts playing. Robust if the
    // clip is slow, blocked by autoplay policy, or missing — the still stays up.
    const stillTex = fieldData.textures?.backdrop
      ? new THREE.TextureLoader().load(fieldData.textures.backdrop, tuneTex)
      : null;
    const mat = new THREE.MeshBasicMaterial({ map: stillTex, side: THREE.BackSide, fog: false });
    // Full-bright: the sky dome + cap sample this image's top pixels at full brightness,
    // so dimming the material here desynced the join and showed a hard sky seam.
    if (fieldData.textures?.backdropVideo) {
      const video = document.createElement('video');
      video.src = fieldData.textures.backdropVideo;
      video.loop = true; video.muted = true; video.autoplay = true; video.playsInline = true;
      video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
      const kick = () => { video.play().catch(() => {}); };
      video.addEventListener('playing', () => {
        const v = new THREE.VideoTexture(video);
        tuneTex(v);
        mat.map = v; mat.needsUpdate = true;
      }, { once: true });
      kick();
      window.addEventListener('pointerdown', kick, { once: true }); // mobile autoplay may need a gesture
      handles.backdropVideo = video;
    }
    // Backdrop sizing (overridable per-field via fieldData.backdropGeo). Pushed
    // well back beyond the fence so the crowd reads as a distant stadium ring,
    // not looming right on top of the court.
    const bg = fieldData.backdropGeo ?? {};
    const bdR = bg.r ?? 76, bdH = bg.h ?? 44, bdBottom = bg.bottom ?? -2;
    const backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(bdR, bdR, bdH, 96, 1, true, 0, Math.PI * 2),
      mat,
    );
    backdrop.position.set(0, bdBottom + bdH / 2, 0);
    root.add(backdrop);
    handles.backdrop = backdrop;
    handles.backdropTopY = bdBottom + bdH; // where the seamless sky-cap continues from
    handles.backdropR = bdR;
  } else {

  // --- skyline + buildings beyond the fence (fallback when no backdrop) -------
  let skylineTex, skylineH = 46, skylineY = 14;
  if (fieldData.textures?.skyline) {
    skylineTex = new THREE.TextureLoader().load(fieldData.textures.skyline, (t) => { t.colorSpace = THREE.SRGBColorSpace; });
    skylineTex.wrapS = THREE.RepeatWrapping;
    // Crop to just the BUILDINGS: drop the panorama's court floor (bottom) AND its
    // baked-in sky (top) so the city silhouette sits clean against the sky dome —
    // no double-sky seam. A shorter, lower cylinder keeps the buildings on the horizon.
    skylineTex.repeat.set(3, 0.56);
    skylineTex.offset.y = 0.15;
    skylineH = 30;
    skylineY = 7;
  } else {
    skylineTex = makeSkylineTexture();
  }
  const skyline = new THREE.Mesh(
    new THREE.CylinderGeometry(110, 110, skylineH, 48, 1, true, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ map: skylineTex, side: THREE.BackSide, fog: false, transparent: true }),
  );
  skyline.position.set(0, skylineY, -20);
  root.add(skyline);
  handles.skyline = skyline;

  // box buildings only when there's no painted skyline to carry the backdrop
  if (!fieldData.textures?.skyline) {
    const buildingMat1 = new THREE.MeshStandardMaterial({ map: makeBuildingTexture('#7a4a32'), roughness: 0.9 });
    const buildingMat2 = new THREE.MeshStandardMaterial({ map: makeBuildingTexture('#5d6066'), roughness: 0.9 });
    const buildingDefs = [
      [-48, 8, -72, 16, 16, buildingMat1],
      [-18, 11, -82, 18, 22, buildingMat2],
      [16, 7, -80, 14, 14, buildingMat1],
      [48, 10, -70, 15, 20, buildingMat2],
    ];
    for (const [x, y, z, w, h, mat] of buildingDefs) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 12), mat);
      b.position.set(x, y, z);
      root.add(b);
    }
  }

  }

  handles.crowdEnergy = 0; // read by audio/FX
  handles.updateCrowd = () => {}; // backdrop motion comes from its own looping video

  // --- sky + lighting ----------------------------------------------------------
  // Far sphere dome for the zenith, PLUS a same-radius "sky cap" cylinder that
  // continues the backdrop's own sky straight up with no parallax — so the rich
  // sky goes high enough and the join is seamless and natural (no design change).
  // world3d fields use the per-sky GRADIENT (golden-hour dusk), not the baked
  // daytime sky photo that matched the old backdrop
  const skyMap = (fieldData.textures?.sky && !world3d)
    ? new THREE.TextureLoader().load(fieldData.textures.sky, (t) => { t.colorSpace = THREE.SRGBColorSpace; })
    : makeSkyGradient(fieldData.sky);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, fog: false }),
  );
  root.add(sky);
  handles.sky = sky;

  let skyCap = null;
  if (handles.backdropR && !fieldData.textures?.sky) {
    const capH = 220;
    skyCap = new THREE.Mesh(
      new THREE.CylinderGeometry(handles.backdropR + 0.4, handles.backdropR + 0.4, capH, 64, 1, true, 0, Math.PI * 2),
      new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, fog: false }),
    );
    skyCap.position.set(0, handles.backdropTopY - 1 + capH / 2, 0); // overlaps the backdrop top a hair
    root.add(skyCap);
    handles.skyCap = skyCap;
  }

  // Sample the VERY TOP of the backdrop image and continue that exact sky upward
  // on the cap (seamless) and the dome — no hard colour band, looks natural.
  if (fieldData.textures?.backdrop && !fieldData.textures?.sky) {
    const img = new Image();
    img.onload = () => {
      try {
        const cw = 24, ch = 6;
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const c2 = cv.getContext('2d');
        c2.drawImage(img, 0, 0, img.width, Math.max(1, Math.floor(img.height * 0.05)), 0, 0, cw, ch);
        const d = c2.getImageData(0, 0, cw, ch).data;
        // Use the DARKER pixels of the strip so bright fireworks / floodlights /
        // lit windows don't skew the sky colour brighter than it really is.
        const px = [];
        for (let i = 0; i < d.length; i += 4) {
          px.push([d[i], d[i + 1], d[i + 2], 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]]);
        }
        px.sort((a, b2) => a[3] - b2[3]);
        const dark = px.slice(0, Math.max(1, Math.floor(px.length * 0.6)));
        let r = 0, g = 0, b = 0;
        for (const p of dark) { r += p[0]; g += p[1]; b += p[2]; }
        r = Math.round(r / dark.length); g = Math.round(g / dark.length); b = Math.round(b / dark.length);
        // Never crush the upper sky to black: lift a dark sky toward a deep
        // night-blue so it reads as a real night sky, not an empty black void.
        // Luminance-based so bright skies are untouched and fireworks/floodlights
        // in the sample can't fool it into staying black.
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const t = Math.min(1, Math.max(0, (74 - lum) / 74));
        const lr = Math.round(r + (38 - r) * t);
        const lg = Math.round(g + (52 - g) * t);
        const lb = Math.round(b + (104 - b) * t);
        if (skyCap) { skyCap.material.map = makeSkyCapGradient([r, g, b], [lr, lg, lb]); skyCap.material.needsUpdate = true; }
        sky.material.map = makeDomeGradient(lr, lg, lb); sky.material.needsUpdate = true;
      } catch (e) { /* keep the fallback */ }
    };
    img.src = fieldData.textures.backdrop;
  }

  const lp = SKY_PRESETS[fieldData.sky] ?? SKY_PRESETS.day;

  // Light exponential fog tinted toward the horizon sky so the midground/outfield
  // recedes into the backdrop (a real depth cue). The backdrop + sky materials carry
  // fog:false, so only the FIELD geometry and players haze with distance — never the
  // sky/crowd. Density kept low so the infield stays crisp and un-greyed.
  const fogColor = (SKY_DOME[fieldData.sky] ?? SKY_DOME.day)[3];
  scene.fog = new THREE.FogExp2(new THREE.Color(fogColor), 0.004);

  const hemi = new THREE.HemisphereLight(lp.hemiSky, lp.hemiGround, lp.hemiI);
  root.add(hemi);
  // a small ambient floor so ACES tone-mapping never crushes the court to black
  root.add(new THREE.AmbientLight(lp.amb ?? '#55585f', lp.ambI ?? 0.3));
  const sun = new THREE.DirectionalLight(lp.sun, lp.sunI);
  // golden-hour 3D world: LOW warm sun from the third-base side -> long dusk
  // shadows across the asphalt (the mood the whole world bake is lit for)
  if (world3d) sun.position.set(-34, 17, 24);
  else sun.position.set(28, 40, 18);
  sun.castShadow = true;
  // Higher-res map + a tighter frustum (±38 still covers the ~42m fence play near home)
  // = crisper contact shadows. Bias pair kills shadow acne and peter-panning.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  root.add(sun);
  handles.sun = sun;
  handles.hemi = hemi;

  // Rim / back light from behind-above the play: skims the tops and edges of the
  // players and ball so they pop off the crowd ring (a broadcast separation cue).
  // Accent only — casts no shadow, modest intensity — tinted with the preset's sky
  // hue so it reads cool or warm to match the field's mood. Aims at home (origin).
  const rim = new THREE.DirectionalLight(lp.hemiSky, 0.28);
  rim.position.set(-20, 30, -40);
  rim.castShadow = false;
  root.add(rim);

  scene.add(root);
  return handles;
}

// ---------- canvas texture helpers ----------

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A subtle vertical sky dome built around one colour (sampled from a backdrop's
// own sky): a touch deeper at the zenith, matching the backdrop edge at the
// horizon so the join is invisible.
function makeDomeGradient(r, g, b) {
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return canvasTexture(64, 256, (ctx, w, h) => {
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, `rgb(${cl(r * 0.80)},${cl(g * 0.80)},${cl(b * 0.82)})`); // zenith, a touch deeper
    grd.addColorStop(1, `rgb(${cl(r * 1.04)},${cl(g * 1.04)},${cl(b * 1.04)})`); // horizon ≈ backdrop sky
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
}

// Sky-cap gradient for the same-radius continuation cylinder. Bottom = the exact
// backdrop top edge (seamless join); it eases up to the `lift` colour (a deep but
// never-black sky) and only gently deepens above that. `raw`/`lift` are [r,g,b].
function makeSkyCapGradient(raw, lift) {
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return canvasTexture(64, 256, (ctx, w, h) => {
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, `rgb(${cl(raw[0])},${cl(raw[1])},${cl(raw[2])})`);                           // bottom = backdrop top (seamless)
    grd.addColorStop(0.08, `rgb(${cl(lift[0])},${cl(lift[1])},${cl(lift[2])})`);                     // quickly up to the sky colour
    grd.addColorStop(1, `rgb(${cl(lift[0] * 0.92)},${cl(lift[1] * 0.93)},${cl(lift[2] * 0.95)})`);   // high sky (top), gently deeper
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
}

function makeAsphaltTexture(baseColor) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

// A subtle tangent-space normal map for the blacktop: a flat blue base (128,128,255)
// peppered with tiny perturbed-normal flecks so floodlights catch a fine grain. Linear
// colour space (NOT sRGB) — a normal map encodes vectors, not colour.
function makeAsphaltNormal() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4500; i++) {
    const dx = Math.round((Math.random() - 0.5) * 70);
    const dy = Math.round((Math.random() - 0.5) * 70);
    ctx.fillStyle = `rgb(${128 + dx},${128 + dy},255)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeChainLinkTexture() {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(220,225,230,0.9)';
    ctx.lineWidth = 2.5;
    const step = 16;
    for (let x = -h; x < w + h; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + h, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  });
  tex.repeat.set(4, 1.5);
  return tex;
}

function makeBuildingTexture(base) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let y = 16; y < h - 12; y += 34) {
      for (let x = 14; x < w - 12; x += 30) {
        ctx.fillStyle = Math.random() > 0.35 ? '#1b2026' : '#ffd98a';
        ctx.fillRect(x, y, 16, 20);
      }
    }
  });
}

function makeSkylineTexture() {
  return canvasTexture(2048, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 40 + Math.random() * 90;
      const bh = 60 + Math.random() * 150;
      ctx.fillStyle = `rgba(${40 + Math.random() * 30}, ${45 + Math.random() * 30}, ${60 + Math.random() * 30}, 0.85)`;
      ctx.fillRect(x, h - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,220,140,0.5)';
      for (let wy = h - bh + 8; wy < h - 8; wy += 18) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 16) {
          if (Math.random() > 0.6) ctx.fillRect(wx, wy, 5, 8);
        }
      }
      x += bw + 6 + Math.random() * 24;
    }
  });
}

// Per-sky-type dome gradient (zenith -> horizon) so the sliver of sky above each
// city's backdrop matches its mood. Keyed by fields.json `sky`.
const SKY_DOME = {
  'day':           ['#2f6fce', '#6ea4e4', '#aecdf0', '#dcebf6'],
  'sodium-night':  ['#0e1326', '#241a2a', '#3a2a22', '#5a3a24'],
  'dusk':          ['#1f2350', '#4a3a78', '#a85a7a', '#e08a5a'],
  'neon-night':    ['#0c0f2a', '#1b1f4a', '#2a2060', '#3a2a70'],
  'golden-hour':   ['#2a5a9a', '#7a9ad0', '#f0c070', '#ffd9a0'],
  'shaft-light':   ['#2a3340', '#4a5560', '#8a93a0', '#c0c8d0'],
  'overcast':      ['#8a909a', '#a8aeb6', '#c2c6cc', '#d6d9dd'],
  'winter':        ['#9fb4cc', '#c2d2e2', '#dde8f2', '#eef4fa'],
  'desert-sunset': ['#2a3a7a', '#7a4a8a', '#e07a4a', '#ffb060'],
  'stadium-night': ['#0a1024', '#161e3e', '#22305a', '#2e3e6e'],
};

function makeSkyGradient(skyType) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const [s0, s1, s2, s3] = SKY_DOME[skyType] ?? SKY_DOME.day;
    g.addColorStop(0, s0);     // zenith
    g.addColorStop(0.45, s1);
    g.addColorStop(0.78, s2);
    g.addColorStop(1, s3);     // horizon
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft clouds drifting through the lower-mid sky so it reads as a complete sky,
    // not a flat band cut off above the skyline
    if (skyType === 'day') {
      ctx.globalAlpha = 1;
      for (let i = 0; i < 26; i++) {
        const cx = Math.random() * w;
        const cy = h * (0.32 + Math.random() * 0.5);
        const cw = 40 + Math.random() * 120;
        const ch = cw * (0.32 + Math.random() * 0.18);
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
        grd.addColorStop(0, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}
