import {chromium} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'sims', 'dist', 'lite3-live.html').replace(/\\/g, '/');
const out = path.join(here, '..', 'teardown-out');
const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars']});

for (const [name, vp] of [['desktop', {width: 1600, height: 900}], ['mobile', {width: 390, height: 844}]]) {
  const page = await browser.newPage({viewport: vp});
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__LITE && window.SIM && window.SIM.ready, null, {timeout: 60000});
  await page.waitForTimeout(2500);
  const tier = await page.evaluate(() => window.__LITE.state().tier);
  await page.screenshot({path: path.join(out, `v6-live-${name}.png`)});
  console.log(name, 'tier=' + tier, 'errors=' + errs.length, errs.slice(0, 3));
  await page.close();
}
await browser.close();