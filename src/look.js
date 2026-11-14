import * as THREE from 'three';

const std = (params) => new THREE.MeshStandardMaterial(params);

let lookTier = 'high';
export function setLookTier(tier) {
  lookTier = tier;
}
export const getLookTier = () => lookTier;

// Enamel: a glossy clear coat over paint on the high tier, plain gloss below it.
const enamel = (params, coat = 0.55) =>
  lookTier === 'high'
    ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: coat, clearcoatRoughness: 0.28 })
    : std(params);

const FLOCK_PARS = /* glsl */ `
  varying vec3 vFlockPos;
  uniform vec3 uFlockA;
  uniform vec3 uFlockB;
  uniform vec3 uFlockC;
  uniform vec3 uFlockD;
  uniform vec3 uFlockMud;
  uniform vec3 uFlockSand;
  #ifdef FLOCK_SHORE
    varying vec2 vShore;
  #endif
  float fHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float fNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fFbm(vec2 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < FLOCK_OCTAVES; i++) {
      s += a * fNoise(p);
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return s / (1.0 - a * 2.0);
  }
`;

const FLOCK_FRAG = /* glsl */ `
  {
    vec2 fp = vFlockPos.xz;
    float fBig = fFbm(fp * 0.011);
    float fMid = fFbm(fp * 0.052 + 40.0);
    float fBare = fFbm(fp * 0.023 + 90.0);
    vec3 fc = mix(uFlockA, uFlockB, smoothstep(0.38, 0.62, fBig));
    fc = mix(fc, uFlockC, smoothstep(0.48, 0.72, fMid) * 0.7);
    fc = mix(fc, uFlockD, smoothstep(0.58, 0.76, fBare) * 0.8);
    float fNear = 1.0 - smoothstep(30.0, 140.0, length(vViewPosition));
    float fGrain = fNoise(fp * 5.3) * 0.6 + fNoise(fp * 13.0) * 0.4;
    fc *= 1.0 + (fGrain - 0.5) * 0.34 * fNear + (fNoise(fp * 0.7) - 0.5) * 0.14;
    #ifdef FLOCK_SHORE
      fc = mix(fc, uFlockSand, vShore.y);
      fc = mix(fc, uFlockMud, vShore.x);
    #endif
    diffuseColor.rgb *= fc;
  }
`;

