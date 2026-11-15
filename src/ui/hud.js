const ticks = (() => {
  let d = '';
  for (let i = 0; i <= 8; i++) {
    const a = ((-120 + i * 30 - 90) * Math.PI) / 180;
    const r0 = i % 4 === 0 ? 14.5 : 16;
    d += `M${(Math.cos(a) * r0).toFixed(2)} ${(Math.sin(a) * r0).toFixed(2)}L${(Math.cos(a) * 18.5).toFixed(2)} ${(Math.sin(a) * 18.5).toFixed(2)}`;
  }
  return d;
})();

const dial = (id, label, glyph) => `
  <div class="dial" id="${id}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100">
    <svg viewBox="-26 -26 52 52" aria-hidden="true">
      <circle class="dial-bezel" r="24"/>
      <circle class="dial-face" r="20.5"/>
      <path class="dial-low" d="M-16.02 9.25A18.5 18.5 0 0 1 -17.38 -6.33" />
      <path class="dial-ticks" d="${ticks}"/>
      <g class="dial-glyph">${glyph}</g>
      <g class="dial-needle"><path d="M-1.3 3.5L0 -17 1.3 3.5z"/></g>
      <circle class="dial-hub" r="2.6"/>
    </svg>
    <span class="dial-label">${label}</span>
  </div>`;

const FLAME = '<path d="M0 6.5c-3 0-5-2-5-4.6C-5-1 -2-2.2-1.6-6c2.6 1.6 2.4 3.6 3.4 4.4C2.6-2.6 3-3.4 3-4.4 4.6-2.6 5-.6 5 1.9 5 4.5 3 6.5 0 6.5z" transform="translate(0 8) scale(.62)"/>';
const WHEEL = '<g transform="translate(0 9) scale(.62)" fill="none" stroke-width="1.8"><circle r="5.6"/><path d="M0-5.6V5.6M-5.6 0H5.6M-4-4 4 4M-4 4 4-4" stroke-width="1.1"/></g>';

const ICON = {
  undo: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 3.5 8.5l4 4M4 8.5h7.5a4.5 4.5 0 0 1 0 9H8"/></svg>',
  clear: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg>',
  orbit: '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="10" rx="7.5" ry="3.4"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/></svg>',
  exit: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3.5H4.5v13H8M9 10h7.5M13.5 6.5 17 10l-3.5 3.5"/></svg>',
  sound: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7.8h2.8L10 4.600v10.800L6.3 12.200H3.500z" fill="currentColor"/><path class="waves" d="M12.8 7.400a3.6 3.6 0 0 1 0 5.200M14.9 5.200a6.6 6.6 0 0 1 0 9.6"/><path class="slash" d="M12.5 7.500l5 5M17.5 7.500l-5 5"/></svg>',
  train: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect x="2" y="4" width="13" height="7" rx="1.2" fill="var(--rust)"/><rect x="13" y="1.5" width="6" height="6" rx="1" fill="var(--cream)"/><rect x="4.5" y="1" width="2.2" height="3.5" fill="var(--ink)"/><circle cx="6.5" cy="12.5" r="2.3" fill="var(--ink)"/><circle cx="14.5" cy="12.5" r="2.3" fill="var(--ink)"/></svg>',
  tree: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 0 5 2.4 5 5.2 0 1-.3 1.9-.8 2.6 1.4.6 2.3 2 2.3 3.6 0 2.2-1.9 4-4.2 4H9.700c-2.3 0-4.2-1.8-4.2-4 0-1.6.9-3 2.3-3.6-.5-.7-.8-1.6-.8-2.600C7 4.4 9 2 12 2z" fill="var(--sage)"/><rect x="11" y="15" width="2" height="7" rx="1" fill="#6b5640"/></svg>',
  tap: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.2" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="7.2"/></svg>',
  chevron: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6"/></svg>',
};

export const TAP_ICON = ICON.tap;

const pad = (dir, code, key, touchLabel, keyLabel) => `
    <button type="button" tabindex="-1" class="coach-pad coach-${dir}" data-code="${code}">
      <span class="coach-btn">${ICON.chevron}<kbd>${key}</kbd></span>
      <span class="coach-label"><span class="touch-only">${touchLabel}</span><span class="keys-only">${keyLabel}</span></span>
    </button>`;

