import * as THREE from 'three';
import { LEVELS, clamp, lerp, smootherstep, damp } from './constants.js';

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// Driver's-cab forward view: sat back behind the cab and off to the open
// (near) side, looking lengthwise down the cabin and out the big front
// window — so you see the interior and the country ahead at once. The
// player keeps walking the cab; toward the window reads as "deeper in",
// and stepping back out the rear doorway drops to the cutaway.
const CABIN_CAM_X = 3.5; // train-local arc position of the eye (well back behind the cab)
const CABIN_CAM_SIDE = 12.0; // offset out off the open side of the train (screen-right)
const CABIN_EYE_UP = 1.5; // above the roof storey floor → window-centre height
// From well off the side the gaze aims at the front of the train (cabin +
// window), not a far-forward point — otherwise the cabin swings out of frame.
const CABIN_LOOK_AHEAD = 8; // how far past the nose the gaze reaches
const CABIN_LOOK_UP = 0.5; // look height, around the front-window sill

// One camera, three framings of the same world. Transitions are a single
// continuous tween of position + orientation — never a cut. The target
// framing is recomputed live every frame of the tween, so dropping back
// into the cutaway tracks the (already moving) train.
export class CameraRig {
  constructor(camera, train, player) {
    this.camera = camera;
    this.train = train;
    this.player = player;

    this.mode = 'inhabit'; // 'inhabit' | 'map' | 'book' | 'cabin'
    this.transition = null;
    // a "soft" ease eases the camera between the cutaway and the cab view
    // WITHOUT marking the rig busy — the player keeps walking, the train
    // keeps rolling, the camera just slides into place.
    this.soft = null;
    this.mapBlend = 0;

    // map framing state
    this.mapCenter = new THREE.Vector2();
    this.pan = new THREE.Vector2();
    this.mapHeight = 330;

    // book-mode free orbit. autoOrbit drives the gentle cinematic drift;
    // any manual drag/zoom switches it off so the chosen view sticks,
    // and the O hotkey recenters + resumes it.
    this.orbit = { theta: 0.6, phi: 0.33, dist: 55 };
    this.autoOrbit = true;
    this.recentering = false;
    this.bookHeading = 0;

    // smoothed follow state for the cutaway
    this.followX = player.x;
    this.followY = LEVELS.deck;

    this.#computeInhabit(this.camera.position, _q);
    camera.quaternion.copy(_q);
  }

  get busy() {
    return this.transition !== null;
  }

  get transitionTarget() {
    return this.transition ? this.transition.target : null;
  }

  // Train should pause whenever the map is the destination or current mode.
  get mapEngaged() {
    return this.mode === 'map' || this.transitionTarget === 'map';
  }

