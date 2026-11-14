import * as THREE from 'three';
import { mapMaterials } from '../look.js';

// MUST equal the y of the plane map clicks raycast against (map-view.js), or
// the tilted map camera projects the markers off the cursor as parallax.
export const ROUTE_Y = 0;

const MAX_POINTS = 64;

// Returns the overlay's fields; the owner (the train) holds them and passes
// itself back to updateRouteDisplay.
export function createRouteDisplay(scene) {
  const routeGroup = new THREE.Group();
  scene.add(routeGroup);

  const lineGeo = new THREE.BufferGeometry();
  const linePositions = new Float32Array(MAX_POINTS * 3);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const routeLine = new THREE.Line(lineGeo, mapMaterials.routeLine());
  routeLine.renderOrder = 59;
  routeLine.frustumCulled = false;
  routeGroup.add(routeLine);

  const dotGeo = new THREE.CircleGeometry(4, 16);
  const dotMat = mapMaterials.waypoint();

  const trainRing = new THREE.Mesh(new THREE.RingGeometry(10, 12, 32), mapMaterials.trainRing());
  trainRing.rotation.x = -Math.PI / 2;
  trainRing.renderOrder = 60;
  routeGroup.add(trainRing);

  const beacon = new THREE.Sprite(mapMaterials.beacon());
  beacon.renderOrder = 61;
  beacon.scale.setScalar(55);
  routeGroup.add(beacon);

  return {
    routeGroup, linePositions, routeLine, dotGeo, dotMat, dots: [], trainRing, beacon,
    beaconPos: new THREE.Vector3(2450, 80, 0),
  };
}

export function updateRouteDisplay(d, pos, route, mapBlend, time) {
  d.routeGroup.visible = mapBlend > 0.02;
  if (!d.routeGroup.visible) return;

  const pts = [[pos.x, pos.z], ...route.map((w) => [w.x, w.y])];
  for (let i = 0; i < pts.length && i < MAX_POINTS; i++) {
    d.linePositions[i * 3] = pts[i][0];
    d.linePositions[i * 3 + 1] = ROUTE_Y;
    d.linePositions[i * 3 + 2] = pts[i][1];
  }
  d.routeLine.geometry.setDrawRange(0, Math.min(pts.length, MAX_POINTS));
  d.routeLine.geometry.attributes.position.needsUpdate = true;
  d.routeLine.computeLineDistances();
  d.routeLine.material.opacity = 0.9 * mapBlend;

  while (d.dots.length < route.length) {
    const dot = new THREE.Mesh(d.dotGeo, d.dotMat.clone());
    dot.rotation.x = -Math.PI / 2;
    dot.renderOrder = 60;
    d.routeGroup.add(dot);
    d.dots.push(dot);
  }
  for (let i = 0; i < d.dots.length; i++) {
    const visible = i < route.length;
    d.dots[i].visible = visible;
    if (visible) {
      d.dots[i].position.set(route[i].x, ROUTE_Y, route[i].y);
      d.dots[i].material.opacity = mapBlend * (i === route.length - 1 ? 1 : 0.7);
    }
  }

  const pulse = 1 + Math.sin(time * 2.4) * 0.12;
  d.trainRing.position.set(pos.x, ROUTE_Y, pos.z);
  d.trainRing.scale.setScalar(pulse);
  d.trainRing.material.opacity = mapBlend * 0.85;

  d.beacon.position.copy(d.beaconPos);
  d.beacon.scale.setScalar(55 * (1 + Math.sin(time * 1.7) * 0.1));
  d.beacon.material.opacity = mapBlend * 0.9;
}
