import * as THREE from 'three';
import { lerp, smootherstep } from '../constants.js';
import { SKY_LOOK, chartLight } from '../look.js';
import { ATMOS } from './shared.js';

const HAZE_NEAR = 70;
const HAZE_FAR = 1250;
const SHADOW_HALF = 62;
const SHADOW_HALF_MAP = 330;
const KEY_DISTANCE = 260;
const CHART_HEMI = 2;

// Colours and intensities are driven per-frame by the SkyCycle.
export function createHaze(scene) {
  scene.fog = new THREE.Fog(SKY_LOOK.fog, HAZE_NEAR, HAZE_FAR);
  return scene.fog;
}

// The haze must stay closed until the fog-of-war shroud is fully opaque, or
// the map transition flashes undiscovered land.
export function updateHaze(fog, mapBlend) {
  const open = smootherstep((mapBlend - 0.45) / 0.55);
  fog.near = lerp(HAZE_NEAR, 1400, open);
  fog.far = lerp(HAZE_FAR, 5200, open);
}

export function createSunLight(scene) {
  const light = new THREE.DirectionalLight(SKY_LOOK.sun, SKY_LOOK.sunIntensity);
  light.position.set(-110, 170, 90);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.near = 20;
  light.shadow.camera.far = 620;
  light.shadow.bias = -0.0006;
  light.shadow.normalBias = 0.05;
  light.shadow.radius = 2.4;
  light.userData.radius = 2.4;
  light.userData.half = 0;
  scene.add(light);
  scene.add(light.target);
  followShadowBox(light, light.target.position, null, 0);
  return light;
}

// keyDir points from the scene toward the key light (sun by day, moon by
// night). In the map view the box widens so rocks and trees still cast.
export function followShadowBox(light, trainPos, keyDir, mapBlend) {
  if (keyDir) {
    light.position.set(
      trainPos.x + keyDir.x * KEY_DISTANCE, keyDir.y * KEY_DISTANCE, trainPos.z + keyDir.z * KEY_DISTANCE
    );
  } else {
    light.position.set(trainPos.x - 110, 170, trainPos.z + 90);
  }
  light.target.position.copy(trainPos);
  light.target.updateMatrixWorld();
  const half = lerp(SHADOW_HALF, SHADOW_HALF_MAP, mapBlend);
  if (half !== light.userData.half) {
    light.userData.half = half;
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
  }
}

// Warm light thrown back up off the sunlit ground onto the side of the train
// that faces the lens. It comes from below the horizon, so the ground itself
// (and the long shadows lying on it) never receives it.
export function createBounceLight(scene) {
  const light = new THREE.DirectionalLight(SKY_LOOK.bounce, 0);
  scene.add(light);
  scene.add(light.target);
  const fill = new THREE.DirectionalLight(SKY_LOOK.roomFill, 0);
  scene.add(fill);
  scene.add(fill.target);
  light.userData.fill = fill;
  return light;
}

const _side = new THREE.Vector3();

const _cool = new THREE.Color(SKY_LOOK.bounceDusk);

export function followBounceLight(light, trainPos, heading, intensity, color, dusk = 0, chart = 0) {
  _side.set(Math.sin(heading) * 0.9 + Math.cos(heading) * 0.2, -0.32, Math.cos(heading) * 0.9 - Math.sin(heading) * 0.2);
  light.position.copy(trainPos).addScaledVector(_side, 80);
  light.target.position.copy(trainPos);
  light.target.updateMatrixWorld();
  light.intensity = intensity;
  light.color.copy(color).lerp(_cool, 0.42 * dusk);
  const fill = light.userData.fill;
  _side.y = 0.04;
  fill.position.copy(trainPos).addScaledVector(_side, 80);
  fill.target.position.copy(trainPos);
  fill.target.updateMatrixWorld();
  const f = SKY_LOOK.roomFillI;
  fill.intensity = lerp(lerp(f[0], f[1], ATMOS.dusk), f[2], ATMOS.night) * (1 - chart);
}

// The chart is drawn, not lit: the key light and its shadows give way to an
// even top light so everything standing on the map reads as a flat symbol.
export function applyChartLight(sunLight, hemi, scene, chart) {
  const low = Math.max(ATMOS.dusk, ATMOS.night);
  sunLight.shadow.intensity = (1 - smootherstep(chart / 0.3)) * lerp(1, SKY_LOOK.moonShadow, ATMOS.night);
  sunLight.shadow.radius = (sunLight.userData.radius ?? 2.4) * (1 + SKY_LOOK.lowSunSoften * low);
  if (chart <= 0) return;
  sunLight.intensity *= 1 - 0.85 * chart;
  hemi.intensity = lerp(hemi.intensity * (1 + 2.6 * chart), CHART_HEMI, chart);
  hemi.color.lerp(chartLight, chart);
  hemi.groundColor.lerp(chartLight, chart);
  sunLight.color.lerp(chartLight, chart);
  scene.environmentIntensity *= 1 - 0.8 * chart;
}
