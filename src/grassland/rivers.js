import * as THREE from 'three';
import { clamp } from '../constants.js';
import { GRASSLAND_LOOK, grasslandMaterials, jitterHSL, getLookTier } from '../look.js';
import {
  zMin, zSpan, planeD, BANK, RIVER_W, FOOT, WATER_Y, RIVER_SHORE, channelY, riverDefs, riverCenterX,
} from './layout.js';
import { waterMaterial, sheetGeometry } from './water.js';
import { buildCauseway } from './causeway.js';
import { dressBanks } from './banks.js';
import { nightTame } from './fade.js';

// Segs share joints, so no pinholes. Global bridge gaps (t over the full z-run) are remapped into each seg's local t by z.
export function chainRiverSegs(def, zMin, zSpan, centerXAt, nSegs = 12) {
  const zNode = (k) => zMin + (k / nSegs) * zSpan;
  const segs = [];
  for (let k = 0; k < nSegs; k++) {
    const za = zNode(k), zb = zNode(k + 1); // south -> north, zb > za
    const seg = { type: 'seg', x1: centerXAt(za), z1: za, x2: centerXAt(zb), z2: zb, w: def.w };
    const localGaps = [];
    for (const g of def.gaps || []) {
      const gz0 = zMin + g.t0 * zSpan;
      const gz1 = zMin + g.t1 * zSpan;
      const lo = Math.max(gz0, za);
      const hi = Math.min(gz1, zb);
      if (lo < hi) localGaps.push({ t0: (lo - za) / (zb - za), t1: (hi - za) / (zb - za) });
    }
    if (localGaps.length) seg.gaps = localGaps;
    segs.push(seg);
  }
  return segs;
}

// Distances from the centre line; the outermost pair is pinned to the straight edge of the ground panels.
const BED_D = [0, 9, RIVER_W, 21, 24, 26.5, RIVER_SHORE, 30.5, 32, FOOT];
const WATER_D = [0, 12, 20, 24, 26.5, RIVER_SHORE, RIVER_SHORE + 1.4];
const mirrored = (d) => [...d.slice(1).reverse().map((v) => -v), ...d];

export const shoreAttr = (y) => [clamp((-y - 2.4) / 2.2, 0, 1), clamp((-y - 0.3) / 0.7, 0, 1)];

