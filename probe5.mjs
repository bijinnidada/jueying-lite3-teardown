// Structure-upgrade QA: official IK roundtrip + limits, BOM selection, joint strip, mobile drawer.
import {chromium} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {legIK, legFK, poseAt, poseStatic, GAITS, LEGS, LIMITS, G, JOINTS, BOM, DOCS} from './sims/lite3-live/kin.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'sims', 'dist', 'lite3-live.html').replace(/\\/g, '/');
const out = path.join(here, '..', 'teardown-out');
const errors = [];
const DEG = 180 / Math.PI;
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); };

// ---- pure math: IK∘FK roundtrip + official limits over every gait ------------
{
  let worst = 0, n = 0;
  for (const side of [1, -1]) {
    for (let tx = -0.16; tx <= 0.161; tx += 0.04) {
      for (let ty = -0.42; ty <= -0.14; ty += 0.04) {
        for (let tz = -0.03; tz <= 0.031; tz += 0.03) {
          const j = legIK(tx, ty, tz, side);
          const d = Math.hypot(tx, ty * Math.cos(j[0]) + (side * G.abdL1 + tz) * Math.sin(j[0]));
          if (d > G.thigh + G.calf - 1e-3 || d < Math.abs(G.thigh - G.calf) + 1e-3) continue; // unreachable: clamped by design
          const f = legFK(j[0], j[1], j[2], side);
          const e = Math.max(Math.abs(f[0] - tx), Math.abs(f[1] - ty), Math.abs(f[2] - (side * G.abdL1 + tz)));
          worst = Math.max(worst, e); n++;
        }
      }
    }
  }
  check('IK∘FK roundtrip', worst < 1e-9, `n=${n} worst=${worst.toExponential(2)}`);

  let viol = 0, samples = 0;
  const within = (j) => j[0] * DEG >= LIMITS.roll[0] - 1e-6 && j[0] * DEG <= LIMITS.roll[1] + 1e-6
    && j[1] * DEG >= LIMITS.hip[0] - 1e-6 && j[1] * DEG <= LIMITS.hip[1] + 1e-6
    && j[2] * DEG >= LIMITS.knee[0] - 1e-6 && j[2] * DEG <= LIMITS.knee[1] + 1e-6;
  for (const gait of Object.keys(GAITS)) {
    for (const speedK of [0.2, 0.6, 1]) {
      for (const heightK of [0, 0.5, 1]) {
        for (let p = 0; p < 1; p += 0.05) {
          const pose = poseAt(0, {gait, speedK, heightK, pitch: 0, roll: 0, phase: p});
          for (const l of pose.legs) { samples++; if (!within(l.j)) viol++; }
        }
      }
    }
  }
  for (const gait of ['prone', 'sit']) {
    const pose = poseStatic(gait, {gait, speedK: 0.42, heightK: 1, pitch: 0, roll: 0, phase: 0});
    for (const l of pose.legs) { samples++; if (!within(l.j)) viol++; }
  }
  check('official joint limits, all gaits', viol === 0, `samples=${samples} viol=${viol}`);
  check('official data present', JOINTS.length === 12 && BOM.length === 5 && DOCS.body.length === 8 && DOCS.leg.length === 5
    && JOINTS[0].id === 'FL_HipX' && JOINTS[6].id === 'HL_HipX' && JOINTS[11].id === 'HR_Knee');
}

const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars']});

