import * as THREE from 'three';
import {
  CAR_CENTERS, CAB_FROM_X, TRAIN_HALF, WORLD, TUNING,
  effMult, treadMult, clamp, lerp, damp,
} from '../constants.js';
import { TRAIN_LOOK, createTrainMaterials } from '../look.js';
import { blockedAt } from '../collision.js';
import { createRouteDisplay, updateRouteDisplay } from '../map/route-display.js';
import { createSmoke, updateSmoke } from '../atmosphere/smoke.js';
import { TrailPath } from './trail.js';
import { createTrainGeometry } from './parts.js';
import { buildCarShell, buildCarFittings } from './shell.js';
import { buildFrontCar } from './cab.js';
import { buildEngine, animateEngine } from './engine.js';
import { buildLiving } from './living.js';
import { createPracticals, buildPracticals, setPracticalsNight, setPracticalsFocus } from './practicals.js';

const FIT_OUT = [buildFrontCar, buildEngine, buildLiving];

// Which see-through zone a player at (level, train-local x) occupies.
export function focusZone(level, x) {
  return level === 'roof' && x > CAB_FROM_X ? 'cab' : 'car' + (x > 8.3 ? 0 : x < -8.3 ? 2 : 1);
}

// Arc-length offsets of each car centre behind the lead tractor point.
const CAR_OFFSETS = CAR_CENTERS.map((c) => TRAIN_HALF - c); // [8, 24.6, 41.2]

export class Train {
  constructor(scene) {
    this.scene = scene;
    this.materials = createTrainMaterials();
    this.geometry = createTrainGeometry();
    this.practicals = createPracticals();

    // --- state ---------------------------------------------------------
    this.heading = 0;
    this.speed = 0;
    this.paused = false;
    this.blocked = false;
    this.route = [];
    this.distanceTraveled = 0;
    this.eff = 88;
    this.wear = 8;
    this.plants = 95;
    this.onEvent = null;
    this.motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.previousPlants = this.plants;
    this.wateringPulse = 0;

    this.headPos = new THREE.Vector3(TRAIN_HALF, 0, 0);
    this.path = new TrailPath();
    this.path.seed(this.headPos.x, this.headPos.z, this.heading, 100);
    this._pos = new THREE.Vector3();

    this.wheels = [];
    this.zoneMats = {}; // see-through walls, one fading material per zone
    this.fadeMats = [];

    this.cars = [];
    for (let i = 0; i < CAR_CENTERS.length; i++) {
      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      scene.add(group);
      this.cars.push({ group, offset: CAR_OFFSETS[i] });
    }
    for (let ci = 0; ci < this.cars.length; ci++) {
      const g = this.cars[ci].group;
      buildCarShell(this, g, ci);
      FIT_OUT[ci](this, g);
      buildCarFittings(this, g, ci);
      buildPracticals(this, g, ci);
    }
    this.carVisuals = this.cars.flatMap(({ group }) => group.children);
    Object.assign(this, createRouteDisplay(scene));
    Object.assign(this, createSmoke(scene));
    this._stack = new THREE.Vector3();
    this.stackWorld = () => this.cars[1].group.localToWorld(this._stack.copy(this.stackLocal));
    this.#placeCars();
  }

  // Drop the whole train at a fresh spawn (new biome) facing `heading`,
  // exactly as a newly-constructed train would sit. Reseeds the trail, clears
  // the route, and resets gauges to fresh-journey values.
  reset({ x, z, heading }) {
    this.heading = heading;
    this.speed = 0;
    this.paused = false;
    this.blocked = false;
    this.clearRoute();
    this.distanceTraveled = 0;
    this.eff = 88;
    this.wear = 8;
    this.plants = 95;

    this.headPos.set(x, 0, z);
    this.previousPlants = this.plants;
    this.wateringPulse = 0;
    this.path.seed(this.headPos.x, this.headPos.z, this.heading, 100);
    this.#placeCars();
  }

  nearWallMat(zone, source = this.materials.innerWall) {
    if (!this.zoneMats[zone]) {
      this.zoneMats[zone] = source.clone();
      this.zoneMats[zone].transparent = true;
    }
    return this.zoneMats[zone];
  }

  fadingMat(zone, source) {
    const existing = this.fadeMats.find((entry) => entry.zone === zone && entry.source === source);
    if (existing) return existing.mat;
    const mat = source.clone();
    mat.transparent = true;
    mat.opacity = 1;
    this.fadeMats.push({ zone, source, mat });
    return mat;
  }

