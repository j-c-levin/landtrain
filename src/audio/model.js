import { CAB_FROM_X } from '../constants.js';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
const geo = (a, b, t) => a * (b / a) ** t;
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// ------------------------------------------------------------- settings
export const STORAGE_KEY = 'landtrain.audio.v1';
export const DEFAULT_SETTINGS = Object.freeze({ volume: 0.8, muted: false, music: true });
export const MASTER_PEAK = 0.9;

export function parseSettings(raw) {
  let data = null;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    data = null;
  }
  const volume = data && data.volume !== null && data.volume !== '' ? Number(data.volume) : NaN;
  return {
    volume: Number.isFinite(volume) ? clamp01(volume) : DEFAULT_SETTINGS.volume,
    muted: typeof data?.muted === 'boolean' ? data.muted : DEFAULT_SETTINGS.muted,
    music: typeof data?.music === 'boolean' ? data.music : DEFAULT_SETTINGS.music,
  };
}

export function masterLevel(settings) {
  return settings.muted ? 0 : MASTER_PEAK * clamp01(settings.volume) ** 1.7;
}

// ------------------------------------------------------------- listener
// Where the ear is: how enclosed, how close to the boiler, how exposed.
export function listen(s, out) {
  out.chart = clamp01(s.mapBlend || 0);
  out.rest = s.mode === 'book' ? 1 : 0;
  out.under = 0;
  out.roof = 0;
  if (s.mode === 'book') {
    out.shelter = 0;
    out.engineNear = 0.45;
  } else if (s.level === 'roof') {
    const cab = smooth((s.x - (CAB_FROM_X - 1)) / 2);
    out.shelter = 0.62 * cab;
    out.roof = 1 - cab;
    out.engineNear = 0.5 * smooth(1 - Math.abs(s.x) / 14);
  } else if (s.level === 'under') {
    out.shelter = 0.3;
    out.under = 1;
    out.engineNear = 0.35 * smooth(1 - Math.abs(s.x) / 14);
  } else {
    out.shelter = 0.85;
    out.engineNear = smooth(1 - (Math.abs(s.x) - 5) / 11);
  }
  return out;
}

// ------------------------------------------------------------------ mix
// Every continuous level and cutoff, from the world state and the listener.
export function mixFor(s, L, out) {
  const v = clamp01(s.speed01);
  const eff = clamp01(s.eff01);
  const wear = clamp01(s.wear01);
  const night = clamp01(s.night);
  const dusk = clamp01(s.dusk);
  const biome = clamp01(s.biome);
  const water = clamp01(s.water);
  const open = 1 - L.shelter;
  const evening = Math.max(night, dusk * 0.55);

  out.trainGain = mix(1, 0.22, L.chart) * mix(1, 0.8, L.rest);
  out.trainCut = geo(geo(5200, 1300 + 3000 * L.engineNear, L.shelter), 650, L.chart);
  out.rumble = (0.04 + 0.32 * v) * (0.7 + 0.5 * L.under + 0.2 * L.shelter);
  out.rumbleCut = 55 + 95 * v;
  out.chuff = v > 0.015 ? (0.28 + 0.46 * v) * (0.5 + 0.5 * eff) * (0.6 + 0.6 * L.engineNear) : 0;
  out.chuffFreq = 360 + 480 * v + (1 - eff) * 420;
  out.chuffBody = 0.5 + 1.1 * eff;
  out.tread = v > 0.015 ? (0.3 + 0.7 * v) * (0.3 + 0.36 * wear) * (0.6 + 0.9 * L.under) : 0;
  out.rattle = v * wear ** 1.5 * 0.12 * (0.5 + L.under);
  out.simmer = (0.004 + 0.016 * eff) * (0.3 + 1.3 * L.engineNear) * (1 - 0.5 * v);
  out.crackle = eff * L.engineNear * L.shelter * 0.09;

  out.worldGain = mix(mix(1, 0.5, L.shelter), 0.3, L.chart);
  out.worldCut = geo(geo(9000, 1100, L.shelter), 600, L.chart);
  out.wind = (0.05 + 0.07 * v + 0.045 * L.roof) * mix(1, 0.62, biome) * mix(1, 0.7, night);
  out.windFreq = 420 + 260 * v + 150 * L.roof;
  out.grass = (0.009 + 0.008 * v) * mix(1, 0.55, biome) * mix(1, 0.6, night);
  out.water = water ** 1.5 * 0.16;
  out.drops = Math.max(water * 0.04 * (0.35 + 0.65 * open) * (1 - 0.6 * L.chart), clamp01(s.pour || 0) * 0.06);
  out.dropRate = Math.max(water, clamp01(s.pour || 0) * 1.6);
  out.cricket = evening * 0.04 * mix(0.75, 1, biome) * (1 - 0.45 * v);
  out.birds = (1 - night) * (1 - 0.6 * dusk) * (1 - 0.35 * v);
  out.frogs = water * Math.max(dusk * 0.7, night);
  out.owl = night * (1 - biome) * (1 - 0.5 * v);

  out.music = s.music ? clamp01(0.55 + 0.3 * L.rest + 0.2 * L.chart - 0.15 * v) : 0;
  return out;
}

