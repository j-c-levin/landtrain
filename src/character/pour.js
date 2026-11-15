import * as THREE from 'three';

const DROPS = 12;
const TRAVEL = 0.42;

// Droplets ride one arc from the rose to the soil, so the water always lands where it is aimed.
export class Pour {
  constructor(scene, material) {
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.clock = 0;
    this.since = 0;
    this.ebb = 1;
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    this.group = new THREE.Group();
    this.group.visible = false;
    this.drops = [];
    for (let i = 0; i < DROPS + 3; i++) {
      const drop = new THREE.Mesh(geometry, material);
      this.group.add(drop);
      this.drops.push(drop);
    }
    scene.add(this.group);
  }

  update(dt, flowing) {
    this.clock += dt;
    if (flowing) {
      this.since += dt;
      this.ebb = 0;
    } else {
      this.since = 0;
      this.ebb += dt;
    }
    const head = flowing ? this.since / TRAVEL : 1;
    const tail = flowing ? 0 : this.ebb / TRAVEL;
    this.group.visible = tail < 1.3;
    if (!this.group.visible) return;
    const { from, to, drops } = this;
    const drop = from.y - to.y;
    for (let i = 0; i < DROPS; i++) {
      const u = (i / DROPS + this.clock / TRAVEL) % 1;
      const mesh = drops[i];
      mesh.visible = u < head && u > tail;
      if (!mesh.visible) continue;
      const fan = Math.sin(i * 2.4) * 0.05 * u;
      const size = 0.02 + 0.009 * Math.sin(i * 1.7 + 1) + u * 0.008;
      mesh.position.set(
        from.x + (to.x - from.x) * u + fan,
        from.y + 0.34 * u - (drop + 0.34) * u * u,
        from.z + (to.z - from.z) * u + Math.cos(i * 2.4) * 0.04 * u
      );
      mesh.scale.set(size, size * (1.4 + u), size);
    }
    for (let i = 0; i < 3; i++) {
      const mesh = drops[DROPS + i];
      const u = (this.clock * 3.1 + i / 3) % 1;
      mesh.visible = head > 1 && tail < 1;
      if (!mesh.visible) continue;
      const a = i * 2.1 + Math.floor(this.clock * 3.1 + i / 3) * 1.3;
      const size = 0.026 * (1 - u);
      mesh.position.set(to.x + Math.cos(a) * 0.13 * u, to.y + Math.sin(u * Math.PI) * 0.1, to.z + Math.sin(a) * 0.13 * u);
      mesh.scale.setScalar(size);
    }
  }
}
