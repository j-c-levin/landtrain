import * as THREE from 'three';
import { CAR_CENTERS, LEVELS, damp } from '../constants.js';
import { STATIONS } from '../train/stations.js';

const W = 0.4;
const H = 0.6;
const INK = '#4a3024';
const carOf = (x) => (x > 8.3 ? 0 : x < -8.3 ? 2 : 1);

// [x, height of the tag's top above its storey, z]
const HANG = {
  cab: [19.71, 2.36, -1.02],
  engine: [-0.8, 2.85, 0.35],
  plants: [-12.4, 2.85, 0.35],
  book: [-20.2, 2.85, 0.35],
  rest: [20.1, 2.85, 0.35],
  tread: [16.6, 1.5, 2.95],
  tread2: [-16.6, 1.5, 2.95],
};

const GLYPH = {
  cab(c) {
    c.beginPath();
    c.arc(0, 0, 17, 0, 7);
    c.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
      c.stroke();
    }
    c.beginPath();
    c.arc(0, 0, 6, 0, 7);
    c.fill();
  },
  engine(c) {
    c.beginPath();
    c.moveTo(0, -27);
    c.bezierCurveTo(24, -4, 22, 24, 0, 25);
    c.bezierCurveTo(-22, 24, -20, 2, -9, -8);
    c.bezierCurveTo(-7, 0, -2, 0, -1, -6);
    c.bezierCurveTo(1, -14, -3, -20, 0, -27);
    c.fill();
  },
  plants(c) {
    c.beginPath();
    c.moveTo(0, 26);
    c.lineTo(0, -4);
    c.stroke();
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, 4);
      c.bezierCurveTo(s * 6, -22, s * 26, -22, s * 26, -24);
      c.bezierCurveTo(s * 28, -2, s * 12, 6, 0, 4);
      c.fill();
    }
  },
  book(c) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, -14);
      c.quadraticCurveTo(s * 13, -22, s * 26, -16);
      c.lineTo(s * 26, 16);
      c.quadraticCurveTo(s * 13, 10, 0, 18);
      c.closePath();
      c.stroke();
    }
  },
  rest(c) {
    c.beginPath();
    c.arc(0, 0, 23, 0.9, 5.4);
    c.bezierCurveTo(4, -8, 4, 8, 14.3, 18);
    c.fill();
  },
  tread(c) {
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i * Math.PI) / 4);
      c.fillRect(-5, -27, 10, 12);
      c.restore();
    }
    c.lineWidth = 9;
    c.beginPath();
    c.arc(0, 0, 14, 0, 7);
    c.stroke();
  },
};
GLYPH.tread2 = GLYPH.tread;

function tagTexture(id) {
  const canvas = globalThis.document?.createElement?.('canvas');
  const c = canvas?.getContext?.('2d');
  if (!c) return null;
  canvas.width = 96;
  canvas.height = 144;
  c.lineJoin = c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(48, 0);
  c.lineTo(48, 34);
  c.stroke();
  c.beginPath();
  c.moveTo(30, 24);
  c.lineTo(66, 24);
  c.lineTo(88, 46);
  c.lineTo(88, 128);
  c.quadraticCurveTo(88, 138, 78, 138);
  c.lineTo(18, 138);
  c.quadraticCurveTo(8, 138, 8, 128);
  c.lineTo(8, 46);
  c.closePath();
  c.fillStyle = '#f7ecd0';
  c.fill();
  c.lineWidth = 7;
  c.strokeStyle = '#c98f2e';
  c.stroke();
  c.fillStyle = '#c98f2e';
  c.beginPath();
  c.arc(48, 40, 8, 0, 7);
  c.fill();
  c.fillStyle = INK;
  c.beginPath();
  c.arc(48, 40, 3.5, 0, 7);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 5;
  c.translate(48, 92);
  GLYPH[id](c);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A paper luggage tag hangs over everything that answers to E; it swells with how much the station wants tending.
export class Affordances {
  constructor(train, camera) {
    this.train = train;
    this.camera = camera;
    this.time = 0;
    const geometry = new THREE.PlaneGeometry(W, H).translate(0, -H / 2, 0);
    this.tags = STATIONS.map((station) => {
      const map = tagTexture(station.id);
      const material = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0xf7ecd0, alphaTest: 0.5, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(0.001);
      mesh.visible = false;
      train.scene.add(mesh);
      const [x, up, z] = HANG[station.id];
      const car = train.cars[carOf(x)].group;
      return { station, mesh, car, x: x - CAR_CENTERS[carOf(x)], y: LEVELS[station.level] + up, z, size: 0, push: 0 };
    });
  }

  #need(id) {
    const t = this.train;
    if (id === 'engine') return t.eff >= 99.5 ? -1 : 1 - t.eff / 100;
    if (id === 'plants') return t.plants >= 99.5 ? -1 : 1 - t.plants / 100;
    if (id === 'tread' || id === 'tread2') return t.wear <= 0.5 ? -1 : t.wear / 100;
    return 0.25;
  }

  update(dt, shown, active, player) {
    this.time += dt;
    const eye = this.camera.position;
    for (let i = 0; i < this.tags.length; i++) {
      const tag = this.tags[i];
      const { station, mesh } = tag;
      const need = this.#need(station.id);
      const here = station === active;
      const near = station.level === player.level || need > 0.5;
      const want = !shown || need < 0 || !near ? 0 : (0.8 + need * 0.5) * (here ? 1.3 : 1);
      tag.size = damp(tag.size, want, 8, dt);
      mesh.visible = tag.size > 0.02;
      if (!mesh.visible) continue;
      let push = 0;
      if (station.level === 'under' && player.level === 'under') {
        const dx = station.x - player.x;
        if (Math.abs(dx) < 1.3) push = (dx < 0 ? -1 : 1) * (1.3 - Math.abs(dx));
      }
      tag.push = damp(tag.push, push, 6, dt);
      const beat = this.time * (here ? 4.2 : 1.6) + i * 1.9;
      mesh.scale.setScalar(tag.size);
      mesh.position.set(tag.x + tag.push, tag.y + (here ? Math.abs(Math.sin(beat)) * 0.08 : 0), tag.z).applyMatrix4(tag.car.matrixWorld);
      mesh.rotation.set(0, Math.atan2(eye.x - mesh.position.x, eye.z - mesh.position.z), Math.sin(beat * (here ? 0.5 : 1)) * (here ? 0.2 : 0.11));
    }
  }
}
