import * as THREE from 'three';
import { LEVELS, TRAIN_HALF, clamp, lerp, smootherstep, damp } from '../constants.js';

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const _pp = new THREE.Vector3();
const _dir = new THREE.Vector3();

const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const _vp = new THREE.Vector3();
const _vl = new THREE.Vector3();

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
const BOOK_DIST = 42;
const BOOK_MAX = 130;
const BOOK_YAW = Math.PI / 4;
const BOOK_PHI = 0.26;

// A tall screen gets its own framings rather than a cropped landscape one.
const TALL = {
  inhabitDist: 16.5,
  inhabitUp: 2.5,
  inhabitLook: 1.0,
  lead: 0.9,
  cabinX: 6.5,
  cabinSide: 7.5,
  cabinUp: 2.7,
  cabinAhead: -3,
  cabinLookUp: 1.7,
  bookYaw: 0.34,
  bookPhi: 0.44,
  bookDist: 74,
  bookMax: 78,
  mapScale: 0.85,
  sway: 0.2,
  vistaBack: 1.7,
  vistaAlong: 0.85,
  vistaLook: 22,
};
const SHORT_MAP_SCALE = 0.6;
// A phone on its side has little height to give the rooms, so the cutaway moves in.
const SHORT = { inhabitDist: 13, inhabitUp: 2.0, inhabitLook: 1.0 };
const shortness = (aspect) => (aspect > 1.3 ? clamp((560 - (globalThis.innerHeight ?? 900)) / 170, 0, 1) : 0);
const tallness = (aspect) => clamp((1.05 - aspect) / 0.45, 0, 1);

const FOV = 42;

