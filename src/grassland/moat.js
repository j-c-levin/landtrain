import * as THREE from 'three';
import { GRASSLAND_LOOK, grasslandMaterials, getLookTier } from '../look.js';
import {
  GRASS_LANDMARK, WATER_Y, ISLAND_R, MOAT_R, RING_MID, RING_W, RING_BANK, RING_SHORE, channelY,
} from './layout.js';
import { waterMaterial, sheetGeometry } from './water.js';
import { buildCauseway } from './causeway.js';
import { dressBanks } from './banks.js';
import { shoreAttr } from './rivers.js';
import { nightTame } from './fade.js';

const BED_D = [0, 9, RING_W, 22, 26, 30, RING_SHORE, 35.5, 38, RING_BANK + RING_W];
const WATER_D = [0, 12, 20, 26, 30, RING_SHORE, RING_SHORE + 1.4];
const mirrored = (d) => [...d.slice(1).reverse().map((v) => -v), ...d];

// Crossings as angles around the island: west (the way in), north and south.
export const MOAT_CROSSINGS = [Math.PI, Math.PI / 2, -Math.PI / 2];
export const MOAT_GAP = 0.16;
const DECK_W = 30;

export function buildMoat({ root, rand, obstacles }, bridgeGlowMat) {
  const low = getLookTier() === 'low';
  const SEG = low ? 64 : 96;
  const { x: cx, z: cz } = GRASS_LANDMARK;

  {
    const cols = mirrored(BED_D);
    const shore = new Float32Array(SEG * cols.length * 2);
    const geo = sheetGeometry(SEG, cols.length, (i, j, out) => {
      const a = (i / SEG) * Math.PI * 2;
      const r = RING_MID + cols[j];
      const y = channelY(Math.abs(cols[j]), RING_W, RING_BANK);
      out[0] = cx + Math.cos(a) * r; out[1] = y; out[2] = cz + Math.sin(a) * r;
      shore.set(shoreAttr(y), (i * cols.length + j) * 2);
    }, { closed: true });
    geo.deleteAttribute('aFlow');
    geo.setAttribute('aShore', new THREE.BufferAttribute(shore, 2));
    geo.computeVertexNormals();
    const bed = new THREE.Mesh(geo, nightTame(grasslandMaterials.shore()));
    bed.receiveShadow = true;
    root.add(bed);
  }

  {
    // open at the west crossing, so the pattern's seam hides under the deck
    const cols = mirrored(WATER_D);
    const geo = sheetGeometry(SEG + 1, cols.length, (i, j, out) => {
      const a = Math.PI + (i / SEG) * Math.PI * 2;
      const r = RING_MID + cols[j];
      out[0] = cx + Math.cos(a) * r; out[1] = WATER_Y; out[2] = cz + Math.sin(a) * r;
      out[3] = cols[j]; out[4] = (i / SEG) * Math.PI * 2 * RING_MID;
      out[5] = RING_SHORE - Math.abs(cols[j]);
    });
    geo.computeVertexNormals();
    const water = new THREE.Mesh(geo, waterMaterial({ flow: [0, 0.7], glint: GRASSLAND_LOOK.waterMoatGlint }));
    water.receiveShadow = true;
    // faded willows write depth: the water must be laid down before them
    water.renderOrder = -1;
    root.add(water);
  }

  // the tree's glow caught in the still water beside each crossing
  const glowMat = grasslandMaterials.moatGlow();
  {
    const discGeo = new THREE.CircleGeometry(1, 24);
    discGeo.rotateX(-Math.PI / 2);
    for (const a of [0, Math.PI * 0.75, -Math.PI * 0.75, Math.PI * 0.25, -Math.PI * 0.25]) {
      const disc = new THREE.Mesh(discGeo, glowMat);
      disc.scale.set(34, 1, 34);
      disc.position.set(cx + Math.cos(a) * RING_MID, WATER_Y + 0.05, cz + Math.sin(a) * RING_MID);
      root.add(disc);
    }
  }

  obstacles.push({
    type: 'ring', x: cx, z: cz, rInner: ISLAND_R, rOuter: MOAT_R,
    gaps: MOAT_CROSSINGS.map((a) => ({ a0: a - MOAT_GAP, a1: a + MOAT_GAP })),
  });

  const span = MOAT_R - ISLAND_R;
  // north then south draw from the world stream as they always have
  for (const dir of [1, -1]) {
    buildCauseway(root, rand, bridgeGlowMat, {
      axis: 'z', uCenter: cz + dir * RING_MID, uSpan: span, vCenter: cx, vWidth: DECK_W, shore: RING_SHORE,
    });
  }
  buildCauseway(root, () => 0, bridgeGlowMat, {
    axis: 'x', uCenter: cx - RING_MID, uSpan: span, vCenter: cz, vWidth: DECK_W, shore: RING_SHORE,
  });

  const clearArc = (DECK_W / 2 + 7) / RING_MID;
  dressBanks(root, {
    seed: 9311,
    s0: 0,
    s1: Math.PI * 2 * RING_MID,
    at: (s, d, out) => out.set(cx + Math.cos(s / RING_MID) * (RING_MID + d), cz + Math.sin(s / RING_MID) * (RING_MID + d)),
    bedY: (d) => channelY(Math.abs(d), RING_W, RING_BANK),
    shore: RING_SHORE,
    lip: RING_W + RING_BANK,
    keepClear: (s) => MOAT_CROSSINGS.some((a) => {
      const da = Math.abs(((s / RING_MID - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return da < clearArc;
    }),
    feature: MOAT_CROSSINGS.flatMap((a) => {
      const s = ((a + Math.PI * 2) % (Math.PI * 2)) * RING_MID;
      return [s - 40, s + 40];
    }),
    flowers: GRASSLAND_LOOK.islandFlower,
    glow: 0.25,
  });
  return { glowMat };
}
