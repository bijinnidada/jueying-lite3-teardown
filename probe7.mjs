// Rescue-game QA: pick -> autonomous hunt -> submit -> 3/3 -> fireworks ending,
// pause/restart/exit, mobile layout, repeat cycles. Logic at 640x360 low tier.
import {chromium} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildHunt, huntPose, GAME_KINDS, kindOf} from './sims/lite3-live/game.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'sims', 'dist', 'lite3-live.html').replace(/\\/g, '/');
const out = path.join(here, '..', 'teardown-out');
const errors = [];
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); };

// ---- pure model: every hunt is finite, continuous, sweeps then locks --------
const origins = [{x: -1.85, z: 0, yaw: 0}, {x: -0.85, z: -0.42, yaw: 1.2}, {x: 0.05, z: 0.42, yaw: -1.4}];
for (const id of ['ext1', 'ext2', 'hyd1', 'fire1']) {
  let ok = true, note = '';
  for (const from of origins) {
    const h = buildHunt(from, id);
    let prev = null, maxV = 0, nan = 0, swept = false;
    for (let t = 0; t <= h.duration + 0.5; t += 0.02) {
      const p = huntPose(h, t);
      if (!isFinite(p.x + p.z + p.yaw + p.headYaw + p.headPitch)) nan++;
      if (p.kind === 'travel' && Math.abs(p.headYaw) > 0.2) swept = true;
      if (prev) maxV = Math.max(maxV, Math.hypot(p.x - prev.x, p.z - prev.z) / 0.02);
      prev = p;
    }
    const end = huntPose(h, h.duration - 0.5);
    const after = huntPose(h, h.duration + 2);
    const good = h.duration > 3 && h.duration < 40 && nan === 0 && maxV / h.speed < 1.3 && swept
      && end.scan && end.scan.id === id && after.kind === 'huntend'
      && h.events.length === 1 && h.events[0].report.includes('找到');
    if (!good) { ok = false; note = `dur=${h.duration.toFixed(1)} nan=${nan} swept=${swept} peak=${(maxV / h.speed).toFixed(2)}`; }
  }
  check(`model hunt ${id}`, ok, note);
}
check('kindOf mapping', kindOf('ext2').id === 'ext' && kindOf('hyd1').id === 'hyd' && kindOf('fire1').id === 'fire' && GAME_KINDS.length === 3);

const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars']});
const page = await browser.newPage({viewport: {width: 640, height: 360}});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__LITE && window.SIM && window.SIM.ready, null, {timeout: 60000});
await page.selectOption('#quality', 'low');
await page.waitForTimeout(400);
const shot = async (name, w, h) => {
  await page.setViewportSize({width: w, height: h});
  await page.waitForTimeout(900);
  await page.screenshot({path: path.join(out, name)});
  await page.setViewportSize({width: 640, height: 360});
  await page.waitForTimeout(400);
};

// ---- enter game: board replaces sim grid ------------------------------------
await page.click('[data-sim="game"]');
await page.waitForFunction(() => window.__LITE.state().game && window.__LITE.state().game.phase === 'pick', null, {timeout: 10000});
const enter = await page.evaluate(() => ({
  board: !document.getElementById('gameboard').hidden,
  grid: document.querySelector('.simgrid').hidden,
  cards: document.querySelectorAll('.gcard:not(:disabled)').length,
  chip: document.getElementById('c-simname').textContent,
  report: !document.getElementById('sec-report').hidden,
  tourOff: window.__LITE.state().tourOn === false,
  dusk: window.__LITE.state().game.dusk,
  gameBtnOn: document.getElementById('b-game').classList.contains('on'),
}));
check('game enter UI', enter.board && enter.grid && enter.cards === 3 && enter.chip === '搜救挑战' && enter.report && enter.tourOff && enter.dusk === 0 && enter.gameBtnOn, JSON.stringify(enter));
await shot('v8-game-pick.png', 1600, 900);

