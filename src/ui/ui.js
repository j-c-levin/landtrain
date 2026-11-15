import { TRAIN_LOOK, CHART, GRADE_LOOK } from '../look.js';
import { HUD_HTML, TAP_ICON, introCard, storyCard } from './hud.js';

// how near the train's mark a chip may sit, and how far it steps aside
const CHIP_REACH = 200;
const CHIP_CLEAR = 62;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function installPalette() {
  const s = document.documentElement.style;
  s.setProperty('--rust', hex(TRAIN_LOOK.hull));
  s.setProperty('--rust-deep', hex(TRAIN_LOOK.hullDark));
  s.setProperty('--cream', hex(TRAIN_LOOK.cream));
  s.setProperty('--iron', hex(TRAIN_LOOK.iron));
  s.setProperty('--brass', hex(TRAIN_LOOK.brass));
  s.setProperty('--sage', hex(TRAIN_LOOK.sage));
  s.setProperty('--ink', `#${CHART.uChartInk.value.getHexString()}`);
}

export class UI {
  constructor() {
    installPalette();
    document.getElementById('hud').innerHTML = HUD_HTML;

    this.promptEl = document.getElementById('prompt');
    this.promptText = document.getElementById('prompt-text');
    this.promptKey = document.getElementById('prompt-key');
    this.promptBarFill = document.getElementById('prompt-bar-fill');
    this.toastEl = document.getElementById('toast');
    this.cardEl = document.getElementById('card');
    this.cardInner = document.getElementById('card-inner');
    this.cutEl = document.getElementById('cut');
    this.dialEngine = document.getElementById('gauge-engine');
    this.dialTread = document.getElementById('gauge-tread');
    this.readingLine = document.getElementById('reading-line');
    this.btnOrbit = document.getElementById('btn-orbit');
    this.btnExit = document.getElementById('btn-exit');
    this.btnUndo = document.getElementById('btn-undo');
    this.btnClear = document.getElementById('btn-clear');
    this.btnSound = document.getElementById('btn-sound');
    this.soundPanel = document.getElementById('sound-panel');
    this.soundVolume = document.getElementById('sound-volume');
    this.soundMusic = document.getElementById('sound-music');
    this.markerTree = document.getElementById('marker-tree');
    this.markerTrain = document.getElementById('marker-train');
    this.arrowTree = this.markerTree.querySelector('.edge-arrow');
    this.arrowTrain = this.markerTrain.querySelector('.edge-arrow');
    this.journeyEl = document.getElementById('journey');
    this.journeyDist = document.getElementById('j-dist');
    this.journeyStatus = document.getElementById('j-status');
    this.coachEl = document.getElementById('coach');
    this.nightfallEl = document.getElementById('nightfall');
    this.nightfall = 0;

    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', this.isTouch);
    if (this.isTouch) this.promptKey.innerHTML = TAP_ICON;

    this.toastTimer = null;
    this.lastToast = '';
    this.lastToastAt = 0;
    this.visitedCab = false;
    this.promptShown = '';
    this.promptProgress = -1;
    this.promptSubdued = null;
    this.mode = '';
    this.eff = -1;
    this.wear = -1;
    this.status = '';
    this.guide = '';
    this.shownStatus = null;
    this.shownDist = null;
    this.shownProgress = -1;
    this.coach = '';
    this.cardUp = false;
  }

  showPrompt(text, progress, subdued = false, holding = false) {
    if (text !== this.promptShown) {
      this.promptShown = text;
      this.promptText.textContent = text;
    }
    const el = this.promptEl;
    el.classList.add('visible');
    el.classList.toggle('holding', progress !== null);
    el.classList.toggle('pressed', holding);
    if (subdued !== this.promptSubdued) {
      this.promptSubdued = subdued;
      el.classList.toggle('subdued', subdued);
    }
    if (progress !== null) {
      const pct = Math.round(progress * 100);
      if (pct !== this.promptProgress) {
        this.promptProgress = pct;
        this.promptBarFill.style.width = `${pct}%`;
      }
    }
  }

  hidePrompt() {
    this.promptEl.classList.remove('visible', 'holding', 'pressed');
  }

