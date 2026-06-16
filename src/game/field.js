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

// Per-sky lighting so every city reads as its own time-of-day (hemisphere sky/
// ground tint + sun colour/intensity). Keyed by fields.json `sky`.
const SKY_PRESETS = {
  'day':           { hemiSky: '#cfe0ff', hemiGround: '#6a655e', sun: '#fff2dd', sunI: 2.0, hemiI: 1.25 },
  'sodium-night':  { hemiSky: '#3a3550', hemiGround: '#2a2620', sun: '#ffb066', sunI: 1.1, hemiI: 0.7 },
  'dusk':          { hemiSky: '#ffb98a', hemiGround: '#4a3f4a', sun: '#ff9d6b', sunI: 1.6, hemiI: 1.0 },
  'neon-night':    { hemiSky: '#2a2f5a', hemiGround: '#241a30', sun: '#8a78ff', sunI: 1.1, hemiI: 0.85 },
  'golden-hour':   { hemiSky: '#ffd9a0', hemiGround: '#5a4632', sun: '#ffb867', sunI: 2.0, hemiI: 1.2 },
  'shaft-light':   { hemiSky: '#9fb0c4', hemiGround: '#3a3a3f', sun: '#fff0d6', sunI: 1.7, hemiI: 0.85 },
  'overcast':      { hemiSky: '#b8bcc2', hemiGround: '#5a5650', sun: '#d8d4cc', sunI: 1.1, hemiI: 1.3 },
  'winter':        { hemiSky: '#dce8f5', hemiGround: '#9aa6b0', sun: '#eaf2ff', sunI: 1.6, hemiI: 1.4 },
  'desert-sunset': { hemiSky: '#ffae73', hemiGround: '#6b4a36', sun: '#ff8a4d', sunI: 2.0, hemiI: 1.15 },
  'stadium-night': { hemiSky: '#2e3358', hemiGround: '#22202c', sun: '#ffffff', sunI: 1.9, hemiI: 0.95 },
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
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 });
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
      new THREE.MeshStandardMaterial({ color: '#f5f2e8', roughness: 0.6 }),
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
  });
  const postMat = new THREE.MeshStandardMaterial({ color: '#6f7578', roughness: 0.5, metalness: 0.6 });
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

  // --- backdrop: ONE cohesive Higgsfield-designed scene (fans + city + sky),
  //     animated as a looping video, in the SAME stylized-realistic 3D render
  //     style as the players. Wraps the field and replaces the old stitched
  //     skyline + 2D crowd layers. -------------------------------------------
  const hasBackdrop = !!(fieldData.textures?.backdrop || fieldData.textures?.backdropVideo);
  if (hasBackdrop) {
    let bdTex;
    if (fieldData.textures?.backdropVideo) {
      const video = document.createElement('video');
      video.src = fieldData.textures.backdropVideo;
      video.loop = true; video.muted = true; video.autoplay = true; video.playsInline = true;
      video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
      const kick = () => { video.play().catch(() => {}); };
      kick();
      window.addEventListener('pointerdown', kick, { once: true }); // autoplay may need a gesture
      bdTex = new THREE.VideoTexture(video);
      handles.backdropVideo = video;
    } else {
      bdTex = new THREE.TextureLoader().load(fieldData.textures.backdrop, (t) => { t.colorSpace = THREE.SRGBColorSpace; });
    }
    bdTex.colorSpace = THREE.SRGBColorSpace;
    bdTex.wrapS = THREE.RepeatWrapping;
    bdTex.repeat.set(2, 1); // wrap the panorama twice so people/buildings keep their proportions
    const bdH = 34, bdR = 48, bdBottom = -2; // sized so the fans sit just beyond the fence
    const backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(bdR, bdR, bdH, 80, 1, true, 0, Math.PI * 2),
      new THREE.MeshBasicMaterial({ map: bdTex, side: THREE.BackSide, fog: false }),
    );
    backdrop.position.set(0, bdBottom + bdH / 2, 0);
    root.add(backdrop);
    handles.backdrop = backdrop;
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
  // A generated full-sky dome when the field defines one, else the canvas gradient.
  const skyMap = fieldData.textures?.sky
    ? new THREE.TextureLoader().load(fieldData.textures.sky, (t) => { t.colorSpace = THREE.SRGBColorSpace; })
    : makeSkyGradient(fieldData.sky);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, fog: false }),
  );
  root.add(sky);
  handles.sky = sky;

  const lp = SKY_PRESETS[fieldData.sky] ?? SKY_PRESETS.day;
  const hemi = new THREE.HemisphereLight(lp.hemiSky, lp.hemiGround, lp.hemiI);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(lp.sun, lp.sunI);
  sun.position.set(28, 40, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 120;
  root.add(sun);

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

function makeSkyGradient(skyType) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (skyType === 'day') {
      g.addColorStop(0, '#2f6fce');   // deep zenith blue
      g.addColorStop(0.45, '#6ea4e4');
      g.addColorStop(0.78, '#aecdf0');
      g.addColorStop(1, '#dcebf6');   // pale horizon — matches the skyline panorama's sky
    } else {
      g.addColorStop(0, '#141a2e');
      g.addColorStop(0.7, '#2a2746');
      g.addColorStop(1, '#3a2e4f');
    }
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
