import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLObjects } from 'three/src/renderers/webgl/WebGLObjects.js';
import { Train } from '../src/train/train.js';
import { Player } from '../src/character/player.js';
import { CameraRig } from '../src/camera/camera.js';
import { Interactions } from '../src/character/interactions.js';
import { CAB_FROM_X, CAR_CENTERS, LEVELS, TRAIN_HALF, TUNING } from '../src/constants.js';

const input = (held = [], pressed = []) => ({
  down: (key) => held.includes(key),
  pressed: (key) => pressed.includes(key),
});

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
}

function resourcesOf(train, scene) {
  const resources = new Map();
  function add(resource, label) {
    if (!resource || resources.has(resource)) return;
    resources.set(resource, label);
    if (resource.isMaterial) {
      for (const [key, value] of Object.entries(resource)) {
        if (value?.isTexture) add(value, `${label}.${key}`);
      }
    }
  }
  for (const [key, value] of Object.entries(train.geometry)) add(value, `geometry.${key}`);
  for (const [key, value] of Object.entries(train.materials)) add(value, `materials.${key}`);
  for (const [key, value] of Object.entries(train.zoneMats)) add(value, `zoneMats.${key}`);
  for (const { mat, source, zone } of train.fadeMats) {
    add(mat, `fadeMats.${zone}`);
    add(source, `fadeMats.${zone}.source`);
  }
  add(train.dotGeo, 'dotGeo');
  add(train.dotMat, 'dotMat');
  const roots = [...(scene ? [scene] : []), ...train.cars.map(({ group }) => group), train.routeGroup,
    ...train.smoke.map(({ sprite }) => sprite)];
  for (const root of roots) {
    root.traverse((object) => {
      const label = object.name || `${object.type}#${object.id}`;
      if (object.isInstancedMesh) add(object, label);
      add(object.geometry, `${label}.geometry`);
      for (const material of [object.material].flat()) add(material, `${label}.material`);
    });
  }
  return resources;
}

function fixture(t) {
  const scene = new THREE.Scene();
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let train;
  try {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement(tag) {
          assert.equal(tag, 'canvas');
          return {
            getContext(kind) {
              assert.equal(kind, '2d');
              return {
                createRadialGradient: () => ({ addColorStop() {} }),
                fillRect() {},
              };
            },
          };
        },
      },
    });
    train = new Train(scene);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
  }
  const disposed = new Set();
  t.after(() => {
    for (const resource of resourcesOf(train, scene).keys()) {
      if (!disposed.has(resource)) resource.dispose();
    }
    scene.clear();
  });
  const player = new Player(train, scene);
  const rig = new CameraRig(new THREE.PerspectiveCamera(42, 1, 0.1, 6000), train, player);
  const calls = { prompts: [], hidden: 0, toasts: [], lines: [], visits: 0, chimes: [], tend: [], water: [] };
  const ui = {
    isTouch: false,
    showPrompt: (...args) => calls.prompts.push(args),
    hidePrompt: () => calls.hidden++,
    toast: (...args) => calls.toasts.push(args),
    setReadingLine: (line) => calls.lines.push(line),
    firstCabVisit: () => calls.visits++,
  };
  const audio = {
    chime: (kind) => calls.chimes.push(kind),
    tendTick: (dt) => calls.tend.push(dt),
    waterTick: (dt) => calls.water.push(dt),
  };
  const interactions = new Interactions({ train, player, rig, ui, audio });
  return { scene, train, player, rig, calls, interactions, disposed };
}

const tending = [
  { id: 'engine', x: -0.8, level: 'deck', radius: 3.2, gauge: 'eff', rate: TUNING.serviceRate, tick: 'tend', sign: 1 },
  { id: 'plants', x: -12.4, level: 'deck', radius: 2.6, gauge: 'plants', rate: TUNING.waterRate, tick: 'water', sign: 1 },
  { id: 'tread', x: 16.6, level: 'under', radius: 5.2, gauge: 'wear', rate: TUNING.repairRate, tick: 'tend', sign: -1 },
  { id: 'tread2', x: -16.6, level: 'under', radius: 5.2, gauge: 'wear', rate: TUNING.repairRate, tick: 'tend', sign: -1 },
];

