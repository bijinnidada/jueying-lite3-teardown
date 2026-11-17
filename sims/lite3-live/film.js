// Auto-tour script. Pure function of time; the live page plays it when idle,
// capture mode renders it frame-by-frame. Same beats drive timeline.json.
import {clamp01, easeInOut, lerp} from './kin.js';

export const DURATION = 66;

export const BEATS = [
  {at: 0, cn: '整机', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {}, callouts: [], kicker: 'DEEP ROBOTICS', caption: '绝影 Lite3 · 12 自由度四足平台，整机 12.2 kg'},
  {at: 4.5, cn: '感知头部', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {}, callouts: ['stereo', 'led'], kicker: 'PERCEPTION', caption: '双目深度相机 + 广角镜头，前向立体视觉与实时避障'},
  {at: 9.5, cn: '激光雷达', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {}, callouts: ['lidar', 'handle'], kicker: 'LIDAR', caption: '顶部 360° 激光雷达嵌于提手内，旋转扫描实时建图'},
  {at: 14, cn: '计算平台', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {}, callouts: ['payload'], kicker: 'COMPUTE', caption: '后置计算平台，开放 SDK / API，行走负载 5 kg'},
  {at: 18, cn: '行走', gait: 'walk', speedK: 0.45, heightK: 1, pitch: 0, roll: 0, modes: {trails: true}, callouts: [], cursor: {sel: '[data-g="walk"]'}, kicker: 'WALK', caption: '四足交替支撑，占空比 68%，速度覆盖 0 – 3 m/s'},
  {at: 24, cn: '小跑', gait: 'trot', speedK: 0.62, heightK: 1, pitch: 0, roll: 0, modes: {trails: true}, callouts: [], cursor: {sel: '[data-g="trot"]'}, kicker: 'TROT', caption: '对角腿同步摆动，占空比 46%，机身随相位起伏'},
  {at: 29.5, cn: '腿部拆解', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {cut: true, trails: false}, isolate: 'FL', callouts: ['motor', 'knee', 'foot'], cursor: {sel: '[data-m="cut"]'}, kicker: 'LEG TEARDOWN', caption: '隔离左前腿：髋滚转 / 髋俯仰 / 膝，三个无刷关节电机'},
  {at: 35, cn: '透视内部', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {xray: true, cut: false}, isolate: 'ALL', callouts: ['battery', 'pcb'], cursor: {sel: '[data-m="xray"]'}, kicker: 'X-RAY', caption: '电池舱 25.9 V · 计算板 · 髋部电机定子，全部程序化生成'},
  {at: 39.5, cn: '结构拆解', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {xray: false, trails: false}, callouts: ['exShell', 'exBatt', 'exPcb', 'exHead'], cursor: {sel: '#b-explode'}, kicker: 'EXPLODED VIEW', caption: '径向星爆：各总成沿装配轴错峰飞散，间距 100%'},
  {at: 45, cn: '电池舱打开', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {}, callouts: ['exBatt'], cursor: {sel: '[data-f="battery"]'}, kicker: 'BATTERY OPEN', caption: '单独打开电池舱，其余总成幽灵化'},
  {at: 48, cn: '结构重合', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {}, callouts: ['exLidar', 'exLeg'], cursor: {sel: '#b-explode'}, kicker: 'REASSEMBLE', caption: '沿装配轴回位重合，恢复整机密封结构'},
  {at: 52, cn: '奔跑', gait: 'bound', speedK: 0.85, heightK: 1, pitch: 0, roll: 0, modes: {trails: true}, callouts: [], cursor: {sel: '[data-g="bound"]'}, kicker: 'BOUND', caption: '前后腿分组腾跃，越障 18 cm，爬坡 40°'},
  {at: 57, cn: '趴下', gait: 'prone', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {trails: false}, callouts: [], cursor: {sel: '[data-g="prone"]'}, kicker: 'PRONE', caption: '折叠至 175 mm 趴地高度，随时恢复站立'},
  {at: 61, cn: '恢复', gait: 'stand', speedK: 0.42, heightK: 1, pitch: 0, roll: 0, modes: {}, callouts: [], cursor: {sel: '#b-reset'}, kicker: 'INTERACT', caption: '拖拽旋转 · 滚轮缩放 · 左侧控制台实时调节每一个参数'},
];

