// Jueying Lite3 kinematics — real dimensions (mm), one source of truth.
// Frame: X forward, Y up, Z to the robot's left. Units: metres internally.
// Sources: DEEP Robotics developer docs (mechanics / joint) + Lite3 URDF
// (github.com/DeepRoboticsLab/deep_robotics_model) + product spec
// (standing 610x370x445 mm, prone 680x370x175 mm, 12.2 kg with battery,
// 12 joints, 40 deg slope, 18 cm stairs, ~3 m/s, 5 kg walk payload).

export const MM = 0.001;
export const SPEC = {
  name: 'JUEYING LITE3',
  maker: 'DEEP ROBOTICS',
  stand: [610, 370, 445],
  prone: [680, 370, 175],
  mass: 12.2,
  payloadWalk: 5,
  payloadMax: 7.5,
  joints: 12,
  slopeDeg: 40,
  stairCm: 18,
  vmax: 3.0,
  runtimeMin: 90,
  rangeKm: 5,
  battery: [25.9, 20.8], // V, Ah (procurement record)
  ctrlHz: 1000,
};

// ---- geometry constants (mm -> m), aligned to official mechanics docs + URDF
export const G = {
  bodyLen: 0.548, bodyWid: 0.220, bodyHt: 0.118, // Lbody / shell / Hup74+Hdown44
  hipX: 0.1745,         // Lhip/2: hip pitch axis fore/aft from body centre
  hipRollZ: 0.062,      // Whip/2: HipX (abduction) axis lateral offset
  abdL1: 0.102,         // L1: HipX axis -> leg plane abduction link
  legPlaneZ: 0.164,     // Wleg/2: leg plane lateral offset
  hipY: -0.010,         // hip axis height rel. body centre
  thigh: 0.200,         // L2: hip pitch -> knee pitch
  calf: 0.210,          // L3: knee pitch -> foot centre
  footR: 0.020,         // foot buffer radius
  standH: 0.445,        // ground -> body top
  bodyTopY: 0.445,
};
G.bodyCY = G.standH - G.bodyHt / 2; // body centre height at nominal stand

export const LEGS = [
  {id: 'FL', code: 'FL', cn: '左前', x: +G.hipX, z: +G.legPlaneZ, front: true, left: true},
  {id: 'FR', code: 'FR', cn: '右前', x: +G.hipX, z: -G.legPlaneZ, front: true, left: false},
  {id: 'RL', code: 'HL', cn: '左后', x: -G.hipX, z: +G.legPlaneZ, front: false, left: true},
  {id: 'RR', code: 'HR', cn: '右后', x: -G.hipX, z: -G.legPlaneZ, front: false, left: false},
];

