export const INK_NOISE = /* glsl */ `
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
`;

export const SHEET_VERT = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHEET_GLSL = /* glsl */ `
  uniform sampler2D map;
  uniform vec4 uRect;
  uniform float uGrow;
  ${INK_NOISE}
  // > 0 on the paper, < 0 where travel has cut the sheet away
  float sheet(vec2 w) {
    vec2 uv = (w - uRect.xy) * uRect.zw;
    float a = texture2D(map, vec2(uv.x, 1.0 - uv.y)).a;
    a = mix(1.0, a, step(0.0, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y))));
    float n = inkNoise(w * 0.03) * 0.65 + inkNoise(w * 0.1) * 0.35;
    return a + (n - 0.5) * 0.34 - 0.6 + uGrow;
  }
`;

export const SHEET_DEPTH_FRAG = /* glsl */ `
  varying vec2 vWorld;
  ${SHEET_GLSL}
  void main() {
    if (sheet(vWorld) < 0.0) discard;
    gl_FragColor = vec4(0.0);
  }
`;

export const SHEET_FRAG = /* glsl */ `
  uniform sampler2D tLetters;
  uniform float uOpacity;
  uniform float uNight;
  uniform vec3 uPaper;
  uniform vec3 uPaperNight;
  uniform vec3 uFox;
  uniform vec3 uInk;
  uniform vec3 uRhumb;
  uniform vec4 uRose;
  uniform vec3 uLamp;
  uniform float uDusk;
  uniform vec3 uDesk;
  uniform vec4 uKeep;
  varying vec2 vWorld;
  ${SHEET_GLSL}

  float stroke(float d, float px, float wide) {
    return 1.0 - smoothstep(wide, wide + 0.9, d / px);
  }
  // pen hatching that keeps its pitch on screen: every other line fades as the view pulls back
  float hatch(float u, float px, float pitch) {
    float l = log2(px * pitch);
    float s = exp2(floor(l));
    float fine = abs(fract(u / s + 0.5) - 0.5) * s;
    float coarse = abs(fract(u / (s * 2.0) + 0.5) - 0.5) * s * 2.0;
    return max(stroke(coarse, px, 0.45), stroke(fine, px, 0.45) * (1.0 - fract(l)));
  }
  float rhumbs(vec2 d, float px) {
    float seg = 3.14159265 / 8.0;
    float r = length(d);
    float spoke = abs(fract(atan(d.y, d.x) / seg - 0.5) - 0.5) * seg * r;
    float lines = stroke(spoke, px, 0.4) * smoothstep(34.0, 60.0, r);
    lines += stroke(abs(r - 150.0), px, 0.4) + stroke(abs(r - 158.0), px, 0.3) * 0.6;
    return min(lines, 1.0);
  }

  void main() {
    float e = sheet(vWorld);
    float px = max(fwidth(vWorld.x), 1e-4);
    if (e < 0.0) {
      // the sheet stands a little proud of the model and shades it along the cut
      float lifted = sheet(vWorld - vec2(3.2, 3.6));
      float shade = smoothstep(-0.05, 0.04, lifted) * 0.16 + smoothstep(-0.1, 0.0, e) * 0.14;
      gl_FragColor = vec4(vec3(0.07, 0.045, 0.06), shade * uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    float fw = max(fwidth(e), 1e-5);
    float fibre = inkNoise(vWorld * vec2(0.9, 0.42)) * 0.6 + inkNoise(vWorld * 2.3) * 0.4;
    float cloud = inkNoise(vWorld * 0.008);
    vec3 col = uPaper * (1.0 - 0.07 * (fibre - 0.5)) * (1.0 - 0.09 * (cloud - 0.5));
    float fox = smoothstep(0.66, 0.9, inkNoise(vWorld * 0.019 + 70.0)) * (0.5 + 0.5 * inkNoise(vWorld * 0.17));
    col = mix(col, uFox, fox * 0.2);

    // the sheet has been folded into eighths and carried about
    vec2 fold = (fract(vWorld / vec2(1475.0, 780.0) + vec2(0.33, 0.0)) - 0.5) * vec2(1475.0, 780.0);
    vec2 crease = 1.0 - smoothstep(0.0, 9.0, abs(fold));
    col *= 1.0 + 0.05 * (crease.x * sign(fold.x) + crease.y * sign(fold.y));
    col *= 1.0 - 0.1 * max(stroke(abs(fold.x), px, 0.6), stroke(abs(fold.y), px, 0.6)) * (0.4 + 0.6 * cloud);

    // conjecture: dotted form lines where nobody has yet been
    float guess = inkNoise(vWorld * 0.0031 + 9.0) * 5.0 + inkNoise(vWorld * 0.011 + 3.0) * 0.8;
    float form = abs(fract(guess) - 0.5) / max(fwidth(guess), 1e-5);
    float dots = step(0.5, fract((floor(vWorld.x / 4.0) + floor(vWorld.y / 4.0)) * 0.5));
    col = mix(col, uInk, (1.0 - smoothstep(0.4, 1.2, form)) * dots * 0.2 * smoothstep(0.22, 0.34, e));

    vec2 g = abs(fract(vWorld / 100.0 - 0.5) - 0.5) * 100.0;
    col = mix(col, uInk, stroke(min(g.x, g.y), px, 0.4) * 0.15);
    vec2 gi = floor(vWorld / 100.0 + 0.5);
    vec2 tick = abs(vWorld - gi * 100.0);
    float major = step(abs(mod(gi.x, 5.0)) + abs(mod(gi.y, 5.0)), 0.5);
    col = mix(col, uInk, stroke(min(tick.x, tick.y), px, 0.7) * step(max(tick.x, tick.y), 9.0) * major * 0.5);

    col = mix(col, uRhumb, max(rhumbs(vWorld - uRose.xy, px), rhumbs(vWorld - uRose.zw, px)) * 0.24);

    vec2 bd = min(vWorld - uRect.xy, uRect.xy + 1.0 / uRect.zw - vWorld);
    float b = min(bd.x, bd.y);

    // one legend to a stretch of country, kept clear of the border and the cartouche
    vec2 cell = vWorld / vec2(560.0, 330.0);
    cell.x += floor(cell.y) * 0.37;
    vec2 id = floor(cell);
    vec2 at = (fract(cell) - 0.12 - 0.5 * vec2(inkHash(id + 5.0), inkHash(id + 9.0))) / vec2(0.214, 0.182);
    float letters = texture2D(tLetters, vec2(at.x, 1.0 - at.y)).a;
    letters *= step(0.0, min(min(at.x, at.y), min(1.0 - at.x, 1.0 - at.y))) * step(0.3, inkHash(id + 3.0));
    // a legend any part of which would run under the cartouche is left out whole
    vec2 mid = gl_FragCoord.xy + (0.5 - at) * vec2(120.0, -60.0) / px;
    vec2 gap = max(uKeep.xy - mid, mid - uKeep.zw) - vec2(60.0, 30.0) / px;
    letters *= step(12.0, max(gap.x, gap.y)) * smoothstep(40.0, 90.0, b);
    col = mix(col, uInk, letters * 0.55 * smoothstep(0.2, 0.3, e));

    // neat line: a heavy rule, a quarter-league bar inside it, a hairline inside that
    float along = bd.x < bd.y ? vWorld.y : vWorld.x;
    float bar = step(0.5, fract(along / 50.0)) * step(13.0, b) * step(b, 16.0) * 0.75;
    float neat = max(stroke(abs(b - 12.0), px, 1.1), stroke(abs(b - 16.0), px, 0.45));
    neat = max(neat, stroke(abs(b - 21.0), px, 0.3) * 0.7);
    col = mix(col, uInk, max(neat, bar) * 0.85 * step(11.0, b));
    // past the rule the sheet ends and the desk begins
    float off = 1.0 - smoothstep(9.5, 10.5, b);
    col = mix(col, uDesk * (0.9 + 0.2 * fibre) * (1.0 - 0.35 * smoothstep(-14.0, 10.0, b)), off);
    col = mix(col, vec3(1.0, 0.98, 0.92), stroke(abs(b - 10.8), px, 0.6) * 0.6);

    // shore: waterlining, with hatching packed against the coast
    float breakup = inkNoise(vWorld * 0.05 + 40.0);
    float waves = stroke(abs(e - 0.075) / fw * px, px, 0.5) * 0.5
                + stroke(abs(e - 0.135) / fw * px, px, 0.5) * 0.34
                + stroke(abs(e - 0.215) / fw * px, px, 0.5) * 0.2;
    waves *= step(0.3, breakup);
    float band = 1.0 - smoothstep(0.012, 0.07, e - breakup * 0.02);
    waves = max(waves, hatch(vWorld.x - vWorld.y * 0.6, px, 5.0) * band * 0.62);
    col = mix(col, uInk, waves);
    // the cut edge shows the thickness of the sheet, then the inked coast
    col = mix(col, vec3(1.0, 0.98, 0.92), (1.0 - smoothstep(0.6, 1.6, e / fw)) * 0.7);
    float wobble = 0.75 + 0.5 * inkNoise(vWorld * 0.21);
    col = mix(col, uInk, (1.0 - smoothstep(0.9 * wobble, 2.2 * wobble, abs(e / fw - 2.6))) * 0.92);
    col *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.2, e));
    col *= mix(vec3(1.0), vec3(1.0, 0.86, 0.68), uDusk);
    float lamp = smoothstep(0.0, 0.72, 1.0 - length(vWorld - uLamp.xy) * uLamp.z) * uNight;
    col *= mix(vec3(1.0), uPaperNight, uNight - lamp * 0.7);
    col *= 1.0 - lamp * vec3(0.04, 0.12, 0.3);

    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The way you came: a dotted line whose weight holds on screen as the view pulls back.
export const TRAIL_VERT = /* glsl */ `
  attribute vec2 aOff;
  uniform float uScale;
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.xz += aOff * uScale;
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const TRAIL_FRAG = /* glsl */ `
  uniform vec3 uDay;
  uniform vec3 uDark;
  uniform vec3 uLamp;
  uniform float uNight;
  uniform float uOpacity;
  varying vec2 vWorld;
  void main() {
    float lamp = smoothstep(0.0, 0.72, 1.0 - length(vWorld - uLamp.xy) * uLamp.z) * uNight;
    vec3 col = mix(uDay, uDark, smoothstep(0.42, 0.62, uNight - lamp * 0.7));
    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const PEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// The tiers without the lens pass still get the pen: ink wherever the depth breaks.
export const PEN_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uChart;
  uniform float uPxAngle;
  uniform float uReach;
  uniform vec3 uInk;
  varying vec2 vUv;
  ${INK_NOISE}
  float linearZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return (uNear * uFar) / (uFar - d * (uFar - uNear));
  }
  void main() {
    vec3 col = texture2D(tColor, vUv).rgb;
    vec2 px = gl_FragCoord.xy;
    vec2 o = uTexel * uReach;
    float zc = linearZ(vUv);
    float lap = abs(linearZ(vUv - vec2(o.x, 0.0)) + linearZ(vUv + vec2(o.x, 0.0)) - 2.0 * zc)
              + abs(linearZ(vUv - vec2(0.0, o.y)) + linearZ(vUv + vec2(0.0, o.y)) - 2.0 * zc);
    // a 24-bit depth step is this coarse at range; unsubtracted, its banding gets inked as a grid
    float grain = zc * zc * (uFar - uNear) / (uNear * uFar) * 9e-7;
    float m = max(lap - grain, 0.0) / (zc * uPxAngle * uReach);
    float line = smoothstep(0.6, 2.4, m) * (0.72 + 0.28 * inkNoise(px * 0.05 + 11.0));
    float fibre = inkNoise(px * vec2(0.9, 0.35));
    vec3 drawn = mix(col, uInk, line * 0.9) * (1.0 - (fibre - 0.5) * 0.05);
    col = mix(col, drawn, uChart);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
