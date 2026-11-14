import * as THREE from 'three';
import { GRASSLAND_LOOK, grasslandMaterials } from '../look.js';
import { mulberry } from '../prng.js';

// A low lantern causeway: a flush timber deck (top ≈ 0.24, well under the
// train's clearance) of narrow hand-laid planks on stringer beams, framed by
// four corner lantern posts that read from bank-scouting distance. Shared by
// the straight river decks (crossing along X) and the radial ring decks
// (crossing along Z) via `axis`; `uCenter`/`uSpan` describe the crossing
// direction, `vCenter`/`vWidth` the path direction. Posts, lanterns and rails
// sit `vWidth/2 + 1.5` outside the path centreline, so nothing above y≈0.3
// intrudes on the train's lane.
export function buildCauseway(root, rand, glowMat, { axis, uCenter, uSpan, vCenter, vWidth, planks = 9 }) {
  const group = new THREE.Group();
  const postMat = grasslandMaterials.causewayPost();
  const railMat = grasslandMaterials.causewayRail();
  const beamMat = grasslandMaterials.causewayBeam();
  const lanternMat = grasslandMaterials.causewayLantern();
  const place = (mesh, u, y, v) => mesh.position.set(axis === 'x' ? u : v, y, axis === 'x' ? v : u);

  // the world stream is drawn exactly as before; fine plank variety has its own
  for (let i = 0; i < planks; i++) rand();
  const local = mulberry(Math.round(uCenter * 13 + vCenter * 7) >>> 0);

  const PLANK = 1.1;
  const count = Math.floor(uSpan / PLANK);
  const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), grasslandMaterials.causewayPlank(), count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const hsl = {};
  new THREE.Color(GRASSLAND_LOOK.causeway.deck).getHSL(hsl);
  for (let i = 0; i < count; i++) {
    const u = uCenter - uSpan / 2 + (i + 0.5) * PLANK;
    const over = vWidth + 0.5 + local() * 1.1;
    const shift = (local() - 0.5) * 0.7;
    dummy.position.set(axis === 'x' ? u : vCenter + shift, 0.12 + local() * 0.02, axis === 'x' ? vCenter + shift : u);
    dummy.scale.set(axis === 'x' ? PLANK - 0.12 : over, 0.24, axis === 'x' ? over : PLANK - 0.12);
    dummy.rotation.set(0, (local() - 0.5) * 0.012, 0);
    dummy.updateMatrix();
    deck.setMatrixAt(i, dummy.matrix);
    const j = GRASSLAND_LOOK.causeway.deckJitter;
    tint.setHSL(hsl.h + (local() - 0.5) * 0.012, hsl.s * (0.85 + local() * 0.2), hsl.l + (local() - 0.5) * j);
    deck.setColorAt(i, tint);
  }
  deck.instanceMatrix.needsUpdate = true;
  deck.instanceColor.needsUpdate = true;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // every timber is one of two instanced shapes: a unit box or a unit post
  const boxes = [];
  const posts = [];
  const beam = (lu, h, lv, u, y, v) =>
    boxes.push(axis === 'x' ? [u, y, v, lu, h, lv] : [v, y, u, lv, h, lu]);
  const pole = (r, h, u, y, v) => posts.push(axis === 'x' ? [u, y, v, r, h] : [v, y, u, r, h]);

  const edge = vWidth / 2 + 1.5;
  for (const vSide of [-1, 1]) beam(uSpan + 1.2, 0.5, 0.6, uCenter, 0.2, vCenter + vSide * (vWidth / 2 + 0.75));
  // trestle bents down into the channel
  const bents = Math.max(2, Math.round(uSpan / 14));
  for (let b = 0; b < bents; b++) {
    const u = uCenter - uSpan / 2 + ((b + 0.5) / bents) * uSpan;
    for (const vSide of [-1, 0, 1]) pole(0.46, 8, u, -4, vCenter + vSide * (vWidth / 2 + 0.2));
    beam(0.7, 0.5, vWidth + 2.4, u, -0.28, vCenter);
  }

  // four corner posts, OUTSIDE the path, each topped with a glowing lantern +
  // a soft glow sprite (shared material) so the crossing is visible long
  // before the planks are.
  const postH = 3.4;
  const lanternGeo = new THREE.SphereGeometry(0.42, 10, 8);
  for (const uSide of [-1, 1]) {
    for (const vSide of [-1, 1]) {
      const u = uCenter + uSide * (uSpan / 2);
      const v = vCenter + vSide * edge;
      pole(0.36, postH, u, postH / 2, v);
      beam(1.0, 0.16, 1.0, u, postH + 0.7, v);
      const lantern = new THREE.Mesh(lanternGeo, lanternMat);
      place(lantern, u, postH + 0.26, v);
      group.add(lantern);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(5);
      glow.position.copy(lantern.position);
      group.add(glow);
    }
  }

  // rope rails along the crossing at the path edges, on short stanchions
  const rails = [];
  for (const vSide of [-1, 1]) {
    const v = vCenter + vSide * edge;
    rails.push(axis === 'x' ? [uCenter, 1.0, v, uSpan, 0.14, 0.14] : [v, 1.0, uCenter, 0.14, 0.14, uSpan]);
    const stanchions = Math.round(uSpan / 9);
    for (let i = 1; i < stanchions; i++) pole(0.13, 1.0, uCenter - uSpan / 2 + (i / stanchions) * uSpan, 0.5, v);
  }

  const instanced = (geometry, material, items, fit) => {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    for (let i = 0; i < items.length; i++) {
      fit(dummy, items[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const fitBox = (o, [x, y, z, sx, sy, sz]) => { o.position.set(x, y, z); o.scale.set(sx, sy, sz); };
  instanced(new THREE.BoxGeometry(1, 1, 1), beamMat, boxes, fitBox);
  instanced(new THREE.BoxGeometry(1, 1, 1), railMat, rails, fitBox);
  instanced(new THREE.CylinderGeometry(0.8, 1, 1, 6), postMat, posts, (o, [x, y, z, r, h]) => {
    o.position.set(x, y, z);
    o.scale.set(r, h, r);
  });

  root.add(group);
  return group;
}