// ---- pick extinguisher: sweep search -> scan -> submitted result ------------
await page.click('[data-target="ext"]');
await page.waitForFunction(() => { const g = window.__LITE.state().game; return g && g.phase === 'hunt' && g.target && g.target.startsWith('ext'); }, null, {timeout: 10000});
const hunting = await page.evaluate(() => ({
  extHunting: document.querySelector('[data-target="ext"]').classList.contains('hunting'),
  extLabel: document.querySelector('[data-target="ext"] u').textContent,
  othersDisabled: document.querySelector('[data-target="hyd"]').disabled && document.querySelector('[data-target="fire"]').disabled,
  state: document.getElementById('g-state').textContent,
}));
check('hunt card states', hunting.extHunting && hunting.extLabel === '搜索中' && hunting.othersDisabled && hunting.state.includes('自主搜索'), JSON.stringify(hunting));
await page.waitForFunction(() => Math.abs(window.__LITE.state().pose.headYaw) > 0.15, null, {timeout: 30000});
check('search head sweep', true);
await page.waitForFunction(() => window.__LITE.state().game.scan !== null, null, {timeout: 60000});
await page.waitForFunction(() => document.getElementById('cap-t').textContent.includes('自主搜索'), null, {timeout: 10000});
await shot('v8-game-scan.png', 1600, 900);
await page.waitForFunction(() => { const g = window.__LITE.state().game; return g.found.length >= 1 && g.phase === 'pick'; }, null, {timeout: 60000});
const found1 = await page.evaluate(() => ({
  phase: window.__LITE.state().game.phase,
  found: window.__LITE.state().game.found,
  cardFound: document.querySelector('[data-target="ext"]').classList.contains('found'),
  cardLabel: document.querySelector('[data-target="ext"] u').textContent,
  cardDisabled: document.querySelector('[data-target="ext"]').disabled,
  nextEnabled: !document.querySelector('[data-target="hyd"]').disabled,
  log: document.getElementById('replog').textContent,
  count: document.getElementById('rep-count').textContent,
}));
check('ext found + submitted', found1.phase === 'pick' && found1.found[0] === 'ext' && found1.cardFound && found1.cardLabel === '已找到'
  && found1.cardDisabled && found1.nextEnabled && found1.log.includes('找到灭火器') && found1.count === '1', JSON.stringify({...found1, log: found1.log.slice(0, 50)}));

// ---- hydrant, then fire source -> ending ------------------------------------
await page.click('[data-target="hyd"]');
await page.waitForFunction(() => { const g = window.__LITE.state().game; return g.found.length >= 2 && g.phase === 'pick'; }, null, {timeout: 120000});
check('hyd found', await page.evaluate(() => window.__LITE.state().game.found.includes('hyd') && document.getElementById('replog').textContent.includes('找到消火栓')));
await page.click('[data-target="fire"]');
await page.waitForFunction(() => window.__LITE.state().game.phase === 'end', null, {timeout: 120000});
await page.waitForFunction(() => { const g = window.__LITE.state().game; return g.dusk > 0.9 && g.particles > 0; }, null, {timeout: 60000});
const endUi = await page.evaluate(() => ({
  overlay: !document.getElementById('game-end').hidden,
  time: document.getElementById('ge-time').textContent,
  items: document.querySelectorAll('#ge-list i').length,
  listText: document.getElementById('ge-list').textContent,
  state: document.getElementById('g-state').textContent,
  found: window.__LITE.state().game.found.length,
}));
check('ending overlay', endUi.overlay && parseFloat(endUi.time) > 5 && endUi.items === 3 && endUi.listText.includes('灭火器')
  && endUi.listText.includes('消火栓') && endUi.listText.includes('火源') && endUi.state.includes('3/3') && endUi.found === 3, JSON.stringify(endUi));
