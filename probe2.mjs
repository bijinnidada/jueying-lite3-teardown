import path from 'node:path';
import {chromium} from 'playwright';

const ROOT = path.resolve('C:/Users/Administrator/Documents/Qoder/2026-11-13/b1b1c85d/teardown-kit-src');
const html = path.join(ROOT, 'sims/dist/lite3-live.html');
const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars']});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.addInitScript(() => { window.__CAPTURE = true; });
await page.goto('file://' + html);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
for (const x of [31]) {
  const d = await page.evaluate((x) => {
    window.SIM.render(x);
    const L = window.__LITE;
    return {
      t: x,
      legWhiteOp: L.dog.legs.map((l) => +l.mats.white.opacity.toFixed(2)),
      legRubberOp: L.dog.legs.map((l) => +l.mats.rubber.opacity.toFixed(2)),
      shellOp: +L.dog.mats.whiteShell.opacity.toFixed(2),
      internalsVisible: L.dog.internals.visible,
      isolateSel: document.querySelector('#isolate').value,
    };
  }, x);
  console.log(JSON.stringify(d)); await page.screenshot({path:'C:/Users/Administrator/Documents/Qoder/2026-11-13/b1b1c85d/teardown-out/probe-t'+x+'.png'});
}
await browser.close();