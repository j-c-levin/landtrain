import * as THREE from 'three';

export function createRenderer(canvas, policy) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: policy.antialias });
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

export function applyRenderQuality(renderer, scene, policy) {
  renderer.shadowMap.type = policy.shadowType === 'pcf-soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  scene.traverse((object) => {
    if (!object.isLight || !object.castShadow || !object.shadow) return;
    object.shadow.mapSize.setScalar(policy.shadowMapSize);
    if (object.shadow.map) {
      object.shadow.map.dispose();
      object.shadow.map = null;
    }
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, policy.dpr));
}

// Reconciled every frame rather than on 'resize': survives fullscreen, browser
// zoom and display changes. Returns the new aspect when the buffer resized.
export function syncRendererSize(renderer, canvas, policy) {
  const dpr = Math.min(window.devicePixelRatio || 1, policy.dpr);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return null;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width === bw && canvas.height === bh) return null;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  return w / h;
}
