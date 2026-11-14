import { mulberry } from '../prng.js';
import {
  listen, mixFor, beatsDue, createTracker, trackEvents, faunaPhrase, pickBird,
  nextChord, pluckPhrase, scaleSemis, midiHz, mix,
  CHORDS, CHIMES, KEY_ROOT, CRANK_RATE, TREAD_PERIOD, TREAD_PAIR, CHUFF_ACCENTS,
} from './model.js';

const HORIZON = 0.14;
const LEVEL = { train: 1.5, world: 1.6, near: 4, ui: 1, music: 1 };

function noiseBuffer(ctx, seconds, rand, brown) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const fade = Math.floor(ctx.sampleRate * 0.25);
  const raw = new Float32Array(n + fade);
  let last = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = rand() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      raw[i] = last * 3.2;
    } else {
      raw[i] = white;
    }
  }
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  data.set(raw.subarray(0, n));
  // the tail is folded into the head so the loop seam is continuous
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[i] = raw[i] * Math.sqrt(k) + raw[n + i] * Math.sqrt(1 - k);
  }
  return buffer;
}

function limiterCurve() {
  const n = 2049;
  const curve = new Float32Array(n);
  const knee = 0.5;
  const span = 0.48;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a <= knee ? x : Math.sign(x) * (knee + span * Math.tanh((a - knee) / span));
  }
  return curve;
}

