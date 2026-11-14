import * as THREE from 'three';
import { GRASSLAND } from '../constants.js';
import { GRASSLAND_LOOK, grasslandMaterials, floraMaterials } from '../look.js';
import {
  GRASS_LANDMARK, FOOT, ISLAND_R, MOAT_R, cxRegion, groundWestX, groundEastX, planeD, riverDefs,
} from './layout.js';

// Flat panels (y=0) split by the river channels; the east panel gets a
// circular hole for the moat, with an island disc under the knoll.
export function buildGround(root) {
  // Panel x-spans: [west .. riverA-cut], between consecutive rivers, and the
  // big east panel from riverC+cut to the east edge. The cut widens from FOOT
  // to FOOT + amp because the meandering valley swings ±amp about the base x
  // and must stay inside its straight-edged strip. Derived from riverDefs so
  // the cut positions can never drift from the centerline.
  const edges = [groundWestX];
  for (const def of riverDefs) { edges.push(def.x - (FOOT + def.amp), def.x + (FOOT + def.amp)); }
  edges.push(groundEastX);
  // edges = [west, A-, A+, B-, B+, C-, C+, east]; panels are pairs (0,1)(2,3)(4,5)(6,7)
  const treeHoleR = MOAT_R; // the ring channel fills this hole
  for (let p = 0; p < edges.length; p += 2) {
    const x0 = edges[p], x1 = edges[p + 1];
    const w = x1 - x0;
    const isEast = p + 2 >= edges.length; // last panel holds the tree
    let mesh;
    if (isEast) {
      // east panel: rectangle with a circular hole around the landmark
      const shape = new THREE.Shape();
      shape.moveTo(x0, -planeD / 2);
      shape.lineTo(x1, -planeD / 2);
      shape.lineTo(x1, planeD / 2);
      shape.lineTo(x0, planeD / 2);
      shape.lineTo(x0, -planeD / 2);
      const hole = new THREE.Path();
      hole.absarc(GRASS_LANDMARK.x, GRASS_LANDMARK.z, treeHoleR, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ShapeGeometry(shape, 64);
      geo.rotateX(-Math.PI / 2); // shape is in XY -> lay flat into XZ
      mesh = new THREE.Mesh(geo, grasslandMaterials.ground());
      // after rotateX, shape-Y maps to world -Z; flip Z back to keep orientation
      mesh.scale.z = -1;
    } else {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, planeD), grasslandMaterials.ground());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((x0 + x1) / 2, 0, 0);
    }
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // island disc under the knoll (flat at y=0), filling the hole's centre —
  // dressed with its own scatter pass + a boulder ring below, so it reads as
  // flora-covered ground, not a bare green plate
  {
    const island = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R, 48), grasslandMaterials.ground());
    island.rotation.x = -Math.PI / 2;
    island.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
    island.receiveShadow = true;
    root.add(island);
  }
}

// Translucent discs near y=0: depthWrite:false + polygonOffset (in the look
// material) keep them from z-fighting each other and the ground at map zoom.
export function buildMeadowPatches({ root, rand, randClearXZ }) {
  const patchGeo = new THREE.CircleGeometry(1, 20);
  const patchColors = GRASSLAND_LOOK.patches;
  const patches = new THREE.Group();
  for (let i = 0; i < 150; i++) {
    const m = new THREE.Mesh(
      patchGeo,
      floraMaterials.meadowPatch(patchColors[Math.floor(rand() * patchColors.length)], 0.35 + rand() * 0.35)
    );
    m.rotation.x = -Math.PI / 2;
    const s = 26 + rand() * 90;
    m.scale.set(s, s * (0.6 + rand() * 0.7), 1);
    m.rotation.z = rand() * Math.PI;
    const pp = randClearXZ();
    m.position.set(pp.x, 0.04, pp.z);
    patches.add(m);
  }
  root.add(patches);
}

export function buildHills({ root, rand }) {
  const hillMat = grasslandMaterials.hill();
  const hills = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 1150 + rand() * 700;
    const cx = cxRegion + Math.cos(a) * d * 1.4;
    const cz = Math.sin(a) * d;
    const s = 120 + rand() * 240;
    // Keep the green hills east of the prairie border. Their wide scatter
    // (±~2600) otherwise overflows west onto the prairie and its tree, which now
    // coexist in the streamed world — those big green domes were the "floating
    // mountain" over the prairie knoll. (−s so a large hill body can't reach
    // across either.) West of here the player sees the real prairie, not a
    // backdrop, so dropping the western few hills costs nothing.
    if (cx - s < GRASSLAND.minX) continue;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 7), hillMat);
    hill.scale.y = 0.22 + rand() * 0.16;
    hill.position.set(cx, -6, cz);
    hills.add(hill);
  }
  root.add(hills);
}