export const HUD_HTML = `
  <div id="gauges" class="plate">
    ${dial('gauge-engine', 'boiler', FLAME)}
    ${dial('gauge-tread', 'treads', WHEEL)}
  </div>

  <div id="journey" class="plate" aria-live="polite">
    <div class="j-track">
      <span class="j-line"><span class="j-fill"></span></span>
      <span class="j-train">${ICON.train}</span>
      <span class="j-tree">${ICON.tree}</span>
    </div>
    <div class="j-caption"><span id="j-dist"></span><span id="j-status"></span></div>
  </div>

  <div id="map-help">
    <span class="keys"><b>Click</b> lay waypoint</span>
    <span class="keys"><b>Z</b> undo</span>
    <span class="keys"><b>C</b> clear</span>
    <span class="keys"><b>Drag / scroll</b> pan &amp; zoom</span>
    <span class="keys"><b>E</b> set off</span>
    <span class="touch"><b>Tap</b> lay a waypoint</span>
    <span class="touch"><b>Drag</b> pan</span>
    <span class="touch"><b>Pinch</b> zoom</span>
  </div>

  <div id="coach" aria-hidden="true">
    ${pad('left', 'ArrowLeft', 'A', 'hold to walk', 'walk')}
    ${pad('right', 'ArrowRight', 'D', 'hold to walk', 'walk')}
    ${pad('up', 'ArrowUp', 'W', 'hold to climb', 'climb')}
    ${pad('down', 'ArrowDown', 'S', 'hold to descend', 'descend')}
  </div>

  <div id="edge-markers">
    <div class="edge-marker" id="marker-tree" hidden><span class="edge-arrow"></span><span class="edge-icon">${ICON.tree}</span></div>
    <div class="edge-marker" id="marker-train" hidden><span class="edge-arrow"></span><span class="edge-icon">${ICON.train}</span></div>
  </div>

  <div id="toast" role="status"></div>
  <div id="reading-line"></div>

  <button id="prompt" type="button" tabindex="-1">
    <span id="prompt-key">E</span>
    <span id="prompt-text"></span>
    <span id="prompt-bar"><span id="prompt-bar-fill"></span></span>
  </button>

  <div id="view-buttons">
    <button id="btn-undo" type="button">${ICON.undo}<span>undo</span></button>
    <button id="btn-clear" type="button">${ICON.clear}<span>clear</span></button>
    <button id="btn-orbit" type="button" aria-pressed="true">${ICON.orbit}<span>orbit</span></button>
    <button id="btn-exit" type="button">${ICON.exit}<span>exit</span></button>
    <button id="btn-sound" type="button" aria-label="sound" aria-pressed="true">${ICON.sound}</button>
  </div>

  <div id="sound-panel" role="group" aria-label="sound settings">
    <input id="sound-volume" type="range" min="0" max="100" step="1" aria-label="volume">
    <button id="sound-music" type="button" aria-pressed="true">music</button>
  </div>
`;

const ORNAMENT = `
  <svg class="ornament" viewBox="0 0 220 26" aria-hidden="true">
    <path d="M4 15h78M138 15h78" stroke="var(--brass-dim)" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M86 15h6M128 15h6" stroke="var(--brass-dim)" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="1 3"/>
    <g transform="translate(98 0)">
      <rect x="2" y="10" width="13" height="7" rx="1.2" fill="var(--rust)"/>
      <rect x="13" y="7.5" width="6" height="6" rx="1" fill="var(--brass)"/>
      <rect x="4.5" y="6" width="2.2" height="4.5" fill="var(--ink)"/>
      <circle cx="6.5" cy="18.5" r="2.3" fill="var(--ink)"/>
      <circle cx="14.5" cy="18.5" r="2.3" fill="var(--ink)"/>
    </g>
  </svg>`;

const TOUCH_DIAGRAM = `
  <svg class="zones" viewBox="0 0 240 132" role="img" aria-label="Hold the left or right of the screen to walk, the top or bottom to climb ladders, and the centre to tend and interact">
    <rect x="1.5" y="1.5" width="237" height="129" rx="12" fill="rgba(58,42,28,.05)" stroke="var(--ink)" stroke-width="1.5"/>
    <path d="M80 2v128M160 2v128M80 44h80M80 88h80" stroke="var(--ink)" stroke-width="1" stroke-dasharray="2 5" opacity=".55"/>
    <g fill="none" stroke="var(--rust)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M46 50l-9 9 9 9M194 50l9 9-9 9M111 20l9-8 9 8M111 110l9 8 9-8"/>
      <circle cx="120" cy="60" r="7"/>
    </g>
    <circle cx="120" cy="60" r="2.8" fill="var(--rust)"/>
    <g font-family="Fraunces, Georgia, serif" font-size="12.5" fill="var(--ink)" text-anchor="middle">
      <text x="41" y="88">walk</text>
      <text x="199" y="88">walk</text>
      <text x="120" y="35">climb</text>
      <text x="120" y="82">tend</text>
      <text x="120" y="104">descend</text>
    </g>
  </svg>`;

const KEYS = `
  <div class="controls">
    <span><kbd>A</kbd><kbd>D</kbd> walk</span>
    <span><kbd>W</kbd><kbd>S</kbd> climb ladders</span>
    <span><kbd>E</kbd> tend &amp; interact</span>
  </div>`;

export const introCard = (touch) => `
  <div class="card-main">
    <p class="overline">A first journey</p>
    <h1>Land Train</h1>
    ${ORNAMENT}
    <p>Drive your land train to the <b>Great Tree</b> on the horizon,
    and look after it along the way.</p>
    <p class="soft">Plot a route from the driver's cab, up top at the front.
    The train drives itself — you just live aboard.</p>
  </div>
  <div class="card-side">
    ${touch ? TOUCH_DIAGRAM : KEYS}
    <button class="card-go" type="button">Board the train</button>
    <p class="press-any">${touch ? 'tap anywhere to begin' : 'or press any key'}</p>
  </div>`;

export const storyCard = (touch, { title, body, soft, go, last }) => `
  <div class="card-main">
    <h2>${title}</h2>
    ${ORNAMENT}
    <p>${body}</p>
    <p class="soft">${soft}</p>
    <button class="card-go" type="button">${go}</button>
    <p class="press-any">${last ?? (touch ? 'tap anywhere to carry on' : 'or press any key')}</p>
  </div>`;
