import * as THREE from 'three';
import { CHART, GRADE_LOOK } from '../look.js';
import { ATMOS } from './shared.js';

// High tier only: the scene renders to a float target. Half-resolution contact
// shading and a quarter-resolution glow are gathered first, then one pass
// applies a depth-keyed tilt-shift blur (sharp around the focus distance, soft
// in front and behind, like a macro lens over a model), the sunward haze, the
// grade, a vignette, and the tone map. Over the map the blur gives way to a
// pen: ink wherever the depth breaks.
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const TAPS = 18;
const AO_TAPS = 10;

const DEPTH_PARS = /* glsl */ `
  uniform sampler2D tDepth;
  uniform float uNear;
  uniform float uFar;
  uniform vec2 uProj;
  float linearZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return (uNear * uFar) / (uFar - d * (uFar - uNear));
  }
  vec3 viewPos(vec2 uv) {
    float z = linearZ(uv);
    return vec3((uv * 2.0 - 1.0) * uProj * z, -z);
  }
`;

const AO_FRAG = /* glsl */ `
  ${DEPTH_PARS}
  uniform vec2 uTexel;
  uniform float uRadius;
  varying vec2 vUv;
  void main() {
    if (texture2D(tDepth, vUv).x > 0.99999) {
      gl_FragColor = vec4(1.0);
      return;
    }
    vec3 P = viewPos(vUv);
    vec3 xa = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
    vec3 xb = P - viewPos(vUv - vec2(uTexel.x, 0.0));
    vec3 ya = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
    vec3 yb = P - viewPos(vUv - vec2(0.0, uTexel.y));
    vec3 N = normalize(cross(abs(xa.z) < abs(xb.z) ? xa : xb, abs(ya.z) < abs(yb.z) ? ya : yb));
    float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    float reach = clamp(uRadius / (-P.z * 2.0 * uProj.y), uTexel.y * 3.0, 0.07);
    float occ = 0.0;
    for (int i = 0; i < ${AO_TAPS}; i++) {
      float fi = float(i);
      float a = fi * 2.39996323 + rot;
      vec2 o = vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / ${AO_TAPS}.0) * reach;
      o.x *= uProj.y / uProj.x;
      vec3 v = viewPos(vUv + o) - P;
      float dist = length(v);
      occ += max(0.0, dot(v, N) / (dist + 1e-4) - 0.14) / (1.0 + dist * dist / (uRadius * uRadius));
    }
    float ao = 1.0 - clamp(occ * 2.6 / ${AO_TAPS}.0, 0.0, 1.0);
    gl_FragColor = vec4(vec3(mix(1.0, ao, exp(P.z / 160.0))), 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uClamp;
  varying vec2 vUv;
  vec4 tap(vec2 o) {
    vec3 c = texture2D(tColor, vUv + uTexel * o).rgb;
    float w = 1.0 / (1.0 + max(c.r, max(c.g, c.b)));
    return vec4(c * w, w);
  }
  void main() {
    vec4 sum = tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
    vec3 c = sum.rgb / sum.a;
    c *= min(1.0, uClamp / max(max(c.r, max(c.g, c.b)), 1e-4));
    float peak = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.9, peak), 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb * 0.227027;
    c += (texture2D(tColor, vUv + uStep * 1.384615).rgb + texture2D(tColor, vUv - uStep * 1.384615).rgb) * 0.316216;
    c += (texture2D(tColor, vUv + uStep * 3.230769).rgb + texture2D(tColor, vUv - uStep * 3.230769).rgb) * 0.070270;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tAo;
  uniform sampler2D tBloom;
  ${DEPTH_PARS}
  uniform vec2 uTexel;
  uniform float uFocus;
  uniform vec3 uAoTint;
  uniform float uAo;
  uniform float uBloom;
  uniform float uClamp;
  uniform vec3 uSunView;
  uniform vec3 uGlow;
  uniform float uGlowI;
  uniform vec4 uGrade;
  uniform vec3 uShadowTint;
  uniform mat4 uCamWorld;
  uniform sampler2D uMottle;
  uniform vec3 uKeyDir;
  uniform vec3 uCloudTint;
  uniform vec3 uCloudShadow;
  uniform float uStrength;
  uniform float uMaxRadius;
  uniform float uVignette;
  uniform float uChart;
  uniform float uPxAngle;
  uniform vec3 uInk;
  varying vec2 vUv;

  float inkHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float inkNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(inkHash(i), inkHash(i + vec2(1.0, 0.0)), f.x),
               mix(inkHash(i + vec2(0.0, 1.0)), inkHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

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
      float spin = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
      for (int i = 0; i < ${TAPS}; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / ${TAPS}.0) * radius;
        float a = fi * 2.39996323 + spin;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
        float w = clamp(coc(uv) / max(c0, 1e-3) + 0.15, 0.0, 1.0);
        col += texture2D(tColor, uv).rgb * w;
        total += w;
      }
      col /= total;
    }
    float depth = texture2D(tDepth, vUv).x;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    if (depth < 0.99999) {
      col *= min(1.0, uClamp / max(max(col.r, max(col.g, col.b)), 1e-4));
      vec2 o = uTexel * 1.5;
      float ao = 0.25 * (texture2D(tAo, vUv + o).r + texture2D(tAo, vUv - o).r
        + texture2D(tAo, vUv + vec2(o.x, -o.y)).r + texture2D(tAo, vUv + vec2(-o.x, o.y)).r);
      float dull = (1.0 - smoothstep(0.9, 1.8, lum)) * (1.0 - uChart);
      col *= mix(vec3(1.0), mix(uAoTint, vec3(1.0), ao), uAo * (1.0 - 0.7 * c0) * dull);
      vec3 wp = (uCamWorld * vec4(viewPos(vUv), 1.0)).xyz;
      vec2 gp = (wp.xz - uKeyDir.xz * (wp.y / max(uKeyDir.y, 0.25))) / 900.0 + uCloudShadow.yz;
      float cloud = smoothstep(0.47, 0.64, texture2D(uMottle, gp).r * 0.78 + texture2D(uMottle, gp * 2.3 + 0.4).r * 0.22);
      col *= mix(vec3(1.0), uCloudTint, cloud * uCloudShadow.x * dull * (1.0 - smoothstep(220.0, 700.0, linearZ(vUv))));
      vec3 ray = normalize(vec3((vUv * 2.0 - 1.0) * uProj, -1.0));
      float toward = max(dot(ray, uSunView), 0.0);
      float haze = 1.0 - exp(-linearZ(vUv) * 0.0022);
      col += uGlow * uGlowI * haze * (0.1 + 0.9 * toward * toward * toward) * (1.0 - uChart);
    }
    col += texture2D(tBloom, vUv).rgb * uBloom * (1.0 - uChart);
    if (uChart > 0.0) {
      vec2 px = gl_FragCoord.xy;
      vec2 o = uTexel * 1.5;
      float zc = linearZ(vUv);
      float lap = abs(linearZ(vUv - vec2(o.x, 0.0)) + linearZ(vUv + vec2(o.x, 0.0)) - 2.0 * zc)
                + abs(linearZ(vUv - vec2(0.0, o.y)) + linearZ(vUv + vec2(0.0, o.y)) - 2.0 * zc);
      float m = lap / (zc * uPxAngle * 1.5);
      float line = smoothstep(0.6, 2.4, m) * (0.72 + 0.28 * inkNoise(px * 0.03 + 11.0));
      float pool = inkNoise(px * 0.012) * 0.6 + inkNoise(px * 0.05 + 5.0) * 0.4;
      vec3 drawn = col * (1.0 + (pool - 0.5) * 0.08);
      drawn = mix(drawn, uInk, line * 0.9);
      float fibre = inkNoise(px * vec2(0.9, 0.35)) * 0.5 + inkNoise(px * 1.7) * 0.5;
      drawn *= 1.0 - (fibre - 0.5) * 0.06;
      col = mix(col, drawn, uChart);
    }
    vec2 q = vUv - 0.5;
    col *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.2);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    vec3 g = clamp(gl_FragColor.rgb, 0.0, 1.0);
    float gl = dot(g, vec3(0.2126, 0.7152, 0.0722));
    float grade = 1.0 - uChart;
    g = mix(vec3(gl), g, 1.0 + uGrade.x * grade);
    g = mix(g, g * g * (3.0 - 2.0 * g), uGrade.y * grade);
    g += uShadowTint * (1.0 - gl) * (1.0 - gl) * uGrade.z * grade;
    gl_FragColor.rgb = max(g, 0.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb += (inkHash(gl_FragCoord.xy + 0.5) - 0.5) / 255.0;
  }
`;