export const CAMKEYS = [
  {t: 0, p: [1.26, 0.68, 1.42], tg: [0, 0.30, 0]},
  {t: 4.5, p: [1.02, 0.52, 0.92], tg: [0.28, 0.40, 0]},
  {t: 9.5, p: [0.52, 1.32, 0.82], tg: [0.06, 0.47, 0]},
  {t: 14, p: [-1.12, 0.74, 1.22], tg: [-0.12, 0.42, 0]},
  {t: 18, p: [0.10, 0.36, 1.80], tg: [0, 0.28, 0]},
  {t: 24, p: [0.88, 0.24, 1.32], tg: [0.08, 0.20, 0]},
  {t: 29.5, p: [0.83, 0.41, 0.95], tg: [0.17, 0.26, 0.12]},
  {t: 35, p: [1.16, 0.58, 1.34], tg: [0, 0.32, 0]},
  {t: 39.5, p: [2.15, 1.30, 2.35], tg: [0, 0.44, 0]},
  {t: 44.8, p: [1.95, 1.18, 2.15], tg: [0, 0.46, 0]},
  {t: 45.4, p: [1.10, 0.62, 1.30], tg: [-0.05, 0.30, 0]},
  {t: 48, p: [1.42, 0.80, 1.60], tg: [0, 0.38, 0]},
  {t: 52, p: [-1.34, 0.50, 1.52], tg: [0, 0.30, 0]},
  {t: 57, p: [1.10, 0.38, 1.28], tg: [0, 0.15, 0]},
  {t: 61, p: [1.26, 0.68, 1.42], tg: [0, 0.30, 0]},
  {t: DURATION, p: [1.26, 0.68, 1.42], tg: [0, 0.30, 0]},
];

// callout anchors in body-local metres (body group origin = chassis centre)
export const CALLOUTS = {
  stereo: {cn: '深度相机', en: 'STEREO DEPTH', a: [0.35, 0.05, 0.02]},
  led: {cn: 'LED 灯带', en: 'STATUS STRIP', a: [0.10, -0.062, 0.115]},
  lidar: {cn: '激光雷达', en: '360° LIDAR', a: [0.075, 0.145, 0]},
  handle: {cn: '提手', en: 'CARRY HANDLE', a: [0.02, 0.16, 0.02]},
  payload: {cn: '计算平台', en: 'COMPUTE + I/O', a: [-0.115, 0.105, 0]},
  battery: {cn: '电池舱', en: '25.9 V PACK', a: [-0.05, -0.01, 0.09]},
  pcb: {cn: '控制板', en: '1 kHz CTRL', a: [0.12, 0.045, 0.02]},
  motor: {cn: '关节电机', en: 'BLDC ×12', leg: 0, part: 'rollG'},
  knee: {cn: '膝关节', en: 'KNEE JOINT', leg: 0, part: 'kneeG'},
  foot: {cn: '橡胶足端', en: 'RUBBER FOOT', leg: 0, part: 'footG'},
  exShell: {cn: '外壳总成', en: 'SHELL ASSY', g: 'shellG', a: [0, 0.09, 0.10]},
  exBatt: {cn: '电池舱', en: 'BATTERY MODULE', g: 'battG', a: [-0.05, -0.01, 0.09]},
  exPcb: {cn: '控制板', en: 'CTRL BOARD', g: 'boardG', a: [0.12, 0.05, 0.02]},
  exHead: {cn: '感知头部', en: 'HEAD ASSY', g: 'head', a: [0.09, 0.03, 0]},
  exLidar: {cn: '雷达提手', en: 'LIDAR ARCH', g: 'archG', a: [0, 0.07, 0]},
  exPayload: {cn: '计算平台', en: 'COMPUTE BOX', g: 'payload', a: [0, 0.04, 0]},
  exLeg: {cn: '腿模块', en: 'LEG MODULE ×4', leg: 1, part: 'rootG'},
};

export function beatAt(t) {
  let i = 0;
  while (i + 1 < BEATS.length && BEATS[i + 1].at <= t) i++;
  return i;
}

