// Light studio: pale backdrop, one teal accent, baked environment, soft shadows.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createStage} from '../kit/stage3d.js';
import {rng} from '../kit/util.js';

export function createStudio(canvas, hud, capture) {
  const st = createStage(canvas, hud, {
    bg: '#eef1f4', capture, fov: 36, exposure: 1.06,
    bloom: {strength: 0.16, radius: 0.4, threshold: 1.05},
  });
  // UnrealBloomPass veils the whole pale studio on software GL (the wash does
  // not respond to threshold/strength); emissive glow uses tinted sprites instead.
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
  scene.fog = new THREE.Fog('#eef1f4', 4, 11);

  const key = new THREE.DirectionalLight('#fff6ea', 2.3);
  key.position.set(2.2, 3.6, 1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -1.1; key.shadow.camera.right = 1.1;
  key.shadow.camera.top = 1.1; key.shadow.camera.bottom = -1.1;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 10;
  key.shadow.bias = -0.0003;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe2ff', 1.1);
  rim.position.set(-2.6, 1.8, -2.2);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight('#e8f0ff', '#b9b4aa', 0.85));

  // ground: matte disc + faint grid + baked contact shadow
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 72),
    new THREE.MeshStandardMaterial({color: '#e4e7ea', roughness: 0.96, metalness: 0}),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(10, 40, '#c6ccd3', '#d7dce1');
  grid.position.y = 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.material.polygonOffset = true;
  grid.material.polygonOffsetFactor = -1;
  scene.add(grid);

  const shCv = document.createElement('canvas');
  shCv.width = shCv.height = 256;
  const g2 = shCv.getContext('2d');
  const grad = g2.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, 'rgba(30,36,44,0.34)');
  grad.addColorStop(0.55, 'rgba(30,36,44,0.14)');
  grad.addColorStop(1, 'rgba(30,36,44,0)');
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

  const setQuality = (tier) => {
    const s = tier === 'high' ? 2048 : tier === 'med' ? 1024 : 512;
    if (key.shadow.mapSize.x !== s) {
      key.shadow.mapSize.set(s, s);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    grid.visible = tier !== 'low';
  };

  // drifting dust motes: static seeded positions, posed purely by t
  const N = 90;
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
    color: '#7fa8a2', size: 0.012, transparent: true, opacity: 0.38, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(dust);

  return {...st, key, grid, contact, setQuality, ground, dust};
}