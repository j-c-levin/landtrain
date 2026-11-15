import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry } from '../src/prng.js';
import {
  DEFAULT_SETTINGS, MASTER_PEAK, parseSettings, masterLevel, listen, mixFor, beatsDue,
  createTracker, trackEvents, faunaPhrase, pickBird, nextChord, pluckPhrase, scaleSemis,
  CHORDS, CHIMES, PENTA,
} from '../src/audio/model.js';
import { waterNear } from '../src/audio/audio.js';
import { riverDefs, riverCenterX, GRASS_LANDMARK } from '../src/grassland/layout.js';

const state = (over = {}) => ({
  speed: 0, speed01: 0, eff01: 0.88, wear01: 0.08, night: 0, dusk: 0, biome: 0, water: 0,
  mode: 'inhabit', mapBlend: 0, level: 'deck', x: 12, moving: false, climbing: false, walkPhase: 0,
  tend: null, pour: 0, music: true, ...over,
});
const mixOf = (over) => {
  const s = state(over);
  return mixFor(s, listen(s, {}), {});
};

test('settings survive a round trip and reject junk', () => {
  const saved = { volume: 0.35, muted: true, music: false };
  assert.deepEqual(parseSettings(JSON.stringify(saved)), saved);
  assert.deepEqual(parseSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(parseSettings('{not json'), { ...DEFAULT_SETTINGS });
  assert.deepEqual(parseSettings('{"volume":"loud","muted":1,"music":null}'), { ...DEFAULT_SETTINGS });
  assert.equal(parseSettings('{"volume":7}').volume, 1);
  assert.equal(parseSettings('{"volume":-2}').volume, 0);
});

test('master level is silent when muted, monotonic in volume, and never exceeds the peak', () => {
  assert.equal(masterLevel({ volume: 1, muted: true }), 0);
  assert.equal(masterLevel({ volume: 0, muted: false }), 0);
  let prev = -1;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const level = masterLevel({ volume: v, muted: false });
    assert.ok(level > prev && level <= MASTER_PEAK + 1e-9);
    prev = level;
  }
});

test('the listener is sheltered indoors and exposed on the roof and in book view', () => {
  const deck = listen(state({ level: 'deck', x: -18 }), {});
  const engineRoom = listen(state({ level: 'deck', x: 0 }), {});
  const roof = listen(state({ level: 'roof', x: 0 }), {});
  const cab = listen(state({ level: 'roof', x: 20 }), {});
  const book = listen(state({ mode: 'book', level: 'deck', x: -18 }), {});
  assert.ok(deck.shelter > 0.8 && roof.shelter === 0 && book.shelter === 0);
  assert.ok(cab.shelter > roof.shelter && cab.shelter < deck.shelter);
  assert.equal(engineRoom.engineNear, 1);
  assert.ok(deck.engineNear < 0.1);
  assert.equal(listen(state({ level: 'under' }), {}).under, 1);
  assert.equal(book.rest, 1);
});

test('the engine and treads are silent at rest and grow with speed', () => {
  const rest = mixOf({ speed01: 0 });
  const slow = mixOf({ speed01: 0.3 });
  const fast = mixOf({ speed01: 1 });
  assert.equal(rest.chuff, 0);
  assert.equal(rest.tread, 0);
  assert.ok(slow.chuff > 0 && fast.chuff > slow.chuff);
  assert.ok(fast.rumble > slow.rumble && slow.rumble > rest.rumble);
  assert.ok(fast.wind > rest.wind);
  assert.ok(rest.simmer > 0, 'the boiler keeps simmering at rest');
});

test('upkeep is audible: a tired engine wheezes, worn treads rattle', () => {
  const tuned = mixOf({ speed01: 0.8, eff01: 1, wear01: 0 });
  const tired = mixOf({ speed01: 0.8, eff01: 0.1, wear01: 0.9 });
  assert.ok(tired.chuff < tuned.chuff && tired.chuffFreq > tuned.chuffFreq && tired.chuffBody < tuned.chuffBody);
  assert.equal(tuned.rattle, 0);
  assert.ok(tired.rattle > 0.02 && tired.tread > tuned.tread);
});

