import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHART, MAP_LOOK, mapMaterials } from '../look.js';
import { TUNING } from '../constants.js';
import { blockedAt } from '../collision.js';

// MUST equal the y of the plane map clicks raycast against (map-view.js), or
// the tilted map camera projects the markers off the cursor as parallax.
export const ROUTE_Y = 0;

const MAX_POINTS = 64;
const MAX_DASHES = 640;
const CASING_HALF = 2.9;
const DASH_HALF = 1.5;
const DASH = 10;
const GAP = 7;
const TRAIL_MAX = 1536;
const CRUMB = 9;
const GHOST_DASHES = 96;
const MAX_BLOCKS = 6;
const BLOCK_LEGS = 16;
const RING_OUTER = 13.6;

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

function arrowGeometry(bands) {
  const color = new THREE.Color();
  const pos = [];
  const col = [];
  for (const [size, shift, hex] of bands) {
    color.set(hex);
    pos.push(size + shift, 0, 0, shift - size * 0.62, 0, -size * 0.78, shift - size * 0.62, 0, size * 0.78);
    for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

function blockGeometry() {
  const { casing, markInk, route } = MAP_LOOK;
  const disc = bandGeometry([[0, 7.6, casing], [0, 6.6, markInk], [0, 5.5, casing]], 24);
  const color = new THREE.Color(route);
  const bars = [Math.PI / 4, -Math.PI / 4].map((turn) => {
    const bar = new THREE.PlaneGeometry(8.4, 1.9).rotateZ(turn);
    const col = new Float32Array(12);
    for (let i = 0; i < 12; i += 3) color.toArray(col, i);
    bar.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return bar;
  });
  for (const geo of [disc, ...bars]) {
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
  }
  const merged = mergeGeometries([disc, ...bars]);
  disc.dispose();
  for (const bar of bars) bar.dispose();
  return merged;
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

  const trail = quadStrip(TRAIL_MAX, mapMaterials.trail(), 56);
  routeGroup.add(trail);

  const heading = new THREE.Mesh(
    arrowGeometry([[6.0, 0, casing], [4.9, 0, markInk], [3.3, -0.15, route]]),
    mapMaterials.trainRing()
  );
  heading.renderOrder = 60;
  heading.frustumCulled = false;
  routeGroup.add(heading);

  const ghostLeg = quadStrip(GHOST_DASHES, mapMaterials.trail(), 57);
  const ghostDot = new THREE.Mesh(
    bandGeometry([[3.4, 6.6, casing], [4.2, 5.8, markInk]], 24),
    mapMaterials.waypoint()
  );
  ghostDot.rotation.x = -Math.PI / 2;
  ghostDot.renderOrder = 60;
  routeGroup.add(ghostLeg, ghostDot);

  const blockGeo = blockGeometry();
  const blockMat = mapMaterials.waypoint();
  const blocks = [];
  for (let i = 0; i < MAX_BLOCKS; i++) {
    const mark = new THREE.Mesh(blockGeo, blockMat);
    mark.rotation.x = -Math.PI / 2;
    mark.renderOrder = 62;
    mark.visible = false;
    routeGroup.add(mark);
    blocks.push(mark);
  }

  return {
    routeGroup, linePositions, routeLine, routeCasing, routeDashes, dotGeo, dotMat, dots: [], trainRing, beacon,
    beaconPos: new THREE.Vector3(2450, 80, 0),
    routeMarks: {
      trail, heading, ghostLeg, ghostDot, blocks,
      blockCount: 0, blockKey: NaN, obstacles: null, fog: null,
      scale: 1, night: 0,
      ghostOn: false, ghostX: 0, ghostZ: 0,
      crumbs: 0, lastX: 0, lastZ: 0, seeded: false, dirty: false,
      trailDay: new THREE.Color(MAP_LOOK.trail), trailNight: new THREE.Color(MAP_LOOK.trailNight),
    },
  };
}

// scale: how far the view has pulled back, so marks hold their size on screen
export function setChartView(d, scale, night, goal, obstacles, fog) {
  d.routeMarks.scale = scale;
  d.routeMarks.night = night;
  d.routeMarks.obstacles = obstacles;
  d.routeMarks.fog = fog;
  d.beaconPos.x = goal.x;
  d.beaconPos.z = goal.z;
}

export function setRouteGhost(d, on, x = 0, z = 0) {
  d.routeMarks.ghostOn = on;
  d.routeMarks.ghostX = x;
  d.routeMarks.ghostZ = z;
}

function recordTrail(m, x, z) {
  const dist = Math.hypot(x - m.lastX, z - m.lastZ);
  if (!m.seeded || dist > 80) {
    m.seeded = true;
    m.lastX = x;
    m.lastZ = z;
    return;
  }
  if (dist < CRUMB) return;
  const ux = (x - m.lastX) / dist;
  const uz = (z - m.lastZ) / dist;
  writeQuad(
    m.trail.userData.positions, m.crumbs % TRAIL_MAX,
    m.lastX + ux * dist * 0.2, m.lastZ + uz * dist * 0.2, m.lastX + ux * dist * 0.8, m.lastZ + uz * dist * 0.8,
    -uz, ux, 0.85
  );
  m.crumbs++;
  m.dirty = true;
  m.lastX = x;
  m.lastZ = z;
}

// Marks where each plotted leg first runs into something already on the chart.
function findBlocks(m, pos, route) {
  let n = 0;
  let px = pos.x;
  let pz = pos.z;
  const legs = Math.min(route.length, BLOCK_LEGS);
  for (let i = 0; i < legs && n < MAX_BLOCKS; i++) {
    const x = route[i].x;
    const z = route[i].y;
    const len = Math.hypot(x - px, z - pz);
    // the first leg starts clear of the train's own nose, as its bump check does
    for (let t = i === 0 ? TUNING.lookahead : 0; t < len; t += 6) {
      const sx = px + ((x - px) * t) / len;
      const sz = pz + ((z - pz) * t) / len;
      if (m.fog.isKnown(sx, sz) && blockedAt(m.obstacles, sx, sz, TUNING.obstaclePad)) {
        m.blocks[n++].position.set(sx, ROUTE_Y, sz);
        break;
      }
    }
    px = x;
    pz = z;
  }
  m.blockCount = n;
}

export function updateRouteDisplay(d, pos, route, mapBlend, time) {
  const m = d.routeMarks;
  recordTrail(m, pos.x, pos.z);
  d.routeGroup.visible = mapBlend > 0.02;
  if (!d.routeGroup.visible) return;
  const k = m.scale;

  if (m.obstacles && m.fog) {
    const tail = route.length ? route[route.length - 1] : null;
    const key = tail
      ? route.length * 7919 + Math.round(tail.x) * 31 + Math.round(tail.y) + Math.round(pos.x + pos.z) * 0.001 + m.obstacles.length
      : -1;
    if (key !== m.blockKey) {
      m.blockKey = key;
      findBlocks(m, pos, route);
    }
  }
  for (let i = 0; i < m.blocks.length; i++) {
    m.blocks[i].visible = i < m.blockCount;
    m.blocks[i].scale.setScalar(k);
  }
  m.blocks[0].material.opacity = mapBlend;

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
      const lead = i === 1 ? Math.min(RING_OUTER * k, len) : 0;
      writeQuad(casing, i - 1, px + ux * lead, pz + uz * lead, x, z, -uz, ux, CASING_HALF * k);
      for (let t = lead + (GAP / 2) * k; t < len && dashCount < MAX_DASHES; t += (DASH + GAP) * k) {
        const end = Math.min(t + DASH * k, len);
        writeQuad(dashes, dashCount++, px + ux * t, pz + uz * t, px + ux * end, pz + uz * end, -uz, ux, DASH_HALF * k);
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
      d.dots[i].scale.setScalar((i === route.length - 1 ? 1.25 : 0.85) * k);
    }
  }

  const pulse = 1 + Math.sin(time * 2.4) * 0.12;
  d.trainRing.position.set(pos.x, ROUTE_Y, pos.z);
  d.trainRing.scale.setScalar(pulse * k);
  d.trainRing.material.opacity = mapBlend * 0.95;

  const fx = Math.cos(d.heading);
  const fz = -Math.sin(d.heading);
  const reach = 27 + 7 * k + Math.sin(time * 2.4) * 1.2;
  m.heading.position.set(pos.x + fx * reach, ROUTE_Y, pos.z + fz * reach);
  m.heading.rotation.y = d.heading;
  m.heading.scale.setScalar(k);
  m.heading.material.opacity = mapBlend * 0.95;

  if (m.dirty) {
    m.dirty = false;
    m.trail.geometry.attributes.position.needsUpdate = true;
    m.trail.geometry.setDrawRange(0, Math.min(m.crumbs, TRAIL_MAX) * 6);
  }
  m.trail.material.color.lerpColors(m.trailDay, m.trailNight, m.night);
  m.trail.material.opacity = mapBlend * (0.72 - 0.14 * m.night);

  CHART.uChartLamp.value.set(pos.x, pos.z, 1 / MAP_LOOK.lampRadius);

  const ghost = m.ghostOn && route.length < 60;
  m.ghostDot.visible = ghost;
  m.ghostLeg.visible = ghost;
  if (ghost) {
    const ax = route.length ? route[route.length - 1].x : pos.x;
    const az = route.length ? route[route.length - 1].y : pos.z;
    const len = Math.hypot(m.ghostX - ax, m.ghostZ - az) || 1;
    const ux = (m.ghostX - ax) / len;
    const uz = (m.ghostZ - az) / len;
    const quads = m.ghostLeg.userData.positions;
    let n = 0;
    for (let t = 9 * k; t < len - 7 * k && n < GHOST_DASHES; t += 9 * k) {
      writeQuad(quads, n++, ax + ux * t, az + uz * t, ax + ux * (t + 4 * k), az + uz * (t + 4 * k), -uz, ux, 0.8 * k);
    }
    m.ghostLeg.geometry.setDrawRange(0, n * 6);
    m.ghostLeg.geometry.attributes.position.needsUpdate = true;
    m.ghostLeg.material.color.lerpColors(m.trailDay, m.trailNight, m.night);
    m.ghostLeg.material.opacity = mapBlend * 0.6;
    m.ghostDot.position.set(m.ghostX, ROUTE_Y, m.ghostZ);
    m.ghostDot.scale.setScalar(k);
    m.ghostDot.material.opacity = mapBlend * 0.8;
  }

  d.beacon.position.copy(d.beaconPos);
  d.beacon.scale.setScalar(64 * Math.sqrt(k) * (1 + Math.sin(time * 1.7) * 0.08));
  d.beacon.material.opacity = mapBlend;
}
