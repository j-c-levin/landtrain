import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installLightChunks, legendreCoefficients, envZonal } from '../src/atmosphere/light-chunks.js';

installLightChunks();

test('light chunk patches all find their targets', () => {
  const lights = THREE.ShaderChunk.lights_fragment_begin;
  assert.equal(lights.match(/dot\( geometryNormal, directLight\.direction \) > - 0\.05/g).length, 3);
  assert.equal(lights.match(/if \( directLight\.visible \) RE_Direct\(/g).length, 3);
  const shadows = THREE.ShaderChunk.shadowmap_pars_fragment;
  assert.match(shadows, /shadowIntensity <= 0\.0 \) return 1\.0/);
  assert.match(shadows, /sCorners != 4\.0 \* sCentre/);
  const env = THREE.ShaderChunk.envmap_physical_pars_fragment;
  assert.match(env, /return PI \* envAnalytic\( envMapRotation \* worldNormal/);
  assert.match(env, /return envAnalytic\( envMapRotation \* reflectVec, envSigma\( roughness \) \)/);
});

test('the zonal series reproduces the studio sky away from the horizon seam', () => {
  const coeffs = legendreCoefficients();
  for (const y of [-0.9, -0.5, 0.3, 0.6, 0.95]) {
    let p0 = 1;
    let p1 = y;
    const sum = coeffs[0].map((c, i) => c + coeffs[1][i] * y);
    for (let l = 2; l < coeffs.length; l++) {
      const p = ((2 * l - 1) * y * p1 - (l - 1) * p0) / l;
      p0 = p1;
      p1 = p;
      for (let c = 0; c < 3; c++) sum[c] += coeffs[l][c] * p;
    }
    const want = envZonal(y);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(sum[c] - want[c]) < 0.08, `y=${y} channel ${c}: ${sum[c]} vs ${want[c]}`);
  }
});