for (const station of tending) {
  test(`${station.id}: station coordinates, hold rate, completion and release`, (t) => {
    const { train, player, interactions, calls } = fixture(t);
    player.x = station.x;
    player.level = station.level;
    train.eff = train.plants = train.wear = 50;
    interactions.update(0.1, input([], ['KeyE']));
    assert.equal(interactions.activeStation.id, station.id);
    assert.equal(interactions.activeStation.x, station.x);
    assert.equal(interactions.activeStation.level, station.level);
    assert.equal(interactions.activeStation.radius, station.radius);
    assert.equal(train[station.gauge], 50, 'a tap without a hold does not tend');
    assert.equal(calls[station.tick].length, 0);

    interactions.update(0.1, input(['KeyE']));
    const expected = 50 + station.sign * station.rate * 0.1;
    near(train[station.gauge], expected, 'hold follows tuning');
    assert.deepEqual(calls[station.tick], [0.1]);
    near(calls.prompts.at(-1)[1], (station.sign > 0 ? expected : 100 - expected) / 100, 'progress');
    assert.equal(calls.prompts.at(-1)[3], true);
    for (const gauge of ['eff', 'plants', 'wear']) {
      if (gauge !== station.gauge) assert.equal(train[gauge], 50, `${gauge} is unaffected`);
    }
    interactions.update(0.1, input());
    assert.equal(train[station.gauge], expected, 'release stops tending');
    assert.equal(calls.prompts.at(-1)[3], false);

    interactions.update(10, input(['KeyE']));
    assert.equal(train[station.gauge], station.sign > 0 ? 100 : 0);
    assert.deepEqual(calls.chimes, ['done']);
    interactions.update(10, input(['KeyE']));
    assert.deepEqual(calls.chimes, ['done'], 'completion chimes only once');
    assert.deepEqual(calls[station.tick], [0.1, 10], 'full stations stop ticking');
    assert.deepEqual(calls.prompts.at(-1).slice(1), [null, true]);

    player.x = 6;
    interactions.update(0.1, input());
    assert.equal(interactions.activeStation, null);
    player.x = station.x;
    train[station.gauge] = 50;
    interactions.update(10, input(['KeyE']));
    assert.deepEqual(calls.chimes, ['done', 'done'], 'returning re-arms completion');
  });
}

test('station holds are rejected outside reach, on another storey, while climbing or camera-busy', (t) => {
  const { train, player, rig, interactions, calls } = fixture(t);
  for (const station of tending) {
    for (const state of [
      { x: station.x + station.radius + 0.001, level: station.level, climbing: false },
      { x: station.x, level: 'roof', climbing: false },
      { x: station.x, level: station.level, climbing: true },
    ]) {
      rig.mode = 'inhabit';
      Object.assign(player, state);
      train.eff = train.plants = train.wear = 50;
      interactions.update(0.1, input(['KeyE']));
      assert.deepEqual([train.eff, train.plants, train.wear], [50, 50, 50]);
    }
  }
  rig.mode = 'inhabit';
  Object.assign(player, { x: -0.8, level: 'deck', climbing: false });
  assert.equal(rig.enterMap(), true);
  interactions.update(0.1, input(['KeyE']));
  assert.equal(train.eff, 50);
  assert.deepEqual(calls.tend, []);
  assert.deepEqual(calls.water, []);
  assert.ok(calls.hidden > 0);
});

test('cab coordinates activate the cabin, map pause contract and hysteretic exit', (t) => {
  const { train, player, rig, interactions, calls, scene } = fixture(t);
  Object.assign(player, { x: 20.5, level: 'roof', y: LEVELS.roof });
  interactions.update(0.1, input());
  assert.equal(rig.mode, 'cabin');
  assert.equal(rig.busy, false, 'automatic cabin glide does not lock walking');
  player.syncDock(rig.mode);
  assert.equal(player.group.parent, train.cars[0].group);
  near(player.group.position.x, player.x - CAR_CENTERS[0], 'cab-local player X');
  interactions.update(0.1, input([], ['KeyE']));
  assert.equal(rig.transitionTarget, 'map');
  assert.equal(rig.mapEngaged, true);
  assert.deepEqual(calls.chimes, ['rise', 'rise']);
  rig.update(2, 2);
  assert.equal(rig.mode, 'map');
  assert.equal(rig.mapBlend, 1);
  interactions.update(0.1, input([], ['Escape']));
  assert.equal(rig.transitionTarget, 'cabin');
  assert.equal(rig.mapEngaged, true, 'planner remains engaged during its exit');
  rig.update(2, 4);
  assert.equal(rig.mode, 'cabin');
  assert.equal(rig.mapEngaged, false);
  player.x = CAB_FROM_X;
  interactions.update(0.1, input());
  assert.equal(rig.mode, 'cabin', 'doorway hysteresis retains cabin mode');
  player.x = CAB_FROM_X - 0.61;
  interactions.update(0.1, input());
  assert.equal(rig.mode, 'inhabit');
  player.syncDock(rig.mode);
  assert.equal(player.group.parent, scene);
  assert.equal(player.docked, null);
});

