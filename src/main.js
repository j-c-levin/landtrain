import * as THREE from 'three';
import { createWorld } from './world.js';
import { SkyCycle } from './sky.js';
import { Train } from './train.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { FogOfWar } from './fog.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';
import { AudioFX } from './audio.js';
import { LANDMARK, ARRIVE_RADIUS, TUNING, WORLD, CAB_FROM_X, clamp } from './constants.js';

// ----------------------------------------------------------------- input
const keys = new Set();
const pressedThisFrame = new Set();
const input = {
  down: (code) => keys.has(code),
  pressed: (code) => pressedThisFrame.has(code),
};

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressedThisFrame.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ----------------------------------------------------------------- setup
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 9000);

const world = createWorld(scene);
const sky = new SkyCycle(scene, renderer, world.sunLight);
const fog = new FogOfWar(scene);
const train = new Train(scene);
const player = new Player(train, scene);
const rig = new CameraRig(camera, train, player);
const ui = new UI();
const audio = new AudioFX();
const interactions = new Interactions({ train, player, rig, ui, audio });

train.onEvent = (name) => {
  if (name === 'blocked') {
    audio.chime('soft');
    ui.toast('The way ahead is blocked — head to the cab and plot a way around.');
  } else if (name === 'route-finished' && !state.arrived) {
    ui.toast('End of the plotted route. The train rests — extend it from the cab.');
  }
};

const state = {
  arrived: false,
  lastRevealAt: -999,
  started: false,
};

// time scale for tuning/testing: ?ts=4
const params = new URLSearchParams(location.search);
const timeScale = clamp(parseFloat(params.get('ts') || '1') || 1, 0.1, 20);

// first reveal around the spawn point
fog.reveal(train.pos.x, train.pos.z, TUNING.revealRadius * 1.3);
state.lastRevealAt = 0;

// ------------------------------------------------------------- map input
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

let dragging = false;
let dragMoved = 0;
let lastPointer = { x: 0, y: 0 };

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if ((rig.mode !== 'map' && rig.mode !== 'book') || rig.busy) return;
  dragging = true;
  dragMoved = 0;
  lastPointer = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (rig.mode === 'map' && dragMoved > 6) {
    rig.panMap(dx, dy, window.innerHeight);
  } else if (rig.mode === 'book') {
    rig.orbitDrag(dx, dy);
  }
  lastPointer = { x: e.clientX, y: e.clientY };
});

window.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  if (rig.mode !== 'map' || rig.busy) return;
  if (dragMoved > 6 || e.button === 2) return; // it was a pan, not a click

  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    if (train.addWaypoint(hit.x, hit.z)) audio.chime('waypoint');
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (rig.mode === 'map') {
      e.preventDefault();
      rig.zoomMap(Math.exp(e.deltaY * 0.0011));
    } else if (rig.mode === 'book') {
      e.preventDefault();
      rig.orbitZoom(Math.exp(e.deltaY * 0.0011));
    }
  },
  { passive: false }
);

// ------------------------------------------------------------- intro card
ui.intro(() => {
  audio.start();
  state.started = true;
});

// ----------------------------------------------------------------- resize
// Reconciled every frame instead of trusting resize events: CSS keeps the
// canvas at 100% of the viewport, and we match the drawing buffer to its
// actual on-screen size × devicePixelRatio. This survives fullscreen
// transitions, browser zoom, and moving between displays with different
// pixel ratios — all cases where a one-shot 'resize' listener misses.
function syncRendererSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false); // false: leave CSS sizing alone
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
syncRendererSize();

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  syncRendererSize();
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
  elapsed += dt;

  if (state.started) {
    // global keys
    if (pressedThisFrame.has('KeyM')) ui.setMuted(audio.toggleMute());
    if (rig.mode === 'map' && !rig.busy) {
      if (pressedThisFrame.has('KeyZ') || pressedThisFrame.has('Backspace')) train.undoWaypoint();
      if (pressedThisFrame.has('KeyC')) train.clearRoute();
    }
    if (rig.mode === 'book' && !rig.busy && pressedThisFrame.has('KeyO')) {
      const on = rig.toggleAutoOrbit();
      ui.toast(on ? 'gentle orbit' : 'view held', 1600);
    }

    interactions.update(dt, input);

    if (rig.mode === 'inhabit' && !rig.busy) {
      player.update(dt, input, elapsed);
    } else if (player.sitting) {
      player.update(dt, input, elapsed);
    }

    train.paused = rig.mapEngaged;
    train.update(dt, elapsed, world.obstacles);

    // fog peels back as the train travels
    if (train.distanceTraveled - state.lastRevealAt >= TUNING.revealEvery) {
      state.lastRevealAt = train.distanceTraveled;
      fog.reveal(train.pos.x, train.pos.z, TUNING.revealRadius);
    }

    // arrival — gentle, once
    if (!state.arrived) {
      const d = Math.hypot(train.pos.x - LANDMARK.x, train.pos.z - LANDMARK.z);
      if (d < ARRIVE_RADIUS) {
        state.arrived = true;
        train.clearRoute();
        audio.chime('arrive');
        fog.reveal(LANDMARK.x, LANDMARK.z, 220);
        setTimeout(() => ui.arrival(), 1400);
      }
    }
  }

  rig.update(dt, elapsed);
  rig.applySceneFog(scene.fog);
  fog.setBlend(rig.mapBlend);

  // see-through walls follow the player; book mode seals the whole train
  const zone =
    player.level === 'roof' && player.x > CAB_FROM_X
      ? 'cab'
      : 'car' + (player.x > 8.3 ? 0 : player.x < -8.3 ? 2 : 1);
  train.setFocus(zone, rig.mode === 'book' || rig.transitionTarget === 'book', dt);

  train.updateRouteDisplay(rig.mapBlend, elapsed);
  ui.setGauges(train.eff, train.wear);
  ui.setMode(rig.busy ? (rig.mapEngaged ? 'map' : 'transition') : rig.mode);
  world.update(dt, elapsed, train.pos, camera.position);
  sky.update(dt, elapsed, camera, train.pos, scene.fog);
  audio.update(dt, train.speed / TUNING.baseSpeed);

  pressedThisFrame.clear();
  renderer.render(scene, camera);
}

tick();

// debug / verification handle
window.__game = { train, player, rig, fog, state, world, sky, camera, WORLD };
