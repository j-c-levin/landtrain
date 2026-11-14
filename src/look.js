import * as THREE from 'three';
import { PAINT, PaintMaterial } from './paint.js';

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

// The overhead map is a drawn chart: uChart takes the model over to flat washes
// and ink, uChartNight lays the night's indigo over them.
export const CHART = {
  uChart: { value: 0 },
  uChartNight: { value: 0 },
  uChartInk: { value: new THREE.Color(0x3a2a1c) },
  uChartIndigo: { value: new THREE.Color(0x4a4e74) },
};

export function setChart(mapBlend, night) {
  const t = Math.min(1, Math.max(0, (mapBlend - 0.25) / 0.5));
  CHART.uChart.value = t * t * (3 - 2 * t);
  CHART.uChartNight.value = night;
}

const FLOCK_PARS = /* glsl */ `
  varying vec3 vFlockPos;
  uniform float uChart;
  uniform float uChartNight;
  uniform vec3 uChartInk;
  uniform vec3 uChartIndigo;
  vec3 fChart;
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

    // chart: three flat washes glazed over each other, pooling darker at their edges
    float cA = fFbm(fp * 0.0046 + 11.0);
    float cB = fFbm(fp * 0.0063 + 57.0);
    float cC = fFbm(fp * 0.0115 + 23.0);
    float wA = fwidth(cA) * 1.2 + 0.003;
    float wB = fwidth(cB) * 1.2 + 0.003;
    float wC = fwidth(cC) * 1.2 + 0.003;
    float mA = smoothstep(0.5 - wA, 0.5 + wA, cA);
    float mB = smoothstep(0.55 - wB, 0.55 + wB, cB);
    float mC = smoothstep(0.66 - wC, 0.66 + wC, cC);
    float rimA = mA * (1.0 - smoothstep(0.5, 0.5 + wA * 7.0, cA));
    float rimB = mB * (1.0 - smoothstep(0.55, 0.55 + wB * 7.0, cB));
    float rimC = mC * (1.0 - smoothstep(0.66, 0.66 + wC * 7.0, cC));
    vec3 wash = mix(uFlockB, vec3(1.0), 0.14);
    wash *= mix(vec3(1.0), uFlockD / uFlockB, mA * 0.6) * (1.0 - rimA * 0.16);
    wash *= mix(vec3(1.0), uFlockC / uFlockB, mB * 0.62) * (1.0 - rimB * 0.16);
    wash *= mix(vec3(1.0), uFlockA / uFlockB, mC * 0.6) * (1.0 - rimC * 0.14);
    #ifdef FLOCK_SHORE
      wash = mix(wash, uFlockSand, vShore.y * 0.85);
      wash = mix(wash, uFlockMud, vShore.x * 0.85);
    #endif
    wash *= 1.0 - 0.07 * (fNoise(fp * 0.9) - 0.5) - 0.08 * (fNoise(fp * 0.016) - 0.5);
    wash = mix(wash, uChartIndigo * (0.55 + 0.9 * dot(wash, vec3(0.3, 0.59, 0.11))), uChartNight);
    // pen stipple: a short dry stroke in the odd cell
    vec2 sc = fp / 19.0;
    vec2 si = floor(sc);
    float sr = fHash(si);
    float sa = fHash(si + 7.3) * 3.14159;
    vec2 sp = (fract(sc) - 0.5 - (vec2(fHash(si + 2.1), fHash(si + 4.7)) - 0.5) * 0.5) * 19.0;
    vec2 sq = vec2(cos(sa) * sp.x + sin(sa) * sp.y, cos(sa) * sp.y - sin(sa) * sp.x);
    float sw = fwidth(fp.x);
    float dash = (1.0 - smoothstep(0.16, 0.16 + sw, abs(sq.y))) * (1.0 - smoothstep(1.5, 1.5 + sw, abs(sq.x)));
    wash = mix(wash, uChartInk, dash * step(0.72, sr) * 0.8 * (1.0 - 0.6 * uChartNight));
    fChart = wash;
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
    ...CHART,
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
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FLOCK_FRAG}`)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, fChart, uChart);\n#include <opaque_fragment>');
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

