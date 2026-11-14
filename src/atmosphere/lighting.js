import * as THREE from 'three';
import { lerp, smootherstep } from '../constants.js';
import { SKY_LOOK } from '../look.js';

const HAZE_NEAR = 130;
const HAZE_FAR = 560;

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
  light.shadow.camera.left = -75;
  light.shadow.camera.right = 75;
  light.shadow.camera.top = 75;
  light.shadow.camera.bottom = -75;
  light.shadow.camera.near = 20;
  light.shadow.camera.far = 600;
  light.shadow.bias = -0.0008;
  scene.add(light);
  scene.add(light.target);
  return light;
}

export function followShadowBox(light, trainPos) {
  light.position.set(trainPos.x - 110, 170, trainPos.z + 90);
  light.target.position.copy(trainPos);
  light.target.updateMatrixWorld();
}
