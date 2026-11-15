export const NIGHT = { value: 0 };

function chain(mat, tag, patch) {
  const inner = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    patch(shader);
  };
  mat.customProgramCacheKey = () => `${key.call(mat)}|${tag}`;
  return mat;
}

// Stipples a material away near the lens; `above` spares what lies below that world height.
export function nearFade(mat, { from = 22, to = 30, above = -1000 } = {}) {
  return chain(mat, `fade${from},${to},${above}`, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFadeY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 fadeW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fadeW = instanceMatrix * fadeW;
        #endif
        vFadeY = (modelMatrix * fadeW).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFadeY;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float fadeK = max(smoothstep(${from.toFixed(1)}, ${to.toFixed(1)}, length(vViewPosition)),
          1.0 - smoothstep(${above.toFixed(2)}, ${(above + 0.7).toFixed(2)}, vFadeY));
        if (fadeK < 0.999 && fadeK <= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;`);
  });
}

export function nearFadePoints(mat, { from = 22, to = 30 } = {}) {
  return chain(mat, `fadepts${from},${to}`, (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>',
      `gl_PointSize *= smoothstep(${from.toFixed(1)}, ${to.toFixed(1)}, length(mvPosition.xyz));\n#include <fog_vertex>`);
  });
}

export function nightTame(mat, amount = 0.42) {
  return chain(mat, `night${amount}`, (shader) => {
    shader.uniforms.uNightTame = NIGHT;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNightTame;')
      .replace('#include <opaque_fragment>', `{
          float nl = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
          outgoingLight = mix(outgoingLight, mix(vec3(nl), outgoingLight, 0.55) * ${(1 - amount).toFixed(2)}, uNightTame);
        }
        #include <opaque_fragment>`);
  });
}

export function nearCullSprite(mat, within = 26) {
  return chain(mat, `cull${within}`, (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>',
      `if (length(mvPosition.xyz) < ${within.toFixed(1)}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);\n#include <fog_vertex>`);
  });
}
