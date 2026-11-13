// Jueying Lite3 — interactive teardown. One offline page.
// Live: orbit + control deck + telemetry, auto-tour when idle.
// Capture (?capture): pure render(t) of the same tour for frame review.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {runSim} from '../kit/runtime.js';
import {createStudio} from './stage.js';
import {buildDog} from './dog.js';
import {createConsole} from './console.js';
import {poseAt, poseStatic, GAITS, LEGS, G, SPEC, clamp, clamp01, lerp, smooth, easeInOut, DEG} from './kin.js';
import {tourAt, BEATS, DURATION, CALLOUTS, camAt} from './film.js';
import TL from './timeline.json';

const DEFAULTS = {
  duration: DURATION, fps: 60, theme: 'light', accent: '#12a594',
  hud: {enabled: false, title: '绝影 LITE3', subtitle: ''},
  director: {enabled: false},
  watermark: 'DEEP ROBOTICS · LITE3',
  stages: [{at: 0, name: 'LIVE', cmd: '', logs: []}],
};

const CAMS = {
  hero: {p: [1.26, 0.68, 1.42], tg: [0, 0.30, 0]},
  side: {p: [0.05, 0.42, 2.10], tg: [0, 0.28, 0]},
  front: {p: [2.20, 0.52, 0.02], tg: [0.1, 0.32, 0]},
  top: {p: [0.02, 2.55, 0.02], tg: [0, 0.2, 0]},
  leg: {p: [0.66, 0.30, 0.80], tg: [0.20, 0.20, 0.12]},
};

const isStatic = (g) => g === 'prone' || g === 'sit';
const poseFor = (g, P, phase) => isStatic(g) ? poseStatic(g, P) : poseAt(0, {...P, gait: g, phase});

// narrow viewports shrink the horizontal FOV; pull the camera back so the whole dog stays in frame
function aspectFit(w, h) {
  const a = (w || innerWidth) / (h || innerHeight);
  return a < 1.1 ? clamp(Math.pow(1.1 / Math.max(0.35, a), 0.65), 1, 1.6) : 1;
}
const fitP = (p, tg, w, h) => {
  const af = aspectFit(w, h);
  return p.map((v, i) => tg[i] + (v - tg[i]) * af);
};

function blendPose(a, b, k) {
  if (k >= 1) return b;
  if (k <= 0) return a;
  const body = {};
  for (const key of ['x', 'y', 'z', 'roll', 'pitch', 'yaw']) body[key] = lerp(a.body[key], b.body[key], k);
  const legs = a.legs.map((la, i) => {
    const lb = b.legs[i];
    return {
      j: la.j.map((v, j) => lerp(v, lb.j[j], k)),
      foot: la.foot.map((v, j) => lerp(v, lb.foot[j], k)),
      contact: k > 0.5 ? lb.contact : la.contact,
      phase: lb.phase, anchor: lb.anchor,
    };
  });
  return {body, legs, speed: lerp(a.speed, b.speed, k), freq: lerp(a.freq, b.freq, k), phase: b.phase, support: legs.filter((l) => l.contact > 0.5).length};
}

// ---- sound: servo hum tied to joint speed, thud on foot contact --------------
function createSound() {
  let ctx = null, master = null, servo = null, servoGain = null, servoFilter = null, on = true;
  const ensure = () => {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = on ? 0.9 : 0; master.connect(ctx.destination);
    servoGain = ctx.createGain(); servoGain.gain.value = 0;
    servoFilter = ctx.createBiquadFilter(); servoFilter.type = 'lowpass'; servoFilter.frequency.value = 420;
    servo = ctx.createOscillator(); servo.type = 'sawtooth'; servo.frequency.value = 70;
    const servo2 = ctx.createOscillator(); servo2.type = 'square'; servo2.frequency.value = 141;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    servo.connect(servoFilter); servo2.connect(g2); g2.connect(servoFilter);
    servoFilter.connect(servoGain); servoGain.connect(master);
    servo.start(); servo2.start();
  };
  const thud = (vel) => {
    if (!ctx || !on) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(48, t0 + 0.1);
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.22, 0.08 + vel * 0.05), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.16);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const ns = ctx.createBufferSource(); ns.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.06;
    ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start(t0);
  };
  const blip = () => {
    if (!ctx || !on) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 720;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.06);
  };
  return {
    ensure, thud, blip,
    setOn(v) { on = v; if (master) master.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.05); },
    isOn: () => on,
    update(jointSpeed, speed, active) {
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const target = active ? Math.min(0.05, jointSpeed * 0.012 + speed * 0.012) : 0;
      servoGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      servo.frequency.setTargetAtTime(60 + jointSpeed * 22 + speed * 18, ctx.currentTime, 0.1);
      servoFilter.frequency.setTargetAtTime(300 + jointSpeed * 90, ctx.currentTime, 0.1);
    },
  };
}

