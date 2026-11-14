const CSS = `
#mute-hint.snd { display: flex; align-items: center; gap: 8px; pointer-events: auto; text-decoration: none;
  bottom: max(14px, env(safe-area-inset-bottom)); right: max(16px, env(safe-area-inset-right)); }
.snd-btn { width: 40px; height: 40px; display: grid; place-items: center; cursor: pointer; padding: 0;
  color: rgba(247, 234, 210, 0.82); background: rgba(36, 26, 40, 0.5); border: 1px solid rgba(247, 234, 210, 0.22);
  border-radius: 50%; backdrop-filter: blur(4px); touch-action: manipulation;
  transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
.snd-btn:hover, .snd.open .snd-btn { background: rgba(216, 160, 76, 0.3); border-color: rgba(236, 217, 160, 0.55); }
.snd-btn svg { width: 20px; height: 20px; overflow: visible; }
.snd-btn .snd-wave { transition: opacity 0.3s ease; }
.snd-btn .snd-cross { opacity: 0; transition: opacity 0.3s ease; }
.snd.muted .snd-btn { color: rgba(247, 234, 210, 0.5); }
.snd.muted .snd-wave { opacity: 0; }
.snd.muted .snd-cross { opacity: 1; }
.snd.quiet .snd-wave2 { opacity: 0; }
.snd-key { order: -1; }
@media (pointer: coarse) { .snd-key { display: none; } .snd-btn { width: 44px; height: 44px; } }
.snd-panel { position: absolute; right: 0; bottom: calc(100% + 10px); display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; white-space: nowrap; color: rgba(247, 234, 210, 0.85); font-size: 13px; letter-spacing: 0.04em;
  background: rgba(36, 26, 40, 0.78); border: 1px solid rgba(247, 234, 210, 0.22); border-radius: 999px;
  backdrop-filter: blur(6px); opacity: 0; transform: translateY(6px); pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease; }
.snd.open .snd-panel { opacity: 1; transform: none; pointer-events: auto; }
.snd-panel input[type=range] { -webkit-appearance: none; appearance: none; width: 132px; height: 28px; margin: 0;
  background: transparent; cursor: pointer; touch-action: none; }
.snd-panel input[type=range]::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: rgba(247, 234, 210, 0.3); }
.snd-panel input[type=range]::-moz-range-track { height: 3px; border-radius: 2px; background: rgba(247, 234, 210, 0.3); }
.snd-panel input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -7.5px;
  border-radius: 50%; background: #d8a04c; border: 1px solid rgba(36, 26, 40, 0.6); }
.snd-panel input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #d8a04c;
  border: 1px solid rgba(36, 26, 40, 0.6); }
.snd-toggle { font: inherit; color: inherit; cursor: pointer; padding: 6px 12px; border-radius: 999px;
  background: transparent; border: 1px solid rgba(247, 234, 210, 0.25); touch-action: manipulation;
  transition: background 0.3s ease, border-color 0.3s ease, opacity 0.3s ease; }
.snd-toggle[aria-pressed=true] { background: rgba(216, 160, 76, 0.32); border-color: rgba(236, 217, 160, 0.6); }
.snd-toggle[aria-pressed=false] { opacity: 0.6; }
`;

const ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M3 7.6h2.6L9.4 4.4v11.2L5.6 12.4H3z" fill="currentColor" fill-opacity="0.25"/>
<path class="snd-wave" d="M12.2 7.6a3.4 3.4 0 0 1 0 4.8"/>
<path class="snd-wave snd-wave2" d="M14.5 5.3a6.6 6.6 0 0 1 0 9.4"/>
<path class="snd-cross" d="M12.6 7.8l4.4 4.4M17 7.8l-4.4 4.4"/>
</svg>`;

// A tappable sound control that lives where the old "M sound" hint sat.
export function mountSoundControl(audio) {
  let host = document.getElementById('mute-hint');
  if (!host) {
    host = document.createElement('div');
    host.id = 'mute-hint';
    (document.getElementById('hud') || document.body).appendChild(host);
  }
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  host.classList.add('snd');
  host.innerHTML = `<span class="snd-key"><b>M</b></span>
<button class="snd-btn" type="button" aria-label="Sound" aria-expanded="false">${ICON}</button>
<div class="snd-panel" role="group" aria-label="Sound settings">
<input type="range" min="0" max="100" step="1" aria-label="Volume">
<button class="snd-toggle" type="button">music</button>
</div>`;
  const button = host.querySelector('.snd-btn');
  const slider = host.querySelector('input');
  const music = host.querySelector('.snd-toggle');

  const setOpen = (open) => {
    host.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', () => {
    audio.start();
    setOpen(!host.classList.contains('open'));
    button.blur();
  });
  slider.addEventListener('input', () => audio.setVolume(slider.value / 100));
  slider.addEventListener('change', () => slider.blur());
  music.addEventListener('click', () => {
    audio.setMusic(!audio.settings.music);
    music.blur();
  });
  window.addEventListener('pointerdown', (e) => {
    if (!host.contains(e.target)) setOpen(false);
  });
  for (const type of ['pointerdown', 'pointerup', 'keydown']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  const sync = (settings) => {
    host.classList.toggle('muted', settings.muted);
    host.classList.toggle('quiet', !settings.muted && settings.volume < 0.45);
    slider.value = String(Math.round((settings.muted ? 0 : settings.volume) * 100));
    music.setAttribute('aria-pressed', String(settings.music));
  };
  sync(audio.settings);
  return { sync };
}