// Static-grass flock: world-space noise blends four paint tints so the ground
// never tiles; `shore` adds a per-vertex mud/sand blend (attribute aShore).
export function flockMaterial({ tints, mud = 0x4f5a34, sand = 0xcbb98a, shore = false, ...params }) {
  const mat = std({ color: 0xffffff, roughness: 1, ...params });
  const uniforms = {
    uFlockA: { value: new THREE.Color(tints[0]) },
    uFlockB: { value: new THREE.Color(tints[1]) },
    uFlockC: { value: new THREE.Color(tints[2]) },
    uFlockD: { value: new THREE.Color(tints[3]) },
    uFlockMud: { value: new THREE.Color(mud) },
    uFlockSand: { value: new THREE.Color(sand) },
  };
  mat.defines = { FLOCK_OCTAVES: lookTier === 'low' ? 2 : 4 };
  if (shore) mat.defines.FLOCK_SHORE = '';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFlockPos;
        #ifdef FLOCK_SHORE
          attribute vec2 aShore;
          varying vec2 vShore;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFlockPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef FLOCK_SHORE
          vShore = aShore;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FLOCK_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FLOCK_FRAG}`);
  };
  mat.customProgramCacheKey = () => `flock-${shore}-${mat.defines.FLOCK_OCTAVES}`;
  return mat;
}

export function softDiscTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A cotton-wool cloud: overlapping puffs along a flat base.
export function cloudTexture(rand, [inner, outer]) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const arch = Math.sin(t * Math.PI);
    const r = 20 + arch * 26 * (0.7 + rand() * 0.5);
    const x = 44 + t * 168 + (rand() - 0.5) * 14;
    const y = 92 - r * 0.62 - arch * rand() * 12;
    const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.25, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(0.72, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // shade the underside so the cloud has a lit top and a soft grey belly
  ctx.globalCompositeOperation = 'source-atop';
  const belly = ctx.createLinearGradient(0, 40, 0, 104);
  belly.addColorStop(0, 'rgba(120,130,160,0)');
  belly.addColorStop(1, 'rgba(120,130,160,0.42)');
  ctx.fillStyle = belly;
  ctx.fillRect(0, 0, 256, 128);
  ctx.globalCompositeOperation = 'destination-out';
  const base = ctx.createLinearGradient(0, 86, 0, 108);
  base.addColorStop(0, 'rgba(0,0,0,0)');
  base.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 86, 256, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// An HSL channel is a fixed number, [base, range] (base + rand * range), or
// [base, range, 'mid'] (base ± range / 2). Draws rand in h, s, l order.
const channel = (spec, rand) =>
  typeof spec === 'number' ? spec : spec[2] ? spec[0] + (rand() - 0.5) * spec[1] : spec[0] + rand() * spec[1];

export function jitterHSL(color, rand, spec) {
  return color.setHSL(channel(spec.h, rand), channel(spec.s, rand), channel(spec.l, rand));
}

// ------------------------------------------------------------- atmosphere

function skyKey(t, sky, fog, hemiSky, hemiGround, hemiI, dirCol, dirI, cloud, cloudOp, stars, exp, env) {
  return {
    t,
    sky: sky.map((c) => new THREE.Color(c)),
    fog: new THREE.Color(fog),
    hemiSky: new THREE.Color(hemiSky),
    hemiGround: new THREE.Color(hemiGround),
    hemiI,
    dirCol: new THREE.Color(dirCol),
    dirI,
    cloud: new THREE.Color(cloud),
    cloudOp,
    stars,
    exp,
    env,
  };
}

// t, [zenith, upper, lower, horizon], fog, hemiSky, hemiGround, hemiI,
// keyCol, keyI, cloudTint, cloudOp, starAlpha, exposure, environment intensity
// Both tables must share identical t keyframes.
export const SKY_KEYS_PRAIRIE = [
  skyKey(0.000, ['#2f7fd0', '#62a6e2', '#b4d8ee', '#f3ead2'], '#e9e2c8', '#cfe4ff', '#b89a62', 0.55, '#fff0d2', 3.1, '#ffffff', 1.0, 0.0, 1.0, 0.5),
  skyKey(0.360, ['#3c74b4', '#86aed0', '#ecd2a2', '#fbc987'], '#f1cf9c', '#ffe4bc', '#a8824e', 0.5, '#ffd492', 3.0, '#ffe9c8', 1.0, 0.0, 1.0, 0.46),
  skyKey(0.440, ['#31508e', '#7a76ac', '#f0a07c', '#ffb468'], '#f0a878', '#d8a8b4', '#a8683c', 0.5, '#ffa052', 5.2, '#ffb48c', 0.95, 0.05, 1.0, 0.3),
  skyKey(0.500, ['#1a2656', '#353a74', '#70507e', '#c47a62'], '#6c5270', '#6f73ac', '#3c3450', 0.4, '#8f9ad8', 0.5, '#4a4468', 0.45, 0.55, 1.06, 0.2),
  skyKey(0.565, ['#070d2a', '#101c4c', '#22346e', '#3c4e8c'], '#2a3a6a', '#6276d0', '#22244a', 0.5, '#93a8ff', 1.5, '#1c2a52', 0.2, 1.0, 1.12, 0.1),
  skyKey(0.800, ['#070d2a', '#101c4c', '#22346e', '#3c4e8c'], '#2a3a6a', '#6276d0', '#22244a', 0.5, '#93a8ff', 1.5, '#1c2a52', 0.2, 1.0, 1.12, 0.1),
  skyKey(0.860, ['#0e1838', '#1f2a56', '#44386c', '#8e586c'], '#5c4864', '#56589a', '#262a42', 0.42, '#98a0e0', 0.6, '#50426a', 0.35, 0.7, 1.06, 0.16),
  skyKey(0.905, ['#24447e', '#5468a8', '#f092a2', '#ffc87c'], '#f2ae82', '#e0b4c0', '#8a6248', 0.44, '#ffa868', 2.8, '#ffbea8', 0.9, 0.08, 1.04, 0.34),
  skyKey(0.950, ['#3276c4', '#6aa4d8', '#c4e0da', '#f6e0b4'], '#ecdfbc', '#e2ecf4', '#b0965e', 0.52, '#ffe6b8', 3.0, '#fff2e0', 1.0, 0.0, 1.0, 0.48),
  skyKey(1.000, ['#2f7fd0', '#62a6e2', '#b4d8ee', '#f3ead2'], '#e9e2c8', '#cfe4ff', '#b89a62', 0.55, '#fff0d2', 3.1, '#ffffff', 1.0, 0.0, 1.0, 0.5),
];

export const SKY_KEYS_GRASSLAND = [
  skyKey(0.000, ['#2a78c4', '#5aa6dc', '#b2e0e2', '#e8f2dc'], '#dcecd8', '#d0ecff', '#7a9a58', 0.55, '#fff4dc', 3.0, '#ffffff', 1.0, 0.0, 1.0, 0.5),
  skyKey(0.360, ['#3878aa', '#7cb6c8', '#cce6c8', '#eef0c4'], '#e2eccc', '#e2f4e4', '#6e9050', 0.5, '#fbe8b8', 2.9, '#f2f8e8', 1.0, 0.0, 1.0, 0.46),
  skyKey(0.440, ['#2e5e8e', '#6a8cae', '#b8cca8', '#f0cf92'], '#dcc898', '#cad8c8', '#6c7a48', 0.5, '#ffbc72', 4.8, '#f0d8b4', 0.95, 0.05, 1.0, 0.3),
  skyKey(0.500, ['#16264a', '#2c3a68', '#506078', '#948a8e'], '#5c7078', '#5e7a9a', '#2e3c48', 0.4, '#8cacd0', 0.5, '#3e4860', 0.45, 0.55, 1.06, 0.2),
  skyKey(0.565, ['#081430', '#10224a', '#1c3a62', '#30587a'], '#24445e', '#4c7eb0', '#16283a', 0.5, '#a4ccff', 1.2, '#18304a', 0.2, 1.0, 1.12, 0.12),
  skyKey(0.800, ['#081430', '#10224a', '#1c3a62', '#30587a'], '#24445e', '#4c7eb0', '#16283a', 0.5, '#a4ccff', 1.2, '#18304a', 0.2, 1.0, 1.12, 0.12),
  skyKey(0.860, ['#0c1836', '#1a2e54', '#324664', '#566474'], '#405864', '#46607a', '#1e2c3a', 0.42, '#98bce0', 0.6, '#405262', 0.35, 0.7, 1.06, 0.16),
  skyKey(0.905, ['#224a7a', '#5078aa', '#a8ccc8', '#f0e0b0'], '#d4e2c4', '#d4e8d4', '#5e7654', 0.44, '#ffd89c', 2.6, '#e2ecd8', 0.9, 0.08, 1.04, 0.34),
  skyKey(0.950, ['#2e7cc0', '#66aed6', '#b8e4dc', '#e4f2d0'], '#dcecd4', '#dcf2ec', '#789a60', 0.52, '#fdf0cc', 2.9, '#f6fbf0', 1.0, 0.0, 1.0, 0.48),
  skyKey(1.000, ['#2a78c4', '#5aa6dc', '#b2e0e2', '#e8f2dc'], '#dcecd8', '#d0ecff', '#7a9a58', 0.55, '#fff4dc', 3.0, '#ffffff', 1.0, 0.0, 1.0, 0.5),
];

export const SKY_LOOK = {
  fog: 0xe9e2c8,
  sun: 0xfff0d2,
  sunIntensity: 3.1,
  hemiSky: 0xcfe4ff,
  hemiGround: 0xb89a62,
  hemiIntensity: 0.55,
  sunCore: ['rgba(255,246,220,1)', 'rgba(255,220,160,0)'],
  sunHalo: ['rgba(255,210,150,0.8)', 'rgba(255,190,120,0)'],
  sunHigh: '#fff7e6',
  sunLow: '#ff9c4a',
  moonCore: ['rgba(240,245,255,1)', 'rgba(214,226,255,0)'],
  moonGlow: ['rgba(190,210,255,0.5)', 'rgba(170,195,255,0)'],
  starWarm: '#ffe2b8',
  starCool: '#cfe0ff',
  starWhite: '#ffffff',
  milkyWay: { h: [0.6, 0.06], s: 0.25, l: [0.55, 0.2] },
  milkyWayDim: 0.4,
  cloud: ['rgba(255,253,247,1)', 'rgba(255,253,247,0)'],
  meteor: [
    [0.0, 'rgba(180,200,255,0)'],
    [0.75, 'rgba(220,230,255,0.55)'],
    [0.95, 'rgba(255,255,255,1)'],
    [1.0, 'rgba(255,255,255,0)'],
  ],
  fireflyGlsl: '1.0, 0.85, 0.45',
  smoke: ['rgba(248,242,232,0.8)', 'rgba(248,242,232,0)'],
  // studio environment the enamel and brass reflect: [r, g, b] linear
  envZenith: [0.62, 0.78, 1.0],
  envHorizon: [1.0, 0.95, 0.86],
  envGround: [0.5, 0.4, 0.26],
  envSoftbox: [7.0, 6.2, 4.8],
};

export const skyMaterials = {
  dome: (map) => new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, fog: false, depthWrite: false }),
  disc: ([inner, outer]) =>
    new THREE.SpriteMaterial({ map: softDiscTexture(inner, outer), transparent: true, depthWrite: false, fog: false }),
  meteor: (map) =>
    new THREE.SpriteMaterial({
      map, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }),
  cloud: (map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }),
  smoke: (map) => new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, depthWrite: false }),
};

// ------------------------------------------------------------ shared flora

export const floraMaterials = {
  tuft: () => std({ roughness: 1 }),
  clump: () => std({ roughness: 1, flatShading: true }),
  flower: () => std({ roughness: 0.8 }),
  fadingTrunk: (color) => std({ color, roughness: 0.9, transparent: true }),
  // leaf geometry must carry a colour attribute (drybrushed crown shading)
  fadingLeaf: () => std({ roughness: 1, flatShading: true, transparent: true, vertexColors: true }),
  // ground-cover instances: vertex colour carries the root-to-tip gradient
  cover: (params = {}) => std({ roughness: 1, vertexColors: true, ...params }),
  meadowPatch: (color, opacity) =>
    std({
      color,
      roughness: 1,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
};

// Backscene pieces take only part of the haze, so far hills keep their paint.
function backdrop(mat, haze = 0.5) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>', `#ifdef USE_FOG\n  vFogDepth = -mvPosition.z * ${haze.toFixed(2)};\n#endif`
    );
  };
  mat.customProgramCacheKey = () => `backdrop-${haze}`;
  return mat;
}