// --------------------------------------------------------------- rhythm
// Beats fall where `pos` crosses a multiple of `period`. Writes
// [secondsFromNow, beatIndex, ...] for the beats inside the horizon that are
// not yet scheduled and returns the index of the last beat accounted for.
export function beatsDue(pos, rate, horizon, period, last, out) {
  out.length = 0;
  if (!(rate > 1e-4)) return Math.max(last, Math.floor(pos / period));
  const end = Math.floor((pos + rate * horizon) / period);
  let k = Math.max(last + 1, Math.ceil(pos / period));
  if (end - k > 8) k = end - 8;
  for (; k <= end; k++) out.push((k * period - pos) / rate, k);
  return Math.max(last, end);
}

export const CRANK_RATE = 1.7;
export const TREAD_PERIOD = 3.4;
export const TREAD_PAIR = 0.62;
export const CHUFF_ACCENTS = [1, 0.62, 0.8, 0.58];

// --------------------------------------------------------------- events
export function createTracker() {
  return {
    primed: false, moving: false, stillFor: 99, movedFor: 0, sinceWhistle: 99, sinceSigh: 99,
    mode: 'inhabit', stepIndex: 0,
  };
}

// One-shot happenings, read off state edges. `out` fields are reset each call.
export function trackEvents(tr, s, dt, out) {
  out.whistle = false;
  out.sigh = false;
  out.mode = null;
  out.step = null;
  tr.sinceWhistle += dt;
  tr.sinceSigh += dt;

  const moving = tr.moving ? s.speed > 0.25 : s.speed > 0.6;
  if (moving) {
    if (!tr.moving && tr.primed && tr.stillFor > 4 && tr.sinceWhistle > 40) {
      out.whistle = true;
      tr.sinceWhistle = 0;
    }
    tr.movedFor = tr.moving ? tr.movedFor + dt : 0;
    tr.stillFor = 0;
  } else {
    if (tr.moving && tr.movedFor > 3 && tr.sinceSigh > 18) {
      out.sigh = true;
      tr.sinceSigh = 0;
    }
    tr.stillFor += dt;
  }
  tr.moving = moving;

  if (s.mode !== tr.mode) {
    if (tr.primed) out.mode = s.mode === 'map' ? 'map' : tr.mode === 'map' ? 'unmap' : s.mode === 'book' ? 'book' : null;
    tr.mode = s.mode;
  }

  const stepIndex = Math.floor((s.walkPhase || 0) / Math.PI);
  if (stepIndex !== tr.stepIndex) {
    if (tr.primed && s.moving && stepIndex > tr.stepIndex) {
      out.step = s.climbing ? 'rung' : s.level === 'roof' ? 'metal' : s.level === 'under' ? 'ground' : 'wood';
    }
    tr.stepIndex = stepIndex;
  }
  tr.primed = true;
  return out;
}

// ---------------------------------------------------------------- fauna
const note = (at, dur, f0, f1, level = 1) => ({ at, dur, f0, f1, level });

