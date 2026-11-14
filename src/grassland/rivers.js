import * as THREE from 'three';
import { clamp } from '../constants.js';
import { GRASSLAND_LOOK, grasslandMaterials, jitterHSL } from '../look.js';
import {
  zMin, zSpan, planeD, DEPTH, BANK, RIVER_W, FOOT, WATER_Y, channelY, riverDefs, riverCenterX,
} from './layout.js';
import { waterNormalTexture } from './water.js';
import { buildCauseway } from './causeway.js';

// Approximate a meandering river with a chain of `nSegs` straight collision
// segs. Endpoints sample `centerXAt` at nSegs+1 evenly-spaced z values (shared
// joints, so no pinholes; gentle bends mean seg width covers the kinks).
//
// A river carries GLOBAL bridge gaps `def.gaps: [{t0,t1}]` measured over the
// full z-run (t=0 at zMin, t=1 at zMin+zSpan). Each seg only spans a slice of
// that run, so we remap every global gap into the seg's own local t-space,
// working in z: the global window [t0,t1] is the z-band
// [zMin + t0*zSpan, zMin + t1*zSpan]; intersect it with the seg's z-range and
// convert the overlap to that seg's local t fractions. (Because z varies
// linearly along a seg, z↔local-t is exact along the seg; mapping the gap's
// z-window is the intended approximation — the closest point's z on a gently
// tilted seg is ~its query z.) Segs the window misses get no gaps.
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