function skyKey(t, sky, fog, hemiSky, hemiGround, hemiI, dirCol, dirI, cloud, cloudOp, stars, exp, env, glow, glowI, belt, beltI) {
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
    glow: new THREE.Color(glow),
    glowI,
    belt: new THREE.Color(belt),
    beltI,
  };
}

// t, [zenith, upper, lower, horizon], fog, hemiSky, hemiGround, hemiI,
// keyCol, keyI, cloudTint, cloudOp, starAlpha, exposure, environment intensity,
// sunward glow + strength, anti-solar belt + strength
// The four sky stops are the sky away from the sun; glow paints the sunward side.
// Both tables must share identical t keyframes.
export const SKY_KEYS_PRAIRIE = [
  skyKey(0.000, ['#2f7fd0', '#62a6e2', '#b4d8ee', '#f3ead2'], '#e9e2c8', '#bcd6ff', '#b89a62', 0.5, '#fff0d2', 3.5, '#ffffff', 1.0, 0.0, 1.0, 0.44, '#fff3d6', 0.45, '#f3ead2', 0.0),
  skyKey(0.360, ['#3c74b4', '#86aed0', '#d8cdb4', '#f0cfa0'], '#ecd0a6', '#c4d4f4', '#a8824e', 0.5, '#ffd492', 3.3, '#ffe9c8', 1.0, 0.0, 1.0, 0.4, '#ffcf8a', 0.7, '#f0c4b0', 0.25),
  skyKey(0.440, ['#1f4a94', '#4672b6', '#8e9cc8', '#a09cbc'], '#a09ab8', '#5a60f4', '#a07888', 1.35, '#ffbc78', 5.2, '#ffc8a0', 0.95, 0.05, 1.0, 0.12, '#ffb25a', 1.0, '#f0a0a4', 0.6),
  skyKey(0.500, ['#142454', '#2c3e7c', '#5a5c96', '#7a6a90'], '#5a587e', '#6f7fc0', '#3c3450', 0.42, '#8f9ad8', 0.5, '#5a4e74', 0.5, 0.55, 1.06, 0.2, '#ff8452', 0.85, '#8a6a9a', 0.3),
  skyKey(0.565, ['#070d2a', '#101c4c', '#22346e', '#3c4e8c'], '#2a3a6a', '#6276d0', '#22244a', 0.3, '#93a8ff', 0.7, '#26386a', 0.2, 1.0, 1.12, 0.04, '#ff8452', 0.0, '#3c4e8c', 0.0),
  skyKey(0.800, ['#070d2a', '#101c4c', '#22346e', '#3c4e8c'], '#2a3a6a', '#6276d0', '#22244a', 0.3, '#93a8ff', 0.7, '#26386a', 0.2, 1.0, 1.12, 0.04, '#e8707a', 0.0, '#3c4e8c', 0.0),
  skyKey(0.860, ['#0e1838', '#1f2c5c', '#3c4478', '#5c5680'], '#4c4a70', '#56589a', '#262a42', 0.42, '#98a0e0', 0.6, '#50426a', 0.4, 0.7, 1.06, 0.16, '#e8707a', 0.7, '#5c5680', 0.0),
  skyKey(0.905, ['#24447e', '#5c7cb8', '#b4b0d0', '#c0b0c4'], '#c4b0bc', '#8aa4f0', '#8a6248', 0.7, '#ffa868', 3.4, '#ffc8b4', 0.9, 0.08, 1.04, 0.3, '#ffb478', 0.95, '#f4a8b4', 0.6),
  skyKey(0.950, ['#3276c4', '#6aa4d8', '#c4e0da', '#f6e0b4'], '#ecdfbc', '#cfe0f8', '#b0965e', 0.52, '#ffe6b8', 3.3, '#fff2e0', 1.0, 0.0, 1.0, 0.44, '#ffe2b0', 0.6, '#f4d0c4', 0.2),
  skyKey(1.000, ['#2f7fd0', '#62a6e2', '#b4d8ee', '#f3ead2'], '#e9e2c8', '#bcd6ff', '#b89a62', 0.5, '#fff0d2', 3.5, '#ffffff', 1.0, 0.0, 1.0, 0.44, '#fff3d6', 0.45, '#f3ead2', 0.0),
];