export function createCamera() {
  return new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.5, 9000);
}

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
    // a place ({ x, z }) the cutaway leans back to take in; null lets it settle home
    this.vista = null;
    this.vistaAt = null;
    this.vistaBlend = 0;
    this.mapBlend = 0;
    this.aspect = camera.aspect;
    this.tall = tallness(camera.aspect);
    this.short = shortness(camera.aspect);
    this.settled = false;
    this.lead = 0;
    this.swayPhase = 0;
    // what the camera is looking at; moves are blended about it so the train never leaves frame
    this.focus = new THREE.Vector3();
    this.fromFocus = new THREE.Vector3();
    this.fromDir = new THREE.Vector3();
    this.fromDist = 1;
    this.motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.onCut = null;

    // map framing state
    this.mapCenter = new THREE.Vector2();
    this.pan = new THREE.Vector2();
    this.mapHeight = 330;
    this.mapScale = 1;

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

    this.#computeInhabit();
    this.#snap();
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

  #aim() {
    _m.lookAt(this.camera.position, this.focus, UP);
    this.camera.quaternion.setFromRotationMatrix(_m);
  }

  #snap() {
    this.camera.position.copy(_pos);
    this.focus.copy(_look);
    this.#aim();
  }

  // e along the move from the framing held at #leave to the live target in _pos/_look
  #blend(e) {
    _dir.subVectors(_pos, _look);
    const dist = _dir.length() || 1;
    _dir.divideScalar(dist);
    const cos = clamp(this.fromDir.dot(_dir), -1, 1);
    const angle = Math.acos(cos);
    if (angle > 1e-4) {
      const sin = Math.sin(angle);
      const a = Math.sin((1 - e) * angle) / sin;
      const b = Math.sin(e * angle) / sin;
      _dir.multiplyScalar(b).addScaledVector(this.fromDir, a);
    }
    this.focus.lerpVectors(this.fromFocus, _look, e);
    const reach = this.fromDist * Math.pow(dist / this.fromDist, e);
    this.camera.position.copy(this.focus).addScaledVector(_dir, reach);
    this.#aim();
  }

  #computeInhabit() {
    // perpendicular to the trail at the character's position — the cutaway
    // stays square-on to whichever car the player is in, even mid-turn
    const w = this.tall;
    const f = this.train.frameAt(clamp(this.followX + this.lead, -22, 22));
    const sin = Math.sin(f.theta);
    const cos = Math.cos(f.theta);
    const lvlY = this.followY;
    const s = this.short;
    const dist = lerp(lerp(20.5, TALL.inhabitDist, w), SHORT.inhabitDist, s);
    _pos.set(f.x + dist * sin, lvlY + lerp(lerp(2.4, TALL.inhabitUp, w), SHORT.inhabitUp, s), f.z + dist * cos);
    _look.set(f.x, lvlY + lerp(lerp(0.55, TALL.inhabitLook, w), SHORT.inhabitLook, s), f.z);
    if (this.vistaBlend > 0) {
      const dx = this.vistaAt.x - f.x;
      const dz = this.vistaAt.z - f.z;
      const d = Math.hypot(dx, dz) || 1;
      const e = smootherstep(this.vistaBlend);
      const back = lerp(1, TALL.vistaBack, w);
      const along = lerp(0.2, TALL.vistaAlong, w);
      _vp.set(f.x - (dx / d) * 80 * back + 100 * back * sin, 19, f.z - (dz / d) * 80 * back + 100 * back * cos);
      _vl.set(f.x + dx * along, lerp(42, TALL.vistaLook, w), f.z + dz * along);
      _pos.lerp(_vp, e);
      _look.lerp(_vl, e);
    }
  }

  #computeMap() {
    const cx = this.mapCenter.x + this.pan.x;
    const cz = this.mapCenter.y + this.pan.y;
    const h = this.mapHeight * this.mapScale;
    _pos.set(cx, h, cz + h * 0.12);
    _look.set(cx, 0, cz);
  }

  #computeBook() {
    // free orbit — drag to swing, scroll from inside the car out to a wide
    // shot. Zoomed out, the orbit centres on the train; zooming in slides
    // the focus onto the resting character.
    const o = this.orbit;
    const c = this.train.pos;
    const pp = this.player.group.getWorldPosition(_pp);
    const dist = Math.min(o.dist, this.maxOrbit);
    const blend = clamp((50 - dist) / 38, 0, 1);
    _look.set(
      lerp(c.x, pp.x, blend),
      lerp(3.2, pp.y + 1.1, blend),
      lerp(c.z, pp.z, blend)
    );
    _pos.set(
      _look.x + dist * Math.cos(o.phi) * Math.cos(o.theta),
      _look.y + dist * Math.sin(o.phi),
      _look.z - dist * Math.cos(o.phi) * Math.sin(o.theta)
    );
  }

  // Perched at the back of the cab, gaze running forward out the front
  // window. Everything is derived from the nose's LIVE, continuous position
  // + heading — NOT the recorded trail. The trail only gains a point every
  // ~0.3u travelled and its sampled tangent carries the tiny wiggles of the
  // steering; with the eye thrown 12u out to the side, those wiggles get
  // multiplied into a visible sway. Continuous state keeps it glass-smooth.
  #computeCabin() {
    const head = this.train.headPos;
    const h = this.train.heading;
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const w = this.tall;
    const back = TRAIN_HALF - lerp(CABIN_CAM_X, TALL.cabinX, w);
    const side = lerp(CABIN_CAM_SIDE, TALL.cabinSide, w);
    // forward = (cos, -sin); the open near side (screen-right) = (sin, cos)
    _pos.set(
      head.x - cos * back + sin * side,
      LEVELS.roof + lerp(CABIN_EYE_UP, TALL.cabinUp, w),
      head.z + sin * back + cos * side
    );
    const ahead = lerp(CABIN_LOOK_AHEAD, TALL.cabinAhead, w);
    _look.set(
      head.x + cos * ahead,
      LEVELS.roof + lerp(CABIN_LOOK_UP, TALL.cabinLookUp, w),
      head.z - sin * ahead
    );
  }

  #computeFrame(mode) {
    if (mode === 'map') this.#computeMap();
    else if (mode === 'book') this.#computeBook();
    else if (mode === 'cabin') this.#computeCabin();
    else this.#computeInhabit();
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
    this.orbit.theta = h + Math.PI + this.bookYaw;
    this.orbit.phi = this.bookPhi;
    this.orbit.dist = this.bookDist;
    this.bookHeading = h;
    this.autoOrbit = !this.motionQuery?.matches;
    this.recentering = false;
    this.swayPhase = 0;
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

  #leave(dur) {
    this.fromFocus.copy(this.focus);
    this.fromDir.subVectors(this.camera.position, this.focus);
    this.fromDist = this.fromDir.length() || 1;
    this.fromDir.divideScalar(this.fromDist);
    if (!this.motionQuery?.matches) return dur;
    if (this.onCut) this.onCut();
    return 0.001;
  }

  #startTransition(target, dur) {
    this.soft = null; // a real transition supersedes any in-flight soft glide
    this.transition = { t: 0, dur: this.#leave(dur), target };
  }

  // Flip the mode immediately (so gameplay reacts at once) and ease the
  // camera there from wherever it is now over `dur` seconds.
  #startSoft(target, dur) {
    this.soft = { t: 0, dur: this.#leave(dur) };
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
    this.orbit.dist = clamp(this.orbit.dist * factor, 1.6, this.maxOrbit);
    this.autoOrbit = false;
    this.recentering = false;
  }

  update(dt, time) {
    this.settled = true;
    this.tall = damp(this.tall, tallness(this.aspect), 3.5, dt);
    const walking = this.mode === 'inhabit' && !this.player.sitting;
    this.lead = damp(this.lead, walking ? this.player.facing * TALL.lead * this.tall : 0, 1.6, dt);
    if (this.vista) this.vistaAt = this.vista;
    this.vistaBlend = clamp(this.vistaBlend + (this.vista ? dt : -dt) / 2.2, 0, 1);
    this.followX = damp(this.followX, this.player.x, 5, dt);
    this.followY = damp(this.followY, this.player.sitting ? LEVELS.deck : this.player.y, 4, dt);

    if (this.mode === 'book' && !this.transition) {
      // keep the chosen angle relative to the direction of travel as the
      // train sweeps through turns
      const h = this.train.frameAt(0).theta;
      this.orbit.theta += wrapAngle(h - this.bookHeading);
      this.bookHeading = h;

      if (this.autoOrbit) {
        const o = this.orbit;
        if (this.recentering) {
          // glide back to the default travel-angle framing first
          const dTh = wrapAngle(h + Math.PI + this.bookYaw - o.theta);
          const phi = this.bookPhi;
          o.theta += dTh * (1 - Math.exp(-2.5 * dt));
          o.phi = damp(o.phi, phi, 2.5, dt);
          o.dist = damp(o.dist, this.bookDist, 2.5, dt);
          if (Math.abs(dTh) < 0.03 && Math.abs(o.phi - phi) < 0.02 && Math.abs(o.dist - this.bookDist) < 1) {
            this.recentering = false;
            this.swayPhase = 0;
          }
        } else if (this.tall > 0.5) {
          // a tall frame only suits the train end-on, so it sways about that angle instead of circling
          this.swayPhase += dt * 0.11;
          const dTh = wrapAngle(h + Math.PI + this.bookYaw + TALL.sway * Math.sin(this.swayPhase) - o.theta);
          o.theta += dTh * (1 - Math.exp(-1.2 * dt));
        } else {
          // the gentle drift, slow as an afternoon
          o.theta += dt * 0.03;
        }
      }
    }

    if (this.transition) {
      const tr = this.transition;
      tr.t += dt / tr.dur;
      const e = smootherstep(tr.t);
      this.#computeFrame(tr.target);
      this.#blend(e);

      const towardMap = tr.target === 'map';
      const fromMap = this.mode === 'map';
      if (towardMap) this.mapBlend = e;
      else if (fromMap) this.mapBlend = 1 - e;
      else this.mapBlend = 0;

      if (tr.t >= 1) {
        this.mode = tr.target;
        this.transition = null;
      }
      return;
    }

    this.#computeFrame(this.mode);
    this.mapBlend = this.mode === 'map' ? 1 : 0;
    if (this.soft) {
      // ease cutaway ↔ cab without taking control away
      this.soft.t += dt / this.soft.dur;
      this.#blend(smootherstep(this.soft.t));
      if (this.soft.t >= 1) this.soft = null;
    } else if (this.mode === 'map' || this.mode === 'book') {
      // soft glide for pan/zoom/orbit input
      const k = 1 - Math.exp(-9 * dt);
      this.camera.position.lerp(_pos, k);
      this.focus.lerp(_look, k);
      this.#aim();
    } else {
      this.#snap();
    }
  }

  zoomMap(factor) {
    this.mapHeight = clamp(this.mapHeight * factor, 150, 760);
  }

  panMap(dxPixels, dyPixels, viewportHeight) {
    const worldPerPixel = (2 * this.mapHeight * this.mapScale * Math.tan((FOV * Math.PI) / 360)) / viewportHeight;
    this.pan.x -= dxPixels * worldPerPixel;
    this.pan.y -= dyPixels * worldPerPixel;
  }

  get bookDist() {
    return lerp(BOOK_DIST, TALL.bookDist, this.tall);
  }

  get bookYaw() {
    return lerp(BOOK_YAW, TALL.bookYaw, this.tall);
  }

  get bookPhi() {
    return lerp(BOOK_PHI, TALL.bookPhi, this.tall);
  }

  get maxOrbit() {
    return lerp(BOOK_MAX, TALL.bookMax, this.tall);
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.mapScale = clamp((globalThis.innerHeight ?? 900) / 700, SHORT_MAP_SCALE, lerp(1, TALL.mapScale, tallness(aspect)));
    if (!this.settled) this.tall = tallness(aspect);
    this.short = shortness(aspect);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
