import * as THREE from 'three';
import { LEVELS, LADDERS, TRAIN_HALF, CAR_CENTERS, TUNING, clamp, damp } from '../constants.js';
import { figureShadow } from '../look.js';
import { Figure, STRIDE_TIME } from './figure.js';
import { Pour } from './pour.js';

const LEVEL_ORDER = ['under', 'deck', 'roof'];
const WHEEL_X = CAR_CENTERS[0] + 1.98;
const WHEEL_Z = -1.13;
const POTS = [[3.05, 3.0, -1.44], [4.33, 3.0, -1.62]];
const POT_REACH = 1.3;
const _v = new THREE.Vector3();
const WALK_Z = 0.35;
const CLIMB_Z = 1.85;
const REACH_Z = { plants: -0.5, engine: 0.15, tread: 1.0, tread2: 1.0 };
const STRIDE_RATE = (Math.PI * 2) / STRIDE_TIME;
const ACTION_POSE = { engine: 'tend', plants: 'water', tread: 'tread', tread2: 'tread' };

// The character lives in TRAIN-ARC space: `x` is a position along the
// train's length, mapped onto the world through the same trail the cars
// follow — so walking the corridor stays straight even mid-turn.
export class Player {
  constructor(train, scene) {
    this.train = train;
    this.scene = scene;
    this.docked = null; // null = free on the trail; else the car index we're bolted to
    this.x = 12; // spawn on the front-car deck, ladder to the cab nearby
    this.level = 'deck';
    this.y = LEVELS.deck;
    this.z = 0.35;
    this.facing = 1;
    this.climbing = false;
    this.climbTarget = null;
    this.sitting = false;
    this.sitKind = null;
    this.atWheel = false;
    this.action = null;
    this.walkPhase = 0;
    this.moving = false;
    this.settle = 0;
    this.camera = null;
    this.pot = POTS[0];
    this.watering = false;
    this.motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

    this.group = new THREE.Group();
    this.#buildMesh();
    scene.add(this.group);
    this.#sync();
  }