export const SKY_KEYS_GRASSLAND = [
  skyKey(0.000, ['#2a78c4', '#5aa6dc', '#b2e0e2', '#e8f2dc'], '#dcecd8', '#bcdcff', '#7a9a58', 0.5, '#fff4dc', 3.4, '#ffffff', 1.0, 0.0, 1.0, 0.44, '#fff6dc', 0.4, '#e8f2dc', 0.0),
  skyKey(0.360, ['#3878aa', '#7cb6c8', '#cce6c8', '#eef0c4'], '#e2eccc', '#c8e4ec', '#6e9050', 0.5, '#fbe8b8', 3.2, '#f2f8e8', 1.0, 0.0, 1.0, 0.4, '#ffe09a', 0.6, '#e8d4c0', 0.2),
  skyKey(0.440, ['#1e4c8a', '#4a80b0', '#94b0c0', '#9cb0b8'], '#9aaeb4', '#5460f8', '#80809a', 1.3, '#ffb866', 5.4, '#ffd4a8', 0.95, 0.05, 1.0, 0.12, '#ffc066', 1.0, '#f0b0a0', 0.6),
  skyKey(0.500, ['#12264c', '#28406e', '#4c6484', '#6a7488'], '#506a7c', '#5e7a9a', '#2e3c48', 0.42, '#8cacd0', 0.5, '#4a5670', 0.5, 0.55, 1.06, 0.2, '#ff9060', 0.8, '#7a7a94', 0.25),
  skyKey(0.565, ['#081430', '#10224a', '#1c3a62', '#30587a'], '#24445e', '#4c7eb0', '#16283a', 0.3, '#a4ccff', 0.66, '#203a56', 0.2, 1.0, 1.12, 0.05, '#ff9060', 0.0, '#30587a', 0.0),
  skyKey(0.800, ['#081430', '#10224a', '#1c3a62', '#30587a'], '#24445e', '#4c7eb0', '#16283a', 0.3, '#a4ccff', 0.66, '#203a56', 0.2, 1.0, 1.12, 0.05, '#e08878', 0.0, '#30587a', 0.0),
  skyKey(0.860, ['#0c1836', '#1a2e54', '#324664', '#566474'], '#405864', '#46607a', '#1e2c3a', 0.42, '#98bce0', 0.6, '#405262', 0.4, 0.7, 1.06, 0.16, '#e08878', 0.6, '#566474', 0.0),
  skyKey(0.905, ['#224a7a', '#5484b4', '#a4c4cc', '#b8ccc8'], '#bccec4', '#a0c8e8', '#5e7654', 0.6, '#ffd89c', 3.0, '#f4e4d0', 0.9, 0.08, 1.04, 0.3, '#ffd080', 0.9, '#f0c0b8', 0.45),
  skyKey(0.950, ['#2e7cc0', '#66aed6', '#b8e4dc', '#e4f2d0'], '#dcecd4', '#cfeaf0', '#789a60', 0.52, '#fdf0cc', 3.2, '#f6fbf0', 1.0, 0.0, 1.0, 0.44, '#fff0c0', 0.5, '#e8dcc8', 0.15),
  skyKey(1.000, ['#2a78c4', '#5aa6dc', '#b2e0e2', '#e8f2dc'], '#dcecd8', '#bcdcff', '#7a9a58', 0.5, '#fff4dc', 3.4, '#ffffff', 1.0, 0.0, 1.0, 0.44, '#fff6dc', 0.4, '#e8f2dc', 0.0),
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
  sunLow: '#ff8a3c',
  // disc radius in radians and HDR gain, [high, on the horizon]
  sunSize: [0.026, 0.04],
  sunGain: [3.2, 2.4],
  // z of a setting sun's direction: negative stands it behind the cutaway
  sunBehind: -1.5,
  // how high the noon sun stands; lower rakes longer shadows off the model
  sunClimb: 0.62,
  moon: 0xeef2ff,
  galaxy: 0x2a3252,
  cloudDrift: 0.0005,
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
  // ground bounce onto the lens side of the train: [day, low sun, night] intensity
  bounce: 0xffd9a8,
  bounceI: [0.35, 1.7, 0.3],
  // at dusk the bounce cools toward the sky behind the lens, so shaded paint keeps its hue
  bounceDusk: 0xb4a4ff,
};

