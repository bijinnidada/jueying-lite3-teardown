// Teardown-alignment QA: radial starburst states, focus ghost, turntable, pause/reset, mobile.
import {chromium} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'sims', 'dist', 'lite3-live.html').replace(/\\/g, '/');
const out = path.join(here, '..', 'teardown-out');
const errors = [];
const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars']});

// ---- part A: capture-mode pure states --------------------------------------
{
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('pageerror', (e) => errors.push('capture pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('capture console: ' + m.text()); });
  await page.addInitScript(() => { window.__CAPTURE = true; });
  await page.goto(url);
  await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
  const dump = await page.evaluate(() => {
    window.SIM.render(42.5);
    const det = [...document.querySelectorAll('.tree .st')].filter((e) => e.classList.contains('st-det')).length;
    const legDet = [...document.querySelectorAll('.jst')].filter((e) => e.classList.contains('st-det')).length;
    const hot = [...document.querySelectorAll('.jrow span.hot')].length;
    const turn = window.__LITE.turnG.rotation.y;
    const capSub = document.getElementById('cap-sub').textContent;
    window.SIM.render(42); const t42 = window.__LITE.turnG.rotation.y;
    window.SIM.render(43); const t43 = window.__LITE.turnG.rotation.y;
    return {det, legDet, hot, turn: +turn.toFixed(3), capSub, t42: +t42.toFixed(3), t43: +t43.toFixed(3), turnDiffers: Math.abs(t43 - t42) > 0.01};
  });
  console.log('CAP42.5', JSON.stringify(dump));
  const bat = await page.evaluate(() => {
    window.SIM.render(46);
    const open = [...document.querySelectorAll('.tree .st')].filter((e) => e.classList.contains('st-open')).map((e) => e.id);
    const eng = [...document.querySelectorAll('.tree .st')].filter((e) => e.classList.contains('st-eng')).length;
    const labels = [...document.querySelectorAll('.lab')].filter((l) => l.style.opacity !== '0').length;
    const ghostOp = window.__LITE.dog.matGroups.shell[0].opacity;
    return {open, eng, labels, ghostOp: +ghostOp.toFixed(3), capSub: document.getElementById('cap-sub').textContent};
  });
  console.log('CAP46', JSON.stringify(bat));
  await page.close();
}

// ---- part B: live interaction ----------------------------------------------
{
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('pageerror', (e) => errors.push('live pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('live console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__LITE && window.SIM && window.SIM.ready, null, {timeout: 60000});
  await page.waitForTimeout(800);

  // full explode -> 10 DETACHED BOM chips (6 torso + 4 leg heads) + 4 leg chips
  await page.click('#b-explode');
  await page.waitForFunction(() => window.__LITE.state().explode > 0.99, null, {timeout: 20000});
  await page.waitForTimeout(300);
  const full = await page.evaluate(() => ({
    det: [...document.querySelectorAll('.tree .st')].filter((e) => e.classList.contains('st-det')).length,
    legDet: [...document.querySelectorAll('.jst')].filter((e) => e.classList.contains('st-det')).length,
    turn: +window.__LITE.turnG.rotation.y.toFixed(3),
  }));
  console.log('LIVE FULL', JSON.stringify(full));
  await page.screenshot({path: path.join(out, 'qa2-explode.png')});

  // turntable accumulates while apart
  const r1 = await page.evaluate(() => window.__LITE.turnG.rotation.y);
  await page.waitForTimeout(500);
  const r2 = await page.evaluate(() => window.__LITE.turnG.rotation.y);
  console.log('TURN accum', r1.toFixed(3), '->', r2.toFixed(3), 'grew=', r2 > r1);

  // battery focus -> OPEN chip, others ENGAGED, ghost opacity
  await page.click('[data-f="battery"]');
  await page.waitForFunction(() => { const s = window.__LITE.state(); return s.focus === 'battery' && s.explode > 0.1 && s.explode < 0.2; }, null, {timeout: 20000});
  await page.waitForTimeout(600);
  const foc = await page.evaluate(() => ({
    ex: +window.__LITE.state().explode.toFixed(2),
    open: [...document.querySelectorAll('.tree .st')].filter((e) => e.classList.contains('st-open')).map((e) => e.id),
    eng: [...document.querySelectorAll('.tree .st')].filter((e) => e.classList.contains('st-eng')).length,
    ghostShell: +window.__LITE.dog.matGroups.shell[0].opacity.toFixed(3),
    ghostBatt: +window.__LITE.dog.matGroups.battery[0].opacity.toFixed(3),
    pickerOn: document.querySelector('[data-f="battery"]').classList.contains('on'),
    capSub: document.getElementById('cap-sub').textContent,
  }));
  console.log('LIVE FOCUS', JSON.stringify(foc));
  await page.screenshot({path: path.join(out, 'qa2-battery.png')});

  // pause freezes turntable
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const p1 = await page.evaluate(() => window.__LITE.turnG.rotation.y);
  await page.waitForTimeout(500);
  const p2 = await page.evaluate(() => window.__LITE.turnG.rotation.y);
  await page.keyboard.press('Space');
  console.log('PAUSE turn frozen=', p1 === p2);

  // back to ALL then reset -> zero
  await page.click('[data-f="ALL"]');
  await page.waitForFunction(() => window.__LITE.state().explode < 0.01, null, {timeout: 20000});
  await page.click('#b-reset');
  await page.waitForTimeout(900);
  const rst = await page.evaluate(() => ({
    ex: +window.__LITE.state().explode.toFixed(2), focus: window.__LITE.state().focus,
    turn: +window.__LITE.turnG.rotation.y.toFixed(3),
    det: [...document.querySelectorAll('.tree .st')].filter((e) => e.classList.contains('st-det')).length,
  }));
  console.log('RESET', JSON.stringify(rst));

  // rapid gait + explode stability
  for (let i = 0; i < 10; i++) await page.click(i % 2 ? '[data-g="stand"]' : '[data-g="trot"]', {delay: 10});
  await page.click('#b-explode'); await page.waitForTimeout(200); await page.click('#b-explode');
  await page.waitForTimeout(400);
  console.log('RAPID OK', JSON.stringify(await page.evaluate(() => ({g: window.__LITE.state().P.gait, ex: +window.__LITE.state().explode.toFixed(2)}))));

  // mobile
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(700);
  const mob = await page.evaluate(() => {
    const deck = document.getElementById('deck');
    const tree = document.getElementById('sec-tree');
    const detail = document.getElementById('sec-detail');
    return {
      overflowX: document.documentElement.scrollWidth > innerWidth,
      treeInDeck: deck.contains(tree) && getComputedStyle(tree).display !== 'none',
      detailInDeck: deck.contains(detail) && getComputedStyle(detail).display !== 'none',
      deckHScroll: deck.scrollWidth > deck.clientWidth,
      vw: innerWidth,
    };
  });
  console.log('MOBILE', JSON.stringify(mob));
  await page.screenshot({path: path.join(out, 'qa2-mobile.png')});
  await page.setViewportSize({width: 1600, height: 900});
  await page.waitForTimeout(500);
  await page.close();
}

await browser.close();
console.log('ERRORS(' + errors.length + ')');
for (const e of errors.slice(0, 20)) console.log('  ' + e);