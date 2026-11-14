import * as THREE from 'three';
import { clamp } from '../constants.js';
import { GRASSLAND_LOOK, grasslandMaterials } from '../look.js';

// A low lantern causeway: a flush wood-plank crossing (no arch — the old 0.8u
// arc over a 92u span read as flat anyway, and its 0.3-1.35u plank height let
// the train clip through) over a narrowed visual path, framed by four corner
// lantern posts that read from bank-scouting distance long before the deck
// itself does. Shared by the three straight river decks (crossing runs along
// X, path width along Z) and the two radial ring decks (crossing runs along
// Z, path width along X) via `axis`; `uCenter`/`uSpan` describe the crossing
// direction, `vCenter`/`vWidth` the path direction. Posts/lanterns/rails all
// sit `vWidth/2 + 1.5` outside the path centreline, so nothing above y≈0.3
// intrudes on the train's lane (|offset| < vWidth/2).
export function buildCauseway(root, rand, glowMat, { axis, uCenter, uSpan, vCenter, vWidth, planks = 9 }) {
  const group = new THREE.Group();
  const baseDeck = new THREE.Color(GRASSLAND_LOOK.causeway.deck);
  const postMat = grasslandMaterials.causewayPost();
  const railMat = grasslandMaterials.causewayRail();
  const lanternMat = grasslandMaterials.causewayLantern();

  // flush planks: centre y=0.12, thickness 0.24 (top ≈ 0.24, well under the
  // train's clearance). A small ±0.02 lightness jitter per plank keeps the
  // deck from reading as one flat-shaded slab.
  const lenU = uSpan / planks + 1.2; // small overlap so seams don't gap
  const hsl = {};
  for (let i = 0; i < planks; i++) {
    const t = i / (planks - 1);
    const u = uCenter - uSpan / 2 + uSpan * t;
    baseDeck.getHSL(hsl);
    const plankColor = new THREE.Color().setHSL(hsl.h, hsl.s, clamp(hsl.l + (rand() - 0.5) * GRASSLAND_LOOK.causeway.deckJitter, 0, 1));
    const plankMat = grasslandMaterials.causewayPlank(plankColor);
    const geo =
      axis === 'x' ? new THREE.BoxGeometry(lenU, 0.24, vWidth) : new THREE.BoxGeometry(vWidth, 0.24, lenU);
    const plank = new THREE.Mesh(geo, plankMat);
    plank.position.set(axis === 'x' ? u : vCenter, 0.12, axis === 'x' ? vCenter : u);
    plank.castShadow = true;
    group.add(plank);
  }

  // four corner posts, OUTSIDE the path, each topped with a glowing lantern +
  // a soft glow sprite (shared material) so the crossing is visible long
  // before the planks are.
  const edge = vWidth / 2 + 1.5;
  const postH = 3.2;
  for (const uSide of [-1, 1]) {
    for (const vSide of [-1, 1]) {
      const u = uCenter + uSide * (uSpan / 2);
      const v = vCenter + vSide * edge;
      const px = axis === 'x' ? u : v;
      const pz = axis === 'x' ? v : u;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, postH, 6), postMat);
      post.position.set(px, postH / 2, pz);
      post.castShadow = true;
      group.add(post);

      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lanternMat);
      lantern.position.set(px, postH, pz);
      group.add(lantern);

      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(6);
      glow.position.copy(lantern.position);
      group.add(glow);
    }
  }

  // rope rails along the crossing at the path edges, sitting on the posts' line
  for (const vSide of [-1, 1]) {
    const v = vCenter + vSide * edge;
    const geo =
      axis === 'x' ? new THREE.BoxGeometry(uSpan, 0.12, 0.15) : new THREE.BoxGeometry(0.15, 0.12, uSpan);
    const rail = new THREE.Mesh(geo, railMat);
    rail.position.set(axis === 'x' ? uCenter : v, 0.9, axis === 'x' ? v : uCenter);
    group.add(rail);
  }

  root.add(group);
  return group;
}
