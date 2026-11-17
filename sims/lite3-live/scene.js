// Inspection environments: warehouse aisle (fire) and switchgear room (power).
// Props are static seeded geometry; only smoke/ember/hotspot pulse and the scan
// beam move, all posed from mission time so pause freezes the whole scene.
import * as THREE from 'three';
import {GLOW_LAYER} from '../kit/stage3d.js';
import {rng} from '../kit/util.js';
import {SCENARIOS} from './mission.js';

const SEV = {ok: '#2f9e63', warn: '#d9820b', danger: '#d33a2c'};

export function buildEnv(kind) {
  const S = SCENARIOS[kind];
  const g = new THREE.Group();
  const r = rng(kind === 'fire' ? 11 : 23);
  const mat = (color, rough = 0.72, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: rough, metalness: 0.06, envMapIntensity: 0.4, ...extra});
  const M = {
    floor: mat(kind === 'fire' ? '#cfc6b2' : '#c2c8cd', 0.9),
    lane: mat('#d9a013', 0.8),
    wood: mat('#b99b6b'), wood2: mat('#8a7452'), crate: mat('#9aa0a6'),
    steel: mat('#6f6a60', 0.55), dark: mat('#3a332c', 0.8),
    red: mat('#c8371d', 0.55), white: mat('#efe9dd', 0.6),
    cab: mat('#5f7183', 0.5), gray: mat('#7d8894', 0.5),
    ins: mat('#e9e4da', 0.45),
    ember: mat('#ff6a2a', 0.6, {emissive: '#ff5a26', emissiveIntensity: 2.0}),
    ledG: mat('#2f9e63', 0.5, {emissive: '#2f9e63', emissiveIntensity: 1.3}),
    ledA: mat('#d9820b', 0.5, {emissive: '#e8a01c', emissiveIntensity: 1.5}),
    exit: mat('#2f9e63', 0.5, {emissive: '#2f9e63', emissiveIntensity: 1.1}),
  };
  const box = (w, h, d, m, x, y, z, parent = g, ry = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true;
    parent.add(o); return o;
  };
  const cyl = (rt, rb, h, m, x, y, z, parent = g, seg = 16) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
    parent.add(o); return o;
  };
  const sprite = (color, sx, sy, x, y, z, op = 0.4, parent = g) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    const m = new THREE.SpriteMaterial({map: new THREE.CanvasTexture(cv), color, transparent: true, opacity: op, depthWrite: false});
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.set(sx, sy, 1);
    parent.add(s); return s;
  };

  // floor patch + safety lanes
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.2), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.004; floor.receiveShadow = true;
  floor.material.polygonOffset = true; floor.material.polygonOffsetFactor = -3; floor.material.polygonOffsetUnits = -3;
  g.add(floor);
  for (let i = 0; i < 10; i++) box(0.24, 0.006, 0.05, M.lane, -2.3 + i * 0.52, 0.007, 0);
  box(5.4, 0.006, 0.035, M.lane, 0, 0.007, 0.78);
  box(5.4, 0.006, 0.035, M.lane, 0, 0.007, -0.78);

  const smoke = [], embers = [], pulses = [];
  if (kind === 'fire') {
    for (const side of [-1, 1]) {
      const z = side * 1.28;
      for (let i = 0; i < 4; i++) box(0.06, 1.5, 0.06, M.steel, -2.1 + i * 1.4, 0.75, z);
      for (const y of [0.55, 1.15]) {
        box(4.4, 0.05, 0.55, M.steel, 0, y, z);
        for (let i = 0; i < 7; i++) {
          const w = 0.28 + r() * 0.24, h = 0.2 + r() * 0.2;
          box(w, h, 0.34, [M.wood, M.wood2, M.crate][Math.floor(r() * 3)], -1.9 + i * 0.62 + r() * 0.1, y + 0.025 + h / 2, z + (r() - 0.5) * 0.1, g, (r() - 0.5) * 0.2);
        }
      }
    }
    for (const id of ['ext1', 'ext2']) {
      const [x, , z] = S.targets[id].pos;
      box(0.30, 0.62, 0.16, M.red, x, 0.31, z);
      box(0.302, 0.10, 0.165, M.white, x, 0.44, z);
      cyl(0.045, 0.045, 0.30, M.red, x + 0.22, 0.15, z + 0.12);
      box(0.05, 0.05, 0.03, M.dark, x + 0.22, 0.32, z + 0.12);
      box(0.22, 0.14, 0.02, M.white, x, 0.86, z);
      box(0.22, 0.045, 0.022, M.red, x, 0.885, z);
    }
    const [hx, , hz] = S.targets.hyd1.pos;
    cyl(0.075, 0.085, 0.55, M.red, hx, 0.275, hz);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), M.red);
    dome.position.set(hx, 0.55, hz); dome.castShadow = true; g.add(dome);
    for (const s of [-1, 1]) { const o = cyl(0.035, 0.035, 0.07, M.red, hx + s * 0.09, 0.36, hz); o.rotation.z = Math.PI / 2; }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), M.dark);
    wheel.position.set(hx, 0.63, hz); wheel.rotation.x = Math.PI / 2; g.add(wheel);
    const [fx, , fz] = S.targets.fire1.pos;
    box(0.34, 0.26, 0.30, M.dark, fx, 0.13, fz, g, 0.4);
    box(0.22, 0.16, 0.2, M.dark, fx - 0.16, 0.08, fz + 0.14, g, -0.3);
    const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), M.ember);
    ember.position.set(fx, 0.30, fz); g.add(ember); embers.push(ember);
    pulses.push(sprite('#ff5a26', 0.5, 0.4, fx, 0.36, fz, 0.4));
    pulses.push(sprite('#ff8a3c', 0.3, 0.26, fx + 0.08, 0.48, fz - 0.05, 0.3));
    for (let i = 0; i < 3; i++) smoke.push(sprite('#6b665e', 0.4, 0.4, fx, 0.5, fz, 0.22));
    box(0.04, 1.3, 0.04, M.steel, -2.45, 0.65, -1.28);
    box(0.26, 0.11, 0.03, M.exit, -2.45, 1.32, -1.28);
  } else {
    for (let i = 0; i < 5; i++) box(0.16, 0.006, 0.3, i % 2 ? M.dark : M.lane, 0.55 + i * 0.17, 0.007, -0.32, g, 0.7);
    for (const [i, x] of [-1.15, -0.35, 0.45].entries()) {
      const z = -1.15;
      box(0.62, 1.62, 0.52, M.cab, x, 0.81, z);
      box(0.012, 1.5, 0.02, M.dark, x + 0.12, 0.81, z + 0.265);
      for (let v = 0; v < 3; v++) box(0.4, 0.015, 0.01, M.dark, x - 0.05, 0.28 + v * 0.05, z + 0.265);
      const dial = cyl(0.09, 0.09, 0.02, M.white, x, 1.05, z + 0.27); dial.rotation.x = Math.PI / 2;
      const needle = box(0.006, 0.07, 0.006, M.dark, x, 1.08, z + 0.285); needle.rotation.z = 0.6 - i * 0.35;
      box(0.4, 0.03, 0.012, i === 1 ? M.ledA : M.ledG, x, 1.42, z + 0.265);
      if (i === 1) {
        box(0.1, 0.06, 0.012, M.ledA, x, 1.32, z + 0.27);
        pulses.push(sprite('#e8a01c', 0.34, 0.26, x, 1.32, z + 0.3, 0.4));
      }
    }
    const [tx, , tz] = S.targets.tr1.pos;
    box(0.72, 0.62, 0.55, M.gray, tx, 0.31, tz);
    for (let i = 0; i < 6; i++) box(0.02, 0.5, 0.5, M.gray, tx - 0.38 + i * 0.15, 0.3, tz + 0.3);
    const cons = cyl(0.09, 0.09, 0.5, M.gray, tx, 0.74, tz); cons.rotation.z = Math.PI / 2;
    for (const dx of [-0.2, 0, 0.2]) {
      cyl(0.025, 0.025, 0.22, M.ins, tx + dx, 0.72, tz - 0.1);
      for (let s = 0; s < 3; s++) cyl(0.055, 0.055, 0.018, M.ins, tx + dx, 0.66 + s * 0.07, tz - 0.1);
    }
    const [ix, , iz] = S.targets.ins1.pos;
    cyl(0.03, 0.035, 0.55, M.steel, ix, 0.275, iz);
    for (let s = 0; s < 4; s++) cyl(0.06, 0.06, 0.02, M.ins, ix, 0.62 + s * 0.09, iz);
    box(4.6, 0.05, 0.26, M.dark, 0, 1.95, -1.15);
    for (const x of [-1.8, 1.8]) box(0.03, 0.6, 0.03, M.dark, x, 2.25, -1.15);
    cyl(0.02, 0.02, 0.9, M.steel, 1.05, 0.45, 0.55);
    box(0.22, 0.16, 0.02, M.lane, 1.05, 0.95, 0.55);
    box(0.22, 0.05, 0.022, M.dark, 1.05, 0.95, 0.55);
  }

  // scan rig: beam from head to target + floor ring + persistent discovery dots
  const beamGeo = new THREE.ConeGeometry(0.15, 1, 20, 1, true);
  beamGeo.rotateX(Math.PI); // apex at the head so the cone opens onto the target
  // normal blending: additive washes out to invisible on the pale studio floor
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({color: '#e8481c', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide}),
  );
  beam.visible = false; g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.014, 8, 40),
    new THREE.MeshBasicMaterial({color: '#e8481c', transparent: true, opacity: 0.8, depthWrite: false}),
  );
  ring.rotation.x = -Math.PI / 2; ring.visible = false; g.add(ring);
  const targets = {};
  const dots = {};
  for (const id in S.targets) {
    const T = S.targets[id];
    targets[id] = new THREE.Vector3(...T.pos);
    const d = sprite(SEV[T.sev], 0.14, 0.14, T.pos[0], T.pos[1], T.pos[2], 0.55);
    d.visible = false; dots[id] = d;
  }
  g.traverse((n) => {
    if ((!n.isMesh && !n.isSprite) || !n.material) return;
    const m = n.material;
    if (m.isSpriteMaterial || (m.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 1) > 0.3)) n.layers.enable(GLOW_LAYER);
  });

  const Y = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const fired = new Set();
  return {
    group: g, targets,
    mark(id) { fired.add(id); dots[id].visible = true; },
    reset() { fired.clear(); for (const id in dots) dots[id].visible = false; ring.visible = false; beam.visible = false; },
    update(t, mp, head) {
      for (let i = 0; i < smoke.length; i++) {
        const h = (t * 0.10 + i * 0.33) % 1, s = smoke[i];
        s.position.y = 0.42 + h * 0.95; s.material.opacity = 0.38 * (1 - h);
        const sc = 0.35 + h * 0.55; s.scale.set(sc, sc, 1);
      }
      for (const e of embers) e.material.emissiveIntensity = 1.8 + 0.9 * Math.sin(t * 7.3) + 0.4 * Math.sin(t * 13.7);
      for (let i = 0; i < pulses.length; i++) pulses[i].material.opacity = 0.3 + 0.14 * Math.sin(t * (kind === 'fire' ? 9 : 4.2) + i * 2.1);
      if (mp && mp.scan && head) {
        const tp = targets[mp.scan.id];
        dir.copy(tp).sub(head);
        const len = dir.length();
        beam.visible = true;
        beam.position.copy(head).addScaledVector(dir, 0.5);
        beam.quaternion.setFromUnitVectors(Y, dir.normalize());
        beam.scale.set(1, len, 1);
        beam.material.opacity = 0.30 + 0.06 * Math.sin(t * 10);
        beam.material.color.set(SEV[mp.scan.sev]);
        ring.visible = true;
        ring.position.set(tp.x, 0.02, tp.z);
        ring.material.color.set(SEV[mp.scan.sev]);
        const k = 1 + 0.12 * Math.sin(t * 5);
        ring.scale.set(k, k, 1);
        ring.material.opacity = mp.scan.k < 1 ? 0.85 : 0.5;
      } else { beam.visible = false; ring.visible = false; }
    },
  };
}