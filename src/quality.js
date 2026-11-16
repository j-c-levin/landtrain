export const QUALITY_ORDER = Object.freeze(['low', 'medium', 'high']);

export const QUALITY_TIERS = Object.freeze({
  low: Object.freeze({
    pixelRatio: 1.3,
    pixelBudget: 1_000_000,
    antialias: true,
    shadowMapSize: 1024,
    shadowType: 'pcf',
    particleDensity: 0.45,
    slowUpdateHz: 15,
    finishing: Object.freeze({ postProcessing: false, enhancedAtmosphere: false }),
  }),
  medium: Object.freeze({
    pixelRatio: 1.5,
    pixelBudget: 2_400_000,
    antialias: true,
    shadowMapSize: 1536,
    shadowType: 'pcf',
    particleDensity: 0.7,
    slowUpdateHz: 30,
    finishing: Object.freeze({ postProcessing: false, enhancedAtmosphere: false }),
  }),
  high: Object.freeze({
    pixelRatio: 1.5,
    pixelBudget: 3_600_000,
    antialias: true,
    shadowMapSize: 2048,
    shadowType: 'pcf-soft',
    particleDensity: 1,
    slowUpdateHz: 60,
    finishing: Object.freeze({ postProcessing: true, enhancedAtmosphere: true }),
  }),
});

export function renderScale(policy, devicePixelRatio, width, height, scale = 1) {
  const device = devicePixelRatio || 1;
  let ratio = Math.min(device, policy.pixelRatio);
  if (policy.pixelBudget && width * height > 0) {
    ratio = Math.min(ratio, Math.max(Math.min(device, 1), Math.sqrt(policy.pixelBudget / (width * height))));
  }
  return ratio * scale;
}

const MOBILE_UA = /iPhone|iPad|iPod|Android|Mobile/i;
const SOFTWARE_GPU = /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render/i;
const WEAK_GPU = /Intel|Mali-[GT][0-9]{1,2}\b|Adreno \(TM\) [1-5][0-9]{2}\b|PowerVR/i;

