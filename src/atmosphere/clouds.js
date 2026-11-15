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
  scratch.height = 160 * scale;
  const sc = scratch.getContext('2d');
  const floor = scratch.height - 16 * scale;
  const pad = 80 * scale;

  const BANKS = 34;
  const banks = [];
  for (let b = 0; b < BANKS; b++) {
    const near = Math.pow(rand(), 1.5);
    banks.push({ near, x: (b + rand() * 0.9) / BANKS, w: rand(), h: rand(), kind: rand() });
  }
  banks.sort((p, q) => p.near - q.near);
  const blob = (x, y, r) => {
    const g = sc.createLinearGradient(0, y - r, 0, y + r * 0.9);
    g.addColorStop(0, 'rgb(255,255,0)');
    g.addColorStop(0.45, 'rgb(255,215,0)');
    g.addColorStop(1, 'rgb(255,60,0)');
    sc.fillStyle = g;
    sc.beginPath();
    sc.arc(x, y, r, 0, Math.PI * 2);
    sc.fill();
  };
  for (const bank of banks) {
    const shelf = bank.kind < 0.26;
    const tower = bank.kind > 0.68;
    const tuft = !shelf && !tower && bank.kind < 0.42;
    const reach = 0.5 + bank.near * 0.7;
    let width = (56 + bank.w * 104) * reach * scale;
    let height = width * (0.3 + bank.h * 0.2);
    if (shelf) { width *= 1.5; height *= 0.42; }
    if (tuft) { width *= 0.5; height *= 0.8; }
    width = Math.min(width, 250 * scale);
    height = Math.min(height, (tower ? 62 : 46) * scale);
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, scratch.width, scratch.height);
    const puffs = tuft ? 3 : shelf ? 7 + Math.floor(rand() * 4) : 4 + Math.floor(rand() * 4);
    const lean = 0.3 + rand() * 0.4;
    const order = [];
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1);
      const arch = Math.pow(Math.sin(Math.pow(t, lean < 0.5 ? 0.7 : 1.4) * Math.PI), 0.8);
      const r = height * (shelf ? 0.5 + rand() * 0.5 : 0.3 + arch * 0.42 * (0.6 + rand() * 0.6));
      order.push({ r, x: pad + t * width + (rand() - 0.5) * width * 0.12, y: floor - r * (0.45 + rand() * 0.3) - arch * rand() * height * 0.25 });
    }
    if (tower) {
      const cx = pad + width * lean;
      const lobes = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < lobes; i++) {
        const up = (i + 1) / lobes;
        const r = height * (0.42 - up * 0.14);
        order.push({ r, x: cx + (rand() - 0.5) * width * 0.16, y: floor - height * (0.45 + up * 0.5) + r * 0.3 });
      }
    }
    order.sort((p, q) => p.y - q.y);
    for (const { x, y, r } of order) blob(x, y, r);
    sc.globalCompositeOperation = 'source-atop';
    const belly = sc.createLinearGradient(0, floor - height * 0.7, 0, floor);
    belly.addColorStop(0, 'rgba(255,0,0,0)');
    belly.addColorStop(1, 'rgba(255,0,0,0.6)');
    sc.fillStyle = belly;
    sc.fillRect(0, 0, scratch.width, scratch.height);
    sc.globalCompositeOperation = 'destination-out';
    sc.fillStyle = '#000';
    sc.beginPath();
    sc.moveTo(0, scratch.height);
    sc.lineTo(0, floor);
    const sag = (shelf ? 1.5 : 4) * scale;
    const step = (18 + rand() * 16) * scale;
    for (let x = 0, up = rand() < 0.5; x < scratch.width; x += step, up = !up) {
      sc.quadraticCurveTo(x + step * 0.5, floor + (up ? -sag : sag) * (0.4 + rand() * 0.6), x + step, floor + (rand() - 0.5) * sag * 0.5);
    }
    sc.lineTo(scratch.width, scratch.height);
    sc.fill();
    const x = bank.x * W - pad;
    const y = H * (0.86 - bank.near * 0.36) - floor;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch, x, y);
    ctx.drawImage(scratch, x - W, y);
    ctx.drawImage(scratch, x + W, y);
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
