// tools/worldbake.js — PREVIEW harness for the Blacktop's living 3D world.
// Imports the REAL runtime module (src/game/world/blacktop.js) so what you see
// here is exactly what ships: Higgsfield buildings, el train, steam, sky dome.
// Orbit to inspect; buttons jump to the in-game POVs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadBlacktopWorld } from '../src/game/world/blacktop.js';

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.join(' ') + '\n'; logEl.scrollTop = logEl.scrollHeight; console.log(...a); };

// ---------- scene + the game's dusk lighting rig ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b3350');
scene.add(new THREE.HemisphereLight(0xffd9b0, 0x2e3a55, 0.9));
scene.add(new THREE.AmbientLight(0x55585f, 0.3));
const sun = new THREE.DirectionalLight(0xffB070, 1.6);
sun.position.set(-34, 17, 24);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 30, 90);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 8, -40);

// field footprint reference: fence ring at 42m + court disc
const ring = new THREE.Mesh(new THREE.TorusGeometry(42, 0.15, 6, 64), new THREE.MeshBasicMaterial({ color: '#3ec6b5' }));
ring.rotation.x = Math.PI / 2;
scene.add(ring);
const court = new THREE.Mesh(
  new THREE.CircleGeometry(46, 48),
  new THREE.MeshStandardMaterial({ color: '#3c3f44', roughness: 1 }),
);
court.rotation.x = -Math.PI / 2;
scene.add(court);

// ---------- the actual world ----------
let update = null;
loadBlacktopWorld().then((world) => {
  scene.add(world.group);
  update = world.update;
  log('world loaded');
}).catch((e) => log('WORLD FAILED:', e.message ?? e));

// ---------- POV buttons ----------
const ui = document.getElementById('ui');
const btn = (label, fn) => {
  const b = document.createElement('button');
  b.textContent = label; b.onclick = fn; ui.appendChild(b);
};
btn('HOME PLATE VIEW', () => { camera.position.set(0, 3, 8); controls.target.set(0, 8, -42); });
btn('PITCHER VIEW (behind home)', () => { camera.position.set(0, 5, -19); controls.target.set(0, 6, 30); });
btn('BALL FLIGHT (high)', () => { camera.position.set(-12, 26, 12); controls.target.set(6, 4, -34); });
btn('EL TRAIN', () => { camera.position.set(0, 12, -40); controls.target.set(0, 10, -74); });

window.__scene = scene;
const clock = new THREE.Clock();
let elapsed = 0;
renderer.setAnimationLoop(() => {
  elapsed += clock.getDelta();
  if (update) update(elapsed);
  controls.update();
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
