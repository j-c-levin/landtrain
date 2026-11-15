// node scripts/lanes/train-tris.mjs [repo root] [--top]
import * as THREE from 'three';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const top = args.includes('--top');
const root = resolve(args.find((a) => !a.startsWith('--')) ?? new URL('../..', import.meta.url).pathname);
const { setLookTier } = await import(`${root}/src/look.js`);
const { Train } = await import(`${root}/src/train/train.js`);

globalThis.document = {
  createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
};

for (const tier of ['high', 'low']) {
  setLookTier(tier);
  const train = new Train(new THREE.Scene());
  let drawn = 0;
  let shadowed = 0;
  let calls = 0;
  const rows = new Map();
  train.cars.forEach(({ group }, ci) => group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    drawn += tris;
    calls++;
    if (o.castShadow) shadowed += tris;
    let named = o;
    while (named && !named.name) named = named.parent;
    const key = `car${ci} ${(named?.name ?? g.type).replace(/-Mesh.*|-Paint.*/, '')}`;
    rows.set(key, (rows.get(key) ?? 0) + tris * (o.castShadow ? 2 : 1));
  }));
  console.log(`${tier}: ${Math.round(drawn)} triangles, ${Math.round(shadowed)} in the shadow pass, ${Math.round(drawn + shadowed)} rendered, ${calls} meshes`);
  if (top) for (const [k, v] of [...rows].sort((a, b) => b[1] - a[1]).slice(0, 24)) console.log(String(Math.round(v)).padStart(8), k);
  train.dispose();
}
