// Procedural cozy ambience: filtered-noise trundle that scales with speed,
// slow wind, and soft chimes. No samples, no urgency stings.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.tickCooldown = 0;
    this.biome = 'prairie';
    this.chirpTimer = 0;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(ctx.destination);

    // --- brown noise rumble (the trundle) ---
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }

    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = noiseBuf;
    rumbleSrc.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 80;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumbleSrc.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.master);
    rumbleSrc.start();

    // --- wind ---
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.7;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.025;
    windSrc.connect(windFilter).connect(this.windGain).connect(this.master);
    windSrc.start();

    // slow breathing of the wind
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.014;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    lfo.start();

    // --- grassland: gentle water burble (silent until setBiome('grassland'))
    // A low band of filtered noise, slowly swelled by an LFO so it bubbles
    // rather than hisses — a different band than the dry wind above.
    const waterSrc = ctx.createBufferSource();
    waterSrc.buffer = noiseBuf;
    waterSrc.loop = true;
    waterSrc.playbackRate.value = 0.45;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 320;
    waterFilter.Q.value = 1.4;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    waterSrc.connect(waterFilter).connect(this.waterGain).connect(this.master);
    waterSrc.start();

    // slow burbling swell on the water layer
    const waterLfo = ctx.createOscillator();
    waterLfo.frequency.value = 0.5;
    this.waterLfoGain = ctx.createGain();
    this.waterLfoGain.gain.value = 0; // scaled with biome so prairie stays silent
    waterLfo.connect(this.waterLfoGain).connect(this.waterGain.gain);
    waterLfo.start();

    // shared bus for bird/frog chirps so one gain controls the whole layer
    this.chirpGain = ctx.createGain();
    this.chirpGain.gain.value = 0;
    this.chirpGain.connect(this.master);
  }

  update(dt, speed01) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(0.03 + speed01 * 0.34, t, 0.4);
    this.rumbleFilter.frequency.setTargetAtTime(60 + speed01 * 90, t, 0.4);
    if (this.tickCooldown > 0) this.tickCooldown -= dt;

    // grassland: schedule occasional bird/frog chirps at randomised intervals
    if (this.biome === 'grassland') {
      this.chirpTimer -= dt;
      if (this.chirpTimer <= 0) {
        this.chirpTimer = 3.5 + Math.random() * 7; // ~3.5-10.5s, irregular
        this.#chirp();
      }
    }
  }

  #tone(freq, dur, gainV = 0.12, type = 'triangle', when = 0) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainV, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // A short soft fauna sound — a warm bird whistle, a cricket trill, or a soft
  // frog plip — routed through the chirp bus so its level follows the grassland
  // crossfade. Sine-based throughout to avoid the harsh synthetic beep of the
  // old triangle bird; the cricket carries the "alive meadow" texture.
  #chirp() {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const roll = Math.random();

    if (roll < 0.5) {
      // Songbird whistle: warm sine with a gentle descending glide and a touch
      // of vibrato so it reads as a distant bird, not a tone generator.
      const osc = ctx.createOscillator();
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      const g = ctx.createGain();
      osc.type = 'sine';
      const f = 2000 + Math.random() * 700;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.28);
      vib.type = 'sine';
      vib.frequency.value = 16 + Math.random() * 8; // ~16-24 Hz vibrato
      vibGain.gain.value = f * 0.018; // shallow pitch wobble
      vib.connect(vibGain).connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.04, t + 0.03);
      g.gain.setValueAtTime(0.04, t + 0.16);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(g).connect(this.chirpGain);
      osc.start(t); vib.start(t);
      osc.stop(t + 0.38); vib.stop(t + 0.38);
    } else if (roll < 0.85) {
      // Cricket stridulation: a high carrier chopped by a fast amplitude
      // modulator (the LFO drives the gain), giving the dry pulsing trill.
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const am = ctx.createGain();
      const g = ctx.createGain();
      carrier.type = 'sine';
      carrier.frequency.value = 4200 + Math.random() * 700;
      mod.type = 'sine';
      mod.frequency.value = 30 + Math.random() * 14; // pulse rate
      modGain.gain.value = 0.5;
      am.gain.value = 0.5; // centre: modulated between ~0 and ~1
      mod.connect(modGain).connect(am.gain);
      const dur = 0.22 + Math.random() * 0.2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.028, t + 0.05);
      g.gain.setValueAtTime(0.028, t + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      carrier.connect(am).connect(g).connect(this.chirpGain);
      carrier.start(t); mod.start(t);
      carrier.stop(t + dur + 0.02); mod.stop(t + dur + 0.02);
    } else {
      // Distant frog plip: soft low sine, kept gentle.
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const f = 150 + Math.random() * 70;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g).connect(this.chirpGain);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  }

  // Crossfade the ambience between biomes. prairie (default) = dry wind up,
  // water/chirps silent (original behaviour). grassland = wind down, water
  // burble up, bird/frog chirps enabled. Smooth ramps, no clicks.
  setBiome(name) {
    this.biome = name === 'grassland' ? 'grassland' : 'prairie';
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const grass = this.biome === 'grassland';
    // dry wind sits at 0.025 in the prairie; fade it well down for grassland
    this.windGain.gain.setTargetAtTime(grass ? 0.006 : 0.025, t, 1.5);
    this.waterGain.gain.setTargetAtTime(grass ? 0.05 : 0, t, 1.5);
    this.waterLfoGain.gain.setTargetAtTime(grass ? 0.03 : 0, t, 1.5);
    this.chirpGain.gain.setTargetAtTime(grass ? 0.45 : 0, t, 1.5);
    if (grass && this.chirpTimer <= 0) this.chirpTimer = 1 + Math.random() * 2;
  }

  chime(kind) {
    if (kind === 'done') {
      this.#tone(659, 0.5, 0.1);
      this.#tone(880, 0.7, 0.08, 'triangle', 0.13);
    } else if (kind === 'rise') {
      this.#tone(440, 0.4, 0.07);
      this.#tone(554, 0.5, 0.07, 'triangle', 0.12);
      this.#tone(659, 0.7, 0.07, 'triangle', 0.24);
    } else if (kind === 'arrive') {
      this.#tone(523, 0.8, 0.1);
      this.#tone(659, 0.9, 0.1, 'triangle', 0.35);
      this.#tone(784, 1.4, 0.1, 'triangle', 0.7);
    } else if (kind === 'waypoint') {
      this.#tone(740, 0.1, 0.05, 'sine');
    } else {
      this.#tone(587, 0.35, 0.06);
    }
  }

  tendTick(dt) {
    if (this.tickCooldown > 0) return;
    this.tickCooldown = 0.16;
    this.#tone(180 + Math.random() * 60, 0.07, 0.05, 'square');
  }

  waterTick(dt) {
    if (this.tickCooldown > 0) return;
    this.tickCooldown = 0.12;
    this.#tone(900 + Math.random() * 500, 0.08, 0.025, 'sine');
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.started) {
      this.master.gain.value = this.muted ? 0 : 0.75;
    }
    return this.muted;
  }
}
