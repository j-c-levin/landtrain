import * as THREE from 'three';
import { SKY_LOOK } from '../look.js';

// A studio sky for reflections: cool zenith, warm horizon, ground bounce and
// one soft box standing in for the sun. It is what lets enamel shine and brass
// read as metal; SkyCycle scales its intensity through the day.
export function createEnvironment(renderer, scene) {
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3();
  const softbox = new THREE.Vector3(-0.45, 0.62, 0.55).normalize();
  const { envZenith: Z, envHorizon: H, envGround: G, envSoftbox: S } = SKY_LOOK;
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const up = Math.max(0, dir.y);
    const down = Math.max(0, -dir.y);
    const sky = Math.pow(up, 0.55);
    const ground = Math.min(1, down * 4);
    const box = Math.pow(Math.max(0, dir.dot(softbox)), 26);
    for (let c = 0; c < 3; c++) {
      const base = H[c] + (Z[c] - H[c]) * sky;
      col[i * 3 + c] = base + (G[c] - base) * ground + S[c] * box;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false });
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.03);
  scene.environment = target.texture;
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return target;
}