export class Soundscape {
  constructor(ctx, { seed = 77031, lite = false, solo = null } = {}) {
    this.ctx = ctx;
    this.lite = lite;
    this.rand = mulberry(seed);
    this.L = {};
    this.m = {};
    this.ev = {};
    this.due = [];
    this.last = {};
    this.tracker = createTracker();
    this.crank = 0;
    this.chuffLast = 0;
    this.chuffFree = 0;
    this.dist = 0;
    this.treadLastA = 0;
    this.treadLastB = 0;
    this.mixAt = 0;
    this.prevNow = null;
    this.crackAt = 0;
    this.dropAt = 0;
    this.birdAt = 3;
    this.lowAt = 6;
    this.tendAt = 0;
    this.tendCount = 0;
    this.chord = 'I';
    this.chordAt = 0;
    this.pluckAt = 0;
    this.key = KEY_ROOT.prairie;

    const gain = (v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const biquad = (type, f, q = 0.707) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    const osc = (type, f) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      return o;
    };
    const lfo = (f, depth, param) => {
      const o = osc('sine', f);
      const g = gain(depth);
      o.connect(g).connect(param);
      return o;
    };
    const pan = (v) => {
      if (!ctx.createStereoPanner) return gain(1);
      const p = ctx.createStereoPanner();
      p.pan.value = v;
      return p;
    };
    const loop = (buffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start();
      return src;
    };

    this.whiteBuffer = noiseBuffer(ctx, 2, mulberry(seed + 1), false);
    const white = loop(this.whiteBuffer);
    const brown = loop(noiseBuffer(ctx, 4, mulberry(seed + 2), true));

    const pre = gain(1);
    this.master = gain(0);
    const limiter = ctx.createWaveShaper();
    limiter.curve = limiterCurve();
    pre.connect(biquad('highpass', 22)).connect(this.master).connect(limiter).connect(ctx.destination);
    const out = (name) => {
      const g = gain(solo && solo !== name ? 0 : LEVEL[name]);
      g.connect(pre);
      return g;
    };

    // ------------------------------------------------------------ train
    this.trainBus = gain(1);
    this.trainLP = biquad('lowpass', 5200, 0.5);
    this.trainBus.connect(this.trainLP).connect(out('train'));

    this.rumbleLP = biquad('lowpass', 80);
    this.rumbleGain = gain(0);
    brown.connect(this.rumbleLP).connect(this.rumbleGain).connect(this.trainBus);

    this.chuffBP = biquad('bandpass', 500, 0.9);
    this.chuffEnv = gain(0);
    const chuffLP = biquad('lowpass', 170);
    this.chuffBody = gain(1);
    white.connect(this.chuffBP).connect(this.chuffEnv);
    white.connect(chuffLP).connect(this.chuffBody).connect(this.chuffEnv);
    this.chuffEnv.connect(this.trainBus);

    this.treadBP = biquad('bandpass', 210, 2.2);
    this.treadEnv = gain(0);
    brown.connect(this.treadBP).connect(this.treadEnv).connect(this.trainBus);

    this.rattleEnv = gain(0);
    white.connect(biquad('bandpass', 1700, 5)).connect(this.rattleEnv).connect(this.trainBus);

    this.simmerGain = gain(0);
    white.connect(biquad('bandpass', 3200, 0.6)).connect(this.simmerGain).connect(this.trainBus);

    if (!lite) {
      this.crackEnv = gain(0);
      white.connect(biquad('highpass', 2200)).connect(this.crackEnv).connect(this.trainBus);
    }

    // ------------------------------------------------------------ world
    this.worldBus = gain(1);
    this.worldLP = biquad('lowpass', 9000, 0.5);
    const worldOut = out('world');
    this.worldBus.connect(this.worldLP).connect(worldOut);

    this.windBP = biquad('bandpass', 480, 0.85);
    this.windGain = gain(0);
    const windGust = gain(1);
    white.connect(this.windBP).connect(this.windGain).connect(windGust).connect(this.worldBus);
    lfo(0.063, 150, this.windBP.frequency);
    lfo(0.11, 0.28, windGust.gain);
    lfo(0.31, 0.12, windGust.gain);

    this.grassGain = gain(0);
    const grassGust = gain(0.6);
    white.connect(biquad('bandpass', 3900, 0.8)).connect(this.grassGain).connect(grassGust).connect(this.worldBus);
    lfo(0.17, 0.4, grassGust.gain);

    const waterBP = biquad('bandpass', 800, 1.1);
    this.waterGain = gain(0);
    white.connect(waterBP).connect(this.waterGain).connect(this.worldBus);
    brown.connect(biquad('lowpass', 380)).connect(this.waterGain);
    lfo(0.37, 260, waterBP.frequency);
    lfo(2.9, 110, waterBP.frequency);

    this.drop = { osc: osc('sine', 900), env: gain(0) };
    this.dropGain = gain(0);
    this.drop.osc.connect(this.drop.env).connect(this.dropGain).connect(worldOut);

    this.cricketGain = gain(0);
    this.cricketGain.connect(this.worldBus);
    const cricket = (f, fast, slow, where) => {
      const am1 = gain(0.5);
      const am2 = gain(0.5);
      osc('sine', f).connect(am1).connect(am2).connect(pan(where)).connect(this.cricketGain);
      lfo(fast, 0.5, am1.gain);
      lfo(slow, 0.5, am2.gain);
    };
    cricket(4350, 33, 1.9, -0.5);
    if (!lite) cricket(4820, 27, 2.6, 0.55);

    this.bird = { osc: osc('sine', 3000), env: gain(0), pan: pan(0) };
    this.bird.osc.connect(this.bird.env).connect(this.bird.pan).connect(this.worldBus);
    this.low = { osc: osc('triangle', 300), env: gain(0) };
    this.low.osc.connect(this.low.env).connect(this.worldBus);

    // ------------------------------------------------- near, ui, music
    this.nearBus = out('near');
    this.tickBP = biquad('bandpass', 400, 2);
    this.tickEnv = gain(0);
    white.connect(this.tickBP).connect(this.tickEnv).connect(this.nearBus);

    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.34;
    const echoLP = biquad('lowpass', 1600);
    const feedback = gain(0.36);
    delay.connect(echoLP).connect(feedback).connect(delay);
    echoLP.connect(gain(0.6)).connect(pre);

    this.uiBus = out('ui');
    this.uiBus.connect(gain(0.35)).connect(delay);

    this.musicBus = gain(0);
    this.musicBus.connect(out('music'));
    this.pluckBus = biquad('lowpass', 2400);
    this.pluckBus.connect(this.musicBus);
    this.musicBus.connect(gain(0.45)).connect(delay);
  }

  setMaster(level, now, tau = 0.07) {
    this.master.gain.setTargetAtTime(level, now, tau);
  }

