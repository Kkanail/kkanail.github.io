// Glass K — a clear glass letter K floating over the homepage H1.
// The H1 is painted into the 3D scene so the glass really refracts it (with rainbow dispersion at the edges).
// Hovering the K pokes its surface like liquid: ripples spread from the touch point and fade; a click is a bigger poke.
// Effect contract: export function mount(el, options) -> cleanup()
// The returned cleanup also carries live controls: .set(partialOptions), .get(), .reset()
// The text to refract comes from the element(s) matching options.textSelector (default: [data-glass-text]).
// While the effect runs, <html> gets the class "glass-k-on" so CSS can hide the DOM copy of that text.

import * as THREE from 'three';
import { RoomEnvironment } from '/assets/vendor/three/RoomEnvironment.js';

export const DEFAULTS = {
  // scene
  background: '#ffffff',
  ink: '#101820',          // colour of the refracted heading
  // shape
  font: 'block',           // 'block' (built-in) or an id from /assets/vendor/k-glyphs.json
  kHeight: 0.52,           // K height as a fraction of the slot height
  kX: 0.71, kY: 0.5,       // K centre as a fraction of the slot
  responsive: true,        // on narrow screens, ignore kHeight/kX/kY and centre a smaller K
  italic: 0.2,             // forward slant (built-in block K only; fonts keep their own style)
  depth: 0.36,             // extrusion depth, relative to K height
  bevel: 0.055,            // rounded edge size
  // glass
  thickness: 1.2,          // how strongly the glass bends what's behind it
  ior: 1.5,                // index of refraction (glass ≈ 1.5, water 1.33, diamond 2.4)
  dispersion: 3.5,         // rainbow split at the edges
  roughness: 0.02,         // 0 = clear, higher = frosted
  envIntensity: 0.55,      // strength of reflections
  // liquid
  rippleSpeed: 2.2,        // world units / s (the view is 10 units tall)
  rippleWidth: 0.55,       // width of each ripple ring
  rippleFreq: 7,           // rings per ripple
  rippleDecay: 1.4,        // how fast ripples fade
  hoverStrength: 0.45,
  clickStrength: 1.2,
  jelly: 0.08,             // squash and stretch after a click
  // motion
  idleSpin: 0.2,           // side-to-side turn while idle (radians)
  idleTilt: 0.1,           // up-and-down tilt while idle
  follow: 0.25,            // how much the K leans toward the pointer
};
const CONFIG = { textSelector: '[data-glass-text]', mobileBreak: 760, glyphsUrl: '/assets/vendor/k-glyphs.json' };

const MAX_RIPPLES = 12;
const VIEW_H = 10;        // world units from the bottom to the top of the view

// Turn a typeface.js outline (m / l / q / b commands, y up) into one THREE.Shape per contour.
// A K has no holes, so every contour is solid; overlapping contours are fine.
function outlineToShapes(outline) {
  const t = outline.split(' '); const shapes = []; let sh = null;
  for (let i = 0; i < t.length;) {
    const c = t[i++];
    if (c === 'm') { sh = new THREE.Shape(); shapes.push(sh); sh.moveTo(+t[i++], +t[i++]); }
    else if (c === 'l') sh.lineTo(+t[i++], +t[i++]);
    else if (c === 'q') { const x = +t[i++], y = +t[i++], cx = +t[i++], cy = +t[i++]; sh.quadraticCurveTo(cx, cy, x, y); }
    else if (c === 'b') { const x = +t[i++], y = +t[i++], ax = +t[i++], ay = +t[i++], bx = +t[i++], by = +t[i++]; sh.bezierCurveTo(ax, ay, bx, by, x, y); }
  }
  return shapes;
}
let glyphsPromise = null; // shared by every mount
function loadGlyphs(url) {
  glyphsPromise ??= fetch(url).then((r) => r.json()).then((d) => d.fonts).catch(() => []);
  return glyphsPromise;
}

// Outline of a bold K (height 1); slanted and bevelled later.
const K_OUTLINE = [[0, 0], [0, 1], [0.3, 1], [0.3, 0.6], [0.68, 1], [1.05, 1], [0.57, 0.53], [1.09, 0], [0.72, 0], [0.38, 0.39], [0.3, 0.31], [0.3, 0]];