const haloMaterial = ([inner, outer]) =>
  new THREE.SpriteMaterial({ map: softDiscTexture(inner, outer), transparent: true, depthWrite: false, fog: false });

// ---------------------------------------------------------------- prairie

export const PRAIRIE_LOOK = {
  ground: 0xd0ae62,
  // straw flock, sun-bleached flock, dry olive, bare ochre earth
  flock: [0xcfb46c, 0xdcc88e, 0xb3aa62, 0xc09a66],
  tuft: { h: [0.11, 0.06], s: [0.5, 0.2], l: [0.4, 0.13] },
  tussock: { h: [0.12, 0.07], s: [0.42, 0.2], l: [0.44, 0.14] },
  bush: { h: [0.21, 0.07], s: [0.24, 0.14], l: [0.33, 0.09] },
  stone: { h: [0.07, 0.03], s: [0.2, 0.12], l: [0.36, 0.14] },
  flower: { hues: [0.02, 0.13, 0.94, 0.14], s: 0.92, l: [0.6, 0.12] },
  treeTrunk: 0x6f4a30,
  treeLeaf: { h: [0.2, 0.08], s: [0.4, 0.16], l: [0.36, 0.1] },
  hill: 0xc98f62,
  mesaBands: [0xc8855a, 0xdba878, 0xb06a48, 0xe6c092],
  rock: 0xa38a72,
  rockDark: 0x846a58,
  ridge: 0x8f705c,
  ridgeWarm: 0xb28a66,
  greatTree: {
    mesa: 0xb87852,
    trunk: 0x6e4a33,
    leaf: 0xa6b455,
    leafGlow: 0x33401a,
    lantern: 0xffd27c,
    lanternGlow: 0xffaa44,
    halo: ['rgba(255,196,110,0.55)', 'rgba(255,196,110,0)'],
  },
};

