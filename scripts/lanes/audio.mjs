import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

// Renders each scripted moment in src/audio/render.js through an
// OfflineAudioContext in headless Chrome, then measures the result:
//   node scripts/lanes/audio.mjs [--out captures/lane-audio/audio] [--only name,name]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const outDir = resolve(root, arg('out', 'captures/lane-audio/audio'));
const only = arg('only', null)?.split(',');
const SOLOS = { 'prairie-day-cruise': ['train', 'world', 'music'], 'grass-river-night': ['train', 'world', 'music'], 'interface-sounds': ['near', 'ui'] };
const RATE = 44100;

async function freePort() {
  for (let port = 5400; port < 5500; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('no free port in 5400-5499');
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']) {
        if (existsSync(join(cache, dir, rel))) return join(cache, dir, rel);
      }
    }
  }
  throw new Error('no Chrome found; set CHROME_PATH');
}

const db = (v) => 20 * Math.log10(Math.max(v, 1e-7));
const round = (v, p = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : null);

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const N = 2048;
const HANN = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));

function spectra(mono) {
  const frames = [];
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let start = 0; start + N <= mono.length; start += N / 2) {
    for (let i = 0; i < N; i++) {
      re[i] = mono[start + i] * HANN[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) mag[i] = (re[i] * re[i] + im[i] * im[i]) / ((N / 4) * (N / 4));
    frames.push(mag);
  }
  return frames;
}

function analyse(channels) {
  const n = channels[0].length;
  const mono = new Float32Array(n);
  let peak = 0;
  let sumSq = 0;
  let sum = 0;
  let clipped = 0;
  let hot = 0;
  let maxStep = 0;
  let jumps = 0;
  for (const ch of channels) {
    for (let i = 0; i < n; i++) {
      const v = ch[i];
      const a = Math.abs(v);
      mono[i] += v / channels.length;
      if (a > peak) peak = a;
      if (a >= 0.99) clipped++;
      if (a > 0.5) hot++;
      sumSq += v * v;
      sum += v;
      if (i) {
        const step = Math.abs(v - ch[i - 1]);
        if (step > maxStep) maxStep = step;
        if (step > 0.25) jumps++;
      }
    }
  }
  const total = n * channels.length;
  const win = Math.floor(RATE * 0.05);
  const windows = [];
  for (let start = 0; start + win <= n; start += win) {
    let e = 0;
    for (let i = start; i < start + win; i++) e += mono[i] * mono[i];
    windows.push(Math.sqrt(e / win));
  }
  const body = windows.slice(20);
  const span = 8;
  let loud = 0;
  let quiet = Infinity;
  for (let i = 0; i + span <= body.length; i++) {
    let e = 0;
    for (let k = 0; k < span; k++) e += body[i + k] ** 2;
    const r = Math.sqrt(e / span);
    loud = Math.max(loud, r);
    quiet = Math.min(quiet, r);
  }
  const frames = spectra(mono);
  const bands = { low: 0, mid: 0, high: 0, air: 0 };
  let num = 0;
  let den = 0;
  for (const mag of frames) {
    for (let i = 1; i < mag.length; i++) {
      const f = (i * RATE) / N;
      const p = mag[i] / frames.length;
      bands[f < 200 ? 'low' : f < 2000 ? 'mid' : f < 8000 ? 'high' : 'air'] += p;
      num += f * p;
      den += p;
    }
  }
  return {
    metrics: {
      peakDb: round(db(peak)), rmsDb: round(db(Math.sqrt(sumSq / total))),
      loudest400msDb: round(db(loud)), quietest400msDb: round(db(quiet)),
      clippedSamples: clipped, overKneeFrac: round(hot / total, 5),
      dc: round(sum / total, 5), silentFrac: round(body.filter((r) => db(r) < -66).length / body.length, 3),
      maxStep: round(maxStep, 4), jumpsOver025: jumps,
      lowDb: round(db(Math.sqrt(bands.low))), midDb: round(db(Math.sqrt(bands.mid))),
      highDb: round(db(Math.sqrt(bands.high))), airDb: round(db(Math.sqrt(bands.air))),
      centroidHz: Math.round(num / den),
    },
    frames, mono,
  };
}

