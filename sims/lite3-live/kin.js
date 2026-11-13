// Jueying Lite3 kinematics — real dimensions (mm), one source of truth.
// Frame: X forward, Y up, Z to the robot's left. Units: metres internally.
// Sources: DEEP Robotics spec (standing 610x370x445 mm, prone 680x370x175 mm,
// 12.2 kg, 12 joints, 40 deg slope, 18 cm stairs, ~3 m/s, 5 kg walk payload).

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

// ---- geometry constants (mm -> m)
export const G = {
  bodyLen: 0.500, bodyWid: 0.220, bodyHt: 0.150,
  hipX: 0.185,          // hip pitch axis fore/aft from body centre
  hipZ: 0.105,          // hip roll axis lateral offset
  hipY: -0.010,         // hip axis height rel. body centre
  thigh: 0.200,         // hip pitch -> knee pitch
  calf: 0.210,          // knee pitch -> foot centre
  footR: 0.032,
  standH: 0.445,        // ground -> body top
  bodyTopY: 0.445,
};
G.bodyCY = G.standH - G.bodyHt / 2; // body centre height at nominal stand

export const LEGS = [
  {id: 'FL', cn: '左前', x: +G.hipX, z: +G.hipZ, front: true, left: true},
  {id: 'FR', cn: '右前', x: +G.hipX, z: -G.hipZ, front: true, left: false},
  {id: 'RL', cn: '左后', x: -G.hipX, z: +G.hipZ, front: false, left: true},
  {id: 'RR', cn: '右后', x: -G.hipX, z: -G.hipZ, front: false, left: false},
];

// joint limits (deg): [roll, hip pitch, knee]
export const LIMITS = {
  roll: [-28, 28],
  hip: [-130, 70],
  knee: [25, 152],
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
export const easeInOut = (x) => { const k = clamp01(x); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
export const DEG = Math.PI / 180;

/**
 * 3-DOF leg IK in the sagittal plane + roll.
 * target: foot position relative to the hip-roll pivot, in body frame (m).
 * Returns joint angles [roll, hip, knee] (rad) with the knee bent backwards
 * (digitigrade, like the reference photo).
 */
export function legIK(tx, ty, tz) {
  const L1 = G.thigh, L2 = G.calf;
  // roll about X brings the leg plane toward the target's lateral offset
  const roll = Math.atan2(-tz, -ty);
  const dPlane = Math.hypot(ty, tz);       // distance in the rolled plane
  const dx = tx;
  let d = Math.hypot(dx, dPlane);
  d = clamp(d, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
  const a = Math.atan2(dx, dPlane);        // angle of target from straight-down
  const cosHip = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const hip = a - Math.acos(cosHip);       // knee-back: thigh slopes aft, knee apex rear
  const cosKnee = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const knee = Math.PI - Math.acos(cosKnee);
  return [roll, hip, knee];
}

/** Forward kinematics: joint angles -> foot position rel. hip pivot (body frame). */
export function legFK(roll, hip, knee) {
  const L1 = G.thigh, L2 = G.calf;
  const px = L1 * Math.sin(hip) + L2 * Math.sin(hip + knee);
  const py = -(L1 * Math.cos(hip) + L2 * Math.cos(hip + knee));
  return [px, py * Math.cos(roll), py * Math.sin(roll)];
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
    const tz = fz - L.z;
    const j = legIK(tx, ty, tz);
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
    const j = legIK(tx, ty, tz);
    const kneeMax = gait === 'prone' ? 168 : LIMITS.knee[1];
    j[0] = clamp(j[0], LIMITS.roll[0] * DEG, LIMITS.roll[1] * DEG);
    j[1] = clamp(j[1], LIMITS.hip[0] * DEG, LIMITS.hip[1] * DEG);
    j[2] = clamp(j[2], LIMITS.knee[0] * DEG, kneeMax * DEG);
    legs.push({j, foot: f, contact: 1, phase: 0, anchor: [L.x, L.z]});
  }
  return {body, legs, speed: 0, freq: 0, phase: 0, support: 4};
}