for (const spot of [
  { id: 'book', x: -20.2, car: 2, y: LEVELS.deck + 0.42, z: -0.55, exit: 'set the book down' },
  { id: 'rest', x: 20.1, car: 0, y: 2.5, z: -1.05, exit: 'rise from the bunk' },
]) {
  test(`${spot.id}: tap seats in the articulated car and exit restores walking`, (t) => {
    const { train, player, rig, interactions, calls, scene } = fixture(t);
    Object.assign(player, { x: spot.x, level: 'deck', y: LEVELS.deck });
    interactions.update(0.1, input(['KeyE']));
    assert.equal(interactions.activeStation.id, spot.id);
    assert.equal(interactions.activeStation.x, spot.x);
    assert.equal(interactions.activeStation.radius, 2.6);
    assert.equal(player.sitting, false, 'holding alone does not enter book mode');
    interactions.update(0.1, input([], ['KeyE']));
    assert.equal(rig.transitionTarget, 'book');
    assert.equal(rig.mapEngaged, false, 'resting does not pause the route');
    assert.equal(player.sitting, true);
    near(player.sitPose.x, spot.x, 'seat X');
    if (spot.id === 'book') near(train.chairX, spot.x, 'default chair coordinate');
    assert.deepEqual([player.sitPose.y, player.sitPose.z], [spot.y, spot.z]);
    assert.deepEqual(calls.chimes, ['soft']);
    assert.equal(calls.lines.length, 1);
    assert.ok(calls.lines[0].length > 0);
    player.update(3, input(['KeyD']), 3);
    player.syncDock(rig.mode);
    assert.equal(player.docked, spot.car);
    assert.equal(player.group.parent, train.cars[spot.car].group);
    assert.equal(player.moving, false);
    const local = player.group.position.clone();
    train.addWaypoint(250, 140);
    for (let i = 0; i < 100; i++) train.update(0.1, i * 0.1, []);
    assert.ok(train.distanceTraveled > 0);
    assert.deepEqual(player.group.position, local, 'seated pose stays rigid inside its car');
    const world = train.cars[spot.car].group.localToWorld(local.clone());
    assert.ok(world.distanceTo(player.group.getWorldPosition(new THREE.Vector3())) < 1e-8);
    rig.update(3, 3);
    interactions.update(0.1, input());
    assert.equal(calls.prompts.at(-1)[0], spot.exit);
    interactions.update(0.1, input([], [spot.id === 'book' ? 'KeyE' : 'Escape']));
    assert.equal(player.sitting, false);
    assert.equal(player.y, LEVELS.deck);
    assert.equal(rig.transitionTarget, 'inhabit');
    player.update(0.1, input(), 4);
    player.syncDock(rig.mode);
    assert.equal(player.group.parent, scene, 'standing undocks during the exit tween');
    const frame = train.frameAt(player.x);
    near(player.group.position.x, frame.x + player.z * Math.sin(frame.theta), 'free player world X');
    near(player.group.position.z, frame.z + player.z * Math.cos(frame.theta), 'free player world Z');
    rig.update(2, 5);
    assert.equal(rig.mode, 'inhabit');
    const x = player.x;
    player.update(0.1, input(['KeyD']), 5);
    assert.ok(player.x > x, 'walking resumes');
  });
}

