import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHART, GRASSLAND_LOOK, SKY_LOOK, grasslandMaterials, jitterHSL, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';
import { crag } from '../shapes.js';
import { GRASS_LANDMARK, ISLAND_R } from './layout.js';
import { MOAT_CROSSINGS } from './moat.js';
import { bankKit, instanced } from './banks.js';
import { mossy } from './boulders.js';
import { nearFade, nearFadePoints } from './fade.js';

const TAU = Math.PI * 2;
const nearCrossing = (a, margin) =>
  MOAT_CROSSINGS.some((c) => Math.abs(((a - c + Math.PI * 3) % TAU) - Math.PI) < margin);

const LAMP_Y = 3.42;

function lanternKit(low) {
  const parts = [];
  const shadeOf = [];
  const ring = (rTop, rBottom, y0, y1, shade, twist = 0) => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, y1 - y0, 6, 1).toNonIndexed();
    g.deleteAttribute('uv');
    g.rotateY(twist);
    g.translate(0, (y0 + y1) / 2, 0);
    parts.push(g);
    shadeOf.push(shade);
  };
  ring(1.2, 1.36, 0, 0.3, 0.8);
  ring(0.92, 1.08, 0.3, 0.62, 0.96, Math.PI / 6);
  ring(0.4, 0.56, 0.62, 1.5, 1.04);
  ring(0.52, 0.52, 1.5, 1.66, 0.86, Math.PI / 6);
  ring(0.36, 0.42, 1.66, 2.5, 1.06);
  ring(1.02, 0.5, 2.5, 2.84, 0.94, Math.PI / 6);
  ring(1.08, 1.08, 2.84, 2.98, 1.08, Math.PI / 6);
  if (!low) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.17, 0.9, 0.17).toNonIndexed();
      g.deleteAttribute('uv');
      g.rotateY(-a);
      g.translate(Math.cos(a) * 0.7, LAMP_Y, Math.sin(a) * 0.7);
      parts.push(g);
      shadeOf.push(0.9);
    }
  }
  ring(1.72, 1.6, 3.86, 3.98, 0.82, Math.PI / 6);
  ring(0.9, 1.72, 3.98, 4.3, 1.0, Math.PI / 6);
  ring(0.3, 0.9, 4.3, 4.72, 1.1, Math.PI / 6);
  ring(0.2, 0.34, 4.72, 5.0, 0.88);
  if (!low) ring(0.02, 0.26, 5.0, 5.34, 1.04);
  const moss = new THREE.Color(GRASSLAND_LOOK.lanternMoss);
  const c = new THREE.Color();
  parts.forEach((g, i) => {
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v += 3) {
      const y = (p.getY(v) + p.getY(v + 1) + p.getY(v + 2)) / 3;
      const k = shadeOf[i] * (0.94 + 0.12 * Math.sin(v * 12.9898 + i * 4.1));
      c.setScalar(k).lerp(moss, Math.max(0, 0.42 - y * 0.5) + (y > 3.9 ? 0.1 : 0));
      for (let j = 0; j < 3; j++) c.toArray(col, (v + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  });
  const stone = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  const lamp = new THREE.CylinderGeometry(0.62, 0.62, 0.88, 6, 1);
  lamp.translate(0, LAMP_Y, 0);
  return { stone, lamp };
}

export function buildIsland(root) {
  const S = GRASSLAND_LOOK.silverTree;
  const rand = mulberry(77031);
  const low = getLookTier() === 'low';
  const group = new THREE.Group();
  group.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
  const tint = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const stone = () => jitterHSL(new THREE.Color(), rand, GRASSLAND_LOOK.stonework);

  const posts = [], lights = [], pools = [], glow = [];
  for (const a of MOAT_CROSSINGS) {
    const ux = Math.cos(a), uz = Math.sin(a);
    for (const r of [136, 112, 88]) {
      for (const side of [-1, 1]) {
        const x = ux * r - uz * side * 24, z = uz * r + ux * side * 24;
        const ry = rand() * 0.3;
        const s = 1.08 + (r === 112 ? 0.1 : 0);
        posts.push([x, 0, z, s, s, s, ry, stone()]);
        lights.push([x, 0, z, s, s, s, ry, white]);
        pools.push([x, 0.06, z, 7.5, 1, 7.5, 0, white]);
        glow.push(x, LAMP_Y * s, z);
        for (let k = 0; k < 3; k++) stone();
      }
    }
  }
  const kit = lanternKit(low);
  instanced(group, kit.stone, nearFade(Object.assign(grasslandMaterials.causewayStone(), { vertexColors: true })), posts, true);
  instanced(group, kit.lamp, nearFade(grasslandMaterials.lantern()), lights);
  const disc = new THREE.CircleGeometry(1, 20);
  disc.rotateX(-Math.PI / 2);
  const poolMat = grasslandMaterials.lightPool(S.stonePool, 0.2);
  instanced(group, disc, poolMat, pools).receiveShadow = false;
  group.userData.lampPools = poolMat;
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
  const glowCol = new Float32Array(glow.length);
  tint.set(S.stoneGlow).multiplyScalar(0.7);
  for (let i = 0; i < glow.length; i += 3) tint.toArray(glowCol, i);
  glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
  group.add(new THREE.Points(glowGeo, nearFadePoints(grasslandMaterials.glowPoints(9))));

  const boulderMat = nearFade(grasslandMaterials.boulder());
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + 0.28;
    const s = 3.2 + rand() * 1.6;
    const tall = 2.6 + rand() * 1.2;
    const dark = rand() > 0.5;
    if (nearCrossing(a, 0.2)) continue;
    const geo = crag(rand, s, tall, mossy(dark ? GRASSLAND_LOOK.boulderDark : GRASSLAND_LOOK.boulder));
    const rock = new THREE.Mesh(geo, boulderMat);
    rock.position.set(Math.cos(a) * 120, s * tall * 0.3, Math.sin(a) * 120);
    rock.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI, (rand() - 0.5) * 0.14);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  const barks = [], leaves = [];
  const c1 = new THREE.Color(), c2 = new THREE.Color();
  const colour = (geo, fn) => {
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) fn(p.getY(v)).toArray(col, v * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  for (let i = 0; i < 9; i++) {
    const a = rand() * TAU;
    const r = 84 + rand() * 52;
    const h = 7 + rand() * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const lobes = [[0, h * 1.05, 0, h * 0.42], [h * 0.3, h * 0.82, h * 0.12, h * 0.3], [-h * 0.26, h * 0.86, -h * 0.2, h * 0.28]];
    if (nearCrossing(a, 0.34)) continue;
    const stem = new THREE.CylinderGeometry(0.22, 0.42, h, 6, 1, true).toNonIndexed();
    stem.deleteAttribute('uv');
    stem.translate(x, h / 2, z);
    barks.push(colour(stem, () => c1.set(S.barkPale)));
    for (const [lx, ly, lz, lr] of lobes) {
      const puff = new THREE.IcosahedronGeometry(lr, low ? 0 : 1);
      puff.deleteAttribute('uv');
      puff.scale(1, 0.82, 1);
      puff.translate(x + lx, ly, z + lz);
      leaves.push(colour(puff, (y) => c1.set(S.leafShade).lerp(c2.set(S.leafLight), Math.min(1, Math.max(0, (y - h * 0.6) / (h * 0.75))))));
    }
  }
  if (barks.length) {
    const stems = new THREE.Mesh(mergeGeometries(barks), nearFade(grasslandMaterials.treeBark()));
    const crowns = new THREE.Mesh(mergeGeometries(leaves), nearFade(grasslandMaterials.treeCrown()));
    stems.castShadow = crowns.castShadow = true;
    group.add(stems, crowns);
    for (const g of [...barks, ...leaves]) g.dispose();
  }

  const flowers = [];
  const drifts = low ? 12 : 44;
  for (let d = 0; d < drifts; d++) {
    const a = rand() * TAU;
    const r = 76 + rand() * (ISLAND_R - 84);
    const hue = GRASSLAND_LOOK.islandFlower[Math.floor(rand() * GRASSLAND_LOOK.islandFlower.length)];
    const n = 5 + Math.floor(rand() * 7);
    for (let i = 0; i < n; i++) {
      const fa = rand() * TAU, fr = Math.sqrt(rand()) * 9;
      const s = 0.9 + rand() * 0.8;
      tint.set(hue).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
      flowers.push([Math.cos(a) * r + Math.cos(fa) * fr, -0.03, Math.sin(a) * r + Math.sin(fa) * fr, s, s, s, rand() * TAU, tint.clone()]);
    }
  }
  const blooms = new THREE.Group();
  blooms.userData.closeUp = true;
  instanced(blooms, bankKit().flower, grasslandMaterials.bloom(0.25), flowers);
  group.add(blooms);

  root.add(group);
  return group;
}

const PETAL_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uScale;
  varying float vFade;
  varying float vTurn;
  void main() {
    const float H = 74.0;
    float fall = H - mod(aSeed.x * H + uTime * (1.6 + aSeed.y * 1.5), H);
    vec3 p = position;
    float sway = 1.5 + aSeed.z * 3.5;
    p.x += sin(uTime * 0.55 + aSeed.x * 41.0) * sway + (H - fall) * 0.16;
    p.z += cos(uTime * 0.43 + aSeed.x * 23.0) * sway;
    p.y = fall;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vTurn = uTime * (0.8 + aSeed.y) + aSeed.x * 60.0;
    gl_PointSize = uScale * (0.6 + aSeed.z * 0.55) * (0.55 + 0.45 * abs(sin(vTurn))) / -mv.z;
    vFade = smoothstep(0.0, 3.0, fall) * (1.0 - smoothstep(H - 14.0, H, fall));
  }
`;
const PETAL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLight;
  uniform float uChart;
  varying float vFade;
  varying float vTurn;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vTurn * 0.5), s = sin(vTurn * 0.5);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    float d = length(q * vec2(1.0, 1.9));
    float a = (1.0 - smoothstep(0.3, 0.42, d)) * vFade * 0.9 * (1.0 - uChart);
    if (a < 0.02) discard;
    gl_FragColor = vec4(uColor * uLight, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Petals drifting down across the island. update(time, camera) is allocation-free.
export function buildPetals(root, scene) {
  const tier = getLookTier();
  const count = tier === 'low' ? 220 : tier === 'medium' ? 450 : 800;
  const rand = mulberry(31337);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rand() * TAU;
    const r = Math.sqrt(rand()) * (ISLAND_R + 40);
    pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
    seed.set([rand(), rand(), rand()], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 37, 0), ISLAND_R + 70);
  const uniforms = {
    uTime: { value: 0 },
    uScale: { value: 600 },
    uLight: { value: 1 },
    uColor: { value: new THREE.Color(GRASSLAND_LOOK.silverTree.petal) },
    uChart: CHART.uChart,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
  root.add(points);
  const key = scene.children.find((o) => o.isDirectionalLight && o.castShadow);
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  return {
    update(time, camera) {
      uniforms.uTime.value = still ? 0 : time;
      uniforms.uScale.value = camera.projectionMatrix.elements[5] * 0.5 * window.innerHeight * Math.min(window.devicePixelRatio, 2);
      if (key) uniforms.uLight.value = Math.min(1, Math.max(0.5, key.intensity / SKY_LOOK.sunIntensity));
    },
  };
}
