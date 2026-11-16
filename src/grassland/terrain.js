import * as THREE from 'three';
import { GRASSLAND } from '../constants.js';
import { GRASSLAND_LOOK, grasslandMaterials } from '../look.js';
import {
  GRASS_LANDMARK, FOOT, ISLAND_R, MOAT_R, cxRegion, groundWestX, groundEastX, planeD, riverDefs,
} from './layout.js';
import { nightTame } from './fade.js';

// A far hill's foot takes the full haze of the lawn beneath it, or it hangs above the horizon.
function grounded(mat) {
  const inner = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFoot;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFoot = vec2(uv.y, -mvPosition.z);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFoot;')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
          float footHaze = smoothstep(fogNear, fogFar, vFoot.y) * (1.0 - smoothstep(0.02, 0.52, vFoot.x));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, footHaze);
        #endif
        #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => `${key.call(mat)}|grounded`;
  return mat;
}

// Flat panels split by the river channels; the east panel has a hole for the moat, with an island disc in it.
export function buildGround(root) {
  // The cut widens from FOOT to FOOT + amp, so the meandering valley stays inside its straight-edged strip.
  const edges = [groundWestX];
  for (const def of riverDefs) { edges.push(def.x - (FOOT + def.amp), def.x + (FOOT + def.amp)); }
  edges.push(groundEastX);
  // edges = [west, A-, A+, B-, B+, C-, C+, east]; panels are pairs (0,1)(2,3)(4,5)(6,7)
  const treeHoleR = MOAT_R; // the ring channel fills this hole
  const groundMat = nightTame(grasslandMaterials.ground());
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
      mesh = new THREE.Mesh(geo, groundMat);
      // after rotateX, shape-Y maps to world -Z; flip Z back to keep orientation
      mesh.scale.z = -1;
    } else {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, planeD), groundMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((x0 + x1) / 2, 0, 0);
    }
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // the island disc under the knoll fills the hole's centre
  {
    const island = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R, 48), groundMat);
    island.rotation.x = -Math.PI / 2;
    island.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
    island.receiveShadow = true;
    root.add(island);
  }
}

// Rolling foam-carved hills for the backscene, flocked in bands of meadow green.
export function buildHills({ root, rand }) {
  const hillMat = grounded(grasslandMaterials.hill());
  const hills = new THREE.Group();
  const bands = GRASSLAND_LOOK.hillBands.map((c) => new THREE.Color(c));
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 1150 + rand() * 700;
    const cx = cxRegion + Math.cos(a) * d * 1.4;
    const cz = Math.sin(a) * d;
    const s = 120 + rand() * 240;
    const squash = 0.24 + rand() * 0.2;
    // A hill body must not reach west across the prairie border.
    if (cx - s < GRASSLAND.minX) continue;
    const geo = new THREE.SphereGeometry(s, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const ph = rand() * 6.28;
    for (let v = 0; v < p.count; v++) {
      const ang = Math.atan2(p.getZ(v), p.getX(v));
      const t = p.getY(v) / s;
      const k = 0.86 + 0.16 * Math.sin(ang * 2 + ph) + 0.09 * Math.sin(ang * 5 + ph * 2.3);
      p.setXYZ(v, p.getX(v) * k, p.getY(v) * squash * (0.85 + 0.25 * Math.sin(ang * 3 + ph * 1.7)), p.getZ(v) * k);
      const band = bands[Math.floor((t * 3.2 + 0.5 + 0.5 * Math.sin(ang * 4 + ph)) % bands.length)];
      col[v * 3] = band.r;
      col[v * 3 + 1] = band.g;
      col[v * 3 + 2] = band.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const hill = new THREE.Mesh(geo, hillMat);
    const behind = cx > GRASS_LANDMARK.x + 200 && Math.abs(cz) < s + 260;
    hill.position.set(cx, -3, behind ? (cz < 0 ? -1 : 1) * (s + 260) : cz);
    hills.add(hill);
  }
  root.add(hills);
}
