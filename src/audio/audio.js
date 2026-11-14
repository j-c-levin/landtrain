import { TUNING, GRASSLAND } from '../constants.js';
import { riverDefs, riverCenterX, GRASS_LANDMARK, ISLAND_R, MOAT_R, FOOT } from '../grassland/layout.js';
import { Soundscape } from './soundscape.js';
import { STORAGE_KEY, parseSettings, masterLevel, smooth } from './model.js';
import { mountSoundControl } from './control.js';

const WATER_REACH = 170;

// 1 on the bank, fading to 0 a good walk away from any river or the moat.
export function waterNear(x, z) {
  if (x < GRASSLAND.minX - WATER_REACH) return 0;
  let d = Infinity;
  for (const def of riverDefs) d = Math.min(d, Math.abs(x - riverCenterX(def, z)) - FOOT);
  const r = Math.hypot(x - GRASS_LANDMARK.x, z - GRASS_LANDMARK.z);
  d = Math.min(d, r < ISLAND_R ? ISLAND_R - r : r > MOAT_R ? r - MOAT_R : 0);
  return smooth(1 - Math.max(0, d) / WATER_REACH);
}

function loadSettings() {
  try {
    return parseSettings(globalThis.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.scape = null;
    this.started = false;
    this.hidden = false;
    this.settings = loadSettings();
    this.world = null;
    this.biomeFlag = 0;
    this.biomeBlend = 0;
    this.tendHold = 0;
    this.pourHold = 0;
    this.waterAt = 0;
    this.sleepTimer = null;
    this.transition = Promise.resolve();
    this.state = {
      speed: 0, speed01: 0, crank: null, eff01: 0.88, wear01: 0.08,
      night: 0, dusk: 0, biome: 0, water: 0,
      mode: 'inhabit', mapBlend: 0, level: 'deck', x: 12, moving: false, climbing: false, walkPhase: 0,
      tend: null, pour: 0, music: this.settings.music,
    };
    this.control = typeof document === 'undefined' ? null : mountSoundControl(this);
    if (typeof window !== 'undefined') window.__audio = this;
  }

  get muted() {
    return this.settings.muted;
  }

  attach(world) {
    this.world = world;
  }

  start() {
    if (this.started) return;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return;
    this.started = true;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const tier = this.world?.tier?.();
    const lite = tier ? tier === 'low' : (navigator.hardwareConcurrency || 8) <= 4;
    this.scape = new Soundscape(ctx, { lite });
    this.scape.setMaster(masterLevel(this.settings), ctx.currentTime + 0.05, 0.6);

    // some browsers only unlock audio on the release half of a gesture
    const unlock = () => {
      if (ctx.state === 'running') {
        for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.removeEventListener(type, unlock, true);
        return;
      }
      this.#syncRunState();
    };
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, true);
    this.#syncRunState();
  }

  #syncRunState() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    const want = !this.hidden && !this.settings.muted;
    this.transition = this.transition
      .then(() => {
        if (want && ctx.state !== 'running') return ctx.resume();
        if (!want && ctx.state === 'running') return ctx.suspend();
        return undefined;
      })
      .catch(() => {});
  }

  suspendForVisibility() {
    this.hidden = true;
    this.#syncRunState();
  }

  resumeFromVisibility() {
    this.hidden = false;
    this.#syncRunState();
  }

  #applySettings() {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // private mode: the choice simply lasts for this visit
    }
    this.state.music = this.settings.music;
    this.control?.sync(this.settings);
    if (!this.scape) return;
    clearTimeout(this.sleepTimer);
    if (this.settings.muted) {
      if (this.ctx.state === 'running') this.scape.setMaster(0, this.ctx.currentTime);
      this.sleepTimer = setTimeout(() => this.#syncRunState(), 450);
    } else {
      this.scape.setMaster(masterLevel(this.settings), this.ctx.currentTime);
      this.#syncRunState();
    }
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    if (!this.settings.muted && this.settings.volume < 0.05) this.settings.volume = 0.5;
    this.#applySettings();
    return this.settings.muted;
  }

  setVolume(volume) {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    this.settings.muted = this.settings.volume <= 0.001;
    this.#applySettings();
  }

  setMusic(on) {
    this.settings.music = !!on;
    this.#applySettings();
  }

  setBiome(name) {
    this.biomeFlag = name === 'grassland' ? 1 : 0;
  }

  get #live() {
    return this.scape !== null && this.ctx.state === 'running';
  }

  chime(kind) {
    if (this.#live) this.scape.chime(kind, this.ctx.currentTime);
  }

  tendTick() {
    this.tendHold = 0.12;
  }

  waterTick() {
    this.pourHold = 0.12;
  }

  update(dt, speed01) {
    if (!this.#live) return;
    const s = this.state;
    const w = this.world;
    const now = this.ctx.currentTime;
    const real = Math.min(0.1, Math.max(0, now - (this.prevNow ?? now)));
    this.prevNow = now;

    s.speed = speed01 * TUNING.baseSpeed;
    s.speed01 = speed01;
    if (w) {
      const { train, player, rig, sky } = w;
      s.crank = train.flywheel ? -train.flywheel.rotation.z : null;
      s.eff01 = train.eff / 100;
      s.wear01 = train.wear / 100;
      s.night = sky.nightness;
      s.dusk = sky.duskness;
      s.biome = sky.biomeBlend;
      s.mode = rig.mode;
      s.mapBlend = rig.mapBlend;
      s.level = player.level;
      s.x = player.x;
      s.moving = player.moving;
      s.climbing = player.climbing;
      s.walkPhase = player.walkPhase;
      s.tend = this.tendHold > 0 ? (player.action === 'engine' ? 'engine' : 'tread') : null;
      if (now >= this.waterAt) {
        this.waterAt = now + 0.2;
        s.water = waterNear(train.pos.x, train.pos.z);
      }
    } else {
      this.biomeBlend += (this.biomeFlag - this.biomeBlend) * Math.min(1, real * 0.5);
      s.biome = this.biomeBlend;
      s.water = this.biomeBlend * 0.6;
      s.tend = this.tendHold > 0 ? 'tread' : null;
    }
    this.tendHold -= real;
    this.pourHold -= real;
    s.pour += ((this.pourHold > 0 ? 1 : 0) - s.pour) * Math.min(1, real * 9);

    this.scape.step(now, dt, s);
  }
}
