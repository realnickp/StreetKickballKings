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

  // --- skyline + buildings beyond the fence ----------------------------------
  let skylineTex;
  if (fieldData.textures?.skyline) {
    skylineTex = new THREE.TextureLoader().load(fieldData.textures.skyline, (t) => { t.colorSpace = THREE.SRGBColorSpace; });
    skylineTex.wrapS = THREE.RepeatWrapping;
    skylineTex.repeat.set(3, 0.82); // tile around the ring; crop the panorama's court floor
    skylineTex.offset.y = 0.18;
  } else {
    skylineTex = makeSkylineTexture();
  }
  const skyline = new THREE.Mesh(
    new THREE.CylinderGeometry(110, 110, 46, 48, 1, true, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ map: skylineTex, side: THREE.BackSide, fog: false, transparent: true }),
  );
  skyline.position.set(0, 14, -20);
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

  // --- bleachers + instanced crowd -------------------------------------------
  const bleacherMat = new THREE.MeshStandardMaterial({ color: '#3a6b8a', roughness: 0.8 });
  for (const sign of [1, -1]) {
    for (let row = 0; row < 3; row++) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 1.4), bleacherMat);
      bench.position.set(sign * (16 + row * 1.5), 0.5 + row * 0.9, 2 + row * 0.4);
      bench.rotation.y = sign * -Math.PI / 14;
      root.add(bench);
    }
  }

  const crowdCount = 140;
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.5, 2, 6);
  const crowdMat = new THREE.MeshLambertMaterial();
  const crowd = new THREE.InstancedMesh(bodyGeo, crowdMat, crowdCount);
  const dummy = new THREE.Object3D();
  const crowdColors = ['#e0701a', '#1d8ac4', '#f5b312', '#c8102e', '#2e5944', '#d9d9d9', '#7a4a32', '#444a55'];
  const crowdSeats = [];
  for (let i = 0; i < crowdCount; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const row = Math.floor(Math.random() * 3);
    const x = sign * (16 + row * 1.5 + (Math.random() - 0.5) * 0.6);
    const z = 2 + row * 0.4 + (Math.random() - 0.5) * 1.0;
    const y = 1.1 + row * 0.9;
    dummy.position.set(x + (Math.random() - 0.5) * 12 * 0.9, y, z);
    dummy.rotation.y = sign * -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    crowd.setColorAt(i, new THREE.Color(crowdColors[i % crowdColors.length]));
    crowdSeats.push({ x: dummy.position.x, y, z, phase: Math.random() * Math.PI * 2 });
  }
  crowd.instanceMatrix.needsUpdate = true;
  root.add(crowd);
  handles.crowd = crowd;
  handles.crowdSeats = crowdSeats;
  handles.crowdEnergy = 0; // 0 idle … 1 going wild; matchScene/cinematics drive this

  // bounce the crowd — subtle at rest, jumping when energy spikes
  handles.updateCrowd = (elapsed) => {
    for (let i = 0; i < crowdCount; i++) {
      const seat = crowdSeats[i];
      const amp = 0.05 + handles.crowdEnergy * 0.35;
      dummy.position.set(seat.x, seat.y + Math.abs(Math.sin(elapsed * (3 + handles.crowdEnergy * 6) + seat.phase)) * amp, seat.z);
      dummy.rotation.y = (seat.x > 0 ? -1 : 1) * Math.PI / 2;
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    }
    crowd.instanceMatrix.needsUpdate = true;
  };

  // --- sky + lighting ----------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 24, 12),
    new THREE.MeshBasicMaterial({ map: makeSkyGradient(fieldData.sky), side: THREE.BackSide, fog: false }),
  );
  root.add(sky);

  const hemi = new THREE.HemisphereLight('#cfe0ff', '#6a655e', 1.25);
  root.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2dd', 2.0);
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