test('focus fades only the occupied zone and book transitions restore opacity and depth writes', (t) => {
  const { train, rig } = fixture(t);
  const entries = [...Object.entries(train.zoneMats).map(([zone, mat]) => ({ zone, mat })), ...train.fadeMats];
  const ghost = (entry) => (train.fadeMats.includes(entry) ? 0 : 0.03);
  for (const zone of ['car0', 'car1', 'car2', 'cab']) {
    assert.ok(entries.some((entry) => entry.zone === zone), `${zone} has focus materials`);
    train.setFocus(zone, false, 3);
    for (const entry of entries) {
      near(entry.mat.opacity, entry.zone === zone ? ghost(entry) : 1, `${zone}/${entry.zone} opacity`);
      assert.equal(entry.mat.depthWrite, entry.zone !== zone);
      assert.equal(entry.mat.transparent, true);
    }
  }
  assert.equal(rig.enterBook(), true);
  train.setFocus('cab', rig.mode === 'book' || rig.transitionTarget === 'book', 3);
  for (const { mat } of entries) {
    near(mat.opacity, 1, 'book-entry opacity');
    assert.equal(mat.depthWrite, true);
  }
  rig.update(3, 3);
  assert.equal(rig.exitBook(), true);
  train.setFocus('car2', rig.mode === 'book' || rig.transitionTarget === 'book', 3);
  for (const { mat } of entries) near(mat.opacity, 1, 'opaque throughout book exit');
  rig.update(2, 5);
  train.setFocus('car2', rig.mode === 'book' || rig.transitionTarget === 'book', 3);
  for (const entry of entries) {
    near(entry.mat.opacity, entry.zone === 'car2' ? ghost(entry) : 1, 'inhabit focus restored');
    assert.equal(entry.mat.depthWrite, entry.zone !== 'car2');
  }
  for (const { source } of train.fadeMats) assert.equal(source.opacity, 1, 'shared source stays opaque');
});

test('route line, waypoint dots and train ring retain ground-plane Y and overlay ordering', (t) => {
  const { train } = fixture(t);
  train.reset({ x: 130, z: -60, heading: 0.4 });
  train.addWaypoint(180, 70);
  train.addWaypoint(260, -90);
  train.updateRouteDisplay(0.75, 1);
  const expected = [[train.pos.x, 0, train.pos.z], [180, 0, 70], [260, 0, -90]];
  assert.equal(train.routeLine.geometry.drawRange.count, expected.length);
  const positions = train.routeLine.geometry.attributes.position;
  for (let i = 1; i < expected.length; i++) {
    assert.deepEqual([positions.getX(i), positions.getY(i), positions.getZ(i)], expected[i].map(Math.fround));
  }
  // the line is drawn up to the train, never across it: it starts on the first leg, clear of the nose
  const lead = Math.hypot(positions.getX(0) - train.pos.x, positions.getZ(0) - train.pos.z);
  const leg = Math.hypot(180 - train.pos.x, 70 - train.pos.z);
  assert.equal(positions.getY(0), 0);
  assert.ok(lead > 24 && lead < leg);
  assert.ok(Math.abs(lead + Math.hypot(180 - positions.getX(0), 70 - positions.getZ(0)) - leg) < 1e-3);
  assert.equal(train.routeLine.renderOrder, 59);
  assert.equal(train.trainRing.renderOrder, 60);
  assert.equal(train.beacon.renderOrder, 61);
  assert.equal(train.trainRing.position.y, 0);
  assert.equal(train.trainRing.position.x, train.pos.x);
  assert.equal(train.trainRing.position.z, train.pos.z);
  for (let i = 0; i < train.route.length; i++) {
    assert.deepEqual(train.dots[i].position.toArray(), expected[i + 1]);
    assert.equal(train.dots[i].renderOrder, 60);
  }
  for (const object of [train.routeLine, train.trainRing, train.beacon, ...train.dots]) {
    assert.equal(object.material.depthTest, false);
    assert.equal(object.material.fog, false);
  }
  train.undoWaypoint();
  train.updateRouteDisplay(1, 2);
  assert.equal(train.dots[1].visible, false);
  train.clearRoute();
  train.updateRouteDisplay(1, 3);
  assert.equal(train.routeLine.geometry.drawRange.count, 1);
  assert.ok(train.dots.every((dot) => !dot.visible));
  train.updateRouteDisplay(0.02, 3);
  assert.equal(train.routeGroup.visible, false);
});