function stepNear(mono, seconds, half = 0.4) {
  let max = 0;
  const a = Math.max(1, Math.floor((seconds - half) * RATE));
  const b = Math.min(mono.length, Math.floor((seconds + half) * RATE));
  for (let i = a; i < b; i++) max = Math.max(max, Math.abs(mono[i] - mono[i - 1]));
  return max;
}

function wav(channels) {
  const n = channels[0].length;
  const bytes = Buffer.alloc(44 + n * channels.length * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + n * channels.length * 2, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels.length, 22);
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * channels.length * 2, 28);
  bytes.writeUInt16LE(channels.length * 2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(n * channels.length * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const ch of channels) {
      bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[i])) * 32767), o);
      o += 2;
    }
  }
  return bytes;
}

const STOPS = [[8, 6, 20], [60, 20, 90], [150, 40, 100], [230, 100, 60], [252, 200, 90], [255, 250, 220]];
function spectrogram(frames) {
  const height = 300;
  const stride = Math.max(1, Math.ceil(frames.length / 1400));
  const width = Math.floor(frames.length / stride);
  const png = new PNG({ width, height });
  const fLo = 30;
  const fHi = 18000;
  for (let x = 0; x < width; x++) {
    const mag = frames[x * stride];
    for (let y = 0; y < height; y++) {
      const f0 = fLo * (fHi / fLo) ** ((height - 1 - y) / height);
      const f1 = fLo * (fHi / fLo) ** ((height - y) / height);
      const b0 = Math.max(1, Math.floor((f0 * N) / RATE));
      const b1 = Math.min(N / 2 - 1, Math.max(b0, Math.floor((f1 * N) / RATE)));
      let p = 0;
      for (let b = b0; b <= b1; b++) p = Math.max(p, mag[b]);
      const k = Math.max(0, Math.min(0.9999, (10 * Math.log10(p + 1e-14) + 88) / 62)) * (STOPS.length - 1);
      const i = Math.floor(k);
      const t = k - i;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) png.data[o + c] = STOPS[i][c] + (STOPS[i + 1][c] - STOPS[i][c]) * t;
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const port = await freePort();
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root, stdio: 'ignore',
});
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);
const url = `http://127.0.0.1:${port}/landtrain/src/audio/lab.html`;
for (let i = 0; i < 150; i++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200));
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => !!window.__audioLab);
const names = (await page.evaluate(() => Object.keys(window.__audioLab.SCENARIOS))).filter((n) => !only || only.some((o) => n.includes(o)));

const clips = {};
const monos = {};
for (const name of names) {
  for (const solo of [null, ...(SOLOS[name] ?? [])]) {
    const id = solo ? `${name}--${solo}` : name;
    const started = Date.now();
    const encoded = await page.evaluate(async ({ name, solo, rate }) => {
      const buffer = await window.__audioLab.renderClip(name, { solo, sampleRate: rate });
      const b64 = (f32) => {
        const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
      };
      return [b64(buffer.getChannelData(0)), b64(buffer.getChannelData(1))];
    }, { name, solo, rate: RATE });
    const channels = encoded.map((e) => {
      const buf = Buffer.from(e, 'base64');
      return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    });
    const { metrics, frames, mono } = analyse(channels);
    metrics.seconds = round(channels[0].length / RATE, 2);
    metrics.renderMs = Date.now() - started;
    clips[id] = metrics;
    monos[id] = mono;
    await writeFile(join(outDir, `${id}.wav`), wav(channels));
    await writeFile(join(outDir, `${id}.png`), spectrogram(frames));
    console.log(
      `${id.padEnd(40)} peak ${String(metrics.peakDb).padStart(6)}  rms ${String(metrics.rmsDb).padStart(6)}  ` +
      `loud ${String(metrics.loudest400msDb).padStart(6)}  quiet ${String(metrics.quietest400msDb).padStart(6)}  ` +
      `clip ${metrics.clippedSamples}  knee ${metrics.overKneeFrac}  silent ${metrics.silentFrac}  step ${metrics.maxStep}  ` +
      `L/M/H ${metrics.lowDb}/${metrics.midDb}/${metrics.highDb}  cen ${metrics.centroidHz}`
    );
  }
}

