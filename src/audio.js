// Procedural cozy ambience: filtered-noise trundle that scales with speed,
// slow wind, and soft chimes. No samples, no urgency stings.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.tickCooldown = 0;
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
  }

  update(dt, speed01) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(0.03 + speed01 * 0.34, t, 0.4);
    this.rumbleFilter.frequency.setTargetAtTime(60 + speed01 * 90, t, 0.4);
    if (this.tickCooldown > 0) this.tickCooldown -= dt;
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