await page.waitForFunction(() => window.__LITE.state().game.endT >= 2.2, null, {timeout: 60000});
await shot('v8-game-end.png', 1600, 900);
await page.waitForFunction(() => window.__LITE.state().game.endT >= 8.1, null, {timeout: 90000});
const finale = await page.evaluate(() => ({particles: window.__LITE.state().game.particles, dusk: window.__LITE.state().game.dusk}));
check('finale fireworks live', finale.particles > 50 && finale.dusk > 0.99, JSON.stringify(finale));
await shot('v8-game-finale.png', 1600, 900);

// ---- pause freezes the ending; resume advances it ---------------------------
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const pA = await page.evaluate(() => ({endT: window.__LITE.state().game.endT, n: window.__LITE.state().game.particles}));
await page.waitForTimeout(1200);
const pB = await page.evaluate(() => ({endT: window.__LITE.state().game.endT, n: window.__LITE.state().game.particles}));
check('pause freezes ending', Math.abs(pB.endT - pA.endT) < 0.02 && pB.n === pA.n, JSON.stringify({pA, pB}));
await page.keyboard.press('Space');
await page.waitForTimeout(1500);
check('resume advances ending', await page.evaluate((t0) => window.__LITE.state().game.endT > t0 + 0.2, pB.endT));

// ---- restart from the ending panel ------------------------------------------
await page.click('#ge-again');
await page.waitForFunction(() => { const g = window.__LITE.state().game; return g && g.phase === 'pick' && g.found.length === 0; }, null, {timeout: 10000});
const restarted = await page.evaluate(() => ({
  dusk: window.__LITE.state().game.dusk,
  particles: window.__LITE.state().game.particles,
  overlay: document.getElementById('game-end').hidden,
  rows: document.querySelectorAll('#replog .rep').length,
  cards: document.querySelectorAll('.gcard:not(:disabled)').length,
  elapsed: window.__LITE.state().game.elapsed,
}));
check('restart resets game', restarted.dusk === 0 && restarted.particles === 0 && restarted.overlay && restarted.rows === 0
  && restarted.cards === 3 && restarted.elapsed < 1.5, JSON.stringify(restarted));

// ---- second round in a different order, then exit mid-game ------------------
await page.click('[data-target="fire"]');
await page.waitForFunction(() => window.__LITE.state().game.found.length >= 1, null, {timeout: 120000});
check('round2 fire first', await page.evaluate(() => window.__LITE.state().game.order[0].k === 'fire'));
await page.click('#game-exit');
await page.waitForFunction(() => window.__LITE.state().game === null, null, {timeout: 10000});
const exited = await page.evaluate(() => ({
  board: document.getElementById('gameboard').hidden,
  grid: !document.querySelector('.simgrid').hidden,
  chip: document.getElementById('c-sim').hidden,
  report: document.getElementById('sec-report').hidden,
  overlay: document.getElementById('game-end').hidden,
  gameBtnOff: !document.getElementById('b-game').classList.contains('on'),
  dusk: window.__LITE.studio ? undefined : undefined,
}));
check('exit restores studio', exited.board && exited.grid && exited.chip && exited.report && exited.overlay && exited.gameBtnOff, JSON.stringify(exited));