// Channels, water, causeways, cattails and lily pads for every river.
export function buildRivers({ root, rand, obstacles }, bridgeGlowMat) {
  const low = getLookTier() === 'low';
  const ROWS = low ? 105 : 161;
  const cattailStalkMatrices = [];
  const cattailStalkColors = [];
  const cattailHeadMatrices = [];
  const padMatrices = [];
  const padColors = [];
  const CLUMPS_PER_RIVER = 46;
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const tip = new THREE.Vector3();
  const up = new THREE.Vector3();
  const waterMat = waterMaterial();
  const shoreMat = nightTame(grasslandMaterials.shore());
  const rowZ = (i) => -planeD / 2 + (i / (ROWS - 1)) * planeD;

  riverDefs.forEach((def, riverIndex) => {
    for (const s of chainRiverSegs(def, zMin, zSpan, (z) => riverCenterX(def, z))) obstacles.push(s);

    {
      const cols = [-(FOOT + def.amp), ...mirrored(BED_D), FOOT + def.amp];
      const shore = new Float32Array(ROWS * cols.length * 2);
      const geo = sheetGeometry(ROWS, cols.length, (i, j, out) => {
        const z = rowZ(i);
        const pinned = j === 0 || j === cols.length - 1;
        const x = (pinned ? def.x : riverCenterX(def, z)) + cols[j];
        const y = pinned ? 0 : channelY(Math.abs(cols[j]), def.w, BANK);
        out[0] = x; out[1] = y; out[2] = z;
        shore.set(shoreAttr(y), (i * cols.length + j) * 2);
      });
      geo.deleteAttribute('aFlow');
      geo.setAttribute('aShore', new THREE.BufferAttribute(shore, 2));
      geo.computeVertexNormals();
      const chan = new THREE.Mesh(geo, shoreMat);
      chan.receiveShadow = true;
      root.add(chan);
    }

    {
      const cols = mirrored(WATER_D);
      const geo = sheetGeometry(ROWS, cols.length, (i, j, out) => {
        const z = rowZ(i);
        out[0] = riverCenterX(def, z) + cols[j]; out[1] = WATER_Y; out[2] = z;
        out[3] = cols[j] + riverIndex * 71; out[4] = z;
        out[5] = RIVER_SHORE - Math.abs(cols[j]);
      });
      geo.computeVertexNormals();
      const water = new THREE.Mesh(geo, waterMat);
      water.receiveShadow = true;
      // faded willows write depth: the water must be laid down before them
      water.renderOrder = -1;
      root.add(water);
    }

    const g = def.gaps[0];
    const gapZ0 = zMin + zSpan * g.t0;
    const gapZ1 = zMin + zSpan * g.t1;
    const gapMidZ = (gapZ0 + gapZ1) / 2;
    const deckCx = riverCenterX(def, gapMidZ);
    const pathZ = Math.min(gapZ1 - gapZ0, 34);
    buildCauseway(root, rand, bridgeGlowMat, {
      axis: 'x',
      uCenter: deckCx,
      uSpan: (FOOT + 4) * 2,
      vCenter: gapMidZ,
      vWidth: pathZ,
      shore: RIVER_SHORE,
    });

    for (let i = 0; i < CLUMPS_PER_RIVER; i++) {
      const t = rand();
      if (t >= g.t0 - 0.03 && t <= g.t1 + 0.03) continue;
      const z = zMin + zSpan * t;
      const side = rand() < 0.5 ? -1 : 1;
      const dist = RIVER_SHORE - 3 + rand() * 5;
      const baseX = riverCenterX(def, z) + side * dist;
      const baseY = channelY(dist, def.w, BANK) - 0.1;
      const stalkCount = 3 + Math.floor(rand() * 4);
      const headCount = Math.min(stalkCount, 1 + Math.floor(rand() * 2));
      for (let s = 0; s < stalkCount; s++) {
        const a = rand() * Math.PI * 2;
        const r = rand() * 1.2;
        const height = 3.4 + rand() * 1.8;
        dummy.position.set(baseX + Math.cos(a) * r, baseY + height / 2, z + Math.sin(a) * r);
        dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, 0);
        dummy.scale.set(1, height, 1);
        dummy.updateMatrix();
        cattailStalkMatrices.push(dummy.matrix.clone());
        cattailStalkColors.push(jitterHSL(new THREE.Color(), rand, GRASSLAND_LOOK.cattailStalk));
        if (s < headCount) {
          tip.set(0, 0.5, 0).applyMatrix4(dummy.matrix);
          up.set(0, 1, 0).applyQuaternion(dummy.quaternion);
          const head = new THREE.Object3D();
          head.position.copy(tip).addScaledVector(up, 0.32);
          head.quaternion.copy(dummy.quaternion);
          head.updateMatrix();
          cattailHeadMatrices.push(head.matrix.clone());
        }
      }
    }

    const padStart = padMatrices.length;
    const POOLS_PER_RIVER = 4;
    for (let p = 0; p < POOLS_PER_RIVER; p++) {
      let t = rand(), n = 0;
      while (t >= g.t0 - 0.05 && t <= g.t1 + 0.05 && ++n < 10) t = rand();
      const poolZ = zMin + zSpan * t;
      const poolCx = riverCenterX(def, poolZ);
      const poolR = 6 + rand() * 4;
      const padsN = 5 + Math.floor(rand() * 5);
      for (let i = 0; i < padsN; i++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * poolR;
        const dx = clamp(Math.cos(a) * d, -def.w * 0.8, def.w * 0.8);
        padColors.push(jitterHSL(new THREE.Color(), rand, GRASSLAND_LOOK.lilyPad));
        const s = 1.4 + rand() * 2.2;
        padMatrices.push([poolCx + dx, poolZ + Math.sin(a) * d, s]);
      }
    }

    dressBanks(root, {
      seed: 7700 + riverIndex * 131,
      s0: zMin - 20,
      s1: zMin + zSpan + 20,
      at: (s, d, out) => out.set(riverCenterX(def, s) + d, s),
      bedY: (d) => channelY(Math.abs(d), def.w, BANK),
      shore: RIVER_SHORE,
      lip: FOOT,
      keepClear: (s) => Math.abs(s - gapMidZ) < pathZ / 2 + 6,
      feature: [gapMidZ - 46, gapMidZ + 46],
      pads: padMatrices.slice(padStart),
      flowers: GRASSLAND_LOOK.bankFlower,
    });
  });

  const stalkGeo = new THREE.CylinderGeometry(0.06, 0.11, 1, 5, 1, true);
  const stalks = new THREE.InstancedMesh(stalkGeo, grasslandMaterials.cattailStalk(), cattailStalkMatrices.length);
  for (let i = 0; i < cattailStalkMatrices.length; i++) {
    stalks.setMatrixAt(i, cattailStalkMatrices[i]);
    stalks.setColorAt(i, cattailStalkColors[i]);
  }
  root.add(stalks);

  const headGeo = new THREE.CapsuleGeometry(0.12, 0.5, 2, 6);
  const heads = new THREE.InstancedMesh(headGeo, grasslandMaterials.cattailHead(), cattailHeadMatrices.length);
  for (let i = 0; i < cattailHeadMatrices.length; i++) heads.setMatrixAt(i, cattailHeadMatrices[i]);
  root.add(heads);

  // a notched leaf, lying flat
  const padGeo = new THREE.CircleGeometry(1, 11, 0.28, Math.PI * 2 - 0.56);
  padGeo.rotateX(-Math.PI / 2);
  const pads = new THREE.InstancedMesh(padGeo, grasslandMaterials.lilyPads(), padMatrices.length);
  dummy.rotation.order = 'XYZ';
  for (let i = 0; i < padMatrices.length; i++) {
    const [x, z, s] = padMatrices[i];
    dummy.position.set(x, WATER_Y + 0.05, z);
    dummy.rotation.set(0, i * 2.4, 0);
    dummy.scale.set(s, 1, s);
    dummy.updateMatrix();
    pads.setMatrixAt(i, dummy.matrix);
    pads.setColorAt(i, padColors[i]);
  }
  pads.receiveShadow = true;
  root.add(pads);
}