runSim(DEFAULTS, async ({cfg, canvas, hud, capture}) => {
  const st = createStudio(canvas, hud, capture);
  const {scene, camera, renderer, composer} = st;
  const dog = buildDog();
  scene.add(dog.root);

  // ---- state ----------------------------------------------------------------
  const P = {gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0};
  const modes = {cut: false, xray: false, wire: false, trails: false, labels: false, grid: true, isolate: 'ALL'};
  let gaitFrom = 'stand', blendK = 1, phase = 0;
  let tourOn = !capture, tourClock = 0, lastInput = performance.now();
  let camName = 'hero', qualityMode = 'auto', tier = 'high';
  let soundOn = true, paused = false;
  const battery = {pct: 98, volt: 25.9, runtime: 90};
  const sound = createSound();
  let lastPose = poseAt(0, {...P, phase: 0});
  let prevJ = lastPose.legs.map((l) => l.j.slice());
  let prevContact = [1, 1, 1, 1];
  let fpsEma = 60, frameCount = 0, probeSum = 0, probed = false;
  let lastModesKey = '', lastT = 0, consoleTick = 0;
  const tween = {active: false, t0: 0, dur: 0.85, fromP: new THREE.Vector3(), fromT: new THREE.Vector3(), toP: new THREE.Vector3(), toT: new THREE.Vector3()};

  // ---- controls ---------------------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.85; controls.panSpeed = 0.6;
  controls.minDistance = 0.4; controls.maxDistance = 5.5;
  controls.maxPolarAngle = 1.52;
  controls.target.set(...CAMS.hero.tg);
  camera.position.set(...fitP(CAMS.hero.p, CAMS.hero.tg, canvas.clientWidth, canvas.clientHeight));
  controls.update();

  // ---- foot trajectory trails ---------------------------------------------------
  const TRAIL_N = 72;
  const trails = LEGS.map((L) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({color: '#12a594', transparent: true, opacity: 0.75}));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    return line;
  });
  const tmpV = new THREE.Vector3();
  function updateTrails(pose, PP, MM) {
    const g = GAITS[PP.gait] || GAITS.stand;
    dog.body.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      const L = LEGS[i], line = trails[i];
      line.visible = MM.trails && g.stride > 0;
      if (!line.visible) continue;
      const arr = line.geometry.attributes.position.array;
      const hip = tmpV.set(L.x, G.hipY, L.z).applyMatrix4(dog.body.matrixWorld);
      const side = L.left ? 1 : -1;
      for (let k = 0; k < TRAIL_N; k++) {
        const u = k / TRAIL_N;
        const p = ((u + g.offsets[i]) % 1 + 1) % 1;
        // sample the trajectory shape directly (phase-independent loop)
        const duty = g.duty, stride = g.stride * PP.speedK, lift = g.lift * (0.6 + 0.4 * PP.speedK);
        let x, y;
        if (p < duty) { x = stride * (0.5 - p / duty); y = 0; }
        else { const uu = (p - duty) / (1 - duty); x = -stride * (0.5 - uu); y = lift * Math.sin(Math.PI * uu) ** 1.4; }
        arr[k * 3] = hip.x + (L.front ? 0.012 : -0.012) + x;
        arr[k * 3 + 1] = y + G.footR;
        arr[k * 3 + 2] = hip.z + side * 0.014;
      }
      line.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ---- phase table for pure capture ---------------------------------------------
  const PH_N = Math.ceil(DURATION * 120);
  const phaseTable = new Float32Array(PH_N + 1);
  {
    let acc = 0;
    for (let i = 0; i <= PH_N; i++) {
      const t = (i / PH_N) * DURATION;
      const tr = tourAt(t);
      const gTo = GAITS[tr.P.gait], gFrom = GAITS[tr.gaitFrom];
      const fTo = gTo ? gTo.freq * (0.55 + 0.65 * tr.P.speedK) : 0;
      const fFrom = gFrom ? gFrom.freq * (0.55 + 0.65 * tr.P.speedK) : 0;
      acc += lerp(fFrom, fTo, tr.blend) / 120;
      phaseTable[i] = acc;
    }
  }
  const phaseAtT = (t) => {
    const f = clamp01(t / DURATION) * PH_N;
    const i = Math.min(PH_N - 1, Math.floor(f));
    return lerp(phaseTable[i], phaseTable[i + 1], f - i);
  };

  // ---- console -------------------------------------------------------------------
  const cn = createConsole(document.getElementById('app'), {
    gait(g) { takeControl(); setGait(g); sound.blip(); cn.toast(`步态 · ${g === 'prone' ? '趴下' : g === 'sit' ? '坐下' : GAITS[g].cn}`); },
    param(k, v) { takeControl(); P[k] = v; },
    mode(m, v) { takeControl(); modes[m] = v; sound.blip(); cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); },
    isolate(id) { takeControl(); modes.isolate = id; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); },
    camera(name) { takeControl(); flyTo(name); },
    quality(v) { qualityMode = v; if (v !== 'auto') { tier = v; applyTier(); } cn.toast(`画质 · ${v === 'auto' ? '自动' : v === 'high' ? '高' : v === 'med' ? '中' : '低'}`); },
    reset() { Object.assign(P, {gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0}); Object.assign(modes, {cut: false, xray: false, wire: false, trails: false, labels: false, grid: true, isolate: 'ALL'}); gaitFrom = 'stand'; blendK = 1; flyTo('hero'); cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast('已重置'); sound.blip(); },
    random() { takeControl(); const gs = ['walk', 'trot', 'bound']; setGait(gs[Math.floor(Math.random() * 3)]); P.speedK = 0.3 + Math.random() * 0.7; P.heightK = 0.55 + Math.random() * 0.45; P.pitch = (Math.random() * 2 - 1) * 10; P.roll = (Math.random() * 2 - 1) * 8; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast('随机姿态'); sound.blip(); },
    shot() { st.render(); const a = document.createElement('a'); a.download = 'jueying-lite3.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click(); cn.toast('截图已导出'); },
    sound() { soundOn = !soundOn; sound.ensure(); sound.setOn(soundOn); cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast(soundOn ? '声音 开' : '声音 关'); },
    tour() { tourOn = !tourOn; if (tourOn) { tourClock = 0; lastInput = performance.now(); } cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast(tourOn ? '自动导览 开' : '自动导览 关'); },
  });
  cn.setTicks(TL.beats, DURATION);
  cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);

  function setGait(g) {
    if (g === P.gait) return;
    gaitFrom = P.gait; P.gait = g; blendK = 0;
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);
  }
  function takeControl() {
    lastInput = performance.now();
    if (tourOn) { tourOn = false; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast('已接管控制 · 静止 25s 恢复导览'); }
  }
  function flyTo(name) {
    camName = name;
    const c = CAMS[name] || CAMS.hero;
    tween.fromP.copy(camera.position); tween.fromT.copy(controls.target);
    tween.toP.set(...fitP(c.p, c.tg, canvas.clientWidth, canvas.clientHeight)); tween.toT.set(...c.tg);
    tween.t0 = performance.now(); tween.active = true;
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);
  }
  controls.addEventListener('start', () => { tween.active = false; takeControl(); sound.ensure(); });
  canvas.addEventListener('pointerdown', () => { sound.ensure(); lastInput = performance.now(); });
  canvas.addEventListener('wheel', () => { takeControl(); }, {passive: true});

  // ---- quality tiers ---------------------------------------------------------------
  function applyTier() {
    const cap = tier === 'high' ? Math.min(devicePixelRatio || 1, 2) : tier === 'med' ? Math.min(devicePixelRatio || 1, 1.5) : 1;
    renderer.setPixelRatio(cap);
    composer.setPixelRatio(cap);
    composer.setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
    st.setQuality(tier);
  }

  // ---- keyboard ---------------------------------------------------------------------
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    const gaitKeys = {'1': 'stand', '2': 'walk', '3': 'trot', '4': 'bound', '5': 'prone', '6': 'sit'};
    if (gaitKeys[k]) { cn.el.querySelector(`[data-g="${gaitKeys[k]}"]`)?.click(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    const modeKeys = {c: 'cut', x: 'xray', v: 'wire', g: 'trails', l: 'labels'};
    if (modeKeys[k]) { cn.el.querySelector(`[data-m="${modeKeys[k]}"]`)?.click(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (k === 't') { cn.refs.tour.click(); e.stopImmediatePropagation(); e.preventDefault(); }
    else if (k === 'm') { cn.refs.sound.click(); e.stopImmediatePropagation(); e.preventDefault(); }
    else if (k === ' ') {
      paused = !paused;
      cn.el.querySelector('#c-pause').hidden = !paused;
      cn.toast(paused ? '已暂停 · 空格恢复' : '继续');
      e.stopImmediatePropagation(); e.preventDefault();
    }
    else if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      e.stopImmediatePropagation(); e.preventDefault();
    }
    else if (k === '0') { takeControl(); flyTo('hero'); e.stopImmediatePropagation(); e.preventDefault(); }
    else if (k === 'h') { cn.el.style.display = cn.el.style.display === 'none' ? '' : 'none'; e.stopImmediatePropagation(); e.preventDefault(); }
    sound.ensure();
  });

  // ---- callout projection -------------------------------------------------------------
  const anchorV = new THREE.Vector3();
  function calloutItems(list, w, h) {
    dog.root.updateMatrixWorld(true);
    return list.map(({id, opacity}) => {
      const C = CALLOUTS[id];
      if (!C) return null;
      if (C.leg !== undefined) dog.legs[C.leg][C.part].getWorldPosition(anchorV);
      else anchorV.set(...C.a).applyMatrix4(dog.body.matrixWorld);
      const p = st.project(anchorV);
      return {cn: C.cn, en: C.en, x: p.x, y: p.y, visible: p.visible && p.x > 10 && p.x < w - 10 && p.y > 60 && p.y < h - 120, opacity, side: p.x < w * 0.5 ? -1 : 1};
    }).filter(Boolean);
  }

  // ---- resize ---------------------------------------------------------------------------
  let lastAf = aspectFit(canvas.clientWidth, canvas.clientHeight);
  function resize() {
    st.resize();
    applyTier();
    const af = aspectFit(canvas.clientWidth, canvas.clientHeight);
    if (af !== lastAf) {
      camera.position.sub(controls.target).multiplyScalar(af / lastAf).add(controls.target);
      if (tween.active) tween.toP.set(...fitP(CAMS[camName].p, CAMS[camName].tg, canvas.clientWidth, canvas.clientHeight));
      lastAf = af;
      controls.update();
    }
    const fs = clamp(10 * Math.min(innerWidth / 1600, innerHeight / 900), 5.2, 13);
    document.documentElement.style.fontSize = `${fs}px`;
  }
  resize();

  // ---- the frame ---------------------------------------------------------------------------
  let lastTour = null;
  function frame(t, dt) {
    const sdt = paused && !capture ? 0 : dt;
    let pose, camP, camT, tourInfo = null, curModes = modes, curP = P;
    if (tourOn || capture) {
      const tr = tourAt(capture ? t : tourClock);
      lastTour = tr;
      curP = tr.P; curModes = tr.modes;
      const ph = capture ? phaseAtT(t) : phase;
      const pTo = poseFor(tr.P.gait, tr.P, ph);
      const pFrom = poseFor(tr.gaitFrom, tr.P, ph);
      pose = blendPose(pFrom, pTo, tr.blend);
      camP = fitP(tr.cam.p, tr.cam.tg, canvas.clientWidth, canvas.clientHeight); camT = tr.cam.tg;
      tourInfo = tr;
      if (!capture) {
        // integrate phase with blended frequency
        const gTo = GAITS[tr.P.gait], gFrom = GAITS[tr.gaitFrom];
        const fTo = gTo ? gTo.freq * (0.55 + 0.65 * tr.P.speedK) : 0;
        const fFrom = gFrom ? gFrom.freq * (0.55 + 0.65 * tr.P.speedK) : 0;
        phase += lerp(fFrom, fTo, tr.blend) * sdt;
        tourClock += sdt;
      }
    } else {
      blendK = clamp01(blendK + sdt / 0.6);
      const pTo = poseFor(P.gait, P, phase);
      const pFrom = poseFor(gaitFrom, P, phase);
      pose = blendPose(pFrom, pTo, blendK);
      const g = GAITS[P.gait];
      phase += (g ? g.freq * (0.55 + 0.65 * P.speedK) : 0) * sdt;
      if (tween.active) {
        const k = easeInOut(clamp01((performance.now() - tween.t0) / (tween.dur * 1000)));
        camera.position.lerpVectors(tween.fromP, tween.toP, k);
        controls.target.lerpVectors(tween.fromT, tween.toT, k);
        if (k >= 1) tween.active = false;
      }
      controls.update();
      camP = null;
      // idle → resume tour
      if (!paused && performance.now() - lastInput > 25000) { tourOn = true; tourClock = 0; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast('恢复自动导览'); }
    }
    if (camP) { camera.position.set(...camP); controls.target.set(...camT); controls.update(); }
    lastPose = pose;

    // modes (only rebuild materials when they change)
    const mk = JSON.stringify(curModes);
    if (mk !== lastModesKey) { dog.setModes(curModes); st.grid.visible = curModes.grid && tier !== 'low'; lastModesKey = mk; }
    dog.update(pose, capture ? t : tourClock + phase * 0.001, curModes);
    updateTrails(pose, curP, curModes);
    // contact shadow follows body
    st.contact.position.x = pose.body.x; st.contact.position.z = pose.body.z;
    const hgt = clamp01((pose.body.y - 0.08) / 0.32);
    st.contact.material.opacity = 0.5 + 0.5 * hgt;
    st.contact.scale.setScalar(0.85 + 0.3 * hgt);
    st.dust.rotation.y = t * 0.02;

    // joint speed for sound
    let js = 0;
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 3; k++) js += Math.abs(pose.legs[i].j[k] - prevJ[i][k]);
      prevJ[i] = pose.legs[i].j.slice();
      const c = pose.legs[i].contact;
      if (c > 0.5 && prevContact[i] <= 0.5 && sdt > 0) sound.thud(pose.speed);
      prevContact[i] = c;
    }
    js = dt > 0 ? js / dt : 0;
    sound.update(js, pose.speed, sdt > 0 && (tourOn || !capture));

    // battery
    if (sdt > 0) {
      battery.pct = Math.max(4, battery.pct - sdt * (0.003 + pose.speed * 0.004));
      battery.volt = 24.0 + 1.9 * (battery.pct / 100);
      battery.runtime = (battery.pct / 100) * SPEC.runtimeMin / (0.45 + pose.speed / SPEC.vmax);
    }

    st.render();

    // console (throttled by tier)
    consoleTick++;
    const every = tier === 'high' ? 1 : tier === 'med' ? 2 : 3;
    if (capture || consoleTick % every === 0) {
      cn.update({pose, P: curP, modes: curModes, t: capture ? t : tourClock, fps: fpsEma, tier, battery, tour: tourInfo});
      const w = canvas.clientWidth, h = canvas.clientHeight;
      let items = [];
      if (tourInfo && tourInfo.callouts.length) items = calloutItems(tourInfo.callouts, w, h);
      else if (curModes.labels) items = calloutItems(Object.keys(CALLOUTS).map((id) => ({id, opacity: 1})), w, h);
      cn.drawLeaders(items, w, h, Math.min(devicePixelRatio || 1, 2));
      // tour cursor
      if (tourInfo && tourInfo.cursor) {
        const target = cn.el.querySelector(tourInfo.cursor.sel);
        if (target) {
          const r = target.getBoundingClientRect();
          const ease = easeInOut(tourInfo.cursor.k);
          const sx = w * 0.5, sy = h * 0.62;
          cn.setCursor(lerp(sx, r.left + r.width / 2, ease), lerp(sy, r.top + r.height / 2, ease), tourInfo.cursor.click, true);
        } else cn.setCursor(0, 0, false, false);
      } else cn.setCursor(0, 0, false, false);
    }
  }

  window.__LITE = {
    act: {gait: (g) => cn.el.querySelector(`[data-g="${g}"]`)?.click(), mode: (m) => cn.el.querySelector(`[data-m="${m}"]`)?.click(), camera: flyTo, tour: () => cn.refs.tour.click()},
    state: () => ({P: {...P}, modes: {...modes}, tourOn, pose: lastPose, tier, battery: {...battery}}),
    dog, studio: st,
  };

  return {
    resize,
    render(t) {
      let dt = t - lastT;
      if (dt < 0) dt += DURATION;
      dt = clamp(dt, 0, 0.1);
      lastT = t;
      if (dt > 0) { fpsEma = fpsEma * 0.92 + (1 / dt) * 0.08; frameCount++; probeSum += 1 / dt; }
      if (!capture && qualityMode === 'auto' && frameCount >= (probed ? 240 : 80)) {
        const avg = probeSum / frameCount;
        const nt = avg < 26 ? 'low' : avg < 48 ? 'med' : avg >= 55 ? 'high' : tier;
        if (nt !== tier) { tier = nt; applyTier(); }
        probed = true; frameCount = 0; probeSum = 0;
      }
      frame(capture ? t : t, capture ? 0 : dt);
      return {};
    },
  };
});