export function faunaPhrase(rand, kind) {
  const notes = [];
  let t = 0;
  if (kind === 'lark') {
    let f = 3000 + rand() * 600;
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const dur = 0.11 + rand() * 0.1;
      notes.push(note(t, dur, f, f * (0.84 + rand() * 0.24), 0.7 + rand() * 0.3));
      t += dur + 0.035 + rand() * 0.06;
      f = Math.max(1750, f * (0.76 + rand() * 0.28));
    }
    for (let i = 0; i < 3; i++) {
      notes.push(note(t, 0.045, f * 1.18, f * 1.3, 0.6));
      t += 0.07;
    }
  } else if (kind === 'warbler') {
    const lo = 3700 + rand() * 500;
    const hi = lo * (1.16 + rand() * 0.1);
    const n = 6 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const dur = 0.05 + rand() * 0.035;
      const f = (i & 1 ? hi : lo) * (1 + i * 0.012);
      notes.push(note(t, dur, f, f * (i & 1 ? 0.95 : 1.06), 0.55 + 0.45 * (i / n)));
      t += dur + 0.028 + rand() * 0.02;
    }
  } else if (kind === 'feebee') {
    const f = 3050 + rand() * 350;
    notes.push(note(0, 0.34, f, f * 0.985, 0.9));
    notes.push(note(0.44, 0.38, f * 0.842, f * 0.83, 1));
    t = 0.86;
  } else if (kind === 'owl') {
    const f = 335 + rand() * 45;
    const pattern = rand() < 0.5 ? [0.3, 0.16, 0.34] : [0.34, 0.34];
    for (const dur of pattern) {
      notes.push(note(t, dur, f * 1.03, f * 0.94, dur > 0.2 ? 1 : 0.7));
      t += dur + 0.16;
    }
  } else if (kind === 'frog') {
    const f = 185 + rand() * 80;
    const croaks = 1 + Math.floor(rand() * 3);
    for (let c = 0; c < croaks; c++) {
      for (let i = 0; i < 5; i++) {
        notes.push(note(t, 0.021, f * (1 + i * 0.02), f * (1.04 + i * 0.02), 0.6 + 0.1 * i));
        t += 0.034;
      }
      t += 0.16 + rand() * 0.14;
    }
  }
  return { notes, dur: t };
}

export function pickBird(rand, biome) {
  const r = rand();
  if (r < 0.16) return 'feebee';
  return rand() < biome ? 'warbler' : 'lark';
}

// ---------------------------------------------------------------- music
export const PENTA = [0, 2, 4, 7, 9];
export const KEY_ROOT = { prairie: 50, grassland: 53 };
export const scaleSemis = (index) => 12 * Math.floor(index / 5) + PENTA[((index % 5) + 5) % 5];

// Open voicings (semitones above the key root): no close thirds to cloud up.
export const CHORDS = {
  I: { tones: [0, 7, 16], next: [['IV', 0.45], ['vi', 0.35], ['V', 0.2]] },
  IV: { tones: [5, 12, 21], next: [['I', 0.6], ['V', 0.25], ['vi', 0.15]] },
  vi: { tones: [-3, 4, 12], next: [['IV', 0.6], ['I', 0.25], ['V', 0.15]] },
  V: { tones: [-5, 2, 9], next: [['I', 0.7], ['vi', 0.3]] },
};

export function nextChord(rand, current, night = 0) {
  const options = CHORDS[current]?.next ?? CHORDS.I.next;
  let total = 0;
  for (const [name, w] of options) total += w * (name === 'vi' ? 1 + night : 1);
  let r = rand() * total;
  for (const [name, w] of options) {
    r -= w * (name === 'vi' ? 1 + night : 1);
    if (r <= 0) return name;
  }
  return options[0][0];
}

// A short wandering figure on the pentatonic, an octave or so above the pad,
// that comes to rest on a chord tone.
export function pluckPhrase(rand, chord, night = 0) {
  const count = night > 0.5 ? 2 + Math.floor(rand() * 3) : 3 + Math.floor(rand() * 4);
  const gapLo = mix(0.42, 0.9, night);
  const gapHi = mix(1.05, 1.9, night);
  const notes = [];
  let index = 3 + Math.floor(rand() * 6);
  let t = 0;
  for (let i = 0; i < count; i++) {
    index = Math.max(2, Math.min(10, index + Math.floor(rand() * 5) - 2));
    notes.push({ at: t, semis: scaleSemis(index), level: 0.65 + rand() * 0.35 });
    t += gapLo + rand() * (gapHi - gapLo);
  }
  const tones = CHORDS[chord].tones;
  const last = notes[notes.length - 1];
  let best = last.semis;
  let bestD = Infinity;
  for (const tone of tones) {
    for (let oct = 0; oct <= 24; oct += 12) {
      const cand = ((tone % 12) + 12) % 12 + 12 + oct;
      const d = Math.abs(cand - last.semis);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  last.semis = best;
  return { notes, dur: t };
}

// Chimes as [seconds, scale index] in the octave above the key root, so every
// interface sound lands inside whatever the bed is playing.
export const CHIMES = {
  soft: { notes: [[0, 5]], level: 0.07, decay: 0.7 },
  waypoint: { notes: [[0, 7]], level: 0.05, decay: 0.22 },
  rise: { notes: [[0, 3], [0.11, 5], [0.22, 7]], level: 0.065, decay: 0.8 },
  done: { notes: [[0, 7], [0.13, 9]], level: 0.075, decay: 0.9 },
  arrive: { notes: [[0, 5], [0.3, 7], [0.6, 8], [0.95, 10]], level: 0.085, decay: 1.9 },
};