// ---- mobile: board in drawer, ending panel fits ------------------------------
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('[data-sim="game"]').click());
await page.waitForFunction(() => window.__LITE.state().game && window.__LITE.state().game.phase === 'pick', null, {timeout: 10000});
const mobPick = await page.evaluate(() => {
  const deck = document.getElementById('deck');
  const board = document.getElementById('gameboard');
  const r = board.getBoundingClientRect();
  return {
    overflowX: document.documentElement.scrollWidth > innerWidth,
    boardInDeck: deck.contains(board),
    cards: document.querySelectorAll('.gcard').length,
    boardW: r.width,
  };
});
check('mobile game board', mobPick.overflowX === false && mobPick.boardInDeck && mobPick.cards === 3 && mobPick.boardW > 100, JSON.stringify(mobPick));
for (const k of ['ext', 'hyd', 'fire']) {
  await page.waitForFunction(() => window.__LITE.state().game && window.__LITE.state().game.phase === 'pick', null, {timeout: 60000});
  await page.evaluate((kind) => document.querySelector(`[data-target="${kind}"]`).click(), k);
  await page.waitForFunction((n) => window.__LITE.state().game && (window.__LITE.state().game.found.length >= n || window.__LITE.state().game.phase === 'end'), k === 'ext' ? 1 : k === 'hyd' ? 2 : 3, {timeout: 180000});
}
await page.waitForFunction(() => window.__LITE.state().game.phase === 'end' && window.__LITE.state().game.endT > 1.6, null, {timeout: 120000});
const mobEnd = await page.evaluate(() => {
  const p = document.querySelector('.gendpanel').getBoundingClientRect();
  return {
    overflowX: document.documentElement.scrollWidth > innerWidth,
    fits: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight,
    w: Math.round(p.width), h: Math.round(p.height),
    againVisible: !!document.getElementById('ge-again').offsetParent,
  };
});
check('mobile ending fits', mobEnd.overflowX === false && mobEnd.fits && mobEnd.againVisible, JSON.stringify(mobEnd));
await page.evaluate(() => document.getElementById('sec-sim') && document.querySelector('.gendpanel').scrollIntoView({block: 'center'}));
await page.waitForTimeout(400);
await page.screenshot({path: path.join(out, 'v8-mobile-game.png')});
await page.evaluate(() => document.getElementById('ge-exit').click());
await page.waitForFunction(() => window.__LITE.state().game === null, null, {timeout: 10000});

// ---- repeated enter/exit cycles stay clean ----------------------------------
await page.setViewportSize({width: 640, height: 360});
await page.waitForTimeout(500);
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => document.querySelector('[data-sim="game"]').click());
  await page.waitForFunction(() => !!window.__LITE.state().game, null, {timeout: 10000});
  await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('game-exit').click());
  await page.waitForFunction(() => window.__LITE.state().game === null, null, {timeout: 10000});
}
check('repeat enter/exit stable', await page.evaluate(() => document.querySelectorAll('#replog .rep').length === 0 && document.querySelector('.simgrid').hidden === false));

// ---- click a prop in the scene to pick its class -----------------------------
await page.evaluate(() => document.getElementById('b-game').click());
await page.waitForFunction(() => window.__LITE.state().game && window.__LITE.state().game.phase === 'pick', null, {timeout: 10000});
await page.waitForTimeout(2200);
const pt = await page.evaluate(() => {
  const pos = {ext1: [-0.85, 0.42, -1.06], ext2: [0.85, 0.42, -1.06], hyd1: [0.05, 0.40, 1.06], fire1: [1.92, 0.30, 0.72]};
  for (const id in pos) {
    const p = window.__LITE.studio.project(pos[id]);
    if (p.visible && p.x > 30 && p.x < 610 && p.y > 30 && p.y < 240) return {id, x: Math.round(p.x), y: Math.round(p.y)};
  }
  return null;
});
check('pick overview shows props', !!pt, JSON.stringify(pt));
if (pt) {
  await page.mouse.click(pt.x, pt.y);
  const want = kindOf(pt.id).id;
  await page.waitForFunction((k) => {
    const g = window.__LITE.state().game;
    const map = {ext1: 'ext', ext2: 'ext', hyd1: 'hyd', fire1: 'fire'};
    return g && g.phase === 'hunt' && g.target && map[g.target] === k;
  }, want, {timeout: 10000});
  check('scene click starts hunt', await page.evaluate(() => window.__LITE.state().game.camFree === false));
  await page.evaluate(() => document.getElementById('game-exit').click());
  await page.waitForFunction(() => window.__LITE.state().game === null, null, {timeout: 10000});
}

await page.close();
await browser.close();
console.log('ERRORS(' + errors.length + ')');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
console.log(fails === 0 && errors.length === 0 ? 'PROBE7 ALL PASS' : `PROBE7 FAILURES=${fails}`);