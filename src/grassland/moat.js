import * as THREE from 'three';
import { grasslandMaterials } from '../look.js';
import { clamp } from '../constants.js';
import { GRASS_LANDMARK, WATER_Y, DEPTH, channelY } from './layout.js';
import { waterNormalTexture } from './water.js';
import { buildCauseway } from './causeway.js';

// The sunken ring channel around the tree: banks, water, glow pools, collision
// and the two radial causeways. Appends its water to `waters`.
export function buildMoat({ root, rand, obstacles }, bridgeGlowMat, waters) {
  // --- ring channel terrain (sunken annulus around the tree) --------------
  // Grassy banks slope from the island edge (r=150) and outer ground (r=230)
  // down to the channel floor near r=190. The water + bridges are added later.
  {
    const R_INNER = 150, R_OUTER = 230, R_MID = 190, W_RING = 18, BANK_RING = 22;
    const rgeo = new THREE.RingGeometry(R_INNER, R_OUTER, 72, 14);
    rgeo.rotateX(-Math.PI / 2); // ring lies in XZ
    const rpos = rgeo.attributes.position;
    const shore = new Float32Array(rpos.count * 2);
    for (let i = 0; i < rpos.count; i++) {
      const r = Math.hypot(rpos.getX(i), rpos.getZ(i)); // distance from centre
      const y = channelY(Math.abs(r - R_MID), W_RING, BANK_RING);
      rpos.setY(i, y);
      const depthFrac = clamp(-y / DEPTH, 0, 1);
      shore[i * 2] = clamp((depthFrac - 0.55) / 0.35, 0, 1);
      shore[i * 2 + 1] = clamp((depthFrac - 0.08) / 0.22, 0, 1);
    }
    rpos.needsUpdate = true;
    rgeo.setAttribute('aShore', new THREE.BufferAttribute(shore, 2));
    rgeo.computeVertexNormals();
    const ringTerrain = new THREE.Mesh(rgeo, grasslandMaterials.shore());
    ringTerrain.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
    ringTerrain.receiveShadow = true;
    root.add(ringTerrain);
  }

  // ring water — a flat annulus sitting on the channel floor, sunken below the
  // banks; same scrolling-ripple trick as the rivers. RingGeometry's default
  // UVs are planar (projected onto the unit square), which smears a repeating
  // pattern anisotropically across an annulus — rewritten below to polar UVs
  // (U = angle around the ring, V = radial fraction across the band) so the
  // ripple stays round and can flow around the ring instead of sliding
  // linearly across it.
  {
    const ripple = waterNormalTexture();
    // Local TILE, kept in sync with the river block's `const TILE = 30`
    // above — that one is scoped inside the `for (const def of riverDefs)`
    // loop and isn't visible down here.
    const TILE = 30;
    const RTHETA = 48, RPHI = 1; // must match the RingGeometry args below
    // U repeat rounded to an integer so the seam column (U=1.0) tiles
    // cleanly against the start column (U=0).
    ripple.repeat.set(Math.round((2 * Math.PI * 190) / TILE), (208 - 172) / TILE); // (40, 1.2)
    const deltaMat = grasslandMaterials.moatWater(ripple);
    waters.push({ mat: deltaMat, axis: 'x' }); // flow scrolls U — around the ring
    // fill the flat floor band (R_MID +/- W_RING = 172..208)
    const rgeo = new THREE.RingGeometry(172, 208, RTHETA, RPHI);
    // Rewrite UVs to polar. Per three.js's RingGeometry source, vertices are
    // built with the outer loop j = 0..phiSegments walking the radius from
    // innerRadius to outerRadius, and the inner loop i = 0..thetaSegments
    // walking theta around the ring (the seam column is duplicated: i=0 and
    // i=thetaSegments are separate vertices at the same position). Index =
    // j*(thetaSegments+1) + i, so U = i/thetaSegments gives the last seam
    // column exactly 1.0 (no wrap to 0), and V = j/phiSegments spans the band.
    const ruv = rgeo.attributes.uv;
    for (let j = 0; j <= RPHI; j++) {
      for (let i = 0; i <= RTHETA; i++) {
        ruv.setXY(j * (RTHETA + 1) + i, i / RTHETA, j / RPHI);
      }
    }
    ruv.needsUpdate = true;
    const ring = new THREE.Mesh(rgeo, deltaMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(GRASS_LANDMARK.x, WATER_Y, GRASS_LANDMARK.z); // WATER_Y
    root.add(ring);
  }

  // glow reflection pools — four soft discs lying flat on the ring water at
  // the compass points, reading as the landmark's glow caught in the moat.
  // Local dressing (not a horizon silhouette like the landmark halo), so NOT
  // fog:false. One shared material+texture for all four.
  {
    const glowMat = grasslandMaterials.moatGlow();
    const discGeo = new THREE.CircleGeometry(1, 24);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const disc = new THREE.Mesh(discGeo, glowMat);
      disc.rotation.x = -Math.PI / 2;
      disc.scale.setScalar(40);
      disc.position.set(
        GRASS_LANDMARK.x + Math.cos(a) * 190,
        WATER_Y + 0.05,
        GRASS_LANDMARK.z + Math.sin(a) * 190
      );
      root.add(disc);
    }
  }

  // ring collision: impassable annulus with two bridge gaps (north +z, south -z)
  {
    const GAP_A = 0.16; // angular half-gap
    obstacles.push({
      type: 'ring', x: GRASS_LANDMARK.x, z: GRASS_LANDMARK.z, rInner: 150, rOuter: 230,
      gaps: [
        { a0: Math.PI / 2 - GAP_A, a1: Math.PI / 2 + GAP_A },   // north (+z)
        { a0: -Math.PI / 2 - GAP_A, a1: -Math.PI / 2 + GAP_A }, // south (-z)
      ],
    });

    // two lantern causeways crossing the channel radially at north and south,
    // at the train's level. Each runs from the island edge (r=150) to outer
    // bank (r=230) along z, flush planks stepping across that span, path
    // width along x; posts + lanterns sit at the island-side and outer-side
    // corners (same buildCauseway treatment as the river decks, axis 'z').
    const rIn = 150, rOut = 230, span = rOut - rIn; // 80
    const deckW = 30; // path width (tangential, along x)
    for (const dir of [1, -1]) { // +1 = north (+z), -1 = south (-z)
      buildCauseway(root, rand, bridgeGlowMat, {
        axis: 'z',
        uCenter: GRASS_LANDMARK.z + dir * (rIn + span / 2),
        uSpan: span,
        vCenter: GRASS_LANDMARK.x,
        vWidth: deckW,
      });
    }
  }
}