  #frameFromLook(outPos, outQuat, pos, look) {
    outPos.copy(pos);
    _m.lookAt(pos, look, UP);
    outQuat.setFromRotationMatrix(_m);
  }

  #computeInhabit(outPos, outQuat) {
    // perpendicular to the trail at the character's position — the cutaway
    // stays square-on to whichever car the player is in, even mid-turn
    const f = this.train.frameAt(clamp(this.followX, -22, 22));
    const sin = Math.sin(f.theta);
    const cos = Math.cos(f.theta);
    const lvlY = this.followY;
    _pos.set(f.x + 20.5 * sin, lvlY + 2.4, f.z + 20.5 * cos);
    _look.set(f.x, lvlY + 0.55, f.z);
    this.#frameFromLook(outPos, outQuat, _pos, _look);
  }

  #computeMap(outPos, outQuat) {
    const cx = this.mapCenter.x + this.pan.x;
    const cz = this.mapCenter.y + this.pan.y;
    const h = this.mapHeight;
    _pos.set(cx, h, cz + h * 0.12);
    _look.set(cx, 0, cz);
    this.#frameFromLook(outPos, outQuat, _pos, _look);
  }

  #computeBook(outPos, outQuat) {
    // free orbit — drag to swing, scroll from inside the car out to a wide
    // shot. Zoomed out, the orbit centres on the train; zooming in slides
    // the focus onto the resting character.
    const o = this.orbit;
    const c = this.train.pos;
    const pp = this.player.group.position;
    const blend = clamp((50 - o.dist) / 38, 0, 1);
    _look.set(
      lerp(c.x, pp.x, blend),
      lerp(3.2, pp.y + 1.1, blend),
      lerp(c.z, pp.z, blend)
    );
    _pos.set(
      _look.x + o.dist * Math.cos(o.phi) * Math.cos(o.theta),
      _look.y + o.dist * Math.sin(o.phi),
      _look.z - o.dist * Math.cos(o.phi) * Math.sin(o.theta)
    );
    this.#frameFromLook(outPos, outQuat, _pos, _look);
  }

  // Perched at the back of the cab, gaze running forward out the front
  // window. The eye rides the recorded trail well back along the train (so
  // it sweeps through turns), but the gaze aims from the nose's LIVE,
  // continuous position + heading — the trail only gains a point every
  // ~0.3u travelled, so aiming off it makes the view judder as the train
  // rolls. Continuous state keeps it glass-smooth.
  #computeCabin(outPos, outQuat) {
    const eye = this.train.frameAt(CABIN_CAM_X);
    const head = this.train.headPos;
    const fwd = this.train.forwardDir(_fwd);
    // shove the eye toward the open near side so the gaze runs diagonally
    // down the length of the cabin rather than straight along its spine
    _pos.set(
      eye.x + CABIN_CAM_SIDE * Math.sin(eye.theta),
      LEVELS.roof + CABIN_EYE_UP,
      eye.z + CABIN_CAM_SIDE * Math.cos(eye.theta)
    );
    _look.set(
      head.x + fwd.x * CABIN_LOOK_AHEAD,
      LEVELS.roof + CABIN_LOOK_UP,
      head.z + fwd.z * CABIN_LOOK_AHEAD
    );
    this.#frameFromLook(outPos, outQuat, _pos, _look);
  }

  #computeFrame(mode, outPos, outQuat) {
    if (mode === 'map') this.#computeMap(outPos, outQuat);
    else if (mode === 'book') this.#computeBook(outPos, outQuat);
    else if (mode === 'cabin') this.#computeCabin(outPos, outQuat);
    else this.#computeInhabit(outPos, outQuat);
  }

  // Walking up into the cab settles into the forward driving view — a soft
  // glide, not a blocking transition, so control is never taken away.
  enterCabin() {
    if (this.busy || this.mode !== 'inhabit') return false;
    this.#startSoft('cabin', 2.4);
    return true;
  }

  enterMap() {
    if (this.busy || (this.mode !== 'inhabit' && this.mode !== 'cabin')) return false;
    this.mapCenter.set(this.train.pos.x, this.train.pos.z);
    this.pan.set(0, 0);
    this.#startTransition('map', 1.8);
    return true;
  }

  // Leaving the planner settles into the cab's forward view — route set,
  // now watch it unfold. Walking back out drops to the cutaway (exitCabin).
  exitMap() {
    if (this.busy || this.mode !== 'map') return false;
    this.#startTransition('cabin', 1.9);
    return true;
  }

  exitCabin() {
    if (this.busy || this.mode !== 'cabin') return false;
    this.#startSoft('inhabit', 1.6);
    return true;
  }

  enterBook() {
    if (this.busy || this.mode !== 'inhabit') return false;
    // default "travel angle": a low rear-quarter view 45° off the direction
    // of travel — carriages rumble across half the frame, countryside rolls
    // through the other half
    const h = this.train.frameAt(0).theta;
    this.orbit.theta = h + Math.PI + Math.PI / 4;
    this.orbit.phi = 0.26;
    this.orbit.dist = 42;
    this.bookHeading = h;
    this.autoOrbit = true;
    this.recentering = false;
    this.#startTransition('book', 2.4);
    return true;
  }

  toggleAutoOrbit() {
    this.autoOrbit = !this.autoOrbit;
    this.recentering = this.autoOrbit;
    return this.autoOrbit;
  }

  exitBook() {
    if (this.busy || this.mode !== 'book') return false;
    this.#startTransition('inhabit', 1.8);
    return true;
  }

  #startTransition(target, dur) {
    this.soft = null; // a real transition supersedes any in-flight soft glide
    this.transition = {
      t: 0,
      dur,
      target,
      fromPos: this.camera.position.clone(),
      fromQuat: this.camera.quaternion.clone(),
    };
  }

  // Flip the mode immediately (so gameplay reacts at once) and ease the
  // camera there from wherever it is now over `dur` seconds.
  #startSoft(target, dur) {
    this.soft = {
      t: 0,
      dur,
      fromPos: this.camera.position.clone(),
      fromQuat: this.camera.quaternion.clone(),
    };
    this.mode = target;
  }

  orbitDrag(dxPixels, dyPixels) {
    // grab-the-world feel: drag right and the scene follows your finger right
    // (matches the map view's panMap convention)
    this.orbit.theta -= dxPixels * 0.005;
    this.orbit.phi = clamp(this.orbit.phi + dyPixels * 0.005, 0.04, 1.25);
    this.autoOrbit = false; // a chosen view sticks
    this.recentering = false;
  }

  orbitZoom(factor) {
    // min 1.6 lets the camera push through the car wall and settle inside,
    // right beside the reader
    this.orbit.dist = clamp(this.orbit.dist * factor, 1.6, 130);
    this.autoOrbit = false;
    this.recentering = false;
  }

  update(dt, time) {
    this.followX = damp(this.followX, this.player.x, 5, dt);
    this.followY = damp(this.followY, this.player.sitting ? LEVELS.deck : this.player.y, 4, dt);

    if (this.mode === 'book' && !this.transition) {
      // keep the chosen angle relative to the direction of travel as the
      // train sweeps through turns
      const h = this.train.frameAt(0).theta;
      let dh = h - this.bookHeading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.orbit.theta += dh;
      this.bookHeading = h;

      if (this.autoOrbit) {
        const o = this.orbit;
        if (this.recentering) {
          // glide back to the default travel-angle framing first
          const target = h + Math.PI + Math.PI / 4;
          let dTh = target - o.theta;
          while (dTh > Math.PI) dTh -= Math.PI * 2;
          while (dTh < -Math.PI) dTh += Math.PI * 2;
          o.theta += dTh * (1 - Math.exp(-2.5 * dt));
          o.phi = damp(o.phi, 0.26, 2.5, dt);
          o.dist = damp(o.dist, 42, 2.5, dt);
          if (Math.abs(dTh) < 0.03 && Math.abs(o.phi - 0.26) < 0.02 && Math.abs(o.dist - 42) < 1) {
            this.recentering = false;
          }
        } else {
          // the gentle drift, slow as an afternoon
          o.theta += dt * 0.03;
        }
      }
    }

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();

    if (this.transition) {
      const tr = this.transition;
      tr.t += dt / tr.dur;
      const e = smootherstep(tr.t);
      this.#computeFrame(tr.target, targetPos, targetQuat);
      this.camera.position.lerpVectors(tr.fromPos, targetPos, e);
      this.camera.quaternion.slerpQuaternions(tr.fromQuat, targetQuat, e);

      const towardMap = tr.target === 'map';
      const fromMap = this.mode === 'map';
      if (towardMap) this.mapBlend = e;
      else if (fromMap) this.mapBlend = 1 - e;
      else this.mapBlend = 0;

      if (tr.t >= 1) {
        this.mode = tr.target;
        this.transition = null;
      }
    } else {
      this.#computeFrame(this.mode, targetPos, targetQuat);
      if (this.soft) {
        // ease cutaway ↔ cab without taking control away: lerp from where
        // the camera was toward the (live, still-moving) target framing
        this.soft.t += dt / this.soft.dur;
        const e = smootherstep(this.soft.t);
        this.camera.position.lerpVectors(this.soft.fromPos, targetPos, e);
        this.camera.quaternion.slerpQuaternions(this.soft.fromQuat, targetQuat, e);
        if (this.soft.t >= 1) this.soft = null;
        this.mapBlend = 0;
      } else if (this.mode === 'map' || this.mode === 'book') {
        // soft glide for pan/zoom/orbit input
        this.camera.position.lerp(targetPos, 1 - Math.exp(-9 * dt));
        this.camera.quaternion.slerp(targetQuat, 1 - Math.exp(-9 * dt));
        this.mapBlend = this.mode === 'map' ? 1 : 0;
      } else {
        this.camera.position.copy(targetPos);
        this.camera.quaternion.copy(targetQuat);
        this.mapBlend = 0;
      }
    }
  }

  zoomMap(factor) {
    this.mapHeight = clamp(this.mapHeight * factor, 150, 760);
  }

  panMap(dxPixels, dyPixels, viewportHeight) {
    const worldPerPixel = (2 * this.mapHeight * Math.tan((42 * Math.PI) / 360)) / viewportHeight;
    this.pan.x -= dxPixels * worldPerPixel;
    this.pan.y -= dyPixels * worldPerPixel;
  }

  // The cutaway's distance haze must stay closed until the fog-of-war
  // shroud is fully opaque, or the transition flashes undiscovered land.
  applySceneFog(fog) {
    const open = smootherstep((this.mapBlend - 0.45) / 0.55);
    fog.near = lerp(130, 1400, open);
    fog.far = lerp(560, 5200, open);
  }
}
