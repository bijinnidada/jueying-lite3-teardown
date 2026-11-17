// Procedural Jueying Lite3 — code-only geometry against the reference photo.
// White rounded chassis, gray battery flanks, stereo-camera head, lidar arch,
// payload box, four 3-DOF legs (white thigh / gray slotted calf / rubber foot).
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLOW_LAYER} from '../kit/stage3d.js';
import {G, LEGS, SPEC, PARTS, partK, clamp01} from './kin.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildDog(THREE_) {
  const clipPlane = new THREE.Plane(V3(0, 0, -1), 0.001); // removes +Z (left) half
  const mats = {
    white: new THREE.MeshPhysicalMaterial({color: '#f8f6f0', roughness: 0.42, metalness: 0.06, envMapIntensity: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25}),
    whiteShell: new THREE.MeshPhysicalMaterial({color: '#f8f6f0', roughness: 0.42, metalness: 0.06, envMapIntensity: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide}),
    gray: new THREE.MeshPhysicalMaterial({color: '#6e675e', roughness: 0.5, metalness: 0.12, envMapIntensity: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3}),
    grayShell: new THREE.MeshPhysicalMaterial({color: '#6e675e', roughness: 0.5, metalness: 0.12, envMapIntensity: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, side: THREE.DoubleSide}),
    dark: new THREE.MeshStandardMaterial({color: '#3a352e', roughness: 0.55, metalness: 0.25, envMapIntensity: 0.45}),
    charcoal: new THREE.MeshStandardMaterial({color: '#26221c', roughness: 0.6, metalness: 0.2}),
    rubber: new THREE.MeshStandardMaterial({color: '#191713', roughness: 0.92, metalness: 0.0}),
    lens: new THREE.MeshPhysicalMaterial({color: '#05070c', roughness: 0.08, metalness: 0.2, envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: 0.08}),
    lensRing: new THREE.MeshStandardMaterial({color: '#6e675e', roughness: 0.25, metalness: 0.8, envMapIntensity: 0.8}),
    led: new THREE.MeshStandardMaterial({color: '#401508', emissive: '#ff5a26', emissiveIntensity: 0.95, roughness: 0.4}),
    ledAmber: new THREE.MeshStandardMaterial({color: '#3a2a08', emissive: '#ffb02e', emissiveIntensity: 0.8, roughness: 0.4}),
    battery: new THREE.MeshStandardMaterial({color: '#4a5a40', roughness: 0.6, metalness: 0.15}),
    pcb: new THREE.MeshStandardMaterial({color: '#1d3a2a', roughness: 0.55, metalness: 0.2}),
    chip: new THREE.MeshStandardMaterial({color: '#101216', roughness: 0.35, metalness: 0.5}),
    copper: new THREE.MeshStandardMaterial({color: '#c98a4b', roughness: 0.25, metalness: 1, envMapIntensity: 0.9}),
    label: new THREE.MeshStandardMaterial({color: '#e8b62c', roughness: 0.6}),
    motor: new THREE.MeshStandardMaterial({color: '#7a7368', roughness: 0.3, metalness: 0.85, envMapIntensity: 0.8}),
    accent: new THREE.MeshStandardMaterial({color: '#e8481c', roughness: 0.5, metalness: 0.08, emissive: '#e8481c', emissiveIntensity: 0.18}),
  };
  // ink silhouette hull (inverted BackSide) so the near-white shell reads on paper
  const inkMat = new THREE.MeshBasicMaterial({color: '#26221c', side: THREE.BackSide});
  inkMat.userData.ink = true;
  const outline = (m, s = 1.035, mat = inkMat) => {
    const o = new THREE.Mesh(m.geometry, mat);
    m.geometry.computeBoundingBox();
    const c = m.geometry.boundingBox.getCenter(new THREE.Vector3());
    o.scale.setScalar(s);
    o.position.copy(c).multiplyScalar(1 - s);
    o.castShadow = false; o.receiveShadow = false;
    m.add(o);
    return o;
  };
  let shellMats = [mats.whiteShell, mats.grayShell];
  const allMats = Object.values(mats);
  const screws = [];

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shellG = new THREE.Group();
  const bellyG = new THREE.Group();
  body.add(shellG, bellyG);

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
  const CL = G.bodyLen - 0.09; // shell length; head completes the 548 mm body
  const chassis = mesh(new RoundedBoxGeometry(CL, G.bodyHt, G.bodyWid, 5, 0.045), mats.whiteShell, 0, CY, 0, shellG);
  outline(chassis);
  // top deck seam
  mesh(new RoundedBoxGeometry(CL * 0.92, 0.018, G.bodyWid * 0.82, 3, 0.02), mats.grayShell, -0.01, CY + G.bodyHt / 2 - 0.004, 0, shellG);
  // belly plate
  mesh(new RoundedBoxGeometry(CL * 0.86, 0.028, G.bodyWid * 0.8, 3, 0.012), mats.charcoal, 0, CY - G.bodyHt / 2 + 0.006, 0, bellyG);
  // gray battery flanks (the big side panels in the photo)
  for (const s of [-1, 1]) {
    const panel = mesh(new RoundedBoxGeometry(0.27, 0.115, 0.016, 4, 0.02), mats.grayShell, -0.035, CY - 0.004, s * (G.bodyWid / 2 - 0.004), shellG);
    panel.name = 'flank';
    // vermilion stripe along the flank top edge
    mesh(new THREE.BoxGeometry(0.27, 0.01, 0.018), mats.accent, -0.035, CY + 0.052, s * (G.bodyWid / 2 - 0.002), shellG);
    // panel screws (collected so they can scatter independently of the shell)
    for (const sx of [-0.115, 0.115]) for (const sy of [-0.042, 0.042]) {
      const sc = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 10), mats.dark, -0.035 + sx, CY - 0.004 + sy, s * (G.bodyWid / 2 + 0.004), shellG);
      sc.rotation.x = Math.PI / 2;
      screws.push(sc);
    }
    // LED strip along the flank bottom edge
    mesh(new THREE.BoxGeometry(0.24, 0.006, 0.004), mats.led, -0.035, CY - 0.052, s * (G.bodyWid / 2 + 0.002), shellG);
  }
  // rear cap with ports
  mesh(new RoundedBoxGeometry(0.03, 0.1, 0.16, 3, 0.012), mats.dark, -CL / 2 + 0.005, CY, 0, shellG);
  for (const pz of [-0.045, 0, 0.045])
    mesh(new THREE.BoxGeometry(0.008, 0.022, 0.028), mats.charcoal, -CL / 2 - 0.008, CY + 0.01, pz, shellG);

  // ---- internals (revealed by cutaway / x-ray) ------------------------------
  const internals = new THREE.Group();
  body.add(internals);
  const battG = new THREE.Group();
  const boardG = new THREE.Group();
  internals.add(battG, boardG);
  const batt = mesh(new RoundedBoxGeometry(0.24, 0.075, 0.15, 3, 0.012), mats.battery, -0.05, CY - 0.012, 0, battG);
  mesh(new THREE.BoxGeometry(0.2, 0.008, 0.11), mats.label, -0.05, CY + 0.028, 0, battG);
  for (const cx of [-0.13, -0.05, 0.03]) mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 14), mats.dark, cx, CY - 0.012, 0, battG).rotation.x = Math.PI / 2;
  const board = mesh(new THREE.BoxGeometry(0.16, 0.006, 0.13), mats.pcb, 0.12, CY + 0.03, 0, boardG);
  for (const [bx, bz, s] of [[0.1, 0.03, 0.03], [0.15, -0.02, 0.024], [0.08, -0.035, 0.018], [0.16, 0.04, 0.016]])
    mesh(new THREE.BoxGeometry(s, 0.008, s), mats.chip, bx, CY + 0.038, bz, boardG);
  mesh(new THREE.BoxGeometry(0.05, 0.014, 0.05), mats.copper, 0.12, CY + 0.04, 0, boardG);
  // hip motor stators visible inside (HipX axis along X at +-Whip/2)
  const stators = LEGS.map((L) => {
    const side = L.left ? 1 : -1;
    const m = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 20), mats.motor, L.x, CY + G.hipY, side * G.hipRollZ, internals);
    m.rotation.z = Math.PI / 2;
    return m;
  });
  // wiring harness
  const harness = new THREE.CatmullRomCurve3([V3(-0.16, CY + 0.02, 0.05), V3(-0.02, CY + 0.045, 0.06), V3(0.1, CY + 0.02, 0.05), V3(0.18, CY - 0.02, 0.03)]);
  const harnessMesh = mesh(new THREE.TubeGeometry(harness, 32, 0.006, 8), mats.charcoal, 0, 0, 0, internals);

  // ---- head / sensor module --------------------------------------------------
  const head = new THREE.Group();
  head.position.set(CL / 2 - 0.02, CY + 0.028, 0);
  body.add(head);
  const headBox = mesh(new RoundedBoxGeometry(0.115, 0.095, 0.185, 5, 0.032), mats.whiteShell, 0.02, 0, 0, head);
  headBox.rotation.z = -0.06;
  outline(headBox);
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
  const lidarDome = mesh(new THREE.SphereGeometry(0.04, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({color: '#1a2230', roughness: 0.12, metalness: 0.35, envMapIntensity: 1.0, clearcoat: 1, clearcoatRoughness: 0.1}), 0, 0.014, 0, lidar);
  mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.006, 32), mats.led, 0, 0.008, 0, lidar);
  const lidarMark = mesh(new THREE.BoxGeometry(0.006, 0.012, 0.006), mats.ledAmber, 0.035, 0.03, 0, lidar);
  // rotating scan wedge: additive fan that blooms on the glow layer
  const sweep = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 24, 0, 0.62),
    new THREE.MeshBasicMaterial({color: '#ff7a3c', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}),
  );
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = 0.008;
  sweep.layers.enable(GLOW_LAYER);
  lidar.add(sweep);

  // ---- payload / compute box on rear deck ------------------------------------
  const payload = new THREE.Group();
  payload.position.set(-0.115, CY + G.bodyHt / 2 + 0.03, 0);
  body.add(payload);
  mesh(new RoundedBoxGeometry(0.185, 0.062, 0.135, 4, 0.012), mats.whiteShell, 0, 0, 0, payload);
  mesh(new RoundedBoxGeometry(0.17, 0.008, 0.12, 3, 0.004), mats.grayShell, 0, 0.033, 0, payload);
  mesh(new THREE.BoxGeometry(0.17, 0.006, 0.02), mats.accent, 0, 0.038, 0.045, payload);
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
    const m = new THREE.SpriteMaterial({map: glowTex, color: '#ff5a26', transparent: true, opacity: 0.5, depthWrite: false});
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    s.scale.set(sx, sy, 1);
    parent.add(s);
    glows.push(m);
    return s;
  };
  glow(head, 0.09, 0.045, 0, 0.14, 0.045);
  glow(lidar, 0, 0.012, 0, 0.11, 0.05);
  const flankGlows = [];
  for (const s of [-1, 1]) flankGlows.push(glow(body, -0.035, CY - 0.052, s * (G.bodyWid / 2 + 0.012), 0.24, 0.04));

  // ---- legs ------------------------------------------------------------------
  const legs = [];
  const legMatSets = [];
  const bolts = [];
  for (let i = 0; i < 4; i++) {
    const L = LEGS[i];
    const side = L.left ? 1 : -1;
    // per-leg material clones so isolate can ghost the others
    const lm = {
      white: mats.white.clone(), gray: mats.gray.clone(), dark: mats.dark.clone(),
      charcoal: mats.charcoal.clone(), rubber: mats.rubber.clone(), motor: mats.motor.clone(),
      led: mats.led.clone(), accent: mats.accent.clone(), ink: inkMat.clone(),
    };
    legMatSets.push(lm);
    const rootG = new THREE.Group();
    rootG.position.set(L.x, CY + G.hipY, side * G.hipRollZ);
    body.add(rootG);
    const rollG = new THREE.Group();
    rootG.add(rollG);
    // HipX actuator: cylinder along X (abduction axis), accent ring on front face
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 28), lm.white, 0, 0, 0, rollG).rotation.z = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.036, 0.004, 10, 32), lm.accent, 0.037, 0, 0, rollG).rotation.y = Math.PI / 2;
    // abduction housing: HipX axis -> leg plane (L1), rolls with HipX
    mesh(new RoundedBoxGeometry(0.075, 0.085, G.abdL1 + 0.02, 3, 0.02), lm.white, 0, -0.005, side * (G.abdL1 / 2), rollG);
    const pitchG = new THREE.Group();
    pitchG.position.set(0, 0, side * G.abdL1);
    rollG.add(pitchG);
    // HipY actuator at the leg plane: cylinder along Z, gray outer cap
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.062, 28), lm.white, 0, 0, side * 0.012, pitchG).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.014, 28), lm.gray, 0, 0, side * 0.046, pitchG).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 20), lm.dark, 0, 0, side * 0.054, pitchG).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.041, 0.0045, 10, 32), lm.accent, 0, 0, side * 0.054, pitchG);
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      const bm = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8), lm.dark, Math.cos(a) * 0.033, Math.sin(a) * 0.033, side * 0.052, pitchG);
      bm.rotation.x = Math.PI / 2;
      bolts.push({mesh: bm, home: pitchG, local: bm.position.clone(), rot: bm.rotation.clone(), rootPos: rootG.position.clone()});
    }
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
    outline(thigh, 1.05, lm.ink);
    // thigh accent seam
    mesh(new THREE.BoxGeometry(0.006, 0.12, 0.054), lm.accent, 0.028, -0.09, 0, pitchG);
    const kneeG = new THREE.Group();
    kneeG.position.set(0, -G.thigh, 0);
    pitchG.add(kneeG);
    // knee disc
    mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.058, 26), lm.gray, 0, 0, 0, kneeG).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.064, 18), lm.accent, 0, 0, 0, kneeG).rotation.x = Math.PI / 2;
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
    const calf = mesh(calfGeo, lm.gray, 0, 0, 0, kneeG);
    outline(calf, 1.06, lm.ink);
    // ankle + foot
    const footG = new THREE.Group();
    footG.position.set(0, -G.calf, 0);
    kneeG.add(footG);
    mesh(new THREE.SphereGeometry(0.02, 18, 12), lm.dark, 0, 0.008, 0, footG);
    const foot = mesh(new THREE.CylinderGeometry(G.footR, G.footR * 0.94, 0.036, 26), lm.rubber, 0, -0.004, 0, footG);
    foot.rotation.x = Math.PI / 2;
    for (let tr = 0; tr < 9; tr++) {
      const a = (tr / 9) * Math.PI * 2;
      const tread = mesh(new THREE.BoxGeometry(0.007, 0.005, 0.038), lm.charcoal, Math.cos(a) * G.footR * 0.98, -0.004 + Math.sin(a) * G.footR * 0.98, 0, footG);
      tread.rotation.z = a;
    }
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 16), lm.motor, 0, -0.004, 0, footG).rotation.x = Math.PI / 2;
    legs.push({L, rootG, rollG, pitchG, kneeG, footG, mats: lm, thigh, calf, foot});
  }

  // ---- per-assembly material clones (focus ghosting) + fastener reparent ------
  // screws leave shellG (which only translates) so they scatter flat from body
  for (const sc of screws) body.add(sc);
  const matGroups = {};
  const ledClones = [];
  const cloneInto = (sub, objs) => {
    const map = new Map();
    const list = matGroups[sub] || (matGroups[sub] = []);
    for (const o of objs) o.traverse((n) => {
      if (!n.isMesh && !n.isSprite) return;
      const src = n.material;
      if (!map.has(src)) {
        const c = src.clone();
        c.userData.shell = src === mats.whiteShell || src === mats.grayShell;
        if (src.userData.ink) { c.userData.ink = true; c.userData.baseOp = 1; c.userData.baseDw = true; }
        if (src === mats.led) ledClones.push(c);
        map.set(src, c);
        list.push(c);
      }
      n.material = map.get(src);
    });
    return map;
  };
  const shellMap = cloneInto('shell', [shellG, bellyG, ...flankGlows]);
  shellMats = [shellMap.get(mats.whiteShell), shellMap.get(mats.grayShell)];
  matGroups.shell.push(mats.dark); // reparented flank screws keep the shared material
  cloneInto('head', [head]);
  cloneInto('lidar', [archG]);
  cloneInto('compute', [payload]);
  cloneInto('battery', [battG]);
  cloneInto('board', [boardG, harnessMesh]);
  const statorMats = stators.map((s) => (s.material = s.material.clone()));
  matGroups.legs = [...legMatSets.flatMap((lm) => Object.values(lm)), ...statorMats];
  glows.length = 0;
  root.traverse((n) => { if (n.isSprite) glows.push(n.material); });

  // ---- small scatter hardware: bearing races, gear rings, dowel pins ---------
  const gearGeos = [new THREE.CylinderGeometry(0.024, 0.024, 0.011, 18)];
  for (let t = 0; t < 12; t++) {
    const a = (t / 12) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.006, 0.011, 0.006);
    tooth.translate(Math.cos(a) * 0.027, 0, Math.sin(a) * 0.027);
    gearGeos.push(tooth);
  }
  const gearGeo = mergeGeometries(gearGeos);
  const brgGeo = new THREE.TorusGeometry(0.023, 0.0065, 10, 24);
  const pinGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.03, 10);
  const dMats = {gear: mats.motor.clone(), brg: mats.lensRing.clone(), pinB: mats.copper.clone(), pinC: mats.copper.clone()};
  matGroups.legs.push(dMats.gear, dMats.brg);
  matGroups.battery.push(dMats.pinB);
  matGroups.board.push(dMats.pinC);
  const debris = [];
  const debrisObjs = {};
  const addDebris = (id, geo, mat, x, y, z, spin = 0, rx = Math.PI / 2) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = rx;
    m.castShadow = true;
    g.add(m);
    body.add(g);
    debris.push({id, g, spin});
    debrisObjs[id] = g;
  };
  for (const L of LEGS) {
    const side = L.left ? 1 : -1;
    addDebris(`brg-${L.id}`, brgGeo, dMats.brg, L.x, CY + G.hipY, side * (G.hipRollZ + 0.03), 0, 0);
    addDebris(`gear-${L.id}`, gearGeo, dMats.gear, L.x, CY + G.hipY, side * (G.legPlaneZ + 0.03), side * Math.PI * 2.5);
  }
  addDebris('pin-0', pinGeo, dMats.pinB, -0.16, CY - 0.012, 0.055, 0.7);
  addDebris('pin-1', pinGeo, dMats.pinB, -0.05, CY - 0.048, -0.06, -0.5);
  addDebris('pin-2', pinGeo, dMats.pinB, 0.02, CY - 0.012, 0.062, 0.9);
  addDebris('pin-3', pinGeo, dMats.pinC, 0.06, CY + 0.03, -0.05, -0.8);
  addDebris('pin-4', pinGeo, dMats.pinC, 0.17, CY + 0.03, 0.045, 0.6);
  addDebris('pin-5', pinGeo, dMats.pinC, 0.12, CY + 0.055, -0.02, -1.1);

  // ---- wireframe ghost membranes: bee-style envelopes around pack + board ----
  const membranes = [];
  const addMembrane = (id, parent, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, 0.02),
      new THREE.MeshBasicMaterial({color: '#8a8378', wireframe: true, transparent: true, opacity: 0, depthWrite: false}),
    );
    m.position.set(x, y, z);
    m.visible = false;
    parent.add(m);
    membranes.push({id, m});
  };
  addMembrane('battery', battG, 0.30, 0.115, 0.20, -0.05, CY - 0.012, 0);
  addMembrane('board', boardG, 0.23, 0.08, 0.185, 0.12, CY + 0.034, 0);

  // ---- explode / reassemble: radial starburst with per-part stagger -----------
  const partObjs = {
    shell: shellG, belly: bellyG, head, lidar: archG, compute: payload,
    battery: battG, board: boardG, harness: harnessMesh,
    ...debrisObjs,
  };
  for (let i = 0; i < 4; i++) {
    const L = LEGS[i];
    partObjs[`stator-${L.id}`] = stators[i];
    partObjs[`leg-${L.id}`] = legs[i].rootG;
    partObjs[`thigh-${L.id}`] = legs[i].pitchG;
    partObjs[`knee-${L.id}`] = legs[i].kneeG;
    partObjs[`foot-${L.id}`] = legs[i].footG;
  }
  const mkLine = () => {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineDashedMaterial({color: '#8a8378', dashSize: 0.02, gapSize: 0.014, transparent: true, opacity: 0, depthWrite: false}),
    );
    line.visible = false;
    line.frustumCulled = false;
    body.add(line);
    return line;
  };
  const explodeParts = PARTS.map((p) => ({
    ...p, g: partObjs[p.id], base: partObjs[p.id].position.clone(), dirV: V3(...p.dir), line: mkLine(),
  }));
  // additive motion streaks stretched along each assembly's scatter vector;
  // opacity follows the part's scatter rate so stills and pauses stay clean
  const trailCv = document.createElement('canvas');
  trailCv.width = 32; trailCv.height = 128;
  const tc = trailCv.getContext('2d');
  const tgr = tc.createLinearGradient(0, 0, 0, 128);
  tgr.addColorStop(0, 'rgba(255,255,255,0)');
  tgr.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  tgr.addColorStop(1, 'rgba(255,255,255,0)');
  tc.fillStyle = tgr;
  tc.fillRect(0, 0, 32, 128);
  const trailTex = new THREE.CanvasTexture(trailCv);
  const trailGeo = new THREE.PlaneGeometry(1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  const streaks = explodeParts.filter((p) => p.dist >= 0.2).map((p) => {
    const m = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
      map: trailTex, color: '#ff7a3c', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.visible = false;
    m.frustumCulled = false;
    body.add(m);
    return {p, m, w: 0.045 + p.dist * 0.05};
  });
  // fasteners fly radially on their own; hip bolts detach from the rolling actuator
  const fasteners = [];
  screws.forEach((sc, i) => {
    fasteners.push({id: `screw-${i}`, sub: 'shell', mesh: sc, base: sc.position.clone(), dirV: sc.position.clone().normalize(), dist: 0.50, w0: 0.50 + 0.03 * i, w1: 1, fixed: true});
  });
  bolts.forEach((b, i) => {
    const nominal = b.rootPos.clone().add(b.local);
    fasteners.push({id: `bolt-${i}`, sub: 'legs', mesh: b.mesh, home: b.home, local: b.local, rot: b.rot, base: nominal, dirV: nominal.clone().normalize(), dist: 0.42, w0: 0.55 + 0.01 * i, w1: 1, fixed: false, scatterBase: null});
  });
  const partStates = {};
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  let lastK = -1, lastFocus = '', lastMix = -1, modeXray = false;
  const effK = (p, K, focus, mix) => {
    const gk = partK(K, p.w0, p.w1);
    if (focus === 'ALL' || mix <= 0) return gk;
    const fk = p.sub === focus ? K : 0;
    return gk + (fk - gk) * mix;
  };
  // d(effK)/dt from the global explode rate — pure, no frame state
  const dEase = (u) => (u < 0.5 ? 12 * u * u : 12 * (1 - u) * (1 - u));
  const rateOf = (p, K, focus, mix, kRate) => {
    const span = Math.max(0.001, p.w1 - p.w0);
    const u = clamp01((K - p.w0) / span);
    const mf = focus !== 'ALL' && p.sub === focus ? mix : 0;
    return (dEase(u) / span) * kRate * (1 - mf) + kRate * mf;
  };
  const stateOf = (p, k, K, focus) => (focus !== 'ALL' && p.sub === focus && K > 0.02 ? 'OPEN' : k > 0.5 ? 'DETACHED' : 'ENGAGED');
  const setExplode = (K, focus = 'ALL', mix = 1, kRate = 0) => {
    for (const p of explodeParts) {
      const k = effK(p, K, focus, mix);
      p.g.position.copy(p.base).addScaledVector(p.dirV, p.dist * k);
      partStates[p.id] = {k, sub: p.sub, state: stateOf(p, k, K, focus)};
    }
    for (const d of debris) d.g.rotation.z = partStates[d.id].k * d.spin;
    for (const mb of membranes) {
      const k = partStates[mb.id].k;
      mb.m.material.opacity = modeXray ? 0 : 0.32 * k;
      mb.m.visible = !modeXray && k > 0.03;
    }
    for (const s of streaks) {
      const k = partStates[s.p.id].k;
      const act = clamp01(Math.abs(rateOf(s.p, K, focus, mix, kRate)) * 0.8) * Math.sin(Math.PI * clamp01(k));
      const op = modeXray ? 0 : 0.55 * act;
      s.m.material.opacity = op;
      s.m.visible = op > 0.012;
    }
    for (const f of fasteners) {
      const k = effK(f, K, focus, mix);
      if (f.fixed) {
        f.mesh.position.copy(f.base).addScaledVector(f.dirV, f.dist * k);
      } else if (k > 0.001) {
        if (f.mesh.parent !== body) {
          body.updateMatrixWorld(true);
          body.attach(f.mesh);
          f.scatterBase = f.mesh.position.clone();
        }
        f.mesh.position.copy(f.scatterBase).addScaledVector(f.dirV, f.dist * k);
      } else if (f.mesh.parent !== f.home) {
        f.home.attach(f.mesh);
        f.mesh.position.copy(f.local);
        f.mesh.rotation.copy(f.rot);
        f.scatterBase = null;
      }
      partStates[f.id] = {k, sub: f.sub, state: stateOf(f, k, K, focus)};
    }
    // tethers for assemblies + chain links; rebuilt only when the scatter changes
    if (Math.abs(K - lastK) > 0.001 || focus !== lastFocus || Math.abs(mix - lastMix) > 0.001) {
      body.updateMatrixWorld(true);
      for (const p of explodeParts) {
        const k = partStates[p.id].k;
        const vis = k > 0.02;
        p.line.visible = vis;
        p.line.material.opacity = 0.65 * k;
        if (!vis) continue;
        tmpA.copy(p.base).applyMatrix4(p.g.parent.matrixWorld);
        p.g.getWorldPosition(tmpB);
        body.worldToLocal(tmpA);
        body.worldToLocal(tmpB);
        const pos = p.line.geometry.attributes.position;
        pos.setXYZ(0, tmpA.x, tmpA.y, tmpA.z);
        pos.setXYZ(1, tmpB.x, tmpB.y, tmpB.z);
        pos.needsUpdate = true;
        p.line.computeLineDistances();
      }
      for (const s of streaks) {
        if (partStates[s.p.id].k <= 0.02) continue;
        tmpA.copy(s.p.base).applyMatrix4(s.p.g.parent.matrixWorld);
        s.p.g.getWorldPosition(tmpB);
        body.worldToLocal(tmpA);
        body.worldToLocal(tmpB);
        tmpC.copy(tmpB).sub(tmpA);
        const len = tmpC.length();
        if (len < 1e-4) continue;
        tmpC.normalize();
        s.m.position.copy(tmpA).addScaledVector(tmpC, len * 0.5);
        s.m.quaternion.setFromUnitVectors(UP, tmpC);
        s.m.scale.set(s.w, len + 0.06, 1);
      }
      lastK = K; lastFocus = focus; lastMix = mix;
    }
  };
  const getStates = () => partStates;

  // ---- display modes -----------------------------------------------------------
  const applyBase = (m, op, tr, dw, wire) => {
    m.userData.baseOp = op; m.userData.baseDw = dw;
    m.opacity = op; m.depthWrite = dw; m.wireframe = wire; m.transparent = tr;
    m.needsUpdate = true;
  };
  const setFocusGhost = (focus, g) => {
    for (const [sub, list] of Object.entries(matGroups)) {
      const dim = focus !== 'ALL' && sub !== focus && g > 0;
      for (const m of list) {
        if (m.isSpriteMaterial) { m.userData.dim = dim ? 1 - 0.94 * g : 1; continue; }
        if (m.userData.ink) { m.transparent = true; const b = m.userData.baseOp ?? 1; m.opacity = dim ? b * (1 - 0.92 * g) : b; continue; }
        if (dim) {
          m.opacity = m.userData.baseOp + (0.08 - m.userData.baseOp) * g;
          m.depthWrite = g > 0.5 ? false : m.userData.baseDw;
        } else {
          m.opacity = m.userData.baseOp;
          m.depthWrite = m.userData.baseDw;
        }
      }
    }
  };
  const setModes = (modes, focus = 'ALL') => {
    const cut = modes.cut ? [clipPlane] : null;
    const ghost = modes.xray, wire = !!modes.wire;
    modeXray = ghost;
    const keepTr = focus !== 'ALL'; // stay transparent so the ghost tween needs no recompile
    for (const m of shellMats) m.clippingPlanes = cut;
    for (const s of flankGlows) s.material.clippingPlanes = cut; // LED sprites follow the shell cut
    for (const [sub, list] of Object.entries(matGroups)) {
      if (sub === 'legs') continue; // per-leg isolate handled below
      for (const m of list) {
        if (m.isSpriteMaterial || m.userData.ink) continue;
        const xr = ghost && m.userData.shell;
        applyBase(m, xr ? 0.16 : 1, xr || keepTr, !xr, wire);
      }
    }
    for (let i = 0; i < 4; i++) {
      const iso = modes.isolate && modes.isolate !== 'ALL' && modes.isolate !== LEGS[i].id;
      for (const m of Object.values(legMatSets[i])) {
        if (m.userData.ink) { m.transparent = true; m.userData.baseOp = iso ? 0.08 : ghost ? 0.3 : 1; m.opacity = m.userData.baseOp; continue; }
        const op = iso ? 0.1 : ghost ? 0.35 : 1;
        applyBase(m, op, iso || ghost || keepTr, !(iso || ghost), wire);
      }
    }
    for (const m of statorMats) applyBase(m, 1, keepTr, true, wire);
    for (const m of allMats) m.wireframe = wire;
    root.traverse((n) => {
      if (n.isMesh && n.material && n.material.userData.ink) {
        n.visible = !(ghost || wire);
        n.material.clippingPlanes = cut;
        n.material.wireframe = false;
      }
    });
    internals.visible = true;
    setFocusGhost(focus, focus === 'ALL' ? 0 : 1);
  };

  const update = (pose, t, modes) => {
    body.position.set(pose.body.x, pose.body.y, pose.body.z);
    body.rotation.set(pose.body.roll, pose.body.yaw, pose.body.pitch, 'XYZ');
    head.rotation.y = pose.headYaw || 0;
    head.rotation.z = pose.headPitch || 0;
    for (let i = 0; i < 4; i++) {
      const leg = legs[i], j = pose.legs[i].j;
      leg.rollG.rotation.x = j[0];
      leg.pitchG.rotation.z = j[1];
      leg.kneeG.rotation.z = j[2];
    }
    lidar.rotation.y = t * 2.4;
    const pulse = 0.9 + 0.5 * Math.sin(t * 3.1);
    const ledI = 0.7 + 0.3 * pulse;
    mats.led.emissiveIntensity = ledI;
    for (const m of ledClones) m.emissiveIntensity = ledI;
    for (const lm of legMatSets) lm.led.emissiveIntensity = 0.6 + 0.25 * pulse;
    brow.material.emissiveIntensity = 0.9 + 0.35 * Math.sin(t * 2.2);
    for (const g of glows) g.opacity = (0.14 + 0.1 * pulse) * (g.userData.dim ?? 1);
    sweep.material.opacity = 0.1 + 0.08 * pulse;
    hlMat.opacity = hlOn ? 0.3 + 0.15 * Math.sin(t * 6) : 0;
  };

  // ---- BOM highlight: one additive halo parked on the selected part ----------
  const anchors = {shell: shellG, head, lidar: archG, compute: payload, battery: battG, board: boardG};
  for (const lg of legs) {
    anchors[`${lg.L.id}-HipX`] = lg.rollG;
    anchors[`${lg.L.id}-HipY`] = lg.pitchG;
    anchors[`${lg.L.id}-Knee`] = lg.kneeG;
    anchors[`${lg.L.id}-Shank`] = lg.calf;
    anchors[`${lg.L.id}-Foot`] = lg.footG;
  }
  const hlMat = new THREE.SpriteMaterial({map: glowTex, color: '#ff5a26', transparent: true, opacity: 0, depthWrite: false});
  const hl = new THREE.Sprite(hlMat);
  hl.scale.set(0.16, 0.16, 1);
  hl.visible = false;
  let hlOn = false;
  const setHighlight = (id) => {
    const a = id && anchors[id];
    hlOn = !!a;
    hl.visible = hlOn;
    if (a) a.add(hl);
  };

  // emissive accents + halo sprites join the selective-bloom glow layer
  root.traverse((n) => {
    if ((!n.isMesh && !n.isSprite) || !n.material) return;
    const m = n.material;
    if (m.isSpriteMaterial || (m.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 1) > 0.3)) n.layers.enable(GLOW_LAYER);
  });

  return {root, body, legs, mats, internals, lidar, head, archG, payload, shellG, bellyG, battG, boardG, matGroups, setModes, setFocusGhost, setExplode, setHighlight, getStates, update, clipPlane};
}