import * as THREE from 'three';
import { CHART, GRASSLAND_LOOK, getLookTier } from '../look.js';

export const WATER_TIME = { value: 0 };

let ripple = null;
function rippleTexture() {
  if (ripple) return ripple;
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const TAU = Math.PI * 2;
  const waves = [
    [1, 2, 1.0, 0.0], [2, -1, 0.7, 1.7], [3, 2, 0.5, 3.1], [-2, 3, 0.4, 0.6], [4, -3, 0.3, 4.4], [-1, 4, 0.25, 2.2],
  ];
  const height = (x, y) => {
    let h = 0;
    for (const [fx, fy, a, p] of waves) h += a * Math.sin((TAU * (fx * x + fy * y)) / S + p);
    return h;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let nx = (height((x - 1 + S) % S, y) - height((x + 1) % S, y)) * 1.1;
      let ny = (height(x, (y - 1 + S) % S) - height(x, (y + 1) % S)) * 1.1;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      const i = (y * S + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = inv * 255;
      data[i + 3] = 255;
    }
  }
  ripple = new THREE.DataTexture(data, S, S);
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  ripple.colorSpace = THREE.NoColorSpace;
  ripple.generateMipmaps = true;
  ripple.minFilter = THREE.LinearMipmapLinearFilter;
  ripple.magFilter = THREE.LinearFilter;
  ripple.needsUpdate = true;
  return ripple;
}

const PARS = /* glsl */ `
  varying vec2 vFlow;
  varying float vShore;
  varying vec3 vWaterWorld;
  uniform float uWaterTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uGlint;
  uniform vec3 uBank;
  uniform vec3 uChartWater;
  uniform vec2 uFlow;
  uniform vec2 uStroke;
  uniform float uChart;
  uniform float uChartNight;
  uniform vec3 uChartIndigo;
  uniform vec3 uChartInk;
  #ifdef WATER_RIPPLE
    uniform sampler2D uRipple;
  #endif
  float wHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float wNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

// Resin-water: depth-painted colour, a lapping foam line where it meets the
// bank, drifting current strokes, and a glossy top that picks up the sky.
const COLOUR = /* glsl */ `
  float wt = uWaterTime;
  vec2 wp = vFlow;
  float wNear = 1.0 - smoothstep(170.0, 460.0, length(vViewPosition));
  float wLap = (wNoise(wp * 0.31 + vec2(0.0, wt * 0.05)) - 0.5) * 1.5
    + sin(wt * 0.7 + wNoise(wp * 0.045) * 9.0) * 0.32;
  float wEdge = vShore + wLap * (0.35 + 0.65 * wNear);
  float wDepth = smoothstep(0.0, 9.5, wEdge);
  vec3 wc = mix(uShallow, diffuseColor.rgb, smoothstep(0.0, 0.42, wDepth));
  wc = mix(wc, uDeep, smoothstep(0.38, 1.0, wDepth));
  wc = mix(wc, uBank, (1.0 - smoothstep(2.0, 7.5, wEdge)) * smoothstep(0.7, 2.0, wEdge) * 0.4);

  vec2 wq = (wp + uFlow * wt) * uStroke;
  float wn = wNoise(wq) * 0.62 + wNoise(wq * 2.3 + 7.1 + uFlow * wt * 0.021) * 0.38;
  float ww = fwidth(wn) * 1.2 + 0.006;
  float wLine = 1.0 - smoothstep(0.012, 0.03 + ww, abs(wn - 0.56));
  wLine *= smoothstep(0.42, 0.6, wNoise(wq * 0.55 + 19.0));
  float wTrough = 1.0 - smoothstep(0.3 - ww, 0.38, wn);
  wc = mix(wc, uGlint, wLine * 0.24 * wNear * smoothstep(0.1, 0.5, wDepth));
  wc *= 1.0 - wTrough * 0.09 * wNear;

  float wFoam = 1.0 - smoothstep(0.62, 0.9, wEdge);
  float wRing = 1.0 - smoothstep(0.1, 0.26, abs(wEdge - 2.1 - sin(wt * 0.55 + wp.y * 0.06 + wp.x * 0.04) * 0.5));
  wRing *= step(0.46, wNoise(wp * 0.42 + 3.0)) * 0.6 * wNear;
  float wF = max(wFoam, wRing) * (1.0 - uChart);
  wc = mix(wc, uFoam, wF);
  float wa = max(mix(0.46, 0.95, smoothstep(0.0, 0.5, wDepth)), wF);
  diffuseColor.rgb = wc;
  diffuseColor.a = mix(wa, 1.0, uChart);
`;

const NORMAL = /* glsl */ `
  vec3 wUp = vec3(0.0, 1.0, 0.0);
  #ifdef WATER_RIPPLE
    vec2 wu = vFlow / 30.0;
    vec3 wn1 = texture2D(uRipple, wu + uFlow * wt * 0.026).xyz * 2.0 - 1.0;
    vec3 wn2 = texture2D(uRipple, wu * 3.4 - uFlow * wt * 0.04 + 0.37).xyz * 2.0 - 1.0;
    vec2 wnn = (wn1.xy * 0.13 + wn2.xy * 0.19) * (1.0 - uChart);
    wUp = normalize(vec3(wnn.x, 1.0, wnn.y));
    normal = normalize((viewMatrix * vec4(wUp, 0.0)).xyz);
  #else
    wUp = normalize(vec3((wn - 0.5) * 0.5, 1.0, (wNoise(wq.yx * 1.7 + 5.0) - 0.5) * 0.5 * (1.0 - uChart)));
  #endif
