import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const argv = process.argv.slice(2);
const positional = [];
const opts = { threshold: 0.5, pixel: 0.1, diffs: null };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--threshold') opts.threshold = parseFloat(argv[++i]);
  else if (argv[i] === '--pixel') opts.pixel = parseFloat(argv[++i]);
  else if (argv[i] === '--diffs') opts.diffs = resolve(argv[++i]);
  else positional.push(argv[i]);
}
if (positional.length !== 2) {
  console.error('Usage: node scripts/capture-compare.mjs <dirA> <dirB> [--threshold <pct, default 0.5>] [--pixel <0-1 colour tolerance, default 0.1>] [--diffs <dir to write diff PNGs>]');
  process.exit(2);
}
const [dirA, dirB] = positional.map((p) => resolve(p));
const list = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('sheet')).sort();
const filesA = list(dirA);
const filesB = new Set(list(dirB));

const rows = [];
for (const file of filesA) {
  const name = file.replace(/\.png$/, '');
  if (!filesB.has(file)) { rows.push({ shot: name, status: 'missing-in-B' }); continue; }
  const a = PNG.sync.read(readFileSync(join(dirA, file)));
  const b = PNG.sync.read(readFileSync(join(dirB, file)));
  if (a.width !== b.width || a.height !== b.height) {
    rows.push({ shot: name, status: 'size-mismatch', sizeA: `${a.width}x${a.height}`, sizeB: `${b.width}x${b.height}` });
    continue;
  }
  const diff = opts.diffs ? new PNG({ width: a.width, height: a.height }) : null;
  const changed = pixelmatch(a.data, b.data, diff?.data ?? null, a.width, a.height, { threshold: opts.pixel });
  const percent = (changed / (a.width * a.height)) * 100;
  if (diff && changed) {
    mkdirSync(opts.diffs, { recursive: true });
    writeFileSync(join(opts.diffs, file), PNG.sync.write(diff));
  }
  rows.push({ shot: name, status: percent > opts.threshold ? 'over' : 'ok', changedPixels: changed, changedPercent: Number(percent.toFixed(4)) });
}
for (const f of filesB) if (!filesA.includes(f)) rows.push({ shot: f.replace(/\.png$/, ''), status: 'missing-in-A' });

const compared = rows.filter((r) => r.changedPercent !== undefined);
const summary = {
  dirA, dirB, thresholdPercent: opts.threshold, pixelTolerance: opts.pixel,
  shots: rows.length, compared: compared.length,
  maxChangedPercent: compared.length ? Math.max(...compared.map((r) => r.changedPercent)) : null,
  meanChangedPercent: compared.length ? Number((compared.reduce((s, r) => s + r.changedPercent, 0) / compared.length).toFixed(4)) : null,
  failing: rows.filter((r) => r.status !== 'ok').map((r) => r.shot),
};
console.log(JSON.stringify({ summary, rows }, null, 2));

const width = Math.max(...rows.map((r) => r.shot.length));
console.error(`\n${'shot'.padEnd(width)}  changed%   pixels  status`);
for (const r of rows) {
  const pct = r.changedPercent !== undefined ? r.changedPercent.toFixed(4).padStart(8) : '       -';
  const px = r.changedPixels !== undefined ? String(r.changedPixels).padStart(8) : '       -';
  console.error(`${r.shot.padEnd(width)}  ${pct} ${px}  ${r.status}`);
}
console.error(`\nmax ${summary.maxChangedPercent}%  mean ${summary.meanChangedPercent}%  threshold ${opts.threshold}%  ${summary.failing.length ? 'FAIL' : 'PASS'}`);
process.exit(summary.failing.length ? 1 : 0);