export function mount(el, options = {}) {
  const o = { ...CONFIG, ...DEFAULTS, ...options };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('Glass K: WebGL unavailable, keeping the plain heading', err);
    const noop = () => {}; noop.set = noop; noop.get = () => ({ ...o }); noop.reset = noop;
    return noop;
  }
  renderer.toneMapping = THREE.NoToneMapping; // keep the page's white truly white through the glass
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  camera.position.set(0, 0, (VIEW_H / 2) / Math.tan(THREE.MathUtils.degToRad(28 / 2)));

  /* ---------- the H1, painted onto a plane behind the glass ---------- */
  const textCanvas = document.createElement('canvas');
  const textCtx = textCanvas.getContext('2d');
  const textTex = new THREE.CanvasTexture(textCanvas);
  textTex.colorSpace = THREE.SRGBColorSpace;
  textTex.anisotropy = 4;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: textTex, toneMapped: false }));
  scene.add(plane);

  function paintText() {
    const r = el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    textCanvas.width = Math.max(1, Math.round(r.width * dpr)); textCanvas.height = Math.max(1, Math.round(r.height * dpr));
    textCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    textCtx.fillStyle = o.background; textCtx.fillRect(0, 0, r.width, r.height);
    for (const node of document.querySelectorAll(o.textSelector)) {
      const cs = getComputedStyle(node);
      textCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      textCtx.fillStyle = o.ink;
      textCtx.textBaseline = 'alphabetic';
      if ('letterSpacing' in textCtx) textCtx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      // copy the browser's own line breaks: draw each word exactly where the DOM put it
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        for (const m of t.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(t, m.index); range.setEnd(t, m.index + m[0].length);
          const rect = range.getClientRects()[0];
          if (!rect) continue;
          const asc = textCtx.measureText(m[0]).fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.9;
          textCtx.fillText(m[0], rect.left - r.left, rect.top - r.top + asc);
        }
      }
    }
    textTex.needsUpdate = true;
  }

  /* ---------- the glass K ---------- */
  const blockShape = new THREE.Shape(K_OUTLINE.map(([x, y]) => new THREE.Vector2(x, y)));
  let glyphs = [];
  let geoKey = '';
  function buildGeometry() {
    const glyph = glyphs.find((g) => g.id === o.font);
    const key = [glyph ? o.font : 'block', o.italic, o.depth, o.bevel].join();
    if (key === geoKey) return;
    geoKey = key;
    const shapes = glyph ? outlineToShapes(glyph.outline) : [blockShape];
    // measure the outline so depth and bevel are relative to the letter's height, whatever the font units
    let minY = Infinity, maxY = -Infinity;
    for (const sh of shapes) for (const pt of sh.getPoints(4)) { minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y); }
    const h = maxY - minY || 1;
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: o.depth * h, curveSegments: glyph ? 5 : 8,   // curvy serif Ks have many curves: keep the vertex count sane
      bevelEnabled: o.bevel > 0, bevelThickness: o.bevel * 1.3 * h, bevelSize: o.bevel * h, bevelSegments: glyph ? 6 : 10,
    });
    if (!glyph) geo.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, o.italic, 0, 0, 0)); // x += italic * y
    geo.center();
    geo.scale(1 / h, 1 / h, 1 / h);
    geo.computeVertexNormals();
    if (k.geometry) k.geometry.dispose();
    k.geometry = geo;
  }

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, transmission: 1,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1,
  });
  // Liquid ripples: bend the surface normal per pixel, so refraction and reflections wobble.
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
  const uniforms = {
    uRip: { value: ripples }, uTime: { value: 0 },
    uSpeed: { value: 0 }, uWidth: { value: 0 }, uFreq: { value: 0 }, uDecay: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = `uniform vec4 uRip[${MAX_RIPPLES}];\nuniform float uTime, uSpeed, uWidth, uFreq, uDecay;\n` +
      shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifdef USE_TRANSMISSION
      {
        vec3 bend = vec3(0.0);
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 r = uRip[i];
          float age = uTime - r.z;
          if (r.w <= 0.0 || age < 0.0 || age > 5.0) continue;
          vec2 dv = vWorldPosition.xy - r.xy;
          float d = length(dv);
          float x = d - age * uSpeed;                                   // distance from the wave front
          float env = exp(-x * x / (uWidth * uWidth)) * exp(-age * uDecay) * r.w;
          bend.xy += (dv / max(d, 1e-3)) * cos(x * uFreq) * env;
          bend.z  -= sin(x * uFreq) * env * 0.35;                       // a little dimple toward the viewer
        }
        normal = normalize(normal + bend);
      }
      #endif`);
  };
  const k = new THREE.Mesh(undefined, material);
  k.position.z = 1.5;
  scene.add(k);

  // push every option into the scene (called on mount and whenever .set() changes something)
  function apply(relayout = true) {
    renderer.setClearColor(o.background, 1);
    buildGeometry();
    // changing values is free; only switching dispersion on/off changes the shader, so recompile just then
    const shaderChange = (material.dispersion > 0) !== (o.dispersion > 0);
    Object.assign(material, { thickness: o.thickness, ior: o.ior, dispersion: o.dispersion, roughness: o.roughness, envMapIntensity: o.envIntensity });
    if (shaderChange) material.needsUpdate = true;
    uniforms.uSpeed.value = o.rippleSpeed; uniforms.uWidth.value = o.rippleWidth;
    uniforms.uFreq.value = o.rippleFreq; uniforms.uDecay.value = o.rippleDecay;
    if (relayout) layout(); else if (reduce) render();
  }

  /* ---------- layout ---------- */
  let W = 0, H = 0, kBase = { x: 0, y: 0, s: 1 };
  function layout() {
    const r = el.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const viewW = VIEW_H * camera.aspect;
    plane.scale.set(viewW, VIEW_H, 1);
    const narrow = o.responsive && W < o.mobileBreak;
    const [fx, fy] = narrow ? [0.56, 0.3] : [o.kX, o.kY];
    const hFrac = narrow ? Math.min(0.42, (W * 0.5) / H) : o.kHeight; // on phones: about half the screen width
    kBase = { x: (fx - 0.5) * viewW, y: (0.5 - fy) * VIEW_H, s: hFrac * VIEW_H };
    k.scale.setScalar(kBase.s);
    k.position.x = kBase.x; k.position.y = kBase.y;
    paintText();
    if (reduce) render();
  }

  /* ---------- pointer: hover pokes, click pokes harder ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let rippleIdx = 0, lastPoke = { x: 1e9, y: 1e9, t: -1 };
  const wobble = { v: 0, x: 0 };
  let time = 0;

  function hitAt(clientX, clientY) {
    const r = el.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return { hit: raycaster.intersectObject(k, false)[0] || null, nx: ndc.x, ny: ndc.y };
  }
  function poke(point, strength) {
    if (strength <= 0) return;
    ripples[rippleIdx].set(point.x, point.y, time, strength);
    rippleIdx = (rippleIdx + 1) % MAX_RIPPLES;
    lastPoke = { x: point.x, y: point.y, t: time };
  }
  function onMove(ev) {
    const h = hitAt(ev.clientX, ev.clientY);
    if (!h) { tilt.tx = 0; tilt.ty = 0; return; }
    tilt.tx = h.ny * o.follow * 0.72; tilt.ty = h.nx * o.follow;
    if (h.hit && !reduce) {
      const p = h.hit.point;
      if (Math.hypot(p.x - lastPoke.x, p.y - lastPoke.y) > 0.35 || time - lastPoke.t > 0.25) poke(p, o.hoverStrength);
    }
  }
  function onDown(ev) {
    if (ev.target.closest && ev.target.closest('a, button, input, label, select, textarea, [data-no-poke]')) return;
    const h = hitAt(ev.clientX, ev.clientY);
    if (h && h.hit && !reduce) { poke(h.hit.point, o.clickStrength); wobble.v += 2.2; }
  }

  /* ---------- frame ---------- */
  function render() {
    uniforms.uTime.value = time;
    renderer.render(scene, camera);
  }
  let raf = 0, last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 3); tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 3);
    // jelly: a damped spring squashes and stretches the K after a click
    wobble.v += (-60 * wobble.x - 7 * wobble.v) * dt; wobble.x += wobble.v * dt;
    const sq = wobble.x * o.jelly;
    k.scale.set(kBase.s * (1 + sq), kBase.s * (1 - sq), kBase.s * (1 + sq * 0.5));
    k.rotation.x = Math.sin(time * 0.35) * o.idleTilt - tilt.x;
    k.rotation.y = Math.sin(time * 0.45) * o.idleSpin + tilt.y;
    k.rotation.z = Math.sin(time * 0.25) * 0.03;
    k.position.y = kBase.y + Math.sin(time * 0.6) * 0.08;
    render();
    raf = requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(layout);
  ro.observe(el);
  apply();
  const ready = loadGlyphs(o.glyphsUrl).then((list) => { glyphs = list; if (o.font !== 'block') { geoKey = ''; apply(); } return list; });
  document.fonts?.ready.then(() => { paintText(); if (reduce) render(); });
  document.documentElement.classList.add('glass-k-on');
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown);
  if (reduce) { k.rotation.set(-0.05, 0.25, 0); render(); } else raf = requestAnimationFrame((t) => { last = t; loop(t); });

  const cleanup = () => {
    cancelAnimationFrame(raf); ro.disconnect();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    document.documentElement.classList.remove('glass-k-on');
    k.geometry?.dispose(); material.dispose(); plane.geometry.dispose(); plane.material.dispose(); textTex.dispose();
    scene.environment?.dispose(); pmrem.dispose(); renderer.dispose();
    canvas.remove();
  };
  cleanup.set = (patch) => {
    const relayout = ['background', 'ink', 'kHeight', 'kX', 'kY', 'responsive'].some((key) => key in patch && patch[key] !== o[key]);
    Object.assign(o, patch); apply(relayout);
  };
  cleanup.get = () => Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, o[key]]));
  cleanup.reset = () => cleanup.set({ ...DEFAULTS, ...options });
  cleanup.repaint = () => paintText(); // call after the heading text or size changes
  cleanup.fonts = () => ready.then((list) => [{ id: 'block', label: 'Block' }, ...list.map(({ id, label }) => ({ id, label }))]);
  cleanup.poke = (strength = o.clickStrength) => { poke({ x: k.position.x, y: k.position.y }, strength); wobble.v += 2.2; };
  return cleanup;
}
