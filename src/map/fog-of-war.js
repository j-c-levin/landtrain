import * as THREE from 'three';
import { WORLD, TUNING } from '../constants.js';
import { MAP_LOOK, mapMaterials } from '../look.js';

// Fog of war: an opaque dark canvas stretched over the whole world on a
// plane at y=60 (between the overhead camera and the ground). Travel
// punches soft radial holes with destination-out compositing — revealed
// ground is permanently known.
const MARGIN = 600;
const CELL = 20;

export class FogOfWar {
  constructor(scene) {
    this.scale = 0.4; // canvas px per world unit
    const w = WORLD.maxX - WORLD.minX;
    const h = WORLD.maxZ - WORLD.minZ;

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * this.scale);
    this.canvas.height = Math.round(h * this.scale);
    this.ctx = this.canvas.getContext('2d');

    this.cols = Math.ceil(w / CELL);
    this.rows = Math.ceil(h / CELL);
    this.known = new Uint8Array(this.cols * this.rows);

    this.#shroud();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = mapMaterials.shroud(this.texture, new THREE.Vector4(WORLD.minX, WORLD.minZ, 1 / w, 1 / h));

    // y=75 clears the tallest undiscovered ridge rocks (~55) so nothing
    // pokes up through the shroud; only the Great Tree (the destination,
    // deliberately visible) rises past it.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + MARGIN * 2, h + MARGIN * 2), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set((WORLD.minX + WORLD.maxX) / 2, 75, (WORLD.minZ + WORLD.maxZ) / 2);
    this.mesh.renderOrder = 50;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.depthMesh = new THREE.Mesh(this.mesh.geometry, mapMaterials.sheetDepth(this.texture, this.material.uniforms.uRect.value, this.material.uniforms.uGrow));
    this.depthMesh.rotation.copy(this.mesh.rotation);
    this.depthMesh.position.copy(this.mesh.position);
    this.depthMesh.renderOrder = 49;
    this.depthMesh.visible = false;
    scene.add(this.depthMesh);
  }

  // Fill the canvas fully opaque; the shroud shader reads only its alpha.
  #shroud() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = MAP_LOOK.shroud;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.known.fill(0);
  }

  // Coarse record of the same reveals, for questions the canvas is too slow to answer.
  isKnown(wx, wz) {
    const cx = Math.floor((wx - WORLD.minX) / CELL);
    const cz = Math.floor((wz - WORLD.minZ) / CELL);
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows && this.known[cz * this.cols + cx] === 1;
  }

  // Re-shroud everything when entering a fresh biome.
  reset() {
    this.#shroud();
    this.texture.needsUpdate = true;
  }

  // Paint one soft radial hole (world space). Caller manages texture.needsUpdate.
  #stamp(wx, wz, radius) {
    const cx = (wx - WORLD.minX) * this.scale;
    const cy = (wz - WORLD.minZ) * this.scale;
    const r = radius * this.scale;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const reach = radius * 0.7;
    const x0 = Math.max(0, Math.floor((wx - reach - WORLD.minX) / CELL));
    const x1 = Math.min(this.cols - 1, Math.floor((wx + reach - WORLD.minX) / CELL));
    const z0 = Math.max(0, Math.floor((wz - reach - WORLD.minZ) / CELL));
    const z1 = Math.min(this.rows - 1, Math.floor((wz + reach - WORLD.minZ) / CELL));
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = WORLD.minX + (cx + 0.5) * CELL - wx;
        const dz = WORLD.minZ + (cz + 0.5) * CELL - wz;
        if (dx * dx + dz * dz <= reach * reach) this.known[cz * this.cols + cx] = 1;
      }
    }
  }

  reveal(wx, wz, radius) {
    this.#stamp(wx, wz, radius);
    this.texture.needsUpdate = true;
  }

  // Reveal a forward-fanning cone plus the lateral side circle. (dirX, dirZ)
  // is the (not necessarily normalized) heading; if it's ~zero we fall back to
  // a plain circle. The cone is narrow at the train and widest at the far end:
  // overlapping soft stamps grow from nearR to endR over `steps` along heading.
  revealCone(wx, wz, dirX, dirZ, sideRadius, forwardLen, endR, nearR, steps) {
    this.#stamp(wx, wz, sideRadius); // lateral/near vision, unchanged feel
    const len = Math.hypot(dirX, dirZ);
    if (len > 1e-4) {
      const ux = dirX / len;
      const uz = dirZ / len;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = wx + ux * forwardLen * t;
        const pz = wz + uz * forwardLen * t;
        const r = nearR + (endR - nearR) * t;
        this.#stamp(px, pz, r);
      }
    }
    this.texture.needsUpdate = true;
  }

  // blend: 0 = inhabit view (hidden), 1 = fully in map view. The shroud
  // reaches full opacity within the first third of the camera's climb —
  // before the scene's distance fog opens — so undiscovered terrain is
  // never glimpsed mid-transition.
  setBlend(blend) {
    this.material.uniforms.uOpacity.value = Math.min(1, blend / 0.35) * TUNING.fogOpacity;
    const t = Math.min(1, Math.max(0, (blend - 0.35) / 0.65));
    this.material.uniforms.uGrow.value = 0.2 * (1 - t * t * (3 - 2 * t));
    this.mesh.visible = blend > 0.01;
    this.depthMesh.visible = blend > 0.25;
  }

  setNight(night) {
    this.material.uniforms.uNight.value = night;
  }
}
