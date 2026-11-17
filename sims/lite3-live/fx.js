// Ending fireworks: one pooled Points cloud, additive so sparks fade to black.
// Everything is stepped by the game's ending clock (dt = 0 while paused), and the
// burst schedule is seeded at reset so a replay reproduces the same show.
import * as THREE from 'three';
import {rng} from '../kit/util.js';

const HUES = ['#ff5a36', '#ffc23d', '#7ed957', '#4da3ff', '#ff4fa0', '#c07bff'].map((h) => new THREE.Color(h));
const MAX = 3000;

// round soft spark: square points read as dead pixels against the night sky
function sparkTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export function createFireworks(scene, cb = {}) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({
    size: 0.11, map: sparkTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  points.layers.enable(1); // selective glow layer: bright sparks bloom at night
  scene.add(points);

  let parts = [], sched = [], si = 0, nextAmbient = 0, r = rng(1);

  const spawn = (p) => { if (parts.length < MAX) parts.push(p); };
  const burst = (x, y, z, hue) => {
    const n = 128;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, b = Math.acos(2 * r() - 1);
      const v = 1.15 + r() * 1.5;
      const c = HUES[hue];
      spawn({
        x, y, z,
        vx: Math.sin(b) * Math.cos(a) * v, vy: Math.cos(b) * v * 0.92, vz: Math.sin(b) * Math.sin(a) * v,
        life: 0, ttl: 1.5 + r() * 0.9, r: c.r, g: c.g, b: c.b,
        grav: 1.5, drag: 0.985, flash: 0.12,
      });
    }
    if (cb.burst) cb.burst();
  };
  const rocket = (x, z, y, hue) => {
    spawn({x, y: 0.1, z, vx: (r() - 0.5) * 0.12, vy: 2.1 + r() * 0.7, vz: (r() - 0.5) * 0.12,
      life: 0, ttl: (y - 0.1) / 2.4, r: 1, g: 0.85, b: 0.55, grav: 0, drag: 1, flash: 0, rocket: hue, ty: y});
    if (cb.launch) cb.launch();
  };

  return {
    count: () => parts.length,
    reset(seed) {
      r = rng(seed || 1);
      parts = []; si = 0; sched = [];
      for (let i = 0; i < 10; i++) {
        sched.push({t: 0.35 + i * 0.62, x: -1.7 + r() * 3.5, z: -0.55 + r() * 1.1, y: 1.5 + r() * 1.1, hue: (r() * HUES.length) | 0});
      }
      for (let i = 0; i < 4; i++) {
        sched.push({t: 7.0 + i * 0.12, x: -1.4 + i * 1.0, z: -0.3 + r() * 0.6, y: 1.9 + r() * 0.8, hue: (r() * HUES.length) | 0});
      }
      sched.sort((a, b) => a.t - b.t);
      nextAmbient = 9.5;
      points.visible = true;
      geo.setDrawRange(0, 0);
    },
    stop() { parts = []; points.visible = false; geo.setDrawRange(0, 0); },
    update(t, dt) {
      if (!points.visible) return;
      while (si < sched.length && sched[si].t <= t) { const s = sched[si++]; rocket(s.x, s.z, s.y, s.hue); }
      if (t > nextAmbient) { nextAmbient = t + 1.5; rocket(-1.7 + r() * 3.5, -0.55 + r() * 1.1, 1.5 + r() * 1.1, (r() * HUES.length) | 0); }
      if (dt > 0) {
        const born = [];
        for (const p of parts) {
          p.life += dt;
          if (p.rocket !== undefined) {
            if (p.life >= p.ttl || p.y >= p.ty) { p.dead = true; burst(p.x, p.y, p.z, p.rocket); continue; }
            if (r() < 0.7) born.push({x: p.x, y: p.y, z: p.z, vx: (r() - 0.5) * 0.1, vy: -0.25, vz: (r() - 0.5) * 0.1,
              life: 0, ttl: 0.3 + r() * 0.2, r: 1, g: 0.72, b: 0.35, grav: 0, drag: 1, flash: 0});
          }
          p.vy -= p.grav * dt;
          const d = Math.pow(p.drag, dt * 60);
          p.vx *= d; p.vy *= d; p.vz *= d;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.life >= p.ttl) p.dead = true;
        }
        parts = parts.filter((p) => !p.dead);
        for (const b of born) spawn(b);
      }
      let n = 0;
      for (const p of parts) {
        const k = 1 - p.life / p.ttl;
        const f = Math.pow(Math.max(0, k), 1.35);
        const w = p.flash && p.life < p.flash ? 1 - p.life / p.flash : 0;
        pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
        col[n * 3] = (p.r + (1 - p.r) * w) * f;
        col[n * 3 + 1] = (p.g + (1 - p.g) * w) * f;
        col[n * 3 + 2] = (p.b + (1 - p.b) * w) * f;
        n++;
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}