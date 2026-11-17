// Jueying Lite3 — interactive teardown. One offline page.
// Live: orbit + control deck + telemetry, auto-tour when idle.
// Capture (?capture): pure render(t) of the same tour for frame review.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {runSim} from '../kit/runtime.js';
import {createStudio} from './stage.js';
import {buildDog} from './dog.js';
import {createConsole} from './console.js';
import {poseAt, poseStatic, GAITS, LEGS, G, SPEC, SUBSYSTEMS, BOM, clamp, clamp01, lerp, smooth, easeInOut, DEG} from './kin.js';
import {tourAt, BEATS, DURATION, CALLOUTS, camAt} from './film.js';
import {buildMission, missionPose, SCENARIOS, faceYaw} from './mission.js';
import {buildHunt, huntPose, GAME_KINDS, kindOf, GAME_PHASE_CN} from './game.js';
import {createFireworks} from './fx.js';
import {buildEnv} from './scene.js';
import TL from './timeline.json';

const DEFAULTS = {
  duration: DURATION, fps: 60, theme: 'light', accent: '#e8481c',
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
  leg: {p: [0.78, 0.36, 0.92], tg: [0.18, 0.22, 0.13]},
};

// permanent teardown callouts (capped at 7 on screen while apart)
const EX_IDS = ['exShell', 'exHead', 'exLidar', 'exPayload', 'exBatt', 'exPcb', 'exLeg'];
const FOCUS_EX = {shell: 'exShell', head: 'exHead', lidar: 'exLidar', compute: 'exPayload', battery: 'exBatt', board: 'exPcb', legs: 'exLeg'};

// missions run autonomous: display modes lock to a clean solid view
const MISSION_MODES = {cut: false, xray: false, wire: false, trails: false, labels: false, grid: true, isolate: 'ALL', turntable: false};

const isStatic = (g) => g === 'prone' || g === 'sit';
const poseFor = (g, P, phase) => isStatic(g) ? poseStatic(g, P) : poseAt(0, {...P, gait: g, phase});

const BOM_ITEMS = {};
for (const g of BOM) for (const it of g.items) BOM_ITEMS[it.id] = it;

