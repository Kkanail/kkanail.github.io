// Live demos for "How to draw a swimming goldfish with text".
// Each step mounts a small canvas. Steps 4–7 share one MiniFish and switch features on one at a time.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rand = (a, b) => a + Math.random() * (b - a);
const FONT = '"DM Mono", ui-monospace, Menlo, monospace';
const INK = '#101820', MUTE = '#a3a3a3', ACCENT = '#6e56cf', LINE = '#e3e3e3';
const RAMP = [[196, 40, 28], [234, 104, 36], [246, 236, 228]]; // red → orange → white
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ramp(t, a = 1) {
  t = clamp(t, 0, 1);
  const [p, q, u] = t < 0.45 ? [RAMP[0], RAMP[1], t / 0.45] : [RAMP[1], RAMP[2], (t - 0.45) / 0.55];
  return `rgba(${p.map((v, i) => Math.round(v + (q[i] - v) * u)).join(',')},${a})`;
}

/* ---------- a canvas + character grid that redraws every frame ---------- */
function stage(el, opts = {}) {
  const box = el.querySelector('.demo-canvas');
  const canvas = document.createElement('canvas');
  box.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const s = { fs: opts.fs || 12, square: !!opts.square, W: 0, H: 0, cw: 0, ch: 0, cols: 0, rows: 0,
    pointer: { x: 0, y: 0, active: false }, time: 0, chars: [], colors: [], tiles: [] };
  s.layout = () => {
    const r = box.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    s.W = r.width; s.H = r.height;
    canvas.width = Math.round(s.W * dpr); canvas.height = Math.round(s.H * dpr);
    canvas.style.width = s.W + 'px'; canvas.style.height = s.H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.cw = s.fs * (s.square ? 0.72 : 0.62); s.ch = s.fs * (s.square ? 0.94 : 1.1);
    s.cols = Math.ceil(s.W / s.cw); s.rows = Math.ceil(s.H / s.ch);
  };
  s.clear = () => { s.chars = new Array(s.cols * s.rows).fill(''); s.colors = new Array(s.cols * s.rows); s.tiles = new Array(s.cols * s.rows); };
  s.cell = (x, y) => { const cx = Math.floor(x / s.cw), cy = Math.floor(y / s.ch); return cx < 0 || cy < 0 || cx >= s.cols || cy >= s.rows ? -1 : cy * s.cols + cx; };
  s.put = (x, y, ch, color = INK) => { const i = s.cell(x, y); if (i >= 0) { s.chars[i] = ch; s.colors[i] = color; } };
  s.tile = (x, y, color) => { const i = s.cell(x, y); if (i >= 0) s.tiles[i] = color; };
  s.render = () => {
    ctx.clearRect(0, 0, s.W, s.H);
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i]) { ctx.fillStyle = s.tiles[i]; ctx.fillRect((i % s.cols) * s.cw + 0.5, Math.floor(i / s.cols) * s.ch + 0.5, s.cw - 1, s.ch - 1); }
    ctx.font = `${s.fs}px ${FONT}`; ctx.textBaseline = 'top';
    for (let i = 0; i < s.chars.length; i++) if (s.chars[i]) { ctx.fillStyle = s.colors[i]; ctx.fillText(s.chars[i], (i % s.cols) * s.cw + s.cw * 0.06, Math.floor(i / s.cols) * s.ch); }
  };
  // where the "finger" is: the real pointer, or a slow automatic wander when nobody is pointing
  s.target = () => {
    if (s.pointer.active) return { x: s.pointer.x, y: s.pointer.y };
    const t = s.time;
    return { x: s.W * (0.5 + 0.34 * Math.sin(t * 0.6)), y: s.H * (0.5 + 0.3 * Math.sin(t * 0.9 + 1)) };
  };
  box.addEventListener('pointermove', (e) => { const r = box.getBoundingClientRect(); s.pointer = { x: e.clientX - r.left, y: e.clientY - r.top, active: true }; if (reduce) s.frame(0); });
  box.addEventListener('pointerleave', () => { s.pointer.active = false; });
  s.onFrame = (fn) => {
    s.frame = (dt) => { s.time += dt; s.clear(); fn(dt); s.render(); };
    let raf = 0, last = 0, visible = false;
    const loop = (now) => { const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; s.frame(dt); if (visible) raf = requestAnimationFrame(loop); };
    new IntersectionObserver(([en]) => { // only animate demos that are on screen
      visible = en.isIntersecting && !reduce;
      if (visible) { last = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    }).observe(box);
    new ResizeObserver(() => { s.layout(); s.frame(0); }).observe(box);
  };
  s.layout();
  return s;
}

