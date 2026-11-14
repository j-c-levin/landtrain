import { readdirSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const positional = [];
const opts = { only: null, perSheet: 8, prefix: 'sheet', out: null };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--only') opts.only = argv[++i].split(',');
  else if (argv[i] === '--per-sheet') opts.perSheet = parseInt(argv[++i], 10);
  else if (argv[i] === '--prefix') opts.prefix = argv[++i];
  else if (argv[i] === '--out') opts.out = resolve(argv[++i]);
  else positional.push(argv[i]);
}
if (!positional.length || positional.length > 2) {
  console.error('Usage: node scripts/capture-sheet.mjs <dir> [<dirB>] [--only a,b] [--per-sheet 8] [--prefix sheet] [--out <dir>]');
  process.exit(2);
}
const [dirA, dirB] = positional.map((p) => resolve(p));
const outDir = opts.out ?? dirA;
mkdirSync(outDir, { recursive: true });
const list = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith(opts.prefix)).sort();
let files = list(dirA);
if (dirB) {
  const b = new Set(list(dirB));
  files = files.filter((f) => b.has(f));
}
if (opts.only) files = files.filter((f) => opts.only.some((o) => f.includes(o)));
if (!files.length) { console.error('no shots to render'); process.exit(1); }

function findChrome() {
  for (const c of [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
    if (c && existsSync(c)) return c;
  }
  throw new Error('no Chrome found; set CHROME_PATH');
}

const CELL = 560;
const perSheet = dirB ? Math.min(opts.perSheet, 4) : opts.perSheet;
const sheets = [];
for (let i = 0; i < files.length; i += perSheet) sheets.push(files.slice(i, i + perSheet));
const columns = dirB ? 1 : 2;
const cellWidth = dirB ? CELL * 2 + 10 : CELL;
const label = (file) => file.replace(/\.png$/, '').split('--').join('  /  ');
const tile = (dir, file, tag) => `<figure>${tag ? `<span class="tag">${tag}</span>` : ''}<img src="${pathToFileURL(join(dir, file)).href}"></figure>`;

const style = `
  body { margin: 0; padding: 20px; background: #1b1a18; color: #eee6d6; font: 15px/1.3 ui-monospace, Menlo, monospace; }
  .grid { display: grid; grid-template-columns: repeat(${columns}, ${cellWidth}px); gap: 22px 20px; align-items: start; }
  .cell h2 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
  .pair { display: grid; grid-template-columns: ${dirB ? `repeat(2, ${CELL}px)` : `${CELL}px`}; gap: 10px; align-items: start; }
  figure { margin: 0; position: relative; }
  img { width: 100%; display: block; background: #000; image-rendering: auto; }
  .tag { position: absolute; top: 6px; left: 6px; background: #000c; color: #fff; padding: 2px 8px; border-radius: 3px; font-weight: 700; }
`;

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const written = [];
try {
  for (let n = 0; n < sheets.length; n++) {
    const cells = sheets[n].map((file) => `<div class="cell"><h2>${label(file)}</h2><div class="pair">${tile(dirA, file, dirB ? 'A' : '')}${dirB ? tile(dirB, file, 'B') : ''}</div></div>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><style>${style}</style><div class="grid">${cells}</div>`;
    const htmlPath = join(outDir, `.${opts.prefix}-${n + 1}.html`);
    writeFileSync(htmlPath, html);
    const page = await browser.newPage({ viewport: { width: columns * cellWidth + (columns - 1) * 20 + 40, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    const out = join(outDir, `${opts.prefix}-${String(n + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: out, fullPage: true });
    await page.close();
    rmSync(htmlPath);
    written.push(out);
  }
} finally {
  await browser.close();
}
for (const w of written) console.log(w);
