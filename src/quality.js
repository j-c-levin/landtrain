export const QUALITY_ORDER = Object.freeze(['low', 'medium', 'high']);

export const QUALITY_TIERS = Object.freeze({
  low: Object.freeze({
    dpr: 1,
    dprCeiling: 2,
    pixelBudget: 900_000,
    antialias: true,
    shadowMapSize: 1024,
    shadowType: 'pcf',
    particleDensity: 0.45,
    slowUpdateHz: 15,
    finishing: Object.freeze({ postProcessing: false, enhancedAtmosphere: false }),
  }),
  medium: Object.freeze({
    dpr: 1.5,
    antialias: true,
    shadowMapSize: 1536,
    shadowType: 'pcf',
    particleDensity: 0.7,
    slowUpdateHz: 30,
    finishing: Object.freeze({ postProcessing: false, enhancedAtmosphere: false }),
  }),
  high: Object.freeze({
    dpr: 2,
    antialias: true,
    shadowMapSize: 2048,
    shadowType: 'pcf-soft',
    particleDensity: 1,
    slowUpdateHz: 60,
    finishing: Object.freeze({ postProcessing: true, enhancedAtmosphere: true }),
  }),
});

export function renderScale(policy, devicePixelRatio, width, height) {
  const device = devicePixelRatio || 1;
  if (!policy.pixelBudget || !(width * height > 0)) return Math.min(device, policy.dpr);
  const fit = Math.sqrt(policy.pixelBudget / (width * height));
  return Math.min(device, Math.max(policy.dpr, Math.min(policy.dprCeiling, fit)));
}

export function selectInitialQuality({
  forcedTier,
  deviceMemory,
  hardwareConcurrency,
  devicePixelRatio = 1,
  viewportWidth = 0,
  viewportHeight = 0,
} = {}) {
  if (QUALITY_TIERS[forcedTier]) return forcedTier;

  const memory = Number(deviceMemory) || 0;
  const cores = Number(hardwareConcurrency) || 0;
  const pixels = viewportWidth * viewportHeight * Math.max(1, devicePixelRatio) ** 2;

  if ((memory && memory <= 4) || (cores && cores <= 4) || pixels > 5_000_000) return 'low';
  if (memory >= 8 && cores >= 8 && pixels > 0 && pixels <= 3_000_000) return 'high';
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

  function sample(frameMs) {
    if (!(frameMs > 0) || frameMs > 250) return null;

    ageMs += frameMs;
    cooldownRemainingMs = Math.max(0, cooldownRemainingMs - frameMs);
    emaFrameMs += (frameMs - emaFrameMs) * (emaFrameMs ? smoothing : 1);

    const poorThreshold = tier === 'high' ? 22 : 30;
    const recoveryThreshold = tier === 'high' ? 18 : 24;
    if (emaFrameMs >= poorThreshold) {
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
