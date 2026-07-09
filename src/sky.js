import * as THREE from 'three';
import { WORLD, BIOME_FADE, clamp, lerp, smootherstep, damp } from './constants.js';
import { softDiscTexture } from './world.js';

// One full day every two minutes. The whole pass is a keyframed colour
// timeline sampled by phase — twilight gets its own palette instead of a
// blue→black lerp, which is what makes dusk and daybreak feel painted.
export const DAY_LENGTH = 120;

// Sun crosses the horizon at these phases; the moon owns the gap between.
const SUNSET = 0.47;
const SUNRISE = 0.885;
const DAY_SPAN = SUNSET - SUNRISE + 1;

function key(t, sky, fog, hemiSky, hemiGround, hemiI, dirCol, dirI, cloud, cloudOp, stars, exp) {
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
const KEYS = [
  key(0.000, ['#1d5cb8', '#3f88d6', '#93c4ec', '#dcebd8'], '#d4e4d4', '#eaf4ff', '#8e9a70', 1.0, '#fff1d6', 2.25, '#ffffff', 1.0, 0.0, 1.06),
  key(0.360, ['#33639e', '#7da2c4', '#e3c79a', '#f4c27e'], '#ecca96', '#ffe2b8', '#7c7e58', 0.95, '#ffd9a0', 2.05, '#ffe7c4', 1.0, 0.0, 1.07),
  key(0.440, ['#2c4a82', '#6a6fa0', '#e08f6e', '#ff9e54'], '#e89a66', '#ffb98a', '#5e5448', 0.78, '#ff9e58', 1.5, '#ffb287', 0.95, 0.05, 1.08),
  key(0.500, ['#16204a', '#2c3164', '#5d4470', '#b06a58'], '#6e4e58', '#6a6a96', '#343246', 0.5, '#7a86c0', 0.7, '#3c3a58', 0.4, 0.55, 1.02),
  key(0.565, ['#060b1c', '#0b1530', '#122044', '#1b2c52'], '#1b2c52', '#2c3c64', '#131826', 0.4, '#a8c4ee', 0.55, '#141d36', 0.15, 1.0, 0.98),
  key(0.800, ['#060b1c', '#0b1530', '#122044', '#1b2c52'], '#1b2c52', '#2c3c64', '#131826', 0.4, '#a8c4ee', 0.55, '#141d36', 0.15, 1.0, 0.98),
  key(0.860, ['#0a1230', '#1a2348', '#3a3060', '#7e4e62'], '#5e4458', '#4a4a78', '#1e2236', 0.45, '#8a90c8', 0.6, '#46395a', 0.3, 0.7, 1.0),
  key(0.905, ['#1e3c74', '#4a5e9e', '#e8889a', '#ffc274'], '#f0a878', '#ffc8a0', '#5a5450', 0.8, '#ffb070', 1.7, '#ffb8a0', 0.9, 0.08, 1.2),
  key(0.950, ['#2a62b2', '#5e96cc', '#bcd8d4', '#f0d8ac'], '#e4d8b4', '#f4ecd8', '#86926a', 0.95, '#ffe9c0', 2.1, '#fff0dc', 1.0, 0.0, 1.1),
  key(1.000, ['#1d5cb8', '#3f88d6', '#93c4ec', '#dcebd8'], '#d4e4d4', '#eaf4ff', '#8e9a70', 1.0, '#fff1d6', 2.25, '#ffffff', 1.0, 0.0, 1.06),
];

// Grassland palette: same t keyframes as KEYS, dialled cool and watery for a
// "fresh, misty wetland morning" mood. Blue-green fog, a gentler/cooler sun,
// cooler hemisphere and dome gradients. Same day→dusk→night→dawn structure.
// #sample blends this against KEYS positionally as the train crosses into
// the grassland — see biomeBlend.
const KEYS_GRASSLAND = [
  key(0.000, ['#1c64a8', '#4a98c4', '#a6dcd4', '#d4eede'], '#bfe3da', '#dcf2f0', '#6f8a78', 0.95, '#eaf6e6', 2.0, '#f2fbf4', 1.0, 0.0, 1.05),
  key(0.360, ['#2c6e9e', '#74b0c0', '#bfe0c4', '#d6ecc4'], '#cfe6cc', '#dcf2e0', '#62805e', 0.9, '#dceed0', 1.85, '#e6f4e4', 1.0, 0.0, 1.06),
  key(0.440, ['#285a86', '#5c84a4', '#9cc8b0', '#c6dcaa'], '#c2dcb2', '#cfe6c0', '#506650', 0.74, '#cfe2c0', 1.35, '#c6e0c2', 0.95, 0.05, 1.07),
  key(0.500, ['#142242', '#283460', '#46506e', '#86808e'], '#5a6e6e', '#566f86', '#2c3640', 0.48, '#86a0bc', 0.62, '#363e54', 0.4, 0.55, 1.02),
  key(0.565, ['#050c1a', '#0a162c', '#10243e', '#173050'], '#173050', '#26404e', '#101c22', 0.4, '#9cc0e6', 0.5, '#121f30', 0.15, 1.0, 0.98),
  key(0.800, ['#050c1a', '#0a162c', '#10243e', '#173050'], '#173050', '#26404e', '#101c22', 0.4, '#9cc0e6', 0.5, '#121f30', 0.15, 1.0, 0.98),
  key(0.860, ['#091230', '#16284a', '#2a3a5a', '#4a566a'], '#3a4e58', '#3c4e60', '#1a2230', 0.45, '#90b0d4', 0.55, '#3a4858', 0.3, 0.7, 1.0),
  key(0.905, ['#1c4470', '#4870a0', '#9cc4c4', '#d2dcb0'], '#c0dcc8', '#cfe6cc', '#56685a', 0.78, '#d0e6cc', 1.5, '#c4dcc8', 0.9, 0.08, 1.16),
  key(0.950, ['#2670b2', '#5ea6cc', '#aeded4', '#d4eecc'], '#cfe6d4', '#dcf2e2', '#74906e', 0.92, '#e2f2d8', 1.9, '#eef8e8', 1.0, 0.0, 1.08),
  key(1.000, ['#1c64a8', '#4a98c4', '#a6dcd4', '#d4eede'], '#bfe3da', '#dcf2f0', '#6f8a78', 0.95, '#eaf6e6', 2.0, '#f2fbf4', 1.0, 0.0, 1.05),
];

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpark;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPR;
  varying float vA;
  varying vec3 vC;
  varying float vSpark;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.55 + 0.45 * sin(uTime * (1.2 + fract(aPhase * 0.731) * 2.8) + aPhase);
    // stars dissolve toward the horizon line of the dome
    vA = uAlpha * mix(0.35, 1.0, tw) * smoothstep(40.0, 420.0, position.y);
    vC = aColor;
    vSpark = aSpark;
    gl_PointSize = aSize * uPR * mix(0.8, 1.25, tw);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vC;
  varying float vSpark;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float core = smoothstep(1.0, 0.1, d);
    float flare = 0.0;
    if (vSpark > 0.5) {
      flare = max(
        (1.0 - smoothstep(0.0, 0.16, abs(p.y))) * (1.0 - abs(p.x)),
        (1.0 - smoothstep(0.0, 0.16, abs(p.x))) * (1.0 - abs(p.y))
      );
    }
    float a = vA * max(core, flare * 0.85);
    if (a < 0.012) discard;
    gl_FragColor = vec4(vC, a);
  }