test('car groups follow distinct trail frames while wheels animate and smoke reuses its world-space pool', (t) => {
  const { train, scene } = fixture(t);
  assert.equal(train.cars.length, CAR_CENTERS.length);
  assert.equal(new Set(train.cars.map(({ group }) => group)).size, CAR_CENTERS.length);
  const parents = new Map();
  for (const [index, { group, offset }] of train.cars.entries()) {
    assert.equal(group.parent, scene);
    assert.equal(offset, TRAIN_HALF - CAR_CENTERS[index]);
    assert.equal(group.rotation.order, 'YXZ');
    group.traverse((object) => parents.set(object, object.parent));
    assert.equal(train.wheels.filter((wheel) => wheel.parent === group).length, 8);
  }
  const wheels = train.wheels.slice();
  const pool = train.smoke.slice();
  assert.ok(pool.length > 0);
  for (const puff of pool) {
    assert.equal(puff.sprite.parent, scene);
    assert.equal(puff.life, 0);
    assert.equal(puff.sprite.visible, false);
  }
  const spin = wheels.map((wheel) => wheel.rotation.z);
  train.update(0.1, 0.1, []);
  assert.deepEqual(wheels.map((wheel) => wheel.rotation.z), spin, 'resting wheels stay still');
  train.addWaypoint(260, 150);
  let articulated = false;
  for (let i = 0; i < 120; i++) {
    train.update(0.1, i * 0.1, []);
    articulated ||= Math.abs(train.cars[0].group.rotation.y - train.cars[2].group.rotation.y) > 0.001;
  }
  assert.ok(train.distanceTraveled > 0);
  for (const [index, { group }] of train.cars.entries()) {
    const frame = train.frameAt(CAR_CENTERS[index]);
    near(group.position.x, frame.x, 'car trail X');
    near(group.position.z, frame.z, 'car trail Z');
    near(group.rotation.y, frame.theta, 'car trail heading');
  }
  assert.equal(articulated, true, 'cars take distinct headings while passing through a turn');
  for (const [object, parent] of parents) assert.equal(object.parent, parent, 'articulated descendants retain ownership');
  assert.deepEqual(train.wheels, wheels);
  const delta = wheels[0].rotation.z - spin[0];
  assert.ok(delta < 0);
  wheels.forEach((wheel, i) => near(wheel.rotation.z - spin[i], delta, 'wheel spin remains synchronized'));
  assert.deepEqual(train.smoke, pool);
  assert.ok(pool.some((puff) => puff.life > 0 && puff.sprite.visible));

  train.paused = true;
  train.speed = 0;
  train.update(3, 20, []);
  assert.ok(pool.every((puff) => !puff.sprite.visible), 'puffs expire while stopped');
  train.paused = false;
  train.smokeTimer = 0;
  train.update(0.1, 20.1, []);
  const puff = pool.find((entry) => entry.life > 0);
  assert.ok(puff, 'expired pool entries are reused');
  const stack = train.cars[1].group.localToWorld(train.stackLocal.clone());
  near(puff.sprite.position.x, stack.x, 'smoke stack world X');
  near(puff.sprite.position.z, stack.z, 'smoke stack world Z');
  near(puff.sprite.position.y, stack.y + 0.1 * 2.4, 'smoke rises from articulated stack');
  const emitted = puff.sprite.position.clone();
  train.smokeTimer = 10;
  train.update(0.1, 20.2, []);
  near(puff.sprite.position.x, emitted.x, 'emitted puff does not ride the car');
  near(puff.sprite.position.z, emitted.z, 'emitted puff stays world-space');
});

test('engine room is enclosed, and its running gear follows speed, upkeep and wear', (t) => {
  const { train } = fixture(t);
  const engine = train.cars[1].group;
  const zones = [...Object.entries(train.zoneMats).map(([zone, mat]) => ({ zone, mat })), ...train.fadeMats];
  const fading = new Set(zones.filter(({ zone }) => zone === 'car1').map(({ mat }) => mat));
  let nearWalls = 0;
  engine.traverse((object) => { if (fading.has(object.material)) nearWalls++; });
  assert.ok(nearWalls >= 4, 'engine car has a see-through near wall, roof and trim');
  const bounds = new THREE.Box3();
  let stackTop = -Infinity;
  engine.updateMatrixWorld(true);
  engine.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || !object.geometry.attributes.position) return;
    bounds.setFromObject(object);
    const local = engine.worldToLocal(bounds.getCenter(new THREE.Vector3()));
    if (Math.hypot(local.x - train.stackLocal.x, local.z - train.stackLocal.z) < 0.05) stackTop = Math.max(stackTop, bounds.max.y);
  });
  assert.ok(Math.abs(stackTop - train.stackLocal.y) < 0.25, `smoke starts at the chimney mouth: ${stackTop}`);

  const still = [train.flywheel.rotation.z, train.piston.position.x, train.governor.rotation.y];
  train.update(0.1, 0.1, []);
  assert.deepEqual([train.flywheel.rotation.z, train.piston.position.x, train.governor.rotation.y], still, 'at rest nothing turns');
  const restSpread = train.governorArms[1].rotation.z;
  train.addWaypoint(260, 0);
  let minHead = Infinity, maxHead = -Infinity;
  for (let i = 0; i < 200; i++) {
    train.update(0.05, i * 0.05, []);
    minHead = Math.min(minHead, train.piston.position.x);
    maxHead = Math.max(maxHead, train.piston.position.x);
    assert.ok(train.pistonRod.scale.x > 0, 'piston rod never inverts');
  }
  assert.ok(train.flywheel.rotation.z < still[0], 'flywheel turns with travel');
  assert.ok(train.governor.rotation.y > still[2], 'governor spins with travel');
  assert.ok(train.governorArms[1].rotation.z > restSpread, 'governor balls fly out with speed');
  assert.ok(Math.abs(maxHead - minHead - 1) < 0.01, 'crosshead stroke is twice the crank throw');
  assert.equal(train.governorArms[0].rotation.z, -train.governorArms[1].rotation.z);

  const needle = () => [train.pressureNeedle.rotation.z, train.wearNeedle.rotation.z];
  train.eff = 100; train.wear = 0;
  train.paused = true;
  train.update(5, 20, []);
  const healthy = needle();
  train.eff = 10; train.wear = 90;
  train.update(5, 25, []);
  const tired = needle();
  assert.ok(tired[0] > healthy[0] + 3, 'pressure gauge falls with efficiency');
  assert.ok(tired[1] > healthy[1] + 3, 'running-gear gauge falls with tread wear');
});

