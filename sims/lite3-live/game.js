// Rescue game: the player picks a target class, the dog hunts it autonomously.
// Each hunt is a pure timeline (search sweep -> approach -> scan -> submit),
// so pause / restart / replay never drift. Three classes found = fireworks ending.
import {SCENARIOS, missionPose, walkSpeed, faceYaw} from './mission.js';

export const GAME_KINDS = [
  {id: 'ext', cn: '灭火器', en: 'EXTINGUISHER', instances: ['ext1', 'ext2']},
  {id: 'hyd', cn: '消火栓', en: 'HYDRANT', instances: ['hyd1']},
  {id: 'fire', cn: '火源', en: 'FIRE SOURCE', instances: ['fire1']},
];

export const kindOf = (targetId) => GAME_KINDS.find((k) => k.instances.includes(targetId));

export function buildHunt(from, targetId) {
  const S = SCENARIOS.fire;
  const speed = walkSpeed(0.78);
  const stop = S.stops.find((s) => s.target === targetId);
  const T = S.targets[targetId];
  const segs = [], events = [];
  let t = 0, prev = {x: from.x, z: from.z, yaw: from.yaw};
  const push = (dur, o) => { segs.push({t0: t, t1: t + dur, ...o}); t += dur; };
  // search waypoint sits in the aisle: the dog sweeps its head looking around
  // before locking onto the target, so the find reads as a search, not a teleport
  const w = {x: stop.x - 0.62, z: stop.z * 0.30};
  w.yaw = faceYaw([w.x, w.z], [T.pos[0], T.pos[2]]);
  const d1 = Math.hypot(w.x - prev.x, w.z - prev.z);
  push(Math.max(0.7, d1 / speed), {kind: 'travel', a: prev, b: w, sweep: true, target: targetId});
  const b = {x: stop.x, z: stop.z, yaw: faceYaw([stop.x, stop.z], [T.pos[0], T.pos[2]])};
  const d2 = Math.hypot(b.x - w.x, b.z - w.z);
  push(Math.max(0.45, d2 / speed), {kind: 'travel', a: w, b, lock: true, target: targetId});
  push(2.2, {kind: 'scan', a: b, b, target: targetId});
  events.push({t, id: targetId, sev: T.sev, report: `找到${T.cn} · 结果已提交`, detail: T.detail, cn: T.cn, en: T.en});
  push(1.2, {kind: 'report', a: b, b, target: targetId});
  const duration = t;
  push(1e9, {kind: 'huntend', a: b, b});
  return {S, speed, segs, events, duration, target: targetId};
}

export const huntPose = missionPose;

export const GAME_PHASE_CN = {pick: '选择目标', hunt: '自主搜索', end: '搜救完成'};