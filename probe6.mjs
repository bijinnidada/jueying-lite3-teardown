// Scenario-mission QA: fire + power one-click patrols, reports, pause/restart, camera, mobile.
// Logic runs at 640x360 low tier (SwiftShader ~0.7x realtime); screenshots resize up.
import {chromium} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMission, missionPose} from './sims/lite3-live/mission.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'sims', 'dist', 'lite3-live.html').replace(/\\/g, '/');
const out = path.join(here, '..', 'teardown-out');
const errors = [];
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); };

// ---- pure model: finite duration, ordered events, continuous path -----------
for (const kind of ['fire', 'power']) {
  const m = buildMission(kind);
  const ordered = m.events.every((e, i) => i === 0 || e.t > m.events[i - 1].t);
  let prev = null, maxV = 0, nan = 0;
  for (let t = 0; t <= m.duration + 1; t += 0.02) {
    const p = missionPose(m, t);
    if (!isFinite(p.x + p.z + p.yaw + p.headYaw + p.headPitch)) nan++;
    if (prev) maxV = Math.max(maxV, Math.hypot(p.x - prev.x, p.z - prev.z) / 0.02);
    prev = p;
  }
  check(`model ${kind}`, m.duration > 10 && m.duration < 120 && ordered && nan === 0 && maxV / m.speed < 1.3 && missionPose(m, m.duration + 2).done,
    `dur=${m.duration.toFixed(1)} peak/cruise=${(maxV / m.speed).toFixed(2)}`);
}

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

// ---- fire mission: enter -> scan -> report -> pause -> restart -> done ------
await page.click('[data-sim="fire"]');
await page.waitForFunction(() => window.__LITE.state().mission && window.__LITE.state().mission.kind === 'fire', null, {timeout: 10000});
const enter = await page.evaluate(() => ({
  reportVisible: !document.getElementById('sec-report').hidden,
  rowVisible: !document.getElementById('simrow').hidden,
  chipVisible: !document.getElementById('c-sim').hidden,
  chipName: document.getElementById('c-simname').textContent,
  btnOn: document.querySelector('[data-sim="fire"]').classList.contains('on'),
  tourOff: window.__LITE.state().tourOn === false,
}));
check('fire enter UI', enter.reportVisible && enter.rowVisible && enter.chipVisible && enter.chipName === '消防巡检' && enter.btnOn && enter.tourOff, JSON.stringify(enter));

// first report: extinguisher discovered
await page.waitForFunction(() => window.__LITE.state().mission.fired >= 1, null, {timeout: 60000});
const rep1 = await page.evaluate(() => ({
  log: document.getElementById('replog').textContent,
  count: document.getElementById('rep-count').textContent,
  rows: document.querySelectorAll('#replog .rep').length,
  sevOk: !!document.querySelector('#replog .rep.ok'),
}));
check('first report 灭火器', rep1.log.includes('发现灭火器') && rep1.count === '1' && rep1.rows === 1 && rep1.sevOk, rep1.log.slice(0, 60));

// scan state during a scan window (atomic read inside the poll); caption may lag one console tick
const scanHandle = await page.waitForFunction(() => {
  const m = window.__LITE.state().mission;
  if (!m || m.phase !== 'scan') return null;
  return {scan: m.scan, phase: m.phase};
}, null, {timeout: 60000});
const scanState = await scanHandle.jsonValue();
await page.waitForFunction(() => document.getElementById('cap-t').textContent.includes('扫描识别')
  && document.getElementById('sim-state').textContent.includes('扫描识别'), null, {timeout: 10000});
const scanUi = await page.evaluate(() => ({caption: document.getElementById('cap-t').textContent, simState: document.getElementById('sim-state').textContent}));
check('scan phase live', scanState.scan !== null && scanState.phase === 'scan' && scanUi.caption.includes('扫描识别') && scanUi.simState.includes('扫描识别'), JSON.stringify({...scanState, ...scanUi}));
await shot('v8-fire-scan.png', 1600, 900);

// pause freezes mission time; resume advances it
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const tA = await page.evaluate(() => window.__LITE.state().mission.t);
await page.waitForTimeout(1000);
const tB = await page.evaluate(() => window.__LITE.state().mission.t);
check('pause freezes mission', Math.abs(tB - tA) < 0.02, `tA=${tA.toFixed(2)} tB=${tB.toFixed(2)}`);
await page.keyboard.press('Space');
await page.waitForTimeout(1600);
const tC = await page.evaluate(() => window.__LITE.state().mission.t);
check('resume advances mission', tC > tB + 0.2, `tC=${tC.toFixed(2)}`);

// orbit during mission = free camera, mission keeps running
await page.mouse.move(320, 160);
await page.mouse.down();
await page.mouse.move(400, 140, {steps: 6});
await page.mouse.up();
await page.waitForTimeout(400);
const freeCam = await page.evaluate(() => ({camFree: window.__LITE.state().mission.camFree, alive: !!window.__LITE.state().mission}));
check('orbit -> free camera, mission alive', freeCam.camFree === true && freeCam.alive, JSON.stringify(freeCam));
await page.click('#sim-follow');
await page.waitForFunction(() => window.__LITE.state().mission.camFree === false, null, {timeout: 5000});
check('follow camera restores', true);

