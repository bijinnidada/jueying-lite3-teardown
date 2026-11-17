// One-click inspection missions: pure mission-time model. buildMission() tabulates
// travel/scan/report segments once; missionPose(m, t) is a pure lookup, so pause,
// restart and replay never drift. Events carry the report copy the log prints.
import {clamp01, lerp, smooth, GAITS} from './kin.js';

const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const faceYaw = (from, to) => Math.atan2(-(to[1] - from[1]), to[0] - from[0]);

// trapezoid travel profile: short ramps, cruise at exactly the walk foot speed
// so stance feet do not slide on the floor (peak 1/(1-r) x cruise)
const TRAP_R = 0.14;
const trapK = (u) => {
  const r = TRAP_R, c = 1 - r;
  if (u < r) return (u * u / (2 * r)) / c;
  if (u > 1 - r) return (1 - r - (1 - u) * (1 - u) / (2 * r)) / c;
  return (r / 2 + (u - r)) / c;
};
const trapV = (u) => {
  const r = TRAP_R, c = 1 - r;
  if (u < r) return (u / r) / c;
  if (u > 1 - r) return ((1 - u) / r) / c;
  return 1 / c;
};
// body speed that matches the animated walk: stride * freq_eff * speedK / duty
export const walkSpeed = (speedK) => {
  const g = GAITS.walk;
  return g.stride * g.freq * (0.55 + 0.65 * speedK) * speedK / g.duty;
};

export const SCENARIOS = {
  fire: {
    id: 'fire', cn: '消防巡检', en: 'FIRE PATROL', tag: 'WAREHOUSE AISLE',
    desc: '仓库通道 · 灭火器 / 消火栓 / 火源',
    speedK: 0.7, scanDur: 2.4, reportDur: 1.5,
    entry: [-1.85, 0],
    stops: [
      {x: -0.85, z: -0.42, target: 'ext1'},
      {x: 0.05, z: 0.42, target: 'hyd1'},
      {x: 0.85, z: -0.42, target: 'ext2'},
      {x: 1.62, z: 0.10, target: 'fire1'},
    ],
    targets: {
      ext1: {cn: '灭火器箱', en: 'EXTINGUISHER', sev: 'ok', pos: [-0.85, 0.42, -1.06], report: '发现灭火器 · 压力正常', detail: 'MFZ/ABC4 · 1.2 MPa · 铅封完好'},
      hyd1: {cn: '消火栓', en: 'HYDRANT', sev: 'ok', pos: [0.05, 0.40, 1.06], report: '发现消火栓 · 阀体正常', detail: 'SS100/65 · 闷盖齐全 · 无渗漏'},
      ext2: {cn: '灭火器箱', en: 'EXTINGUISHER', sev: 'ok', pos: [0.85, 0.42, -1.06], report: '发现灭火器 · 压力正常', detail: 'MFZ/ABC4 · 1.3 MPa · 在检定期内'},
      fire1: {cn: '火源', en: 'FIRE SOURCE', sev: 'danger', pos: [1.92, 0.30, 0.72], report: '发现火源 · 立即上报', detail: '表面温度 326°C · 烟雾浓度超标 · 已联动告警'},
    },
  },
  power: {
    id: 'power', cn: '电力巡检', en: 'POWER PATROL', tag: 'SWITCHGEAR ROOM',
    desc: '配电室 · 表计 / 红外热斑 / 绝缘子',
    speedK: 0.62, scanDur: 2.4, reportDur: 1.5,
    entry: [-1.95, 0.15],
    stops: [
      {x: -1.15, z: -0.40, target: 'cab1'},
      {x: -0.35, z: -0.40, target: 'cab2'},
      {x: 0.55, z: -0.30, target: 'tr1'},
      {x: 1.30, z: 0.28, target: 'ins1'},
    ],
    targets: {
      cab1: {cn: '配电柜表计', en: 'PANEL METER', sev: 'ok', pos: [-1.15, 1.05, -1.02], report: '发现表计 · 读数正常', detail: '10.4 kV · 50.02 Hz · 三相平衡'},
      cab2: {cn: '红外热斑', en: 'IR HOTSPOT', sev: 'warn', pos: [-0.35, 1.32, -1.02], report: '发现红外热斑 · 建议复检', detail: '母排接点 87.4°C · 温升 42 K · 已标记'},
      tr1: {cn: '变压器', en: 'TRANSFORMER', sev: 'ok', pos: [0.72, 0.62, -0.86], report: '发现变压器 · 油温正常', detail: '顶层油温 61°C · 油位正常 · 无渗油'},
      ins1: {cn: '绝缘子', en: 'INSULATOR', sev: 'ok', pos: [1.42, 0.92, -0.72], report: '发现绝缘子 · 外观完好', detail: '伞裙无裂纹 · 无放电痕迹 · 憎水性 HC1'},
    },
  },
};

