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
const CASING_HALF = 1.9;
const DASH_HALF = 0.95;
const DASH = 9;
const GAP = 6;
const TRAIL_MAX = 1536;
const CRUMB = 7;
// crumbs held back so the line stops short of the last car
const HOLD = 4;
// clear of the cab's nose: lines are drawn up to the train, never across it
const NOSE = 27;
// half the train's width with room for the line's casing
const BEAM = 6;
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

function offsetStrip(count, material, order) {
  const mesh = quadStrip(count, material, order);
  const offsets = new Float32Array(count * 8);
  mesh.geometry.setAttribute('aOff', new THREE.BufferAttribute(offsets, 2));
  mesh.userData.offsets = offsets;
  return mesh;
}

// A barbed pen arrowhead: tip, two swept barbs and a notch at the back.
function arrowGeometry(bands) {
  const color = new THREE.Color();
  const pos = [];
  const col = [];
  for (const [size, shift, hex] of bands) {
    color.set(hex);
    const back = shift - size * 0.86;
    const notch = shift - size * 0.3;
    pos.push(size + shift, 0, 0, back, 0, -size * 0.66, notch, 0, 0);
    pos.push(size + shift, 0, 0, notch, 0, 0, back, 0, size * 0.66);
    for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
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

const wob = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

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
  const routeBeyond = quadStrip(MAX_DASHES / 2, mapMaterials.routeBeyond(), 58);
  routeGroup.add(routeBeyond);
  const dotGeo = bandGeometry([[0, 5.0, casing], [0, 4.4, markInk], [0, 3.5, route], [0, 1.3, casing]], 24);
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

  const trail = offsetStrip(TRAIL_MAX, mapMaterials.trailInk(), 56);
  routeGroup.add(trail);

  const heading = new THREE.Mesh(
    arrowGeometry([[7.4, 0, casing], [6.2, 0.1, markInk], [3.4, -0.5, route]]),
    mapMaterials.trainRing()
  );
  heading.renderOrder = 60;
  heading.frustumCulled = false;
  routeGroup.add(heading);

  const ghostLeg = quadStrip(GHOST_DASHES, mapMaterials.trailInk(), 57);
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
    routeGroup, linePositions, routeLine, routeCasing, routeDashes, routeBeyond, dotGeo, dotMat, dots: [], trainRing, beacon,
    beaconPos: new THREE.Vector3(2450, 80, 0),
    routeMarks: {
      trail, heading, ghostLeg, ghostDot, blocks,
      blockCount: 0, blockLeg: 0, blockExit: 0, blockKey: NaN, obstacles: null, fog: null, epoch: 0,
      pend: new Float32Array(HOLD * 4), pendN: 0, pendHead: 0,
      scale: 1, night: 0,
      ghostOn: false, ghostX: 0, ghostZ: 0,
      crumbs: 0, lastX: 0, lastZ: 0, seeded: false, dirty: false,
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

function commitCrumb(m, o) {
  const p = m.pend;
  const len = Math.hypot(p[o + 2] - p[o], p[o + 3] - p[o + 1]) || 1;
  const nx = (-(p[o + 3] - p[o + 1]) / len) * 0.62;
  const nz = ((p[o + 2] - p[o]) / len) * 0.62;
  const q = m.crumbs % TRAIL_MAX;
  const pos = m.trail.userData.positions;
  const off = m.trail.userData.offsets;
  for (let v = 0; v < 4; v++) {
    const end = v < 2 ? 0 : 2;
    const side = v % 2 ? -1 : 1;
    pos[q * 12 + v * 3] = p[o + end];
    pos[q * 12 + v * 3 + 1] = ROUTE_Y;
    pos[q * 12 + v * 3 + 2] = p[o + end + 1];
    off[q * 8 + v * 2] = nx * side;
    off[q * 8 + v * 2 + 1] = nz * side;
  }
  m.crumbs++;
  m.dirty = true;
}

function recordTrail(m, x, z) {
  if (m.fog && m.fog.epoch !== m.epoch) {
    m.epoch = m.fog.epoch;
    m.crumbs = 0;
    m.pendN = 0;
    m.seeded = false;
    m.dirty = true;
  }
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
  if (m.pendN === HOLD) {
    commitCrumb(m, m.pendHead * 4);
    m.pendHead = (m.pendHead + 1) % HOLD;
    m.pendN--;
  }
  const o = ((m.pendHead + m.pendN) % HOLD) * 4;
  m.pend[o] = m.lastX + ux * dist * 0.27;
  m.pend[o + 1] = m.lastZ + uz * dist * 0.27;
  m.pend[o + 2] = m.lastX + ux * dist * 0.73;
  m.pend[o + 3] = m.lastZ + uz * dist * 0.73;
  m.pendN++;
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
        if (n === 0) {
          m.blockLeg = i;
          // where the leg comes out the far side, so the faded plan is not inked across the obstacle
          let out = t + 6;
          while (out < len && blockedAt(m.obstacles, px + ((x - px) * out) / len, pz + ((z - pz) * out) / len, TUNING.obstaclePad + 4)) out += 6;
          m.blockExit = out;
        }
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
  const faded = d.routeBeyond.userData.positions;
  const period = (DASH + GAP) * k;
  let casingCount = 0;
  let dashCount = 0;
  let fadedCount = 0;
  let beyond = false;
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
      // a leg leaving off the bow starts at the ring; one along the train starts past its end, or the arrowhead
      const along = ux * Math.cos(d.heading) - uz * Math.sin(d.heading);
      const bow = Math.min(1, Math.max(0, (along - 0.9) / 0.08));
      const clear = Math.min(BEAM / Math.sqrt(Math.max(1e-6, 1 - along * along)), (NOSE + 4) / Math.max(1e-3, Math.abs(along)));
      const lead = i === 1 ? Math.min(Math.max(clear, (RING_OUTER + 0.4) * k) + (15 * k - 4) * bow, len) : 0;
      let joined = i !== 1;
      if (i === 1) {
        d.linePositions[0] = px + ux * lead;
        d.linePositions[2] = pz + uz * lead;
      }
      let stop = len;
      if (!beyond && m.blockCount > 0 && i - 1 === m.blockLeg) {
        const mark = m.blocks[0].position;
        stop = Math.min(len, Math.max(lead, Math.hypot(mark.x - px, mark.z - pz)));
      }
      if (!beyond && stop > lead) {
        writeQuad(casing, casingCount++, px + ux * lead, pz + uz * lead, px + ux * stop, pz + uz * stop, -uz, ux, CASING_HALF * k);
      }
      // dashes are counted back from the waypoint so they hold still as the train eats the leg
      for (let n = Math.floor((len - lead) / period); n >= 0; n--) {
        const j = wob(n * 7 + i * 13);
        const end = len - (GAP / 2 + (wob(n * 3 + i) - 0.5) * 1.4) * k - n * period;
        let start = Math.max(end - DASH * k * (0.9 + 0.2 * j), lead);
        if (end - start < 2.5 * k) continue;
        if (!joined) {
          joined = true;
          start = lead;
        }
        if (beyond || (start + end) / 2 > stop) {
          if (!beyond && start < m.blockExit) continue;
          if (fadedCount < MAX_DASHES / 2) {
            writeQuad(faded, fadedCount++, px + ux * (start + k), pz + uz * (start + k), px + ux * (end - k), pz + uz * (end - k), -uz, ux, 0.55 * k);
          }
        } else if (dashCount < MAX_DASHES) {
          const slip = (j - 0.5) * 0.5 * k;
          writeQuad(
            dashes, dashCount++,
            px + ux * start - uz * slip, pz + uz * start + ux * slip, px + ux * end - uz * slip, pz + uz * end + ux * slip,
            -uz, ux, DASH_HALF * k * (0.84 + 0.32 * wob(n * 5 + i * 3))
          );
        }
      }
      if (stop < len) beyond = true;
    }
    px = x;
    pz = z;
  }
  d.routeLine.geometry.setDrawRange(0, count);
  d.routeLine.geometry.attributes.position.needsUpdate = true;
  d.routeLine.computeLineDistances();
  d.routeLine.material.opacity = 0.3 * mapBlend;
  d.routeCasing.geometry.setDrawRange(0, casingCount * 6);
  d.routeCasing.geometry.attributes.position.needsUpdate = true;
  d.routeCasing.material.opacity = 0.7 * mapBlend;
  d.routeDashes.geometry.setDrawRange(0, dashCount * 6);
  d.routeDashes.geometry.attributes.position.needsUpdate = true;
  d.routeDashes.material.opacity = mapBlend;
  d.routeBeyond.geometry.setDrawRange(0, fadedCount * 6);
  d.routeBeyond.geometry.attributes.position.needsUpdate = true;
  d.routeBeyond.material.opacity = 0.75 * mapBlend;

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
      const past = m.blockCount > 0 && i >= m.blockLeg ? 0.45 : 1;
      d.dots[i].material.opacity = mapBlend * past * (i === route.length - 1 ? 1 : 0.8);
      d.dots[i].scale.setScalar((i === route.length - 1 ? 1.25 : 0.85) * k);
    }
  }

  const pulse = 1 + Math.sin(time * 2.4) * 0.12;
  d.trainRing.position.set(pos.x, ROUTE_Y, pos.z);
  d.trainRing.scale.setScalar(pulse * k);
  // the symbols drawn round the model wait for the chart, so the climb does not carry a grey ring up with it
  const late = Math.min(1, Math.max(0, (mapBlend - 0.6) / 0.35));
  d.trainRing.material.opacity = late * 0.95;

  const fx = Math.cos(d.heading);
  const fz = -Math.sin(d.heading);
  const reach = NOSE + 7 * k + Math.sin(time * 2.4) * 1.2;
  m.heading.position.set(pos.x + fx * reach, ROUTE_Y, pos.z + fz * reach);
  m.heading.rotation.y = d.heading;
  m.heading.scale.setScalar(k);
  m.heading.material.opacity = late * 0.95;

  if (m.dirty) {
    m.dirty = false;
    m.trail.geometry.attributes.position.needsUpdate = true;
    m.trail.geometry.attributes.aOff.needsUpdate = true;
    m.trail.geometry.setDrawRange(0, Math.min(m.crumbs, TRAIL_MAX) * 6);
  }
  m.trail.material.uniforms.uOpacity.value = late * 0.78;
  m.trail.material.uniforms.uScale.value = k;

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
    m.ghostLeg.material.uniforms.uOpacity.value = mapBlend * 0.6;
    m.ghostDot.position.set(m.ghostX, ROUTE_Y, m.ghostZ);
    m.ghostDot.scale.setScalar(k);
    m.ghostDot.material.opacity = mapBlend * 0.8;
  }

  d.beacon.position.copy(d.beaconPos);
  d.beacon.scale.setScalar(64 * Math.sqrt(k) * (1 + Math.sin(time * 1.7) * 0.08));
  d.beacon.material.opacity = mapBlend;
}
