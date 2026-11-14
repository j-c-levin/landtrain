import * as THREE from 'three';

const std = (params) => new THREE.MeshStandardMaterial(params);

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

// An HSL channel is a fixed number, [base, range] (base + rand * range), or
// [base, range, 'mid'] (base ± range / 2). Draws rand in h, s, l order.
const channel = (spec, rand) =>
  typeof spec === 'number' ? spec : spec[2] ? spec[0] + (rand() - 0.5) * spec[1] : spec[0] + rand() * spec[1];

export function jitterHSL(color, rand, spec) {
  return color.setHSL(channel(spec.h, rand), channel(spec.s, rand), channel(spec.l, rand));
}

// ------------------------------------------------------------- atmosphere

function skyKey(t, sky, fog, hemiSky, hemiGround, hemiI, dirCol, dirI, cloud, cloudOp, stars, exp) {
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
  };
}

// t, [zenith, upper, lower, horizon], fog, hemiSky, hemiGround, hemiI,
// sunCol, sunI, cloudTint, cloudOp, starAlpha, exposure
// Both tables must share identical t keyframes.
export const SKY_KEYS_PRAIRIE = [
  skyKey(0.000, ['#1d5cb8', '#3f88d6', '#93c4ec', '#dcebd8'], '#d4e4d4', '#eaf4ff', '#8e9a70', 1.0, '#fff1d6', 2.25, '#ffffff', 1.0, 0.0, 1.06),
  skyKey(0.360, ['#33639e', '#7da2c4', '#e3c79a', '#f4c27e'], '#ecca96', '#ffe2b8', '#7c7e58', 0.95, '#ffd9a0', 2.05, '#ffe7c4', 1.0, 0.0, 1.07),
  skyKey(0.440, ['#2c4a82', '#6a6fa0', '#e08f6e', '#ff9e54'], '#e89a66', '#ffb98a', '#5e5448', 0.78, '#ff9e58', 1.5, '#ffb287', 0.95, 0.05, 1.08),
  skyKey(0.500, ['#16204a', '#2c3164', '#5d4470', '#b06a58'], '#6e4e58', '#6a6a96', '#343246', 0.5, '#7a86c0', 0.7, '#3c3a58', 0.4, 0.55, 1.02),
  skyKey(0.565, ['#060b1c', '#0b1530', '#122044', '#1b2c52'], '#1b2c52', '#2c3c64', '#131826', 0.4, '#a8c4ee', 0.55, '#141d36', 0.15, 1.0, 0.98),
  skyKey(0.800, ['#060b1c', '#0b1530', '#122044', '#1b2c52'], '#1b2c52', '#2c3c64', '#131826', 0.4, '#a8c4ee', 0.55, '#141d36', 0.15, 1.0, 0.98),
  skyKey(0.860, ['#0a1230', '#1a2348', '#3a3060', '#7e4e62'], '#5e4458', '#4a4a78', '#1e2236', 0.45, '#8a90c8', 0.6, '#46395a', 0.3, 0.7, 1.0),
  skyKey(0.905, ['#1e3c74', '#4a5e9e', '#e8889a', '#ffc274'], '#f0a878', '#ffc8a0', '#5a5450', 0.8, '#ffb070', 1.7, '#ffb8a0', 0.9, 0.08, 1.2),
  skyKey(0.950, ['#2a62b2', '#5e96cc', '#bcd8d4', '#f0d8ac'], '#e4d8b4', '#f4ecd8', '#86926a', 0.95, '#ffe9c0', 2.1, '#fff0dc', 1.0, 0.0, 1.1),
  skyKey(1.000, ['#1d5cb8', '#3f88d6', '#93c4ec', '#dcebd8'], '#d4e4d4', '#eaf4ff', '#8e9a70', 1.0, '#fff1d6', 2.25, '#ffffff', 1.0, 0.0, 1.06),
];