// ---- live: BOM selection -> focus + detail card + halo -----------------------
{
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('pageerror', (e) => errors.push('live pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('live console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__LITE && window.SIM && window.SIM.ready, null, {timeout: 60000});
  await page.waitForTimeout(600);

  // tree groups: torso + FL open by default, others collapsed
  const tree0 = await page.evaluate(() => ({
    groups: document.querySelectorAll('.tgroup').length,
    open: document.querySelectorAll('.tgroup.open').length,
    rows: document.querySelectorAll('.trow').length,
    chips: document.querySelectorAll('.jchip').length,
    detailDefault: document.getElementById('detail').textContent.includes('12.2'),
  }));
  check('tree markup', tree0.groups === 5 && tree0.open === 2 && tree0.rows === 26 && tree0.chips === 12 && tree0.detailDefault, JSON.stringify(tree0));

  // expand a collapsed leg group, select its knee
  await page.click('.tgroup:nth-child(4) .thead');
  await page.click('[data-p="HL_Knee"]');
  await page.waitForFunction(() => window.__LITE.state().selected === 'HL_Knee', null, {timeout: 10000});
  await page.waitForTimeout(400);
  const sel = await page.evaluate(() => ({
    focus: window.__LITE.state().focus,
    selRow: !!document.querySelector('.trow[data-p="HL_Knee"].sel'),
    selChip: !!document.querySelector('.jchip[data-p="HL_Knee"].sel'),
    detail: document.getElementById('detail').textContent,
    groupOpen: document.querySelector('.trow[data-p="HL_Knee"]').closest('.tgroup').classList.contains('open'),
  }));
  check('BOM click -> focus+detail', sel.focus === 'legs' && sel.selRow && sel.selChip && sel.groupOpen
    && sel.detail.includes('HL_Knee') && sel.detail.includes('36 N·m') && sel.detail.includes('9.72') && sel.detail.includes('34.5 ~ 156') && sel.detail.includes('945'), JSON.stringify(sel).slice(0, 220));
  await page.screenshot({path: path.join(out, 'qa5-select.png')});

  // torso item selection swaps focus subsystem
  await page.click('.trow[data-p="battery"]');
  await page.waitForFunction(() => window.__LITE.state().selected === 'battery', null, {timeout: 10000});
  const sel2 = await page.evaluate(() => ({
    focus: window.__LITE.state().focus,
    detail: document.getElementById('detail').textContent,
  }));
  check('torso select', sel2.focus === 'battery' && sel2.detail.includes('电池组') && sel2.detail.includes('25.9'), JSON.stringify(sel2).slice(0, 160));

  // clear via detail card x
  await page.click('.dclear');
  await page.waitForFunction(() => window.__LITE.state().selected === null && window.__LITE.state().focus === 'ALL', null, {timeout: 10000});
  check('clear selection', true);

  // joint order strip: hot while trotting, none while standing
  await page.evaluate(() => window.__LITE.act.gait('trot'));
  await page.waitForFunction(() => document.querySelectorAll('.jchip.hot').length === 1, null, {timeout: 10000});
  const hotId = await page.evaluate(() => document.querySelector('.jchip.hot').dataset.p);
  await page.evaluate(() => window.__LITE.act.gait('stand'));
  await page.waitForFunction(() => document.querySelectorAll('.jchip.hot').length === 0, null, {timeout: 10000});
  check('joint strip live highlight', JOINTS.some((j) => j.id === hotId), `hot=${hotId}`);

  // dimension tables verbatim
  const dims = await page.evaluate(() => {
    const ds = document.querySelectorAll('.dims');
    ds.forEach((d) => { d.open = true; });
    return {n: ds.length, body: ds[0].querySelectorAll('tr').length, leg: ds[1].querySelectorAll('tr').length,
      txt: ds[0].textContent + ds[1].textContent};
  });
  check('dimension tables', dims.n === 2 && dims.body === 8 && dims.leg === 5 && dims.txt.includes('548 mm') && dims.txt.includes('102 mm') && dims.txt.includes('20 mm'), JSON.stringify({n: dims.n, body: dims.body, leg: dims.leg}));

  // pause-safe: selection halo frozen while paused, no errors on repeat
  await page.click('[data-p="FL_HipX"]');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  for (let i = 0; i < 6; i++) { await page.click(i % 2 ? '.trow[data-p="battery"]' : '[data-p="FL_HipX"]', {delay: 20}); }
  await page.click('.dclear');
  await page.waitForTimeout(300);
  check('repeat selection stable', await page.evaluate(() => window.__LITE.state().selected === null));

  // mobile: tree + detail live in the drawer, selectable there
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(700);
  const mob = await page.evaluate(() => {
    const deck = document.getElementById('deck');
    const tree = document.getElementById('sec-tree');
    const detail = document.getElementById('sec-detail');
    return {
      overflowX: document.documentElement.scrollWidth > innerWidth,
      treeInDeck: deck.contains(tree), detailInDeck: deck.contains(detail),
      treeVisible: getComputedStyle(tree).display !== 'none',
      deckHScroll: deck.scrollWidth > deck.clientWidth,
      stickyOff: getComputedStyle(detail).position === 'static',
    };
  });
  check('mobile drawer structure', mob.overflowX === false && mob.treeInDeck && mob.detailInDeck && mob.treeVisible && mob.deckHScroll && mob.stickyOff, JSON.stringify(mob));
  await page.evaluate(() => { document.getElementById('sec-tree').scrollIntoView({inline: 'center'}); });
  await page.click('.tgroup:nth-child(3) .thead');
  await page.click('.trow[data-p="FR_HipY"]');
  await page.waitForFunction(() => window.__LITE.state().selected === 'FR_HipY', null, {timeout: 10000});
  const mobSel = await page.evaluate(() => document.getElementById('detail').textContent.includes('FR_HipY'));
  check('mobile select -> detail row', mobSel);
  await page.screenshot({path: path.join(out, 'qa5-mobile.png')});
  await page.setViewportSize({width: 1600, height: 900});
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => {
    const tele = document.getElementById('tele');
    return {treeBack: tele.contains(document.getElementById('sec-tree')), detailBack: tele.contains(document.getElementById('sec-detail')),
      stickyOn: getComputedStyle(document.getElementById('sec-detail')).position === 'sticky'};
  });
  check('desktop restore', back.treeBack && back.detailBack && back.stickyOn, JSON.stringify(back));
  await page.screenshot({path: path.join(out, 'qa5-desktop.png')});
  await page.close();
}

await browser.close();
console.log('ERRORS(' + errors.length + ')');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
console.log(fails === 0 && errors.length === 0 ? 'PROBE5 ALL PASS' : `PROBE5 FAILURES=${fails}`);