  #set(key, param, value, now, tau) {
    const prev = this.last[key];
    if (prev !== undefined && Math.abs(value - prev) <= Math.abs(prev) * 0.02 + 1e-5) return;
    this.last[key] = value;
    param.setTargetAtTime(value, now, tau);
  }

  #pulse(param, t, peak, attack, hold, release) {
    param.setTargetAtTime(peak, t, attack);
    param.setTargetAtTime(0, t + hold, release);
  }

  #tick(t, freq, q, peak, hold, release) {
    this.tickBP.frequency.setTargetAtTime(freq, t, 0.002);
    this.tickBP.Q.setTargetAtTime(q, t, 0.002);
    this.#pulse(this.tickEnv.gain, t, peak, 0.002, hold, release);
  }

  #burst(t, dur, f0, f1, q, peak, attack, bus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, (dur - attack) / 7);
    src.connect(bp).connect(g).connect(bus);
    src.start(t, this.rand() * 0.9, dur + 0.05);
  }

  #voice(t, type, freq, peak, decay, bus, attack = 0.008) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, decay / 5);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + attack + decay * 1.5);
  }

  #phrase(voice, t, phrase, level) {
    for (const n of phrase.notes) {
      const at = t + n.at;
      voice.osc.frequency.setValueAtTime(n.f0, at);
      voice.osc.frequency.exponentialRampToValueAtTime(n.f1, at + n.dur);
      const edge = Math.min(0.012, n.dur * 0.25);
      this.#pulse(voice.env.gain, at, level * n.level, edge, n.dur * 0.75, edge * 1.4);
    }
  }

  chime(kind, now) {
    const def = CHIMES[kind] ?? CHIMES.soft;
    for (const [at, index] of def.notes) {
      const t = now + 0.01 + at;
      const f = midiHz(this.key + 12 + scaleSemis(index));
      this.#voice(t, 'sine', f, def.level, def.decay, this.uiBus);
      this.#voice(t, 'sine', f * 2.003, def.level * 0.26, def.decay * 0.4, this.uiBus, 0.004);
      if (!this.lite) this.#voice(t, 'sine', f * 3.01, def.level * 0.07, def.decay * 0.18, this.uiBus, 0.003);
    }
  }

  #whistle(t) {
    const ctx = this.ctx;
    const toots = [[0, 0.2], [0.36, 0.85]];
    const end = t + 0.36 + 0.85;
    const tones = [587.33, 739.99, 880];
    for (let i = 0; i < tones.length; i++) {
      const f = tones[i];
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      o.frequency.setValueAtTime(f * 0.94, t);
      for (const [at, dur] of toots) {
        const t0 = t + at;
        o.frequency.setValueAtTime(f * 0.94, t0);
        o.frequency.exponentialRampToValueAtTime(f, t0 + 0.08);
        o.frequency.setValueAtTime(f, t0 + dur);
        o.frequency.exponentialRampToValueAtTime(f * 0.965, t0 + dur + 0.14);
        this.#pulse(g.gain, t0, 0.034 * (i === 0 ? 1 : 0.6), 0.02, dur, 0.045);
      }
      o.connect(g).connect(this.worldBus);
      o.start(t);
      o.stop(end + 0.5);
    }
    for (const [at, dur] of toots) this.#burst(t + at, dur + 0.25, 2600, 2100, 0.8, 0.03, 0.03, this.worldBus);
  }

  step(now, dt, s) {
    const L = listen(s, this.L);
    const m = mixFor(s, L, this.m);
    const realDt = this.prevNow === null ? 0 : Math.max(0, now - this.prevNow);
    this.prevNow = now;

    const rate = s.speed * CRANK_RATE;
    if (s.crank !== undefined && s.crank !== null) {
      if (Math.abs(s.crank - this.crank) > 6.3) this.chuffLast = Math.floor(s.crank / Math.PI);
      this.crank = s.crank;
    } else {
      this.crank += rate * dt;
    }
    this.dist += s.speed * dt;

    this.#chuffs(now, rate, m);
    this.#treads(now, s, m);
    if (now >= this.mixAt) {
      this.mixAt = now + 0.1;
      this.#applyMix(now, m);
    }
    this.#crackle(now, m);
    this.#drops(now, m);
    this.#fauna(now, s, m, L);
    this.#events(now, s, realDt);
    this.#tend(now, s);
    this.#music(now, s, m);
  }

  #chuffs(now, rate, m) {
    const due = this.due;
    this.chuffLast = beatsDue(this.crank, rate, HORIZON, Math.PI, this.chuffLast, due);
    if (!due.length || m.chuff <= 0) return;
    const period = Math.PI / rate;
    const hold = Math.min(0.05, period * 0.2);
    const release = Math.max(0.022, Math.min(0.11, period * 0.16));
    for (let i = 0; i < due.length; i += 2) {
      const t = now + due[i];
      if (t < this.chuffFree) continue;
      const k = due[i + 1];
      this.chuffFree = t + 0.075;
      this.chuffBP.frequency.setTargetAtTime(m.chuffFreq * (k & 1 ? 1.12 : 0.94), t, 0.01);
      this.#pulse(this.chuffEnv.gain, t, m.chuff * CHUFF_ACCENTS[k & 3], 0.006, hold, release);
    }
  }

  #treads(now, s, m) {
    const due = this.due;
    this.treadLastA = beatsDue(this.dist, s.speed, HORIZON, TREAD_PERIOD, this.treadLastA, due);
    for (let i = 0; i < due.length; i += 2) this.#tread(now + due[i], 1, 205, m, s);
    this.treadLastB = beatsDue(this.dist - TREAD_PAIR, s.speed, HORIZON, TREAD_PERIOD, this.treadLastB, due);
    for (let i = 0; i < due.length; i += 2) this.#tread(now + due[i], 0.72, 262, m, s);
  }

  #tread(t, weight, freq, m, s) {
    if (m.tread <= 0) return;
    const slop = s.wear01 * 0.03 * this.rand();
    this.treadBP.frequency.setTargetAtTime(freq, t + slop, 0.004);
    this.#pulse(this.treadEnv.gain, t + slop, m.tread * weight, 0.004, 0.014, 0.034);
    if (m.rattle > 0.002) {
      this.#pulse(this.rattleEnv.gain, t + slop + 0.01, m.rattle * (0.4 + this.rand() * 0.6), 0.003, 0.02, 0.05);
    }
  }

  #applyMix(now, m) {
    this.#set('trainGain', this.trainBus.gain, m.trainGain, now, 0.35);
    this.#set('trainCut', this.trainLP.frequency, m.trainCut, now, 0.35);
    this.#set('rumble', this.rumbleGain.gain, m.rumble, now, 0.4);
    this.#set('rumbleCut', this.rumbleLP.frequency, m.rumbleCut, now, 0.4);
    this.#set('chuffBody', this.chuffBody.gain, m.chuffBody, now, 0.5);
    this.#set('simmer', this.simmerGain.gain, m.simmer, now, 0.5);
    this.#set('worldGain', this.worldBus.gain, m.worldGain, now, 0.35);
    this.#set('worldCut', this.worldLP.frequency, m.worldCut, now, 0.35);
    this.#set('wind', this.windGain.gain, m.wind, now, 0.8);
    this.#set('windFreq', this.windBP.frequency, m.windFreq, now, 0.8);
    this.#set('grass', this.grassGain.gain, m.grass, now, 0.8);
    this.#set('water', this.waterGain.gain, m.water, now, 1.2);
    this.#set('drops', this.dropGain.gain, m.drops, now, 0.25);
    this.#set('cricket', this.cricketGain.gain, m.cricket, now, 2.5);
    this.#set('music', this.musicBus.gain, m.music, now, 1.2);
  }

  #crackle(now, m) {
    if (!this.crackEnv || now < this.crackAt) return;
    if (m.crackle < 0.004) {
      this.crackAt = now + 0.5;
      return;
    }
    const r = this.rand();
    this.#pulse(this.crackEnv.gain, now + 0.02, m.crackle * (0.25 + r), 0.001, 0.002, 0.005 + r * 0.02);
    this.crackAt = now + 0.06 + this.rand() ** 2 * 0.9;
  }

  #drops(now, m) {
    if (m.dropRate < 0.02) {
      this.dropAt = now + 0.2;
      return;
    }
    while (this.dropAt < now + HORIZON) {
      const t = Math.max(this.dropAt, now + 0.01);
      const f = 700 + this.rand() ** 2 * 1700;
      this.drop.osc.frequency.setValueAtTime(f, t);
      this.drop.osc.frequency.exponentialRampToValueAtTime(f * (1.25 + this.rand() * 0.5), t + 0.05);
      this.#pulse(this.drop.env.gain, t, 0.35 + this.rand() * 0.65, 0.003, 0.012, 0.016);
      this.dropAt = t + 0.075 + (this.rand() * 0.3) / m.dropRate;
    }
  }

  #fauna(now, s, m, L) {
    if (now >= this.birdAt) {
      if (m.birds > 0.08 && L.chart < 0.5) {
        const phrase = faunaPhrase(this.rand, pickBird(this.rand, s.biome));
        const t = now + 0.05;
        if (this.bird.pan.pan) this.bird.pan.pan.setTargetAtTime(this.rand() * 1.4 - 0.7, t - 0.04, 0.01);
        this.#phrase(this.bird, t, phrase, 0.03 * m.birds * (0.5 + this.rand() * 0.5));
        this.birdAt = t + phrase.dur + (2.5 + this.rand() * 8) / (0.35 + 0.65 * m.birds);
      } else {
        this.birdAt = now + 2;
      }
    }
    if (now >= this.lowAt) {
      const frog = m.frogs > 0.12;
      if (frog || m.owl > 0.35) {
        const phrase = faunaPhrase(this.rand, frog ? 'frog' : 'owl');
        const t = now + 0.05;
        this.#phrase(this.low, t, phrase, frog ? 0.05 * m.frogs : 0.035 * m.owl);
        this.lowAt = t + phrase.dur + (frog ? 1.5 + this.rand() * 5 : 11 + this.rand() * 16);
      } else {
        this.lowAt = now + 3;
      }
    }
  }

  #events(now, s, realDt) {
    const ev = trackEvents(this.tracker, s, realDt, this.ev);
    const t = now + 0.02;
    if (ev.whistle) this.#whistle(now + 0.25);
    if (ev.sigh) this.#burst(t, 1.7, 5200, 1300, 0.7, 0.05, 0.07, this.trainBus);
    if (ev.mode === 'map') {
      this.#burst(t, 0.5, 2400, 4300, 0.9, 0.03, 0.14, this.nearBus);
      this.#burst(t + 0.2, 0.3, 3600, 2800, 1.2, 0.02, 0.05, this.nearBus);
    } else if (ev.mode === 'unmap') {
      this.#burst(t, 0.4, 4200, 2300, 0.9, 0.026, 0.06, this.nearBus);
    } else if (ev.mode === 'book') {
      this.#burst(t + 0.35, 0.3, 3400, 2300, 1, 0.022, 0.05, this.nearBus);
    }
    if (ev.step === 'wood') this.#tick(t, 190, 2.2, 0.16, 0.006, 0.03);
    else if (ev.step === 'metal') this.#tick(t, 1250, 7, 0.1, 0.004, 0.035);
    else if (ev.step === 'ground') this.#tick(t, 650, 0.8, 0.07, 0.008, 0.03);
    else if (ev.step === 'rung') this.#tick(t, 1900, 9, 0.09, 0.003, 0.05);
  }

  #tend(now, s) {
    if (!s.tend || now < this.tendAt) return;
    const t = now + 0.02;
    if (s.tend === 'engine') {
      this.#burst(t, 0.3, 650, 1500, 1.2, 0.06, 0.1, this.nearBus);
      this.#tick(t + 0.3, 170, 2, 0.2, 0.01, 0.05);
      this.tendAt = now + 0.58;
    } else {
      const clunk = this.tendCount++ % 5 === 4;
      if (clunk) this.#tick(t, 420, 3, 0.16, 0.006, 0.04);
      else this.#tick(t, 2300 + this.rand() * 300, 6, 0.1, 0.003, 0.011);
      this.tendAt = now + (clunk ? 0.2 : 0.105);
    }
  }

  #music(now, s, m) {
    if (m.music <= 0) {
      this.chordAt = 0;
      return;
    }
    if (this.chordAt === 0) {
      this.chordAt = now + 1.2;
      this.pluckAt = now + 4.5;
    }
    const slow = mix(1, 1.3, s.night);
    if (now >= this.chordAt - 0.1) {
      this.chord = nextChord(this.rand, this.chord, s.night);
      this.key = s.biome > 0.5 ? KEY_ROOT.grassland : KEY_ROOT.prairie;
      const t = Math.max(now + 0.05, this.chordAt);
      const len = (12 + this.rand() * 5) * slow;
      const tones = CHORDS[this.chord].tones;
      for (let i = 0; i < (this.lite ? 2 : tones.length); i++) this.#pad(t, midiHz(this.key + tones[i]), len);
      this.chordAt = t + len;
    }
    if (now >= this.pluckAt) {
      const phrase = pluckPhrase(this.rand, this.chord, s.night);
      for (const n of phrase.notes) {
        const t = now + 0.05 + n.at;
        const f = midiHz(this.key + 12 + n.semis);
        this.#voice(t, 'triangle', f, 0.05 * n.level, 2.2, this.pluckBus, 0.012);
        if (!this.lite) this.#voice(t, 'sine', f * 2, 0.012 * n.level, 0.7, this.pluckBus, 0.006);
      }
      this.pluckAt = now + phrase.dur + (5 + this.rand() * 9) * slow;
    }
  }

  #pad(t, f, len) {
    const ctx = this.ctx;
    const peak = 0.05 * Math.sqrt(220 / f);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(peak, t, 1.5);
    g.gain.setTargetAtTime(0, t + len, 2.1);
    g.connect(this.musicBus);
    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.3;
    shimmer.connect(g);
    for (const detune of this.lite ? [0] : [0, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(detune ? shimmer : g);
      o.start(t);
      o.stop(t + len + 15);
    }
  }
}
