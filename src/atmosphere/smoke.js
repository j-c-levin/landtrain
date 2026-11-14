import * as THREE from 'three';
import { TUNING, lerp } from '../constants.js';
import { SKY_LOOK, skyMaterials, softDiscTexture } from '../look.js';

// Returns the puff pool's fields; the owner (the train) holds them and passes
// itself back to updateSmoke.
export function createSmoke(scene) {
  const tex = softDiscTexture(...SKY_LOOK.smoke);
  const smoke = [];
  for (let i = 0; i < 36; i++) {
    const s = new THREE.Sprite(skyMaterials.smoke(tex));
    s.visible = false;
    scene.add(s);
    smoke.push({ sprite: s, life: 0, max: 2.4 });
  }
  return { smoke, smokeTimer: 0 };
}

export function updateSmoke(state, dt, speed, emitterWorldPos) {
  state.smokeTimer -= dt;
  const speed01 = speed / TUNING.baseSpeed;
  if (state.smokeTimer <= 0 && speed > 0.4) {
    state.smokeTimer = lerp(0.5, 0.13, speed01);
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
    s.sprite.position.y += dt * 2.4;
    s.sprite.scale.setScalar(lerp(1.4, 6.5, t));
    s.sprite.material.opacity = 0.5 * (1 - t);
    if (s.life <= 0) s.sprite.visible = false;
  }
}
