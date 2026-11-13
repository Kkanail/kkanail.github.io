// Live demos for "一隻用點畫出來的鯨魚" (how Particle Whale is made).
// Every demo draws the same simplified blue whale (body only) on a plain 2D canvas, so the 3D math is all visible here.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const INK = '16,24,32', ACCENT = '#6e56cf', LINE = '#e3e3e3';
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- the whale: a row of rounded cross-sections ---------- */
// s = 0 at the snout, 1 at the tail; T = top, B = belly, W = half width (the whale is 2 units long)
const K = {
  s: [0, 0.03, 0.08, 0.15, 0.23, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.9, 0.95, 1],
  T: [0.018, 0.04, 0.058, 0.078, 0.098, 0.116, 0.126, 0.124, 0.11, 0.086, 0.06, 0.041, 0.031, 0.023],
  B: [0.022, 0.05, 0.075, 0.1, 0.122, 0.14, 0.15, 0.145, 0.125, 0.095, 0.066, 0.044, 0.032, 0.023],
  W: [0.03, 0.062, 0.09, 0.11, 0.123, 0.13, 0.133, 0.128, 0.112, 0.085, 0.055, 0.034, 0.024, 0.017],
};
function key(name, s) {
  const S = K.s, V = K[name];
  let i = 0; while (i < S.length - 2 && s > S[i + 1]) i++;
  const t = clamp((s - S[i]) / (S[i + 1] - S[i]), 0, 1);
  const p0 = V[Math.max(0, i - 1)], p1 = V[i], p2 = V[i + 1], p3 = V[Math.min(V.length - 1, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
const cap = (s) => { const a = 1 - clamp(s / 0.012, 0, 1), b = 1 - clamp((1 - s) / 0.02, 0, 1); return Math.sqrt(1 - a * a) * Math.sqrt(1 - b * b); };
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
// one point on the section at s, angle th; n = how square the section is (2 = an ellipse)
function section(s, th, n = 2.2) {
  const c = cap(s), sn = Math.sin(th);
  return [1 - 2 * s, spow(sn, 2 / n) * (sn > 0 ? key('T', s) : key('B', s)) * c, spow(Math.cos(th), 2 / n) * key('W', s) * c];
}
// N rings of V points each
function rings(N, V, n) {
  const out = [];
  for (let i = 0; i <= N; i++) {
    const s = 0.5 - 0.5 * Math.cos(Math.PI * i / N), ring = [];
    for (let j = 0; j < V; j++) ring.push(section(s, (j / V) * TAU, n));
    out.push({ s, ring });
  }
  return out;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
// rings → triangles: every four neighbouring points make two triangles
function mesh(R) {
  const tris = [];
  for (let i = 0; i < R.length - 1; i++) {
    const a = R[i].ring, b = R[i + 1].ring, V = a.length;
    for (let j = 0; j < V; j++) {
      const k = (j + 1) % V;
      for (const t of [[a[j], b[j], a[k]], [a[k], b[j], b[k]]]) {
        let n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
        const area = Math.hypot(...n) / 2;
        if (area < 1e-9) continue;
        n = norm(n);
        const mid = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
        if (n[1] * mid[1] + n[2] * mid[2] < 0) n = n.map((v) => -v);   // point outward
        tris.push({ p: t, n, area, s: R[i].s });
      }
    }
  }
  return tris;
}
// throw dots onto the triangles: by area (even) or the same number per triangle (clumps where triangles are small)
function throwDots(tris, count, byArea) {
  const cdf = []; let sum = 0;
  for (const t of tris) { sum += byArea ? t.area : 1; cdf.push(sum); }
  const dots = [];
  for (let k = 0; k < count; k++) {
    const u = Math.random() * sum; let a = 0, b = cdf.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (cdf[m] < u) a = m + 1; else b = m; }   // binary search on the running total
    const t = tris[a], r1 = Math.sqrt(Math.random()), r2 = Math.random();
    const w = [1 - r1, r1 * (1 - r2), r1 * r2];
    dots.push({ p: [0, 1, 2].map((c) => t.p[0][c] * w[0] + t.p[1][c] * w[1] + t.p[2][c] * w[2]), n: t.n, s: t.s, r: Math.random() });
  }
  return dots;
}

/* ---------- turning and projecting: 3D point → a spot on the canvas ---------- */
function view(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return (p) => {
    const x = p[0] * cy + p[2] * sy, z0 = -p[0] * sy + p[2] * cy;     // turn around the vertical axis
    const y = p[1] * cp - z0 * sp, z = p[1] * sp + z0 * cp;           // tilt
    return [x, y, z];
  };
}
function project(q, st, focal) {
  const d = 3.2 - q[2];                                               // distance from the camera
  const k = (focal / d) * st.scale;                                   // nearer = bigger
  return [st.W / 2 + q[0] * k, st.H / 2 - q[1] * k, k, d];
}

/* ---------- a canvas that redraws every frame while it is on screen ---------- */
function stage(el, draw) {
  const box = el.querySelector('.demo-canvas'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  box.appendChild(canvas);
  const st = { W: 0, H: 0, scale: 1, t: 0, yaw: 0.5, pitch: 0.18, drag: null, pointer: null, ctx };
  const layout = () => {
    const r = box.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    st.W = r.width; st.H = r.height; canvas.width = Math.round(st.W * dpr); canvas.height = Math.round(st.H * dpr);
    canvas.style.width = st.W + 'px'; canvas.style.height = st.H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    st.scale = Math.min(st.W / 1.9, st.H / 0.5);
  };
  box.addEventListener('pointerdown', (e) => { st.drag = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => {
    const r = box.getBoundingClientRect(); st.pointer = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    if (!st.drag) return;
    st.yaw += (e.clientX - st.drag.x) * 0.01; st.pitch = clamp(st.pitch + (e.clientY - st.drag.y) * 0.008, -1.2, 1.2);
    st.drag = { x: e.clientX, y: e.clientY }; if (reduce) frame(0);
  });
  box.addEventListener('pointerup', () => { st.drag = null; });
  box.addEventListener('pointerleave', () => { st.pointer = null; });
  const frame = (dt) => { st.t += dt; if (!st.drag && !reduce) st.yaw += dt * 0.25; ctx.clearRect(0, 0, st.W, st.H); draw(st, dt); };
  let raf = 0, last = 0, visible = false;
  const loop = (now) => { const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; frame(dt); if (visible) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting && !reduce;
    if (visible) { last = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
  }).observe(box);
  new ResizeObserver(() => { layout(); frame(0); }).observe(box);
  layout(); frame(0);
  st.redraw = () => frame(0);
  return st;
}
function control(el, id, fmt = (v) => v, onChange) {
  const input = el.querySelector('#' + id), out = el.querySelector(`output[for="${id}"]`);
  const read = () => (input.type === 'checkbox' ? input.checked : Number(input.value));
  const show = () => { if (out) out.textContent = fmt(read()); };
  input.addEventListener('input', () => { show(); if (onChange) onChange(read()); });
  show();
  return read;
}
const dot = (ctx, x, y, r, a, color = INK) => { ctx.fillStyle = color.startsWith('#') ? color : `rgba(${color},${a})`; ctx.fillRect(x - r / 2, y - r / 2, r, r); };

/* ---------- the demos ---------- */
const DEMOS = {
  // 01 · a 3D shape is a row of rings
  sections(el) {
    const N = control(el, 'w1-rings'), n = control(el, 'w1-square', (v) => v.toFixed(1));
    stage(el, (st) => {
      const { ctx } = st, v = view(st.yaw, st.pitch), R = rings(N(), 40, n());
      R.forEach(({ ring }, i) => {
        ctx.beginPath();
        ring.concat([ring[0]]).forEach((p, j) => { const [x, y] = project(v(p), st, 2.4); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = i === Math.round(N() * 0.35) ? ACCENT : `rgba(${INK},.55)`; ctx.lineWidth = i === Math.round(N() * 0.35) ? 2 : 1; ctx.stroke();
      });
    });
  },
  // 02 · neighbouring points become triangles
  triangles(el) {
    const V = control(el, 'w2-points');
    stage(el, (st) => {
      const { ctx } = st, v = view(st.yaw, st.pitch), tris = mesh(rings(36, V(), 2.2));
      ctx.strokeStyle = `rgba(${INK},.32)`; ctx.lineWidth = 0.6;
      for (const t of tris) {
        const q = t.p.map((p) => project(v(p), st, 2.4));
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath(); ctx.stroke();
      }
      const pick = tris[Math.floor(tris.length * 0.42)], q = pick.p.map((p) => project(v(p), st, 2.4));
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath();
      ctx.fillStyle = ACCENT; ctx.fill();
      el.querySelector('.count').textContent = tris.length.toLocaleString('en') + ' triangles';
    });
  },
  // 03 · throwing dots: by area, or the same number per triangle
  dots(el) {
    const tris = mesh(rings(40, 24, 2.2));
    let dots = [];
    const count = control(el, 'w3-count', (v) => v.toLocaleString('en'), () => rethrow());
    const byArea = control(el, 'w3-area', (v) => (v ? 'by area' : 'same per triangle'), () => rethrow());
    const rethrow = () => { dots = throwDots(tris, count(), byArea()); st.redraw(); };
    const st = stage(el, (st) => {
      const { ctx } = st, v = view(st.yaw, st.pitch);
      for (const d of dots) { const [x, y] = project(v(d.p), st, 2.4); dot(ctx, x, y, 1.4, 0.75); }
    });
    rethrow();
  },
  // 04 · turning and perspective
  turn(el) {
    const dots = throwDots(mesh(rings(40, 24, 2.2)), 9000, true);
    const focal = control(el, 'w4-focal', (v) => v.toFixed(1));
    stage(el, (st) => {
      const { ctx } = st, v = view(st.yaw, st.pitch), f = focal();
      for (const d of dots) { const [x, y, k] = project(v(d.p), st, f); dot(ctx, x, y, clamp(k / st.scale * 0.9, 0.6, 3), 0.7); }
    });
  },
  // 05 · light: how much each dot faces the light
  light(el) {
    const dots = throwDots(mesh(rings(40, 24, 2.2)), 14000, true);
    const rim = control(el, 'w5-rim', (v) => v.toFixed(2));
    stage(el, (st) => {
      const { ctx } = st, v = view(st.yaw, st.pitch);
      const L = st.pointer ? norm([(st.pointer[0] - 0.5) * 2, (0.5 - st.pointer[1]) * 2, 0.8]) : norm([Math.cos(st.t * 0.7), 0.8, Math.sin(st.t * 0.7) + 0.5]);
      for (const d of dots) {
        const q = v(d.p), n = v(d.n), [x, y] = project(q, st, 2.4);
        const lam = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        const edge = Math.pow(1 - Math.abs(n[2]), 3);
        // ink on paper: the less light, the darker the dot
        dot(ctx, x, y, 1.5, clamp(0.08 + (1 - lam) * 0.75 + rim() * edge * 0.8, 0, 1));
      }
    });
  },
  // 06 · hiding the far side
  hide(el) {
    const dots = throwDots(mesh(rings(40, 24, 2.2)), 14000, true);
    const hide = control(el, 'w6-hide', (v) => (v ? 'on' : 'off'));
    stage(el, (st) => {
      const { ctx } = st, v = view(st.yaw, st.pitch);
      for (const d of dots) {
        const q = v(d.p), n = v(d.n), [x, y] = project(q, st, 2.4);
        const back = n[2] < 0;                                             // its normal points away from us
        if (hide() && back) continue;
        dot(ctx, x, y, 1.4, back ? 0.25 : 0.7, back ? '110,86,207' : INK);
      }
    });
  },
  // 07 · moving: a wave down the tail, and a jaw on a hinge
  move(el) {
    const dots = throwDots(mesh(rings(48, 28, 2.2)), 14000, true);
    dots.forEach((d) => { d.lower = d.p[1] < section(d.s, -0.15)[1]; });   // below the mouth line?
    const swim = control(el, 'w7-swim', (v) => v.toFixed(2)), mouth = control(el, 'w7-mouth', (v) => Math.round(v) + '°');
    const hinge = section(0.235, -0.15);
    const st = stage(el, (st) => {
      const { ctx } = st, v = view(st.yaw, st.pitch), a = -mouth() * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      for (const d of dots) {
        let [x, y, z] = d.p;
        // the jaw: the lower half of the head turns around the hinge at the corner of the mouth
        const k = d.lower ? 1 - smooth(0.205, 0.247, d.s) : 0;
        if (k > 0) { const dx = x - hinge[0], dy = y - hinge[1], c = Math.cos(a * k), s = Math.sin(a * k); x = hinge[0] + dx * c - dy * s; y = hinge[1] + dx * s + dy * c; }
        // the swim: a wave that grows toward the tail and runs backwards along the body
        const q = clamp((0.35 - x) / 1.45, 0, 1);
        y += swim() * 0.12 * q * q * Math.sin(st.t * 2.4 + 3.2 * x);
        const [sx, sy] = project(v([x, y, z]), st, 2.4);
        dot(ctx, sx, sy, 1.4, 0.7);
      }
    });
    st.yaw = 0.25;
  },
};
document.querySelectorAll('[data-demo]').forEach((el) => DEMOS[el.dataset.demo] && DEMOS[el.dataset.demo](el));