// character for a line segment, judged in cell units so diagonals land on / and \
function lineChar(s, dx, dy) {
  const d = (((Math.atan2(dy / s.ch, dx / s.cw) * 180 / Math.PI) % 180) + 180) % 180;
  return d < 22.5 || d >= 157.5 ? '-' : d < 67.5 ? '\\' : d < 112.5 ? '|' : '/';
}

// read a slider / checkbox inside a demo and show its value
function control(el, id, fmt = (v) => v) {
  const input = el.querySelector('#' + id);
  const out = el.querySelector(`output[for="${id}"]`);
  const read = () => (input.type === 'checkbox' ? input.checked : Number(input.value));
  const show = () => { if (out) out.textContent = fmt(read()); };
  input.addEventListener('input', show); show();
  return read;
}

/* ---------- step 1: a dot that moves ---------- */
function step1(el) {
  const s = stage(el); const speed = control(el, 's1-speed', (v) => `${v} px/s`);
  let x = 20;
  s.onFrame((dt) => {
    x += speed() * dt;                      // distance = speed × time
    if (x > s.W - 10) x = 10;
    s.put(x, s.H / 2, 'o', ACCENT);
    const label = `dt = ${(dt * 1000).toFixed(0)} ms`;
    for (let k = 0; k < label.length; k++) s.put(12 + k * s.cw, 14, label[k], MUTE);
  });
}

/* ---------- step 2: the character grid ---------- */
function step2(el) {
  const s = stage(el); const size = control(el, 's2-size', (v) => `${v}px`);
  el.querySelector('#s2-size').addEventListener('input', () => { s.fs = size(); s.layout(); });
  s.onFrame(() => {
    const t = s.target();
    for (let cy = 0; cy < s.rows; cy++) for (let cx = 0; cx < s.cols; cx++) {
      const x = (cx + 0.5) * s.cw, y = (cy + 0.5) * s.ch;
      const d = Math.hypot(x - t.x, y - t.y);
      const ch = d < 24 ? '@' : d < 48 ? 'o' : d < 76 ? ':' : '.';
      s.put(x, y, ch, d < 76 ? ACCENT : LINE);
    }
  });
}

/* ---------- step 3: a chain that follows ---------- */
function step3(el) {
  const s = stage(el);
  const seg = control(el, 's3-seg', (v) => `${v}px`), count = control(el, 's3-count');
  let pts = [];
  s.onFrame((dt) => {
    while (pts.length < count()) pts.push({ x: s.W / 2, y: s.H / 2 });
    pts.length = count();
    const t = s.target();
    pts[0].x += (t.x - pts[0].x) * Math.min(1, dt * 6);   // the head eases toward the target
    pts[0].y += (t.y - pts[0].y) * Math.min(1, dt * 6);
    for (let i = 1; i < pts.length; i++) {                  // every point follows the one in front
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      b.x = a.x + dx / l * seg(); b.y = a.y + dy / l * seg();
    }
    pts.forEach((p, i) => s.put(p.x, p.y, i === 0 ? '@' : 'o', i === 0 ? ACCENT : INK));
  });
}

