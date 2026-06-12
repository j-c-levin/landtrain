// Thin DOM layer: gauges, prompts, toasts, cards. All cozy, nothing urgent.
export class UI {
  constructor() {
    this.promptEl = document.getElementById('prompt');
    this.promptText = document.getElementById('prompt-text');
    this.promptKey = document.getElementById('prompt-key');
    this.promptBarFill = document.getElementById('prompt-bar-fill');
    this.toastEl = document.getElementById('toast');
    this.cardEl = document.getElementById('card');
    this.cardInner = document.getElementById('card-inner');
    this.gaugeEngine = document.querySelector('#gauge-engine .gauge-fill');
    this.gaugeTread = document.querySelector('#gauge-tread .gauge-fill');
    this.muteHint = document.getElementById('mute-hint');
    this.readingLine = document.getElementById('reading-line');
    this.btnOrbit = document.getElementById('btn-orbit');
    this.btnExit = document.getElementById('btn-exit');
    this.btnUndo = document.getElementById('btn-undo');
    this.btnClear = document.getElementById('btn-clear');

    // coarse pointer = phone/tablet — swaps hint text to touch wording
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;

    this.toastTimer = null;
    this.lastToast = '';
    this.lastToastAt = 0;
    this.visitedCab = false;
  }

  showPrompt(text, progress, subdued = false, holding = false) {
    this.promptText.textContent = text;
    this.promptEl.classList.add('visible');
    this.promptEl.classList.toggle('holding', progress !== null);
    this.promptKey.style.display = subdued ? 'none' : 'grid';
    if (progress !== null) {
      this.promptBarFill.style.width = `${Math.round(progress * 100)}%`;
    }
  }

  hidePrompt() {
    this.promptEl.classList.remove('visible', 'holding');
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

  setGauges(eff, wear) {
    this.gaugeEngine.style.width = `${eff}%`;
    this.gaugeTread.style.width = `${100 - wear}%`;
    this.gaugeEngine.closest('.gauge').classList.toggle('low', eff < 45);
    this.gaugeTread.closest('.gauge').classList.toggle('low', wear > 60);
  }

  setMode(mode) {
    document.body.classList.toggle('map-mode', mode === 'map');
    document.body.classList.toggle('book-mode', mode === 'book');
  }

  setMuted(muted) {
    this.muteHint.classList.toggle('muted', muted);
  }

  setReadingLine(text) {
    this.readingLine.textContent = text;
  }

  bindViewButtons({ onOrbit, onUndo, onClear, onExit }) {
    this.btnOrbit.addEventListener('click', onOrbit);
    this.btnUndo.addEventListener('click', onUndo);
    this.btnClear.addEventListener('click', onClear);
    this.btnExit.addEventListener('click', onExit);
  }

  setOrbitActive(on) {
    this.btnOrbit.classList.toggle('active', on);
  }

  firstCabVisit() {
    this.visitedCab = true;
  }

  showCard(html) {
    this.cardInner.innerHTML = html;
    this.cardEl.classList.remove('hidden');
  }

  hideCard() {
    this.cardEl.classList.add('hidden');
  }

  intro(onDismiss) {
    const controls = this.isTouch
      ? `<span><b>hold left / right</b> walk</span>
        <span><b>hold top / bottom</b> climb ladders</span>
        <span><b>tap or hold centre</b> tend &amp; interact</span>`
      : `<span><kbd>A</kbd><kbd>D</kbd> walk</span>
        <span><kbd>W</kbd><kbd>S</kbd> climb ladders</span>
        <span><kbd>E</kbd> tend &amp; interact</span>`;
    this.showCard(`
      <h1>Land Train</h1>
      <div class="rule"></div>
      <p>Drive your land train to the <b>Great Tree</b> on the horizon,
      and look after it along the way.</p>
      <p class="soft">Plot a route from the driver's cab, up top at the front.
      The train drives itself — you just live aboard.</p>
      <div class="controls">${controls}</div>
      <p class="press-any">${this.isTouch ? 'tap to begin' : 'press any key to begin'}</p>
    `);
    const dismiss = () => {
      this.hideCard();
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
      onDismiss();
    };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('pointerdown', dismiss);
  }

  arrival() {
    this.showCard(`
      <h2>You've arrived.</h2>
      <div class="rule"></div>
      <p>The Great Tree stands over you, lanterns swaying in the evening wind.
      The engine sighs and settles.</p>
      <p class="soft">Stay as long as you like — water the plants, read a page,
      or plot a new wander from the cab.</p>
      <p class="press-any">press any key to keep pottering</p>
    `);
    const dismiss = () => {
      this.hideCard();
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
    };
    setTimeout(() => {
      window.addEventListener('keydown', dismiss);
      window.addEventListener('pointerdown', dismiss);
    }, 600);
  }
}
