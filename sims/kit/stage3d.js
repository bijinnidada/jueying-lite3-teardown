import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';

// Objects that should bloom enable this layer in addition to layer 0.
export const GLOW_LAYER = 1;
const BLACK = new THREE.Color(0x000000);

/**
 * Renderer + scene + camera + bloom. The camera's projection centre is shifted
 * to the middle of the HUD viewport (between header and bottom panel), so the
 * subject is centred in the visible area, not behind the terminal.
 */
export function createStage(canvas, hud, opts = {}) {
  const {
    bg = '#09090a',
    fov = 38,
    bloom = {strength: 0.85, radius: 0.55, threshold: 0.62},
    capture = false,
    exposure = 1,
    glow = null,
  } = opts;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(new THREE.Color(bg), 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 6000);

  const target = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(4, 4), bloom.strength, bloom.radius, bloom.threshold);
  // Selective emissive bloom: a second composer renders only GLOW_LAYER against
  // black, blooms it, and adds it over the base before tone mapping. A full-scene
  // bloom would pick up a pale studio background and veil the whole frame.
  let bloomComposer = null, mixPass = null, glowOn = false;
  if (glow) {
    bloomComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType}));
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(new RenderPass(scene, camera));
    bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), glow.strength, glow.radius, glow.threshold));
    mixPass = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: {baseTexture: {value: null}, bloomTexture: {value: bloomComposer.renderTarget2.texture}},
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main(){ gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }',
    }), 'baseTexture');
    mixPass.needsSwap = true;
    composer.addPass(mixPass);
  } else {
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());

  const size = {w: 1, h: 1, centre: 0.5};
  // Director crop: render a sub-rectangle of the base view (crisp punch-ins).
  const crop = {z: 1, fx: 0, fy: 0, x0: 0, y0: 0};
  const applyView = () => {
    const {w, h, centre} = size;
    const offY = h / 2 - centre;
    if (crop.z <= 1.0001) {
      crop.x0 = 0;
      crop.y0 = 0;
      camera.setViewOffset(w, h, 0, offY, w, h);
    } else {
      const cw = w / crop.z;
      const ch = h / crop.z;
      crop.x0 = Math.min(Math.max(crop.fx - cw / 2, 0), w - cw);
      crop.y0 = Math.min(Math.max(crop.fy - ch / 2, 0), h - ch);
      camera.setViewOffset(w, h, crop.x0, offY + crop.y0, cw, ch);
    }
    camera.updateProjectionMatrix();
  };
  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    const pr = capture ? 1 : Math.min(devicePixelRatio || 1, 2);
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    if (bloomComposer) { bloomComposer.setPixelRatio(pr); bloomComposer.setSize(w, h); }
    const vp = hud.viewport();
    size.centre = (vp.top + (h - vp.bottom)) / 2;
    camera.aspect = w / h;
    applyView();
  };
  /** Zoom z around base-screen point (fx, fy); returns {z, x0, y0} for mapping back. */
  const setCrop = (z, fx, fy) => {
    crop.z = Math.max(1, z);
    crop.fx = fx;
    crop.fy = fy;
    applyView();
    return {z: crop.z, x0: crop.x0, y0: crop.y0};
  };

  const v = new THREE.Vector3();
  /** World point → CSS px on screen, plus whether it's in front of the camera. */
  const project = (p) => {
    v.set(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z).project(camera);
    return {x: (v.x * 0.5 + 0.5) * size.w, y: (-v.y * 0.5 + 0.5) * size.h, visible: v.z < 1};
  };

  const st = {
    THREE,
    renderer,
    scene,
    camera,
    composer,
    bloomPass,
    size,
    resize,
    project,
    render: () => {
      if (glowOn && bloomComposer) {
        const mask = camera.layers.mask, hadBg = scene.background, hadFog = scene.fog;
        camera.layers.set(GLOW_LAYER);
        scene.background = BLACK;
        scene.fog = null;
        bloomComposer.render();
        camera.layers.mask = mask;
        scene.background = hadBg;
        scene.fog = hadFog;
      }
      composer.render();
    },
    setGlow: (on) => { glowOn = !!on && !!bloomComposer; if (mixPass) mixPass.enabled = glowOn; },
    setCrop,
    hudViewport: () => hud.viewport(),
  };
  window.__STAGE = st;
  return st;
}