/* ---------- steps 4–7: the mini goldfish ---------- */
class MiniFish {
  constructor(s, o) {
    this.s = s; this.o = o; this.n = 12; this.L = Math.min(s.W * 0.5, s.H * 1.1) * 0.5; this.seg = this.L / (this.n - 1);
    this.ang = 0; this.target = null;
    this.spine = Array.from({ length: this.n }, (_, i) => ({ x: s.W * 0.55 - i * this.seg, y: s.H / 2 }));
    this.fins = o.fins ? [1, -1].map((side) => ({ side, strands: Array.from({ length: 10 }, (_, j) => ({
      a: (6 + j * 7.5) * Math.PI / 180, len: this.L * (0.55 + 0.35 * Math.sin(j / 9 * Math.PI * 0.85)), ph: Math.random(),
      p: Array.from({ length: 9 }, () => ({ x: this.spine[0].x, y: this.spine[0].y })) })) })) : [];
    this.seed = rand(0, 50);
  }
  // half body width: rounded head, widest a third of the way back, narrow where the tail starts
  hw(u) { const front = u < 0.3 ? 0.7 + 0.3 * Math.sin(u / 0.3 * Math.PI / 2) : 1; return this.L * (this.o.fat ? this.o.fat() : 0.3) * front * (1 - 0.82 * Math.pow(smooth((u - 0.46) / 0.54), 0.8)); }
  frame(u) {
    const f = clamp(u * 0.75, 0, 1) * (this.n - 1), i = Math.min(this.n - 2, Math.floor(f)), t = f - i;
    const a = this.spine[i], b = this.spine[i + 1]; let fx = a.x - b.x, fy = a.y - b.y; const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, fx, fy, lx: fy, ly: -fx };
  }
  update(dt) {
    const s = this.s, head = this.spine[0], o = this.o;
    let tx, ty;
    if (o.wander) { // step 5: pick a random spot, swim there, pick another
      if (!this.target || Math.hypot(this.target.x - head.x, this.target.y - head.y) < this.L * 0.35)
        this.target = { x: rand(this.L * 0.5, s.W - this.L * 0.5), y: rand(this.L * 0.4, s.H - this.L * 0.4) };
      ({ x: tx, y: ty } = this.target);
    } else { // follow the pointer, but keep the whole fish inside the box
      const t = s.target(), m = this.L * 0.6;
      tx = clamp(t.x, m, s.W - m); ty = clamp(t.y, m * 0.7, s.H - m * 0.7);
    }
    const desired = Math.atan2(ty - head.y, tx - head.x);
    const turn = (o.turn ? o.turn() : 2) * dt;
    this.ang += clamp(wrap(desired - this.ang), -turn, turn);           // turn, but only so fast
    const speed = o.wander ? this.L * 0.9 : Math.min(this.L * 1.2, Math.hypot(tx - head.x, ty - head.y) * 1.5);
    head.x += Math.cos(this.ang) * speed * dt; head.y += Math.sin(this.ang) * speed * dt;
    const maxBend = (o.bend ? o.bend() : 8) * Math.PI / 180;
    for (let i = 1; i < this.n; i++) {                                    // follow the leader, with a bend limit
      const a = this.spine[i - 1], b = this.spine[i];
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (i >= 2) { const pr = this.spine[i - 2], prev = Math.atan2(a.y - pr.y, a.x - pr.x); ang = prev + clamp(wrap(ang - prev), -maxBend, maxBend); }
      b.x = a.x + Math.cos(ang) * this.seg; b.y = a.y + Math.sin(ang) * this.seg;
    }
    if (o.wander && o.showTarget !== false) s.put(this.target.x, this.target.y, 'x', ACCENT);
    this.updateFins(dt);
  }
  updateFins(dt) {
    const fr = this.frame(1), lag = this.o.lag ? this.o.lag() : 0.35, rigid = this.o.rigid ? this.o.rigid() : true;
    for (const fin of this.fins) for (const st of fin.strands) {
      st.p[0].x = fr.x; st.p[0].y = fr.y;
      for (let k = 1; k < st.p.length; k++) {
        const q = k / (st.p.length - 1);
        const a = (st.a + 0.5 * q) * fin.side + Math.sin(this.s.time * 2 - k * 0.5 + st.ph) * 0.35 * q;
        const bx = -fr.fx * Math.cos(a) + fr.lx * Math.sin(a), by = -fr.fy * Math.cos(a) + fr.ly * Math.sin(a);
        const seg = st.len / (st.p.length - 1);
        const tx = st.p[k - 1].x + bx * seg, ty = st.p[k - 1].y + by * seg;
        const follow = rigid && q < 0.3 ? 1 : Math.min(1, lag * (1 - 0.7 * q) * dt * 60); // slower toward the tip
        st.p[k].x += (tx - st.p[k].x) * follow; st.p[k].y += (ty - st.p[k].y) * follow;
        const dx = st.p[k].x - st.p[k - 1].x, dy = st.p[k].y - st.p[k - 1].y, l = Math.hypot(dx, dy) || 1;
        st.p[k].x = st.p[k - 1].x + dx / l * seg; st.p[k].y = st.p[k - 1].y + dy / l * seg;
      }
    }
  }
  draw() {
    const s = this.s, o = this.o, L = this.L;
    // fins first, so the body covers their roots
    for (const fin of this.fins) for (const st of fin.strands) for (let k = 1; k < st.p.length; k++) {
      const a = st.p[k - 1], b = st.p[k], q = k / (st.p.length - 1), ch = lineChar(s, b.x - a.x, b.y - a.y);
      for (let m = 0; m <= 3; m++) {
        const x = a.x + (b.x - a.x) * m / 3, y = a.y + (b.y - a.y) * m / 3;
        s.put(x, y, ch, o.color ? ramp(0.35 + q * 0.55, 1 - q * 0.4) : INK);
        if (o.tiles) s.tile(x, y, ramp(0.35 + q * 0.6, 0.35 * (1 - q * 0.5)));
      }
    }
    if (o.spineOnly) { this.spine.forEach((p, i) => s.put(p.x, p.y, i ? 'o' : '@', i ? INK : ACCENT)); return; }
    const scale = Math.max(s.cw * 1.6, L * 0.07);
    const tailX = -this.frame(0.5).fx;
    for (let cy = 0; cy < s.rows; cy++) for (let cx = 0; cx < s.cols; cx++) {
      const x = (cx + 0.5) * s.cw, y = (cy + 0.5) * s.ch;
      // 1. which point on the spine is closest, and how far to the side are we?
      let bu = 0, bd = Infinity, lat = 0;
      for (let i = 0; i < this.n - 1; i++) {
        const a = this.spine[i], b = this.spine[i + 1], ex = b.x - a.x, ey = b.y - a.y, ll = ex * ex + ey * ey;
        const raw = ((x - a.x) * ex + (y - a.y) * ey) / ll;
        const t = clamp(raw, i === 0 ? -0.6 : 0, 1);
        const px = a.x + ex * t, py = a.y + ey * t, d = Math.hypot(x - px, y - py);
        if (d < bd) {
          bd = d; bu = (i + t) / (this.n - 1);
          const perp = ((x - px) * -ey + (y - py) * ex) / Math.sqrt(ll);
          lat = raw === t ? perp : Math.sign(perp || 1) * d; // past either end of the spine: use the real distance
        }
      }
      // 2. body coordinates: u = 0 at the snout … 1 where the tail starts, v = −1 … 1 across
      const ub = bu / 0.75, u = clamp(ub, 0, 1);
      let e = Math.abs(lat) / this.hw(u);
      if (ub < 0) e = Math.hypot(ub * L * 0.75 / (this.hw(0) * 0.7), e);
      if (ub > 1) e = Math.hypot((ub - 1) * L * 0.75 / (this.hw(1) * 1.1), e);
      if (e > 1) continue;
      // 3. decide what this cell looks like from (u, v)
      if (o.showUV) { s.put(x, y, String(Math.min(9, Math.floor(u * 10))), ACCENT); continue; }
      const eye = Math.hypot(u - 0.11, Math.abs(lat) / this.hw(0.11) - 0.7);
      if (eye < 0.08) { if (o.tiles) s.tile(x, y, INK); s.put(x, y, o.tiles ? '' : '@', o.tiles ? '#fff' : INK); if (o.tiles) s.put(x, y, 'o', '#fff'); continue; }
      if (!o.color) { s.put(x, y, e > 0.85 ? '#' : u < 0.25 ? '%' : '*', INK); continue; }
      const patch = Math.sin(u * 7 + this.seed) * Math.cos(lat / L * 9 + this.seed) > 0.25;
      const tone = patch ? 0.95 : 0.1 + u * 0.3;
      if (o.tiles) s.tile(x, y, ramp(tone, 0.95));
      const onTile = o.tiles ? (tone > 0.8 ? '#c4a896' : 'rgba(60,20,10,.8)') : ramp(tone);
      if (e > 0.88) { s.put(x, y, lineChar(s, this.frame(u).fx, this.frame(u).fy), onTile); continue; }
      const along = u * L * 0.75 - L * 0.2, row = Math.floor(lat / scale + 100);
      const fu = ((along / scale + (row % 2) * 0.5) % 1 + 1) % 1, fv = (lat / scale + 100) % 1;
      const r = Math.hypot(fu - 0.15, (fv - 0.5) * 0.9);
      if (o.scales && u > 0.25 && r > 0.4 && r < 0.62 && fu > 0.3) s.put(x, y, tailX < 0 ? '(' : ')', onTile);
      else s.put(x, y, o.tiles ? '.' : ':', onTile);
    }
  }
}