export const prairieMaterials = {
  ground: () =>
    flockMaterial({ tints: PRAIRIE_LOOK.flock, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
  hill: () => backdrop(std({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: true })),
  rock: (color) => std({ color, roughness: 0.92, flatShading: true }),
  mesa: () => std({ color: 0xffffff, roughness: 0.95, fog: false, flatShading: true, vertexColors: true }),
  trunk: () => std({ color: PRAIRIE_LOOK.greatTree.trunk, roughness: 0.9, fog: false }),
  leaf: () =>
    std({
      color: PRAIRIE_LOOK.greatTree.leaf, roughness: 0.85, fog: false,
      emissive: PRAIRIE_LOOK.greatTree.leafGlow, emissiveIntensity: 0.45, flatShading: true,
    }),
  lantern: () =>
    std({
      color: PRAIRIE_LOOK.greatTree.lantern, emissive: PRAIRIE_LOOK.greatTree.lanternGlow,
      emissiveIntensity: 2.2, fog: false,
    }),
  halo: () => haloMaterial(PRAIRIE_LOOK.greatTree.halo),
};

// -------------------------------------------------------------- grassland

export const GRASSLAND_LOOK = {
  ground: 0x7ca24a,
  // spring flock, light meadow flock, deep moss, clover-dark
  flock: [0x7fa648, 0x9cbd5c, 0x5f8a3e, 0x6d9a52],
  shoreMud: 0x6a5a3c,
  shoreSand: 0xcdbb8a,
  tuft: { h: [0.24, 0.07], s: [0.5, 0.18], l: [0.4, 0.14] },
  tussock: { h: [0.23, 0.07], s: [0.44, 0.16], l: [0.36, 0.12] },
  bush: { h: [0.27, 0.07], s: [0.38, 0.16], l: [0.23, 0.08] },
  stone: { h: [0.14, 0.08], s: [0.1, 0.08], l: [0.42, 0.14] },
  hummock: { h: [0.28, 0.05], s: [0.4, 0.15], l: [0.32, 0.1] },
  flower: { hues: [0.0, 0.13, 0.78, 0.92], s: 0.9, l: [0.68, 0.12] },
  water: 0x2f7f93,
  waterDeep: 0x1c5a72,
  cattailStalk: { h: [0.26, 0.06, 'mid'], s: [0.45, 0.2, 'mid'], l: [0.35, 0.16, 'mid'] },
  cattailHead: 0x8a6a42,
  lilyPad: { h: [0.3, 0.08, 'mid'], s: [0.5, 0.2, 'mid'], l: [0.36, 0.14, 'mid'] },
  willowTrunk: 0x5e4830,
  willowLeaf: { h: [0.25, 0.06], s: [0.42, 0.16], l: [0.36, 0.1] },
  hill: 0x7aa052,
  hillBands: [0x7aa052, 0x8fb463, 0x5f8a44, 0x9cbf70],
  moss: 0x6f9a48,
  boulder: 0x8a8f78,
  boulderDark: 0x6c735c,
  causeway: {
    deck: 0xa9754a,
    deckJitter: 0.07,
    beam: 0x6e4a2e,
    post: 0x7a5230,
    rail: 0x8a6a48,
    lantern: 0xffd9a0,
    lanternGlow: 0xffc46a,
    glow: ['rgba(255,196,110,0.5)', 'rgba(255,196,110,0)'],
  },
  moatGlow: ['rgba(140,190,255,0.5)', 'rgba(140,190,255,0)'],
  silverTree: {
    knoll: 0x6a9a4e,
    knollFoot: 0x5a8442,
    trunk: 0x6a5340,
    leaf: 0xa9c0dc,
    leafGlow: 0x9fb6d8,
    accent: 0xe8f0fa,
    accentGlow: 0xcfe0f2,
    lantern: 0xd6ecff,
    lanternGlow: 0x9fd4ff,
    halo: ['rgba(150,200,255,0.55)', 'rgba(150,200,255,0)'],
  },
};

// Poured-resin water: nearly opaque, deep-tinted, glossy enough to carry the sky.
const waterBase = { roughness: 0.08, metalness: 0.0, transparent: true };
const pullForward = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

export const grasslandMaterials = {
  ground: () => flockMaterial({ tints: GRASSLAND_LOOK.flock }),
  shore: () =>
    flockMaterial({ tints: GRASSLAND_LOOK.flock, mud: GRASSLAND_LOOK.shoreMud, sand: GRASSLAND_LOOK.shoreSand, shore: true }),
  hill: () => backdrop(std({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: true })),
  boulder: () => std({ color: 0xffffff, roughness: 0.94, flatShading: true, vertexColors: true }),
  riverWater: (normalMap) =>
    std({
      color: GRASSLAND_LOOK.water, ...waterBase, opacity: 0.9, envMapIntensity: 1.6,
      normalMap, normalScale: new THREE.Vector2(0.35, 0.35), fog: true, ...pullForward,
    }),
  riverRipple: (normalMap) =>
    std({
      color: 0xd8f0f0, ...waterBase, opacity: 0.12, depthWrite: false,
      normalMap, normalScale: new THREE.Vector2(0.5, 0.5), fog: true, ...pullForward,
    }),
  moatWater: (normalMap) =>
    std({
      color: GRASSLAND_LOOK.water, ...waterBase, opacity: 0.9, envMapIntensity: 1.6,
      normalMap, normalScale: new THREE.Vector2(0.35, 0.35), ...pullForward,
    }),
  moatGlow: () =>
    new THREE.MeshBasicMaterial({
      map: softDiscTexture(...GRASSLAND_LOOK.moatGlow),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  lilyPad: (color) => std({ color, roughness: 0.5, side: THREE.DoubleSide }),
  cattailStalk: () => std({ roughness: 1, flatShading: true }),
  cattailHead: () => std({ color: GRASSLAND_LOOK.cattailHead, roughness: 1 }),
  causewayGlow: () =>
    new THREE.SpriteMaterial({
      map: softDiscTexture(...GRASSLAND_LOOK.causeway.glow), transparent: true, depthWrite: false,
    }),
  causewayPost: () => std({ color: GRASSLAND_LOOK.causeway.post, roughness: 0.8 }),
  causewayRail: () => std({ color: GRASSLAND_LOOK.causeway.rail, roughness: 0.9 }),
  causewayBeam: () => std({ color: GRASSLAND_LOOK.causeway.beam, roughness: 0.8 }),
  causewayLantern: () =>
    std({
      color: GRASSLAND_LOOK.causeway.lantern, emissive: GRASSLAND_LOOK.causeway.lanternGlow, emissiveIntensity: 1.6,
    }),
  causewayPlank: () => std({ color: 0xffffff, roughness: 0.78 }),
  knoll: () => std({ color: GRASSLAND_LOOK.silverTree.knoll, roughness: 0.95, fog: false, flatShading: true }),
  knollFoot: () => std({ color: GRASSLAND_LOOK.silverTree.knollFoot, roughness: 0.95, fog: false, flatShading: true }),
  trunk: () => std({ color: GRASSLAND_LOOK.silverTree.trunk, roughness: 0.9, fog: false }),
  leaf: () =>
    std({
      color: GRASSLAND_LOOK.silverTree.leaf, roughness: 0.7, fog: false,
      emissive: GRASSLAND_LOOK.silverTree.leafGlow, emissiveIntensity: 0.18, flatShading: true,
    }),
  accent: () =>
    std({
      color: GRASSLAND_LOOK.silverTree.accent, roughness: 0.6, fog: false,
      emissive: GRASSLAND_LOOK.silverTree.accentGlow, emissiveIntensity: 0.25, flatShading: true,
    }),
  lantern: () =>
    std({
      color: GRASSLAND_LOOK.silverTree.lantern, emissive: GRASSLAND_LOOK.silverTree.lanternGlow,
      emissiveIntensity: 2.6, fog: false,
    }),
  halo: () => haloMaterial(GRASSLAND_LOOK.silverTree.halo),
};

// ------------------------------------------------------------------ train

export const TRAIN_LOOK = {
  hull: 0xb4492f,
  hullDark: 0x6e3528,
  cream: 0xf4e4bd,
  innerWall: 0xecd6aa,
  wood: 0xa8703f,
  woodDark: 0x74482a,
  iron: 0x26312f,
  brass: 0xd9a441,
  sage: 0x7f9c74,
  soil: 0x765238,
  soilWet: 0x332d24,
  leafThirsty: 0x659050,
  leafWatered: 0x6fa54f,
  leafGlow: 0x3b583c,
  cabLight: 0xffd5a4,
  fireLight: 0xffb273,
  readingLight: 0xffd6a1,
  bunkLight: 0xffd3a3,
  wheelClean: [0.3, 0.05, 0.035],
  wheelRusted: [0.4, 0.24, 0.15],
  // night practicals: warm pools the windows and lamps throw on the ground
  spill: ['rgba(255,186,104,0.7)', 'rgba(255,160,80,0)'],
  spillLight: 0xffb870,
  contact: ['rgba(34,24,18,0.62)', 'rgba(34,24,18,0)'],
  lampHalo: ['rgba(255,214,150,0.9)', 'rgba(255,190,110,0)'],
  windowGlow: ['rgba(255,176,96,0.5)', 'rgba(255,150,70,0)'],
};

export function createTrainMaterials() {
  const C = TRAIN_LOOK;
  return {
    hull: enamel({ color: C.hull, roughness: 0.5 }),
    hullDark: enamel({ color: C.hullDark, roughness: 0.55 }),
    cream: enamel({ color: C.cream, roughness: 0.55 }),
    innerWall: std({ color: C.innerWall, roughness: 0.95 }),
    wood: std({ color: C.wood, roughness: 0.72 }),
    woodDark: std({ color: C.woodDark, roughness: 0.7 }),
    iron: std({ color: C.iron, roughness: 0.48, metalness: 0.55 }),
    brass: std({ color: C.brass, roughness: 0.24, metalness: 1.0 }),
    glow: std({ color: 0xffd9a0, emissive: 0xffb35c, emissiveIntensity: 1.6, roughness: 0.5 }),
    headlamp: std({ color: 0xffe9b0, emissive: 0xffc868, emissiveIntensity: 2.4 }),
    wheel: enamel({ color: 0x6b1c12, roughness: 0.5, vertexColors: true }, 0.35),
    tyre: std({ color: 0x1f2624, roughness: 0.42, metalness: 0.7 }),
    foliage: std({ color: 0x6fa046, roughness: 0.85 }),
    pillow: std({ color: 0xd9a84e, roughness: 1 }),
    sage: enamel({ color: C.sage, roughness: 0.6 }, 0.4),
    engine: enamel({ color: 0x2c5e58, roughness: 0.42, metalness: 0.2 }),
    copper: std({ color: 0xc0704a, roughness: 0.34, metalness: 0.85 }),
    roofGreen: enamel({ color: 0x2f5a48, roughness: 0.55 }, 0.4),
    teal: std({ color: 0x3f7f7a, roughness: 0.8 }),
    wine: std({ color: 0x8a4a54, roughness: 1, side: THREE.DoubleSide }),
    linen: std({ color: 0xe6d2ae, roughness: 1, side: THREE.DoubleSide }),
    pages: std({ color: 0xf3e0b8, roughness: 1 }),
    instrument: std({ color: 0xf4e7c7, roughness: 0.7, emissive: 0xf7b96c, emissiveIntensity: 0.16 }),
    lampshade: std({ color: 0xe5c78c, roughness: 1, emissive: 0xffc879, emissiveIntensity: 0.32, side: THREE.DoubleSide }),
    glass: std({ color: 0xabcac5, transparent: true, opacity: 0.14, depthWrite: false, roughness: 0.08, side: THREE.DoubleSide }),
    lightPool: new THREE.MeshBasicMaterial({ color: 0xffd6a1, transparent: true, opacity: 0.12, depthWrite: false }),
    firebox: std({ color: 0x6b2f1a, emissive: 0xff6a2a, emissiveIntensity: 1.2, roughness: 0.6 }),
    ember: std({ color: 0xffb04c, emissive: 0xffb33e, emissiveIntensity: 1.7, roughness: 1 }),
    upholstery: std({ color: 0xb85a3a, roughness: 1 }),
    book: std({ color: 0x4f74aa, roughness: 0.8 }),
    sootGrime: std({ color: 0x5a4035, roughness: 0.98 }),
  };
}

export const trainFx = {
  contact: () =>
    new THREE.MeshBasicMaterial({
      map: softDiscTexture(...TRAIN_LOOK.contact), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }),
  spill: () =>
    new THREE.MeshBasicMaterial({
      map: softDiscTexture(...TRAIN_LOOK.spill), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    }),
  lampHalo: () =>
    new THREE.SpriteMaterial({
      map: softDiscTexture(...TRAIN_LOOK.lampHalo), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
};

// drawn over the train without depth testing: a cheap stand-in for bloom
trainFx.windowGlow = () =>
  new THREE.SpriteMaterial({
    map: softDiscTexture(...TRAIN_LOOK.windowGlow), transparent: true, opacity: 0, depthWrite: false,
    depthTest: false, blending: THREE.AdditiveBlending,
  });

export const plantMaterials = {
  soil: () => std({ color: TRAIN_LOOK.soil, roughness: 1 }),
  leaf: (foliage) => {
    const mat = foliage.clone();
    mat.side = THREE.DoubleSide;
    mat.emissive.setHex(TRAIN_LOOK.leafGlow);
    mat.emissiveIntensity = 0.12;
    return mat;
  },
};

// -------------------------------------------------------------- character

export function createCharacterMaterials() {
  return {
    body: enamel({ color: 0xe2a22e, roughness: 0.6 }, 0.3),
    skin: std({ color: 0xf2c9a0, roughness: 0.75 }),
    scarf: std({ color: 0xc23f30, roughness: 0.95 }),
    boot: std({ color: 0x4e3626, roughness: 0.6 }),
    hat: std({ color: 0x3f6f6a, roughness: 0.9 }),
    eye: std({ color: 0x2a1c14, roughness: 0.3 }),
  };
}

// -------------------------------------------------------------------- map

export const MAP_LOOK = {
  // the unbuilt tabletop: kraft paper pencilled with a survey grid
  shroud: '#c9a878',
  paper: [0.78, 0.63, 0.43],
  paperDark: [0.62, 0.47, 0.3],
  ink: [0.3, 0.2, 0.13],
  route: 0xfff4dc,
  routeInk: 0x5a2c1e,
  waypoint: 0xfff0c8,
  beacon: ['rgba(255,205,120,0.95)', 'rgba(255,205,120,0)'],
};

const SHROUD_FRAG = /* glsl */ `
  {
    float known = 1.0 - sampledDiffuseColor.a;
    float edge = smoothstep(0.42, 0.5, 1.0 - known);
    vec2 wp = vShroudPos;
    float n = fract(sin(dot(floor(wp * 0.9), vec2(12.9898, 78.233))) * 43758.5453);
    float fibre = fract(sin(dot(floor(wp * vec2(0.12, 2.4)), vec2(39.3, 11.7))) * 24634.63);
    vec3 paper = mix(uPaperDark, uPaper, 0.72 + 0.16 * n + 0.12 * fibre);
    vec2 g = abs(fract(wp / 100.0 - 0.5) - 0.5) * 100.0;
    vec2 g5 = abs(fract(wp / 500.0 - 0.5) - 0.5) * 500.0;
    float px = max(fwidth(wp.x), 1e-3);
    float fine = 1.0 - smoothstep(0.0, px * 1.2, min(g.x, g.y));
    float major = 1.0 - smoothstep(0.0, px * 2.2, min(g5.x, g5.y));
    paper = mix(paper, uInk, max(fine * 0.16, major * 0.34));
    float rim = smoothstep(0.34, 0.47, 1.0 - known) * (1.0 - smoothstep(0.5, 0.62, 1.0 - known));
    paper = mix(paper, uInk, rim * 0.55);
    float shade = smoothstep(0.1, 0.42, 1.0 - known) * (1.0 - edge);
    diffuseColor.rgb = mix(uInk * 0.5, paper, edge);
    diffuseColor.a = opacity * max(edge, shade * 0.38);
  }
`;

export const mapMaterials = {
  // The canvas only carries the reveal mask in alpha; paper, grid and the inked
  // coastline of the known world are drawn in the shader so they stay crisp.
  shroud: (map) => {
    const mat = new THREE.MeshBasicMaterial({
      map, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false,
    });
    const uniforms = {
      uPaper: { value: new THREE.Color().setRGB(...MAP_LOOK.paper) },
      uPaperDark: { value: new THREE.Color().setRGB(...MAP_LOOK.paperDark) },
      uInk: { value: new THREE.Color().setRGB(...MAP_LOOK.ink) },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vShroudPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShroudPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vShroudPos;\nuniform vec3 uPaper;\nuniform vec3 uPaperDark;\nuniform vec3 uInk;')
        .replace('#include <map_fragment>', `#include <map_fragment>\n${SHROUD_FRAG}`);
    };
    return mat;
  },
  routeLine: () =>
    new THREE.LineDashedMaterial({
      color: MAP_LOOK.route, dashSize: 7, gapSize: 5, transparent: true, opacity: 0.9, depthTest: false, fog: false,
    }),
  waypoint: () => new THREE.MeshBasicMaterial({ color: MAP_LOOK.waypoint, transparent: true, depthTest: false, fog: false }),
  trainRing: () =>
    new THREE.MeshBasicMaterial({
      color: MAP_LOOK.route, transparent: true, depthTest: false, fog: false, side: THREE.DoubleSide,
    }),
  beacon: () =>
    new THREE.SpriteMaterial({
      map: softDiscTexture(...MAP_LOOK.beacon), transparent: true, depthTest: false, fog: false,
    }),
};

// ----------------------------------------------------------------- figure

export function createFigureMaterials() {
  return {
    coat: enamel({ color: 0x3d50ad, roughness: 0.62 }, 0.25),
    hat: enamel({ color: 0xd4472f, roughness: 0.6 }, 0.25),
    trim: std({ color: 0xf5e8c8, roughness: 0.85 }),
    scarf: std({ color: 0xf2b736, roughness: 0.9 }),
    legs: std({ color: 0xeee2c4, roughness: 0.9 }),
    skin: std({ color: 0xf4c9a2, roughness: 0.75 }),
    blush: std({ color: 0xe88f7c, roughness: 0.9 }),
    hair: std({ color: 0x5b3221, roughness: 0.85 }),
    boot: enamel({ color: 0x4a3024, roughness: 0.55 }, 0.2),
    eye: std({ color: 0x2a1c14, roughness: 0.3 }),
    leather: std({ color: 0xa5682f, roughness: 0.8 }),
    brass: std({ color: 0xd9a441, roughness: 0.35, metalness: 0.7 }),
    iron: std({ color: 0x3a3f44, roughness: 0.5, metalness: 0.5 }),
    copper: std({ color: 0xc47a45, roughness: 0.4, metalness: 0.6 }),
    cover: std({ color: 0x8a3c44, roughness: 0.9 }),
    pages: std({ color: 0xf6edd6, roughness: 1 }),
    water: new THREE.MeshBasicMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.75 }),
  };
}