// joint limits (deg) per official joint table: [HipX roll, HipY pitch, Knee]
export const LIMITS = {
  roll: [-24, 24],
  hip: [-200, 20],
  knee: [34.5, 156],
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
export const easeInOut = (x) => { const k = clamp01(x); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
export const DEG = Math.PI / 180;

// ---- teardown: subsystems + radial starburst part table ----------------------
// One explode input K (0..1) drives every part through its own stagger window;
// decreasing K reverses the stagger automatically (reassemble).
export const SUBSYSTEMS = [
  {id: 'shell', cn: '外壳总成', short: '外壳', en: 'SHELL ASSY', spec: '500×220×150 mm'},
  {id: 'head', cn: '感知头部', short: '头部', en: 'HEAD ASSY', spec: '双目深度 + 广角'},
  {id: 'lidar', cn: '雷达提手', short: '雷达', en: 'LIDAR ARCH', spec: '360° 扫描建图'},
  {id: 'compute', cn: '计算平台', short: '计算', en: 'COMPUTE BOX', spec: 'SDK · 负载 5 kg'},
  {id: 'battery', cn: '电池舱', short: '电池', en: 'BATTERY', spec: `${SPEC.battery[0]} V · ${SPEC.battery[1]} Ah`},
  {id: 'board', cn: '控制板', short: '控制', en: 'CTRL BOARD', spec: `${SPEC.ctrlHz} Hz 控制`},
  {id: 'legs', cn: '腿模块 ×4', short: '腿部', en: 'LEG MODULES', spec: `${SPEC.joints} × BLDC`},
];

// ---- official developer-doc mechanics tables (verbatim, single source) -------
export const DOCS = {
  body: [
    ['重量 mbody', '11 kg', '身体重量（包括电池、侧摆）'],
    ['长度 Lbody', '548 mm', '身体总长度'],
    ['宽度 Wbody', '370 mm', '身体总宽度'],
    ['顶部高度 Hup', '74 mm', '身体顶部距身体坐标系'],
    ['底部高度 Hdown', '44 mm', '身体底部距身体坐标系'],
    ['髋左右间距 Whip', '124 mm', '左右髋关节中心距离'],
    ['髋前后间距 Lhip', '349 mm', '前后髋关节中心距离'],
    ['腿平面间距 Wleg', '328 mm', '腿平面左右距离'],
  ],
  leg: [
    ['单腿重量', '1.12 kg', '腿部重量'],
    ['L1', '102 mm', '髋侧摆关节与腿平面距离'],
    ['大腿长度 L2', '200 mm', '髋前摆中心与膝关节中心距离'],
    ['小腿长度 L3', '210 mm', '膝关节中心与足底圆心距离'],
    ['足底半径', '20 mm', '足底缓冲件半径'],
  ],
  sources: [
    ['机械结构', 'https://developer.deeprobotics.cn/docs/lite3/guide/hardware/mechanics/'],
    ['关节', 'https://developer.deeprobotics.cn/docs/lite3/guide/hardware/joint/'],
    ['URDF', 'https://github.com/DeepRoboticsLab/deep_robotics_model/tree/main/Lite3/urdf'],
  ],
};

// joint performance table (docs): range deg, rated/peak N·m, max rad/s, kg, kg·mm²
const JSPEC = {
  HipX: {cn: '髋侧摆', en: 'HIP X', range: [-24, 24], rated: 6.48, peak: 24, vel: 26.16, mass: 0.435, inertia: [220, 220, 254], desc: '外展/内收：绕机身 X 轴滚转腿平面'},
  HipY: {cn: '髋前摆', en: 'HIP Y', range: [-200, 20], rated: 6.48, peak: 24, vel: 26.1, mass: 0.501, inertia: [267, 316, 369], desc: '屈伸：腿平面内驱动大腿前后摆动'},
  Knee: {cn: '膝关节', en: 'KNEE', range: [34.5, 156], rated: 9.72, peak: 36, vel: 17.1, mass: 0.96, inertia: [945, 4440, 4692], desc: '膝屈伸（含大腿质量），趾行后弯'},
};
// official 12-joint order: FL, FR, HL, HR (F前 H后 L左 R右)
export const JOINTS = LEGS.flatMap((L) => {
  const f = (L.front ? 'F' : 'H') + (L.left ? 'L' : 'R');
  return ['HipX', 'HipY', 'Knee'].map((j) => ({id: `${f}_${j}`, leg: L.id, j, ...JSPEC[j]}));
});

// ---- hierarchical BOM: torso assemblies + per-leg joint chain ----------------
export const BOM = [
  {id: 'torso', cn: '机身', en: 'TORSO', items: [
    {id: 'shell', sub: 'shell', cn: '外壳总成', en: 'SHELL ASSY', mass: null, spec: '548×370 mm', desc: '工程塑料外壳 + 金属关节，密封结构'},
    {id: 'head', sub: 'head', cn: '感知头部', en: 'HEAD ASSY', mass: null, spec: '双目深度 + 广角', desc: '前视双目深度与广角相机，停障/识别跟随'},
    {id: 'lidar', sub: 'lidar', cn: '雷达提手', en: 'LIDAR ARCH', mass: null, spec: '360° 扫描', desc: '顶置激光雷达与提手，建图导航'},
    {id: 'compute', sub: 'compute', cn: '计算平台', en: 'COMPUTE BOX', mass: null, spec: 'SDK · 负载 5 kg', desc: '后部扩展计算主机，开放 SDK/API'},
    {id: 'battery', sub: 'battery', cn: '电池组', en: 'BATTERY', mass: null, spec: `${SPEC.battery[0]} V · ${SPEC.battery[1]} Ah`, desc: '快换电池组，续航约 90 min'},
    {id: 'board', sub: 'board', cn: '控制板', en: 'CTRL BOARD', mass: null, spec: `${SPEC.ctrlHz} Hz`, desc: '实时全身控制，12 关节伺服环'},
  ]},
  ...LEGS.map((L) => {
    const f = (L.front ? 'F' : 'H') + (L.left ? 'L' : 'R');
    return {id: `leg-${L.id}`, cn: `${L.cn}腿`, en: `LEG ${f}`, leg: L.id, items: [
      ...JOINTS.filter((j) => j.leg === L.id).map((j) => ({
        id: j.id, sub: 'legs', joint: j.id, cn: j.cn, en: j.en, mass: j.mass,
        spec: `${j.range[0]}~${j.range[1]}° · ${j.peak} N·m`, desc: j.desc,
      })),
      {id: `${L.id}-Shank`, sub: 'legs', cn: '小腿', en: 'SHANK', mass: 0.16, spec: 'L3 210 mm', desc: '轻量化连杆，膝至足底'},
      {id: `${L.id}-Foot`, sub: 'legs', cn: '足底', en: 'FOOT', mass: 0.02, spec: 'R20 缓冲', desc: '球形橡胶缓冲足，点接触'},
    ]};
  }),
];

const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// dir: body-local scatter direction (chain links use parent-local -Y); dist in m;
// w0..w1: stagger window on K. Fasteners (screws/bolts) are appended by dog.js.
export const PARTS = [
  {id: 'shell', sub: 'shell', dir: [0, 1, 0], dist: 0.30, w0: 0, w1: 0.45},
  {id: 'belly', sub: 'shell', dir: [0, -1, 0], dist: 0.22, w0: 0.05, w1: 0.50},
  {id: 'head', sub: 'head', dir: [1, 0.15, 0], dist: 0.42, w0: 0.10, w1: 0.55},
  {id: 'lidar', sub: 'lidar', dir: [0, 1, 0], dist: 0.52, w0: 0.15, w1: 0.60},
  {id: 'compute', sub: 'compute', dir: [-0.55, 0.8, 0], dist: 0.40, w0: 0.12, w1: 0.58},
  {id: 'battery', sub: 'battery', dir: [-0.8, -0.35, 0], dist: 0.38, w0: 0.25, w1: 0.70},
  {id: 'board', sub: 'board', dir: [0.6, 0.5, 0], dist: 0.34, w0: 0.28, w1: 0.72},
  {id: 'harness', sub: 'board', dir: [0, -0.6, 0.8], dist: 0.30, w0: 0.30, w1: 0.75},
  // small hardware: bearing races + gear rings at each hip, dowel pins at pack/board
  ...LEGS.flatMap((L) => {
    const sx = L.front ? 1 : -1, sz = L.left ? 1 : -1;
    return [
      {id: `brg-${L.id}`, sub: 'legs', dir: [0.95 * sx, 0.3, 0.9 * sz], dist: 0.36, w0: 0.48, w1: 0.94},
      {id: `gear-${L.id}`, sub: 'legs', dir: [1.05 * sx, -0.35, 0.7 * sz], dist: 0.32, w0: 0.52, w1: 0.97},
    ];
  }),
  {id: 'pin-0', sub: 'battery', dir: [-0.6, -0.7, 0.5], dist: 0.40, w0: 0.50, w1: 0.95},
  {id: 'pin-1', sub: 'battery', dir: [-0.9, -0.2, -0.6], dist: 0.42, w0: 0.54, w1: 0.98},
  {id: 'pin-2', sub: 'battery', dir: [-0.3, -0.9, 0.2], dist: 0.38, w0: 0.58, w1: 1},
  {id: 'pin-3', sub: 'board', dir: [0.7, 0.6, 0.5], dist: 0.40, w0: 0.52, w1: 0.96},
  {id: 'pin-4', sub: 'board', dir: [0.9, 0.3, -0.4], dist: 0.43, w0: 0.56, w1: 0.99},
  {id: 'pin-5', sub: 'board', dir: [0.4, 0.8, -0.6], dist: 0.37, w0: 0.60, w1: 1},
  ...LEGS.flatMap((L, i) => {
    const sx = L.front ? 1 : -1, sz = L.left ? 1 : -1;
    return [
      {id: `stator-${L.id}`, sub: 'legs', dir: [sx, -0.2, sz], dist: 0.30, w0: 0.35, w1: 0.80},
      {id: `leg-${L.id}`, sub: 'legs', dir: [0.55 * sx, -0.15, sz], dist: 0.34, w0: 0.20 + 0.06 * i, w1: 0.65 + 0.06 * i},
      {id: `thigh-${L.id}`, sub: 'legs', dir: [0, -1, 0], dist: 0.07, w0: 0.45, w1: 0.85, local: true},
      {id: `knee-${L.id}`, sub: 'legs', dir: [0, -1, 0], dist: 0.10, w0: 0.55, w1: 0.92, local: true},
      {id: `foot-${L.id}`, sub: 'legs', dir: [0, -1, 0], dist: 0.13, w0: 0.65, w1: 1, local: true},
    ];
  }),
].map((p) => ({...p, dir: nrm(p.dir)}));

/** Per-part staggered explode fraction (pure). */
export const partK = (K, w0, w1) => easeInOut(clamp01((K - w0) / Math.max(0.001, w1 - w0)));

/**
 * 3-DOF leg IK with the abduction link (HipX -> leg plane, L1).
 * target: foot position relative to the HipX pivot, body frame (m);
 * tz is the lateral offset BEYOND the leg plane. side: +1 left, -1 right.
 * Returns [roll, hip, knee] (rad), knee bent backwards (digitigrade).
 */
export function legIK(tx, ty, tz, side = 1) {
  const L1 = G.thigh, L2 = G.calf;
  // rolled-frame lateral of the foot must equal the rigid abduction link
  const zT = side * G.abdL1 + tz;
  const A = -ty, B = zT, R = Math.hypot(A, B) || 1e-6;
  const roll = Math.asin(clamp((side * G.abdL1) / R, -1, 1)) - Math.atan2(B, A);
  const yr = ty * Math.cos(roll) + zT * Math.sin(roll); // in-plane down axis
  const dx = tx;
  let d = Math.hypot(dx, yr);
  d = clamp(d, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
  const a = Math.atan2(dx, -yr);       // angle of target from straight-down
  const cosHip = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const hip = a - Math.acos(cosHip);   // knee-back: thigh slopes aft, knee apex rear
  const cosKnee = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const knee = Math.PI - Math.acos(cosKnee);
  return [roll, hip, knee];
}

/** Forward kinematics: joint angles -> foot position rel. HipX pivot (body frame). */
export function legFK(roll, hip, knee, side = 1) {
  const L1 = G.thigh, L2 = G.calf;
  const px = L1 * Math.sin(hip) + L2 * Math.sin(hip + knee);
  const py = -(L1 * Math.cos(hip) + L2 * Math.cos(hip + knee));
  const zP = side * G.abdL1;
  return [px, py * Math.cos(roll) - zP * Math.sin(roll), py * Math.sin(roll) + zP * Math.cos(roll)];
}

// ---- gaits -----------------------------------------------------------------
// duty: fraction of the cycle a foot is on the ground; offsets per leg [FL,FR,RL,RR]
export const GAITS = {
  stand: {cn: '站立', duty: 1, offsets: [0, 0, 0, 0], stride: 0, lift: 0, freq: 0},
  walk:  {cn: '行走', duty: 0.68, offsets: [0, 0.5, 0.75, 0.25], stride: 0.22, lift: 0.055, freq: 1.6},
  trot:  {cn: '小跑', duty: 0.46, offsets: [0, 0.5, 0.5, 0], stride: 0.34, lift: 0.075, freq: 2.6},
  bound: {cn: '奔跑', duty: 0.34, offsets: [0, 0, 0.5, 0.5], stride: 0.42, lift: 0.105, freq: 3.2},
};

/**
 * Foot trajectory for one leg at phase p (0..1), gait g, speed scale s.
 * Returns {x, y, contact} relative to the nominal foot anchor under the hip.
 * Stance: foot moves backward linearly (body moves forward over it).
 * Swing: cycloidal forward return with a smooth lift.
 */
export function footTraj(p, g, speedK = 1) {
  const stride = g.stride * speedK;
  const lift = g.lift * (0.6 + 0.4 * speedK);
  const duty = g.duty;
  if (p < duty || duty >= 1) {
    const u = duty >= 1 ? 0 : p / duty;
    return {x: stride * (0.5 - u), y: 0, contact: duty >= 1 ? 1 : 1};
  }
  const u = (p - duty) / (1 - duty);
  const x = stride * (u - 0.5) + stride * 0.0 * u; // -stride/2 -> +stride/2
  const y = lift * Math.sin(Math.PI * u) ** 1.4;
  return {x: -stride * (0.5 - u), y, contact: 0};
}

/**
 * Full-body pose at time t for a gait blend. Pure function.
 * params: {gait, speedK (0..1 of vmax), heightK (0..1), roll, pitch, yawRate, phase}
 * Returns {body:{x,y,z,roll,pitch,yaw}, legs:[{j:[r,h,k], foot:[x,y,z], contact, phase}], speed, freq}
 */
export function poseAt(t, P) {
  const g = GAITS[P.gait] || GAITS.stand;
  const freq = g.freq * (0.55 + 0.65 * P.speedK);
  const phase = P.phase + t * freq;
  const height = lerp(0.245, 0.445, P.heightK); // body-top height above ground
  const bodyY = height - G.bodyHt / 2;
  const legs = [];
  let cx = 0, cz = 0;
  for (let i = 0; i < 4; i++) {
    const L = LEGS[i];
    const p = ((phase + g.offsets[i]) % 1 + 1) % 1;
    const tr = footTraj(p, g, P.speedK);
    // nominal foot anchor: under the hip, slightly outward
    const ax = L.x + (L.front ? 0.012 : -0.012);
    const az = L.z + (L.left ? 0.014 : -0.014);
    const fx = ax + tr.x;
    const fz = az;
    const fy = tr.y + G.footR;
    // foot target relative to hip pivot, body frame (body at bodyY)
    const tx = fx - L.x;
    const ty = fy - (bodyY + G.hipY);
    const tz = fz - L.z; // lateral beyond the leg plane
    const j = legIK(tx, ty, tz, L.left ? 1 : -1);
    j[0] = clamp(j[0], LIMITS.roll[0] * DEG, LIMITS.roll[1] * DEG);
    j[1] = clamp(j[1], LIMITS.hip[0] * DEG, LIMITS.hip[1] * DEG);
    j[2] = clamp(j[2], LIMITS.knee[0] * DEG, LIMITS.knee[1] * DEG);
    legs.push({j, foot: [fx, fy, fz], contact: tr.contact, phase: p, anchor: [ax, az]});
    cx += fx; cz += fz;
  }
  // body bob & pitch from gait (small, physical)
  const moving = g.stride > 0 ? 1 : 0;
  const bob = moving * 0.008 * P.speedK * Math.sin(phase * Math.PI * 2 * (P.gait === 'bound' ? 1 : 2));
  const pitchG = moving * (P.gait === 'bound' ? 0.10 : 0.022) * P.speedK * Math.sin(phase * Math.PI * 2 + (P.gait === 'bound' ? 0 : Math.PI / 2));
  const rollG = moving * (P.gait === 'trot' ? 0.030 : 0.012) * P.speedK * Math.sin(phase * Math.PI * 2);
  const speed = g.stride > 0 ? g.stride * freq * P.speedK / Math.max(0.2, g.duty) : 0;
  return {
    body: {x: 0, y: bodyY + bob, z: 0, roll: P.roll * DEG + rollG, pitch: P.pitch * DEG + pitchG, yaw: 0},
    legs, speed: Math.min(speed, SPEC.vmax), freq, phase,
    support: legs.filter((l) => l.contact).length,
  };
}

/** Static poses for sit / prone, feet solved onto the ground plane. */
export function poseStatic(gait, P) {
  const feet = [];
  let body;
  if (gait === 'prone') {
    body = {x: 0, y: 0.097, z: 0, roll: 0, pitch: 0, yaw: 0};
    for (const L of LEGS) feet.push([L.x - 0.05, G.footR, L.z + (L.left ? 0.02 : -0.02)]);
  } else { // sit
    body = {x: -0.03, y: 0.27, z: 0, roll: 0, pitch: 0.40, yaw: 0};
    for (const L of LEGS) feet.push(L.front ? [0.235, G.footR, L.z] : [-0.20, G.footR, L.z + (L.left ? 0.012 : -0.012)]);
  }
  const cp = Math.cos(body.pitch), sp = Math.sin(body.pitch);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const L = LEGS[i], f = feet[i];
    const dx = f[0] - body.x, dy = f[1] - body.y, dz = f[2] - body.z;
    // inverse pitch (about Z) into body frame, then relative to hip pivot
    const bx = dx * cp + dy * sp;
    const by = -dx * sp + dy * cp;
    const tx = bx - L.x, ty = by - G.hipY, tz = dz - L.z;
    const j = legIK(tx, ty, tz, L.left ? 1 : -1);
    j[0] = clamp(j[0], LIMITS.roll[0] * DEG, LIMITS.roll[1] * DEG);
    j[1] = clamp(j[1], LIMITS.hip[0] * DEG, LIMITS.hip[1] * DEG);
    j[2] = clamp(j[2], LIMITS.knee[0] * DEG, LIMITS.knee[1] * DEG);
    legs.push({j, foot: f, contact: 1, phase: 0, anchor: [L.x, L.z]});
  }
  return {body, legs, speed: 0, freq: 0, phase: 0, support: 4};
}