`;

// The surface mirrors the sky: horizon haze at grazing angles, deeper overhead.
const CHART_OUT = /* glsl */ `
  #ifdef USE_FOG
    vec3 wEye = normalize(cameraPosition - vWaterWorld);
    float wFres = clamp(0.03 + 0.97 * pow(1.0 - max(dot(wEye, wUp), 0.0), 4.0), 0.2, 0.8);
    float wLift = reflect(-wEye, wUp).y;
    vec3 wSky = mix(fogColor, fogColor * vec3(0.56, 0.76, 1.0), smoothstep(0.02, 0.6, wLift));
    wSky = mix(wSky, outgoingLight, 0.22);
    outgoingLight = mix(outgoingLight, wSky, wFres * (1.0 - wF * 0.85));
    diffuseColor.a = max(diffuseColor.a, wFres);
  #endif
  // chart: a muted wash pooling darker at the bank, with dry pen strokes along the current
  float cWash = wNoise(vFlow * 0.028 + 3.0) * 0.6 + wNoise(vFlow * 0.085 + 11.0) * 0.4;
  vec3 wChart = uChartWater * (0.9 + 0.2 * cWash);
  wChart *= 0.84 + 0.16 * smoothstep(0.0, 1.6, vShore);
  wChart = mix(wChart, vec3(1.0), 0.16 * (1.0 - smoothstep(2.0, 9.0, vShore)));
  wChart = mix(wChart, uChartIndigo * (0.55 + 0.9 * dot(wChart, vec3(0.3, 0.59, 0.11))), uChartNight);
  vec2 cCell = vec2(11.0, 34.0);
  vec2 ci = floor(vFlow / cCell);
  float cr = wHash(ci);
  vec2 cp = (fract(vFlow / cCell) - 0.5 - (vec2(wHash(ci + 2.1), wHash(ci + 4.7)) - 0.5) * 0.5) * cCell;
  cp.x += sin(cp.y * 0.7 + cr * 6.3) * 0.55;
  float cw = fwidth(vFlow.x) + fwidth(vFlow.y);
  float cMark = (1.0 - smoothstep(0.17, 0.17 + cw, abs(cp.x))) * (1.0 - smoothstep(3.6 + cr * 3.0, 3.6 + cr * 3.0 + cw, abs(cp.y)));
  cMark *= step(0.5, cr) * smoothstep(1.5, 4.0, vShore);
  wChart = mix(wChart, uChartInk, cMark * 0.4 * (1.0 - 0.6 * uChartNight));
  outgoingLight = mix(outgoingLight, wChart, uChart);
`;

// Geometry must carry aFlow (pattern coordinates, world units) and aShore
// (distance in from the waterline, world units).
export function waterMaterial({ flow = [0, 1.5], stroke = [0.5, 0.05], glint = GRASSLAND_LOOK.waterGlint } = {}) {
  const L = GRASSLAND_LOOK;
  const low = getLookTier() === 'low';
  const mat = new THREE.MeshStandardMaterial({
    color: L.water, roughness: 0.12, metalness: 0, transparent: true, envMapIntensity: 0,
  });
  const uniforms = {
    uWaterTime: WATER_TIME,
    uShallow: { value: new THREE.Color(L.waterShallow) },
    uDeep: { value: new THREE.Color(L.waterDeep) },
    uFoam: { value: new THREE.Color(L.waterFoam) },
    uGlint: { value: new THREE.Color(glint) },
    uBank: { value: new THREE.Color(L.waterBank) },
    uChartWater: { value: new THREE.Color(L.waterChart) },
    uFlow: { value: new THREE.Vector2(...flow) },
    uStroke: { value: new THREE.Vector2(...stroke) },
    uChart: CHART.uChart,
    uChartNight: CHART.uChartNight,
    uChartIndigo: CHART.uChartIndigo,
    uChartInk: CHART.uChartInk,
  };
  mat.defines = {};
  if (!low) {
    mat.defines.WATER_RIPPLE = '';
    uniforms.uRipple = { value: rippleTexture() };
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aFlow;
        attribute float aShore;
        varying vec2 vFlow;
        varying float vShore;
        varying vec3 vWaterWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFlow = aFlow;
        vShore = aShore;
        vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOUR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL}`)
      .replace('#include <opaque_fragment>', `${CHART_OUT}\n#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `water-${low}`;
  return mat;
}

// A rows x cols sheet; place(i, j, out) writes [x, y, z, flowX, flowY, shore].
// Rows must advance along +z (or counter-clockwise) and columns along +x (or
// outward) for the faces to look up.
export function sheetGeometry(rows, cols, place, { closed = false } = {}) {
  const n = rows * cols;
  const pos = new Float32Array(n * 3);
  const flow = new Float32Array(n * 2);
  const shore = new Float32Array(n);
  const out = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      place(i, j, out);
      const v = i * cols + j;
      pos.set([out[0], out[1], out[2]], v * 3);
      flow.set([out[3], out[4]], v * 2);
      shore[v] = out[5];
    }
  }
  const index = [];
  const last = closed ? rows : rows - 1;
  for (let i = 0; i < last; i++) {
    const i1 = (i + 1) % rows;
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = i1 * cols + j, c = a + 1, d = b + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
  geo.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));
  geo.setIndex(index);
  return geo;
}