test('indoors muffles the world; the chart muffles everything', () => {
  const roof = mixOf({ level: 'roof', x: 0, speed01: 0.8 });
  const living = mixOf({ level: 'deck', x: -18, speed01: 0.8 });
  const engineRoom = mixOf({ level: 'deck', x: 0, speed01: 0.8 });
  const chart = mixOf({ mode: 'map', mapBlend: 1, level: 'roof', x: 20 });
  assert.ok(living.worldCut < roof.worldCut / 4 && living.worldGain < roof.worldGain);
  assert.ok(living.trainCut < engineRoom.trainCut && engineRoom.trainCut < roof.trainCut);
  assert.ok(engineRoom.chuff > living.chuff);
  assert.ok(chart.worldCut <= 600 && chart.trainGain < 0.3 && chart.music > roof.music);
});

test('time of day and biome shift the ambience', () => {
  const day = mixOf({ level: 'roof', x: 0 });
  const dusk = mixOf({ level: 'roof', x: 0, dusk: 1 });
  const night = mixOf({ level: 'roof', x: 0, night: 1 });
  assert.equal(day.cricket, 0);
  assert.ok(dusk.cricket > 0 && night.cricket > dusk.cricket);
  assert.ok(day.birds === 1 && dusk.birds < day.birds && night.birds === 0);
  assert.ok(night.wind < day.wind && night.owl > 0.9 && day.owl === 0);
  const river = mixOf({ level: 'roof', x: 0, biome: 1, water: 1, night: 1 });
  assert.equal(day.water, 0);
  assert.ok(river.water > 0.1 && river.frogs === 1 && river.owl === 0);
  assert.ok(mixOf({ biome: 1, level: 'roof', x: 0 }).wind < day.wind, 'grassland air is stiller than the prairie');
});

test('watering pours even with no river about, and music obeys its switch', () => {
  assert.equal(mixOf({}).dropRate, 0);
  assert.ok(mixOf({ pour: 1 }).drops > 0.03);
  assert.equal(mixOf({ music: false }).music, 0);
  assert.ok(mixOf({ mode: 'book' }).music > mixOf({ speed01: 1 }).music);
});

test('every mix value stays finite and non-negative across the whole state space', () => {
  const rand = mulberry(11);
  for (let i = 0; i < 400; i++) {
    const m = mixOf({
      speed01: rand() * 1.4, eff01: rand(), wear01: rand(), night: rand(), dusk: rand(), biome: rand(), water: rand(),
      mode: ['inhabit', 'cabin', 'map', 'book'][Math.floor(rand() * 4)], mapBlend: rand(),
      level: ['under', 'deck', 'roof'][Math.floor(rand() * 3)], x: rand() * 50 - 25, pour: rand(), music: rand() < 0.5,
    });
    for (const [key, value] of Object.entries(m)) assert.ok(Number.isFinite(value) && value >= 0, `${key}=${value}`);
    assert.ok(m.chuff < 1.1 && m.rumble < 1 && m.wind < 0.3 && m.music <= 1);
  }
});

test('beatsDue schedules each beat exactly once as the phase advances', () => {
  const out = [];
  const seen = [];
  let last = 0;
  let pos = 0.1;
  const rate = 11.9;
  const dt = 1 / 60;
  for (let frame = 0; frame < 240; frame++) {
    last = beatsDue(pos, rate, 0.14, Math.PI, last, out);
    for (let i = 0; i < out.length; i += 2) {
      assert.ok(out[i] >= 0 && out[i] <= 0.14 + 1e-9);
      seen.push({ k: out[i + 1], at: frame * dt + out[i] });
    }
    pos += rate * dt;
  }
  const expected = Math.floor((pos - rate * dt + rate * 0.14) / Math.PI);
  assert.deepEqual(seen.map((b) => b.k), Array.from({ length: expected }, (_, i) => i + 1));
  for (let i = 1; i < seen.length; i++) {
    assert.ok(Math.abs(seen[i].at - seen[i - 1].at - Math.PI / rate) < 1e-6, 'beats are evenly spaced');
  }
});