  // ----------------------------------------------------------- route edits
  addWaypoint(x, z) {
    x = clamp(x, WORLD.minX + 40, WORLD.maxX - 40);
    z = clamp(z, WORLD.minZ + 40, WORLD.maxZ - 40);
    if (this.route.length >= 60) return false;
    this.route.push(new THREE.Vector2(x, z));
    this.blocked = false;
    return true;
  }

  undoWaypoint() {
    this.route.pop();
    this.blocked = false;
  }

  clearRoute() {
    this.route.length = 0;
    this.blocked = false;
  }

  get pos() {
    return this._pos;
  }

  forwardDir(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  // World-space frame (position on the ground + heading) for a point at
  // train-local X. The player and camera both ride the trail through this.
  frameAt(localX) {
    return this.path.frame(this.path.head - (TRAIN_HALF - localX));
  }

  // --------------------------------------------------------------- update
  update(dt, time, obstacles) {
    const p = this.headPos;

    const moving = !this.paused && !this.blocked && this.route.length > 0;
    const targetSpeed = moving ? TUNING.baseSpeed * effMult(this.eff) * treadMult(this.wear) : 0;
    this.speed = damp(this.speed, targetSpeed, TUNING.accel, dt);
    if (this.speed < 0.02 && targetSpeed === 0) this.speed = 0;

    if (moving) {
      const wp = this.route[0];
      const dx = wp.x - p.x;
      const dz = wp.y - p.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(-dz, dx);

      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // slow for sharp course changes (and gate the bump check below)
      const align = clamp(1.3 - Math.abs(diff), 0.45, 1);
      const step = this.speed * dt * align;

      // curvature-limited steering: turn amount is tied to distance
      // travelled, so the recorded trail is everywhere a gentle arc
      const maxTurn = step * TUNING.curvature;
      this.heading += clamp(diff, -maxTurn, maxTurn);

      const dir = this.forwardDir();
      p.x += dir.x * step;
      p.z += dir.z * step;
      this.path.advance(p.x, p.z, step);

      this.distanceTraveled += step;
      this.wear = clamp(this.wear + step * TUNING.wearPerUnit, 0, TUNING.wearCeil);
      this.eff = clamp(this.eff - TUNING.effDriftPerSec * dt, TUNING.effFloor, 100);

      if (dist < TUNING.waypointRadius) {
        this.route.shift();
        if (this.route.length === 0 && this.onEvent) this.onEvent('route-finished');
      }

      // bump detection: a point ahead of the nose, only while truly driving
      if (align > 0.6) {
        const lx = p.x + dir.x * TUNING.lookahead;
        const lz = p.z + dir.z * TUNING.lookahead;
        if (blockedAt(obstacles, lx, lz, TUNING.obstaclePad)) {
          this.blocked = true;
          this.speed = 0;
          if (this.onEvent) this.onEvent('blocked');
        }
      }
    }

    this.plants = clamp(this.plants - TUNING.plantDriftPerSec * dt, TUNING.plantFloor, 100);

    this.#placeCars();

    // -- visuals --
    const spin = (this.speed / 0.92) * dt;
    for (const w of this.wheels) w.rotation.z -= spin;
    const motion = this.motionQuery?.matches ? 0 : 1;
    const speed01 = clamp(this.speed / TUNING.baseSpeed, 0, 1);
    this.headingNeedle.rotation.z = -this.heading;
    this.speedNeedle.rotation.z = damp(this.speedNeedle.rotation.z, 2.3 - speed01 * 4.6, 5, dt);
    this.cabWheel.rotation.z = Math.sin(this.heading) * 0.7;
    this.cabLevers[0].rotation.z = damp(this.cabLevers[0].rotation.z, -0.38 + speed01 * 0.85, 5, dt);
    this.cabLevers[1].rotation.x = damp(this.cabLevers[1].rotation.x, this.paused || this.blocked ? 0.5 : -0.25, 5, dt);
    animateEngine(this, dt, speed01);

    const rust = this.wear / 100;
    const clean = TRAIN_LOOK.wheelClean;
    const rusted = TRAIN_LOOK.wheelRusted;
    this.materials.wheel.color.setRGB(
      lerp(clean[0], rusted[0], rust),
      lerp(clean[1], rusted[1], rust),
      lerp(clean[2], rusted[2], rust)
    );

    const eff01 = this.eff / 100;
    const flicker = 1 + 0.06 * Math.sin(time * 8.1) * Math.sin(time * 4.3) * motion;
    this.pressureNeedle.rotation.z = damp(this.pressureNeedle.rotation.z, 2.3 - eff01 * 4.6, 5, dt);
    this.valveWheel.rotation.z = damp(this.valveWheel.rotation.z, eff01 * Math.PI * 1.2, 4, dt);
    this.flames.scale.y = (0.28 + eff01 * 0.78) * flicker;
    this.materials.ember.emissiveIntensity = (0.7 + eff01 * 1.5) * flicker;
    if (this.fireboxMat) {
      this.fireboxMat.emissiveIntensity = (0.15 + eff01 * 0.65) * flicker;
    }
    this.fireLight.intensity = (3.5 + eff01 * 6.5) * (1 + 0.9 * Math.max(this.practicals.lamp, 0)) * flicker;

    const plant01 = (this.plants - TUNING.plantFloor) / (100 - TUNING.plantFloor);
    if (this.plantPots) for (const pl of this.plantPots) pl.setHappiness(plant01, time, motion);
    this.wateringPulse = damp(this.wateringPulse, this.plants > this.previousPlants + 0.001 ? 1 : 0, 7, dt);
    this.previousPlants = this.plants;
    this.wateringCan.rotation.z = -this.wateringPulse * 0.38;

    updateSmoke(this, dt, this.speed, this.stackWorld);
  }

  // Each car rides the trail at its own offset. The unevenness is keyed to
  // distance s, so each car hits the same bumps as it passes over them and
  // everything stills when the train rests. Short wavelengths (1.7–7.6u)
  // read as ground rumble, not a boat's swell; one faint long roll remains.
  #placeCars() {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const s = this.path.head - car.offset;
      const f = this.path.frame(s);
      const p = i * 2.39;
      const roll =
        (Math.sin(s * 1.9 + p) * 0.45 + Math.sin(s * 0.83 + p * 2.7) * 0.35 + Math.sin(s * 3.7 + p * 1.3) * 0.2) * 0.0075 +
        Math.sin(s * 0.21 + p) * 0.003;
      const pitch = (Math.sin(s * 2.6 + p * 1.9) * 0.6 + Math.sin(s * 1.21 + p) * 0.4) * 0.0055;
      const bob = (Math.sin(s * 2.3 + p) + Math.sin(s * 4.1 + p * 2.2) * 0.5) * 0.016;
      car.group.position.set(f.x, bob, f.z);
      car.group.rotation.set(roll, f.theta, pitch);
    }
    const mid = this.path.frame(this.path.head - CAR_OFFSETS[1]);
    this._pos.set(mid.x, 0, mid.z);
  }

  // See-through walls: the zone the player occupies fades out; in book
  // mode everything goes opaque so the train reads as a solid home.
  setFocus(zone, allOpaque, dt) {
    for (const key of Object.keys(this.zoneMats)) {
      const mat = this.zoneMats[key];
      const target = allOpaque ? 1 : key === zone ? 0.03 : 1;
      mat.opacity = damp(mat.opacity, target, 7, dt);
      mat.depthWrite = mat.opacity > 0.5;
    }
    for (const { zone: key, mat } of this.fadeMats) {
      const target = allOpaque ? 1 : key === zone ? 0 : 1;
      mat.opacity = damp(mat.opacity, target, 7, dt);
      mat.depthWrite = mat.opacity > 0.5;
    }
    setPracticalsFocus(this);
  }

  setNight(night, dusk = 0) {
    setPracticalsNight(this, night, dusk);
  }

  // ------------------------------------------------- map overlay rendering
  updateRouteDisplay(mapBlend, time) {
    updateRouteDisplay(this, this._pos, this.route, mapBlend, time);
  }

  dispose() {
    const geometries = new Set([...Object.values(this.geometry), this.dotGeo]);
    const materials = new Set([...Object.values(this.materials), this.dotMat]);
    const textures = new Set();
    const instances = new Set();
    // A docked player is a passenger, not a train-owned render resource.
    const roots = [...this.carVisuals, this.routeGroup, ...this.smoke.map((puff) => puff.sprite)];
    for (const root of roots) {
      root.traverse((obj) => {
        if (obj.isInstancedMesh) instances.add(obj);
        if (obj.geometry) geometries.add(obj.geometry);
        if (!obj.material) return;
        const owned = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of owned) {
          materials.add(material);
        }
      });
      this.scene.remove(root);
    }
    for (const car of this.cars) this.scene.remove(car.group);
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
    for (const instance of instances) instance.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}
