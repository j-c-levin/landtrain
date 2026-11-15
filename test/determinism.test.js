import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setLookTier, twinInstanced, syncTwins, ownInstancedDepth } from '../src/look.js';
import { mulberry } from '../src/prng.js';
import { ridge } from '../src/prairie/rocks.js';

test('ridge outcrops block the same ground on every tier', () => {
  const build = (tier) => {
    setLookTier(tier);
    const obstacles = [];
    ridge(mulberry(7), 1900, -760, 1900, 130, new THREE.Group(), obstacles);
    return obstacles;
  };
  const high = build('high');
  assert.deepEqual(build('low'), high);
  assert.deepEqual(build('medium'), high);
  setLookTier('high');
});

test('a material drawn instanced and plain is split, and the twin follows its source', () => {
  const root = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ color: 0x336699, transparent: true });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const plain = new THREE.Mesh(geometry, shared);
  const instanced = new THREE.InstancedMesh(geometry, shared, 2);
  const tinted = new THREE.InstancedMesh(geometry, shared, 2);
  tinted.setColorAt(0, new THREE.Color(1, 0, 0));
  const alone = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
  const own = alone.material;
  root.add(plain, instanced, tinted, alone);

  const twins = twinInstanced([root]);
  assert.equal(twins.length, 2);
  assert.equal(plain.material, shared);
  assert.notEqual(instanced.material, shared);
  assert.notEqual(tinted.material, shared);
  assert.notEqual(tinted.material, instanced.material);
  assert.equal(alone.material, own);

  shared.opacity = 0.25;
  shared.color.setHex(0xff0000);
  shared.emissiveIntensity = 0.7;
  syncTwins(twins);
  assert.equal(instanced.material.opacity, 0.25);
  assert.equal(tinted.material.color.getHex(), 0xff0000);
  assert.equal(instanced.material.emissiveIntensity, 0.7);
});

test('instanced shadow casters stop sharing the plain depth material', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const a = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
  const b = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
  const tinted = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
  tinted.setColorAt(0, new THREE.Color(1, 0, 0));
  const kept = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
  kept.customDepthMaterial = new THREE.MeshDepthMaterial();
  const mine = kept.customDepthMaterial;
  const plain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  root.add(a, b, tinted, kept, plain);
  ownInstancedDepth(root);
  assert.ok(a.customDepthMaterial.isMeshDepthMaterial);
  assert.equal(a.customDepthMaterial, b.customDepthMaterial);
  assert.notEqual(tinted.customDepthMaterial, a.customDepthMaterial);
  assert.equal(kept.customDepthMaterial, mine);
  assert.equal(plain.customDepthMaterial, undefined);
});