export function buildMission(kind) {
  const S = SCENARIOS[kind];
  const speed = walkSpeed(S.speedK);
  const segs = [], events = [];
  let t = 0, prev = {x: S.entry[0], z: S.entry[1], yaw: 0};
  const push = (dur, o) => { segs.push({t0: t, t1: t + dur, ...o}); t += dur; };
  push(0.9, {kind: 'enter', a: prev, b: prev});
  S.stops.forEach((s, i) => {
    const T = S.targets[s.target];
    const yaw = faceYaw([s.x, s.z], [T.pos[0], T.pos[2]]);
    const b = {x: s.x, z: s.z, yaw};
    const dist = Math.hypot(b.x - prev.x, b.z - prev.z);
    push(dist / speed, {kind: 'travel', a: prev, b, stop: i});
    push(S.scanDur, {kind: 'scan', a: b, b, target: s.target, stop: i});
    events.push({t, id: s.target, sev: T.sev, report: T.report, detail: T.detail, cn: T.cn, en: T.en});
    push(S.reportDur, {kind: 'report', a: b, b, target: s.target, stop: i});
    prev = b;
  });
  const duration = t;
  push(1e9, {kind: 'done', a: prev, b: prev});
  return {kind, S, speed, segs, events, duration, stops: S.stops.length};
}

export function missionPose(m, t) {
  let seg = m.segs[m.segs.length - 1];
  for (const s of m.segs) if (t >= s.t0 && t < s.t1) { seg = s; break; }
  const u = clamp01((t - seg.t0) / (seg.t1 - seg.t0));
  const out = {
    x: seg.b.x, z: seg.b.z, yaw: seg.b.yaw, gait: 'stand',
    headYaw: 0, headPitch: 0, scan: null, kind: seg.kind,
    stop: seg.stop ?? -1, done: seg.kind === 'done', speed: 0,
  };
  if (seg.kind === 'travel') {
    const k = trapK(u);
    out.x = lerp(seg.a.x, seg.b.x, k); out.z = lerp(seg.a.z, seg.b.z, k);
    out.yaw = seg.a.yaw + wrapPi(seg.b.yaw - seg.a.yaw) * smooth(clamp01(u * 2.4));
    out.gait = 'walk';
    out.speed = m.speed * trapV(u);
    if (seg.sweep) out.headYaw = Math.sin(u * Math.PI * 3.2) * 0.55 * (1 - 0.35 * u);
    if (seg.lock) {
      const T = m.S.targets[seg.target];
      out.headYaw = wrapPi(faceYaw([out.x, out.z], [T.pos[0], T.pos[2]]) - out.yaw) * 0.6 * smooth(u);
    }
  } else if (seg.kind === 'scan' || seg.kind === 'report') {
    const T = m.S.targets[seg.target];
    const wy = faceYaw([out.x, out.z], [T.pos[0], T.pos[2]]);
    out.headYaw = wrapPi(wy - out.yaw) * 0.85;
    const hd = Math.hypot(T.pos[0] - out.x, T.pos[2] - out.z);
    out.headPitch = Math.atan2(T.pos[1] - 0.42, hd) * 0.7;
    out.scan = {id: seg.target, k: seg.kind === 'scan' ? u : 1, sev: T.sev};
  }
  return out;
}

export const PHASE_CN = {enter: '进入场景', travel: '巡检移动', scan: '扫描识别', report: '结果上报', done: '巡检完成'};