test('beatsDue stays quiet at rest, skips beats already passed, and caps a time-warp burst', () => {
  const out = [];
  assert.equal(beatsDue(10, 0, 0.14, Math.PI, 0, out), 3);
  assert.equal(out.length, 0);
  const last = beatsDue(100, 5, 0.14, Math.PI, 0, out);
  assert.equal(last, Math.floor(100.7 / Math.PI));
  assert.ok(out.every((v, i) => i % 2 || v >= 0));
  beatsDue(0, 5000, 0.14, Math.PI, 0, out);
  assert.ok(out.length / 2 <= 9);
});

test('departures whistle once, stops sigh once, and neither nags', () => {
  const tr = createTracker();
  const ev = {};
  const count = { whistle: 0, sigh: 0 };
  const run = (seconds, speed) => {
    for (let i = 0; i < seconds * 60; i++) {
      trackEvents(tr, state({ speed }), 1 / 60, ev);
      if (ev.whistle) count.whistle++;
      if (ev.sigh) count.sigh++;
    }
  };
  run(1, 0);
  run(10, 6);
  assert.deepEqual(count, { whistle: 1, sigh: 0 });
  run(6, 0);
  assert.deepEqual(count, { whistle: 1, sigh: 1 });
  run(5, 6);
  run(5, 0);
  run(5, 6);
  assert.deepEqual(count, { whistle: 1, sigh: 1 }, 'a quick chart stop does not replay either');
  run(60, 6);
  run(6, 0);
  run(6, 6);
  assert.deepEqual(count, { whistle: 2, sigh: 2 });
});

test('a train already rolling when sound starts does not whistle', () => {
  const tr = createTracker();
  const ev = {};
  trackEvents(tr, state({ speed: 6 }), 1 / 60, ev);
  assert.equal(ev.whistle, false);
});

test('footsteps follow the walk cycle and name their surface', () => {
  const tr = createTracker();
  const ev = {};
  const steps = [];
  let walkPhase = 0;
  trackEvents(tr, state({ walkPhase }), 1 / 60, ev);
  for (let i = 0; i < 120; i++) {
    const climbing = i >= 60;
    walkPhase += (1 / 60) * (climbing ? 7 : 11);
    trackEvents(tr, state({ walkPhase, moving: true, climbing, level: 'roof' }), 1 / 60, ev);
    if (ev.step) steps.push(ev.step);
  }
  assert.equal(steps.length, Math.floor(walkPhase / Math.PI));
  assert.ok(steps.includes('metal') && steps.includes('rung'));
  trackEvents(tr, state({ walkPhase: 0, moving: false }), 1 / 60, ev);
  assert.equal(ev.step, null, 'a reset walk phase is not a step');
});

test('view changes report the chart opening, closing and the book', () => {
  const tr = createTracker();
  const ev = {};
  trackEvents(tr, state({ mode: 'cabin' }), 0.016, ev);
  assert.equal(ev.mode, null, 'the first frame is not a transition');
  trackEvents(tr, state({ mode: 'map' }), 0.016, ev);
  assert.equal(ev.mode, 'map');
  trackEvents(tr, state({ mode: 'map' }), 0.016, ev);
  assert.equal(ev.mode, null);
  trackEvents(tr, state({ mode: 'cabin' }), 0.016, ev);
  assert.equal(ev.mode, 'unmap');
  trackEvents(tr, state({ mode: 'inhabit' }), 0.016, ev);
  trackEvents(tr, state({ mode: 'book' }), 0.016, ev);
  assert.equal(ev.mode, 'book');
});

