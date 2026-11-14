import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHART, GRASSLAND_LOOK, SKY_LOOK, grasslandMaterials, jitterHSL, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';
import { crag } from '../shapes.js';
import { GRASS_LANDMARK, ISLAND_R } from './layout.js';
import { MOAT_CROSSINGS } from './moat.js';
import { bankKit, instanced } from './banks.js';
import { mossy } from './boulders.js';

const TAU = Math.PI * 2;
const nearCrossing = (a, margin) =>
  MOAT_CROSSINGS.some((c) => Math.abs(((a - c + Math.PI * 3) % TAU) - Math.PI) < margin);

// The island's own dressing: stone lanterns lining the three ways in, a ring
// of standing stones, silver saplings and drifts of pale flowers.
export function buildIsland(root) {
  const S = GRASSLAND_LOOK.silverTree;
  const rand = mulberry(77031);
  const group = new THREE.Group();
  group.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
  const tint = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const stone = () => jitterHSL(new THREE.Color(), rand, GRASSLAND_LOOK.stonework);

  const blocks = [], lights = [], caps = [], glow = [];
  for (const a of MOAT_CROSSINGS) {
    const ux = Math.cos(a), uz = Math.sin(a);
    for (const r of [136, 112, 88]) {
      for (const side of [-1, 1]) {
        const x = ux * r - uz * side * 24, z = uz * r + ux * side * 24;
        const ry = rand() * 0.3;
        blocks.push([x, 0.35, z, 2.6, 0.7, 2.6, ry, stone()]);
        blocks.push([x, 2.2, z, 1.05, 3.0, 1.05, ry, stone()]);
        blocks.push([x, 3.9, z, 2.3, 0.4, 2.3, ry, stone()]);
        lights.push([x, 4.8, z, 1.5, 1.5, 1.5, ry, white]);
        caps.push([x, 6.05, z, 1.55, 1.5, 1.55, ry + Math.PI / 4, stone()]);
        glow.push(x, 4.8, z);
      }
    }
  }
  instanced(group, new THREE.BoxGeometry(1, 1, 1), grasslandMaterials.causewayStone(), blocks, true);
  instanced(group, new THREE.BoxGeometry(0.95, 0.9, 0.95), grasslandMaterials.lantern(), lights);
  instanced(group, new THREE.ConeGeometry(1.25, 0.75, 4), grasslandMaterials.causewayStone(), caps, true);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
  const glowCol = new Float32Array(glow.length);
  tint.set(S.stoneGlow).multiplyScalar(0.55);
  for (let i = 0; i < glow.length; i += 3) tint.toArray(glowCol, i);
  glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
  group.add(new THREE.Points(glowGeo, grasslandMaterials.glowPoints(13)));

  const boulderMat = grasslandMaterials.boulder();
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
      const puff = new THREE.IcosahedronGeometry(lr, 1);
      puff.deleteAttribute('uv');
      puff.scale(1, 0.82, 1);
      puff.translate(x + lx, ly, z + lz);
      leaves.push(colour(puff, (y) => c1.set(S.leafShade).lerp(c2.set(S.leafLight), Math.min(1, Math.max(0, (y - h * 0.6) / (h * 0.75))))));
    }
  }
  if (barks.length) {
    const stems = new THREE.Mesh(mergeGeometries(barks), grasslandMaterials.treeBark());
    const crowns = new THREE.Mesh(mergeGeometries(leaves), grasslandMaterials.treeCrown());
    stems.castShadow = crowns.castShadow = true;
    group.add(stems, crowns);
    for (const g of [...barks, ...leaves]) g.dispose();
  }

  const flowers = [];
  const drifts = getLookTier() === 'low' ? 22 : 44;
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
