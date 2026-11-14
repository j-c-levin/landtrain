import * as THREE from 'three';

// A tileable water-ripple NORMAL map. Heights come from a few integer-frequency
// sine waves (periodic over the tile, so it repeats seamlessly); the per-pixel
// gradient becomes the surface normal. Tiled to ~square world cells (see the
// repeat() calls below) so ripples stay round instead of smearing down the long
// thin channel, and scrolled in update() to suggest flow. This is the standard
// three.js water trick — scroll a tiling normal map over a flat surface (what
// THREE.Water does, minus the planar reflections).
export function waterNormalTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const TAU = Math.PI * 2;
  // periodic wave components — integer (fx, fy) guarantees a seamless tile
  const waves = [
    { fx: 1, fy: 2, a: 1.0, p: 0.0 },
    { fx: 2, fy: -1, a: 0.7, p: 1.7 },
    { fx: 3, fy: 2, a: 0.5, p: 3.1 },
    { fx: -2, fy: 3, a: 0.4, p: 0.6 },
    { fx: 4, fy: -3, a: 0.3, p: 4.4 },
    { fx: -1, fy: 4, a: 0.25, p: 2.2 },
  ];
  const height = (x, y) => {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin((TAU * (w.fx * x + w.fy * y)) / S + w.p);
    return h;
  };
  const strength = 2.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // central differences with wrap -> normals stay seamless across the seam
      let nx = (height((x - 1 + S) % S, y) - height((x + 1) % S, y)) * strength;
      let ny = (height(x, (y - 1 + S) % S) - height(x, (y + 1) % S)) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      const i = (y * S + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = inv * 255; // nz * 255, and nz = 1 * inv
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // normal maps are linear data, not colour — keep them out of sRGB
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return tex;
}