  toast(text, ms = 4200) {
    const now = performance.now();
    if (text === this.lastToast && now - this.lastToastAt < 6000) return;
    this.lastToast = text;
    this.lastToastAt = now;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), ms);
  }

  setNightfall(amount) {
    const step = Math.round(amount * 40);
    if (step === this.nightfall) return;
    this.nightfall = step;
    this.nightfallEl.style.opacity = String((step / 40) * GRADE_LOOK.plainNightfall);
  }

  setGauges(eff, wear) {
    eff = Math.round(eff);
    wear = Math.round(wear);
    if (eff !== this.eff) {
      this.eff = eff;
      this.#setDial(this.dialEngine, eff, eff < 45);
    }
    if (wear !== this.wear) {
      this.wear = wear;
      this.#setDial(this.dialTread, 100 - wear, wear > 60);
    }
  }

  #setDial(el, value, low) {
    el.style.setProperty('--turn', `${-120 + value * 2.4}deg`);
    el.setAttribute('aria-valuenow', value);
    el.classList.toggle('low', low);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const c = document.body.classList;
    c.toggle('map-mode', mode === 'map');
    c.toggle('book-mode', mode === 'book');
    c.toggle('walk-mode', mode === 'inhabit');
  }

  setSound({ muted, volume, music }) {
    this.btnSound.classList.toggle('muted', muted);
    this.btnSound.setAttribute('aria-pressed', String(!muted));
    this.soundVolume.value = String(Math.round((muted ? 0 : volume) * 100));
    this.soundMusic.setAttribute('aria-pressed', String(music));
  }

  setReadingLine(text) {
    this.readingLine.textContent = text;
  }

  bindViewButtons({ onOrbit, onUndo, onClear, onExit, onSound, onVolume, onMusic }) {
    this.btnOrbit.addEventListener('click', onOrbit);
    this.btnUndo.addEventListener('click', onUndo);
    this.btnClear.addEventListener('click', onClear);
    this.btnExit.addEventListener('click', onExit);
    this.#bindSound(onSound, onVolume, onMusic);
  }

  // One tap or click mutes; the volume and music panel opens on hover, or on a long press by touch.
  #bindSound(onSound, onVolume, onMusic) {
    const btn = this.btnSound;
    const panel = this.soundPanel;
    let held = false;
    let press = 0;
    let close = 0;
    const open = (on) => {
      clearTimeout(close);
      if (on) {
        const r = btn.getBoundingClientRect();
        panel.style.top = `${r.bottom + 8}px`;
        panel.style.right = `${window.innerWidth - r.right}px`;
      }
      panel.classList.toggle('open', on);
    };
    const later = () => {
      clearTimeout(close);
      close = setTimeout(() => open(false), 350);
    };
    btn.addEventListener('click', () => {
      if (held) held = false;
      else onSound();
      btn.blur();
    });
    btn.addEventListener('pointerdown', (e) => {
      held = false;
      if (e.pointerType === 'mouse') return;
      press = setTimeout(() => {
        held = true;
        open(true);
      }, 450);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(type, () => clearTimeout(press));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const el of [btn, panel]) {
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') open(true);
      });
      el.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse') later();
      });
    }
    window.addEventListener('pointerdown', (e) => {
      if (e.target !== btn && !btn.contains(e.target) && !panel.contains(e.target)) open(false);
    });
    for (const type of ['pointerdown', 'pointerup', 'keydown']) panel.addEventListener(type, (e) => e.stopPropagation());
    this.soundVolume.addEventListener('input', () => onVolume(this.soundVolume.value / 100));
    this.soundVolume.addEventListener('change', () => this.soundVolume.blur());
    this.soundMusic.addEventListener('click', () => {
      onMusic();
      this.soundMusic.blur();
    });
  }

  setOrbitActive(on) {
    this.btnOrbit.classList.toggle('active', on);
  }

  // progress 0..1 along the leg, distance text, and what the train is doing
  setJourney(progress, dist, status) {
    const p = Math.round(Math.min(1, Math.max(0, progress)) * 200) / 200;
    if (p !== this.shownProgress) {
      this.shownProgress = p;
      this.journeyEl.style.setProperty('--p', p);
      this.journeyEl.classList.add('ready');
    }
    if (dist !== this.shownDist) {
      this.shownDist = dist;
      this.journeyDist.textContent = dist;
    }
    this.status = status;
    this.#syncCaption();
  }

  // a first-run nudge that takes over the journey caption; '' hands it back
  setGuide(text) {
    this.guide = text;
    this.#syncCaption();
  }

  #syncCaption() {
    const text = this.guide || this.status;
    if (text === this.shownStatus) return;
    this.shownStatus = text;
    this.journeyStatus.textContent = text;
    this.journeyEl.classList.toggle('guiding', !!this.guide);
  }

  // which = '' | 'walk' | 'up' | 'down' | 'up down'
  setCoach(which) {
    if (which === this.coach) return;
    this.coach = which;
    this.coachEl.className = which;
  }

  cutFade() {
    this.cutEl.classList.remove('run');
    void this.cutEl.offsetWidth;
    this.cutEl.classList.add('run');
  }

  // placement = { onScreen, sx, sy, angle } from edgePlacement(); w,h = viewport px.
  setEdgeMarker(name, placement, w, h, avoid = null) {
    const el = name === 'tree' ? this.markerTree : this.markerTrain;
    if (placement.onScreen) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    let left = Math.min(w - 34, Math.max(34, placement.sx * w));
    let top = Math.min(h - 34, Math.max(92, placement.sy * h));
    // a chip that would sit on the mark it shares the frame with slides along its edge instead
    if (avoid && avoid.onScreen) {
      const dx = left - avoid.px * w;
      const dy = top - avoid.py * h;
      if (dx * dx + dy * dy < CHIP_REACH * CHIP_REACH) {
        if (Math.abs(Math.cos(placement.angle)) > 0.7) {
          if (Math.abs(dy) < CHIP_CLEAR) top = avoid.py * h + (dy > 1 ? CHIP_CLEAR : -CHIP_CLEAR);
        } else if (Math.abs(dx) < CHIP_CLEAR) {
          left = avoid.px * w + (dx > 1 ? CHIP_CLEAR : -CHIP_CLEAR);
        }
      }
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    const arrow = name === 'tree' ? this.arrowTree : this.arrowTrain;
    arrow.style.transform = `translate(0, -50%) rotate(${placement.angle}rad)`;
  }

  hideEdgeMarkers() {
    this.markerTree.hidden = true;
    this.markerTrain.hidden = true;
  }

  firstCabVisit() {
    this.visitedCab = true;
  }

  showCard(html, kind = '') {
    this.cardInner.className = kind;
    this.cardEl.classList.toggle('aside', kind === 'aside');
    this.cardInner.innerHTML = html;
    this.cardEl.classList.remove('hidden');
    this.cardUp = true;
    document.body.classList.add('card-up');
  }

  hideCard() {
    this.cardEl.classList.add('hidden');
    this.cardUp = false;
    document.body.classList.remove('card-up');
  }

  #dismissable(armDelay, onDismiss) {
    const dismiss = () => {
      this.hideCard();
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
      if (onDismiss) onDismiss();
    };
    const arm = () => {
      window.addEventListener('keydown', dismiss);
      window.addEventListener('pointerdown', dismiss);
    };
    // armed a beat late so an in-flight keypress can't skip the card
    if (armDelay) setTimeout(arm, armDelay);
    else arm();
  }

  intro(onDismiss) {
    this.showCard(introCard(this.isTouch), 'intro');
    this.#dismissable(0, onDismiss);
  }

  arrival() {
    this.showCard(storyCard(this.isTouch, {
      title: 'You’ve arrived.',
      body: `The Great Tree stands over you, lanterns swaying in the evening wind.
        The engine sighs and settles.`,
      soft: `Rest here as long as you like — water the plants, read a page. And when
        you’re ready, a new tree waits beyond the eastern hills: plot a fresh route
        from the cab and roll on.`,
      go: 'Carry on',
    }));
    this.#dismissable(600);
  }

  endBeat() {
    this.showCard(storyCard(this.isTouch, {
      title: 'The road goes on…',
      body: `The second tree shimmers silver over its quiet island, the rivers
        catching its glow. You followed the bridges all this way.`,
      soft: `Rest here a while. Somewhere past the green there are more lands and
        more trees — but that’s a journey for another day.`,
      go: 'Stay a while',
      last: 'to be continued',
    }), 'aside');
    this.#dismissable(600);
  }
}