test('fauna phrases are ordered, non-overlapping and in each animal\'s register', () => {
  const rand = mulberry(5);
  const ranges = { lark: [1500, 4700], warbler: [3300, 6500], feebee: [2400, 3500], owl: [300, 400], frog: [180, 300] };
  for (const [kind, [lo, hi]] of Object.entries(ranges)) {
    for (let trial = 0; trial < 50; trial++) {
      const { notes, dur } = faunaPhrase(rand, kind);
      assert.ok(notes.length >= 2 && dur > 0 && dur < 4);
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        assert.ok(n.f0 >= lo && n.f0 <= hi && n.f1 >= lo && n.f1 <= hi, `${kind} ${n.f0}->${n.f1}`);
        assert.ok(n.level > 0 && n.level <= 1 && n.dur > 0);
        if (i) assert.ok(n.at >= notes[i - 1].at + notes[i - 1].dur, `${kind} notes overlap`);
      }
      assert.ok(notes[notes.length - 1].at + notes[notes.length - 1].dur <= dur + 1e-9);
    }
  }
});

test('the grassland favours warblers, the prairie larks', () => {
  const rand = mulberry(9);
  const tally = (biome) => {
    const t = {};
    for (let i = 0; i < 400; i++) {
      const kind = pickBird(rand, biome);
      t[kind] = (t[kind] || 0) + 1;
    }
    return t;
  };
  const prairie = tally(0);
  const grass = tally(1);
  assert.ok(!prairie.warbler && prairie.lark > 250 && prairie.feebee > 20);
  assert.ok(!grass.lark && grass.warbler > 250);
});

test('the chord walk never stalls or leaves the table, and leans minor at night', () => {
  const rand = mulberry(3);
  const count = (night) => {
    let chord = 'I';
    let minor = 0;
    for (let i = 0; i < 2000; i++) {
      const next = nextChord(rand, chord, night);
      assert.ok(CHORDS[next] && next !== chord);
      chord = next;
      if (chord === 'vi') minor++;
    }
    return minor;
  };
  assert.ok(count(1) > count(0));
});

test('plucked phrases stay on the pentatonic, in range, and resolve to a chord tone', () => {
  const rand = mulberry(21);
  for (const chord of Object.keys(CHORDS)) {
    for (let trial = 0; trial < 100; trial++) {
      const night = trial % 2;
      const { notes, dur } = pluckPhrase(rand, chord, night);
      assert.ok(notes.length >= 2 && notes.length <= 6 && dur < 12);
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        assert.ok(n.semis >= 2 && n.semis <= 28, `semis ${n.semis}`);
        if (i < notes.length - 1) assert.ok(PENTA.includes(n.semis % 12));
        if (i) assert.ok(n.at > notes[i - 1].at + 0.4);
      }
      const last = notes[notes.length - 1].semis % 12;
      assert.ok(CHORDS[chord].tones.some((t) => ((t % 12) + 12) % 12 === last));
    }
  }
});

test('chimes are built from the same scale as the bed', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 7].map(scaleSemis), [0, 2, 4, 7, 9, 12, 16]);
  for (const kind of ['soft', 'waypoint', 'rise', 'done', 'arrive']) {
    const def = CHIMES[kind];
    assert.ok(def.level > 0 && def.level <= 0.1 && def.decay > 0);
    for (let i = 1; i < def.notes.length; i++) assert.ok(def.notes[i][1] > def.notes[i - 1][1], `${kind} rises`);
  }
});

test('water is heard on the banks and the moat, not out on the prairie', () => {
  assert.equal(waterNear(0, 0), 0);
  assert.equal(waterNear(2300, 0), 0);
  const def = riverDefs[0];
  const bank = riverCenterX(def, 100);
  assert.equal(waterNear(bank, 100), 1);
  assert.ok(waterNear(bank + 130, 100) > 0 && waterNear(bank + 130, 100) < 1);
  assert.equal(waterNear(GRASS_LANDMARK.x + 190, GRASS_LANDMARK.z), 1);
  assert.ok(waterNear(GRASS_LANDMARK.x, GRASS_LANDMARK.z) < 0.2, 'the island heart is a little apart from the moat');
});