test('train adds at most four nonshadow PointLights and no shadow-casting lights', (t) => {
  const { scene } = fixture(t);
  const lights = [];
  scene.traverse((object) => { if (object.isLight) lights.push(object); });
  const pointLights = lights.filter((light) => light.isPointLight);
  assert.ok(pointLights.length <= 4, `PointLight budget exceeded: ${pointLights.length}`);
  assert.ok(lights.every((light) => !light.castShadow), 'train lights must not introduce shadow passes');
});

for (const withWaypoints of [false, true]) {
  test(`dispose ${withWaypoints ? 'with waypoint dots' : 'fresh train'}: unique owned resources and all instance buffers`, (t) => {
    const { train, disposed } = fixture(t);
    if (withWaypoints) {
      train.addWaypoint(100, 20);
      train.addWaypoint(200, -40);
      train.updateRouteDisplay(1, 0);
      train.undoWaypoint();
      train.updateRouteDisplay(1, 1);
    }
    const resources = resourcesOf(train);
    const counts = new Map();
    const listeners = new Map();
    const buffers = new Map();
    const objects = WebGLObjects({ ARRAY_BUFFER: 34962 }, {
      get: (_object, geometry) => geometry,
      update() {},
    }, {
      update: (attribute) => buffers.set(attribute, 0),
      remove: (attribute) => buffers.set(attribute, (buffers.get(attribute) ?? 0) + 1),
    }, { render: { frame: 0 } });
    const instances = [...resources.keys()].filter((resource) => resource.isInstancedMesh);
    assert.ok(instances.length > 0, 'exercise instance-owned buffers, not only shared geometry');
    for (const instance of instances) objects.update(instance);
    assert.equal(buffers.size, instances.reduce((sum, mesh) => sum + 1 + Number(mesh.instanceColor !== null), 0));
    for (const resource of resources.keys()) {
      counts.set(resource, 0);
      const listener = () => {
        counts.set(resource, counts.get(resource) + 1);
        disposed.add(resource);
      };
      listeners.set(resource, listener);
      resource.addEventListener('dispose', listener);
    }
    try {
      train.dispose();
      const failures = [];
      for (const [resource, label] of resources) {
        if (counts.get(resource) !== 1) failures.push(`${label}: disposed ${counts.get(resource)} times (expected 1)`);
      }
      for (const instance of instances) {
        for (const key of ['instanceMatrix', 'instanceColor']) {
          if (instance[key] !== null && buffers.get(instance[key]) !== 1) {
            failures.push(`InstancedMesh#${instance.id}.${key}: buffer removed ${buffers.get(instance[key])} times (expected 1)`);
          }
        }
      }
      for (const root of [...train.cars.map(({ group }) => group), train.routeGroup, ...train.smoke.map(({ sprite }) => sprite)]) {
        if (root.parent !== null) failures.push(`${root.type}#${root.id}: still attached after disposal`);
      }
      assert.deepEqual(failures, [], failures.join('\n'));
    } finally {
      for (const [resource, listener] of listeners) resource.removeEventListener('dispose', listener);
      objects.dispose();
    }
  });
}
