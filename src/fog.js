import * as THREE from 'three';
import { WORLD, TUNING } from './constants.js';

// Fog of war: an opaque dark canvas stretched over the whole world on a
// plane at y=60 (between the overhead camera and the ground). Travel
// punches soft radial holes with destination-out compositing — revealed
// ground is permanently known.
export class FogOfWar {
  constructor(scene) {
    this.scale = 0.4; // canvas px per world unit
    const w = WORLD.maxX - WORLD.minX;
    const h = WORLD.maxZ - WORLD.minZ;

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * this.scale);
    this.canvas.height = Math.round(h * this.scale);
    this.ctx = this.canvas.getContext('2d');

    // warm-dark plum, with faint wandering blotches so the unknown has texture
    this.ctx.fillStyle = '#221a30';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = 'rgba(58,44,72,0.35)';
    let sx = 12345;
    const rnd = () => ((sx = (sx * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 130; i++) {
      this.ctx.beginPath();
      this.ctx.ellipse(
        rnd() * this.canvas.width,
        rnd() * this.canvas.height,
        8 + rnd() * 36,
        6 + rnd() * 24,
        rnd() * Math.PI,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });

    // y=75 clears the tallest undiscovered ridge rocks (~55) so nothing
    // pokes up through the shroud; only the Great Tree (the destination,
    // deliberately visible) rises past it.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set((WORLD.minX + WORLD.maxX) / 2, 75, (WORLD.minZ + WORLD.maxZ) / 2);
    this.mesh.renderOrder = 50;
    this.mesh.visible = false;
    scene.add(this.mesh);
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
    this.material.opacity = Math.min(1, blend / 0.35) * TUNING.fogOpacity;
    this.mesh.visible = blend > 0.01;
  }
}
