import * as THREE from 'three';
import { LEVELS, LADDERS, TRAIN_HALF, CAR_CENTERS, TUNING, clamp, damp } from './constants.js';

const LEVEL_ORDER = ['under', 'deck', 'roof'];

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
    this.walkPhase = 0;
    this.moving = false;

    this.group = new THREE.Group();
    this.#buildMesh();
    scene.add(this.group);
    this.#sync();
  }

  #buildMesh() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.9 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xb5483a, roughness: 0.95 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x5c4332, roughness: 0.95 });

    this.body = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.46, 6, 12), bodyMat);
    torso.position.y = 0.66;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skinMat);
    head.position.y = 1.42;
    head.castShadow = true;

    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      bodyMat
    );
    hood.position.y = 1.46;

    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 8, 14), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.18;

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
    nose.position.set(0.23, 1.4, 0);

    for (const lz of [-0.12, 0.12]) {
      const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.12, 4, 8), bootMat);
      boot.position.set(0, 0.16, lz);
      this.body.add(boot);
    }

    this.body.add(torso, head, hood, scarf, nose);
    this.group.add(this.body);
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

  update(dt, input, time) {
    if (this.sitting) {
      this.x = damp(this.x, this.sitPose.x, 8, dt);
      this.y = damp(this.y, this.sitPose.y, 8, dt);
      this.z = damp(this.z, this.sitPose.z, 8, dt);
      this.facing = 1;
      this.body.rotation.z = 0;
      this.moving = false;
      this.#sync();
      return;
    }

    const left = input.down('KeyA') || input.down('ArrowLeft');
    const right = input.down('KeyD') || input.down('ArrowRight');
    const up = input.down('KeyW') || input.down('ArrowUp');
    const down = input.down('KeyS') || input.down('ArrowDown');

    if (this.climbing) {
      const target = LEVELS[this.climbTarget];
      const dir = Math.sign(target - this.y);
      this.y += dir * TUNING.climbSpeed * dt;
      this.z = damp(this.z, 0.55, 10, dt);
      if ((dir > 0 && this.y >= target) || (dir < 0 && this.y <= target)) {
        this.y = target;
        this.level = this.climbTarget;
        this.climbing = false;
      }
      this.moving = true;
      this.walkPhase += dt * 7;
      this.#sync();
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
        this.#sync();
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
      this.walkPhase += dt * 11;
    }
    this.z = damp(this.z, 0.35, 6, dt);
    this.#sync(time);
  }

  #sync(time = 0) {
    if (this.docked != null) {
      // Riding inside a car: express the pose in that car's LOCAL frame so the
      // player is a rigid part of the car group — inheriting its trail position,
      // yaw AND the suspension roll/pitch/bob. There's no second world-space
      // sampling to drift against, so the cab can't wobble out from under us and
      // the per-frame judder is gone. Train-arc X maps to car-local X by simply
      // subtracting the car centre; Y (height) and Z (depth) are already the
      // car's local axes; the parent group supplies the heading.
      this.group.position.set(this.x - CAR_CENTERS[this.docked], this.y, this.z);
      this.group.rotation.set(0, this.facing > 0 ? 0 : Math.PI, 0);
    } else {
      // Free on the train: map train-arc coordinates onto the world through the
      // trail the cars follow, so walking the corridor stays straight mid-turn.
      const f = this.train.frameAt(this.x);
      const sin = Math.sin(f.theta);
      const cos = Math.cos(f.theta);
      this.group.position.set(f.x + this.z * sin, this.y, f.z + this.z * cos);
      this.group.rotation.y = f.theta + (this.facing > 0 ? 0 : Math.PI);
    }

    if (this.moving) {
      this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.07;
      this.body.rotation.z = this.climbing ? 0 : Math.sin(this.walkPhase) * 0.05;
    } else {
      this.body.position.y = Math.sin(time * 1.8) * 0.015;
      this.body.rotation.z = 0;
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

  sit(pose) {
    this.sitPose = pose || { x: this.train.chairX, y: LEVELS.deck + 0.42, z: -0.55 };
    this.sitting = true;
    this.climbing = false;
  }

  stand() {
    this.sitting = false;
    this.y = LEVELS.deck;
  }
}
