import * as THREE from 'three';
import { TUNING, clamp, damp, smootherstep } from './constants.js';
import { QUALITY_TIERS, createQualityMonitor, selectInitialQuality } from './quality.js';
import { CHART, setChart, setLookTier, setPaintLight, setPlainGrade } from './look.js';
import { setCoverViewport } from './groundcover.js';
import { registerServiceWorker } from './sw-register.js';
import { installDebugHandle, bindSecretWarp } from './debug.js';
import { createRenderer, applyRenderQuality, syncRendererSize } from './atmosphere/renderer.js';
import {
  createHaze, updateHaze, createSunLight, followShadowBox, createBounceLight, followBounceLight, applyChartLight,
} from './atmosphere/lighting.js';
import { createEnvironment } from './atmosphere/environment.js';
import { createPost } from './atmosphere/post.js';
import { SkyCycle } from './atmosphere/sky.js';
import { createPrairie } from './prairie/prairie.js';
import { Train, focusZone } from './train/train.js';
import { Player } from './character/player.js';
import { Interactions } from './character/interactions.js';
import { CameraRig, createCamera } from './camera/camera.js';
import { FogOfWar } from './map/fog-of-war.js';
import { placeMarker, revealAhead } from './map/map-view.js';
import { createChart } from './map/chart.js';
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
const initialTier = qualityTier;
let qualityPolicy = QUALITY_TIERS[qualityTier];
let journey = null;
const qualityMonitor = createQualityMonitor(qualityTier);
setLookTier(qualityTier);
const renderer = createRenderer(canvas, qualityPolicy);

const scene = new THREE.Scene();
const camera = createCamera();

createHaze(scene);
createEnvironment(renderer, scene);
const sunLight = createSunLight(scene);
const bounceLight = createBounceLight(scene);
const world = createPrairie(scene);
const sky = new SkyCycle(scene, renderer, sunLight);
const fog = new FogOfWar(scene);
const train = new Train(scene);
const player = new Player(train, scene);
const rig = new CameraRig(camera, train, player);
const ui = new UI();
const audio = new AudioFX();
const interactions = new Interactions({ train, player, rig, ui, audio });
const chart = createChart({ renderer, canvas, train, fog });
let post = null;
const focus = { distance: 30, strength: 0, back: 1, target: new THREE.Vector3() };

function applyQualityTier(tier) {
  if (!QUALITY_TIERS[tier]) return false;
  qualityTier = tier;
  qualityPolicy = QUALITY_TIERS[tier];
  applyRenderQuality(renderer, scene, qualityPolicy);
  if (qualityPolicy.finishing.postProcessing && !post) post = createPost(renderer);
  if (!qualityPolicy.finishing.postProcessing && post) {
    post.dispose();
    post = null;
  }
  const density = qualityPolicy.particleDensity / QUALITY_TIERS[initialTier].particleDensity;
  world.cover.setDensity(Math.min(1, density));
  if (journey?.grassland) journey.grassland.cover.setDensity(Math.min(1, density));
  qualityMonitor.setTier(tier);
  return true;
}

applyQualityTier(qualityTier);

journey = createJourney({ scene, world, train, fog, ui, audio });
audio.attach({ train, player, rig, sky, tier: () => qualityTier });

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
  if (aspect === null) return;
  rig.setAspect(aspect);
  setCoverViewport(canvas.clientHeight);
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
    if (journey.stage === 'done') {
      state.endedAt ??= elapsed;
      rig.vista = elapsed - state.endedAt < 2 || !ui.cardEl.classList.contains('hidden') ? journey.goalPos : null;
    }
  }

  rig.update(dt, elapsed);
  updateHaze(scene.fog, rig.mapBlend);
  fog.setBlend(rig.mapBlend);

  // see-through walls follow the player; book mode seals the whole train
  train.setFocus(focusZone(player.level, player.x), rig.mode === 'book' || rig.transitionTarget === 'book', dt);

  chart.update(rig, camera, sky.nightness, journey.goalPos, journey.obstacles);
  train.updateRouteDisplay(rig.mapBlend, elapsed);
  if (slowUpdateElapsed >= 1 / qualityPolicy.slowUpdateHz) {
    slowUpdateElapsed = 0;
    ui.setGauges(train.eff, train.wear);
    ui.setMode(rig.busy ? (rig.mapEngaged ? 'map' : 'transition') : rig.mode);
    ui.setOrbitActive(rig.autoOrbit);
    ui.setNightfall(post ? 0 : sky.nightness * (1 - CHART.uChart.value));
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
  world.update(dt, elapsed, train.pos, camera.position, camera, train.cars[1].group.rotation.y, Math.max(sky.nightness, sky.duskness));
  if (journey.grassland) journey.grassland.update(dt, elapsed, train.pos, camera.position, camera, train.cars[1].group.rotation.y);
  sky.update(dt, elapsed, camera, train.pos, scene.fog);
  setChart(rig.mapBlend, sky.nightness, sky.duskness);
  applyChartLight(sunLight, sky.hemi, scene, CHART.uChart.value);
  followShadowBox(sunLight, train.pos, sky.keyDir, rig.mapBlend);
  followBounceLight(bounceLight, train.pos, train.cars[1].group.rotation.y, sky.bounceIntensity * (1 - CHART.uChart.value), sunLight.color, sky.duskness, CHART.uChart.value);
  setPaintLight(sky.nightness, sky.duskness);
  setPlainGrade(sky.nightness, sky.duskness, !post);
  train.setNight(sky.nightness, sky.duskness);
  fog.setNight(sky.nightness);
  audio.update(dt, train.speed / TUNING.baseSpeed);

  input.endFrame();
  if (post) {
    // inhabit and cab hold the figure sharp; book holds the whole train; the map is a flat chart
    const walkingView = rig.mode === 'inhabit' || rig.mode === 'cabin';
    if (walkingView) player.group.getWorldPosition(focus.target);
    else focus.target.copy(train.pos);
    focus.distance = damp(focus.distance, Math.max(6, camera.position.distanceTo(focus.target)), 6, rawDt);
    const want = (rig.mode === 'cabin' ? 0.35 : 1) * (1 - Math.min(1, rig.mapBlend * 2.5));
    focus.strength = damp(focus.strength, want, 5, rawDt);
    // the destination stays in focus as the train draws up to it
    const goal = journey.goalPos;
    const arriving = 1 - smootherstep((Math.hypot(train.pos.x - goal.x, train.pos.z - goal.z) - 260) / 340);
    focus.back = damp(focus.back, 1 - 0.9 * arriving, 3, rawDt);
    post.render(scene, camera, focus.distance, focus.strength, focus.back);
  } else if (!chart.render(scene, camera)) {
    renderer.render(scene, camera);
  }
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
