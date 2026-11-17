// runtime QA: DOM sync dump in capture mode + full live interaction suite + mobile
import {chromium} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'sims', 'dist', 'lite3-live.html').replace(/\\/g, '/');
const out = path.join(here, '..', 'teardown-out');
const errors = [];

const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars']});

// ---- part 1: capture-mode DOM sync at t=45 --------------------------------
{
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('pageerror', (e) => errors.push('capture pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('capture console: ' + m.text()); });
  await page.addInitScript(() => { window.__CAPTURE = true; });
  await page.goto(url);
  await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
  const dump = await page.evaluate(() => {
    window.SIM.render(45);
    const g = [...document.querySelectorAll('[data-g]')].map((b) => b.dataset.g + (b.classList.contains('on') ? '*' : ''));
    const m = [...document.querySelectorAll('[data-m]')].map((b) => b.dataset.m + (b.classList.contains('on') ? '*' : ''));
    return {g, m, chips: [...document.querySelectorAll('.chip')].map((c) => c.textContent.trim()), ex: document.getElementById('s-explode').value, exLbl: document.getElementById('b-explode').textContent};
  });
  console.log('T45 SYNC', JSON.stringify(dump));
  await page.close();
}

// ---- part 2: live interaction suite ---------------------------------------
{
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('pageerror', (e) => errors.push('live pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('live console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__LITE && window.SIM && window.SIM.ready, null, {timeout: 60000});
  await page.waitForTimeout(1200);
  const keys = await page.evaluate(() => Object.keys(window.__LITE.studio));
  console.log('STUDIO KEYS', keys.join(','));

  const state = () => page.evaluate(() => {
    const s = window.__LITE.state();
    return {gait: s.P.gait, modes: s.modes, tour: s.tourOn, tier: s.tier, speed: +s.pose.speed.toFixed(2)};
  });

  // orbit drag + wheel zoom over the 3D area (between panels)
  const camBefore = await page.evaluate(() => window.__LITE.studio.camera.position.toArray().map((v) => +v.toFixed(2)));
  await page.mouse.move(780, 450);
  await page.mouse.down();
  await page.mouse.move(980, 380, {steps: 12});
  await page.mouse.up();
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(500);
  const camAfter = await page.evaluate(() => window.__LITE.studio.camera.position.toArray().map((v) => +v.toFixed(2)));
  console.log('ORBIT', JSON.stringify(camBefore), '->', JSON.stringify(camAfter));

  // every gait
  for (const g of ['walk', 'trot', 'bound', 'prone', 'sit', 'stand']) {
    await page.click(`[data-g="${g}"]`);
    await page.waitForTimeout(350);
    const s = await state();
    const on = await page.evaluate(() => [...document.querySelectorAll('[data-g].on')].map((b) => b.dataset.g));
    console.log('GAIT', g, 'state=' + s.gait, 'speed=' + s.speed, 'on=' + on.join('|'));
  }

  // sliders
  for (const [id, v] of [['s-speedK', '85'], ['s-heightK', '70'], ['s-pitch', '12'], ['s-roll', '-10']]) {
    await page.evaluate(([id, v]) => {
      const inp = document.getElementById(id);
      inp.value = v;
      inp.dispatchEvent(new Event('input', {bubbles: true}));
    }, [id, v]);
    await page.waitForTimeout(150);
  }
  console.log('SLIDERS', JSON.stringify(await page.evaluate(() => window.__LITE.state().P)));

  // explode / reassemble: button tween, slider direct, E key, pause safety
  await page.click('[data-c="hero"]');
  await page.waitForTimeout(1100);
  await page.click('#b-explode');
  await page.waitForFunction(() => window.__LITE.state().explode > 0.99, null, {timeout: 20000});
  const exOn = await page.evaluate(() => ({ex: +window.__LITE.state().explode.toFixed(2), lbl: document.getElementById('b-explode').textContent, chip: !document.getElementById('c-explode').hidden}));
  await page.screenshot({path: path.join(out, 'qa-explode.png')});
  await page.click('#b-explode');
  await page.waitForFunction(() => window.__LITE.state().explode < 0.01, null, {timeout: 20000});
  const exOff = await page.evaluate(() => ({ex: +window.__LITE.state().explode.toFixed(2), lbl: document.getElementById('b-explode').textContent, chip: !document.getElementById('c-explode').hidden}));
  await page.evaluate(() => { const s = document.getElementById('s-explode'); s.value = '50'; s.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.waitForTimeout(250);
  const exHalf = await page.evaluate(() => +window.__LITE.state().explode.toFixed(2));
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__LITE.state().explode > 0.99, null, {timeout: 20000});
  const exKey1 = await page.evaluate(() => +window.__LITE.state().explode.toFixed(2));
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  const pa = await page.evaluate(() => window.__LITE.state().explode);
  await page.waitForTimeout(500);
  const pb = await page.evaluate(() => window.__LITE.state().explode);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__LITE.state().explode < 0.01, null, {timeout: 20000});
  const pc = await page.evaluate(() => +window.__LITE.state().explode.toFixed(2));
  console.log('EXPLODE', JSON.stringify({on: exOn, off: exOff, half: exHalf, keyToFull: exKey1, pauseFrozen: pa === pb, resumedTo: pc}));

  // display toggles
  for (const m of ['cut', 'xray', 'wire', 'trails', 'labels', 'grid']) {
    await page.click(`[data-m="${m}"]`);
    await page.waitForTimeout(120);
  }
  console.log('MODES ALL ON', JSON.stringify((await state()).modes));
  for (const m of ['cut', 'xray', 'wire', 'trails', 'labels']) {
    await page.click(`[data-m="${m}"]`);
    await page.waitForTimeout(80);
  }

  // isolate + cameras + quality
  await page.selectOption('#isolate', 'FL');
  await page.waitForTimeout(200);
  await page.selectOption('#isolate', 'ALL');
  for (const c of ['side', 'front', 'top', 'leg', 'hero']) {
    await page.click(`[data-c="${c}"]`);
    await page.waitForTimeout(250);
  }
  console.log('CAM', JSON.stringify(await page.evaluate(() => window.__LITE.studio.camera.position.toArray().map((v) => +v.toFixed(2)))));
  for (const q of ['low', 'high', 'auto']) {
    await page.selectOption('#quality', q);
    await page.waitForTimeout(250);
  }

  // system buttons
  await page.click('#b-rand');
  await page.waitForTimeout(250);
  await page.click('#b-reset');
  await page.waitForTimeout(250);
  console.log('AFTER RESET', JSON.stringify(await state()));
  const dl = page.waitForEvent('download', {timeout: 20000}).catch(() => null);
  await page.click('#b-shot');
  const d = await dl;
  console.log('SHOT download=', d ? d.suggestedFilename() : 'none');

  // sound + tour + help
  await page.click('#b-sound');
  await page.waitForTimeout(120);
  const sndOff = await page.evaluate(() => document.getElementById('b-sound').classList.contains('on'));
  await page.click('#b-sound');
  const sndOn = await page.evaluate(() => document.getElementById('b-sound').classList.contains('on'));
  console.log('SOUND off/on=', sndOff, sndOn);
  await page.click('#b-tour');
  await page.waitForTimeout(400);
  const tourOn = await page.evaluate(() => window.__LITE.state().tourOn);
  await page.click('#b-tour');
  console.log('TOUR toggled=', tourOn);
  await page.click('#b-help');
  await page.waitForTimeout(200);
  const helpOpen = await page.evaluate(() => !document.getElementById('help').hidden);
  await page.click('#help-close');
  await page.waitForTimeout(150);
  const helpClosed = await page.evaluate(() => document.getElementById('help').hidden);
  console.log('HELP open/closed=', helpOpen, helpClosed);

  // pause / resume with space while trotting
  await page.click('[data-g="trot"]');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const p1 = await page.evaluate(() => ({hidden: document.getElementById('c-pause').hidden, ph: window.__LITE.state().pose.phase}));
  await page.waitForTimeout(500);
  const p2 = await page.evaluate(() => window.__LITE.state().pose.phase);
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const p3 = await page.evaluate(() => ({hidden: document.getElementById('c-pause').hidden, ph: window.__LITE.state().pose.phase}));
  console.log('PAUSE', JSON.stringify({chipShown: !p1.hidden, frozen: p1.ph === p2, resumed: p3.ph !== p2, chipHidden: p3.hidden}));
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
  await page.waitForTimeout(200);

  // keyboard
  for (const k of ['1', '2', '3', '4', '5', '6', 'c', 'x', 'v', 'g', 'l', 't', 'm', '0', 'h']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(90);
  }
  await page.keyboard.press('h');
  await page.waitForTimeout(150);
  console.log('AFTER KEYS', JSON.stringify(await state()));

  // repeated rapid interaction stability
  for (let i = 0; i < 12; i++) {
    await page.click(i % 2 ? '[data-g="stand"]' : '[data-g="trot"]', {delay: 10});
  }
  await page.waitForTimeout(400);
  console.log('RAPID OK', JSON.stringify(await state()));

  // resize desktop -> tablet -> mobile -> back
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
  await page.waitForTimeout(400);
  await page.click('#b-reset');
  await page.waitForTimeout(700);
  await page.setViewportSize({width: 1024, height: 768});
  await page.waitForTimeout(500);
  await page.screenshot({path: path.join(out, 'qa-1024.png')});
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(700);
  await page.screenshot({path: path.join(out, 'qa-mobile.png')});
  const mob = await page.evaluate(() => {
    const d = document.getElementById('deck').getBoundingClientRect();
    const t = document.getElementById('tele').getBoundingClientRect();
    return {deck: [d.left, d.top, d.right, d.bottom], tele: [t.left, t.top, t.right, t.bottom], vw: innerWidth, vh: innerHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth};
  });
  console.log('MOBILE RECTS', JSON.stringify(mob));
  await page.tap('[data-g="walk"]').catch(async () => { await page.click('[data-g="walk"]'); });
  await page.waitForTimeout(400);
  await page.screenshot({path: path.join(out, 'qa-mobile-walk.png')});
  await page.setViewportSize({width: 1600, height: 900});
  await page.waitForTimeout(600);
  await page.screenshot({path: path.join(out, 'qa-desktop-final.png')});
  console.log('FINAL', JSON.stringify(await state()));
  await page.close();
}

await browser.close();
console.log('ERRORS(' + errors.length + ')');
for (const e of errors.slice(0, 20)) console.log('  ' + e);