const triple = (v, dusk, night) => v[0] + (v[1] - v[0]) * dusk + (v[2] - v[0]) * night;
const _shadow = new THREE.Color();
const _sun = new THREE.Vector3();

export function createPost(renderer) {
  const depthTexture = new THREE.DepthTexture(1, 1);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: 4, depthTexture, generateMipmaps: false,
  });
  const aoTarget = new THREE.WebGLRenderTarget(1, 1, { generateMipmaps: false, depthBuffer: false });
  const glow = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, generateMipmaps: false, depthBuffer: false,
  }));
  const depth = {
    tDepth: { value: depthTexture },
    uNear: { value: 0.1 },
    uFar: { value: 6000 },
    uProj: { value: new THREE.Vector2(1, 1) },
  };
  const pass = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false });
  const aoMat = pass(AO_FRAG, { ...depth, uTexel: { value: new THREE.Vector2(1, 1) }, uRadius: { value: GRADE_LOOK.aoRadius } });
  const brightMat = pass(BRIGHT_FRAG, {
    tColor: { value: target.texture }, uTexel: { value: new THREE.Vector2(1, 1) }, uThreshold: { value: 1 }, uClamp: { value: GRADE_LOOK.bloomClamp },
  });
  const blurMat = pass(BLUR_FRAG, { tColor: { value: null }, uStep: { value: new THREE.Vector2() } });
  const material = pass(FRAG, {
    ...depth,
    tColor: { value: target.texture },
    tAo: { value: aoTarget.texture },
    tBloom: { value: glow[0].texture },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 30 },
    uStrength: { value: 1 },
    uMaxRadius: { value: 9 },
    uVignette: { value: 0.22 },
    uChart: CHART.uChart,
    uPxAngle: { value: 0.001 },
    uInk: CHART.uChartInk,
    uAoTint: { value: new THREE.Color(GRADE_LOOK.aoTint) },
    uAo: { value: 1 },
    uBloom: { value: 0.3 },
    uClamp: { value: GRADE_LOOK.bloomClamp },
    uSunView: { value: new THREE.Vector3(0, 0, -1) },
    uGlow: { value: ATMOS.glow },
    uGlowI: { value: 0 },
    uGrade: { value: new THREE.Vector4() },
    uShadowTint: { value: new THREE.Color() },
    uCamWorld: { value: new THREE.Matrix4() },
    uMottle: { value: null },
    uKeyDir: { value: ATMOS.keyDir },
    uCloudTint: { value: new THREE.Color(GRADE_LOOK.cloudShadowTint) },
    uCloudShadow: { value: new THREE.Vector3() },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.Camera();
  const size = new THREE.Vector2();
  let width = 1;
  let height = 1;
  const draw = (mat, to) => {
    quad.material = mat;
    renderer.setRenderTarget(to);
    renderer.render(quadScene, quadCamera);
  };

  return {
    // focus: view distance held sharp. strength: 0 disables the blur.
    render(scene, camera, focus, strength) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== width || size.y !== height) {
        width = size.x;
        height = size.y;
        target.setSize(width, height);
        aoTarget.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
        for (const g of glow) g.setSize(Math.ceil(width / 4), Math.ceil(height / 4));
        material.uniforms.uTexel.value.set(1 / width, 1 / height);
        aoMat.uniforms.uTexel.value.set(2 / width, 2 / height);
        brightMat.uniforms.uTexel.value.set(1 / width, 1 / height);
      }
      const u = material.uniforms;
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      depth.uNear.value = camera.near;
      depth.uFar.value = camera.far;
      depth.uProj.value.set(tan * camera.aspect, tan);
      u.uFocus.value = focus;
      u.uStrength.value = strength;
      u.uMaxRadius.value = height * 0.0062;
      u.uPxAngle.value = (2 * tan) / height;

      const L = GRADE_LOOK;
      const night = ATMOS.night;
      const dusk = ATMOS.dusk * (1 - night);
      u.uAo.value = triple(L.ao, dusk, night);
      u.uBloom.value = triple(L.bloom, dusk, night);
      brightMat.uniforms.uThreshold.value = triple(L.bloomThreshold, dusk, night);
      u.uGrade.value.set(L.saturation, L.contrast * (1 - (1 - L.nightContrast) * night), triple(L.shadowTint, dusk, night), 0);
      u.uVignette.value = triple(L.vignette, dusk, night);
      u.uShadowTint.value.set(L.shadowDay).lerp(_shadow.set(L.shadowDusk), dusk).lerp(_shadow.set(L.shadowNight), night);
      u.uGlowI.value = ATMOS.glowI * L.sunHaze;
      u.uCamWorld.value.copy(camera.matrixWorld);
      u.uMottle.value = ATMOS.mottle;
      u.uCloudShadow.value.set(triple(L.cloudShadow, dusk, night), ATMOS.time * L.cloudShadowDrift[0], ATMOS.time * L.cloudShadowDrift[1]);
      u.uSunView.value.copy(_sun.copy(ATMOS.sunDir).transformDirection(camera.matrixWorldInverse));

      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const stats = renderer.info.render;
      const { calls, triangles, points, lines } = stats;
      draw(aoMat, aoTarget);
      draw(brightMat, glow[0]);
      for (let i = 0; i < 2; i++) {
        const reach = (i + 1) * 4;
        blurMat.uniforms.tColor.value = glow[0].texture;
        blurMat.uniforms.uStep.value.set(reach / width, 0);
        draw(blurMat, glow[1]);
        blurMat.uniforms.tColor.value = glow[1].texture;
        blurMat.uniforms.uStep.value.set(0, reach / height);
        draw(blurMat, glow[0]);
      }
      draw(material, null);
      // keep the frame's counters describing the scene, not just this quad
      stats.calls += calls;
      stats.triangles += triangles;
      stats.points += points;
      stats.lines += lines;
    },
    dispose() {
      target.dispose();
      aoTarget.dispose();
      for (const g of glow) g.dispose();
      depthTexture.dispose();
      for (const m of [material, aoMat, brightMat, blurMat]) m.dispose();
      quad.geometry.dispose();
    },
  };
}
