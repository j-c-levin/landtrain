import * as THREE from 'three';

// High tier only: the scene renders to a float target, then one pass applies a
// depth-keyed tilt-shift blur (sharp around the focus distance, soft in front
// and behind, like a macro lens over a model), a vignette, and the tone map.
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const TAPS = 18;

const FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uFocus;
  uniform float uStrength;
  uniform float uMaxRadius;
  uniform float uVignette;
  varying vec2 vUv;

  float coc(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    // the sky stays sharp so stars survive
    if (d > 0.99999) return 0.0;
    float z = (uNear * uFar) / (uFar - d * (uFar - uNear));
    float front = clamp((uFocus * 0.72 - z) / (uFocus * 0.5), 0.0, 1.0);
    float back = clamp((z - uFocus * 1.45) / (uFocus * 2.6), 0.0, 1.0);
    return max(front, back * 0.8) * uStrength;
  }

  void main() {
    vec3 col = texture2D(tColor, vUv).rgb;
    float c0 = coc(vUv);
    float radius = c0 * uMaxRadius;
    if (radius > 0.6) {
      float total = 1.0;
      for (int i = 0; i < ${TAPS}; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / ${TAPS}.0) * radius;
        float a = fi * 2.39996323;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
        float w = clamp(coc(uv) / max(c0, 1e-3) + 0.15, 0.0, 1.0);
        col += texture2D(tColor, uv).rgb * w;
        total += w;
      }
      col /= total;
    }
    vec2 q = vUv - 0.5;
    col *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.2);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createPost(renderer) {
  const depthTexture = new THREE.DepthTexture(1, 1);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: 4, depthTexture, generateMipmaps: false,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: depthTexture },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 6000 },
      uFocus: { value: 30 },
      uStrength: { value: 1 },
      uMaxRadius: { value: 9 },
      uVignette: { value: 0.22 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
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
    // focus: view distance held sharp. strength: 0 disables the blur.
    render(scene, camera, focus, strength) {
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
      u.uFocus.value = focus;
      u.uStrength.value = strength;
      u.uMaxRadius.value = height * 0.0062;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const stats = renderer.info.render;
      const { calls, triangles, points, lines } = stats;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
      // keep the frame's counters describing the scene, not just this quad
      stats.calls += calls;
      stats.triangles += triangles;
      stats.points += points;
      stats.lines += lines;
    },
    dispose() {
      target.dispose();
      depthTexture.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