export const SKY_KEYS_GRASSLAND = [
  skyKey(0.000, ['#1c64a8', '#4a98c4', '#a6dcd4', '#d4eede'], '#bfe3da', '#dcf2f0', '#6f8a78', 0.95, '#eaf6e6', 2.0, '#f2fbf4', 1.0, 0.0, 1.05),
  skyKey(0.360, ['#2c6e9e', '#74b0c0', '#bfe0c4', '#d6ecc4'], '#cfe6cc', '#dcf2e0', '#62805e', 0.9, '#dceed0', 1.85, '#e6f4e4', 1.0, 0.0, 1.06),
  skyKey(0.440, ['#285a86', '#5c84a4', '#9cc8b0', '#c6dcaa'], '#c2dcb2', '#cfe6c0', '#506650', 0.74, '#cfe2c0', 1.35, '#c6e0c2', 0.95, 0.05, 1.07),
  skyKey(0.500, ['#142242', '#283460', '#46506e', '#86808e'], '#5a6e6e', '#566f86', '#2c3640', 0.48, '#86a0bc', 0.62, '#363e54', 0.4, 0.55, 1.02),
  skyKey(0.565, ['#050c1a', '#0a162c', '#10243e', '#173050'], '#173050', '#26404e', '#101c22', 0.4, '#9cc0e6', 0.5, '#121f30', 0.15, 1.0, 0.98),
  skyKey(0.800, ['#050c1a', '#0a162c', '#10243e', '#173050'], '#173050', '#26404e', '#101c22', 0.4, '#9cc0e6', 0.5, '#121f30', 0.15, 1.0, 0.98),
  skyKey(0.860, ['#091230', '#16284a', '#2a3a5a', '#4a566a'], '#3a4e58', '#3c4e60', '#1a2230', 0.45, '#90b0d4', 0.55, '#3a4858', 0.3, 0.7, 1.0),
  skyKey(0.905, ['#1c4470', '#4870a0', '#9cc4c4', '#d2dcb0'], '#c0dcc8', '#cfe6cc', '#56685a', 0.78, '#d0e6cc', 1.5, '#c4dcc8', 0.9, 0.08, 1.16),
  skyKey(0.950, ['#2670b2', '#5ea6cc', '#aeded4', '#d4eecc'], '#cfe6d4', '#dcf2e2', '#74906e', 0.92, '#e2f2d8', 1.9, '#eef8e8', 1.0, 0.0, 1.08),
  skyKey(1.000, ['#1c64a8', '#4a98c4', '#a6dcd4', '#d4eede'], '#bfe3da', '#dcf2f0', '#6f8a78', 0.95, '#eaf6e6', 2.0, '#f2fbf4', 1.0, 0.0, 1.05),
];

