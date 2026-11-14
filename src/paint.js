import * as THREE from 'three';
import { lcg } from './prng.js';

// Hand-painted interiors: a matte material shaded in three flat steps, with
// brushed wash variation and a coloured fill in the shadow step. Positions are
// taken in object space so the brushwork rides with the car.

function tileNoise(S, lx, ly, rand) {
  const lattice = new Float32Array(lx * ly);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const out = new Float32Array(S * S);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * ly;
    const y0 = Math.floor(fy);
    const ty = sm(fy - y0);
    const ya = (y0 % ly) * lx;
    const yb = ((y0 + 1) % ly) * lx;
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * lx;
      const x0 = Math.floor(fx);
      const tx = sm(fx - x0);
      const xa = x0 % lx;
      const xb = (x0 + 1) % lx;
      const a = lattice[ya + xa] + (lattice[ya + xb] - lattice[ya + xa]) * tx;
      const b = lattice[yb + xa] + (lattice[yb + xb] - lattice[yb + xa]) * tx;
      out[y * S + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function mixNoise(S, rand, octaves) {
  const out = new Float32Array(S * S);
  for (const [lx, ly, w] of octaves) {
    const n = tileNoise(S, lx, ly, rand);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * w;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    if (out[i] < lo) lo = out[i];
    if (out[i] > hi) hi = out[i];
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

// R long brush strokes, G broad wash, B a second wash field.
function brushTexture() {
  const S = 128;
  const rand = lcg(60606);
  const stroke = mixNoise(S, rand, [[5, 48, 0.5], [9, 96, 0.35], [3, 24, 0.15]]);
  const washA = mixNoise(S, rand, [[4, 4, 0.5], [8, 8, 0.3], [16, 16, 0.2]]);
  const washB = mixNoise(S, rand, [[3, 3, 0.45], [7, 7, 0.3], [14, 14, 0.25]]);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = stroke[i] * 255;
    data[i * 4 + 1] = washA[i] * 255;
    data[i * 4 + 2] = washB[i] * 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Shadow, half-tone and light as three flat planes with soft seams.
function rampTexture() {
  const N = 64;
  const data = new Uint8Array(N * 4);
  const ss = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < N; i++) {
    const d = (i / (N - 1)) * 2 - 1;
    const v = 0.6 * ss(-0.04, 0.08, d) + 0.4 * ss(0.42, 0.54, d);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

let brush = null;
let ramp = null;

// uPaintFill: colour added to whatever the lamps and sun leave dim.
// uPaintLift: x fill threshold, y saturation, z ambient taken, w bleach of lit colour toward uPaintWarm
export const PAINT = {
  uPaintBrush: { value: null },
  uPaintFill: { value: new THREE.Color(0.2, 0.2, 0.32) },
  uPaintWarm: { value: new THREE.Color(1.0, 0.8, 0.56) },
  uPaintLift: { value: new THREE.Vector4(0.9, 1.12, 1, 0) },
};

const VERT_HEAD = /* glsl */ `
varying vec3 vPaintPos;
`;

const VERT_POS = /* glsl */ `
{
  vec4 pp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    pp = instanceMatrix * pp;
  #endif
  vPaintPos = pp.xyz;
}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vPaintPos;
uniform sampler2D uPaintBrush;
uniform vec3 uPaintFill;
uniform vec4 uPaintLift;
uniform vec3 uPaintWarm;
uniform vec2 uPaintWash;
`;

const FRAG_ALBEDO = /* glsl */ `
{
  vec2 puv = vPaintPos.xy * vec2(1.0, 0.6) + vPaintPos.z * vec2(0.37, 0.71);
  vec4 pFine = texture2D(uPaintBrush, puv * 0.9);
  vec4 pBroad = texture2D(uPaintBrush, puv * 0.17 + 0.37);
  diffuseColor.rgb *= 1.0 + (pBroad.g - 0.5) * uPaintWash.x + (pFine.r - 0.5) * uPaintWash.y;
  diffuseColor.rgb *= mix(vec3(0.97, 1.0, 1.04), vec3(1.04, 1.0, 0.95), pBroad.b);
}
`;

const FRAG_OUT = /* glsl */ `
vec3 pDirect = reflectedLight.directDiffuse;
pDirect = mix(pDirect, dot(pDirect, vec3(0.3, 0.59, 0.11)) * uPaintWarm, uPaintLift.w);
vec3 pLit = pDirect + reflectedLight.indirectDiffuse * uPaintLift.z;
{
  float pLevel = dot(pLit / max(diffuseColor.rgb, vec3(0.04)), vec3(0.3, 0.59, 0.11));
  float pDim = 1.0 - smoothstep(uPaintLift.x * 0.25, uPaintLift.x, pLevel);
  pLit += diffuseColor.rgb * uPaintFill * (0.35 + 0.65 * pDim);
  float pGrey = dot(pLit, vec3(0.3, 0.59, 0.11));
  pLit = max(vec3(0.0), mix(vec3(pGrey), pLit, uPaintLift.y));
}
vec3 outgoingLight = pLit + totalEmissiveRadiance;
`;

export class PaintMaterial extends THREE.MeshToonMaterial {
  constructor(params) {
    super();
    this.isPaintMaterial = true;
    this.wash = 0.16;
    this.stroke = 0.1;
    if (!ramp) ramp = rampTexture();
    this.gradientMap = ramp;
    this.paintWash = new THREE.Vector2();
    if (params) this.setValues(params);
  }

  copy(source) {
    super.copy(source);
    this.wash = source.wash;
    this.stroke = source.stroke;
    return this;
  }

  customProgramCacheKey() {
    return 'paint';
  }

  onBeforeCompile(shader) {
    if (!brush) brush = brushTexture();
    PAINT.uPaintBrush.value = brush;
    Object.assign(shader.uniforms, PAINT);
    shader.uniforms.uPaintWash = { value: this.paintWash.set(this.wash, this.stroke) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + VERT_HEAD)
      .replace('#include <project_vertex>', VERT_POS + '#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>' + FRAG_ALBEDO)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        FRAG_OUT
      );
  }
}
