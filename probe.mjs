import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const ROOT = path.resolve('C:/Users/Administrator/Documents/Qoder/2026-11-13/b1b1c85d/teardown-kit-src');
const html = path.join(ROOT, 'sims/dist/lite3-live.html');
const OUT = 'C:/Users/Administrator/Documents/Qoder/2026-11-13/b1b1c85d/teardown-out';
const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars']});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.addInitScript(() => { window.__CAPTURE = true; });
await page.goto('file://' + html);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});

const diag = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const cs = getComputedStyle(cv);
  const stack = document.elementsFromPoint(innerWidth / 2, innerHeight / 2).map((e) => `${e.tagName}#${e.id}.${e.className}`);
  const L = window.__LITE;
  const m = L.dog.mats;
  return {
    canvas: {opacity: cs.opacity, filter: cs.filter, mix: cs.mixBlendMode, z: cs.zIndex, pos: cs.position},
    stack,
    mats: Object.fromEntries(Object.entries(m).slice(0, 8).map(([k, v]) => [k, {op: v.opacity, tr: v.transparent, color: '#' + v.color.getHexString()}])),
    modes: L.state().modes,
    toneMapping: L.studio.renderer.toneMapping,
    exposure: L.studio.renderer.toneMappingExposure,
    outputColorSpace: L.studio.renderer.outputColorSpace,
    envIntensity: L.studio.scene.environmentIntensity,
    bloom: {enabled: L.studio.bloomPass.enabled, strength: L.studio.bloomPass.strength, threshold: L.studio.bloomPass.threshold},
  };
});
console.log(JSON.stringify(diag, null, 1));

const shot = async (name) => { await page.screenshot({path: path.join(OUT, `probe-${name}.png`)}); console.log('shot', name); };
await page.evaluate(() => window.SIM.render(0));
await shot('a-base');
await page.evaluate(() => { window.__LITE.studio.bloomPass.enabled = false; window.SIM.render(0); });
await shot('b-nobloom');
await page.evaluate(() => { const s = window.__LITE.studio; s.renderer.render(s.scene, s.camera); });
await shot('c-raw');
await page.evaluate(() => { const s = window.__LITE.studio; s.scene.fog = null; s.ground.visible = false; s.contact.visible = false; s.grid.visible = false; s.renderer.render(s.scene, s.camera); });
await shot('d-noground');
await browser.close();