// High-tier finishing. Triples are [day, dusk, night].
export const GRADE_LOOK = {
  aoRadius: 1.1,
  aoTint: 0x4a4668,
  ao: [0.85, 0.8, 0.6],
  bloom: [0.22, 0.5, 0.7],
  bloomThreshold: [1.25, 0.95, 0.7],
  saturation: 0.07,
  contrast: 0.14,
  shadowTint: [0.035, 0.05, 0.04],
  shadowDay: 0x3050c0,
  shadowNight: 0x3040d0,
  sunHaze: 0.3,
  // cloud shadows drifting over the land: strength, tint, world-pattern drift per second
  cloudShadow: [0.3, 0.22, 0.1],
  cloudShadowTint: 0x8f9cd0,
  cloudShadowDrift: [0.004, 0.0015],
};

export const SMOKE_LOOK = {
  soot: 0x6e6862,
  ash: 0xdcd6cc,
  steam: 0xfaf8f2,
  // how far the light on a puff is pulled to grey, so dusk smoke is not purple
  neutral: 0.45,
  dustGain: 1.25,
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
  endWall: 0xd9bf94,
  sootWall: 0xcda677,
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
  fireLight: 0xff9c58,
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
    endWall: std({ color: C.endWall, roughness: 0.95 }),
    sootWall: std({ color: C.sootWall, roughness: 0.95 }),
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
    sage: enamel({ color: C.sage, roughness: 0.6, emissive: C.sage, emissiveIntensity: 0 }, 0.4),
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

// On the chart each car lies on a hatched shadow, as a draughtsman would ground a plan.
trainFx.chartShadow = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: { uChart: CHART.uChart, uChartInk: CHART.uChartInk, uSize: { value: new THREE.Vector2(1, 1) } },
    vertexShader: /* glsl */ `
      uniform vec2 uSize;
      varying vec2 vPlan;
      void main() {
        vPlan = uv * uSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uChart;
      uniform vec3 uChartInk;
      varying vec2 vPlan;
      void main() {
        float w = fwidth(vPlan.x);
        float stripe = abs(fract((vPlan.x + vPlan.y) / 1.3) - 0.5) * 1.3;
        float ink = 1.0 - smoothstep(0.2, 0.2 + w, stripe);
        gl_FragColor = vec4(uChartInk, ink * 0.8 * uChart);
        #include <colorspace_fragment>
      }
    `,
  });

// drawn over the train without depth testing: a cheap stand-in for bloom
trainFx.windowGlow = () =>
  new THREE.SpriteMaterial({
    map: softDiscTexture(...TRAIN_LOOK.windowGlow), transparent: true, opacity: 0, depthWrite: false,
    depthTest: false, blending: THREE.AdditiveBlending,
  });

// ------------------------------------------------------- painted interiors

// Rooms are hand-painted inside the enamel model: flat stepped shading, a
// violet fill wherever the lamps and the sun leave a surface dim, and by night
// every cool light swapped for cobalt so the lamps are the only warm thing.
// Each list is [day, dusk, night].
export const PAINT_LOOK = {
  fill: [0x6c64b0, 0x5c4a96, 0x2a3c96],
  fillGain: [0.62, 0.55, 0.6],
  lift: [0.9, 0.8, 0.7],
  ambient: [0.5, 0.4, 0.4],
  warm: [0.2, 0.3, 0.42],
  tint: [0xffffff, 0x7e6cb4, 0x3c58e0],
  tintGain: [1, 0.75, 0.7],
  mood: [0, 0.75, 1],
  band: [0.3, 0.34, 0.4],
  rim: [0.05, 0.1, 0.16],
  saturation: 1.06,
  figureGlow: [0.03, 0.08, 0.2],
};

const paintFills = PAINT_LOOK.fill.map((hex, i) => new THREE.Color(hex).multiplyScalar(PAINT_LOOK.fillGain[i]));
const paintTints = PAINT_LOOK.tint.map((hex, i) => new THREE.Color(hex).multiplyScalar(PAINT_LOOK.tintGain[i]));
const paints = new WeakMap();

