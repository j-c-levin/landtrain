import * as THREE from 'three';
import { createWorld } from './world.js';
import { createGrassland } from './grassland.js';
import { SkyCycle } from './sky.js';
import { Train } from './train.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { FogOfWar } from './fog.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';
import { AudioFX } from './audio.js';
import { TUNING, WORLD, CAB_FROM_X, clamp } from './constants.js';
import { edgePlacement } from './markers.js';

// ----------------------------------------------------------------- input
const keys = new Set();
const pressedThisFrame = new Set();
const input = {
  down: (code) => keys.has(code),
  pressed: (code) => pressedThisFrame.has(code),
};
// fed to the player while it shouldn't be driving (mid-transition, map, book)
// so its rig still re-syncs onto the train each frame without taking input
const NEUTRAL_INPUT = { down: () => false, pressed: () => false };

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
const markerVec = new THREE.Vector3();
const fwdDir = new THREE.Vector3();

const world = createWorld(scene);
// The world the loop currently drives. Reassigned to the grassland when the
// prairie is torn down — everything downstream reads activeWorld, never `world`.
let activeWorld = world;
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
  // `arrived` = the current biome's tree has been handled (transition started,
  // or end beat shown). Re-armed (false) after a biome swap.
  arrived: false,
  started: false,
  biome: 'prairie', // 'prairie' | 'grassland'
  transitioning: false, // gates gameplay while the cutscene + swap run
  // distance travelled at the last fog reveal, so the travel loop fires on
  // distance rather than time.
  lastRevealAt: 0,
};

// Reveal a forward-fanning cone at the train, aimed along where it FACES (not
// where it has been) — so the cone is there from the first frame at spawn, even
// before the train moves, and always points the way the cab view looks.
function revealAhead() {
  train.forwardDir(fwdDir);
  fog.revealCone(
    train.pos.x,
    train.pos.z,
    fwdDir.x,
    fwdDir.z,
    TUNING.revealRadius,
    TUNING.revealRadius * TUNING.revealForwardMult,
    TUNING.revealConeEndRadius,
    TUNING.revealConeNearRadius,
    TUNING.revealConeSteps
  );
}

