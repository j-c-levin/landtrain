import * as THREE from 'three';

// One seeded panorama wrapped round the dome, 28 degrees tall and square in
// angle. R: cumulus cover, G: how lit each puff is (top bright, belly dull),
// B: high wisps. The dome shader steps and tints it.
export function cloudPanorama(rand, scale = 1) {
  const W = 4096 * scale;
  const H = 320 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const scratch = document.createElement('canvas');
  scratch.width = 420 * scale;
  scratch.height = 150 * scale;
  const sc = scratch.getContext('2d');
  const floor = scratch.height - 16 * scale;
  const pad = 80 * scale;

  const banks = [];
  for (let b = 0; b < 30; b++) banks.push({ depth: Math.pow(rand(), 0.75), x: rand(), w: rand(), h: rand(), seed: rand() });
  banks.sort((p, q) => p.depth - q.depth);
  for (const bank of banks) {
    const width = (46 + bank.w * 110) * (0.5 + bank.depth * 0.75) * scale;
    const height = Math.min(width * (0.3 + bank.h * 0.22), 62 * scale);
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, scratch.width, scratch.height);
    const puffs = 5 + Math.floor(rand() * 5);
    const order = [];
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1);
      const arch = Math.sin(t * Math.PI);
      const r = height * (0.3 + arch * 0.5 * (0.6 + rand() * 0.6));
      order.push({
        r,
        x: pad + t * width + (rand() - 0.5) * width * 0.1,
        y: floor - r * 0.6 - arch * rand() * height * 0.3,
      });
    }
    order.sort((p, q) => p.y - q.y);
    for (const { x, y, r } of order) {
      const g = sc.createRadialGradient(x, y - r * 0.45, r * 0.15, x, y, r);
      g.addColorStop(0, 'rgb(255,255,0)');
      g.addColorStop(0.55, 'rgb(255,200,0)');
      g.addColorStop(1, 'rgb(255,70,0)');
      sc.fillStyle = g;
      sc.beginPath();
      sc.arc(x, y, r, 0, Math.PI * 2);
      sc.fill();
    }
    sc.globalCompositeOperation = 'source-atop';
    const belly = sc.createLinearGradient(0, floor - height * 0.7, 0, floor);
    belly.addColorStop(0, 'rgba(255,0,0,0)');
    belly.addColorStop(1, 'rgba(255,0,0,0.85)');
    sc.fillStyle = belly;
    sc.fillRect(0, 0, scratch.width, scratch.height);
    sc.globalCompositeOperation = 'destination-out';
    sc.fillStyle = '#000';
    sc.fillRect(0, floor, scratch.width, scratch.height);
    const x = bank.x * W;
    const y = H * (0.9 - bank.depth * 0.6) - floor;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch, x, y);
    ctx.drawImage(scratch, x - W, y);
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i++) {
    const x = rand() * W;
    const y = H * (0.1 + rand() * 0.8);
    const tilt = (rand() - 0.5) * 0.24;
    const strands = 3 + Math.floor(rand() * 4);
    for (let s = 0; s < strands; s++) {
      const len = (80 + rand() * 200) * scale;
      const ox = (rand() - 0.5) * 150 * scale;
      const oy = (rand() - 0.5) * 26 * scale;
      const turn = tilt + (rand() - 0.5) * 0.08;
      const thin = 0.035 + rand() * 0.04;
      for (const wrap of [0, -W]) {
        ctx.save();
        ctx.translate(x + ox + wrap, y + oy);
        ctx.rotate(turn);
        ctx.scale(1, thin);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
        g.addColorStop(0, 'rgba(0,0,255,0.45)');
        g.addColorStop(1, 'rgba(0,0,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-len, -len, len * 2, len * 2);
        ctx.restore();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Tileable two-octave value noise for the galaxy's mottle and the moon's seas.
export function mottleTexture(rand) {
  const N = 128;
  const lattice = (n) => Float32Array.from({ length: n * n }, () => rand());
  const octaves = [[8, lattice(8), 0.65], [24, lattice(24), 0.35]];
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const [n, grid, gain] of octaves) {
        const fx = (x / N) * n;
        const fy = (y / N) * n;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const at = (i, j) => grid[(j % n) * n + (i % n)];
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        v += (top + (bottom - top) * sy) * gain;
      }
      const o = (y * N + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.round(v * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