// restart: clock + log reset
await page.click('#sim-restart');
await page.waitForFunction(() => window.__LITE.state().mission.t < 1.5 && window.__LITE.state().mission.fired === 0, null, {timeout: 5000});
const restarted = await page.evaluate(() => ({
  rows: document.querySelectorAll('#replog .rep').length,
  count: document.getElementById('rep-count').textContent,
  sumHidden: document.getElementById('rep-sum').hidden,
}));
check('restart resets', restarted.rows === 0 && restarted.count === '0' && restarted.sumHidden, JSON.stringify(restarted));

// run to completion: 4 reports incl. danger fire source + summary
await page.waitForFunction(() => window.__LITE.state().mission.done === true, null, {timeout: 180000});
await page.waitForTimeout(500);
const done = await page.evaluate(() => ({
  fired: window.__LITE.state().mission.fired,
  rows: document.querySelectorAll('#replog .rep').length,
  danger: !!document.querySelector('#replog .rep.danger'),
  log: document.getElementById('replog').textContent,
  sum: document.getElementById('rep-sum').textContent,
  sumVisible: !document.getElementById('rep-sum').hidden,
  caption: document.getElementById('cap-t').textContent,
}));
check('fire complete', done.fired === 4 && done.rows === 4 && done.danger && done.log.includes('发现火源') && done.log.includes('发现消火栓')
  && done.sumVisible && done.sum.includes('巡检完成') && done.sum.includes('告警 1') && done.sum.includes('正常 3') && done.caption.includes('完成'),
  done.sum.replace(/\s+/g, ' ').slice(0, 80));
await shot('v8-fire-done.png', 1600, 900);

// exit returns to studio
await page.click('#sim-exit');
await page.waitForFunction(() => window.__LITE.state().mission === null, null, {timeout: 5000});
const exited = await page.evaluate(() => ({
  reportHidden: document.getElementById('sec-report').hidden,
  chipHidden: document.getElementById('c-sim').hidden,
  rowHidden: document.getElementById('simrow').hidden,
  btnOff: !document.querySelector('[data-sim="fire"]').classList.contains('on'),
}));
check('exit restores studio', exited.reportHidden && exited.chipHidden && exited.rowHidden && exited.btnOff, JSON.stringify(exited));

// ---- power mission: warn hotspot report, takeover exits ---------------------
await page.click('[data-sim="power"]');
await page.waitForFunction(() => window.__LITE.state().mission && window.__LITE.state().mission.kind === 'power', null, {timeout: 10000});
await page.waitForFunction(() => window.__LITE.state().mission.fired >= 2, null, {timeout: 120000});
const pow = await page.evaluate(() => ({
  log: document.getElementById('replog').textContent,
  warn: !!document.querySelector('#replog .rep.warn'),
  chip: document.getElementById('c-simname').textContent,
}));
check('power warn 热斑', pow.log.includes('热斑') && pow.warn && pow.chip === '电力巡检', pow.log.slice(0, 80));
await page.waitForFunction(() => window.__LITE.state().mission.scan !== null, null, {timeout: 60000});
await shot('v8-power-scan.png', 1600, 900);
// manual gait click takes over and exits the mission
await page.click('[data-g="trot"]');
await page.waitForFunction(() => window.__LITE.state().mission === null, null, {timeout: 5000});
check('takeover exits mission', await page.evaluate(() => window.__LITE.state().P.gait === 'trot'));

// ---- mobile: report log lives in the drawer, no overflow --------------------
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(800);
await page.evaluate(() => window.__LITE.act.sim('fire'));
await page.waitForFunction(() => window.__LITE.state().mission && window.__LITE.state().mission.kind === 'fire', null, {timeout: 10000});
await page.waitForFunction(() => window.__LITE.state().mission.fired >= 1, null, {timeout: 90000});
const mob = await page.evaluate(() => {
  const deck = document.getElementById('deck');
  const rep = document.getElementById('sec-report');
  return {
    overflowX: document.documentElement.scrollWidth > innerWidth,
    repInDeck: deck.contains(rep),
    repVisible: getComputedStyle(rep).display !== 'none',
    deckHScroll: deck.scrollWidth > deck.clientWidth,
    logScroll: getComputedStyle(document.getElementById('replog')).overflowY,
    rows: document.querySelectorAll('#replog .rep').length,
  };
});
check('mobile mission drawer', mob.overflowX === false && mob.repInDeck && mob.repVisible && mob.deckHScroll && mob.logScroll === 'auto' && mob.rows >= 1, JSON.stringify(mob));
await page.evaluate(() => document.getElementById('sec-report').scrollIntoView({inline: 'center'}));
await page.waitForTimeout(400);
await page.screenshot({path: path.join(out, 'v8-mobile-mission.png')});
await page.evaluate(() => window.__LITE.act.simExit());
await page.waitForFunction(() => window.__LITE.state().mission === null, null, {timeout: 5000});

// repeated start/exit cycles stay clean
for (let i = 0; i < 3; i++) {
  await page.evaluate((k) => window.__LITE.act.sim(k), i % 2 ? 'power' : 'fire');
  await page.waitForFunction(() => !!window.__LITE.state().mission, null, {timeout: 5000});
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__LITE.act.simExit());
  await page.waitForFunction(() => window.__LITE.state().mission === null, null, {timeout: 5000});
}
check('repeat start/exit stable', await page.evaluate(() => document.querySelectorAll('#replog .rep').length === 0));

await page.setViewportSize({width: 1600, height: 900});
await page.waitForTimeout(500);
await page.close();
await browser.close();
console.log('ERRORS(' + errors.length + ')');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
console.log(fails === 0 && errors.length === 0 ? 'PROBE6 ALL PASS' : `PROBE6 FAILURES=${fails}`);