// ----------------------------------------------------------- transition
// Prairie → grassland, the one-way move. Runs ONCE on reaching the prairie
// tree. state.transitioning gates the loop (input, interactions, train) so the
// world is quiet while we cut, fade, dispose the prairie, build the grassland,
// and fade back in. The fade fully masks the dispose+build hitch. Every async
// step is guarded so a throw can never leave the screen black or the loop
// wedged — on any error we force the rig back to inhabit and fade in.
async function transitionToGrassland() {
  state.transitioning = true;
  train.clearRoute();
  train.paused = true;
  audio.chime('arrive');

  // 1. cutscene — a warm wide two-shot of train + glowing tree, held a beat
  rig.startArrivalCutscene();
  await wait(2600);

  try {
    // 2. fade to black, then do the swap entirely unseen
    await ui.fadeOut(900);

    world.dispose(); // free the prairie's GPU buffers
    const g = createGrassland(scene);
    activeWorld = g;
    sky.setSunLight(g.sunLight);
    sky.setBiome('grassland');
    audio.setBiome('grassland');
    fog.reset();
    train.reset(g.start);
    state.lastRevealAt = 0;
    revealAhead(); // re-light the cone at the new spawn

    // snap the rig cleanly to the cutaway at the new train — no stale tween
    rig.resetToInhabit();
    state.biome = 'grassland';
    state.arrived = false; // re-arm arrival for the grassland tree
  } catch (err) {
    // never strand the player under black — recover to a playable state
    console.error('[transition] failed, recovering', err);
    rig.resetToInhabit();
  }

  // 3. fade in on the grassland; a soft welcome chime
  train.paused = false;
  await ui.fadeIn(900);
  audio.chime('soft');
  state.transitioning = false;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// time scale for tuning/testing: ?ts=4
const params = new URLSearchParams(location.search);
const timeScale = clamp(parseFloat(params.get('ts') || '1') || 1, 0.1, 20);

// first reveal at the spawn point — a forward cone along the train's facing,
// so the way ahead is already partly lit before you drive a single unit.
revealAhead();

// ------------------------------------------------------------- map input
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

// One finger (or the mouse) pans the map / orbits the book view; two
// fingers pinch-zoom. Pointers are tracked per-id so a second finger
// can't double-feed the drag.
const scenePointers = new Map(); // pointerId -> last position
let dragMoved = 0;
let pinchGap = 0;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function pinchGapNow() {
  const [a, b] = [...scenePointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener('pointerdown', (e) => {
  if ((rig.mode !== 'map' && rig.mode !== 'book') || rig.busy) return;
  if (scenePointers.size === 0) dragMoved = 0;
  scenePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (scenePointers.size === 2) {
    pinchGap = pinchGapNow();
    dragMoved += 999; // a pinch is never a waypoint tap
  }
});

canvas.addEventListener('pointermove', (e) => {
  const prev = scenePointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  prev.x = e.clientX;
  prev.y = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);

  if (scenePointers.size >= 2) {
    // pinch — fingers apart pulls the view closer
    const gap = pinchGapNow();
    if (pinchGap > 0 && gap > 0) {
      const factor = pinchGap / gap;
      if (rig.mode === 'map') rig.zoomMap(factor);
      else rig.orbitZoom(factor);
    }
    pinchGap = gap;
  } else if (rig.mode === 'map' && dragMoved > 6) {
    rig.panMap(dx, dy, window.innerHeight);
  } else if (rig.mode === 'book') {
    rig.orbitDrag(dx, dy);
  }
});

window.addEventListener('pointerup', (e) => {
  const wasTracked = scenePointers.delete(e.pointerId);
  if (scenePointers.size < 2) pinchGap = 0;
  if (!wasTracked) return;
  if (scenePointers.size > 0) return; // other fingers still down
  if (rig.mode !== 'map' || rig.busy) return;
  if (dragMoved > 6 || e.button === 2) return; // it was a pan/pinch, not a click

  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    if (train.addWaypoint(hit.x, hit.z)) audio.chime('waypoint');
  }
});
window.addEventListener('pointercancel', (e) => {
  scenePointers.delete(e.pointerId);
  if (scenePointers.size < 2) pinchGap = 0;
});

// ----------------------------------------------------------- touch zones
// Phone/tablet controls, synthesized into the same virtual key set the
// keyboard feeds — player & interaction logic stay unchanged. Left/right
// thirds walk; the middle column climbs (top) or descends (bottom) at
// ladders; the centre is E — tap to interact, keep a finger down to tend.
// Walk modes only (inhabit + cabin): map taps lay waypoints and book drags
// orbit, so zone-keys would fight them there.
const touchHolds = new Map(); // pointerId -> synthesized key code

function zoneCode(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (x < w / 3) return 'ArrowLeft';
  if (x > (2 * w) / 3) return 'ArrowRight';
  if (y < h / 3) return 'ArrowUp';
  if (y > (2 * h) / 3) return 'ArrowDown';
  return 'KeyE';
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  if ((rig.mode !== 'inhabit' && rig.mode !== 'cabin') || rig.busy) return;
  const code = zoneCode(e.clientX, e.clientY);
  touchHolds.set(e.pointerId, code);
  if (!keys.has(code)) pressedThisFrame.add(code);
  keys.add(code);
});

function releaseTouch(e) {
  const code = touchHolds.get(e.pointerId);
  if (code === undefined) return;
  touchHolds.delete(e.pointerId);
  // lift the key only when no other finger is holding the same zone
  if (![...touchHolds.values()].includes(code)) keys.delete(code);
}
window.addEventListener('pointerup', releaseTouch);
window.addEventListener('pointercancel', releaseTouch);

// ----------------------------------------------------------- view buttons
// Clear hit targets for the views a phone can't E/Escape out of.
function toggleOrbitView() {
  if (rig.mode !== 'book' || rig.busy) return;
  const on = rig.toggleAutoOrbit();
  ui.toast(on ? 'gentle orbit' : 'view held', 1600);
}

