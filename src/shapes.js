import * as THREE from 'three';

// Carved-plaster rock: a subdivided blob knocked about by a seeded lattice so
// it catches raking light in facets, with a flattened cap and a buried base.
// `paint(height01, upness)` returns a THREE.Color per vertex when given.
export function crag(rand, radius, squash, paint = null) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const p = geo.attributes.position;
  const a = rand() * 10;
  const b = rand() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / radius;
    const y = p.getY(i) / radius;
    const z = p.getZ(i) / radius;
    const k = 0.82 + 0.2 * Math.sin(x * 3.1 + a) * Math.cos(z * 2.7 + b) + 0.14 * Math.sin(y * 4.3 + a + b);
    const yy = y > 0.25 ? 0.25 + (y - 0.25) * 0.45 : y;
    p.setXYZ(i, x * k * radius, yy * squash * radius, z * k * radius);
  }
  geo.computeVertexNormals();
  if (paint) {
    const n = geo.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const c = paint(p.getY(i) / (radius * squash) + 0.5, n.getY(i));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return geo;
}
