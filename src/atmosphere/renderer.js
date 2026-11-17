import * as THREE from 'three';
import { renderScale } from '../quality.js';

let pixelRatioOverride = null;

export function setPixelRatioOverride(value) {
  pixelRatioOverride = value > 0 ? value : null;
}

const scaleFor = (policy, w, h) => pixelRatioOverride ?? renderScale(policy, window.devicePixelRatio, w, h);

export function createRenderer(canvas, policy, antialias = policy.antialias) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias });
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function applyRenderQuality(renderer, scene, policy) {
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.needsUpdate = true;
  scene.traverse((object) => {
    if (!object.isLight || !object.castShadow || !object.shadow) return;
    object.shadow.mapSize.setScalar(policy.shadowMapSize);
    object.userData.radius = object.shadow.radius = policy.shadowType === 'pcf-soft' ? 2.6 : 1.4;
    if (object.shadow.map) {
      object.shadow.map.dispose();
      object.shadow.map = null;
    }
  });
  const canvas = renderer.domElement;
  renderer.setPixelRatio(scaleFor(policy, canvas.clientWidth, canvas.clientHeight));
}

// Reconciled every frame, not on 'resize': survives fullscreen, zoom and display changes.
export function syncRendererSize(renderer, canvas, policy) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return null;
  const dpr = scaleFor(policy, w, h);
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width === bw && canvas.height === bh) return null;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  return w / h;
}