ui.bindViewButtons({
  onOrbit: toggleOrbitView,
  onUndo: () => {
    if (rig.mode === 'map' && !rig.busy) train.undoWaypoint();
  },
  onClear: () => {
    if (rig.mode === 'map' && !rig.busy) train.clearRoute();
  },
  onExit: () => {
    if (rig.busy) return;
    if (rig.mode === 'book') {
      player.stand();
      rig.exitBook();
    } else if (rig.mode === 'map') {
      rig.exitMap();
      audio.chime('soft');
    }
  },
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

// Project a world point (ground height) and decide its edge-marker placement.
function placeMarker(tx, tz) {
  markerVec.set(tx, 0, tz).project(camera);
  const behind = markerVec.z > 1; // point is behind the camera
  return edgePlacement(markerVec.x, markerVec.y, behind, 0.9); // 0.9 = ride 5% in from each edge
}

function tick() {
  requestAnimationFrame(tick);
  syncRendererSize();
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
  elapsed += dt;

  // While transitioning, gameplay is frozen: skip input, interactions, and the
  // train so the cutscene + biome swap run undisturbed. The camera rig still
  // ticks below (it owns the cutscene tween).
  if (state.started && !state.transitioning) {
    // global keys
    if (pressedThisFrame.has('KeyM')) ui.setMuted(audio.toggleMute());
    if (rig.mode === 'map' && !rig.busy) {
      if (pressedThisFrame.has('KeyZ') || pressedThisFrame.has('Backspace')) train.undoWaypoint();
      if (pressedThisFrame.has('KeyC')) train.clearRoute();
    }
    if (pressedThisFrame.has('KeyO')) toggleOrbitView();

    interactions.update(dt, input);

    // Always update so the player rig re-syncs onto the (still-moving) train
    // every frame — otherwise it goes stale in world space during camera
    // transitions, e.g. standing from a rest leaves it behind the train for
    // the length of the tween. Only feed real input when it's drivable.
    const controllable = (rig.mode === 'inhabit' || rig.mode === 'cabin') && !rig.busy;
    player.update(dt, controllable ? input : NEUTRAL_INPUT, elapsed);

    train.paused = rig.mapEngaged;
    train.update(dt, elapsed, activeWorld.obstacles);

    // fog peels back as the train travels — re-stamp the forward cone every
    // few units so it reveals as far ahead as the cutaway view can see.
    if (train.distanceTraveled - state.lastRevealAt >= TUNING.revealEvery) {
      state.lastRevealAt = train.distanceTraveled;
      revealAhead();
    }

    // arrival at the active biome's tree — gentle, once
    if (!state.arrived) {
      const lp = activeWorld.landmarkPos;
      const d = Math.hypot(train.pos.x - lp.x, train.pos.z - lp.z);
      if (d < activeWorld.arriveRadius) {
        state.arrived = true; // mark handled so it fires once
        if (state.biome === 'prairie') {
          // the prairie tree no longer ENDS the journey — it carries you on
          transitionToGrassland();
        } else {
          // the grassland tree — the end beat
          train.clearRoute();
          audio.chime('arrive');
          fog.reveal(lp.x, lp.z, 220);
          setTimeout(() => ui.endBeat(), 1400);
        }
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
  ui.setOrbitActive(rig.autoOrbit);
  // Edge markers are a map-view aid only — point to the tree (and back to the
  // train) along the map's borders, hidden in the inhabit and book views.
  if (state.started && rig.mapEngaged) {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    ui.setEdgeMarker('tree', placeMarker(activeWorld.landmarkPos.x, activeWorld.landmarkPos.z), W, H);
    ui.setEdgeMarker('train', placeMarker(train.pos.x, train.pos.z), W, H);
  } else {
    ui.hideEdgeMarkers();
  }
  activeWorld.update(dt, elapsed, train.pos, camera.position);
  sky.update(dt, elapsed, camera, train.pos, scene.fog);
  audio.update(dt, train.speed / TUNING.baseSpeed);

  pressedThisFrame.clear();
  renderer.render(scene, camera);
}

tick();

// debug / verification handle. activeWorld is a getter so it always reflects
// the live biome (the prairie reference goes stale after the swap).
window.__game = {
  train, player, rig, fog, state, sky, camera, WORLD,
  get activeWorld() { return activeWorld; },
  // warp the train onto the active tree to trigger the transition / end beat
  warpToTree: () => train.reset({ ...activeWorld.landmarkPos, heading: 0 }),
};
