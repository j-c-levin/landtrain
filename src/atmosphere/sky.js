import * as THREE from 'three';
import { WORLD, BIOME_FADE, clamp, lerp, smootherstep, damp } from '../constants.js';
import {
  SKY_KEYS_PRAIRIE as KEYS, SKY_KEYS_GRASSLAND as KEYS_GRASSLAND, SKY_LOOK, skyMaterials, cloudTexture, jitterHSL,
  CHART,
} from '../look.js';
import { lcg } from '../prng.js';
import { STAR_VERT, STAR_FRAG, FIREFLY_VERT, FIREFLY_FRAG } from './sky-shaders.js';

// One full day every two minutes. The whole pass is a keyframed colour
// timeline sampled by phase — twilight gets its own palette instead of a
// blue→black lerp, which is what makes dusk and daybreak feel painted.
export const DAY_LENGTH = 120;

// Sun crosses the horizon at these phases; the moon owns the gap between.
const SUNSET = 0.47;
const SUNRISE = 0.885;
const DAY_SPAN = SUNSET - SUNRISE + 1;

function meteorTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  for (const [stop, color] of SKY_LOOK.meteor) g.addColorStop(stop, color);
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
    this.scene = scene;
    this.sunLight = sunLight;
    // unit vector toward the key light (sun by day, moon by night)
    this.keyDir = new THREE.Vector3(-0.42, 0.72, 0.55).normalize();
    this.timeOffset = 0; // debug: jump the clock (window.__game.sky.timeOffset)
    this.nightness = 0;
    // 1 while a low sun stands behind the train, raking long shadows at the lens
    this.duskness = 0;
    this.bounceIntensity = 0;
    this.biomeBlend = 0; // 0 = prairie palette (KEYS), 1 = grassland (KEYS_GRASSLAND); driven by train x in update()
    this._kA = {}; // scratch: KEYS sampled at the current day-phase
    this._kB = {}; // scratch: KEYS_GRASSLAND sampled at the current day-phase

    // deterministic, separate stream from the world's
    const rand = lcg(977331);
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
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 16), skyMaterials.dome(this.domeTex));
    dome.renderOrder = -10;
    this.rig.add(dome);

    // --- sun + moon -------------------------------------------------------
    const sprite = (gradient, scale) => {
      const sp = new THREE.Sprite(skyMaterials.disc(gradient));
      sp.scale.setScalar(scale);
      this.rig.add(sp);
      return sp;
    };
    this.sunCore = sprite(SKY_LOOK.sunCore, 620);
    this.sunHalo = sprite(SKY_LOOK.sunHalo, 1100);
    this.moonCore = sprite(SKY_LOOK.moonCore, 230);
    this.moonGlow = sprite(SKY_LOOK.moonGlow, 560);

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
      const sp = new THREE.Sprite(skyMaterials.meteor(mTex));
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
    const cloudTexes = [0, 1, 2].map(() => cloudTexture(rand, SKY_LOOK.cloud));
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      const cl = new THREE.Sprite(skyMaterials.cloud(cloudTexes[i % 3]));
      const w = 170 + rand() * 230;
      cl.scale.set(w, w * (0.42 + rand() * 0.12), 1);
      cl.position.set(
        WORLD.minX + rand() * (WORLD.maxX - WORLD.minX),
        190 + rand() * 130,
        WORLD.minZ - 500 + rand() * (WORLD.maxZ - WORLD.minZ + 1000)
      );
      scene.add(cl);
      this.clouds.push({ sprite: cl, speed: 1.2 + rand() * 1.6, baseOp: 0.5 + rand() * 0.25 });
    }

    // hemisphere light lives here — it IS the sky's contribution to the ground
    this.hemi = new THREE.HemisphereLight(SKY_LOOK.hemiSky, SKY_LOOK.hemiGround, SKY_LOOK.hemiIntensity);
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
        jitterHSL(_c1, rand, SKY_LOOK.milkyWay).multiplyScalar(SKY_LOOK.milkyWayDim);
      } else {
        const hero = rand() > 0.965;
        size[i] = hero ? 5 + rand() * 3 : 1 + rand() * 2.4;
        spark[i] = hero ? 1 : 0;
        const warm = rand();
        if (warm > 0.85) _c1.set(SKY_LOOK.starWarm);
        else if (warm > 0.7) _c1.set(SKY_LOOK.starCool);
        else _c1.set(SKY_LOOK.starWhite);
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
    out.env = lerp(a.env, b.env, t);
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
    out.env = lerp(a.env, b.env, blend);
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
    this.renderer.toneMappingExposure = k.exp;
    this.scene.environmentIntensity = k.env;

    // --- sun: rises ahead of the train (+X, toward the destination) -------
    const su = (((phase - SUNRISE) % 1) + 1) % 1 / DAY_SPAN;
    const sa = su * Math.PI;
    const alt = Math.sin(sa);
    const lowness = 1 - clamp(alt / 0.35, 0, 1); // 1 when kissing the horizon
    // high sun stands in front of the cutaway; it swings behind the train as it sets
    const sunZ = lerp(0.5, -0.62, smootherstep((lowness - 0.2) / 0.3));
    _v.set(Math.cos(sa), alt * 0.78 + 0.02, sunZ).normalize();
    const sunUp = su <= 1;
    if (sunUp) this.keyDir.set(_v.x, Math.max(_v.y, 0.3), _v.z).normalize();
    this.duskness = (sunUp ? smootherstep((lowness - 0.2) / 0.3) : 1) * (1 - smootherstep(k.stars / 0.6));
    this.bounceIntensity = lerp(SKY_LOOK.bounceI[0], SKY_LOOK.bounceI[1], this.duskness) * (1 - k.stars);
    _v.multiplyScalar(3850);
    this.sunCore.position.copy(_v);
    this.sunHalo.position.copy(_v);
    const sunVis = su <= 1.04 ? clamp((alt + 0.06) / 0.12, 0, 1) : 0;
    this.sunCore.material.opacity = sunVis;
    this.sunHalo.material.opacity = sunVis * (0.45 + 0.4 * lowness);
    this.sunCore.scale.setScalar(620 + lowness * 330);
    this.sunHalo.scale.setScalar(900 + lowness * 950);
    _c1.set(SKY_LOOK.sunHigh);
    _c2.set(SKY_LOOK.sunLow);
    this.sunCore.material.color.lerpColors(_c1, _c2, lowness * 0.85);
    this.sunHalo.material.color.lerpColors(_c1, _c2, lowness);

    // --- moon: owns the night arc, opposite side of the dome ---------------
    const mu = (((phase - SUNSET - 0.005) % 1) + 1) % 1 / (1 - DAY_SPAN);
    const ma = mu * Math.PI;
    const malt = Math.sin(ma);
    _v.set(Math.cos(ma), malt * 0.7 + 0.02, 0.42).normalize();
    if (!sunUp) this.keyDir.set(_v.x, Math.max(_v.y, 0.3), _v.z).normalize();
    _v.multiplyScalar(3850);
    this.moonCore.position.copy(_v);
    this.moonGlow.position.copy(_v);
    const moonVis = mu <= 1.02 ? clamp((malt + 0.04) / 0.1, 0, 1) * clamp(k.stars * 1.6, 0, 1) : 0;
    this.moonCore.material.opacity = moonVis * 0.95;
    this.moonGlow.material.opacity = moonVis * 0.4;

    // the key dips to nothing as sun hands over to moon, so the swap never pops
    const keyFade = sunUp ? clamp((alt + 0.02) / 0.1, 0, 1) : clamp((malt + 0.02) / 0.1, 0, 1);
    this.sunLight.intensity = k.dirI * keyFade;

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
      c.sprite.material.opacity = c.baseOp * k.cloudOp * (1 - CHART.uChart.value);
    }

    // the dome (and sun, moon, stars) follows the camera so it never ends
    this.rig.position.set(camera.position.x, 0, camera.position.z);
  }
}
