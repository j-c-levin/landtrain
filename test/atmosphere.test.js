import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY_KEYS_PRAIRIE, SKY_KEYS_GRASSLAND, GRADE_LOOK, SKY_LOOK } from '../src/look.js';
import { QUALITY_TIERS } from '../src/quality.js';

const hue = (c) => {
  const hsl = {};
  c.getHSL(hsl);
  return hsl.h;
};

test('sky tables share keyframe times and wrap cleanly', () => {
  assert.equal(SKY_KEYS_PRAIRIE.length, SKY_KEYS_GRASSLAND.length);
  for (const keys of [SKY_KEYS_PRAIRIE, SKY_KEYS_GRASSLAND]) {
    assert.equal(keys[0].t, 0);
    assert.equal(keys.at(-1).t, 1);
    for (let i = 1; i < keys.length; i++) assert.ok(keys[i].t > keys[i - 1].t);
    const first = keys[0];
    const last = keys.at(-1);
    for (const field of ['fog', 'hemiSky', 'dirCol', 'glow', 'belt']) assert.equal(first[field].getHex(), last[field].getHex());
    for (const field of ['hemiI', 'dirI', 'exp', 'env', 'glowI', 'beltI', 'stars']) assert.equal(first[field], last[field]);
  }
  SKY_KEYS_PRAIRIE.forEach((key, i) => assert.equal(key.t, SKY_KEYS_GRASSLAND[i].t));
});

test('every sky key carries a finite value for every channel', () => {
  for (const key of [...SKY_KEYS_PRAIRIE, ...SKY_KEYS_GRASSLAND]) {
    assert.equal(key.sky.length, 4);
    for (const field of ['hemiI', 'dirI', 'cloudOp', 'stars', 'exp', 'env', 'glowI', 'beltI']) {
      assert.ok(Number.isFinite(key[field]), `${field} at t=${key.t}`);
    }
    for (const field of ['fog', 'hemiSky', 'hemiGround', 'dirCol', 'cloud', 'glow', 'belt']) {
      assert.ok(key[field].isColor, `${field} at t=${key.t}`);
    }
  }
});

test('dusk holds a real hue range: cool zenith and fill against a warm key and glow', () => {
  for (const keys of [SKY_KEYS_PRAIRIE, SKY_KEYS_GRASSLAND]) {
    const dusk = keys.find((k) => k.t === 0.44);
    const cool = (c) => hue(c) > 0.5 && hue(c) < 0.75;
    const warm = (c) => hue(c) < 0.14;
    assert.ok(cool(dusk.sky[0]), 'zenith');
    assert.ok(cool(dusk.hemiSky), 'sky fill');
    assert.ok(cool(dusk.fog), 'haze');
    assert.ok(warm(dusk.dirCol), 'key');
    assert.ok(warm(dusk.glow), 'glow');
    assert.ok(warm(dusk.sky[3]), 'horizon band');
  }
});

test('only the top tier pays for finishing passes', () => {
  assert.equal(QUALITY_TIERS.low.finishing.postProcessing, false);
  assert.equal(QUALITY_TIERS.medium.finishing.postProcessing, false);
  for (const triple of [GRADE_LOOK.ao, GRADE_LOOK.bloom, GRADE_LOOK.bloomThreshold, GRADE_LOOK.shadowTint, SKY_LOOK.roomFillI, SKY_LOOK.bounceI]) {
    assert.equal(triple.length, 3);
  }
});

test('midday holds a clean cool sky until the golden hour', () => {
  for (const keys of [SKY_KEYS_PRAIRIE, SKY_KEYS_GRASSLAND]) {
    const [noon, hold] = keys;
    assert.ok(hold.t > 0.2 && hold.t < 0.36);
    assert.equal(hold.fog.getHex(), noon.fog.getHex());
    assert.equal(hold.glowI, noon.glowI);
    assert.ok(noon.fog.b > noon.fog.r, 'haze is cool');
    assert.ok(noon.sky[3].b > noon.sky[3].r, 'horizon is cool');
  }
});