// The painted twin of a train material. Lamps, glass and anything else that
// glows or fades keeps its own material.
export function painted(source) {
  if (source.isPaintMaterial) return source;
  const glows = source.emissive && source.emissive.getHex() !== 0 && source.emissiveIntensity > 0.5;
  if (!source.isMeshStandardMaterial || source.transparent || glows) return source;
  let paint = paints.get(source);
  if (!paint) {
    paint = new PaintMaterial({
      color: source.color, emissive: source.emissive, emissiveIntensity: source.emissiveIntensity,
      side: source.side, vertexColors: source.vertexColors,
    });
    paints.set(source, paint);
  }
  return paint;
}

// Partition walls stand in the room's own shade: no sun, moon or sky key reaches them.
export function shaded(source) {
  const paint = painted(source).clone();
  paint.shade = true;
  return paint;
}

const tween = (v, dusk, night) => {
  const d = v[0] + (v[1] - v[0]) * dusk;
  return d + (v[2] - d) * night;
};

export function setPaintLight(night, dusk) {
  PAINT.uPaintFill.value.copy(paintFills[0]).lerp(paintFills[1], dusk).lerp(paintFills[2], night);
  const L = PAINT_LOOK;
  PAINT.uPaintTint.value.copy(paintTints[0]).lerp(paintTints[1], dusk).lerp(paintTints[2], night);
  PAINT.uPaintLift.value.set(tween(L.lift, dusk, night), L.saturation, tween(L.ambient, dusk, night), tween(L.warm, dusk, night));
  PAINT.uPaintMood.value.set(tween(L.mood, dusk, night), tween(L.band, dusk, night), tween(L.rim, dusk, night), 0);
  const glow = tween(L.figureGlow, dusk, night);
  for (let i = 0; i < figurePaints.length; i++) figurePaints[i].emissiveIntensity = glow;
}

export const plantMaterials = {
  soil: () => new PaintMaterial({ color: TRAIN_LOOK.soil }),
  leaf: (foliage) => {
    const mat = painted(foliage).clone();
    mat.side = THREE.DoubleSide;
    mat.emissive.setHex(TRAIN_LOOK.leafGlow);
    mat.emissiveIntensity = 0.12;
    return mat;
  },
};

// -------------------------------------------------------------------- map

// A drawn chart laid over the model: unexplored country is bare chart paper,
// and the known world is a hole in the sheet with the tabletop showing through.
export const MAP_LOOK = {
  shroud: '#221a30',
  paper: 0xf0e2c0,
  paperNight: 0xe6dcc8,
  ink: 0x3a2a1c,
  rhumb: 0xa8482c,
  rose: [900, -260],
  route: 0xb5321a,
  casing: 0xfff3d6,
  markInk: 0x2b2018,
  beaconGlow: [1.0, 0.72, 0.3],
};

function letteringTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 500 58px Fraunces, Georgia, serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '14px';
    ctx.fillText('country not yet travelled', 512, 150);
    ctx.font = '400 30px Fraunces, Georgia, serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '22px';
    ctx.fillText('TERRA INCOGNITA', 512, 226);
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const fonts = globalThis.document?.fonts;
  if (fonts?.load) {
    fonts.load('italic 500 58px Fraunces').then(() => {
      draw();
      tex.needsUpdate = true;
    }, () => {});
  }
  return tex;
}

