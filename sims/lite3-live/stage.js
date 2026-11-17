// Warm paper studio: ink mechanism + vermilion accent read against a darker ground.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createStage} from '../kit/stage3d.js';
import {rng} from '../kit/util.js';

export function createStudio(canvas, hud, capture) {
  const st = createStage(canvas, hud, {
    bg: '#ece5d6', capture, fov: 36, exposure: 1.02,
    bloom: {strength: 0.16, radius: 0.4, threshold: 1.05},
    glow: {strength: 0.5, radius: 0.4, threshold: 0.25},
  });
  // Selective emissive bloom (glow layer over black) — a full-scene bloom would
  // pick up the pale studio and veil the frame. Low tier falls back to sprites.
  st.bloomPass.enabled = false;
  const {scene, camera, renderer} = st;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  camera.near = 0.02;
  camera.far = 60;
  camera.updateProjectionMatrix();

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.Fog('#ece5d6', 4, 11);

  const key = new THREE.DirectionalLight('#fff2df', 2.5);
  key.position.set(2.2, 3.6, 1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -1.1; key.shadow.camera.right = 1.1;
  key.shadow.camera.top = 1.1; key.shadow.camera.bottom = -1.1;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 10;
  key.shadow.bias = -0.0003;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe0ff', 1.5);
  rim.position.set(-2.6, 1.8, -2.2);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffe9d2', 0.3);
  fill.position.set(0.4, -1.2, 2.4);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight('#f6ecd9', '#b9ac93', 0.7));

  // ground: matte disc with a baked light-pool / edge-vignette so the near-white
  // dog separates from the paper, plus faint grid + baked contact shadow
  const gCv = document.createElement('canvas');
  gCv.width = gCv.height = 512;
  const gctx = gCv.getContext('2d');
  const gGrad = gctx.createRadialGradient(256, 256, 16, 256, 256, 256);
  gGrad.addColorStop(0, '#ebe2cd');
  gGrad.addColorStop(0.10, '#e0d8c4');
  gGrad.addColorStop(0.22, '#cdc3ac');
  gGrad.addColorStop(0.40, '#b8ad95');
  gGrad.addColorStop(1, '#b0a58d');
  gctx.fillStyle = gGrad;
  gctx.fillRect(0, 0, 512, 512);
  const groundTex = new THREE.CanvasTexture(gCv);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 72),
    new THREE.MeshStandardMaterial({map: groundTex, color: '#c6bca6', roughness: 0.88, metalness: 0, envMapIntensity: 0.3}),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(10, 40, '#c9c0ad', '#d8d0bf');
  grid.position.y = 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.material.polygonOffset = true;
  grid.material.polygonOffsetFactor = -1;
  scene.add(grid);

  // blueprint atmosphere: concentric dashed rings + radial ticks + crosshairs,
  // faded in with the explode amount, slowly counter-rotating with the turntable
  const blueprint = new THREE.Group();
  blueprint.position.y = 0.003;
  blueprint.visible = false;
  scene.add(blueprint);
  const bpMat = new THREE.LineDashedMaterial({
    color: '#8a8378', dashSize: 0.03, gapSize: 0.022, transparent: true, opacity: 0.08,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  for (const r of [0.55, 0.85, 1.2]) {
    const pts = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), bpMat);
    loop.computeLineDistances();
    blueprint.add(loop);
  }
  const tickPts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r1 = i % 6 === 0 ? 1.34 : 1.26;
    tickPts.push(new THREE.Vector3(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2), new THREE.Vector3(Math.cos(a) * r1, 0, Math.sin(a) * r1));
  }
  const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), bpMat);
  ticks.computeLineDistances();
  blueprint.add(ticks);
  const crossPts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, cx = Math.cos(a) * 0.85, cz = Math.sin(a) * 0.85, s = 0.045;
    crossPts.push(new THREE.Vector3(cx - s, 0, cz), new THREE.Vector3(cx + s, 0, cz), new THREE.Vector3(cx, 0, cz - s), new THREE.Vector3(cx, 0, cz + s));
  }
  const crosses = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPts), bpMat);
  crosses.computeLineDistances();
  blueprint.add(crosses);
  let curTier = 'high';
  const setBlueprint = (K, turn = 0) => {
    const k = Math.min(1, Math.max(0, K));
    bpMat.opacity = 0.08 + 0.52 * k;
    blueprint.rotation.y = turn * 0.15;
    blueprint.visible = k > 0.005 && curTier !== 'low';
  };

  const shCv = document.createElement('canvas');
  shCv.width = shCv.height = 256;
  const g2 = shCv.getContext('2d');
  const grad = g2.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, 'rgba(40,32,22,0.60)');
  grad.addColorStop(0.55, 'rgba(40,32,22,0.26)');
  grad.addColorStop(1, 'rgba(40,32,22,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 256, 256);
  const shTex = new THREE.CanvasTexture(shCv);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.72),
    new THREE.MeshBasicMaterial({map: shTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2}),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.002;
  scene.add(contact);

  const setShadowSpan = (hx) => {
    const c = key.shadow.camera;
    c.left = -hx; c.right = hx; c.top = hx * 0.62; c.bottom = -hx * 0.62;
    c.updateProjectionMatrix();
  };

  const setQuality = (tier) => {
    curTier = tier;
    const s = tier === 'high' ? 2048 : tier === 'med' ? 1024 : 512;
    if (key.shadow.mapSize.x !== s) {
      key.shadow.mapSize.set(s, s);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    grid.visible = tier !== 'low';
    if (tier === 'low') blueprint.visible = false;
    st.setGlow(tier !== 'low');
    dust.geometry.setDrawRange(0, tier === 'high' ? N : tier === 'med' ? 100 : 60);
    dust.material.size = tier === 'low' ? 0.016 : 0.02;
    dust.material.opacity = tier === 'low' ? 0.35 : 0.5;
  };

  // drifting dust motes: static seeded positions, posed purely by t
  const N = 140;
  const dp = new Float32Array(N * 3);
  const r = rng(7);
  for (let i = 0; i < N; i++) {
    dp[i * 3] = (r() * 2 - 1) * 1.5;
    dp[i * 3 + 1] = 0.06 + r() * 1.25;
    dp[i * 3 + 2] = (r() * 2 - 1) * 1.5;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: '#b3a68f', size: 0.02, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(dust);

  // game ending: the paper studio dims to night so additive fireworks read
  const dayBg = new THREE.Color('#ece5d6'), nightBg = new THREE.Color('#141227');
  const dayGround = new THREE.Color('#c6bca6'), nightGround = new THREE.Color('#2b2540');
  const hemi = scene.children.find((c) => c.isHemisphereLight);
  const setDusk = (k) => {
    k = Math.min(1, Math.max(0, k));
    scene.background.copy(dayBg).lerp(nightBg, k);
    scene.fog.color.copy(scene.background);
    renderer.toneMappingExposure = 1.02 * (1 - 0.55 * k);
    key.intensity = 2.5 * (1 - 0.84 * k);
    rim.intensity = 1.5 * (1 - 0.45 * k);
    fill.intensity = 0.3 * (1 - 0.8 * k);
    if (hemi) hemi.intensity = 0.7 * (1 - 0.8 * k);
    ground.material.color.copy(dayGround).lerp(nightGround, k);
    grid.material.opacity = 0.55 * (1 - k);
    dust.material.opacity = (curTier === 'low' ? 0.35 : 0.5) * (1 - k);
  };

  return {...st, key, grid, contact, setQuality, setBlueprint, setShadowSpan, setDusk, blueprint, ground, dust};
}