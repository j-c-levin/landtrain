import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_TIERS,
  createQualityMonitor,
  createResolutionGovernor,
  lowerQualityTier,
  renderScale,
  selectInitialQuality,
} from '../src/quality.js';

test('pixel ratio never rises as tiers fall, and phones stay near 1.5', () => {
  const { low, medium, high } = QUALITY_TIERS;
  assert.ok(low.pixelRatio <= medium.pixelRatio && medium.pixelRatio <= high.pixelRatio);
  assert.ok(high.pixelRatio <= 1.5);
  assert.ok(low.pixelBudget <= medium.pixelBudget && medium.pixelBudget <= high.pixelBudget);
  assert.ok(low.shadowMapSize <= 1024);
  assert.equal(low.finishing.postProcessing, false);
  assert.equal(medium.finishing.postProcessing, false);
});

test('render scale is capped per tier and bounded by the pixel budget', () => {
  const { low, medium, high } = QUALITY_TIERS;
  assert.equal(renderScale(low, 1, 390, 844), 1);
  assert.equal(renderScale(low, 3, 390, 844), low.pixelRatio);
  assert.ok(renderScale(low, 3, 390, 844) < renderScale(medium, 3, 390, 844));
  assert.ok(390 * 844 * low.pixelRatio ** 2 <= low.pixelBudget);
  assert.equal(renderScale(low, 3, 1440, 900), 1);
  assert.equal(renderScale(high, 1, 1440, 900), 1);
  assert.equal(renderScale(high, 2, 1440, 900), 1.5);
  const big = renderScale(high, 2, 1920, 1080);
  assert.ok(big > 1 && big < 1.5 && 1920 * 1080 * big * big <= high.pixelBudget + 1);
  assert.equal(renderScale(high, 2, 4000, 2000), 1);
  assert.ok(Math.abs(renderScale(medium, 3, 390, 844, 0.8) - 1.2) < 1e-9);
});

test('forced quality tier overrides capability selection', () => {
  assert.equal(selectInitialQuality({ forcedTier: 'low', deviceMemory: 32, hardwareConcurrency: 16 }), 'low');
  assert.equal(selectInitialQuality({ forcedTier: 'high', deviceMemory: 2, hardwareConcurrency: 2 }), 'high');
});

test('initial selection is conservative when capabilities are weak or unknown', () => {
  assert.equal(selectInitialQuality({}), 'medium');
  assert.equal(selectInitialQuality({ deviceMemory: 4, hardwareConcurrency: 8 }), 'low');
  assert.equal(selectInitialQuality({ deviceMemory: 16, hardwareConcurrency: 2 }), 'low');
  assert.equal(selectInitialQuality({ deviceMemory: 8, hardwareConcurrency: 8, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' }), 'low');
  assert.equal(selectInitialQuality({ deviceMemory: 8, hardwareConcurrency: 8, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620)' }), 'medium');
});

test('phones and tablets start on low whatever they report', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(selectInitialQuality({ userAgent: iphone, hardwareConcurrency: 6, gpu: 'Apple GPU' }), 'low');
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  assert.equal(selectInitialQuality({ userAgent: ipad, platform: 'MacIntel', maxTouchPoints: 5, hardwareConcurrency: 8 }), 'low');
});

test('desktops with strong capabilities start on high regardless of screen size', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  assert.equal(selectInitialQuality({
    userAgent: mac, platform: 'macOS', maxTouchPoints: 0, deviceMemory: 8, hardwareConcurrency: 10,
    gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
  }), 'high');
  assert.equal(selectInitialQuality({ userAgent: mac, platform: 'MacIntel', hardwareConcurrency: 8, gpu: 'Apple GPU' }), 'high');
  assert.equal(selectInitialQuality({ deviceMemory: 8, hardwareConcurrency: 4 }), 'medium');
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

const feed = (governor, ms, count) => {
  const changes = [];
  for (let i = 0; i < count; i++) {
    const next = governor.sample(typeof ms === 'function' ? ms(governor.scale) : ms);
    if (next !== null) changes.push(next);
  }
  return changes;
};

test('resolution governor sheds pixels under sustained load down to its floor', () => {
  const governor = createResolutionGovernor({ warmupMs: 0, settleMs: 100, smoothing: 1 });
  assert.deepEqual(feed(governor, 16.7, 600), []);
  const down = feed(governor, (scale) => 12 + 30 * scale * scale, 400);
  assert.ok(down.length >= 2);
  for (let i = 1; i < down.length; i++) assert.ok(down[i] < down[i - 1]);
  assert.equal(governor.scale, 0.75);
  assert.equal(governor.exhausted, true);
});

test('resolution governor recovers slowly and backs off after failed probes', () => {
  const governor = createResolutionGovernor({ warmupMs: 0, settleMs: 0, smoothing: 1, upHoldMs: 1000 });
  const load = (scale) => 8 + 17 * scale * scale;
  feed(governor, load, 60);
  const low = governor.scale;
  assert.ok(low < 1);
  assert.equal(feed(governor, 16, 50).length, 0);
  const up = feed(governor, 16, 20);
  assert.equal(up.length, 1);
  assert.ok(up[0] > low);
  feed(governor, load, 60);
  assert.ok(governor.metrics.upHold > 1000);
});

test('resolution governor gives up when shedding pixels buys nothing', () => {
  const governor = createResolutionGovernor({ warmupMs: 0, settleMs: 0, smoothing: 1 });
  const changes = feed(governor, 33.3, 600);
  assert.equal(changes.at(-1), 1);
  assert.equal(governor.scale, 1);
  assert.equal(governor.exhausted, true);
  assert.deepEqual(feed(governor, 33.3, 600), []);
});

test('resolution governor holds steady at the refresh rate and ignores stalls', () => {
  const governor = createResolutionGovernor({ warmupMs: 0, settleMs: 0, smoothing: 0.1 });
  for (let i = 0; i < 2000; i++) assert.equal(governor.sample(i % 30 === 0 ? 33.4 : 16.7), null);
  assert.equal(governor.sample(1000), null);
  assert.equal(governor.scale, 1);
});
