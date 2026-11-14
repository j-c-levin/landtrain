import * as THREE from 'three';
import { clamp, lerp } from '../constants.js';
import { TRAIN_LOOK, plantMaterials } from '../look.js';
import { interiorKit } from './interior-kit.js';

export class Plant {
  constructor(parent, materials, geometry, x, y, z, scale, kind) {
    this.group = new THREE.Group();
    this.group.name = `plant-${kind}`;
    this.group.position.set(x, y, z);
    this.group.scale.setScalar(scale);
    parent.add(this.group);
    const k = interiorKit(this.group, `plant-pot-${kind}`);
    const potMat = [materials.hull, materials.cream, materials.teal][kind];
    k.mesh(new THREE.CylinderGeometry(0.34, 0.23, 0.43, 20), potMat, 0, 0.235, 0);
    k.ring(0.329, 0.034, potMat, 0, 0.452, 0).rotation.x = Math.PI / 2;
    k.round(0.38, 0.04, 0.38, potMat, 0, 0.022, 0);
    this.soilMat = plantMaterials.soil();
    k.round(0.298, 0.026, 0.298, this.soilMat, 0, 0.443, 0);
    this.leafMat = plantMaterials.leaf(materials.foliage);
    this.drySoil = new THREE.Color(TRAIN_LOOK.soil);
    this.wetSoil = new THREE.Color(TRAIN_LOOK.soilWet);
    this.thirstyGreen = new THREE.Color(TRAIN_LOOK.leafThirsty);
    this.wateredGreen = new THREE.Color(TRAIN_LOOK.leafWatered);
    this.leaves = [];
    if (kind === 0) {
      for (let i = 0; i < 11; i++) this.leaves.push({ x: 0, y: 0.43, z: -0.025 * (i % 3),
        angle: -1.15 + i * 0.23, twist: (i % 3 - 1) * 0.5, w: 0.25, h: 0.89 + (i % 3) * 0.12 });
    } else if (kind === 1) {
      k.pipe([[0, 0.44, 0], [-0.05, 0.83, 0], [0.07, 1.37, -0.03]], 0.018, materials.woodDark);
      for (let i = 0; i < 7; i++) this.leaves.push({ x: i % 2 ? -0.04 : 0.04, y: 0.61 + i * 0.117,
        z: -0.06, angle: (i % 2 ? 1 : -1) * (0.65 + (i % 3) * 0.2), twist: (i % 3 - 1) * 0.3, w: 0.58, h: 0.66 });
    } else {
      for (let i = 0; i < 8; i++) this.leaves.push({ x: (i % 2 ? -1 : 1) * 0.12, y: 0.42 - Math.max(0, i - 4) * 0.14,
        z: i > 4 ? 0.2 : -0.03, angle: (i % 2 ? 1 : -1) * (0.45 + i * 0.23), twist: (i % 3 - 1) * 0.25, w: 0.5, h: 0.59 });
      for (const side of [-1, 1]) k.pipe([[0, 0.47, 0], [side * 0.24, 0.44, 0.14], [side * 0.29, -0.05, 0.2]], 0.015, materials.foliage);
    }
    this.leafMesh = new THREE.InstancedMesh(geometry.plantLeaf, this.leafMat, this.leaves.length);
    this.leafMesh.castShadow = true;
    this.leafMesh.receiveShadow = true;
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leafMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.6);
    this.group.add(this.leafMesh);
    this.transform = new THREE.Object3D();
    k.finish();
    this.setHappiness(1);
  }

  setHappiness(h, time = 0, motion = 0) {
    const t = clamp(h, 0, 1);
    this.leafMat.color.lerpColors(this.thirstyGreen, this.wateredGreen, t);
    this.soilMat.color.lerpColors(this.drySoil, this.wetSoil, t);
    this.soilMat.roughness = lerp(1, 0.7, t);
    for (let i = 0; i < this.leaves.length; i++) {
      const leaf = this.leaves[i];
      this.transform.position.set(leaf.x, leaf.y, leaf.z);
      this.transform.scale.set(leaf.w, leaf.h * lerp(0.91, 1, t), 1);
      this.transform.rotation.set(0.07 * Math.sin(time * 0.65 + i) * motion, leaf.twist,
        leaf.angle + Math.sign(leaf.angle) * (1 - t) * 0.28 + Math.sin(time * 0.7 + i * 0.9) * 0.025 * motion);
      this.transform.updateMatrix();
      this.leafMesh.setMatrixAt(i, this.transform.matrix);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }
}
