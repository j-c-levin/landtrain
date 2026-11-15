import { Soundscape } from './soundscape.js';
import { DEFAULT_SETTINGS, masterLevel } from './model.js';

const BASE = {
  speed: 0, speed01: 0, crank: null, eff01: 0.88, wear01: 0.08,
  night: 0, dusk: 0, biome: 0, water: 0,
  mode: 'inhabit', mapBlend: 0, level: 'deck', x: 12, moving: false, climbing: false, walkPhase: 0,
  tend: null, pour: 0, music: true,
};
const LEVEL = masterLevel(DEFAULT_SETTINGS);
const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const chime = (at, kind) => ({ at, run: (scape, now) => scape.chime(kind, now) });

// Offline stand-ins for moments of play: `at(t)` overrides the base state.
export const SCENARIOS = {
  'prairie-day-cruise': { dur: 16, at: () => ({ speed01: 0.9, level: 'roof', x: 0 }) },
  'prairie-day-cruise-lite': { dur: 16, lite: true, at: () => ({ speed01: 0.9, level: 'roof', x: 0 }) },
  'prairie-day-idle-engine-room': { dur: 16, at: () => ({ level: 'deck', x: -0.8 }) },
  'depart-from-cab': {
    dur: 18,
    at: (t) => ({ mode: 'cabin', level: 'roof', x: 20, speed01: t < 3 ? 0 : 0.92 * (1 - Math.exp(-(t - 3) * 0.45)) }),
  },
  'cruise-living-car': { dur: 14, at: () => ({ speed01: 0.9, level: 'deck', x: -18 }) },
  'cruise-engine-room': { dur: 14, at: () => ({ speed01: 0.9, level: 'deck', x: 0 }) },
  'cruise-undercarriage': { dur: 14, at: () => ({ speed01: 0.9, level: 'under', x: -5 }) },
  'worn-and-wheezy': { dur: 14, at: () => ({ speed01: 0.5, level: 'under', x: -5, eff01: 0.15, wear01: 0.9 }) },
  'prairie-dusk-cruise': { dur: 16, at: () => ({ speed01: 0.8, level: 'roof', x: 0, dusk: 1 }) },
  'prairie-night-idle': { dur: 20, at: () => ({ level: 'roof', x: -10, night: 1 }) },
  'grass-river-day-rest': { dur: 18, at: () => ({ mode: 'book', biome: 1, water: 1 }) },
  'grass-river-night': { dur: 20, at: () => ({ level: 'roof', x: -10, biome: 1, water: 0.8, night: 1, speed01: 0.3 }) },
  'chart-in-and-out': {
    dur: 16,
    at: (t) => {
      const chart = ramp(t, 2, 3.5) * (1 - ramp(t, 10, 11.5));
      const inMap = t >= 2 && t < 10;
      return {
        mode: inMap ? 'map' : 'cabin', mapBlend: chart, level: 'roof', x: 20,
        speed01: t < 2 ? 0.9 : inMap ? 0.9 * Math.exp(-(t - 2) * 2.2) : 0.9 * (1 - Math.exp(-(t - 10) * 0.45)),
      };
    },
    actions: [chime(2, 'rise'), chime(5, 'waypoint'), chime(6, 'waypoint'), chime(7.2, 'waypoint'), chime(10, 'soft')],
  },
  'stop-and-sigh': {
    dur: 14,
    at: (t) => ({ level: 'roof', x: 0, speed01: t < 5 ? 0.9 : 0.9 * Math.exp(-(t - 5) * 2.2) }),
    actions: [chime(8, 'arrive')],
  },
  'interface-sounds': {
    dur: 21,
    at: (t) => ({
      music: false, level: t > 10.5 && t < 12.5 ? 'roof' : 'deck', x: -0.8,
      moving: t > 7 && t < 12.5, climbing: t > 9 && t < 10.5,
      tend: t > 13 && t < 15.5 ? 'engine' : t > 15.5 && t < 18 ? 'tread' : null,
      pour: ramp(t, 18.2, 18.4) * (1 - ramp(t, 20.2, 20.4)),
    }),
    actions: [chime(0.5, 'soft'), chime(1.6, 'waypoint'), chime(2.4, 'rise'), chime(3.8, 'done'), chime(5, 'arrive')],
  },
  'mute-and-unmute': {
    dur: 12,
    at: () => ({ speed01: 0.9, level: 'roof', x: 0 }),
    actions: [
      { at: 4, run: (scape, now) => scape.setMaster(0, now) },
      { at: 8, run: (scape, now) => scape.setMaster(LEVEL, now) },
    ],
  },
  'music-alone': { dur: 40, solo: 'music', at: () => ({ mode: 'book' }) },
  'everything-at-once': {
    dur: 12,
    at: (t) => ({
      speed01: t < 0.3 ? 0 : 1, level: 'under', x: 0, eff01: 1, wear01: 1, biome: 0.5, water: 1,
      night: 0.5, dusk: 0.5, pour: 1, tend: 'tread', moving: true,
    }),
    actions: [chime(1, 'arrive'), chime(3, 'arrive'), chime(3.1, 'done'), chime(5, 'rise'), chime(7, 'arrive'), chime(9, 'done')],
  },
};

export async function renderClip(name, { solo = null, sampleRate = 44100 } = {}) {
  const sc = SCENARIOS[name];
  const ctx = new OfflineAudioContext(2, Math.floor(sampleRate * sc.dur), sampleRate);
  const scape = new Soundscape(ctx, { lite: !!sc.lite, solo: solo ?? sc.solo ?? null });
  scape.setMaster(LEVEL, 0, 0.05);
  const s = { ...BASE };
  const actions = [...(sc.actions ?? [])].sort((a, b) => a.at - b.at);
  const dt = 1 / 60;
  for (let i = 0; i * dt < sc.dur; i++) {
    const t = i * dt;
    Object.assign(s, sc.at(t));
    s.speed = s.speed01 * 7;
    if (s.moving) s.walkPhase += dt * (s.climbing ? 7 : 11);
    while (actions.length && actions[0].at <= t) actions.shift().run(scape, t);
    scape.step(t, dt, s);
  }
  return ctx.startRendering();
}
