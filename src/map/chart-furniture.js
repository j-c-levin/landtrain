import { GRASSLAND, ARRIVE_RADIUS } from '../constants.js';

export const LEAGUE = 100;

const BEARINGS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
const BAR_LEAGUES = [4, 2, 1, 0.5, 0.25];
const BAR_LABELS = ['4 leagues', '2 leagues', '1 league', '½ league', '¼ league'];
const BAR_MAX_PX = 118;

// Screen north is world -z, east is world +x.
export function bearingName(dx, dz) {
  const turn = Math.atan2(-dz, dx) / (Math.PI / 4);
  return BEARINGS[((Math.round(turn) % 8) + 8) % 8];
}

export function goalLine(dx, dz) {
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVE_RADIUS) return 'at the Great Tree';
  const leagues = Math.round(dist / LEAGUE);
  return `Great Tree · ${leagues} league${leagues === 1 ? '' : 's'} ${bearingName(dx, dz)}`;
}

// Index into BAR_LEAGUES of the longest bar that fits.
export function scaleBar(worldPerPixel) {
  for (let i = 0; i < BAR_LEAGUES.length; i++) {
    if ((BAR_LEAGUES[i] * LEAGUE) / worldPerPixel <= BAR_MAX_PX) return i;
  }
  return BAR_LEAGUES.length - 1;
}

const INK = '#3d2f28';
const RUST = '#a2351f';
const PAPER = '#f4e9d0';

const CSS = `
#chart-furniture { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.6s ease; color: ${INK}; }
#chart-furniture.on { opacity: 1; }
#map-rose { display: none; }
.chart-cartouche {
  position: absolute; top: 20px; left: 22px; width: 232px; padding: 11px 15px 12px;
  background: rgba(244, 233, 208, 0.94);
  border: 1.5px solid rgba(61, 47, 40, 0.85);
  outline: 1px solid rgba(61, 47, 40, 0.5); outline-offset: -5px;
  border-radius: 3px;
  box-shadow: 2px 3px 0 rgba(61, 47, 40, 0.18);
}
.chart-title { font-style: italic; font-weight: 600; font-size: 21px; letter-spacing: 0.02em; line-height: 1.1; text-align: center; }
.chart-sub { font-size: 9.5px; letter-spacing: 0.24em; text-transform: uppercase; text-align: center; opacity: 0.7; margin-top: 3px; }
.chart-rule { height: 5px; margin: 8px 6px 7px; border-top: 1px solid ${INK}; border-bottom: 1px solid rgba(61, 47, 40, 0.45); }
.chart-goal { font-size: 13px; text-align: center; color: ${RUST}; font-weight: 600; letter-spacing: 0.01em; }
.chart-key { display: grid; grid-template-columns: 30px 1fr; align-items: center; gap: 4px 8px; margin: 9px 2px 2px; font-size: 12px; font-style: italic; }
.chart-key svg { width: 30px; height: 14px; display: block; }
.chart-scale { display: flex; align-items: center; gap: 8px; margin: 10px 2px 0; font-size: 11px; letter-spacing: 0.06em; white-space: nowrap; }
.chart-bar { height: 7px; border: 1px solid ${INK}; background: linear-gradient(90deg, ${INK} 0 25%, transparent 25% 50%, ${INK} 50% 75%, transparent 75%); }
.chart-rose { position: absolute; left: 22px; bottom: 22px; width: 112px; height: 112px; }
@media (pointer: coarse) {
  .chart-cartouche { top: 14px; left: 12px; width: 190px; padding: 8px 9px 9px; }
  .chart-title { font-size: 17px; }
  .chart-sub { display: none; }
  .chart-rule { margin: 5px 4px 5px; }
  .chart-goal { font-size: 11.5px; white-space: nowrap; }
  .chart-key { font-size: 11px; margin-top: 6px; gap: 2px 7px; }
  .chart-scale { margin-top: 7px; }
  .chart-rose { width: 76px; height: 76px; left: 12px; bottom: 92px; }
}
@media (pointer: coarse) and (max-width: 600px) {
  .chart-cartouche { top: 78px; }
}
@media (max-height: 520px) {
  .chart-key { display: none; }
  .chart-rose { bottom: 14px; }
}
`;