// Destination mark: a ringed bullseye in a soft glow, drawn without a canvas.
function beaconTexture() {
  const S = 96;
  const data = new Uint8Array(S * S * 4);
  const ss = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const ink = new THREE.Color(MAP_LOOK.markInk).convertLinearToSRGB();
  const red = new THREE.Color(MAP_LOOK.route).convertLinearToSRGB();
  const cream = new THREE.Color(MAP_LOOK.casing).convertLinearToSRGB();
  const glow = MAP_LOOK.beaconGlow;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
      const disc = 1 - ss(0.5, 0.53, r);
      const rim = ss(0.42, 0.44, r) * disc;
      const ring = ss(0.24, 0.26, r) * (1 - ss(0.33, 0.35, r));
      const dot = 1 - ss(0.1, 0.12, r);
      const mark = Math.max(ring, dot);
      const o = (y * S + x) * 4;
      for (let c = 0; c < 3; c++) {
        const k = 'rgb'[c];
        let v = cream[k] + (ink[k] - cream[k]) * rim;
        v += (red[k] - v) * mark;
        data[o + c] = Math.round(255 * (glow[c] + (v - glow[c]) * disc));
      }
      data[o + 3] = Math.round(255 * Math.max(disc, 0.6 * (1 - ss(0.5, 1, r)) ** 2));
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const SHROUD_VERT = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHEET_GLSL = /* glsl */ `
  uniform sampler2D map;
  uniform vec4 uRect;
  float inkHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float inkNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(inkHash(i), inkHash(i + vec2(1.0, 0.0)), f.x),
               mix(inkHash(i + vec2(0.0, 1.0)), inkHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // > 0 on the paper, < 0 where travel has cut the sheet away
  float sheet(vec2 w) {
    float a = texture2D(map, vec2((w.x - uRect.x) * uRect.z, 1.0 - (w.y - uRect.y) * uRect.w)).a;
    float n = inkNoise(w * 0.03) * 0.65 + inkNoise(w * 0.1) * 0.35;
    return a + (n - 0.5) * 0.34 - 0.6;
  }
`;

// Writes the sheet's own depth where the paper lies, so the pen that follows
// depth edges never traces country hidden beneath it.
const SHEET_DEPTH_FRAG = /* glsl */ `
  varying vec2 vWorld;
  ${SHEET_GLSL}
  void main() {
    if (sheet(vWorld) < 0.0) discard;
    gl_FragColor = vec4(0.0);
  }
`;

const SHROUD_FRAG = /* glsl */ `
  uniform sampler2D tLetters;
  uniform float uOpacity;
  uniform float uNight;
  uniform vec3 uPaper;
  uniform vec3 uPaperNight;
  uniform vec3 uInk;
  uniform vec3 uRhumb;
  uniform vec2 uRose;
  varying vec2 vWorld;
  ${SHEET_GLSL}
  void main() {
    float e = sheet(vWorld);
    float px = max(fwidth(vWorld.x), 1e-4);
    if (e < 0.0) {
      // the sheet stands a little proud of the model and shades it along the cut
      float lifted = sheet(vWorld - vec2(3.2, 3.6));
      float shade = smoothstep(-0.05, 0.04, lifted) * 0.16 + smoothstep(-0.1, 0.0, e) * 0.14;
      gl_FragColor = vec4(vec3(0.07, 0.045, 0.06), shade * uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    float fw = max(fwidth(e), 1e-5);
    vec3 col = uPaper * (1.0 - 0.06 * (inkNoise(vWorld * 0.9) - 0.5));
    col *= 1.0 - 0.08 * (inkNoise(vWorld * 0.008) - 0.5);

    vec2 g = abs(fract(vWorld / 100.0 - 0.5) - 0.5) * 100.0;
    col = mix(col, uInk, (1.0 - smoothstep(0.5, 1.4, min(g.x, g.y) / px)) * 0.14);

    vec2 d = vWorld - uRose;
    float seg = 3.14159265 / 8.0;
    float spoke = abs(fract(atan(d.y, d.x) / seg - 0.5) - 0.5) * seg * length(d);
    col = mix(col, uRhumb, (1.0 - smoothstep(0.5, 1.3, spoke / px)) * 0.22);
    float ring = abs(length(d) - 150.0);
    col = mix(col, uRhumb, (1.0 - smoothstep(0.5, 1.3, ring / px)) * 0.22);

    vec2 cell = vWorld / vec2(120.0, 60.0);
    cell.x += floor(cell.y) * 0.37;
    float letters = texture2D(tLetters, vec2(cell.x, 1.0 - cell.y)).a;
    letters *= step(0.72, inkHash(floor(cell) + 3.0));
    col = mix(col, uInk, letters * 0.5 * smoothstep(0.2, 0.3, e));

    float waves = 0.0;
    waves += (1.0 - smoothstep(0.6, 1.5, abs(e - 0.05) / fw)) * 0.5;
    waves += (1.0 - smoothstep(0.6, 1.5, abs(e - 0.115) / fw)) * 0.34;
    waves += (1.0 - smoothstep(0.6, 1.5, abs(e - 0.2) / fw)) * 0.2;
    waves *= step(0.3, inkNoise(vWorld * 0.05 + 40.0));
    col = mix(col, uInk, waves);
    // the cut edge shows the thickness of the sheet, then the inked coast
    col = mix(col, vec3(1.0, 0.98, 0.92), (1.0 - smoothstep(0.6, 1.6, e / fw)) * 0.7);
    col = mix(col, uInk, (1.0 - smoothstep(0.9, 2.2, abs(e / fw - 2.6))) * 0.9);
    col *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.2, e));
    col *= mix(vec3(1.0), uPaperNight, uNight);

    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const overlay = (params) =>
  new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, fog: false, ...params });

export const mapMaterials = {
  // The canvas only carries the reveal mask in alpha; everything drawn on the
  // chart lives in the shader so it stays crisp at any zoom.
  shroud: (map, rect) =>
    new THREE.ShaderMaterial({
      vertexShader: SHROUD_VERT,
      fragmentShader: SHROUD_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        map: { value: map },
        tLetters: { value: letteringTexture() },
        uOpacity: { value: 0 },
        uNight: { value: 0 },
        uPaper: { value: new THREE.Color(MAP_LOOK.paper) },
        uPaperNight: { value: new THREE.Color(MAP_LOOK.paperNight) },
        uInk: { value: new THREE.Color(MAP_LOOK.ink) },
        uRhumb: { value: new THREE.Color(MAP_LOOK.rhumb) },
        uRose: { value: new THREE.Vector2(...MAP_LOOK.rose) },
        uRect: { value: rect },
      },
    }),
  sheetDepth: (map, rect) =>
    new THREE.ShaderMaterial({
      vertexShader: SHROUD_VERT,
      fragmentShader: SHEET_DEPTH_FRAG,
      colorWrite: false,
      depthFunc: THREE.AlwaysDepth,
      fog: false,
      uniforms: { map: { value: map }, uRect: { value: rect } },
    }),
  routeLine: () =>
    new THREE.LineDashedMaterial({
      color: MAP_LOOK.markInk, dashSize: 9, gapSize: 6, transparent: true, opacity: 0.9, depthTest: false, fog: false,
    }),
  routeCasing: () => overlay({ color: MAP_LOOK.casing, side: THREE.DoubleSide }),
  routeDash: () => overlay({ color: MAP_LOOK.route, side: THREE.DoubleSide }),
  // waypoint and train-ring geometry carries its own casing / ink / colour bands
  waypoint: () => overlay({ vertexColors: true }),
  trainRing: () => overlay({ vertexColors: true, side: THREE.DoubleSide }),
  beacon: () => new THREE.SpriteMaterial({ map: beaconTexture(), transparent: true, depthTest: false, fog: false }),
};

// ----------------------------------------------------------------- figure

// Painted like the rooms, but with a steadier wash and a little light of its
// own, so the colour blocks never sink into a room's shadow.
const figurePaints = [];
const figurePaint = (color) => {
  const mat = new PaintMaterial({ color, emissive: color, emissiveIntensity: PAINT_LOOK.figureGlow[0] });
  mat.wash = 0.06;
  mat.stroke = 0.05;
  mat.mood = 0.45;
  mat.band = 0;
  mat.rim = true;
  figurePaints.push(mat);
  return mat;
};

// map: the soft disc the cars' own contact shadows use
export const figureShadow = (map) =>
  new THREE.MeshBasicMaterial({
    map, transparent: true, opacity: 0.8, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });

export function createFigureMaterials() {
  return {
    coat: figurePaint(0x566fd2),
    hat: figurePaint(0xd4472f),
    trim: figurePaint(0xf5e8c8),
    scarf: figurePaint(0xf2b736),
    legs: figurePaint(0xeee2c4),
    skin: figurePaint(0xf4c9a2),
    hand: figurePaint(0xe2a67c),
    blush: figurePaint(0xe88f7c),
    hair: figurePaint(0x5b3221),
    boot: figurePaint(0x4a3024),
    eye: std({ color: 0x2a1c14, roughness: 0.3 }),
    leather: figurePaint(0xa5682f),
    brass: figurePaint(0xd9a441),
    iron: figurePaint(0x3a3f44),
    copper: figurePaint(0xc47a45),
    cover: figurePaint(0x8a3c44),
    pages: figurePaint(0xf6edd6),
    water: new THREE.MeshBasicMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.75 }),
  };
}