export const SKY_LOOK = {
  fog: 0xdfe9df,
  sun: 0xfff1d6,
  sunIntensity: 2.25,
  hemiSky: 0xeaf4ff,
  hemiGround: 0x8e9a70,
  hemiIntensity: 1.0,
  sunCore: ['rgba(255,244,214,1)', 'rgba(255,214,150,0)'],
  sunHalo: ['rgba(255,206,140,0.8)', 'rgba(255,190,120,0)'],
  sunHigh: '#fff7e6',
  sunLow: '#ff9c4a',
  moonCore: ['rgba(236,242,255,1)', 'rgba(214,226,255,0)'],
  moonGlow: ['rgba(190,210,255,0.5)', 'rgba(170,195,255,0)'],
  starWarm: '#ffe2b8',
  starCool: '#cfe0ff',
  starWhite: '#ffffff',
  milkyWay: { h: [0.6, 0.06], s: 0.25, l: [0.55, 0.2] },
  milkyWayDim: 0.4,
  cloud: ['rgba(255,250,240,0.85)', 'rgba(255,250,240,0)'],
  meteor: [
    [0.0, 'rgba(180,200,255,0)'],
    [0.75, 'rgba(220,230,255,0.55)'],
    [0.95, 'rgba(255,255,255,1)'],
    [1.0, 'rgba(255,255,255,0)'],
  ],
  fireflyGlsl: '1.0, 0.85, 0.45',
  smoke: ['rgba(245,238,228,0.65)', 'rgba(245,238,228,0)'],
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
  fadingTrunk: (color) => std({ color, roughness: 1, transparent: true }),
  fadingLeaf: () => std({ roughness: 1, flatShading: true, transparent: true }),
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

const haloMaterial = ([inner, outer]) =>
  new THREE.SpriteMaterial({ map: softDiscTexture(inner, outer), transparent: true, depthWrite: false, fog: false });

// ---------------------------------------------------------------- prairie

export const PRAIRIE_LOOK = {
  ground: 0xc9af72,
  patches: [0xb8a868, 0xa9a673, 0x9d9c66, 0xd0b376, 0xbfa05f],
  tuft: { h: [0.13, 0.1], s: [0.38, 0.2], l: [0.42, 0.16] },
  bush: { h: [0.21, 0.07], s: [0.3, 0.18], l: [0.34, 0.12] },
  stone: { h: 0.08, s: [0.1, 0.1], l: [0.45, 0.15] },
  flower: { hues: [0.04, 0.12], s: 0.85, l: [0.62, 0.1] },
  treeTrunk: 0x7a5337,
  treeLeaf: { h: [0.18, 0.1], s: [0.32, 0.2], l: [0.34, 0.14] },
  hill: 0xb3a584,
  rock: 0x8d7f72,
  rockDark: 0x6f6258,
  ridge: 0x7d6e63,
  ridgeWarm: 0x94806c,
  greatTree: {
    mesa: 0xa5765a,
    trunk: 0x6e4a33,
    leaf: 0x9fae5e,
    leafGlow: 0x33401a,
    lantern: 0xffd27c,
    lanternGlow: 0xffaa44,
    halo: ['rgba(255,196,110,0.55)', 'rgba(255,196,110,0)'],
  },
};

export const prairieMaterials = {
  ground: () =>
    std({ color: PRAIRIE_LOOK.ground, roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
  hill: () => std({ color: PRAIRIE_LOOK.hill, roughness: 1, flatShading: true }),
  rock: (color) => std({ color, roughness: 0.95, flatShading: true }),
  mesa: () => std({ color: PRAIRIE_LOOK.greatTree.mesa, roughness: 0.95, fog: false, flatShading: true }),
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
  ground: 0x6a9148,
  shoreLip: 0x6a9148,
  shoreMud: 0x4f5a34,
  shorePale: 0x79a35b,
  patches: [0x7fae5c, 0x55803c, 0x8fbc6e, 0x4a7136, 0x9cc078],
  tuft: { h: [0.26, 0.06], s: [0.35, 0.15], l: [0.34, 0.1] },
  bush: { h: [0.27, 0.06], s: [0.34, 0.18], l: [0.3, 0.12] },
  hummock: { h: [0.28, 0.05], s: [0.4, 0.15], l: [0.32, 0.1] },
  flower: { hues: [0.0, 0.13, 0.78], s: 0.9, l: [0.65, 0.12] },
  water: 0x5b93a8,
  cattailStalk: { h: [0.26, 0.06, 'mid'], s: [0.45, 0.2, 'mid'], l: [0.35, 0.16, 'mid'] },
  cattailHead: 0x8a6a42,
  lilyPad: { h: [0.3, 0.08, 'mid'], s: [0.4, 0.2, 'mid'], l: [0.35, 0.16, 'mid'] },
  willowTrunk: 0x6a5236,
  willowLeaf: { h: [0.27, 0.06], s: [0.36, 0.16], l: [0.32, 0.12] },
  hill: 0x6f9655,
  boulder: 0x6f7a5c,
  boulderDark: 0x586349,
  causeway: {
    deck: 0x9c6b3f,
    deckJitter: 0.04,
    post: 0x7a5230,
    rail: 0x6a4a2e,
    lantern: 0xffd9a0,
    lanternGlow: 0xffc46a,
    glow: ['rgba(255,196,110,0.5)', 'rgba(255,196,110,0)'],
  },
  moatGlow: ['rgba(140,190,255,0.5)', 'rgba(140,190,255,0)'],
  silverTree: {
    knoll: 0x5f8a4c,
    knollFoot: 0x54793f,
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

const waterBase = { roughness: 0.25, metalness: 0.1, transparent: true };
const pullForward = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

export const grasslandMaterials = {
  ground: () => std({ color: GRASSLAND_LOOK.ground, roughness: 1 }),
  shore: () => std({ color: 0xffffff, roughness: 1, vertexColors: true }),
  hill: () => std({ color: GRASSLAND_LOOK.hill, roughness: 1, flatShading: true }),
  boulder: (color) => std({ color, roughness: 0.96, flatShading: true }),
  riverWater: (normalMap) =>
    std({
      color: GRASSLAND_LOOK.water, ...waterBase, opacity: 0.7,
      normalMap, normalScale: new THREE.Vector2(0.55, 0.55), fog: true, ...pullForward,
    }),
  riverRipple: (normalMap) =>
    std({
      color: GRASSLAND_LOOK.water, ...waterBase, opacity: 0.18, depthWrite: false,
      normalMap, normalScale: new THREE.Vector2(0.4, 0.4), fog: true, ...pullForward,
    }),
  moatWater: (normalMap) =>
    std({
      color: GRASSLAND_LOOK.water, ...waterBase, opacity: 0.7,
      normalMap, normalScale: new THREE.Vector2(0.55, 0.55), ...pullForward,
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
  lilyPad: (color) => std({ color, roughness: 0.85, side: THREE.DoubleSide }),
  cattailStalk: () => std({ roughness: 1, flatShading: true }),
  cattailHead: () => std({ color: GRASSLAND_LOOK.cattailHead, roughness: 1 }),
  causewayGlow: () =>
    new THREE.SpriteMaterial({
      map: softDiscTexture(...GRASSLAND_LOOK.causeway.glow), transparent: true, depthWrite: false,
    }),
  causewayPost: () => std({ color: GRASSLAND_LOOK.causeway.post, roughness: 0.9, flatShading: true }),
  causewayRail: () => std({ color: GRASSLAND_LOOK.causeway.rail, roughness: 0.9, flatShading: true }),
  causewayLantern: () =>
    std({
      color: GRASSLAND_LOOK.causeway.lantern, emissive: GRASSLAND_LOOK.causeway.lanternGlow, emissiveIntensity: 1.6,
    }),
  causewayPlank: (color) => std({ color, roughness: 0.85, flatShading: true }),
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
  hull: 0xa9674e,
  hullDark: 0x70483c,
  cream: 0xf2e3c6,
  innerWall: 0xe9d3ac,
  wood: 0x9a6b4f,
  woodDark: 0x7c5238,
  iron: 0x293c3d,
  brass: 0xc9913e,
  sage: 0x81957b,
  soil: 0x765238,
  soilWet: 0x332d24,
  leafThirsty: 0x659050,
  leafWatered: 0x709d57,
  leafGlow: 0x3b583c,
  cabLight: 0xffd5a4,
  fireLight: 0xffb273,
  readingLight: 0xffd6a1,
  bunkLight: 0xffd3a3,
  wheelClean: [0.29, 0.27, 0.25],
  wheelRusted: [0.54, 0.31, 0.18],
};

export function createTrainMaterials() {
  const C = TRAIN_LOOK;
  return {
    hull: std({ color: C.hull, roughness: 0.75 }),
    hullDark: std({ color: C.hullDark, roughness: 0.8 }),
    cream: std({ color: C.cream, roughness: 0.85 }),
    innerWall: std({ color: C.innerWall, roughness: 0.95 }),
    wood: std({ color: C.wood, roughness: 0.9 }),
    woodDark: std({ color: C.woodDark, roughness: 0.9 }),
    iron: std({ color: C.iron, roughness: 0.6, metalness: 0.35 }),
    brass: std({ color: C.brass, roughness: 0.4, metalness: 0.6 }),
    glow: std({ color: 0xffd9a0, emissive: 0xffb35c, emissiveIntensity: 1.6, roughness: 0.5 }),
    headlamp: std({ color: 0xffe9b0, emissive: 0xffc868, emissiveIntensity: 2.4 }),
    wheel: std({ color: 0x4a4440, roughness: 0.55, metalness: 0.4 }),
    foliage: std({ color: 0x6f9a4a, roughness: 0.9 }),
    pillow: std({ color: C.brass, roughness: 0.95 }),
    sage: std({ color: C.sage, roughness: 0.95 }),
    engine: std({ color: 0x315d5b, roughness: 0.62, metalness: 0.35 }),
    copper: std({ color: 0x98634c, roughness: 0.62, metalness: 0.45 }),
    roofGreen: std({ color: 0x405f52, roughness: 0.85, metalness: 0.12 }),
    teal: std({ color: 0x477b79, roughness: 0.86 }),
    wine: std({ color: 0x824e55, roughness: 1, side: THREE.DoubleSide }),
    linen: std({ color: 0xe3cfae, roughness: 1, side: THREE.DoubleSide }),
    pages: std({ color: 0xf1ddb5, roughness: 1 }),
    instrument: std({ color: 0xf4e7c7, roughness: 0.7, emissive: 0xf7b96c, emissiveIntensity: 0.16 }),
    lampshade: std({ color: 0xe5c78c, roughness: 1, emissive: 0xffc879, emissiveIntensity: 0.32, side: THREE.DoubleSide }),
    glass: std({ color: 0xabcac5, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.24, side: THREE.DoubleSide }),
    lightPool: new THREE.MeshBasicMaterial({ color: 0xffd6a1, transparent: true, opacity: 0.12, depthWrite: false }),
    firebox: std({ color: 0x6b2f1a, emissive: 0xff6a2a, emissiveIntensity: 1.2, roughness: 0.6 }),
    ember: std({ color: 0xffb04c, emissive: 0xffb33e, emissiveIntensity: 1.7, roughness: 1 }),
    upholstery: std({ color: C.hull, roughness: 0.95 }),
    book: std({ color: 0x5c7aa8, roughness: 0.8 }),
    sootGrime: std({ color: 0x5a4035, roughness: 0.98 }),
  };
}

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
    body: std({ color: 0xd9a441, roughness: 0.9 }),
    skin: std({ color: 0xf0c8a0, roughness: 0.9 }),
    scarf: std({ color: 0xb5483a, roughness: 0.95 }),
    boot: std({ color: 0x5c4332, roughness: 0.95 }),
  };
}

// -------------------------------------------------------------------- map

export const MAP_LOOK = {
  shroud: '#221a30',
  shroudBlotch: 'rgba(58,44,72,0.35)',
  route: 0xf7ead2,
  waypoint: 0xecd9a0,
  beacon: ['rgba(255,205,120,0.95)', 'rgba(255,205,120,0)'],
};

export const mapMaterials = {
  shroud: (map) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, fog: false }),
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
