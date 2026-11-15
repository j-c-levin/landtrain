import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRASSLAND_LOOK, floraMaterials, jitterHSL, getLookTier } from '../look.js';
import { shadeByHeight } from '../groundcover.js';
import { mulberry } from '../prng.js';
import { GRASS_LANDMARK, FOOT, zMin, zSpan, onWater, riverDefs, riverCenterX } from './layout.js';

// Draws from `rand` exactly as the first willow did; all new variety comes from `own`.
function willow(rand, h) {
  const t = new THREE.Group();
  const own = mulberry(Math.floor(h * 100003) >>> 0);
  const low = getLookTier() === 'low';
  const trunkMat = floraMaterials.fadingTrunk(GRASSLAND_LOOK.willowTrunk);
  const leafMat = floraMaterials.fadingLeaf();
  jitterHSL(leafMat.color, rand, GRASSLAND_LOOK.willowLeaf);
  const wood = [new THREE.CylinderGeometry(h * 0.045, h * 0.085, h * 0.8, 6)];
  wood[0].translate(0, h * 0.4, 0);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + own() * 1.2;
    const limb = new THREE.CylinderGeometry(h * 0.018, h * 0.04, h * 0.5, 5, 1, true);
    limb.translate(0, h * 0.25, 0);
    limb.rotateZ(-0.6 - own() * 0.3);
    limb.rotateY(a);
    limb.translate(0, h * 0.66, 0);
    wood.push(limb);
  }
  const trunk = new THREE.Mesh(mergeGeometries(wood), trunkMat);
  for (const g of wood) g.dispose();

  const parts = [];
  const dome = new THREE.IcosahedronGeometry(1, low ? 1 : 2);
  const dp = dome.attributes.position;
  const pa = own() * 9, pb = own() * 9;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
    const k = h * 0.52 * (0.9 + 0.13 * Math.sin(x * 3.7 + pa) * Math.cos(z * 3.3 + pb) + 0.07 * Math.sin(y * 5.1 + pa));
    dp.setXYZ(i, x * k * 1.2, h * 1.02 + y * k * (y < 0 ? 0.5 : 0.8), z * k * 1.2);
  }
  parts.push(dome);
  const curtains = 6 + Math.floor(rand() * 3);
  const per = low ? 2 : 3;
  for (let c = 0; c < curtains; c++) {
    const a = (c / curtains) * Math.PI * 2 + rand() * 0.5;
    const r = h * (0.48 + rand() * 0.14);
    const girth = h * (0.2 + rand() * 0.08);
    const reach = 2.1 + rand() * 0.7;
    const top = h * (0.62 + rand() * 0.1);
    for (let f = 0; f < per; f++) {
      const fa = a + ((f + 0.5) / per - 0.5) * 0.85 + (own() - 0.5) * 0.16;
      const fr = r * (1.0 + (own() - 0.5) * 0.2);
      const len = girth * reach * (0.75 + own() * 0.5);
      const frond = new THREE.ConeGeometry(girth * (0.28 + own() * 0.14), len, 4, low ? 1 : 2, true);
      const fp = frond.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const y = fp.getY(i);
        const hang = 0.5 + y / len;
        fp.setXYZ(i, hang * hang * girth * 0.4 - fp.getX(i) * 0.55, -y, fp.getZ(i) * 1.5);
      }
      frond.rotateY(-fa);
      frond.translate(Math.cos(fa) * fr, top + h * 0.3 - len / 2, Math.sin(fa) * fr);
      parts.push(frond);
    }
  }
  for (let i = 0; i < parts.length; i++) {
    const flat = parts[i].toNonIndexed();
    flat.deleteAttribute('uv');
    flat.computeVertexNormals();
    parts[i].dispose();
    parts[i] = flat;
  }
  const crown = new THREE.Mesh(shadeByHeight(mergeGeometries(parts), 0.6, 1.16), leafMat);
  for (const g of parts) g.dispose();
  trunk.castShadow = true;
  crown.castShadow = true;
  t.add(trunk, crown);
  return { group: t, mats: [trunkMat, leafMat] };
}

// Returns [{ group, mats }] so the biome can fade willows near the camera.
export function buildWillows({ root, rand, randX, randZ }) {
  const trees = [];
  const treeGroup = new THREE.Group();
  for (let i = 0; i < 70; i++) {
    const tree = willow(rand, 5 + rand() * 6);
    let wx = randX(), wz = randZ(), n = 0;
    while (n++ < 12 && (onWater(wx, wz) ||
           Math.hypot(wx - GRASS_LANDMARK.x, wz - GRASS_LANDMARK.z) < 130)) {
      wx = randX(); wz = randZ();
    }
    tree.group.position.set(wx, 0, wz);
    treeGroup.add(tree.group);
    trees.push(tree);
  }

  // big old willows leaning over the water, the first pair framing each crossing
  const local = mulberry(40611);
  riverDefs.forEach((def) => {
    const g = def.gaps[0];
    const gapZ = zMin + zSpan * (g.t0 + g.t1) / 2;
    for (let i = 0; i < 7; i++) {
      const z = i < 2 ? gapZ + (i ? 1 : -1) * (84 + local() * 30) : zMin + local() * zSpan;
      const side = i < 2 ? (i ? 1 : -1) : local() < 0.5 ? -1 : 1;
      const dist = FOOT + 1 + local() * 5;
      if (Math.abs(z - gapZ) < 36) continue;
      const tree = willow(local, 10 + local() * 5);
      tree.group.position.set(riverCenterX(def, z) + side * dist, 0, z);
      tree.group.rotation.y = local() * Math.PI * 2;
      treeGroup.add(tree.group);
      trees.push(tree);
    }
  });
  root.add(treeGroup);
  return trees;
}
