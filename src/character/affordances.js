import * as THREE from 'three';
import { CAR_CENTERS, LEVELS, damp } from '../constants.js';
import { STATIONS } from '../train/stations.js';

const HOVER = { deck: [2.4, 0.35], roof: [2.4, 0.35], under: [0.7, 2.95] };
const carOf = (x) => (x > 8.3 ? 0 : x < -8.3 ? 2 : 1);

// A brass pip hovers over everything that answers to E; it swells with how much the station wants tending.
export class Affordances {
  constructor(train, material) {
    this.train = train;
    this.time = 0;
    const geometry = new THREE.OctahedronGeometry(0.16);
    this.pips = STATIONS.map((station) => {
      const mesh = new THREE.Mesh(geometry, material);
      const [up, z] = HOVER[station.level];
      mesh.scale.setScalar(0.001);
      mesh.visible = false;
      train.scene.add(mesh);
      const car = train.cars[carOf(station.x)].group;
      return { station, mesh, car, x: station.x - CAR_CENTERS[carOf(station.x)], y: LEVELS[station.level] + up, z, size: 0 };
    });
  }

  #need(id) {
    const t = this.train;
    if (id === 'engine') return t.eff >= 99.5 ? -1 : 1 - t.eff / 100;
    if (id === 'plants') return t.plants >= 99.5 ? -1 : 1 - t.plants / 100;
    if (id === 'tread' || id === 'tread2') return t.wear <= 0.5 ? -1 : t.wear / 100;
    return 0.25;
  }

  update(dt, shown, active, level) {
    this.time += dt;
    for (let i = 0; i < this.pips.length; i++) {
      const pip = this.pips[i];
      const need = this.#need(pip.station.id);
      const here = pip.station === active;
      const near = pip.station.level === level || need > 0.5;
      const want = !shown || need < 0 || !near ? 0 : (0.7 + need * 0.7) * (here ? 1.45 : 1);
      pip.size = damp(pip.size, want, 8, dt);
      pip.mesh.visible = pip.size > 0.02;
      if (!pip.mesh.visible) continue;
      const beat = this.time * (here ? 5 : 2.2) + i;
      pip.mesh.scale.set(pip.size * 0.72, pip.size, pip.size * 0.72);
      pip.mesh.position.set(pip.x, pip.y + Math.sin(beat) * (here ? 0.09 : 0.04), pip.z).applyMatrix4(pip.car.matrixWorld);
      pip.mesh.rotation.y = this.time * 1.4 + i;
    }
  }
}
