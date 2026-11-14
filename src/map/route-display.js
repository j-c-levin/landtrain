import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_LOOK, mapMaterials } from '../look.js';

// MUST equal the y of the plane map clicks raycast against (map-view.js), or
// the tilted map camera projects the markers off the cursor as parallax.
export const ROUTE_Y = 0;

const MAX_POINTS = 64;
const MAX_DASHES = 640;
const CASING_HALF = 2.9;
const DASH_HALF = 1.5;
const DASH = 10;
const GAP = 7;

// Flat bands painted centre-out: each [inner, outer, colour] overdraws the last.
function bandGeometry(bands, segments) {
  const color = new THREE.Color();
  const parts = bands.map(([inner, outer, hex]) => {
    const geo = inner > 0 ? new THREE.RingGeometry(inner, outer, segments) : new THREE.CircleGeometry(outer, segments);
    color.set(hex);
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) color.toArray(col, i);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  });
  const merged = mergeGeometries(parts);
  for (const geo of parts) geo.dispose();
  return merged;
}

function quadStrip(count, material, order) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 12);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const index = new Uint16Array(count * 6);
  for (let q = 0; q < count; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  mesh.userData.positions = positions;
  return mesh;
}

function writeQuad(positions, q, ax, az, bx, bz, nx, nz, half) {
  const o = q * 12;
  positions[o] = ax + nx * half; positions[o + 1] = ROUTE_Y; positions[o + 2] = az + nz * half;
  positions[o + 3] = ax - nx * half; positions[o + 4] = ROUTE_Y; positions[o + 5] = az - nz * half;
  positions[o + 6] = bx + nx * half; positions[o + 7] = ROUTE_Y; positions[o + 8] = bz + nz * half;
  positions[o + 9] = bx - nx * half; positions[o + 10] = ROUTE_Y; positions[o + 11] = bz - nz * half;
}

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

  const routeCasing = quadStrip(MAX_POINTS, mapMaterials.routeCasing(), 57);
  const routeDashes = quadStrip(MAX_DASHES, mapMaterials.routeDash(), 58);
  routeGroup.add(routeCasing, routeDashes);

  const { casing, markInk, route } = MAP_LOOK;
  const dotGeo = bandGeometry([[0, 6.4, casing], [0, 5.2, markInk], [0, 4.1, route], [0, 1.5, casing]], 24);
  const dotMat = mapMaterials.waypoint();

  const ringGeo = bandGeometry([[9.2, 13.6, casing], [10.2, 12.6, markInk]], 48);
  const trainRing = new THREE.Mesh(ringGeo, mapMaterials.trainRing());
  trainRing.rotation.x = -Math.PI / 2;
  trainRing.renderOrder = 60;
  routeGroup.add(trainRing);

  const beacon = new THREE.Sprite(mapMaterials.beacon());
  beacon.renderOrder = 61;
  beacon.scale.setScalar(64);
  routeGroup.add(beacon);

  return {
    routeGroup, linePositions, routeLine, routeCasing, routeDashes, dotGeo, dotMat, dots: [], trainRing, beacon,
    beaconPos: new THREE.Vector3(2450, 80, 0),
  };
}

export function updateRouteDisplay(d, pos, route, mapBlend, time) {
  d.routeGroup.visible = mapBlend > 0.02;
  if (!d.routeGroup.visible) return;

  const count = Math.min(route.length + 1, MAX_POINTS);
  const casing = d.routeCasing.userData.positions;
  const dashes = d.routeDashes.userData.positions;
  let dashCount = 0;
  let px = pos.x;
  let pz = pos.z;
  for (let i = 0; i < count; i++) {
    const x = i === 0 ? pos.x : route[i - 1].x;
    const z = i === 0 ? pos.z : route[i - 1].y;
    d.linePositions[i * 3] = x;
    d.linePositions[i * 3 + 1] = ROUTE_Y;
    d.linePositions[i * 3 + 2] = z;
    if (i > 0) {
      const len = Math.hypot(x - px, z - pz) || 1;
      const ux = (x - px) / len;
      const uz = (z - pz) / len;
      writeQuad(casing, i - 1, px, pz, x, z, -uz, ux, CASING_HALF);
      for (let t = GAP / 2; t < len && dashCount < MAX_DASHES; t += DASH + GAP) {
        const end = Math.min(t + DASH, len);
        writeQuad(dashes, dashCount++, px + ux * t, pz + uz * t, px + ux * end, pz + uz * end, -uz, ux, DASH_HALF);
      }
    }
    px = x;
    pz = z;
  }
  d.routeLine.geometry.setDrawRange(0, count);
  d.routeLine.geometry.attributes.position.needsUpdate = true;
  d.routeLine.computeLineDistances();
  d.routeLine.material.opacity = 0.35 * mapBlend;
  d.routeCasing.geometry.setDrawRange(0, (count - 1) * 6);
  d.routeCasing.geometry.attributes.position.needsUpdate = true;
  d.routeCasing.material.opacity = 0.82 * mapBlend;
  d.routeDashes.geometry.setDrawRange(0, dashCount * 6);
  d.routeDashes.geometry.attributes.position.needsUpdate = true;
  d.routeDashes.material.opacity = mapBlend;

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
      d.dots[i].material.opacity = mapBlend * (i === route.length - 1 ? 1 : 0.8);
      d.dots[i].scale.setScalar(i === route.length - 1 ? 1.25 : 0.85);
    }
  }

  const pulse = 1 + Math.sin(time * 2.4) * 0.12;
  d.trainRing.position.set(pos.x, ROUTE_Y, pos.z);
  d.trainRing.scale.setScalar(pulse);
  d.trainRing.material.opacity = mapBlend * 0.95;

  d.beacon.position.copy(d.beaconPos);
  d.beacon.scale.setScalar(64 * (1 + Math.sin(time * 1.7) * 0.08));
  d.beacon.material.opacity = mapBlend;
}
