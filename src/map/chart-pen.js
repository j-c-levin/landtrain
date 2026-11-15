import * as THREE from 'three';
import { CHART } from '../look.js';
import { PEN_VERT, PEN_FRAG } from './chart-glsl.js';

export function createChartPen(renderer) {
  const gl = renderer.getContext();
  const floats = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const depthTexture = new THREE.DepthTexture(1, 1);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: floats ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: gl.getContextAttributes().antialias ? 4 : 0,
    depthTexture,
    generateMipmaps: false,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: depthTexture },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 6000 },
      uChart: CHART.uChart,
      uPxAngle: { value: 0.001 },
      uReach: { value: 1 },
      uInk: CHART.uChartInk,
    },
    vertexShader: PEN_VERT,
    fragmentShader: PEN_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.Camera();
  const size = new THREE.Vector2();
  let width = 1;
  let height = 1;

  return {
    render(scene, camera) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== width || size.y !== height) {
        width = size.x;
        height = size.y;
        target.setSize(width, height);
        material.uniforms.uTexel.value.set(1 / width, 1 / height);
      }
      const u = material.uniforms;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uReach.value = renderer.getPixelRatio() >= 1.5 ? 1.5 : 1;
      u.uPxAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / height;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const stats = renderer.info.render;
      const { calls, triangles, points, lines } = stats;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
      stats.calls += calls;
      stats.triangles += triangles;
      stats.points += points;
      stats.lines += lines;
    },
    // Drawing into the target needs its own variant of every program; building them here spares the first map opening a freeze.
    prewarm(scene, camera) {
      renderer.setRenderTarget(target);
      renderer.compileAsync(scene, camera).catch(() => {});
      renderer.setRenderTarget(null);
    },
    dispose() {
      target.dispose();
      depthTexture.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
