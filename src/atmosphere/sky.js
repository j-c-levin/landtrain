import * as THREE from 'three';
import { BIOME_FADE, clamp, lerp, smootherstep, damp } from '../constants.js';
import {
  SKY_KEYS_PRAIRIE as KEYS, SKY_KEYS_GRASSLAND as KEYS_GRASSLAND, SKY_LOOK, skyMaterials, jitterHSL,
  CHART, getLookTier,
} from '../look.js';
import { lcg } from '../prng.js';
import { STAR_VERT, STAR_FRAG, FIREFLY_VERT, FIREFLY_FRAG, DOME_VERT, DOME_FRAG } from './sky-shaders.js';
import { cloudPanorama, mottleTexture } from './clouds.js';
import { ATMOS } from './shared.js';

// One full day every two minutes, as a keyframed colour timeline sampled by phase.
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
const COLOR_FIELDS = ['fog', 'hemiSky', 'hemiGround', 'dirCol', 'cloud', 'glow', 'belt'];
const NUMBER_FIELDS = ['hemiI', 'dirI', 'cloudOp', 'stars', 'exp', 'env', 'glowI', 'beltI'];
const GALAXY_U = new THREE.Vector3(0.8, 0.55, 0.24).normalize();

export class SkyCycle {
  constructor(scene, renderer, sunLight) {
    this.plain = false;
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

    this.cloudTex = cloudPanorama(lcg(40417), getLookTier() === 'low' ? 0.5 : 1);
    const galaxyW = new THREE.Vector3().crossVectors(GALAXY_U, new THREE.Vector3(0, 0, 1)).normalize();
    const color = () => ({ value: new THREE.Color() });
    this.cloudUniforms = { uCloud: { value: this.cloudTex }, uDrift: { value: 0 }, uCloudOp: { value: 1 } };
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.cloudUniforms,
        uZenith: color(), uUpper: color(), uLower: color(), uHorizon: color(), uHaze: color(),
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: color(), uSunVis: { value: 0 }, uSunSize: { value: 0.03 },
        uGlow: color(), uGlowI: { value: 0 }, uBelt: color(), uBeltI: { value: 0 },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonCol: { value: new THREE.Color(SKY_LOOK.moon) },
        uMoonSea: { value: new THREE.Color(SKY_LOOK.moonSea) }, uMoonVis: { value: 0 }, uNight: { value: 0 },
        uGalaxy: { value: new THREE.Vector3().crossVectors(GALAXY_U, galaxyW) },
        uGalaxyCol: { value: new THREE.Color(SKY_LOOK.galaxy) },
        uCloudLit: color(), uCloudShade: color(), uCloudRim: { value: new THREE.Color(SKY_LOOK.cloudNightRim) }, uMottle: { value: (ATMOS.mottle = mottleTexture(lcg(77003))) },
      },
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 20), this.domeMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.rig.add(dome);
    this.sunDir = new THREE.Vector3(0, 1, 0);

    this.starMat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.cloudUniforms, uTime: { value: 0 }, uAlpha: { value: 0 }, uPR: { value: 1 },
        uMoonDir: this.domeMat.uniforms.uMoonDir, uMoonVis: this.domeMat.uniforms.uMoonVis,
      },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = [this.#makeStars(1400, false), this.#makeStars(900, true)];
    this.rig.add(...this.stars);

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

    // fireflies: a loose swarm that lags behind the train
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
    const u = GALAXY_U;
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

  setSunLight(light) {
    this.sunLight = light;
  }

  #lerpKeyframe(keys, i, t, out) {
    const a = keys[i];
    const b = keys[i + 1];
    out.sky = out.sky || [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    for (let j = 0; j < 4; j++) out.sky[j].lerpColors(a.sky[j], b.sky[j], t);
    for (const f of COLOR_FIELDS) out[f] = (out[f] || new THREE.Color()).lerpColors(a[f], b[f], t);
    for (const f of NUMBER_FIELDS) out[f] = lerp(a[f], b[f], t);
    return out;
  }

  // Both tables share t keyframes, so one bracketing index serves both; biomeBlend crossfades them.
  #sample(phase, out) {
    let i = 0;
    while (KEYS[i + 1].t < phase) i++;
    const t = (phase - KEYS[i].t) / (KEYS[i + 1].t - KEYS[i].t);

    const blend = this.biomeBlend;
    if (blend <= 0) return this.#lerpKeyframe(KEYS, i, t, out);
    if (blend >= 1) return this.#lerpKeyframe(KEYS_GRASSLAND, i, t, out);

    const a = this.#lerpKeyframe(KEYS, i, t, this._kA);
    const b = this.#lerpKeyframe(KEYS_GRASSLAND, i, t, this._kB);
    out.sky = out.sky || [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    for (let j = 0; j < 4; j++) out.sky[j].copy(a.sky[j]).lerp(b.sky[j], blend);
    for (const f of COLOR_FIELDS) out[f] = (out[f] || new THREE.Color()).copy(a[f]).lerp(b[f], blend);
    for (const f of NUMBER_FIELDS) out[f] = lerp(a[f], b[f], blend);
    return out;
  }

  update(dt, elapsed, camera, trainPos, sceneFog) {
    const time = elapsed + this.timeOffset;
    const phase = ((time / DAY_LENGTH) % 1 + 1) % 1;
    // positional crossfade: prairie below startX, grassland above endX
    this.biomeBlend = smootherstep((trainPos.x - BIOME_FADE.startX) / (BIOME_FADE.endX - BIOME_FADE.startX));
    const k = this.#sample(phase, (this._k = this._k || {}));
    this.nightness = k.stars;

    const du = this.domeMat.uniforms;
    du.uZenith.value.copy(k.sky[0]);
    du.uUpper.value.copy(k.sky[1]);
    du.uLower.value.copy(k.sky[2]);
    du.uHorizon.value.copy(k.sky[3]);
    du.uHaze.value.copy(k.fog);
    du.uGlow.value.copy(k.glow);
    du.uGlowI.value = k.glowI;
    du.uBelt.value.copy(k.belt);
    du.uBeltI.value = k.beltI;
    du.uNight.value = k.stars;
    du.uDrift.value = time * SKY_LOOK.cloudDrift;
    du.uCloudOp.value = 1 - CHART.uChart.value;
    du.uCloudLit.value.copy(k.cloud);
    du.uCloudShade.value.copy(k.sky[0]).lerp(k.cloud, SKY_LOOK.cloudShade[0]).multiplyScalar(SKY_LOOK.cloudShade[1]);

    sceneFog.color.copy(k.fog);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    // with no finishing pass to lift it, the night's own light carries the moonlit ground
    const plainLift = this.plain ? 1 + SKY_LOOK.plainNightLift * k.stars : 1;
    this.hemi.intensity = k.hemiI * plainLift;
    this.sunLight.color.copy(k.dirCol);
    this.renderer.toneMappingExposure = k.exp;
    this.scene.environmentIntensity = k.env;

    // the sun rises ahead of the train (+X, toward the destination)
    const su = (((phase - SUNRISE) % 1) + 1) % 1 / DAY_SPAN;
    const sa = su * Math.PI;
    const alt = Math.sin(sa);
    const lowness = 1 - clamp(alt / 0.35, 0, 1); // 1 when kissing the horizon
    // high sun stands in front of the cutaway; it swings behind the train as it sets
    const swing = smootherstep((lowness - 0.2) / 0.3);
    // a low sun stands behind the cutaway so it sets in the window of the side view
    const lift = SKY_LOOK.sunLift * swing * clamp(alt / 0.15, 0, 1);
    _v.set(Math.cos(sa), alt * SKY_LOOK.sunClimb + 0.02 + lift, lerp(SKY_LOOK.sunFront, SKY_LOOK.sunBehind, swing)).normalize();
    const sunUp = su <= 1;
    if (sunUp) this.keyDir.set(_v.x, Math.max(_v.y, 0.3), _v.z).normalize();
    this.duskness = (sunUp ? swing : 1) * (1 - smootherstep(k.stars / 0.6));
    this.bounceIntensity = lerp(lerp(SKY_LOOK.bounceI[0], SKY_LOOK.bounceI[1], this.duskness), SKY_LOOK.bounceI[2], k.stars);
    this.sunDir.copy(_v);
    du.uSunDir.value.copy(_v);
    du.uSunVis.value = su <= 1.04 ? clamp((alt + 0.06) / 0.12, 0, 1) : 0;
    du.uSunSize.value = lerp(SKY_LOOK.sunSize[0], SKY_LOOK.sunSize[1], lowness);
    _c1.set(SKY_LOOK.sunHigh);
    _c2.set(SKY_LOOK.sunLow);
    const ember = smootherstep(lowness / 0.5);
    du.uSunCol.value.lerpColors(_c1, _c2, ember).multiplyScalar(lerp(SKY_LOOK.sunGain[0], SKY_LOOK.sunGain[1], ember));

    // the moon skims low behind the train all night, a lantern in the window
    const mu = (((phase - SUNSET - 0.005) % 1) + 1) % 1 / (1 - DAY_SPAN);
    const ma = mu * Math.PI;
    const malt = Math.sin(ma);
    _v.set(Math.cos(ma) * 0.9, malt * SKY_LOOK.moonArc[0] + SKY_LOOK.moonArc[1], -0.8).normalize();
    if (!sunUp) this.keyDir.set(_v.x, SKY_LOOK.moonKeyHeight, _v.z).normalize();
    du.uMoonDir.value.copy(_v);
    du.uMoonVis.value = mu <= 1.02 ? clamp((malt + 0.04) / 0.1, 0, 1) * clamp(k.stars * 1.6, 0, 1) : 0;

    // the key dips to nothing as sun hands over to moon, so the swap never pops
    const keyFade = sunUp ? clamp((alt + 0.02) / 0.1, 0, 1) : clamp((malt + 0.02) / 0.1, 0, 1);
    this.sunLight.intensity = k.dirI * keyFade * plainLift;

    ATMOS.keyDir.copy(this.keyDir);
    ATMOS.sunDir.copy(this.sunDir);
    ATMOS.time = time;
    ATMOS.night = k.stars;
    ATMOS.dusk = this.duskness;
    ATMOS.glow.copy(k.glow);
    ATMOS.glowI = k.glowI * du.uSunVis.value;
    _c1.copy(k.dirCol).multiplyScalar(k.dirI * keyFade);
    _c2.copy(k.hemiSky).multiplyScalar(k.hemiI);
    ATMOS.lit.setRGB(_c1.r * 0.2 + _c2.r * 0.6, _c1.g * 0.2 + _c2.g * 0.6, _c1.b * 0.2 + _c2.b * 0.6);
    ATMOS.shade.setRGB(_c1.r * 0.06 + _c2.r * 0.9, _c1.g * 0.06 + _c2.g * 0.9, _c1.b * 0.06 + _c2.b * 0.9);
    ATMOS.ground.copy(k.hemiGround);

    this.starMat.uniforms.uTime.value = time;
    this.starMat.uniforms.uAlpha.value = k.stars;
    this.starMat.uniforms.uPR.value = this.renderer.getPixelRatio();
    this.fireflyMat.uniforms.uTime.value = time;
    this.fireflyMat.uniforms.uAlpha.value = k.stars * 0.9;
    this.fireflyMat.uniforms.uPR.value = this.renderer.getPixelRatio();
    this.stars[0].visible = this.stars[1].visible = this.fireflies.visible = k.stars > 0;
    this.fireflies.position.x = damp(this.fireflies.position.x, trainPos.x, 0.5, dt);
    this.fireflies.position.z = damp(this.fireflies.position.z, trainPos.z, 0.5, dt);

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

    // the dome (and sun, moon, stars) follows the camera so it never ends
    this.rig.position.set(camera.position.x, 0, camera.position.z);
  }
}
