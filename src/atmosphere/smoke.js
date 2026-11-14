import * as THREE from 'three';
import { TUNING, lerp, clamp } from '../constants.js';
import { CHART, SMOKE_LOOK } from '../look.js';
import { lcg } from '../prng.js';
import { ATMOS } from './shared.js';

const POOL = 160;
const SMOKE = 0;
const STEAM = 1;
const DUST = 2;
const WIND = [-0.45, 0, -0.35];

const VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aMisc;
  uniform vec3 uKeyDir;
  varying vec2 vP;
  varying vec4 vMisc;
  varying vec3 vKey;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = viewMatrix * vec4(aPos, 1.0);
    mvPosition.xy += position.xy * aMisc.x;
    vP = position.xy;
    vMisc = aMisc;
    vKey = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// aMisc: half-size, opacity, seed, kind + age (kind in the integer part)
const FRAG = /* glsl */ `
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uGround;
  uniform vec3 uSoot;
  uniform vec3 uAsh;
  uniform vec3 uSteam;
  uniform float uFade;
  varying vec2 vP;
  varying vec4 vMisc;
  varying vec3 vKey;
  #include <fog_pars_fragment>

  float pHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float pNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    float kind = floor(vMisc.w);
    float age = fract(vMisc.w);
    float seed = vMisc.z;
    float ca = cos(seed * 6.283);
    float sa = sin(seed * 6.283);
    vec2 q = vec2(vP.x * ca - vP.y * sa, vP.x * sa + vP.y * ca);
    float wob = pNoise(q * 3.1 + seed * 37.0 + age * 0.6) * 0.55 + pNoise(q * 6.7 + seed * 11.0) * 0.45;
    float r = length(vP) + (wob - 0.5) * 0.42;
    float a = (1.0 - smoothstep(0.52, 0.9, r)) * vMisc.y * uFade;
    if (a < 0.004) discard;
    float z = sqrt(max(0.0, 1.0 - min(1.0, dot(vP, vP))));
    vec3 n = normalize(vec3(vP + (wob - 0.5) * 0.7, z + 0.3));
    float l = dot(n, vKey) * 0.5 + 0.5;
    float tone = 0.45 * smoothstep(0.36, 0.44, l) + 0.55 * smoothstep(0.58, 0.68, l);
    vec3 albedo = mix(uSoot, uAsh, smoothstep(0.0, 0.45, age));
    if (kind > 1.5) albedo = uGround;
    else if (kind > 0.5) albedo = uSteam;
    gl_FragColor = vec4(albedo * mix(uShade, uLit * 1.15, tone), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const _v = new THREE.Vector3();
const _luma = new THREE.Color();

// The owner (the train) holds the returned fields and passes itself back to
// updateSmoke. `smoke` keeps its shape so the owner can dispose the mesh.
export function createSmoke(scene) {
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3);
  const misc = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);
  pos.setUsage(THREE.DynamicDrawUsage);
  misc.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', pos);
  geo.setAttribute('aMisc', misc);
  geo.instanceCount = POOL;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uKeyDir: { value: ATMOS.keyDir },
      uLit: { value: new THREE.Color() },
      uShade: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSoot: { value: new THREE.Color(SMOKE_LOOK.soot) },
      uAsh: { value: new THREE.Color(SMOKE_LOOK.ash) },
      uSteam: { value: new THREE.Color(SMOKE_LOOK.steam) },
      uFade: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
  const fx = {
    mesh, pos, misc,
    vel: new Float32Array(POOL * 3),
    life: new Float32Array(POOL),
    ttl: new Float32Array(POOL),
    grow: new Float32Array(POOL * 2),
    alpha: new Float32Array(POOL),
    kind: new Uint8Array(POOL),
    cursor: 0,
    rand: lcg(51907),
    stack: 0,
    whistle: 0.4,
    chuff: 0,
    dust: 0,
    side: 1,
  };
  return { smoke: [{ sprite: mesh }], smokeTimer: 0, smokeFx: fx };
}

function spawn(fx, kind, x, y, z, vx, vy, vz, ttl, size0, size1, alpha) {
  let i = fx.cursor;
  for (let n = 0; n < POOL && fx.life[i] > 0; n++) i = (i + 1) % POOL;
  fx.cursor = (i + 1) % POOL;
  fx.kind[i] = kind;
  fx.life[i] = fx.ttl[i] = ttl;
  fx.grow[i * 2] = size0;
  fx.grow[i * 2 + 1] = size1;
  fx.alpha[i] = alpha;
  fx.pos.array[i * 3] = x;
  fx.pos.array[i * 3 + 1] = y;
  fx.pos.array[i * 3 + 2] = z;
  fx.vel[i * 3] = vx;
  fx.vel[i * 3 + 1] = vy;
  fx.vel[i * 3 + 2] = vz;
  fx.misc.array[i * 4 + 2] = fx.rand();
}

export function updateSmoke(state, dt, speed, emitterWorldPos) {
  const fx = state.smokeFx;
  const rand = fx.rand;
  const speed01 = clamp(speed / TUNING.baseSpeed, 0, 1);
  const moving = speed > 0.4;
  const jit = (a) => (rand() - 0.5) * a;

  if (dt > 0) {
    fx.stack -= dt;
    if (fx.stack <= 0) {
      const p = emitterWorldPos();
      if (moving) {
        fx.stack = lerp(0.42, 0.11, speed01);
        spawn(fx, SMOKE, p.x + jit(0.2), p.y, p.z + jit(0.2), jit(0.5), 3.0 + rand() * 1.4, jit(0.5),
          3.0 + rand() * 1.2, 0.62, 3.2 + rand() * 1.4, 0.5);
      } else {
        fx.stack = 0.55 + rand() * 0.3;
        spawn(fx, SMOKE, p.x + jit(0.15), p.y, p.z + jit(0.15), jit(0.2), 1.25 + rand() * 0.5, jit(0.2),
          4.2 + rand() * 1.2, 0.46, 1.9 + rand() * 0.7, 0.36);
      }
    }

    const engine = state.cars[1].group;
    fx.whistle -= dt;
    if (fx.whistle <= 0 && !moving) {
      fx.whistle = 0.5 + rand() * 0.5;
      engine.localToWorld(_v.set(-1.25, 5.74, -1.55));
      spawn(fx, STEAM, _v.x, _v.y, _v.z, jit(0.25), 1.5 + rand() * 0.6, jit(0.25), 1.1 + rand() * 0.5, 0.12, 0.7 + rand() * 0.3, 0.5);
    }

    if (moving) {
      fx.chuff -= dt;
      if (fx.chuff <= 0) {
        fx.chuff = lerp(0.9, 0.3, speed01);
        fx.side = -fx.side;
        for (let n = 0; n < 2; n++) {
          engine.localToWorld(_v.set(5.2 + jit(0.3), 0.55, fx.side * 2.75));
          const out = (0.9 + rand() * 0.9) * fx.side;
          const ry = engine.rotation.y;
          spawn(fx, STEAM, _v.x, _v.y, _v.z, Math.sin(ry) * out + jit(0.4), 0.5 + rand() * 0.7, Math.cos(ry) * out + jit(0.4),
            0.6 + rand() * 0.4, 0.2, 0.8 + rand() * 0.4, 0.34);
        }
      }
      fx.dust -= dt * speed01;
      while (fx.dust <= 0) {
        fx.dust += 0.03;
        const wheel = state.wheels[Math.floor(rand() * state.wheels.length)];
        const e = wheel.matrixWorld.elements;
        spawn(fx, DUST, e[12] + jit(0.7), 0.2, e[14] + jit(0.4), jit(0.5), 0.4 + rand() * 0.6, jit(0.5),
          1.4 + rand() * 1.0, 0.45, 1.8 + rand() * 1.2, 0.4 * speed01);
      }
    }

    const P = fx.pos.array;
    const M = fx.misc.array;
    for (let i = 0; i < POOL; i++) {
      if (fx.life[i] <= 0) continue;
      fx.life[i] -= dt;
      if (fx.life[i] <= 0) {
        M[i * 4] = 0;
        M[i * 4 + 1] = 0;
        continue;
      }
      const t = 1 - fx.life[i] / fx.ttl[i];
      const kind = fx.kind[i];
      const ease = 1 - (1 - t) * (1 - t);
      const drift = kind === DUST ? 0.25 : Math.min(1, t * 2.5);
      const drag = Math.exp(-(kind === SMOKE ? 0.45 : 1.6) * dt);
      fx.vel[i * 3] *= drag;
      fx.vel[i * 3 + 1] *= drag;
      fx.vel[i * 3 + 2] *= drag;
      const sway = Math.sin(M[i * 4 + 2] * 40 + t * 5) * 0.25 * drift;
      P[i * 3] += (fx.vel[i * 3] + WIND[0] * drift + sway) * dt;
      P[i * 3 + 1] += fx.vel[i * 3 + 1] * dt;
      P[i * 3 + 2] += (fx.vel[i * 3 + 2] + WIND[2] * drift - sway * 0.6) * dt;
      M[i * 4] = lerp(fx.grow[i * 2], fx.grow[i * 2 + 1], ease);
      M[i * 4 + 1] = fx.alpha[i] * Math.min(1, t * 12) * Math.pow(1 - t, 1.25);
      M[i * 4 + 3] = kind + Math.min(0.999, t);
    }
    fx.pos.needsUpdate = true;
    fx.misc.needsUpdate = true;
  }

  const u = fx.mesh.material.uniforms;
  const grey = SMOKE_LOOK.neutral;
  u.uLit.value.copy(ATMOS.lit);
  u.uLit.value.lerp(_luma.setScalar(luma(ATMOS.lit)), grey);
  u.uShade.value.copy(ATMOS.shade);
  u.uShade.value.lerp(_luma.setScalar(luma(ATMOS.shade)), grey);
  u.uGround.value.copy(ATMOS.ground).lerp(_luma.setScalar(1), SMOKE_LOOK.dustPale);
  u.uFade.value = 1 - CHART.uChart.value;
}

const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