  #buildMesh() {
    this.figure = new Figure();
    this.body = this.figure.root;
    this.group.add(this.body);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), figureShadow(this.train.practicals.contactMat.map));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.shadow.scale.set(0.5, 0.36, 1);
    this.group.add(this.shadow);
    this.pour = new Pour(this.scene, this.figure.materials.water);
  }

  nearestLadder() {
    for (const l of LADDERS) {
      if (Math.abs(this.x - l.x) < 0.8) return l;
    }
    return null;
  }

  #maxX() {
    // the cab's front wall stops a rooftop stroll a little earlier
    return this.level === 'roof' ? 22.6 : TRAIN_HALF - 0.4;
  }

  update(dt, input, time = 0) {
    this.settle = damp(this.settle, 0, 9, dt);
    this.#move(dt, input);
    this.#sync();
    const f = this.figure;
    let view = -this.facing * 1.57;
    if (this.camera) {
      this.group.worldToLocal(_v.copy(this.camera.position));
      view = Math.atan2(-_v.z, _v.x);
    }
    f.update(dt, time, this.#pose(), this.facing, this.walkPhase, this.motionQuery?.matches ? 0 : 1, this.level === 'under' && !this.climbing, view);
    if (this.train.wateringCan) this.train.wateringCan.visible = !f.holdingCan;
    this.shadow.visible = !this.sitting && !this.climbing && !this.atWheel;
    if (f.pouring) {
      this.group.updateWorldMatrix(true, true);
      f.rose.getWorldPosition(this.pour.from);
      this.pour.to.set(this.pot[0], this.pot[1], this.pot[2]).applyMatrix4(this.train.cars[2].group.matrixWorld);
    }
    this.pour.update(dt, f.pouring);
  }

  #pose() {
    if (this.sitting) return this.sitKind === 'rest' ? 'lie' : 'sit';
    if (this.atWheel) return 'wheel';
    if (this.climbing) return 'climb';
    if (this.moving) return 'walk';
    return ACTION_POSE[this.action] ?? 'idle';
  }

  #move(dt, input) {
    if (this.sitting) {
      this.x = damp(this.x, this.sitPose.x, 8, dt);
      this.y = damp(this.y, this.sitPose.y, 8, dt);
      this.z = damp(this.z, this.sitPose.z, 8, dt);
      this.facing = 1;
      this.moving = false;
      return;
    }

    const left = input.down('KeyA') || input.down('ArrowLeft');
    const right = input.down('KeyD') || input.down('ArrowRight');
    const up = input.down('KeyW') || input.down('ArrowUp');
    const down = input.down('KeyS') || input.down('ArrowDown');

    if (this.atWheel) {
      if (left || right || this.level !== 'roof') this.atWheel = false;
      else {
        this.x = damp(this.x, WHEEL_X, 5, dt);
        this.z = damp(this.z, WHEEL_Z, 5, dt);
        this.facing = 1;
        this.moving = false;
        return;
      }
    }

    if (this.climbing) {
      const target = LEVELS[this.climbTarget];
      const dir = Math.sign(target - this.y);
      this.y += dir * TUNING.climbSpeed * dt;
      this.z = damp(this.z, CLIMB_Z, 10, dt);
      if ((dir > 0 && this.y >= target) || (dir < 0 && this.y <= target)) {
        this.y = target;
        this.level = this.climbTarget;
        this.climbing = false;
      }
      this.moving = true;
      this.walkPhase += dt * 11;
      return;
    }

    // start a climb?
    const ladder = this.nearestLadder();
    if (ladder !== null && (up || down)) {
      const idx = LEVEL_ORDER.indexOf(this.level);
      const next = up ? idx + 1 : idx - 1;
      const nextLevel = LEVEL_ORDER[next];
      if (nextLevel && ladder.levels.includes(nextLevel) && ladder.levels.includes(this.level)) {
        this.climbing = true;
        this.climbTarget = nextLevel;
        this.x = ladder.x;
        return;
      }
    }

    // walk
    let move = 0;
    if (left) move -= 1;
    if (right) move += 1;
    this.moving = move !== 0;
    if (move !== 0) {
      this.facing = move;
      this.x = clamp(this.x + move * TUNING.walkSpeed * dt, -TRAIN_HALF + 0.4, this.#maxX());
      this.walkPhase += dt * STRIDE_RATE;
    }
    this.z = damp(this.z, (move === 0 && REACH_Z[this.action]) || WALK_Z, 6, dt);
    if (move === 0 && this.action === 'plants') {
      if (!this.watering) {
        const ahead = this.x - CAR_CENTERS[2] + this.facing * POT_REACH;
        let pot = POTS[0];
        for (const p of POTS) if (Math.abs(p[0] - ahead) < Math.abs(pot[0] - ahead)) pot = p;
        this.pot = pot;
      }
      this.x = damp(this.x, CAR_CENTERS[2] + this.pot[0] - this.facing * POT_REACH, 5, dt);
    }
    this.watering = move === 0 && this.action === 'plants';
  }

  #sync() {
    if (this.docked != null) {
      // Riding inside a car: express the pose in that car's LOCAL frame so the
      // player is a rigid part of the car group — inheriting its trail position,
      // yaw AND the suspension roll/pitch/bob. There's no second world-space
      // sampling to drift against, so the cab can't wobble out from under us and
      // the per-frame judder is gone. Train-arc X maps to car-local X by simply
      // subtracting the car centre; Y (height) and Z (depth) are already the
      // car's local axes; the parent group supplies the heading.
      this.group.position.set(this.x - CAR_CENTERS[this.docked], this.y + this.settle, this.z);
      this.group.rotation.set(0, this.facing > 0 ? 0 : Math.PI, 0);
    } else {
      // Free on the train: map train-arc coordinates onto the world through the
      // trail the cars follow, so walking the corridor stays straight mid-turn.
      const f = this.train.frameAt(this.x);
      const sin = Math.sin(f.theta);
      const cos = Math.cos(f.theta);
      this.group.position.set(f.x + this.z * sin, this.y + this.settle, f.z + this.z * cos);
      this.group.rotation.y = f.theta + (this.facing > 0 ? 0 : Math.PI);
    }
  }

  // Which car (0 cab, 1 engine, 2 living) owns a given train-arc X — the same
  // split the see-through walls use, at the ~±8.3 coupling gaps.
  #carIndexAt(x) {
    return x > 8.3 ? 0 : x < -8.3 ? 2 : 1;
  }

  // Reconcile rigid-parenting each frame (called from the main loop). The player
  // is bolted into a car group while the camera is locked close inside it — the
  // driver's cab (cabin mode) and the two seated views — so it rides the car's
  // suspension sway instead of hanging static above a wobbling floor. Otherwise
  // it rides the trail free in world space. A no-op when nothing changed.
  syncDock(mode) {
    let car = null;
    if (mode === 'cabin') car = 0;
    else if (this.sitting) car = this.#carIndexAt(this.sitPose.x);
    this.#dockTo(car);
  }

  #dockTo(carIndex) {
    if (this.docked === carIndex) return;
    this.docked = carIndex;
    const parent = carIndex == null ? this.scene : this.train.cars[carIndex].group;
    parent.add(this.group); // Object3D.add re-parents, detaching from the old parent
    this.#sync(); // CRITICAL: re-parenting keeps LOCAL numbers, not world position —
                  // recompute the pose in the new frame this same frame or it teleports
  }

  sit(pose, kind = 'book') {
    this.sitPose = pose || { x: this.train.chairX, y: LEVELS.deck + 0.42, z: -0.55 };
    this.sitKind = kind;
    this.sitting = true;
    this.atWheel = false;
    this.climbing = false;
  }

  takeWheel() {
    this.atWheel = true;
  }

  stand() {
    if (this.sitting) this.settle += this.y - LEVELS.deck;
    this.sitting = false;
    this.atWheel = false;
    this.y = LEVELS.deck;
  }
}