// Channels, water, causeways, cattails and lily pads for every river. Returns
// the animated water entries ({ mat, axis, dir }) for the biome's update().
export function buildRivers({ root, rand, obstacles }, bridgeGlowMat) {
  const waters = [];
  const cattailStalkMatrices = [];
  const cattailStalkColors = [];
  const cattailHeadMatrices = [];
  const CLUMPS_PER_RIVER = 46;
  // 'YXZ' so the y-spin sweeps the x-tilt around the full compass; with the
  // default order every stalk would lean the same way.
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';

  for (const def of riverDefs) {
    // collision: the meander approximated by a chain of 12 straight segs whose
    // endpoints sample the centerline; the bridge gap is remapped into each
    // sub-seg's local t-space (see chainRiverSegs).
    for (const s of chainRiverSegs(def, zMin, zSpan, (z) => riverCenterX(def, z))) obstacles.push(s);

    // sunken channel strip: a straight-edged plane wide enough to hold the
    // meandering valley (FOOT + amp each side of the base x), its vertices
    // displaced down into the valley profile keyed off distance from the
    // centerline. The strip is subdivided finely along z (96) so the meander
    // reads as a smooth curved trench; the outer edges stay at y=0 and meet the
    // flat panels exactly (there the centerline is at most `amp` away, so the
    // distance is >= FOOT and channelY returns 0). After rotateX(-PI/2) the
    // plane's local x is the world x-offset and the position z is world z.
    {
      const cgeo = new THREE.PlaneGeometry((FOOT + def.amp) * 2, planeD, 48, 96);
      cgeo.rotateX(-Math.PI / 2); // local x -> world x, local y -> world -z
      const cpos = cgeo.attributes.position;
      // shore treatment: grass at the lip, a gravel beach down the bank, wet mud at the waterline
      const shore = new Float32Array(cpos.count * 2);
      for (let i = 0; i < cpos.count; i++) {
        const xWorld = def.x + cpos.getX(i);
        const zWorld = cpos.getZ(i);
        const y = channelY(Math.abs(xWorld - riverCenterX(def, zWorld)), def.w, BANK);
        cpos.setY(i, y);
        const depthFrac = clamp(-y / DEPTH, 0, 1);
        shore[i * 2] = clamp((depthFrac - 0.55) / 0.35, 0, 1);
        shore[i * 2 + 1] = clamp((depthFrac - 0.08) / 0.22, 0, 1);
      }
      cpos.needsUpdate = true;
      cgeo.setAttribute('aShore', new THREE.BufferAttribute(shore, 2));
      cgeo.computeVertexNormals();
      // base color white — MeshStandardMaterial multiplies vertex colors by
      // material.color, so white lets the baked-in green/mud show true. A
      // dedicated instance per river (not the shared groundMat()) so the flat
      // panels elsewhere keep their plain green.
      const chanMat = grasslandMaterials.shore();
      const chan = new THREE.Mesh(cgeo, chanMat);
      chan.position.set(def.x, 0, 0);
      chan.receiveShadow = true;
      root.add(chan);
    }

    // water surface — a long thin translucent plane laid over the river line,
    // sitting just above ground. A tiling ripple normal map is scrolled along
    // its length to suggest flow.
    const ripple = waterNormalTexture();
    // Tile to ~square world cells so ripples stay round, not smeared. The plane
    // (below) has its U along the width (def.w*2) and V down the length (world
    // Z, planeD — the plane's actual length, not the region-only zSpan). Same
    // world-units-per-tile (TILE) on both axes => isotropic ripples; flow
    // scrolls V (down the river).
    const TILE = 30;
    ripple.repeat.set((def.w * 2.0) / TILE, planeD / TILE);
    const waterMat = grasslandMaterials.riverWater(ripple);
    // A thin plane subdivided down its length; each vertex sheared in x onto
    // the centerline so the water ribbon follows the meander. Long axis (planeD)
    // is the plane's height -> world z after rotateX; width is def.w*2.
    const wgeo = new THREE.PlaneGeometry(def.w * 2.0, planeD, 1, 96);
    wgeo.rotateX(-Math.PI / 2); // local x -> world x-offset, local y -> world z
    const wpos = wgeo.attributes.position;
    for (let i = 0; i < wpos.count; i++) {
      const zWorld = wpos.getZ(i);
      wpos.setX(i, wpos.getX(i) + (riverCenterX(def, zWorld) - def.x));
    }
    wpos.needsUpdate = true;
    const water = new THREE.Mesh(wgeo, waterMat);
    water.position.set(def.x, WATER_Y, 0); // on the channel floor
    root.add(water);
    waters.push({ mat: waterMat, axis: 'y' }); // flow scrolls V (down the river)

    // second, denser ripple layer scrolling the OPPOSITE direction — two
    // overlapping tilings almost never line up, which is what actually kills
    // the visible repeating lattice (one layer alone always shows its tile).
    // Shares the same sheared geometry as the base layer (same mesh shape,
    // just nudged up) rather than re-shearing a duplicate.
    const ripple2 = waterNormalTexture();
    ripple2.repeat.set(((def.w * 2.0) / TILE) * 2.6, (planeD / TILE) * 2.6);
    const waterMat2 = grasslandMaterials.riverRipple(ripple2);
    const water2 = new THREE.Mesh(wgeo, waterMat2);
    water2.position.set(def.x, WATER_Y + 0.06, 0);
    root.add(water2);
    waters.push({ mat: waterMat2, axis: 'y', dir: -1 }); // opposite scroll direction

    // lantern causeway — a low flush deck across each gap, warm wood tones
    // against the cool water, with four corner lantern posts glowing at
    // bank-scouting distance. The river runs N-S (Z), so the crossing goes
    // E-W (X): the deck spans the full banked channel along X (footprint
    // FOOT each side + a little onto the grass lips), and the visual path is
    // narrowed to at most 34u along Z, centred on the gap (the collision gap
    // itself is untouched).
    const g = def.gaps[0];
    const gapZ0 = zMin + zSpan * g.t0;
    const gapZ1 = zMin + zSpan * g.t1;
    const gapMidZ = (gapZ0 + gapZ1) / 2;
    const gapLen = gapZ1 - gapZ0;
    const deckCx = riverCenterX(def, gapMidZ); // deck centres on the meandering channel
    const pathZ = Math.min(gapLen, 34);        // narrowed visual path width along Z
    buildCauseway(root, rand, bridgeGlowMat, {
      axis: 'x',
      uCenter: deckCx,
      uSpan: (FOOT + 4) * 2,
      vCenter: gapMidZ,
      vWidth: pathZ,
    });

    // Cattail clumps: CLUMPS_PER_RIVER sites along the bank slope near the
    // waterline, skipping the bridge crossing. Each clump is 3-6 leaning stalks
    // with 1-2 seed heads riding stalk tips. Only placements (matrix +
    // color) are pushed here — see the InstancedMesh build after this loop.
    for (let i = 0; i < CLUMPS_PER_RIVER; i++) {
      const t = rand();
      if (t >= g.t0 - 0.03 && t <= g.t1 + 0.03) continue; // keep the crossing clear
      const z = zMin + zSpan * t;
      const side = rand() < 0.5 ? -1 : 1;
      const dist = RIVER_W + 3 + rand() * 10; // on the bank slope near the waterline
      const baseX = riverCenterX(def, z) + side * dist;
      const baseY = channelY(dist, def.w, BANK) - 0.1; // sink stalk bases into the bank
      const stalkCount = 3 + Math.floor(rand() * 4); // 3-6 stalks per clump
      const headCount = Math.min(stalkCount, 1 + Math.floor(rand() * 2)); // 1-2 heads
      for (let s = 0; s < stalkCount; s++) {
        const a = rand() * Math.PI * 2;
        const r = rand() * 1.2; // tight jitter so stalks read as one clump
        const height = 2.2 + rand() * 1.2;
        dummy.position.set(baseX + Math.cos(a) * r, baseY + height / 2, z + Math.sin(a) * r);
        // tilt ±0.25 rad off vertical, then (order 'YXZ', set above) spin that
        // tilt about world-up — leaning the stalk in a random compass direction.
        dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, 0);
        dummy.scale.set(1, height, 1); // CylinderGeometry is unit-height; stretch to 1.6-2.6
        dummy.updateMatrix();
        cattailStalkMatrices.push(dummy.matrix.clone());
        cattailStalkColors.push(jitterHSL(new THREE.Color(), rand, GRASSLAND_LOOK.cattailStalk));
        if (s < headCount) {
          // The seed head inherits the stalk's full transform: apply the
          // stalk's matrix to the local top of the unit-height cylinder
          // (y=0.5) to get the tip in world space, then nudge along the same
          // lean's up-axis by half the capsule's height so it sits ON the
          // tip rather than centred through it.
          const tip = new THREE.Vector3(0, 0.5, 0).applyMatrix4(dummy.matrix);
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(dummy.quaternion);
          const head = new THREE.Object3D();
          head.position.copy(tip).addScaledVector(up, 0.32);
          head.quaternion.copy(dummy.quaternion);
          head.updateMatrix();
          cattailHeadMatrices.push(head.matrix.clone());
        }
      }
    }

    // lily pads cluster into pools rather than scattering uniformly across the
    // whole river — 4 pool sites per river, each a loose cluster of 5-9 pads
    // within a small radius, centred on the meandering centerline at that z.
    const padGeo = new THREE.CircleGeometry(1, 10);
    const POOLS_PER_RIVER = 4;
    for (let p = 0; p < POOLS_PER_RIVER; p++) {
      let t = rand(), n = 0;
      // re-roll (capped, like randClearXZ) if the site lands near the bridge gap
      while (t >= g.t0 - 0.05 && t <= g.t1 + 0.05 && ++n < 10) t = rand();
      const poolZ = zMin + zSpan * t;
      const poolCx = riverCenterX(def, poolZ);
      const poolR = 6 + rand() * 4; // 6-10u pool radius
      const padsN = 5 + Math.floor(rand() * 5); // 5-9 pads per pool
      for (let i = 0; i < padsN; i++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * poolR;
        const dx = clamp(Math.cos(a) * d, -def.w * 0.8, def.w * 0.8); // keep pads over water
        const pad = new THREE.Mesh(
          padGeo,
          grasslandMaterials.lilyPad(jitterHSL(new THREE.Color(), rand, GRASSLAND_LOOK.lilyPad))
        );
        pad.rotation.x = -Math.PI / 2;
        const s = 1.4 + rand() * 2.2;
        pad.scale.set(s, s, 1);
        pad.position.set(poolCx + dx, WATER_Y + 0.04, poolZ + Math.sin(a) * d); // on WATER_Y
        root.add(pad);
      }
    }
  }

  const stalkGeo = new THREE.CylinderGeometry(0.06, 0.11, 1, 5);
  const stalkMat = grasslandMaterials.cattailStalk();
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, cattailStalkMatrices.length);
  for (let i = 0; i < cattailStalkMatrices.length; i++) {
    stalks.setMatrixAt(i, cattailStalkMatrices[i]);
    stalks.setColorAt(i, cattailStalkColors[i]);
  }
  stalks.instanceMatrix.needsUpdate = true;
  if (stalks.instanceColor) stalks.instanceColor.needsUpdate = true;
  root.add(stalks);

  // Seed heads are a uniform tan, so no per-instance color is needed —
  // the material's own color carries it.
  const headGeo = new THREE.CapsuleGeometry(0.09, 0.45, 3, 6);
  const headMat = grasslandMaterials.cattailHead();
  const heads = new THREE.InstancedMesh(headGeo, headMat, cattailHeadMatrices.length);
  for (let i = 0; i < cattailHeadMatrices.length; i++) heads.setMatrixAt(i, cattailHeadMatrices[i]);
  heads.instanceMatrix.needsUpdate = true;
  root.add(heads);

  return waters;
}
