import { SKY_LOOK } from '../look.js';

const CLOUD_BAND = /* glsl */ `
  uniform sampler2D uCloud;
  uniform float uDrift;
  uniform float uCloudOp;
  vec2 cloudUv(vec3 d, float e) {
    return vec2(atan(d.z, d.x) * 0.15915494 + 0.5 + uDrift, (e - 1.0) / 28.125);
  }
  float cloudBand(float e) {
    float v = (e - 1.0) / 28.125;
    return smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.9, 1.0, v));
  }
`;

export const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const DOME_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uUpper;
  uniform vec3 uLower;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform float uSunVis;
  uniform float uSunSize;
  uniform vec3 uGlow;
  uniform float uGlowI;
  uniform vec3 uBelt;
  uniform float uBeltI;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonCol;
  uniform vec3 uMoonSea;
  uniform float uMoonVis;
  uniform float uNight;
  uniform vec3 uGalaxy;
  uniform vec3 uGalaxyCol;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform vec3 uCloudRim;
  uniform sampler2D uMottle;
  varying vec3 vDir;
  ${CLOUD_BAND}

  float domeHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec3 d = normalize(vDir);
    float e = asin(clamp(d.y, -1.0, 1.0)) * 57.29578;
    vec3 col = mix(uHorizon, uLower, smoothstep(-2.0, 6.0, e));
    col = mix(col, uUpper, smoothstep(3.0, 24.0, e));
    col = mix(col, uZenith, smoothstep(20.0, 74.0, e));

    vec2 sunXZ = normalize(uSunDir.xz + vec2(1e-5));
    float toward = clamp(dot(normalize(d.xz + vec2(1e-5)), sunXZ) * 0.5 + 0.5, 0.0, 1.0);
    float low = 1.0 - smoothstep(0.0, 42.0, e);
    float sd = dot(d, uSunDir);
    float sdp = max(sd, 0.0);

    float belt = smoothstep(1.0, 7.0, e) * (1.0 - smoothstep(9.0, 24.0, e));
    col = mix(col, uBelt, uBeltI * pow(1.0 - toward, 1.5) * belt);
    float scatter = pow(toward, 3.0) * low * low;
    col = mix(col, uGlow, min(0.92, uGlowI * (scatter + 0.55 * pow(sdp, 10.0))));

    float hz = 1.0 - smoothstep(-2.0, 2.5, e);
    col = mix(col, uHaze, hz * (1.0 - 0.8 * min(1.0, uGlowI) * pow(toward, 4.0)));

    vec3 air = col;

    if (uNight > 0.01) {
      float band = exp(-pow(dot(d, uGalaxy) / 0.21, 2.0));
      vec2 guv = d.xz * 0.35 + d.y * 0.11;
      float mottle = texture2D(uMottle, guv * 1.3).r * 0.8 + texture2D(uMottle, guv * 4.1 + 0.31).r * 0.4;
      col += uGalaxyCol * band * (0.25 + mottle) * uNight * smoothstep(4.0, 30.0, e);
    }

    float a2 = 2.0 * (1.0 - sd);
    float r2 = uSunSize * uSunSize;
    float disc = 1.0 - smoothstep(r2 * 0.9, r2, a2);
    float ring = 1.0 - smoothstep(r2 * 2.2, r2 * 2.6, a2);
    col += uSunCol * uSunVis * (0.1 * ring + 0.2 * exp(-a2 / (r2 * 9.0)) + 0.08 * exp(-a2 / (r2 * 70.0)));
    col = mix(col, uSunCol + vec3(0.5, 0.42, 0.24) * (1.0 - a2 / r2), disc * uSunVis);

    float moonLight = 0.0;
    if (uMoonVis > 0.0 && dot(d, uMoonDir) > 0.0) {
      vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
      vec3 mu = cross(uMoonDir, mr);
      vec2 mp = vec2(dot(d, mr), dot(d, mu)) / 0.03;
      float md = length(mp);
      moonLight = uMoonVis * exp(-md * md / 30.0);
      col += uMoonCol * uMoonVis * (0.14 * exp(-md * md / 6.0) + 0.05 * exp(-md * md / 90.0));
      if (md < 1.0) {
        vec2 muv = mp * 0.2 + vec2(0.37, 0.52);
        float n = texture2D(uMottle, muv).r * 0.7 + texture2D(uMottle, muv * 2.9 + 0.2).r * 0.3;
        float seas = 0.6 * smoothstep(0.47, 0.5, n) + 0.4 * smoothstep(0.58, 0.61, n);
        vec3 face = mix(uMoonCol, uMoonSea, seas) * (0.84 + 0.16 * sqrt(1.0 - md * md));
        face *= 1.0 - 0.2 * smoothstep(0.25, 1.0, dot(mp, vec2(-0.74, -0.67)));
        col = mix(col, face, (1.0 - smoothstep(0.94, 1.0, md)) * uMoonVis);
      }
    }

    if (uCloudOp > 0.0) {
      float az = atan(d.z, d.x) * 0.15915494 + 0.5;
      float wisp = texture2D(uCloud, vec2(az * 2.0 + uDrift * 1.7 + 0.37, (e - 14.0) / 44.0)).b;
      wisp *= smoothstep(14.0, 22.0, e) * (1.0 - smoothstep(46.0, 58.0, e));
      vec3 warmLit = uCloudLit + uGlow * uGlowI * 0.5 * pow(toward, 2.0);
      col = mix(col, warmLit, min(1.0, wisp * 1.6) * 0.5 * uCloudOp);

      float band = cloudBand(e);
      if (band > 0.0) {
        vec2 cuv = cloudUv(d, e);
        vec3 c = texture2D(uCloud, cuv).rgb;
        float body = smoothstep(0.35, 0.65, c.r);
        float l = c.g / max(c.r, 0.02);
        float tone = 0.5 * smoothstep(0.27, 0.32, l) + 0.5 * smoothstep(0.66, 0.71, l);
        vec3 lit = uCloudLit + uGlow * uGlowI * 0.4 * pow(toward, 2.0);
        vec3 cc = mix(uCloudShade, lit, tone);
        cc += uSunCol * uSunVis * 0.2 * pow(sdp, 24.0) + uMoonCol * moonLight * (0.05 + 0.16 * tone);
        cc = mix(cc, mix(air * 1.3 + 0.006, uCloudRim, smoothstep(0.88, 0.92, l) * 0.4), uNight);
        float far = 1.0 - smoothstep(4.0, 14.0, e);
        cc = mix(cc, air, far * 0.4);
        col = mix(col, cc, body * band * uCloudOp);
      }
    }

    col += (domeHash(gl_FragCoord.xy) - 0.5) * (0.0012 + 0.012 * dot(col, vec3(0.2126, 0.7152, 0.0722)));
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const STAR_VERT = /* glsl */ `
  ${CLOUD_BAND}
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpark;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPR;
  uniform vec3 uMoonDir;
  uniform float uMoonVis;
  varying float vA;
  varying vec3 vC;
  varying float vSpark;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.55 + 0.45 * sin(uTime * (1.2 + fract(aPhase * 0.731) * 2.8) + aPhase);
    // stars dissolve toward the horizon line of the dome
    vA = uAlpha * mix(0.35, 1.0, tw) * smoothstep(40.0, 420.0, position.y);
    vec3 sdir = normalize(position);
    float se = asin(sdir.y) * 57.29578;
    float cover = smoothstep(0.35, 0.65, texture2D(uCloud, cloudUv(sdir, se)).r) * cloudBand(se);
    vA *= 1.0 - cover * uCloudOp;
    vA *= 1.0 - uMoonVis * (1.0 - smoothstep(0.036, 0.085, distance(sdir, uMoonDir)));
    vC = aColor;
    vSpark = aSpark;
    gl_PointSize = aSize * uPR * mix(0.8, 1.25, tw);
    gl_Position = projectionMatrix * mv;
  }
`;

export const STAR_FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vC;
  varying float vSpark;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float core = smoothstep(1.0, 0.1, d);
    float flare = 0.0;
    if (vSpark > 0.5) {
      flare = max(
        (1.0 - smoothstep(0.0, 0.16, abs(p.y))) * (1.0 - abs(p.x)),
        (1.0 - smoothstep(0.0, 0.16, abs(p.x))) * (1.0 - abs(p.y))
      );
    }
    float a = vA * max(core, flare * 0.85);
    if (a < 0.012) discard;
    gl_FragColor = vec4(vC, a);
  }
`;

export const FIREFLY_VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPR;
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.31 + aPhase * 13.0) * 7.0;
    p.z += cos(uTime * 0.27 + aPhase * 17.0) * 7.0;
    p.y += sin(uTime * 0.50 + aPhase * 29.0) * 1.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float fl = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(uTime * 1.8 + aPhase * 40.0));
    vA = uAlpha * fl;
    gl_PointSize = clamp(190.0 / -mv.z, 1.5, 16.0) * uPR;
    gl_Position = projectionMatrix * mv;
  }
`;

export const FIREFLY_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float a = vA * smoothstep(1.0, 0.0, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(${SKY_LOOK.fireflyGlsl}, a);
  }
`;
