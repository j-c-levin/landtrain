import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_TIERS,
  createQualityMonitor,
  lowerQualityTier,
  selectInitialQuality,
} from '../src/quality.js';

test('quality policies respect roadmap rendering caps', () => {
  assert.equal(QUALITY_TIERS.low.dpr, 1);
  assert.ok(QUALITY_TIERS.low.shadowMapSize <= 1024);
  assert.ok(QUALITY_TIERS.medium.dpr <= 1.5);
  assert.ok(QUALITY_TIERS.high.dpr <= 2);
  assert.equal(QUALITY_TIERS.low.finishing.postProcessing, false);
  assert.equal(QUALITY_TIERS.medium.finishing.postProcessing, false);
});

test('forced quality tier overrides capability selection', () => {
  assert.equal(selectInitialQuality({ forcedTier: 'low', deviceMemory: 32, hardwareConcurrency: 16 }), 'low');
  assert.equal(selectInitialQuality({ forcedTier: 'high', deviceMemory: 2, hardwareConcurrency: 2 }), 'high');
});

test('initial selection is conservative when capabilities are weak or unknown', () => {
  assert.equal(selectInitialQuality({}), 'medium');
  assert.equal(selectInitialQuality({ deviceMemory: 4, hardwareConcurrency: 8 }), 'low');
  assert.equal(selectInitialQuality({ deviceMemory: 16, hardwareConcurrency: 4 }), 'low');
  assert.equal(selectInitialQuality({
    deviceMemory: 16,
    hardwareConcurrency: 12,
    devicePixelRatio: 3,
    viewportWidth: 1440,
    viewportHeight: 900,
  }), 'low');
});

test('high requires clearly strong capabilities and a bounded pixel load', () => {
  assert.equal(selectInitialQuality({
    deviceMemory: 8,
    hardwareConcurrency: 8,
    devicePixelRatio: 1,
    viewportWidth: 1440,
    viewportHeight: 900,
  }), 'high');
  assert.equal(selectInitialQuality({ deviceMemory: 8, hardwareConcurrency: 8 }), 'medium');
});

test('monitor downgrades only after sustained poor frame time', () => {
  const monitor = createQualityMonitor('high', { graceMs: 100, sustainMs: 100, cooldownMs: 200, smoothing: 1 });
  for (let i = 0; i < 3; i++) assert.equal(monitor.sample(25), null);
  assert.equal(monitor.sample(25), 'medium');
  assert.equal(monitor.metrics.tier, 'medium');
});

test('monitor hysteresis requires sustained recovery and never upgrades', () => {
  const monitor = createQualityMonitor('high', {
    graceMs: 0,
    sustainMs: 100,
    recoveryMs: 64,
    cooldownMs: 0,
    smoothing: 1,
  });
  for (let i = 0; i < 3; i++) monitor.sample(25);
  for (let i = 0; i < 3; i++) monitor.sample(16);
  assert.equal(monitor.metrics.poorMs, 75);
  monitor.sample(16);
  assert.equal(monitor.metrics.poorMs, 0);
  for (let i = 0; i < 100; i++) assert.equal(monitor.sample(16), null);
  assert.equal(monitor.metrics.tier, 'high');
  assert.equal(lowerQualityTier('low'), 'low');
});

test('monitor ignores visibility-scale gaps and reset clears pressure', () => {
  const monitor = createQualityMonitor('medium', { graceMs: 0, sustainMs: 50, cooldownMs: 0, smoothing: 1 });
  assert.equal(monitor.sample(1000), null);
  monitor.sample(35);
  monitor.resetTiming();
  assert.equal(monitor.metrics.poorMs, 0);
  assert.equal(monitor.metrics.emaFrameMs, 0);
});