`;

const FIREFLY_VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPR;
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.31 + aPhase * 13.0) * 7.0;
    p.z += cos(uTime * 0.27 + aPhase * 17.0) * 7.0;
    p.y += sin(uTime * 0.50 + aPhase * 29.0) * 1.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float fl = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(uTime * 1.8 + aPhase * 40.0));
    vA = uAlpha * fl;
    gl_PointSize = clamp(190.0 / -mv.z, 1.5, 16.0) * uPR;
    gl_Position = projectionMatrix * mv;
  }
`;

const FIREFLY_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float a = vA * smoothstep(1.0, 0.0, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(1.0, 0.85, 0.45, a);
  }
`;

function meteorTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0.0, 'rgba(180,200,255,0)');
  g.addColorStop(0.75, 'rgba(220,230,255,0.55)');
  g.addColorStop(0.95, 'rgba(255,255,255,1)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

export class SkyCycle {
  constructor(scene, renderer, sunLight) {
    this.renderer = renderer;
    this.sunLight = sunLight;
    this.timeOffset = 0; // debug: jump the clock (window.__game.sky.timeOffset)
    this.nightness = 0;
    this.biomeBlend = 0; // 0 = prairie palette (KEYS), 1 = grassland (KEYS_GRASSLAND); driven by train x in update()
    this._kA = {}; // scratch: KEYS sampled at the current day-phase
    this._kB = {}; // scratch: KEYS_GRASSLAND sampled at the current day-phase

    // deterministic, separate stream from the world's
    let s = 977331;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.rand = rand;

    // everything that lives "at infinity" rides along with the camera
    this.rig = new THREE.Group();
    scene.add(this.rig);

    // --- dome: a 4×256 gradient redrawn every frame from the timeline ----
    this.domeCanvas = document.createElement('canvas');
    this.domeCanvas.width = 4;
    this.domeCanvas.height = 256;
    this.domeCtx = this.domeCanvas.getContext('2d');
    this.domeTex = new THREE.CanvasTexture(this.domeCanvas);
    this.domeTex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(4200, 24, 16),
      new THREE.MeshBasicMaterial({ map: this.domeTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    dome.renderOrder = -10;
    this.rig.add(dome);

    // --- sun + moon -------------------------------------------------------
    const sprite = (inner, outer, scale) => {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: softDiscTexture(inner, outer),
          transparent: true,
          depthWrite: false,
          fog: false,
        })
      );
      sp.scale.setScalar(scale);
      this.rig.add(sp);
      return sp;
    };
    this.sunCore = sprite('rgba(255,244,214,1)', 'rgba(255,214,150,0)', 620);
    this.sunHalo = sprite('rgba(255,206,140,0.8)', 'rgba(255,190,120,0)', 1100);
    this.moonCore = sprite('rgba(236,242,255,1)', 'rgba(214,226,255,0)', 230);
    this.moonGlow = sprite('rgba(190,210,255,0.5)', 'rgba(170,195,255,0)', 560);

    // --- stars + milky way --------------------------------------------------
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uPR: { value: 1 } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.rig.add(this.#makeStars(1400, false));
    this.rig.add(this.#makeStars(900, true));

    // --- shooting stars ------------------------------------------------------
    this.meteorTimer = 5;
    this.meteors = [];
    const mTex = meteorTexture();
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: mTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: false,
          blending: THREE.AdditiveBlending,
        })
      );
      sp.scale.set(320, 9, 1);
      sp.visible = false;
      this.rig.add(sp);
      this.meteors.push({ sprite: sp, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, ttl: 1 });
    }

    // --- fireflies: a loose swarm that lags dreamily behind the train --------
    this.fireflies = new THREE.Group();
    scene.add(this.fireflies);
    this.fireflyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uPR: { value: 1 } },
      vertexShader: FIREFLY_VERT,
      fragmentShader: FIREFLY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    {
      const n = 70;
      const pos = new Float32Array(n * 3);
      const ph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (rand() - 0.5) * 140;
        pos[i * 3 + 1] = 0.5 + rand() * 3.6;
        pos[i * 3 + 2] = (rand() - 0.5) * 140;
        ph[i] = rand() * Math.PI * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
      const pts = new THREE.Points(geo, this.fireflyMat);
      pts.frustumCulled = false;
      this.fireflies.add(pts);
    }

    // --- clouds (world-anchored, tinted by the timeline) ----------------------
    const cloudTex = softDiscTexture('rgba(255,250,240,0.85)', 'rgba(255,250,240,0)');
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      const cl = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false })
      );
      cl.scale.set(220 + rand() * 260, 60 + rand() * 60, 1);
      cl.position.set(
        WORLD.minX + rand() * (WORLD.maxX - WORLD.minX),
        170 + rand() * 120,
        WORLD.minZ + rand() * (WORLD.maxZ - WORLD.minZ)
      );
      scene.add(cl);
      this.clouds.push({ sprite: cl, speed: 1.2 + rand() * 1.6, baseOp: 0.5 + rand() * 0.25 });
    }

    // hemisphere light lives here — it IS the sky's contribution to the ground
    this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0x8e9a70, 1.0);
    scene.add(this.hemi);
  }

  #makeStars(count, milkyWay) {
    const rand = this.rand;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const spark = new Float32Array(count);
    const color = new Float32Array(count * 3);

    // milky way: a great-circle band tilted across the dome
    const u = new THREE.Vector3(0.8, 0.55, 0.24).normalize();
    const w = new THREE.Vector3().crossVectors(u, new THREE.Vector3(0, 0, 1)).normalize();
    const n = new THREE.Vector3().crossVectors(u, w);

    let i = 0;
    while (i < count) {
      if (milkyWay) {
        const t = rand() * Math.PI * 2;
        const off = (rand() + rand() + rand() - 1.5) * 0.16;
        _v.copy(u).multiplyScalar(Math.cos(t)).addScaledVector(w, Math.sin(t)).addScaledVector(n, off).normalize();
      } else {
        const y = 0.02 + rand() * 0.98;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - y * y);
        _v.set(r * Math.cos(a), y, r * Math.sin(a));
      }
      if (_v.y < 0.015) continue;
      pos[i * 3] = _v.x * 3950;
      pos[i * 3 + 1] = _v.y * 3950;
      pos[i * 3 + 2] = _v.z * 3950;
      if (milkyWay) {
        size[i] = 0.8 + rand() * 1.4;
        spark[i] = 0;
        _c1.setHSL(0.6 + rand() * 0.06, 0.25, 0.55 + rand() * 0.2).multiplyScalar(0.4);
      } else {
        const hero = rand() > 0.965;
        size[i] = hero ? 5 + rand() * 3 : 1 + rand() * 2.4;
        spark[i] = hero ? 1 : 0;
        const warm = rand();
        if (warm > 0.85) _c1.set('#ffe2b8');
        else if (warm > 0.7) _c1.set('#cfe0ff');
        else _c1.set('#ffffff');
      }
      color[i * 3] = _c1.r;
      color[i * 3 + 1] = _c1.g;
      color[i * 3 + 2] = _c1.b;
      phase[i] = rand() * Math.PI * 2;
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSpark', new THREE.BufferAttribute(spark, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    const pts = new THREE.Points(geo, this.starMat);
    pts.frustumCulled = false;
    return pts;
  }

  // Retarget the per-frame recolouring onto a different directional light. The
  // grassland builds its own sun; when the prairie is disposed the old light is
  // gone, so the sky must point at the replacement.
  setSunLight(light) {
    this.sunLight = light;
  }

  // Lerp every channel between the two bracketing keyframes of one table.
  #lerpKeyframe(keys, i, t, out) {
    const a = keys[i];
    const b = keys[i + 1];
    out.sky = out.sky || [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    for (let j = 0; j < 4; j++) out.sky[j].lerpColors(a.sky[j], b.sky[j], t);
    out.fog = (out.fog || new THREE.Color()).lerpColors(a.fog, b.fog, t);
    out.hemiSky = (out.hemiSky || new THREE.Color()).lerpColors(a.hemiSky, b.hemiSky, t);
    out.hemiGround = (out.hemiGround || new THREE.Color()).lerpColors(a.hemiGround, b.hemiGround, t);
    out.dirCol = (out.dirCol || new THREE.Color()).lerpColors(a.dirCol, b.dirCol, t);
    out.cloud = (out.cloud || new THREE.Color()).lerpColors(a.cloud, b.cloud, t);
    out.hemiI = lerp(a.hemiI, b.hemiI, t);
    out.dirI = lerp(a.dirI, b.dirI, t);
    out.cloudOp = lerp(a.cloudOp, b.cloudOp, t);
    out.stars = lerp(a.stars, b.stars, t);
    out.exp = lerp(a.exp, b.exp, t);
    return out;
  }

  // Sample the day/night timeline, positionally crossfaded between the
  // prairie (KEYS) and grassland (KEYS_GRASSLAND) palettes by biomeBlend.
  // Both tables share identical t keyframes, so the bracketing index and
  // interpolant found once against KEYS apply unchanged to KEYS_GRASSLAND.
  #sample(phase, out) {
    let i = 0;
    while (KEYS[i + 1].t < phase) i++;
    const t = (phase - KEYS[i].t) / (KEYS[i + 1].t - KEYS[i].t);

    const blend = this.biomeBlend;
    // fast path at the biome extremes: skip sampling the other table entirely
    if (blend <= 0) return this.#lerpKeyframe(KEYS, i, t, out);
    if (blend >= 1) return this.#lerpKeyframe(KEYS_GRASSLAND, i, t, out);

    const a = this.#lerpKeyframe(KEYS, i, t, this._kA);
    const b = this.#lerpKeyframe(KEYS_GRASSLAND, i, t, this._kB);
    out.sky = out.sky || [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    for (let j = 0; j < 4; j++) out.sky[j].copy(a.sky[j]).lerp(b.sky[j], blend);
    out.fog = (out.fog || new THREE.Color()).copy(a.fog).lerp(b.fog, blend);
    out.hemiSky = (out.hemiSky || new THREE.Color()).copy(a.hemiSky).lerp(b.hemiSky, blend);
    out.hemiGround = (out.hemiGround || new THREE.Color()).copy(a.hemiGround).lerp(b.hemiGround, blend);
    out.dirCol = (out.dirCol || new THREE.Color()).copy(a.dirCol).lerp(b.dirCol, blend);
    out.cloud = (out.cloud || new THREE.Color()).copy(a.cloud).lerp(b.cloud, blend);
    out.hemiI = lerp(a.hemiI, b.hemiI, blend);
    out.dirI = lerp(a.dirI, b.dirI, blend);
    out.cloudOp = lerp(a.cloudOp, b.cloudOp, blend);
    out.stars = lerp(a.stars, b.stars, blend);
    out.exp = lerp(a.exp, b.exp, blend);
    return out;
  }

  update(dt, elapsed, camera, trainPos, sceneFog) {
    const time = elapsed + this.timeOffset;
    const phase = ((time / DAY_LENGTH) % 1 + 1) % 1;
    // positional crossfade: prairie below startX, grassland above endX
    this.biomeBlend = smootherstep((trainPos.x - BIOME_FADE.startX) / (BIOME_FADE.endX - BIOME_FADE.startX));
    const k = this.#sample(phase, (this._k = this._k || {}));
    this.nightness = k.stars;

    // dome gradient — canvas y maps to the sphere's full V range, so the
    // equator (true horizon) sits at stop 0.5; everything past it is
    // underground. Keep the whole painted gradient inside [0, 0.52] so the
    // horizon band actually shows above the terrain line.
    const ctx = this.domeCtx;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    // stop ↔ elevation: (90° − e) / 180 — upper at ~30°, lower at ~10°
    g.addColorStop(0.0, '#' + k.sky[0].getHexString());
    g.addColorStop(0.33, '#' + k.sky[1].getHexString());
    g.addColorStop(0.47, '#' + k.sky[2].getHexString());
    g.addColorStop(0.52, '#' + k.sky[3].getHexString());
    g.addColorStop(1.0, '#' + k.sky[3].getHexString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    this.domeTex.needsUpdate = true;

    // atmosphere + lights
    sceneFog.color.copy(k.fog);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI;
    this.sunLight.color.copy(k.dirCol);
    this.sunLight.intensity = k.dirI;
    this.renderer.toneMappingExposure = k.exp;

    // --- sun: rises ahead of the train (+X, toward the destination) -------
    const su = (((phase - SUNRISE) % 1) + 1) % 1 / DAY_SPAN;
    const sa = su * Math.PI;
    const alt = Math.sin(sa);
    _v.set(Math.cos(sa), alt * 0.78 + 0.02, -0.34).normalize().multiplyScalar(3850);
    this.sunCore.position.copy(_v);
    this.sunHalo.position.copy(_v);
    const sunVis = su <= 1.04 ? clamp((alt + 0.06) / 0.12, 0, 1) : 0;
    const lowness = 1 - clamp(alt / 0.35, 0, 1); // 1 when kissing the horizon
    this.sunCore.material.opacity = sunVis;
    this.sunHalo.material.opacity = sunVis * (0.45 + 0.4 * lowness);
    this.sunCore.scale.setScalar(620 + lowness * 330);
    this.sunHalo.scale.setScalar(900 + lowness * 950);
    _c1.set('#fff7e6');
    _c2.set('#ff9c4a');
    this.sunCore.material.color.lerpColors(_c1, _c2, lowness * 0.85);
    this.sunHalo.material.color.lerpColors(_c1, _c2, lowness);

    // --- moon: owns the night arc, opposite side of the dome ---------------
    const mu = (((phase - SUNSET - 0.005) % 1) + 1) % 1 / (1 - DAY_SPAN);
    const ma = mu * Math.PI;
    const malt = Math.sin(ma);
    _v.set(Math.cos(ma), malt * 0.7 + 0.02, 0.42).normalize().multiplyScalar(3850);
    this.moonCore.position.copy(_v);
    this.moonGlow.position.copy(_v);
    const moonVis = mu <= 1.02 ? clamp((malt + 0.04) / 0.1, 0, 1) * clamp(k.stars * 1.6, 0, 1) : 0;
    this.moonCore.material.opacity = moonVis * 0.95;
    this.moonGlow.material.opacity = moonVis * 0.4;

    // stars + fireflies
    this.starMat.uniforms.uTime.value = time;
    this.starMat.uniforms.uAlpha.value = k.stars;
    this.starMat.uniforms.uPR.value = this.renderer.getPixelRatio();
    this.fireflyMat.uniforms.uTime.value = time;
    this.fireflyMat.uniforms.uAlpha.value = k.stars * 0.9;
    this.fireflyMat.uniforms.uPR.value = this.renderer.getPixelRatio();
    this.fireflies.position.x = damp(this.fireflies.position.x, trainPos.x, 0.5, dt);
    this.fireflies.position.z = damp(this.fireflies.position.z, trainPos.z, 0.5, dt);

    // --- shooting stars ------------------------------------------------------
    if (k.stars > 0.65) {
      this.meteorTimer -= dt;
      if (this.meteorTimer <= 0) {
        this.meteorTimer = 4 + this.rand() * 8;
        const m = this.meteors.find((m) => m.life <= 0);
        if (m) {
          const a = this.rand() * Math.PI * 2;
          const y = 0.45 + this.rand() * 0.35;
          const r = Math.sqrt(1 - y * y);
          m.pos.set(r * Math.cos(a), y, r * Math.sin(a)).multiplyScalar(3700);
          // a tangent that slides down and across the dome
          m.vel.set(-Math.sin(a), -(0.35 + this.rand() * 0.4), Math.cos(a)).normalize().multiplyScalar(1400);
          m.ttl = m.life = 0.8 + this.rand() * 0.5;
          m.sprite.visible = true;
        }
      }
    }
    for (const m of this.meteors) {
      if (m.life <= 0) {
        m.sprite.visible = false;
        continue;
      }
      m.life -= dt;
      m.pos.addScaledVector(m.vel, dt);
      m.sprite.position.copy(m.pos);
      m.sprite.material.opacity = Math.sin(clamp(m.life / m.ttl, 0, 1) * Math.PI) * k.stars;
      // orient the streak along its screen-space direction of travel
      _a.copy(m.pos).add(this.rig.position).project(camera);
      _b.copy(m.pos).addScaledVector(m.vel, 1).add(this.rig.position).project(camera);
      m.sprite.material.rotation = Math.atan2(_b.y - _a.y, (_b.x - _a.x) * camera.aspect);
    }

    // clouds: drift + take the timeline's tint
    for (const c of this.clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > WORLD.maxX + 500) c.sprite.position.x = WORLD.minX - 500;
      c.sprite.material.color.copy(k.cloud);
      c.sprite.material.opacity = c.baseOp * k.cloudOp;
    }

    // the dome (and sun, moon, stars) follows the camera so it never ends
    this.rig.position.set(camera.position.x, 0, camera.position.z);
  }
}