export function isMobileDevice({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  return MOBILE_UA.test(userAgent) || (/Mac/.test(platform) && maxTouchPoints > 1);
}

export function selectInitialQuality({
  forcedTier,
  deviceMemory,
  hardwareConcurrency,
  userAgent = '',
  platform = '',
  maxTouchPoints = 0,
  gpu = '',
} = {}) {
  if (QUALITY_TIERS[forcedTier]) return forcedTier;

  const memory = Number(deviceMemory) || 0;
  const cores = Number(hardwareConcurrency) || 0;

  if (SOFTWARE_GPU.test(gpu)) return 'low';
  if (isMobileDevice({ userAgent, platform, maxTouchPoints })) return 'low';
  if ((memory && memory <= 4) || (cores && cores < 4)) return 'low';
  if (WEAK_GPU.test(gpu)) return 'medium';
  if ((!memory || memory >= 8) && cores >= 8) return 'high';
  return 'medium';
}

export function lowerQualityTier(tier) {
  const index = QUALITY_ORDER.indexOf(tier);
  return index > 0 ? QUALITY_ORDER[index - 1] : tier;
}

export function createQualityMonitor(initialTier, {
  graceMs = 5000,
  sustainMs = 4000,
  recoveryMs = 1500,
  cooldownMs = 10000,
  smoothing = 0.08,
} = {}) {
  let tier = QUALITY_TIERS[initialTier] ? initialTier : 'medium';
  let ageMs = 0;
  let poorMs = 0;
  let goodMs = 0;
  let cooldownRemainingMs = 0;
  let emaFrameMs = 0;

  function sample(frameMs, pressured = true) {
    if (!(frameMs > 0) || frameMs > 250) return null;

    ageMs += frameMs;
    cooldownRemainingMs = Math.max(0, cooldownRemainingMs - frameMs);
    emaFrameMs += (frameMs - emaFrameMs) * (emaFrameMs ? smoothing : 1);

    const poorThreshold = tier === 'high' ? 22 : 30;
    const recoveryThreshold = tier === 'high' ? 18 : 24;
    if (emaFrameMs >= poorThreshold && pressured) {
      poorMs += frameMs;
      goodMs = 0;
    } else if (emaFrameMs <= recoveryThreshold) {
      goodMs += frameMs;
      if (goodMs >= recoveryMs) {
        poorMs = 0;
        goodMs = 0;
      }
    } else {
      goodMs = 0;
    }

    if (tier === 'low' || ageMs < graceMs || cooldownRemainingMs > 0 || poorMs < sustainMs) return null;

    tier = lowerQualityTier(tier);
    poorMs = 0;
    goodMs = 0;
    cooldownRemainingMs = cooldownMs;
    return tier;
  }

  function resetTiming() {
    poorMs = 0;
    goodMs = 0;
    emaFrameMs = 0;
  }

  function setTier(nextTier) {
    if (!QUALITY_TIERS[nextTier]) return false;
    tier = nextTier;
    ageMs = 0;
    cooldownRemainingMs = cooldownMs;
    resetTiming();
    return true;
  }

  return {
    sample,
    resetTiming,
    setTier,
    get metrics() {
      return { tier, emaFrameMs, poorMs, goodMs, ageMs, cooldownRemainingMs };
    },
  };
}

export function createResolutionGovernor({
  minScale = 0.75,
  targetMs = 1000 / 60,
  slackMs = 2.5,
  warmupMs = 2500,
  settleMs = 600,
  downHoldMs = 800,
  upHoldMs = 6000,
  maxUpHoldMs = 90000,
  probeMs = 4000,
  giveUpMs = 60000,
  maxGiveUpMs = 600000,
  smoothing = 0.1,
} = {}) {
  let scale = 1;
  let emaFrameMs = 0;
  let poorMs = 0;
  let goodMs = 0;
  let settleRemainingMs = warmupMs;
  let upHold = upHoldMs;
  let sinceUpMs = Infinity;
  let descentFromMs = 0;
  let pausedMs = 0;
  let giveUp = giveUpMs;

  const quantise = (value) => Math.round(Math.min(1, Math.max(minScale, value)) * 100) / 100;

  function change(next) {
    if (next === scale) return null;
    scale = next;
    emaFrameMs = 0;
    poorMs = 0;
    goodMs = 0;
    settleRemainingMs = settleMs;
    return scale;
  }

  function sample(frameMs) {
    if (!(frameMs > 0) || frameMs > 250) return null;
    sinceUpMs += frameMs;
    if (pausedMs > 0) {
      pausedMs -= frameMs;
      return null;
    }
    if (settleRemainingMs > 0) {
      settleRemainingMs -= frameMs;
      return null;
    }
    emaFrameMs += (frameMs - emaFrameMs) * (emaFrameMs ? smoothing : 1);

    if (emaFrameMs > targetMs + slackMs) {
      poorMs += frameMs;
      goodMs = 0;
    } else if (emaFrameMs < targetMs + 1) {
      goodMs += frameMs;
      poorMs = 0;
    } else {
      poorMs = Math.max(0, poorMs - frameMs);
      goodMs = 0;
    }

    if (poorMs >= downHoldMs) {
      if (scale <= minScale) {
        if (descentFromMs && emaFrameMs >= descentFromMs * 0.93) {
          descentFromMs = 0;
          pausedMs = giveUp;
          giveUp = Math.min(maxGiveUpMs, giveUp * 2);
          return change(1);
        }
        poorMs = 0;
        return null;
      }
      if (scale === 1) descentFromMs = emaFrameMs;
      if (sinceUpMs < probeMs) upHold = Math.min(maxUpHoldMs, upHold * 2);
      const factor = Math.min(0.94, Math.max(0.85, Math.sqrt(targetMs / emaFrameMs)));
      return change(quantise(scale * factor));
    }

    if (goodMs >= upHold && scale < 1) {
      if (sinceUpMs >= probeMs + upHold) upHold = Math.max(upHoldMs, upHold / 2);
      sinceUpMs = 0;
      const next = quantise(scale * 1.06);
      if (next === 1) descentFromMs = 0;
      return change(next);
    }
    return null;
  }

  function resetTiming() {
    emaFrameMs = 0;
    poorMs = 0;
    goodMs = 0;
    settleRemainingMs = settleMs;
  }

  function reset() {
    descentFromMs = 0;
    pausedMs = 0;
    upHold = upHoldMs;
    change(1);
    settleRemainingMs = warmupMs;
  }

  return {
    sample,
    resetTiming,
    reset,
    get scale() { return scale; },
    get exhausted() { return scale <= minScale || pausedMs > 0; },
    get metrics() {
      return { scale, emaFrameMs, poorMs, goodMs, upHold, pausedMs };
    },
  };
}