export function camAt(t) {
  let i = 0;
  while (i + 1 < CAMKEYS.length && t > CAMKEYS[i + 1].t) i++;
  const a = CAMKEYS[i], b = CAMKEYS[i + 1];
  const k = easeInOut(clamp01((t - a.t) / Math.max(0.001, b.t - a.t)));
  const tg = a.tg.map((v, j) => lerp(v, b.tg[j], k));
  const p = a.p.map((v, j) => tg[j] + (lerp(v, b.p[j], k) - tg[j]) * 1.1); // wider stance
  // slow breathing drift so nothing is dead still
  const dr = 0.035 * Math.sin(t * 0.35);
  const dx = p[0] - tg[0], dz = p[2] - tg[2];
  const c = Math.cos(dr), s = Math.sin(dr);
  p[0] = tg[0] + dx * c - dz * s;
  p[2] = tg[2] + dx * s + dz * c;
  p[1] += 0.012 * Math.sin(t * 0.5);
  return {p, tg};
}

/** Explode amount 0..1: starburst apart at 39.5, battery-only 14% at 45, locked back by 50.2. */
export function explodeAt(t) {
  if (t < 39.5) return 0;
  if (t < 41.6) return easeInOut((t - 39.5) / 2.1);
  if (t < 45) return 1;
  if (t < 45.6) return lerp(1, 0.14, easeInOut((t - 45) / 0.6));
  if (t < 48) return 0.14;
  if (t < 50.2) return lerp(0.14, 0, easeInOut((t - 48) / 2.2));
  return 0;
}

/** Which assembly is isolated-open on the tour (battery bay during 45–50.2). */
export function focusAt(t) { return t >= 45 && t < 50.2 ? 'battery' : 'ALL'; }

/** Blend from global stagger to focus-only scatter (0→1 over 45–45.6). */
export function focusMixAt(t) { return t < 45 ? 0 : easeInOut(clamp01((t - 45) / 0.6)); }

/** Ghost fade for non-focus assemblies: in over 45–45.6, out over 48–48.6. */
export function ghostAt(t) {
  if (t < 45) return 0;
  if (t < 45.6) return easeInOut((t - 45) / 0.6);
  if (t < 48) return 1;
  if (t < 48.6) return 1 - easeInOut((t - 48) / 0.6);
  return 0;
}

/** Turntable angle (rad), C1-continuous: spin up 39.5, cruise .30 rad/s, ease back to 0 by 50.2. */
export function turnAt(t) {
  if (t < 39.5) return 0;
  if (t < 40.3) { const u = t - 39.5; return 0.1875 * u * u; }
  if (t < 47) return 0.12 + 0.30 * (t - 40.3);
  if (t < 47.8) { const u = (t - 47) / 0.8; return 2.13 + 0.12 * (1 - (1 - u) * (1 - u)); }
  if (t < 48) return 2.25;
  if (t < 50.2) return 2.25 * (1 - easeInOut((t - 48) / 2.2));
  return 0;
}

/** Everything the tour dictates at time t (pure). */
export function tourAt(t) {
  t = ((t % DURATION) + DURATION) % DURATION;
  const i = beatAt(t);
  const b = BEATS[i];
  const prev = BEATS[i - 1] || BEATS[BEATS.length - 1];
  const blend = easeInOut(clamp01((t - b.at) / 0.7));
  const modes = {cut: false, xray: false, wire: false, trails: false, labels: false, grid: true, isolate: 'ALL', turntable: true, ...(b.modes || {})};
  if (b.isolate) modes.isolate = b.isolate;
  // callout fade in/out within the beat
  const next = BEATS[i + 1];
  const end = next ? next.at : DURATION;
  const callouts = (b.callouts || []).map((id) => ({
    id,
    opacity: clamp01((t - b.at - 0.5) / 0.4) * (1 - clamp01((t - (end - 0.35)) / 0.3)),
  }));
  // cursor: approach the control 0.7 s before the beat, click on the beat
  let cursor = null;
  if (b.cursor) {
    const ct = b.at - 0.7;
    if (t >= ct && t <= b.at + 0.45) {
      cursor = {sel: b.cursor.sel, click: t >= b.at - 0.05 && t <= b.at + 0.2, k: clamp01((t - ct) / 0.6)};
    }
  }
  return {
    t, duration: DURATION, beat: i, cn: b.cn, kicker: b.kicker, caption: b.caption,
    P: {gait: b.gait, speedK: b.speedK, heightK: b.heightK, pitch: b.pitch, roll: b.roll},
    gaitFrom: prev.gait, blend, modes, callouts, cursor,
    explode: explodeAt(t), focus: focusAt(t), focusMix: focusMixAt(t), ghost: ghostAt(t), turntable: turnAt(t),
    cam: camAt(t),
  };
}