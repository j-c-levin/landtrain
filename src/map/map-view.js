import * as THREE from 'three';
import { TUNING } from '../constants.js';
import { edgePlacement } from './markers.js';
import { ROUTE_Y } from './route-display.js';

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ROUTE_Y);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();
const markerVec = new THREE.Vector3();
const fwdDir = new THREE.Vector3();

// World point on the map plane under a viewport position, or null.
export function pickGround(camera, clientX, clientY) {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, hit);
}

export function placeMarker(camera, tx, tz) {
  markerVec.set(tx, 0, tz).project(camera);
  const behind = markerVec.z > 1;
  return edgePlacement(markerVec.x, markerVec.y, behind, 0.9);
}

// Aimed along where the train FACES, so the cone exists from the first frame at spawn.
export function revealAhead(fog, train) {
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
