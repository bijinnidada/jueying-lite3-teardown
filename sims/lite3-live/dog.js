// Procedural Jueying Lite3 — code-only geometry against the reference photo.
// White rounded chassis, gray battery flanks, stereo-camera head, lidar arch,
// payload box, four 3-DOF legs (white thigh / gray slotted calf / rubber foot).
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {G, LEGS, SPEC} from './kin.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildDog(THREE_) {
  const clipPlane = new THREE.Plane(V3(0, 0, -1), 0.001); // removes +Z (left) half
  const mats = {
    white: new THREE.MeshStandardMaterial({color: '#f5f6f8', roughness: 0.42, metalness: 0.06, envMapIntensity: 0.55}),
    whiteShell: new THREE.MeshStandardMaterial({color: '#f5f6f8', roughness: 0.42, metalness: 0.06, envMapIntensity: 0.55, side: THREE.DoubleSide}),
    gray: new THREE.MeshStandardMaterial({color: '#8d97a3', roughness: 0.5, metalness: 0.12, envMapIntensity: 0.5}),
    grayShell: new THREE.MeshStandardMaterial({color: '#8d97a3', roughness: 0.5, metalness: 0.12, envMapIntensity: 0.5, side: THREE.DoubleSide}),
    dark: new THREE.MeshStandardMaterial({color: '#3c424b', roughness: 0.55, metalness: 0.25, envMapIntensity: 0.45}),
    charcoal: new THREE.MeshStandardMaterial({color: '#23262c', roughness: 0.6, metalness: 0.2}),
    rubber: new THREE.MeshStandardMaterial({color: '#141519', roughness: 0.92, metalness: 0.0}),
    lens: new THREE.MeshStandardMaterial({color: '#05070c', roughness: 0.12, metalness: 0.4, envMapIntensity: 0.9}),
    lensRing: new THREE.MeshStandardMaterial({color: '#5a626e', roughness: 0.3, metalness: 0.7}),
    led: new THREE.MeshStandardMaterial({color: '#0b3d3a', emissive: '#2fe3c4', emissiveIntensity: 1.4, roughness: 0.4}),
    ledAmber: new THREE.MeshStandardMaterial({color: '#3a2a08', emissive: '#ffb02e', emissiveIntensity: 1.1, roughness: 0.4}),
    battery: new THREE.MeshStandardMaterial({color: '#46564a', roughness: 0.6, metalness: 0.15}),
    pcb: new THREE.MeshStandardMaterial({color: '#173527', roughness: 0.55, metalness: 0.2}),
    chip: new THREE.MeshStandardMaterial({color: '#101216', roughness: 0.35, metalness: 0.5}),
    copper: new THREE.MeshStandardMaterial({color: '#c98a4b', roughness: 0.35, metalness: 0.8}),
    label: new THREE.MeshStandardMaterial({color: '#e8b62c', roughness: 0.6}),
    motor: new THREE.MeshStandardMaterial({color: '#6d7681', roughness: 0.35, metalness: 0.65, envMapIntensity: 0.6}),
  };
  const shellMats = [mats.whiteShell, mats.grayShell];
  const allMats = Object.values(mats);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---- chassis -------------------------------------------------------------
  const CY = 0; // body group origin = body centre; posed by live loop
  const chassis = mesh(new RoundedBoxGeometry(G.bodyLen, G.bodyHt, G.bodyWid, 5, 0.045), mats.whiteShell, 0, CY, 0);
  // top deck seam
  mesh(new RoundedBoxGeometry(G.bodyLen * 0.92, 0.018, G.bodyWid * 0.82, 3, 0.02), mats.grayShell, -0.01, CY + G.bodyHt / 2 - 0.004, 0);
  // belly plate
  mesh(new RoundedBoxGeometry(G.bodyLen * 0.86, 0.028, G.bodyWid * 0.8, 3, 0.012), mats.charcoal, 0, CY - G.bodyHt / 2 + 0.006, 0);
  // gray battery flanks (the big side panels in the photo)
  for (const s of [-1, 1]) {
    const panel = mesh(new RoundedBoxGeometry(0.27, 0.115, 0.016, 4, 0.02), mats.grayShell, -0.035, CY - 0.004, s * (G.bodyWid / 2 - 0.004));
    panel.name = 'flank';
    // panel screws
    for (const sx of [-0.115, 0.115]) for (const sy of [-0.042, 0.042])
      mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 10), mats.dark, -0.035 + sx, CY - 0.004 + sy, s * (G.bodyWid / 2 + 0.004)).rotation.x = Math.PI / 2;
    // LED strip along the flank bottom edge
    mesh(new THREE.BoxGeometry(0.24, 0.006, 0.004), mats.led, -0.035, CY - 0.058, s * (G.bodyWid / 2 + 0.002));
  }
  // rear cap with ports
  mesh(new RoundedBoxGeometry(0.03, 0.1, 0.16, 3, 0.012), mats.dark, -G.bodyLen / 2 + 0.005, CY, 0);
  for (const pz of [-0.045, 0, 0.045])
    mesh(new THREE.BoxGeometry(0.008, 0.022, 0.028), mats.charcoal, -G.bodyLen / 2 - 0.008, CY + 0.01, pz);

  // ---- internals (revealed by cutaway / x-ray) ------------------------------
  const internals = new THREE.Group();
  body.add(internals);
  const batt = mesh(new RoundedBoxGeometry(0.24, 0.075, 0.15, 3, 0.012), mats.battery, -0.05, CY - 0.012, 0, internals);
  mesh(new THREE.BoxGeometry(0.2, 0.008, 0.11), mats.label, -0.05, CY + 0.028, 0, internals);
  for (const cx of [-0.13, -0.05, 0.03]) mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 14), mats.dark, cx, CY - 0.012, 0, internals).rotation.x = Math.PI / 2;
  const board = mesh(new THREE.BoxGeometry(0.16, 0.006, 0.13), mats.pcb, 0.12, CY + 0.03, 0, internals);
  for (const [bx, bz, s] of [[0.1, 0.03, 0.03], [0.15, -0.02, 0.024], [0.08, -0.035, 0.018], [0.16, 0.04, 0.016]])
    mesh(new THREE.BoxGeometry(s, 0.008, s), mats.chip, bx, CY + 0.038, bz, internals);
  mesh(new THREE.BoxGeometry(0.05, 0.014, 0.05), mats.copper, 0.12, CY + 0.04, 0, internals);
  // hip motor stators visible inside
  for (const L of LEGS)
    mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 20), mats.motor, L.x, CY + G.hipY, L.z * 0.72, internals).rotation.x = Math.PI / 2;
  // wiring harness
  const harness = new THREE.CatmullRomCurve3([V3(-0.16, CY + 0.02, 0.05), V3(-0.02, CY + 0.045, 0.06), V3(0.1, CY + 0.02, 0.05), V3(0.18, CY - 0.02, 0.03)]);
  mesh(new THREE.TubeGeometry(harness, 32, 0.006, 8), mats.charcoal, 0, 0, 0, internals);

  // ---- head / sensor module --------------------------------------------------
  const head = new THREE.Group();
  head.position.set(G.bodyLen / 2 - 0.02, CY + 0.028, 0);
  body.add(head);
  const headBox = mesh(new RoundedBoxGeometry(0.115, 0.095, 0.185, 5, 0.032), mats.whiteShell, 0.02, 0, 0, head);
  headBox.rotation.z = -0.06;
  // face plate (dark) with stereo bar
  const face = mesh(new RoundedBoxGeometry(0.022, 0.075, 0.165, 4, 0.012), mats.charcoal, 0.078, 0.004, 0, head);
  face.rotation.z = -0.06;
  const stereo = new THREE.Group();
  stereo.position.set(0.092, 0.018, 0);
  stereo.rotation.z = -0.06;
  head.add(stereo);
  mesh(new RoundedBoxGeometry(0.026, 0.034, 0.15, 4, 0.012), mats.dark, 0, 0, 0, stereo);
  for (const sz of [-0.052, 0.052]) {
    mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.012, 24), mats.lensRing, 0.012, 0, sz, stereo).rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.014, 24), mats.lens, 0.014, 0, sz, stereo).rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.016, 12), new THREE.MeshStandardMaterial({color: '#1b3a5c', roughness: 0.1, metalness: 0.6, emissive: '#0a2440', emissiveIntensity: 0.5}), 0.015, 0, sz, stereo).rotation.z = Math.PI / 2;
  }
  mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 14), mats.lens, 0.012, 0, 0, stereo).rotation.z = Math.PI / 2;
  // chin camera + LED brow
  mesh(new THREE.SphereGeometry(0.014, 20, 14), mats.charcoal, 0.075, -0.032, 0, head);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 18), mats.lens, 0.083, -0.032, 0, head).rotation.z = Math.PI / 2;
  const brow = mesh(new THREE.BoxGeometry(0.006, 0.008, 0.13), mats.led, 0.088, 0.045, 0, head);
  brow.rotation.z = -0.06;
  // head side vents
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++)
    mesh(new THREE.BoxGeometry(0.03, 0.004, 0.003), mats.dark, 0.01, -0.01 + i * 0.009, s * 0.093, head);

  // ---- lidar arch + dome -----------------------------------------------------
  const archG = new THREE.Group();
  archG.position.set(0.075, CY + G.bodyHt / 2, 0);
  body.add(archG);
  const archCurve = new THREE.CatmullRomCurve3([V3(0.075, 0.005, 0), V3(0.06, 0.075, 0), V3(0, 0.105, 0), V3(-0.06, 0.075, 0), V3(-0.075, 0.005, 0)]);
  const arch = mesh(new THREE.TubeGeometry(archCurve, 40, 0.011, 12), mats.gray, 0, 0, 0, archG);
  for (const s of [-1, 1]) mesh(new RoundedBoxGeometry(0.03, 0.02, 0.024, 3, 0.006), mats.dark, s * 0.075, 0.002, 0, archG);
  const lidar = new THREE.Group();
  lidar.position.set(0, 0.03, 0);
  archG.add(lidar);
  mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.03, 32), mats.charcoal, 0, 0, 0, lidar);
  const lidarDome = mesh(new THREE.SphereGeometry(0.04, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({color: '#1a2230', roughness: 0.18, metalness: 0.35, envMapIntensity: 0.8}), 0, 0.014, 0, lidar);
  mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.006, 32), mats.led, 0, 0.008, 0, lidar);
  const lidarMark = mesh(new THREE.BoxGeometry(0.006, 0.012, 0.006), mats.ledAmber, 0.035, 0.03, 0, lidar);

  // ---- payload / compute box on rear deck ------------------------------------
  const payload = new THREE.Group();
  payload.position.set(-0.115, CY + G.bodyHt / 2 + 0.03, 0);
  body.add(payload);
  mesh(new RoundedBoxGeometry(0.185, 0.062, 0.135, 4, 0.012), mats.whiteShell, 0, 0, 0, payload);
  mesh(new RoundedBoxGeometry(0.17, 0.008, 0.12, 3, 0.004), mats.grayShell, 0, 0.033, 0, payload);
  // rear ports
  for (const [pz, w] of [[-0.04, 0.02], [-0.012, 0.02], [0.016, 0.026], [0.045, 0.014]])
    mesh(new THREE.BoxGeometry(0.006, 0.016, w), mats.charcoal, -0.094, -0.005, pz, payload);
  mesh(new THREE.BoxGeometry(0.004, 0.012, 0.03), mats.label, -0.094, 0.014, -0.02, payload);
  mesh(new THREE.BoxGeometry(0.05, 0.004, 0.03), mats.label, 0.03, 0.036, 0.03, payload);
  for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(0.002, 0.002, 0.1), mats.dark, -0.06 + i * 0.02, 0.036, -0.01, payload);

  // ---- emissive halos: tinted radial sprites (post bloom washes pale studios) ----
  const glowCv = document.createElement('canvas');
  glowCv.width = glowCv.height = 128;
  const gc = glowCv.getContext('2d');
  const gg = gc.createRadialGradient(64, 64, 2, 64, 64, 62);
  gg.addColorStop(0, 'rgba(255,255,255,0.9)');
  gg.addColorStop(0.35, 'rgba(255,255,255,0.38)');
  gg.addColorStop(1, 'rgba(255,255,255,0)');
  gc.fillStyle = gg;
  gc.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowCv);
  const glows = [];
  const glow = (parent, x, y, z, sx, sy) => {
    const m = new THREE.SpriteMaterial({map: glowTex, color: '#2fe3c4', transparent: true, opacity: 0.5, depthWrite: false});
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    s.scale.set(sx, sy, 1);
    parent.add(s);
    glows.push(m);
  };
  glow(head, 0.09, 0.045, 0, 0.16, 0.06);
  glow(lidar, 0, 0.012, 0, 0.13, 0.07);
  for (const s of [-1, 1]) glow(body, -0.035, CY - 0.058, s * (G.bodyWid / 2 + 0.012), 0.26, 0.055);

  // ---- legs ------------------------------------------------------------------
  const legs = [];
  const legMatSets = [];
  for (let i = 0; i < 4; i++) {
    const L = LEGS[i];
    const side = L.left ? 1 : -1;
    // per-leg material clones so isolate can ghost the others
    const lm = {
      white: mats.white.clone(), gray: mats.gray.clone(), dark: mats.dark.clone(),
      charcoal: mats.charcoal.clone(), rubber: mats.rubber.clone(), motor: mats.motor.clone(),
      led: mats.led.clone(),
    };
    legMatSets.push(lm);
    const rootG = new THREE.Group();
    rootG.position.set(L.x, CY + G.hipY, L.z);
    body.add(rootG);
    const rollG = new THREE.Group();
    rootG.add(rollG);
    // hip roll actuator: cylinder along Z, gray outer cap
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.062, 28), lm.white, 0, 0, side * 0.012, rollG).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.014, 28), lm.gray, 0, 0, side * 0.046, rollG).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 20), lm.dark, 0, 0, side * 0.054, rollG).rotation.x = Math.PI / 2;
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8), lm.dark, Math.cos(a) * 0.033, Math.sin(a) * 0.033, side * 0.052, rollG).rotation.x = Math.PI / 2;
    }
    const pitchG = new THREE.Group();
    rollG.add(pitchG);
    // thigh: white shell sweeping down, tapered
    const thighShape = new THREE.Shape();
    thighShape.moveTo(-0.032, 0.01);
    thighShape.quadraticCurveTo(-0.045, -0.08, -0.026, -G.thigh + 0.01);
    thighShape.lineTo(0.026, -G.thigh + 0.01);
    thighShape.quadraticCurveTo(0.042, -0.07, 0.03, 0.01);
    thighShape.closePath();
    const thighGeo = new THREE.ExtrudeGeometry(thighShape, {depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4, curveSegments: 14});
    thighGeo.translate(0, 0, -0.025);
    const thigh = mesh(thighGeo, lm.white, 0, 0, 0, pitchG);
    // thigh accent seam
    mesh(new THREE.BoxGeometry(0.006, 0.12, 0.054), lm.gray, 0.028, -0.09, 0, pitchG);
    const kneeG = new THREE.Group();
    kneeG.position.set(0, -G.thigh, 0);
    pitchG.add(kneeG);
    // knee disc
    mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.058, 26), lm.gray, 0, 0, 0, kneeG).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.064, 18), lm.dark, 0, 0, 0, kneeG).rotation.x = Math.PI / 2;
    // calf: gray link with lightening slots
    const calfShape = new THREE.Shape();
    calfShape.moveTo(-0.02, 0.005);
    calfShape.quadraticCurveTo(-0.03, -0.09, -0.014, -G.calf + 0.012);
    calfShape.lineTo(0.014, -G.calf + 0.012);
    calfShape.quadraticCurveTo(0.028, -0.09, 0.02, 0.005);
    calfShape.closePath();
    for (const sy of [-0.06, -0.115]) {
      const hole = new THREE.Path();
      hole.moveTo(-0.007, sy - 0.022);
      hole.lineTo(0.007, sy - 0.022);
      hole.lineTo(0.007, sy + 0.022);
      hole.lineTo(-0.007, sy + 0.022);
      hole.closePath();
      calfShape.holes.push(hole);
    }
    const calfGeo = new THREE.ExtrudeGeometry(calfShape, {depth: 0.034, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 12});
    calfGeo.translate(0, 0, -0.017);
    mesh(calfGeo, lm.gray, 0, 0, 0, kneeG);
    // ankle + foot
    const footG = new THREE.Group();
    footG.position.set(0, -G.calf, 0);
    kneeG.add(footG);
    mesh(new THREE.SphereGeometry(0.02, 18, 12), lm.dark, 0, 0.008, 0, footG);
    const foot = mesh(new THREE.CylinderGeometry(G.footR, G.footR * 0.94, 0.042, 26), lm.rubber, 0, -0.004, 0, footG);
    foot.rotation.x = Math.PI / 2;
    for (let tr = 0; tr < 9; tr++) {
      const a = (tr / 9) * Math.PI * 2;
      const tread = mesh(new THREE.BoxGeometry(0.008, 0.006, 0.044), lm.charcoal, Math.cos(a) * G.footR * 0.98, -0.004 + Math.sin(a) * G.footR * 0.98, 0, footG);
      tread.rotation.z = a;
    }
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.046, 16), lm.motor, 0, -0.004, 0, footG).rotation.x = Math.PI / 2;
    legs.push({L, rootG, rollG, pitchG, kneeG, footG, mats: lm, thigh, foot});
  }

  // ---- display modes -----------------------------------------------------------
  const setModes = (modes) => {
    const cut = modes.cut ? [clipPlane] : null;
    for (const m of shellMats) { m.clippingPlanes = cut; m.needsUpdate = true; }
    const ghost = modes.xray;
    for (const m of shellMats) {
      m.transparent = ghost; m.opacity = ghost ? 0.16 : 1; m.depthWrite = !ghost;
    }
    for (const m of allMats) m.wireframe = !!modes.wire;
    for (let i = 0; i < 4; i++) {
      const iso = modes.isolate && modes.isolate !== 'ALL' && modes.isolate !== LEGS[i].id;
      for (const m of Object.values(legMatSets[i])) {
        m.transparent = iso || ghost; m.opacity = iso ? 0.1 : ghost ? 0.35 : 1; m.depthWrite = !(iso || ghost);
        // OPAQUE shader define is cached at compile; transparency flips need a recompile
        m.needsUpdate = true;
      }
    }
    internals.visible = true;
  };

  const update = (pose, t, modes) => {
    body.position.set(pose.body.x, pose.body.y, pose.body.z);
    body.rotation.set(pose.body.roll, pose.body.yaw, pose.body.pitch, 'XYZ');
    for (let i = 0; i < 4; i++) {
      const leg = legs[i], j = pose.legs[i].j;
      leg.rollG.rotation.x = j[0];
      leg.pitchG.rotation.z = j[1];
      leg.kneeG.rotation.z = j[2];
    }
    lidar.rotation.y = t * 2.4;
    const pulse = 0.9 + 0.5 * Math.sin(t * 3.1);
    mats.led.emissiveIntensity = 1.0 + 0.5 * pulse;
    for (const lm of legMatSets) lm.led.emissiveIntensity = 0.8 + 0.4 * pulse;
    brow.material.emissiveIntensity = 1.2 + 0.6 * Math.sin(t * 2.2);
    for (const g of glows) g.opacity = 0.3 + 0.2 * pulse;
  };

  return {root, body, legs, mats, internals, lidar, head, archG, payload, setModes, update, clipPlane};
}