// ------------------------------------------------------------ live game
const live = { skipped: !!only };
if (!only) {
  const game = await browser.newPage({ viewport: { width: 900, height: 560 } });
  game.on('pageerror', (e) => errors.push(String(e)));
  const gameUrl = `http://127.0.0.1:${port}/landtrain/?quality=low`;
  await game.goto(gameUrl);
  await game.waitForFunction(() => !!window.__game && !!window.__audio);
  live.beforeGesture = await game.evaluate(() => ({ started: __audio.started, context: __audio.ctx?.state ?? 'none' }));
  await game.keyboard.press('Space');
  await game.waitForFunction(() => __audio.ctx?.state === 'running', null, { timeout: 10000 });
  await game.evaluate(() => {
    const { train } = __game;
    train.addWaypoint(train.pos.x + 400, 0);
    const original = __audio.update.bind(__audio);
    window.__cost = { ms: 0, calls: 0, load: [] };
    __audio.update = (dt, v) => {
      const t0 = performance.now();
      original(dt, v);
      __cost.ms += performance.now() - t0;
      __cost.calls++;
    };
    const cap = __audio.ctx.renderCapacity;
    if (cap) {
      cap.addEventListener('update', (e) => __cost.load.push([e.averageLoad, e.peakLoad, e.underrunRatio]));
      cap.start({ updateInterval: 1 });
    }
  });
  await game.waitForTimeout(9000);
  live.running = await game.evaluate(() => ({
    context: __audio.ctx.state, sampleRate: __audio.ctx.sampleRate, lite: __audio.scape.lite,
    speed: __game.train.speed, updateMsPerFrame: __cost.ms / __cost.calls, frames: __cost.calls,
    renderLoad: __cost.load.slice(-5),
    control: !!document.querySelector('#btn-sound'),
  }));
  await game.click('#btn-sound');
  live.oneTapMutes = await game.evaluate(() => __audio.settings.muted);
  await game.click('#btn-sound');
  await game.hover('#btn-sound');
  await game.waitForTimeout(400);
  await game.screenshot({ path: join(outDir, 'control-open.png') });
  await game.locator('#sound-volume').fill('35');
  await game.click('#sound-music');
  await game.mouse.click(300, 200);
  await game.keyboard.press('KeyM');
  await game.waitForTimeout(900);
  live.muted = await game.evaluate(() => ({
    context: __audio.ctx.state, stored: localStorage.getItem('landtrain.audio.v1'),
    hintMuted: document.getElementById('btn-sound').classList.contains('muted'),
  }));
  await game.screenshot({ path: join(outDir, 'control-muted.png') });
  await game.reload();
  await game.waitForFunction(() => !!window.__game && !!window.__audio);
  await game.keyboard.press('Space');
  await game.waitForTimeout(600);
  live.afterReload = await game.evaluate(() => ({
    settings: __audio.settings, context: __audio.ctx?.state,
    hintMuted: document.getElementById('btn-sound').classList.contains('muted'),
  }));
  await game.keyboard.press('KeyM');
  await game.waitForFunction(() => __audio.ctx?.state === 'running', null, { timeout: 5000 }).catch(() => {});
  live.unmuted = await game.evaluate(() => ({ context: __audio.ctx.state, settings: __audio.settings }));
  await game.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  console.log('live', JSON.stringify(live, null, 1));
}
await browser.close();
stop();

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
const full = Object.entries(clips).filter(([id]) => !id.includes('--'));
check('no clip reaches full scale', full.every(([, m]) => m.clippedSamples === 0 && m.peakDb <= -1), `max peak ${Math.max(...full.map(([, m]) => m.peakDb))} dBFS`);
check('no large sample-to-sample jumps', full.every(([, m]) => m.jumpsOver025 === 0), `max step ${Math.max(...full.map(([, m]) => m.maxStep))}`);
check('no DC offset', full.every(([, m]) => Math.abs(m.dc) < 0.002), `max |dc| ${Math.max(...full.map(([, m]) => Math.abs(m.dc)))}`);
const unexpectedSilence = full.filter(([id, m]) => !['mute-and-unmute', 'music-alone'].includes(id) && m.silentFrac > 0).map(([id]) => id);
check('nothing falls silent while unmuted', unexpectedSilence.length === 0, unexpectedSilence.join(', ') || 'none');
const c = clips;
if (c['mute-and-unmute']) {
  const mono = monos['mute-and-unmute'];
  check('mute reaches silence', c['mute-and-unmute'].quietest400msDb < -80, `${c['mute-and-unmute'].quietest400msDb} dBFS`);
  const atMute = stepNear(mono, 4.1, 0.3);
  const atUnmute = stepNear(mono, 8.1, 0.3);
  const cruising = stepNear(mono, 2, 1.5);
  check('mute and unmute ramps add no step', atMute <= cruising && atUnmute <= cruising, `steps ${round(atMute, 4)} / ${round(atUnmute, 4)} vs cruising ${round(cruising, 4)}`);
}
if (c['cruise-living-car'] && c['prairie-day-cruise']) {
  check('interior is darker than exterior', c['cruise-living-car'].highDb < c['prairie-day-cruise'].highDb - 6, `high band ${c['cruise-living-car'].highDb} vs ${c['prairie-day-cruise'].highDb} dB`);
}
if (c['prairie-night-idle'] && c['prairie-day-cruise']) {
  check('night at rest is quieter than a day cruise', c['prairie-night-idle'].rmsDb < c['prairie-day-cruise'].rmsDb - 6, `${c['prairie-night-idle'].rmsDb} vs ${c['prairie-day-cruise'].rmsDb} dBFS`);
}
if (c['prairie-day-cruise-lite'] && c['prairie-day-cruise']) {
  check('lite tier keeps the same level', Math.abs(c['prairie-day-cruise-lite'].rmsDb - c['prairie-day-cruise'].rmsDb) < 2, `${c['prairie-day-cruise-lite'].rmsDb} vs ${c['prairie-day-cruise'].rmsDb} dBFS`);
}
if (!live.skipped) {
  check('no sound before the first gesture', !live.beforeGesture.started && live.beforeGesture.context === 'none', JSON.stringify(live.beforeGesture));
  check('sound runs after the first gesture', live.running.context === 'running' && live.running.control, `${live.running.context}, ${round(live.running.updateMsPerFrame, 4)} ms of script per frame`);
  check('mute suspends the context and persists', live.muted.context === 'suspended' && live.muted.hintMuted && live.afterReload.settings.muted && live.afterReload.settings.volume === 0.35 && live.afterReload.settings.music === false && live.afterReload.context === 'suspended', live.muted.stored);
  check('unmute resumes', live.unmuted.context === 'running' && !live.unmuted.settings.muted, live.unmuted.context);
}
check('no page errors', errors.length === 0, errors.join(' | ') || 'none');

for (const k of checks) console.log(`${k.pass ? 'PASS' : 'FAIL'}  ${k.name} — ${k.detail}`);
await writeFile(join(outDir, 'metrics.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sampleRate: RATE, clips, live, checks }, null, 2));
process.exit(checks.every((k) => k.pass) ? 0 : 1);
