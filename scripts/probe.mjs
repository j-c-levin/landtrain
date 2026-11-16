import { chromium } from 'playwright-core';
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__game?.sky?.renderer && !!window.__perf, null, { timeout: 60000 });
const out = await page.evaluate(new Function(`return (${process.argv[3]})()`));
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
await browser.close();