// narrow viewports shrink the horizontal FOV; pull the camera back so the whole dog stays in frame
function aspectFit(w, h) {
  const a = (w || innerWidth) / (h || innerHeight);
  return a < 1.1 ? clamp(Math.pow(1.1 / Math.max(0.35, a), 0.65), 1, 1.6) : 1;
}
const fitP = (p, tg, w, h) => {
  const af = aspectFit(w, h) * 1.1; // 370 mm leg-plane stance needs ~10% more distance
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
  let scanGain = null;
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
    scanGain = ctx.createGain(); scanGain.gain.value = 0;
    const scanOsc = ctx.createOscillator(); scanOsc.type = 'sine'; scanOsc.frequency.value = 210;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
    const lg = ctx.createGain(); lg.gain.value = 18;
    lfo.connect(lg); lg.connect(scanOsc.frequency);
    scanOsc.connect(scanGain); scanGain.connect(master);
    scanOsc.start(); lfo.start();
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
    scan(active) { if (ctx) scanGain.gain.setTargetAtTime(active && on ? 0.016 : 0, ctx.currentTime, 0.09); },
    chime(sev) {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      const seq = sev === 'danger' ? [[240, 0], [240, 0.14], [240, 0.28]] : sev === 'warn' ? [[660, 0], [587, 0.13]] : [[880, 0], [1174, 0.12]];
      for (const [f, d] of seq) {
        const o = ctx.createOscillator(); o.type = sev === 'danger' ? 'square' : 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); const a = t0 + d;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(sev === 'danger' ? 0.06 : 0.05, a + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, a + (sev === 'danger' ? 0.11 : 0.22));
        o.connect(g); g.connect(master); o.start(a); o.stop(a + 0.3);
      }
    },
    start() {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      const nb = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(400, t0); bp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.35);
      const g = ctx.createGain(); g.gain.value = 0.05;
      ns.connect(bp); bp.connect(g); g.connect(master); ns.start(t0);
    },
    done() {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      [523, 659, 784].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); const a = t0 + i * 0.09;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(0.045, a + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, a + 0.6);
        o.connect(g); g.connect(master); o.start(a); o.stop(a + 0.7);
      });
    },
    pick() {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      [[520, 0], [780, 0.07]].forEach(([f, d]) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); const a = t0 + d;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(0.05, a + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, a + 0.1);
        o.connect(g); g.connect(master); o.start(a); o.stop(a + 0.12);
      });
    },
    ping() {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      [0, 0.24].forEach((d, i) => {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(1250, t0 + d); o.frequency.exponentialRampToValueAtTime(620, t0 + d + 0.16);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(i ? 0.02 : 0.04, t0 + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + d + 0.2);
        o.connect(g); g.connect(master); o.start(t0 + d); o.stop(t0 + d + 0.22);
      });
    },
    launch() {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(700, t0); o.frequency.exponentialRampToValueAtTime(1900, t0 + 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.022, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.65);
    },
    burst() {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.32);
      const nb = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const ng = ctx.createGain(); ng.gain.value = 0.09;
      ns.connect(lp); lp.connect(ng); ng.connect(master); ns.start(t0);
      for (let i = 0; i < 7; i++) {
        const a = t0 + 0.06 + Math.random() * 0.35;
        const cb = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
        const cd = cb.getChannelData(0);
        for (let j = 0; j < cd.length; j++) cd[j] = (Math.random() * 2 - 1) * (1 - j / cd.length);
        const cs = ctx.createBufferSource(); cs.buffer = cb;
        const cg = ctx.createGain(); cg.gain.value = 0.035;
        cs.connect(cg); cg.connect(master); cs.start(a);
      }
    },
    fanfare() {
      if (!ctx || !on) return;
      const t0 = ctx.currentTime;
      [523, 659, 784, 1046, 1318].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); const a = t0 + i * 0.11;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(0.05, a + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, a + 0.7);
        o.connect(g); g.connect(master); o.start(a); o.stop(a + 0.75);
      });
    },
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
  const turnG = new THREE.Group(); // turntable wrapper: contact shadow + rings stay centred in scene
  turnG.add(dog.root);
  scene.add(turnG);

  // ---- state ----------------------------------------------------------------
  const P = {gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0};
  const modes = {cut: false, xray: false, wire: false, trails: false, labels: false, grid: true, isolate: 'ALL', turntable: true};
  let gaitFrom = 'stand', blendK = 1, phase = 0;
  let tourOn = !capture, tourClock = 0, lastInput = performance.now();
  let camName = 'hero', qualityMode = 'auto', tier = 'high';
  let soundOn = true, paused = false;
  let explode = 0, explodeTarget = 0, prevEx = 0;
  let focus = 'ALL', focusMix = 0, turnAngle = 0;
  let selectedPart = null, lastHl = null;
  let mission = null, missionT = 0, missionFired = 0, missionCamFree = false, mDonePlayed = false;
  let mGait = 'stand', mGaitFrom = 'stand', mBlend = 1, missionInfo = null;
  let game = null, gameCamFree = false, gameInfo = null, duskK = 0;
  const envs = {};
  const mCamP = new THREE.Vector3(), mCamT = new THREE.Vector3(), mDP = new THREE.Vector3(), mDT = new THREE.Vector3();
  const headV = new THREE.Vector3();
  let lastDet = 0, lastBlip = 0;
  const exTween = {active: false, t: 0, dur: 1.5, from: 0, to: 0};
  const battery = {pct: 98, volt: 25.9, runtime: 90};
  const sound = createSound();
  const fw = createFireworks(scene, {launch: () => sound.launch(), burst: () => sound.burst()});
  const setDusk = (k) => { duskK = k; st.setDusk(k); };
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
    const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({color: '#e8481c', transparent: true, opacity: 0.8}));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    return line;
  });
  const tmpV = new THREE.Vector3();
  function updateTrails(pose, PP, MM, EX) {
    const g = GAITS[PP.gait] || GAITS.stand;
    dog.body.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      const L = LEGS[i], line = trails[i];
      line.visible = MM.trails && g.stride > 0 && EX < 0.02;
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
  const tourPoseAt = (tt) => {
    const tr = tourAt(tt);
    const ph = phaseAtT(tt);
    return blendPose(poseFor(tr.gaitFrom, tr.P, ph), poseFor(tr.P.gait, tr.P, ph), tr.blend);
  };

  // ---- console -------------------------------------------------------------------
  const cn = createConsole(document.getElementById('app'), {
    gait(g) { takeControl(); setGait(g); sound.blip(); cn.toast(`步态 · ${g === 'prone' ? '趴下' : g === 'sit' ? '坐下' : GAITS[g].cn}`); },
    param(k, v) { takeControl(); P[k] = v; },
    explode(v) { takeControl(); exTween.active = false; explode = explodeTarget = clamp01(v); focus = 'ALL'; focusMix = 0; },
    explodeToggle() { takeControl(); focus = 'ALL'; focusMix = 0; setExplodeTarget(prevEx > 0.5 ? 0 : 1); cn.toast(explodeTarget > 0.5 ? '结构拆解 · 径向星爆散开' : '结构重合 · 回位锁定'); },
    focus(id) { takeControl(); selectedPart = null; cn.setSelected(null); focus = id; focusMix = 0; setExplodeTarget(id === 'ALL' ? 0 : 0.14); const s = SUBSYSTEMS.find((x) => x.id === id); cn.toast(id === 'ALL' ? '全部总成 · 回位重合' : `单独打开 · ${s ? s.cn : id}`); cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn, explode, explodeTarget, id); },
    selectPart(id) {
      takeControl();
      const it = BOM_ITEMS[id];
      if (!it) return;
      selectedPart = id;
      cn.setSelected(id);
      focus = it.sub; focusMix = 0;
      cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn, explode, explodeTarget, focus);
      cn.toast(`选中 · ${it.cn} ${it.en}`);
      sound.blip();
    },
    clearPart() {
      takeControl();
      selectedPart = null;
      cn.setSelected(null);
      focus = 'ALL'; focusMix = 0;
      cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn, explode, explodeTarget, 'ALL');
      cn.toast('清除选择 · 全部总成');
    },
    mode(m, v) { takeControl(); modes[m] = v; sound.blip(); cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); },
    isolate(id) { takeControl(); modes.isolate = id; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); },
    camera(name) { takeControl(); flyTo(name); },
    quality(v) { qualityMode = v; if (v !== 'auto') { tier = v; applyTier(); } cn.toast(`画质 · ${v === 'auto' ? '自动' : v === 'high' ? '高' : v === 'med' ? '中' : '低'}`); },
    reset() { exitMission(); exitGame(); Object.assign(P, {gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0}); Object.assign(modes, {cut: false, xray: false, wire: false, trails: false, labels: false, grid: true, isolate: 'ALL', turntable: true}); gaitFrom = 'stand'; blendK = 1; focus = 'ALL'; focusMix = 0; selectedPart = null; cn.setSelected(null); turnAngle = 0; setExplodeTarget(0); flyTo('hero'); cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn, explode, 0, 'ALL'); cn.toast('已重置'); sound.blip(); },
    random() { takeControl(); const gs = ['walk', 'trot', 'bound']; setGait(gs[Math.floor(Math.random() * 3)]); P.speedK = 0.3 + Math.random() * 0.7; P.heightK = 0.55 + Math.random() * 0.45; P.pitch = (Math.random() * 2 - 1) * 10; P.roll = (Math.random() * 2 - 1) * 8; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast('随机姿态'); sound.blip(); },
    shot() { st.render(); const a = document.createElement('a'); a.download = 'jueying-lite3.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click(); cn.toast('截图已导出'); },
    sound() { soundOn = !soundOn; sound.ensure(); sound.setOn(soundOn); cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast(soundOn ? '声音 开' : '声音 关'); },
    tour() { tourOn = !tourOn; if (tourOn) { exitMission(); exitGame(); tourClock = 0; lastInput = performance.now(); } cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast(tourOn ? '自动导览 开' : '自动导览 关'); },
    sim(kind) { if (kind === 'game') { startGame(); return; } exitGame(); startMission(kind); },
    simExit() { exitMission('退出模拟 · 返回展台'); flyTo('hero'); },
    simRestart() { if (!mission) return; missionT = 0; missionFired = 0; mDonePlayed = false; missionCamFree = false; mGait = mGaitFrom = 'stand'; mBlend = 1; getEnv(mission.kind).reset(); cn.clearReports(); cn.setMission(mission); sound.start(); cn.toast('重新巡检'); },
    simFollow() { missionCamFree = false; cn.toast('跟随相机'); },
    gamePick(kind) { gamePick(kind); },
    gameTop() { if (game) { exitGame('退出挑战 · 返回展台'); flyTo('hero'); } else startGame(); },
    gameExit() { exitGame('退出挑战 · 返回展台'); flyTo('hero'); },
    gameRestart() { if (!game) return; startGame(); cn.toast('重新开始 · 目标已重置'); },
    gameFollow() { gameCamFree = false; cn.toast('跟随相机'); },
  });
  cn.setTicks(TL.beats, DURATION);
  cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);

  function setGait(g) {
    if (g === P.gait) return;
    gaitFrom = P.gait; P.gait = g; blendK = 0;
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);
  }
  function setExplodeTarget(v) {
    explodeTarget = v;
    exTween.active = true; exTween.t = 0; exTween.from = explode; exTween.to = v;
    sound.blip();
  }
  function takeControl() {
    lastInput = performance.now();
    if (mission) exitMission('已接管 · 退出模拟');
    if (game) exitGame('已接管 · 退出挑战');
    if (tourOn) { tourOn = false; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast('已接管控制 · 静止 25s 恢复导览'); }
  }
  function flyTo(name) {
    camName = name;
    if (mission) missionCamFree = true;
    if (game) gameCamFree = true;
    const c = CAMS[name] || CAMS.hero;
    tween.fromP.copy(camera.position); tween.fromT.copy(controls.target);
    tween.toP.set(...fitP(c.p, c.tg, canvas.clientWidth, canvas.clientHeight)); tween.toT.set(...c.tg);
    tween.t0 = performance.now(); tween.active = true;
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);
  }
  function getEnv(kind) {
    if (!envs[kind]) { envs[kind] = buildEnv(kind); envs[kind].group.visible = false; scene.add(envs[kind].group); }
    return envs[kind];
  }
  function startMission(kind) {
    mission = buildMission(kind); missionT = 0; missionFired = 0; missionCamFree = false; mDonePlayed = false;
    mGait = mGaitFrom = 'stand'; mBlend = 1;
    tourOn = false;
    for (const k in envs) envs[k].group.visible = k === kind;
    const env = getEnv(kind); env.group.visible = true; env.reset();
    st.setShadowSpan(2.7);
    focus = 'ALL'; focusMix = 0; selectedPart = null; cn.setSelected(null);
    setExplodeTarget(0);
    mCamP.copy(camera.position); mCamT.copy(controls.target);
    cn.setMission(mission); cn.clearReports();
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn, explode, 0, 'ALL');
    cn.toast(`进入场景 · ${mission.S.cn}`);
    sound.ensure(); sound.start();
  }
  function exitMission(msg) {
    if (!mission) return;
    mission = null; missionInfo = null;
    for (const k in envs) envs[k].group.visible = false;
    st.setShadowSpan(1.1);
    sound.scan(false);
    cn.setMission(null);
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);
    if (msg) cn.toast(msg);
  }
  function startGame() {
    exitMission();
    game = {
      phase: 'pick', found: [], order: [], hunt: null, huntT: 0, huntFired: 0,
      elapsed: 0, endT: 0, pinged: false, last: {x: -1.85, z: 0, yaw: 0},
      seed: ((Math.random() * 1e9) | 0) + 1,
    };
    gameCamFree = false;
    mGait = mGaitFrom = 'stand'; mBlend = 1;
    tourOn = false;
    for (const k in envs) envs[k].group.visible = k === 'fire';
    const env = getEnv('fire'); env.group.visible = true; env.reset();
    fw.stop(); setDusk(0);
    st.setShadowSpan(2.7);
    focus = 'ALL'; focusMix = 0; selectedPart = null; cn.setSelected(null);
    setExplodeTarget(0);
    mCamP.copy(camera.position); mCamT.copy(controls.target);
    cn.setGame(game); cn.clearReports();
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn, explode, 0, 'ALL');
    cn.toast('搜救挑战 · 点卡片或场景中的目标，狗自主搜索');
    sound.ensure(); sound.start();
  }
  function exitGame(msg) {
    if (!game) return;
    game = null; gameInfo = null;
    fw.stop(); setDusk(0);
    for (const k in envs) envs[k].group.visible = false;
    st.setShadowSpan(1.1);
    sound.scan(false);
    cn.setGame(null);
    cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn);
    if (msg) cn.toast(msg);
  }
  function gamePick(kind) {
    if (!game || game.phase !== 'pick' || game.found.includes(kind)) return;
    const K = GAME_KINDS.find((k) => k.id === kind);
    // alternate extinguisher cabinets between runs so replays differ
    const inst = K.instances.length > 1 ? K.instances[game.seed % K.instances.length] : K.instances[0];
    game.hunt = buildHunt(game.last, inst);
    game.huntT = 0; game.huntFired = 0; game.pinged = false;
    game.phase = 'hunt';
    cn.gameCard(kind, 'hunting');
    cn.updateGame(game);
    cn.toast(`自主搜索 · ${K.cn}`);
    sound.pick(); sound.ping();
  }
  controls.addEventListener('start', () => { tween.active = false; if (mission) missionCamFree = true; else if (game) gameCamFree = true; else takeControl(); sound.ensure(); });
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => { sound.ensure(); lastInput = performance.now(); downX = e.clientX; downY = e.clientY; });
  // click a prop in the aisle to pick that target class, same as its card
  const pickRay = new THREE.Raycaster();
  const pickNdc = new THREE.Vector2();
  const pickV = new THREE.Vector3();
  canvas.addEventListener('pointerup', (e) => {
    if (!game || game.phase !== 'pick' || capture) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const r = canvas.getBoundingClientRect();
    pickNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pickRay.setFromCamera(pickNdc, camera);
    let best = null, bestD = Infinity;
    const T = SCENARIOS.fire.targets;
    for (const id in T) {
      if (game.found.includes(kindOf(id).id)) continue;
      const tp = pickV.set(T[id].pos[0], T[id].pos[1], T[id].pos[2]);
      if (pickRay.ray.distanceToPoint(tp) < 0.34) {
        const along = pickRay.ray.origin.distanceTo(tp);
        if (along < bestD) { bestD = along; best = id; }
      }
    }
    if (best) { gameCamFree = false; gamePick(kindOf(best).id); }
  });
  canvas.addEventListener('wheel', () => { if (mission) missionCamFree = true; else if (game) gameCamFree = true; else takeControl(); }, {passive: true});

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
    else if (k === 'e') { cn.el.querySelector('#b-explode').click(); e.stopImmediatePropagation(); e.preventDefault(); }
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
      else if (C.g) anchorV.set(...C.a).applyMatrix4(dog[C.g].matrixWorld);
      else anchorV.set(...C.a).applyMatrix4(dog.body.matrixWorld);
      const p = st.project(anchorV);
      return {id, cn: C.cn, en: C.en, x: p.x, y: p.y, visible: p.visible && p.x > 10 && p.x < w - 10 && p.y > 60 && p.y < h - 120, opacity, side: p.x < w * 0.5 ? -1 : 1};
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
  cn.toast('搜救挑战 · 选目标让狗自主搜索，集齐三类放烟花');

  // ---- the frame ---------------------------------------------------------------------------
  let lastTour = null;
  function frame(t, dt) {
    const sdt = paused && !capture ? 0 : dt;
    let pose, camP, camT, tourInfo = null, curModes = modes, curP = P, curExplode = explode;
    let curFocus = focus, curMix = focusMix, curGhost = focus === 'ALL' ? 0 : focusMix, curTurn = turnAngle;
    missionInfo = null; gameInfo = null;
    if (mission && !capture) {
      missionT += sdt;
      const mp = missionPose(mission, missionT);
      const env = getEnv(mission.kind);
      while (missionFired < mission.events.length && mission.events[missionFired].t <= missionT) {
        const ev = mission.events[missionFired++];
        env.mark(ev.id);
        cn.report(ev, missionT);
        cn.toast(ev.report);
        sound.chime(ev.sev);
      }
      if (mp.done && !mDonePlayed) { mDonePlayed = true; sound.done(); cn.finishMission(mission, missionT); }
      if (mp.gait !== mGait) { mGaitFrom = mGait; mGait = mp.gait; mBlend = 0; }
      mBlend = clamp01(mBlend + sdt / 0.5);
      curP = {...P, gait: mGait, speedK: mission.S.speedK, heightK: 1, pitch: 0, roll: 0};
      const gm = GAITS[mGait];
      phase += (gm ? gm.freq * (0.55 + 0.65 * curP.speedK) : 0) * sdt;
      pose = blendPose(poseFor(mGaitFrom, curP, phase), poseFor(mGait, curP, phase), mBlend);
      pose.body.x = mp.x; pose.body.z = mp.z; pose.body.yaw = mp.yaw;
      pose.headYaw = mp.headYaw; pose.headPitch = mp.headPitch;
      pose.speed = mp.speed;
      curModes = MISSION_MODES;
      if (exTween.active) {
        exTween.t += sdt;
        const ek = easeInOut(clamp01(exTween.t / exTween.dur));
        explode = lerp(exTween.from, exTween.to, ek);
        if (ek >= 1) exTween.active = false;
      }
      curExplode = explode; curFocus = 'ALL'; curMix = 0; curGhost = 0;
      turnAngle += (0 - turnAngle) * Math.min(1, sdt * 3); curTurn = turnAngle;
      if (!missionCamFree) {
        const fit = aspectFit(canvas.clientWidth, canvas.clientHeight) * 1.1;
        let tg, off;
        if (mp.scan) {
          // fixed aisle-side vantage (|z|=1.0): racks at |z|>=1.11 would occlude
          const tp = env.targets[mp.scan.id];
          const sz = Math.sign(tp.z || 1);
          tg = [(mp.x + tp.x) / 2, 0.62, (mp.z + tp.z) / 2];
          if (fit > 1.3) tg[0] -= 0.12; // portrait: keep the dog's feet off the left edge
          off = [mp.x + 1.9 - tg[0], 1.7 - tg[1], -sz * 1.0 - tg[2]];
        } else if (mp.done) {
          const lt = env.targets[mission.events[mission.events.length - 1].id];
          tg = [mp.x + (lt.x - mp.x) * 0.15, 0.30, mp.z + (lt.z - mp.z) * 0.35];
          off = [1.6, 0.8, 0.88];
        }
        else { tg = [mp.x, 0.32, mp.z * 0.25]; off = [1.15, 0.95, 0.75]; }
        mDP.set(tg[0] + off[0] * fit, tg[1] + off[1] * fit, tg[2] + off[2] * fit);
        mDP.z = clamp(mDP.z, -0.95, 0.95); // never look through the storage racks
        mDT.set(...tg);
        const k = Math.min(1, sdt * 2.2);
        mCamP.lerp(mDP, k); mCamT.lerp(mDT, k);
        camP = [mCamP.x, mCamP.y, mCamP.z]; camT = [mCamT.x, mCamT.y, mCamT.z];
      } else {
        if (tween.active) {
          const k = easeInOut(clamp01((performance.now() - tween.t0) / (tween.dur * 1000)));
          camera.position.lerpVectors(tween.fromP, tween.toP, k);
          controls.target.lerpVectors(tween.fromT, tween.toT, k);
          if (k >= 1) tween.active = false;
        }
        controls.update(); camP = null;
      }
      missionInfo = {kind: mission.kind, S: mission.S, t: missionT, duration: mission.duration, mp, fired: missionFired, stops: mission.stops, camFree: missionCamFree};
      sound.scan(!!mp.scan && sdt > 0);
    } else if (game && !capture) {
      if (game.phase !== 'end') game.elapsed += sdt;
      let gp;
      if (game.phase === 'hunt') {
        game.huntT += sdt;
        gp = huntPose(game.hunt, game.huntT);
        const env = getEnv('fire');
        while (game.huntFired < game.hunt.events.length && game.hunt.events[game.huntFired].t <= game.huntT) {
          const ev = game.hunt.events[game.huntFired++];
          env.mark(ev.id);
          cn.report(ev, game.elapsed);
          cn.toast(ev.report);
          sound.chime(ev.sev);
          const k = kindOf(ev.id).id;
          game.found.push(k); game.order.push({k, t: game.elapsed});
          cn.gameCard(k, 'found');
        }
        if (!game.pinged && game.huntT > 0.6) { game.pinged = true; sound.ping(); }
        if (gp.kind === 'huntend') {
          game.last = {x: gp.x, z: gp.z, yaw: gp.yaw};
          game.hunt = null;
          if (game.found.length >= GAME_KINDS.length) {
            game.phase = 'end'; game.endT = 0;
            fw.reset(game.seed);
            cn.gameEnd(game);
            cn.toast('三类目标全部找到 · 烟花庆祝');
            sound.fanfare();
          } else {
            game.phase = 'pick';
            cn.updateGame(game);
            cn.toast(`已提交 ${game.found.length}/3 · 选择下一个目标`);
            sound.done();
          }
        }
      } else if (game.phase === 'end') {
        game.endT += sdt;
        fw.update(game.endT, sdt);
        setDusk(smooth(clamp01(game.endT / 1.6)));
        gp = {x: game.last.x, z: game.last.z, yaw: faceYaw([game.last.x, game.last.z], [0.2, 0]), gait: 'sit', headYaw: Math.sin(game.endT * 0.6) * 0.15, headPitch: 0.22, speed: 0, kind: 'end', scan: null};
      } else {
        gp = {x: game.last.x, z: game.last.z, yaw: game.last.yaw, gait: 'stand', headYaw: Math.sin(game.elapsed * 0.9) * 0.3, headPitch: 0.05, speed: 0, kind: 'pick', scan: null};
      }
      if (gp.gait !== mGait) { mGaitFrom = mGait; mGait = gp.gait; mBlend = 0; }
      mBlend = clamp01(mBlend + sdt / 0.5);
      curP = {...P, gait: mGait, speedK: 0.78, heightK: 1, pitch: 0, roll: 0};
      const gm = GAITS[mGait];
      phase += (gm ? gm.freq * (0.55 + 0.65 * curP.speedK) : 0) * sdt;
      pose = blendPose(poseFor(mGaitFrom, curP, phase), poseFor(mGait, curP, phase), mBlend);
      pose.body.x = gp.x; pose.body.z = gp.z; pose.body.yaw = gp.yaw;
      pose.headYaw = gp.headYaw; pose.headPitch = gp.headPitch;
      pose.speed = gp.speed;
      curModes = MISSION_MODES;
      if (exTween.active) {
        exTween.t += sdt;
        const ek = easeInOut(clamp01(exTween.t / exTween.dur));
        explode = lerp(exTween.from, exTween.to, ek);
        if (ek >= 1) exTween.active = false;
      }
      curExplode = explode; curFocus = 'ALL'; curMix = 0; curGhost = 0;
      turnAngle += (0 - turnAngle) * Math.min(1, sdt * 3); curTurn = turnAngle;
      if (!gameCamFree) {
        const fit = aspectFit(canvas.clientWidth, canvas.clientHeight) * 1.1;
        const env = getEnv('fire');
        let tg, off, direct = false;
        if (gp.scan) {
          const tp = env.targets[gp.scan.id];
          const sz = Math.sign(tp.z || 1);
          tg = [(gp.x + tp.x) / 2, 0.62, (gp.z + tp.z) / 2];
          if (fit > 1.3) tg[0] -= 0.12;
          off = [gp.x + 1.9 - tg[0], 1.7 - tg[1], -sz * 1.0 - tg[2]];
        } else if (game.phase === 'end') {
          // two-shot payoff, a pure function of endT so pause/restart freeze it:
          // low 3/4 close-up of the sitting dog for the first bursts, then a slow
          // crane to the far wall so the whole night sky fills the frame and the
          // dog still sits inside it below the ending card
          const side = game.last.x > 0 ? -1 : 1;
          const mix = smooth(clamp01((game.endT - 2.1) / 2.6));
          const az = clamp(game.last.z - 0.35 * side, -0.9, 0.9);
          const bz = clamp(game.last.z + 0.55 * side, -0.9, 0.9);
          mDP.set(
            lerp(game.last.x + side * 2.55, game.last.x + side * 3.9, mix),
            lerp(1.28, 1.95, mix),
            lerp(az, bz, mix),
          );
          mDP.z = clamp(mDP.z, -0.95, 0.95);
          mDT.set(
            lerp(game.last.x - side * 0.35, game.last.x - side * 0.9, mix),
            lerp(0.64, 0.82, mix),
            lerp(game.last.z + 0.38 * side, game.last.z + 0.22 * side, mix),
          );
          direct = true;
        } else if (game.phase === 'hunt') { tg = [gp.x, 0.32, gp.z * 0.25]; off = [1.15, 0.95, 0.75]; }
        else { tg = [0, 0.55, 0]; off = [2.0, 1.35, 1.5]; } // aisle overview: every pickable prop in frame
        if (!direct) {
          mDP.set(tg[0] + off[0] * fit, tg[1] + off[1] * fit, tg[2] + off[2] * fit);
          mDP.z = clamp(mDP.z, -0.95, 0.95);
          mDT.set(...tg);
        }
        const k = Math.min(1, sdt * 2.2);
        mCamP.lerp(mDP, k); mCamT.lerp(mDT, k);
        camP = [mCamP.x, mCamP.y, mCamP.z]; camT = [mCamT.x, mCamT.y, mCamT.z];
      } else {
        if (tween.active) {
          const k = easeInOut(clamp01((performance.now() - tween.t0) / (tween.dur * 1000)));
          camera.position.lerpVectors(tween.fromP, tween.toP, k);
          controls.target.lerpVectors(tween.fromT, tween.toT, k);
          if (k >= 1) tween.active = false;
        }
        controls.update(); camP = null;
      }
      gameInfo = {phase: game.phase, found: game.found, order: game.order, elapsed: game.elapsed, endT: game.endT, mp: gp, target: game.hunt ? game.hunt.target : null, camFree: gameCamFree, S: SCENARIOS.fire};
      sound.scan(!!gp.scan && sdt > 0);
    } else if (tourOn || capture) {
      const tr = tourAt(capture ? t : tourClock);
      lastTour = tr;
      curP = tr.P; curModes = tr.modes; curExplode = tr.explode;
      curFocus = tr.focus; curMix = tr.focusMix; curGhost = tr.ghost; curTurn = tr.turntable;
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
      if (exTween.active) {
        exTween.t += sdt;
        const ek = easeInOut(clamp01(exTween.t / exTween.dur));
        explode = lerp(exTween.from, exTween.to, ek);
        if (ek >= 1) { exTween.active = false; if (exTween.to < 0.5) sound.thud(0.25); else sound.blip(); }
      }
      curExplode = explode;
      const mixTarget = focus === 'ALL' ? 0 : 1;
      focusMix += (mixTarget - focusMix) * Math.min(1, sdt * 6);
      if (Math.abs(focusMix - mixTarget) < 0.005) focusMix = mixTarget;
      curFocus = focus; curMix = focusMix; curGhost = focus === 'ALL' ? 0 : focusMix;
      if (modes.turntable && curExplode > 0.02) turnAngle += sdt * 0.30 * smooth(curExplode);
      else turnAngle += (0 - turnAngle) * Math.min(1, sdt * 3);
      curTurn = turnAngle;
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
      if (!paused && !mission && !game && performance.now() - lastInput > 25000) { tourOn = true; tourClock = 0; cn.syncControls(P, modes, camName, qualityMode, soundOn, tourOn); cn.toast('恢复自动导览'); }
    }
    if (camP) { camera.position.set(...camP); controls.target.set(...camT); controls.update(); }
    lastPose = pose;

    turnG.rotation.y = curTurn;
    // modes (only rebuild materials when they change; focus is part of the key)
    const mk = JSON.stringify(curModes) + '|' + curFocus;
    if (mk !== lastModesKey) { dog.setModes(curModes, curFocus); st.grid.visible = curModes.grid && tier !== 'low'; lastModesKey = mk; }
    dog.update(pose, capture ? t : missionInfo ? missionInfo.t : gameInfo ? gameInfo.elapsed : tourClock + phase * 0.001, curModes);
    if (missionInfo) {
      dog.head.getWorldPosition(headV);
      getEnv(missionInfo.kind).update(missionInfo.t, missionInfo.mp, headV);
    } else if (gameInfo) {
      dog.head.getWorldPosition(headV);
      getEnv('fire').update(gameInfo.elapsed, gameInfo.mp, headV);
    }
    let exRate = 0;
    if (capture) {
      const e = 1 / 30;
      exRate = (tourAt(Math.min(DURATION, t + e)).explode - tourAt(Math.max(0, t - e)).explode) / (2 * e);
    } else if (dt > 0) exRate = (curExplode - prevEx) / dt;
    dog.setExplode(curExplode, curFocus, curMix, exRate);
    dog.setFocusGhost(curFocus, curGhost);
    const hlId = (tourOn || capture) ? null : selectedPart;
    if (hlId !== lastHl) { dog.setHighlight(hlId); lastHl = hlId; }
    st.setBlueprint(curExplode, curTurn);
    cn.setBlueprint(curExplode, curTurn);
    const states = dog.getStates();
    if (!capture) {
      let det = 0;
      for (const id in states) if (states[id].state === 'DETACHED') det++;
      if (det > lastDet && performance.now() - lastBlip > 60) { sound.blip(); lastBlip = performance.now(); }
      lastDet = det;
    }
    updateTrails(pose, curP, curModes, curExplode);
    // contact shadow follows body
    st.contact.position.x = pose.body.x; st.contact.position.z = pose.body.z;
    const hgt = clamp01((pose.body.y - 0.08) / 0.32);
    st.contact.material.opacity = 0.5 + 0.5 * hgt;
    st.contact.scale.setScalar(0.85 + 0.3 * hgt);
    st.dust.rotation.y = t * 0.02;

    // joint speed for sound + official-order strip highlight
    let js = 0;
    const jVel = new Array(12).fill(0);
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(pose.legs[i].j[k] - prevJ[i][k]);
        js += d;
        jVel[i * 3 + k] = dt > 0 ? d / dt / DEG : 0;
      }
      prevJ[i] = pose.legs[i].j.slice();
      const c = pose.legs[i].contact;
      if (c > 0.5 && prevContact[i] <= 0.5 && sdt > 0) sound.thud(pose.speed);
      prevContact[i] = c;
    }
    if (capture) {
      const e = 1 / 30;
      const pa = tourPoseAt(Math.max(0, t - e)), pb = tourPoseAt(Math.min(DURATION, t + e));
      for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) jVel[i * 3 + k] = Math.abs(pb.legs[i].j[k] - pa.legs[i].j[k]) / (2 * e) / DEG;
    }
    js = dt > 0 ? js / dt : 0;
    js += dt > 0 ? Math.abs(curExplode - prevEx) / dt * 1.6 : 0;
    prevEx = curExplode;
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
      cn.update({pose, P: curP, modes: curModes, t: capture ? t : tourClock, fps: fpsEma, tier, battery, tour: tourInfo, explode: curExplode, explodeTarget: tourInfo ? curExplode : explodeTarget, parts: states, focus: curFocus, turnDeg: curTurn * 180 / Math.PI, jVel, mission: missionInfo, game: gameInfo});
      const w = canvas.clientWidth, h = canvas.clientHeight;
      let items = [];
      if (missionInfo && missionInfo.mp.scan) {
        const T = missionInfo.S.targets[missionInfo.mp.scan.id];
        const p = st.project(getEnv(missionInfo.kind).targets[missionInfo.mp.scan.id]);
        if (p.visible) items = [{id: 'mscan', cn: T.cn, en: T.en, x: p.x, y: p.y, visible: true, opacity: 1, side: p.x < w * 0.5 ? -1 : 1}];
      } else if (gameInfo && gameInfo.mp.scan) {
        const T = gameInfo.S.targets[gameInfo.mp.scan.id];
        const p = st.project(getEnv('fire').targets[gameInfo.mp.scan.id]);
        if (p.visible) items = [{id: 'mscan', cn: T.cn, en: T.en, x: p.x, y: p.y, visible: true, opacity: 1, side: p.x < w * 0.5 ? -1 : 1}];
      } else if (tourInfo && tourInfo.callouts.length) items = calloutItems(tourInfo.callouts, w, h);
      else if (curModes.labels) items = calloutItems(Object.keys(CALLOUTS).map((id) => ({id, opacity: 1})), w, h);
      if (curExplode > 0.05 && items.length < 7) {
        const focused = curFocus !== 'ALL';
        const op = focused ? 1 : clamp01((curExplode - 0.05) / 0.2);
        const pool = focused ? [FOCUS_EX[curFocus]].filter(Boolean) : EX_IDS;
        const have = new Set(items.map((it) => it.id));
        const extra = pool.filter((id) => !have.has(id)).slice(0, 7 - items.length).map((id) => ({id, opacity: op}));
        if (extra.length) items = items.concat(calloutItems(extra, w, h));
      }
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
    act: {gait: (g) => cn.el.querySelector(`[data-g="${g}"]`)?.click(), mode: (m) => cn.el.querySelector(`[data-m="${m}"]`)?.click(), focus: (id) => cn.el.querySelector(`[data-f="${id}"]`)?.click(), selectPart: (id) => cn.el.querySelector(`[data-p="${id}"]`)?.click(), clearPart: () => cn.el.querySelector('.dclear')?.click(), camera: flyTo, tour: () => cn.refs.tour.click(), explodeToggle: () => cn.el.querySelector('#b-explode').click(), explodeSet: (v) => { const s = cn.el.querySelector('#s-explode'); s.value = String(Math.round(v * 100)); s.dispatchEvent(new Event('input')); }, sim: (k) => cn.el.querySelector(`[data-sim="${k}"]`)?.click(), simExit: () => cn.el.querySelector('#sim-exit')?.click(), simRestart: () => cn.el.querySelector('#sim-restart')?.click(), simFollow: () => cn.el.querySelector('#sim-follow')?.click()},
    state: () => {
      const mp = mission ? missionPose(mission, missionT) : null;
      return {P: {...P}, modes: {...modes}, tourOn, pose: lastPose, tier, battery: {...battery}, explode, explodeTarget, focus, selected: selectedPart, turnAngle, parts: dog.getStates(), mission: mission ? {kind: mission.kind, t: missionT, phase: mp.kind, fired: missionFired, stops: mission.stops, done: mp.done, camFree: missionCamFree, scan: mp.scan ? mp.scan.id : null} : null, game: game ? {phase: game.phase, found: [...game.found], order: game.order.map((o) => ({...o})), elapsed: game.elapsed, endT: game.endT, huntT: game.huntT, target: game.hunt ? game.hunt.target : null, camFree: gameCamFree, scan: gameInfo && gameInfo.mp.scan ? gameInfo.mp.scan.id : null, particles: fw.count(), dusk: duskK} : null};
    },
    dog, studio: st, turnG,
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