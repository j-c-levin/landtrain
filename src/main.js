import * as THREE from 'three';
import { TUNING, clamp } from './constants.js';
import { QUALITY_TIERS, createQualityMonitor, selectInitialQuality } from './quality.js';
import { registerServiceWorker } from './sw-register.js';
import { installDebugHandle, bindSecretWarp } from './debug.js';
import { createRenderer, applyRenderQuality, syncRendererSize } from './atmosphere/renderer.js';
import { createHaze, updateHaze, createSunLight, followShadowBox } from './atmosphere/lighting.js';
import { SkyCycle } from './atmosphere/sky.js';
import { createPrairie } from './prairie/prairie.js';
import { Train, focusZone } from './train/train.js';
import { Player } from './character/player.js';
import { Interactions } from './character/interactions.js';
import { CameraRig, createCamera } from './camera/camera.js';
import { FogOfWar } from './map/fog-of-war.js';
import { placeMarker, revealAhead } from './map/map-view.js';
import { UI } from './ui/ui.js';
import { createInput, NEUTRAL_INPUT } from './ui/input.js';
import { bindTouchZones } from './ui/touch-zones.js';
import { bindViewControls } from './ui/view-controls.js';
import { createJourney } from './ui/journey.js';
import { AudioFX } from './audio/audio.js';

registerServiceWorker();

const input = createInput();

// ----------------------------------------------------------------- setup
const canvas = document.getElementById('scene');
const params = new URLSearchParams(location.search);
const forcedQuality = params.get('quality');
let qualityTier = selectInitialQuality({
  forcedTier: forcedQuality,
  deviceMemory: navigator.deviceMemory,
  hardwareConcurrency: navigator.hardwareConcurrency,
  devicePixelRatio: window.devicePixelRatio,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
});
let qualityPolicy = QUALITY_TIERS[qualityTier];
const qualityMonitor = createQualityMonitor(qualityTier);
const renderer = createRenderer(canvas, qualityPolicy);

const scene = new THREE.Scene();
const camera = createCamera();

createHaze(scene);
const sunLight = createSunLight(scene);
const world = createPrairie(scene);
const sky = new SkyCycle(scene, renderer, sunLight);
const fog = new FogOfWar(scene);
const train = new Train(scene);
const player = new Player(train, scene);
const rig = new CameraRig(camera, train, player);
const ui = new UI();
const audio = new AudioFX();
const interactions = new Interactions({ train, player, rig, ui, audio });

function applyQualityTier(tier) {
  if (!QUALITY_TIERS[tier]) return false;
  qualityTier = tier;
  qualityPolicy = QUALITY_TIERS[tier];
  applyRenderQuality(renderer, scene, qualityPolicy);
  qualityMonitor.setTier(tier);
  return true;
}

applyQualityTier(qualityTier);

const journey = createJourney({ scene, world, train, fog, ui, audio });

const state = {
  started: false,
  // distance travelled at the last fog reveal
  lastRevealAt: 0,
};

// time scale for tuning/testing: ?ts=4
const timeScale = clamp(parseFloat(params.get('ts') || '1') || 1, 0.1, 20);

revealAhead(fog, train);

// ----------------------------------------------------------------- input
const walking = () => (rig.mode === 'inhabit' || rig.mode === 'cabin') && !rig.busy;
const views = bindViewControls({ canvas, camera, rig, train, player, ui, audio });
bindTouchZones(canvas, input, walking);
bindSecretWarp({ rig, player, train, ui, journey });

ui.intro(() => {
  audio.start();
  state.started = true;
});

function syncSize() {
  const aspect = syncRendererSize(renderer, canvas, qualityPolicy);
  if (aspect !== null) rig.setAspect(aspect);
}
syncSize();

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let elapsed = 0;
let animationFrame = null;
let previousFrameTime = 0;
let slowUpdateElapsed = Infinity;

function tick(frameTime) {
  animationFrame = requestAnimationFrame(tick);
  syncSize();
  if (previousFrameTime && !QUALITY_TIERS[forcedQuality]) {
    const nextTier = qualityMonitor.sample(frameTime - previousFrameTime);
    if (nextTier) applyQualityTier(nextTier);
  }
  previousFrameTime = frameTime;
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * timeScale;
  elapsed += dt;
  slowUpdateElapsed += rawDt;

  if (state.started) {
    views.updateHotkeys(input);
    interactions.update(dt, input);

    // Always update so the player rig re-syncs onto the (still-moving) train
    // every frame; only feed real input when it's drivable.
    player.update(dt, walking() ? input : NEUTRAL_INPUT, elapsed);
    player.syncDock(rig.mode);

    train.paused = rig.mapEngaged;
    train.update(dt, elapsed, journey.obstacles);

    if (train.distanceTraveled - state.lastRevealAt >= TUNING.revealEvery) {
      state.lastRevealAt = train.distanceTraveled;
      revealAhead(fog, train);
    }

    journey.update();
  }

  rig.update(dt, elapsed);
  updateHaze(scene.fog, rig.mapBlend);
  fog.setBlend(rig.mapBlend);

  // see-through walls follow the player; book mode seals the whole train
  train.setFocus(focusZone(player.level, player.x), rig.mode === 'book' || rig.transitionTarget === 'book', dt);

  train.updateRouteDisplay(rig.mapBlend, elapsed);
  if (slowUpdateElapsed >= 1 / qualityPolicy.slowUpdateHz) {
    slowUpdateElapsed = 0;
    ui.setGauges(train.eff, train.wear);
    ui.setMode(rig.busy ? (rig.mapEngaged ? 'map' : 'transition') : rig.mode);
    ui.setOrbitActive(rig.autoOrbit);
    // Edge markers are a map-view aid only.
    if (state.started && rig.mapEngaged) {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const goal = journey.goalPos;
      ui.setEdgeMarker('tree', placeMarker(camera, goal.x, goal.z), W, H);
      ui.setEdgeMarker('train', placeMarker(camera, train.pos.x, train.pos.z), W, H);
    } else {
      ui.hideEdgeMarkers();
    }
  }
  followShadowBox(sunLight, train.pos);
  world.update(dt, elapsed, train.pos, camera.position);
  if (journey.grassland) journey.grassland.update(dt, elapsed, train.pos, camera.position);
  sky.update(dt, elapsed, camera, train.pos, scene.fog);
  audio.update(dt, train.speed / TUNING.baseSpeed);

  input.endFrame();
  renderer.render(scene, camera);
}

animationFrame = requestAnimationFrame(tick);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    previousFrameTime = 0;
    clock.stop();
    qualityMonitor.resetTiming();
    audio.suspendForVisibility();
    return;
  }

  clock.start();
  audio.resumeFromVisibility();
  if (animationFrame === null) animationFrame = requestAnimationFrame(tick);
});

installDebugHandle({
  train, player, rig, fog, state, sky, camera, journey,
  quality: {
    tiers: QUALITY_TIERS,
    forced: QUALITY_TIERS[forcedQuality] ? forcedQuality : null,
    setTier: applyQualityTier,
    get tier() { return qualityTier; },
    get policy() { return qualityPolicy; },
    get metrics() {
      return {
        ...qualityMonitor.metrics,
        frame: renderer.info.render.frame,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        drawingBufferWidth: renderer.domElement.width,
        drawingBufferHeight: renderer.domElement.height,
        antialias: renderer.getContext().getContextAttributes().antialias,
        hidden: document.hidden,
      };
    },
  },
});
