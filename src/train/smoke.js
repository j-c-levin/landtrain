import * as THREE from 'three';
import { TUNING, lerp } from '../constants.js';
import { TRAIN_LOOK, skyMaterials } from '../look.js';
import { hash } from './parts.js';

// [x, y, radius, in shade] lobes of one cotton-wool puff, belly first
const LOBES = [
  [64, 80, 32, 1], [38, 74, 23, 1], [92, 76, 24, 1], [26, 60, 13, 1],
  [50, 54, 27, 0], [80, 52, 26, 0], [64, 38, 22, 0], [102, 58, 14, 0],
];

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  for (const [x, y, r, shade] of LOBES) {
    const rgb = shade ? TRAIN_LOOK.smoke.belly : TRAIN_LOOK.smoke.lit;
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.15, x, y, r);
    g.addColorStop(0, `rgba(${rgb},0.96)`);
    g.addColorStop(0.72, `rgba(${rgb},0.92)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Returns the puff pool's fields; the train holds them and passes itself back to updateSmoke.
export function createSmoke(scene) {
  const tex = puffTexture();
  const smoke = [];
  for (let i = 0; i < 24; i++) {
    const sprite = new THREE.Sprite(skyMaterials.smoke(tex));
    sprite.material.rotation = (hash(i + 3) - 0.5) * 1.4;
    sprite.visible = false;
    scene.add(sprite);
    smoke.push({ sprite, life: 0, max: 2.4, size: 0.75 + hash(i) * 0.6, turn: (hash(i + 9) - 0.5) * 0.5 });
  }
  return { smoke, smokeTimer: 0 };
}

export function updateSmoke(state, dt, speed, emitterWorldPos) {
  state.smokeTimer -= dt;
  const speed01 = speed / TUNING.baseSpeed;
  if (state.smokeTimer <= 0 && speed > 0.4) {
    state.smokeTimer = lerp(0.6, 0.24, speed01);
    const puff = state.smoke.find((s) => s.life <= 0);
    if (puff) {
      puff.life = puff.max;
      puff.sprite.position.copy(emitterWorldPos());
      puff.sprite.visible = true;
    }
  }
  for (const s of state.smoke) {
    if (s.life <= 0) continue;
    s.life -= dt;
    const t = 1 - s.life / s.max;
    const swell = 1 - (1 - t) * (1 - t);
    s.sprite.position.y += dt * 2.4;
    s.sprite.scale.setScalar(lerp(0.9, 4.2, swell) * s.size);
    s.sprite.material.rotation += s.turn * dt;
    s.sprite.material.opacity = 0.82 * Math.min(1, (1 - t) * 1.8);
    if (s.life <= 0) s.sprite.visible = false;
  }
}