function fishStep(el, opts) {
  const s = stage(el, { fs: 11, square: !!opts.square });
  let fish = null;
  s.onFrame((dt) => {
    if (!fish || fish.Wseen !== s.W) { fish = new MiniFish(s, opts); fish.Wseen = s.W; }
    fish.update(dt); fish.draw();
  });
}

function step4(el) { fishStep(el, { showUVBox: true, fat: control(el, 's4-fat', (v) => v.toFixed(2)), get showUV() { return el.querySelector('#s4-uv').checked; } }); control(el, 's4-uv', (v) => (v ? 'on' : 'off')); }
function step4b(el) { fishStep(el, { spineOnly: true }); }
function step5(el) { fishStep(el, { wander: true, turn: control(el, 's5-turn', (v) => `${v.toFixed(1)} rad/s`), bend: control(el, 's5-bend', (v) => `${v}°`) }); }
function step6(el) { fishStep(el, { fins: true, lag: control(el, 's6-lag', (v) => v.toFixed(2)), rigid: control(el, 's6-rigid', (v) => (v ? 'on' : 'off')) }); }
function step7(el) {
  fishStep(el, { fins: true, color: true, square: true, get tiles() { return el.querySelector('#s7-tiles').checked; }, get scales() { return el.querySelector('#s7-scales').checked; } });
  control(el, 's7-tiles', (v) => (v ? 'on' : 'off')); control(el, 's7-scales', (v) => (v ? 'on' : 'off'));
}
async function step8(el) {
  const { mount } = await import('/assets/js/effects/goldfish.js');
  const box = el.querySelector('.demo-canvas');
  let pond = null;
  new IntersectionObserver(([en]) => { // the full pond is heavier: only run it while it is on screen
    if (en.isIntersecting && !pond) pond = mount(box, { count: 3, fontSize: 9, fishScale: 0.34 });
    else if (!en.isIntersecting && pond) { pond(); pond = null; }
  }).observe(box);
}

const STEPS = { step1, step2, step3, step4, step4b, step5, step6, step7, step8 };
document.querySelectorAll('[data-demo]').forEach((el) => STEPS[el.dataset.demo](el));
