import * as THREE from 'three';

// Written once a frame by the SkyCycle, read by the particles and the post pass.
export const ATMOS = {
  keyDir: new THREE.Vector3(-0.42, 0.72, 0.55).normalize(),
  sunDir: new THREE.Vector3(0.3, 0.8, 0.5).normalize(),
  lit: new THREE.Color(1, 1, 1),
  shade: new THREE.Color(0.5, 0.55, 0.65),
  ground: new THREE.Color(0.7, 0.6, 0.4),
  glow: new THREE.Color(1, 0.7, 0.4),
  glowI: 0,
  night: 0,
  dusk: 0,
  time: 0,
  mottle: null,
};