function roseSvg() {
  let ticks = '';
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    const r0 = i % 4 === 0 ? 31.5 : i % 2 === 0 ? 33 : 34.5;
    const p = (r) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
    ticks += `M${p(r0)}L${p(37)}`;
  }
  const point = (deg, len, half) => `<g transform="rotate(${deg})">
    <path d="M0 ${-len} ${half} ${-half} 0 0z" fill="${PAPER}"/><path d="M0 ${-len} ${-half} ${-half} 0 0z" fill="${INK}"/></g>`;
  let star = '';
  for (let i = 0; i < 8; i++) star += point(22.5 + i * 45, 24, 3.2);
  for (let i = 0; i < 4; i++) star += point(45 + i * 90, 31, 5);
  for (let i = 0; i < 4; i++) star += point(i * 90, 42, 6.5);
  return `<svg class="chart-rose" viewBox="-56 -56 112 112" aria-hidden="true">
    <circle r="53" fill="${PAPER}" fill-opacity="0.9" stroke="${INK}" stroke-width="1.3"/>
    <g fill="none" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round">
      <circle r="37"/><circle r="30" stroke-width="0.6"/><path d="${ticks}" stroke-width="0.7"/>
      ${star}
      <circle r="2.2" fill="${PAPER}"/>
    </g>
    <path d="M0-52.5 3.4-45.5-3.4-45.5z" fill="${RUST}"/>
    <text y="-39.5" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-weight="600" font-size="9" fill="${RUST}" stroke="${PAPER}" stroke-width="2.2" paint-order="stroke">N</text>
  </svg>`;
}

const KEY = `
  <svg viewBox="0 0 30 14"><circle cx="15" cy="7" r="5" fill="none" stroke="${INK}" stroke-width="2.2"/></svg><span>you are here</span>
  <svg viewBox="0 0 30 14"><path d="M2 7h26" stroke="${PAPER}" stroke-width="5"/><path d="M2 7h26" stroke="#b5321a" stroke-width="2.6" stroke-dasharray="6 3.5"/></svg><span>the plotted route</span>
  <svg viewBox="0 0 30 14"><path d="M2 7h26" stroke="${INK}" stroke-width="1.8" stroke-dasharray="4 3"/></svg><span>the way you came</span>
  <svg viewBox="0 0 30 14"><circle cx="15" cy="7" r="6" fill="${PAPER}" stroke="${INK}"/><circle cx="15" cy="7" r="3.6" fill="none" stroke="#b5321a" stroke-width="1.6"/><circle cx="15" cy="7" r="1.2" fill="#b5321a"/></svg><span>the Great Tree</span>
  <svg viewBox="0 0 30 14"><circle cx="15" cy="7" r="6" fill="${PAPER}" stroke="${INK}"/><path d="M12 4l6 6M18 4l-6 6" stroke="#b5321a" stroke-width="1.8"/></svg><span>the way is blocked</span>
`;

export function createChartFurniture() {
  const hud = document.getElementById('hud') ?? document.body;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'chart-furniture';
  root.innerHTML = `
    <div class="chart-cartouche">
      <div class="chart-title"></div>
      <div class="chart-sub">surveyed as travelled</div>
      <div class="chart-rule"></div>
      <div class="chart-goal"></div>
      <div class="chart-key">${KEY}</div>
      <div class="chart-scale"><div class="chart-bar"></div><span class="chart-bar-label"></span></div>
    </div>
    ${roseSvg()}`;
  hud.appendChild(root);

  const title = root.querySelector('.chart-title');
  const goalEl = root.querySelector('.chart-goal');
  const bar = root.querySelector('.chart-bar');
  const barLabel = root.querySelector('.chart-bar-label');
  let on = false;
  let region = -1;
  let goalKey = NaN;
  let barKey = NaN;

  return {
    update(mapBlend, mapHeight, fov, pos, goal) {
      const show = mapBlend > 0.5;
      if (show !== on) {
        on = show;
        root.classList.toggle('on', on);
      }
      if (mapBlend < 0.05) return;

      const nextRegion = pos.x >= GRASSLAND.minX ? 1 : 0;
      if (nextRegion !== region) {
        region = nextRegion;
        title.textContent = region ? 'The Grassland' : 'The Prairie';
      }

      const dx = goal.x - pos.x;
      const dz = goal.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const key = Math.round(dist / LEAGUE) * 8 + Math.round(Math.atan2(-dz, dx) / (Math.PI / 4)) + (dist < ARRIVE_RADIUS ? 1e4 : 0);
      if (key !== goalKey) {
        goalKey = key;
        goalEl.textContent = goalLine(dx, dz);
      }

      const worldPerPixel = (2 * mapHeight * Math.tan((fov * Math.PI) / 360)) / window.innerHeight;
      const px = Math.round(worldPerPixel * 1e4);
      if (px !== barKey) {
        barKey = px;
        const i = scaleBar(worldPerPixel);
        bar.style.width = `${Math.round((BAR_LEAGUES[i] * LEAGUE) / worldPerPixel)}px`;
        barLabel.textContent = BAR_LABELS[i];
      }
    },
  };
}
