// ASCII goldfish pond — line-art goldfish drawn with characters.
// Fins and tails are "hair" strands of characters that trail behind the body; the body is ))) scales.
// Effect contract: export function mount(el, options) -> cleanup()
// The returned cleanup function also carries controls: .setTheme(name), .setCount(n), .setFontSize(px), .getState()

const CONFIG = {
  fontSize: 11,          // px; character cell size follows from this
  count: 3,              // number of fish
  theme: 'light',        // 'light' | 'dark'
  maxCount: 9,
  water: true,           // faint drifting specks in the background
  fishScale: 0.26,       // body length as a fraction of min(viewport w, h)
  tiles: true,           // coloured square tiles behind body characters (daoho-style grid)
  finTile: 0.16,         // tile strength under fin strands (0 = lines only)
  rippleSpeed: 150,      // px / s
  rippleLife: 2.4,       // s
  foodLife: 24,          // s
  themes: {
    light: { bg: '#ffffff', deep: [176, 74, 22], pale: [236, 166, 112], eye: [16, 24, 32], ring: [110, 86, 207], speck: [16, 24, 32] },
    dark:  { bg: '#0c0c0d', deep: [196, 84, 26], pale: [255, 214, 172], eye: [255, 236, 214], ring: [255, 214, 172], speck: [255, 255, 255] },
  },
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rand = (a, b) => a + Math.random() * (b - a);

// Characters by brightness, used for body fill
const RAMP = ' .:-=+*#%';

export function mount(el, options = {}) {
  const o = { ...CONFIG, ...options, themes: CONFIG.themes };
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.touchAction = 'manipulation';
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1, cw = 0, chh = 0, cols = 0, rows = 0;
  let I, T, C, K;              // per-cell intensity, tone, char code, kind (0 ink, 1 eye, 2 speck, 3 ring, 4 eye highlight)
  let F, FT;                   // per-cell tile strength and tile tone (tone < 0 = pupil tile)
  let styles = null;
  let fish = [], ripples = [], food = [];
  let raf = 0, last = performance.now(), time = 0;

  /* ---------- grid ---------- */
  function layout() {
    const r = el.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cw = o.fontSize * 0.72; chh = o.fontSize * 0.94; // near-square cells so tiles read as a grid
    cols = Math.ceil(W / cw); rows = Math.ceil(H / chh);
    const n = cols * rows;
    I = new Float32Array(n); T = new Float32Array(n); C = new Uint16Array(n); K = new Uint8Array(n);
    F = new Float32Array(n); FT = new Float32Array(n);
    buildStyles();
    const L = Math.min(W, H) * o.fishScale;
    for (const f of fish) f.resize(L * f.sizeK);
    if (reduce) draw();
  }

  function buildStyles() {
    const th = o.themes[o.theme];
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    styles = { ink: [], onTile: [], eye: `rgb(${th.eye.join(',')})`, glint: `rgb(${th.pale.join(',')})`, ring: [], speck: [] };
    for (let t = 0; t < 12; t++) {
      const row = [];
      const c = mix(th.deep, th.pale, t / 11);
      for (let a = 0; a < 10; a++) row.push(`rgba(${c.join(',')},${((a + 1) / 10).toFixed(2)})`);
      styles.ink.push(row);
      const d = c.map((v) => Math.round(v * 0.52));
      styles.onTile.push(`rgb(${d.join(',')})`);
    }
    for (let a = 0; a < 10; a++) {
      styles.ring.push(`rgba(${th.ring.join(',')},${((a + 1) / 10).toFixed(2)})`);
      styles.speck.push(`rgba(${th.speck.join(',')},${((a + 1) / 10).toFixed(2)})`);
    }
    canvas.style.background = th.bg;
  }

  function put(x, y, ch, inten, tone, kind = 0, force = false) {
    const cx = Math.floor(x / cw), cy = Math.floor(y / chh);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    const i = cy * cols + cx;
    if (!force && inten <= I[i]) return;
    I[i] = inten; T[i] = tone; C[i] = ch.charCodeAt(0); K[i] = kind;
  }

  function tile(x, y, a, tone, force = false) {
    const cx = Math.floor(x / cw), cy = Math.floor(y / chh);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    const i = cy * cols + cx;
    if (!force && a <= F[i]) return;
    F[i] = a; FT[i] = tone;
  }

  // Character for a line segment, judged in cell units so diagonals land on / and \.
  function lineChar(dx, dy) {
    const a = Math.atan2(dy / chh, dx / cw) * 180 / Math.PI;
    const d = ((a % 180) + 180) % 180;
    if (d < 22.5 || d >= 157.5) return '-';
    if (d < 67.5) return '\\';
    if (d < 112.5) return '|';
    return '/';
  }

  function stroke(ax, ay, bx, by, inten, tone, kind = 0) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const step = Math.min(cw, chh) * 0.5;
    const n = Math.max(1, Math.ceil(len / step));
    const ch = lineChar(dx, dy);
    for (let s = 0; s <= n; s++) {
      const x = ax + dx * s / n, y = ay + dy * s / n;
      put(x, y, ch, inten, tone, kind);
      if (o.tiles && kind === 0 && o.finTile > 0) tile(x, y, inten * o.finTile, tone);
    }
  }

  /* ---------- fish ---------- */
  class Fish {
    constructor(L, sizeK, variant) {
      this.sizeK = sizeK; this.variant = variant;
      this.n = 14;
      this.x = rand(W * 0.2, W * 0.8); this.y = rand(H * 0.2, H * 0.8);
      this.ang = rand(-Math.PI, Math.PI);
      this.speed = 0; this.phase = rand(0, TAU);
      this.side = Math.cos(this.ang) >= 0 ? 1 : -1;
      this.target = null; this.retarget = 0; this.flee = 0; this.fleeAng = 0;
      this.resize(L, true);
    }
    resize(L, init = false) {
      this.L = L; this.seg = L / (this.n - 1);
      if (init || !this.spine) {
        this.spine = [];
        for (let i = 0; i < this.n; i++) this.spine.push({ x: this.x - Math.cos(this.ang) * this.seg * i, y: this.y - Math.sin(this.ang) * this.seg * i });
      }
      this.fins = buildFins(this);
      this.updateFins(0, true);
    }
    hw(u) { // half body height at u (0 = mouth, 1 = tail root)
      const p = u < 0.22 ? 0.62 + 0.38 * Math.sin((u / 0.22) * Math.PI / 2) : 1 - 0.82 * smooth((u - 0.38) / 0.62);
      return this.L * 0.36 * p;
    }
    frame(u) { // point, forward unit vector and dorsal unit vector at u
      const f = clamp(u, 0, 1) * (this.n - 1);
      const i = Math.min(this.n - 2, Math.floor(f)), t = f - i;
      const a = this.spine[i], b = this.spine[i + 1];
      let fx = a.x - b.x, fy = a.y - b.y; const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
      const s = this.side >= 0 ? 1 : -1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, fx, fy, dx: fy * s, dy: -fx * s };
    }
    update(dt) {
      const L = this.L, margin = L * 0.5;
      if (o.still) { // review mode: hold a side-view pose, only fins and a gentle tail wag move
        this.phase += dt * 2.2; this.side = 1;
        const k = fish.indexOf(this), n = fish.length;
        const hx = W * (0.5 + (n > 1 ? (k - (n - 1) / 2) * 0.28 : 0)) + L * 0.45, hy = H * (0.48 + (k % 2) * 0.08);
        for (let i = 0; i < this.n; i++) {
          const q = i / (this.n - 1);
          this.spine[i].x = hx - i * this.seg;
          this.spine[i].y = hy + Math.sin(this.phase - q * 2) * q * q * L * 0.05;
        }
        this.updateFins(dt);
        return;
      }
      let desired, want = L * 0.22;
      const head = this.spine[0];
      // food first
      let best = null, bd = Infinity;
      for (const p of food) { const d = Math.hypot(p.x - head.x, p.y - head.y); if (d < bd && d < Math.max(W, H) * 0.6) { bd = d; best = p; } }
      if (this.flee > 0) {
        this.flee -= dt; desired = this.fleeAng; want = L * 1.4;
      } else if (best) {
        desired = Math.atan2(best.y - head.y, best.x - head.x); want = L * 0.75;
        if (bd < L * 0.08) { food.splice(food.indexOf(best), 1); this.phase += 2; }
      } else {
        this.retarget -= dt;
        if (!this.target || this.retarget <= 0 || Math.hypot(this.target.x - head.x, this.target.y - head.y) < L * 0.3) {
          this.target = { x: rand(margin, Math.max(margin + 1, W - margin)), y: rand(margin * 0.7, Math.max(margin + 1, H - margin * 0.7)) };
          this.retarget = rand(4, 9);
        }
        desired = Math.atan2(this.target.y - head.y, this.target.x - head.x);
      }
      // keep apart
      for (const g of fish) if (g !== this) {
        const d = Math.hypot(g.spine[0].x - head.x, g.spine[0].y - head.y);
        if (d < L * 0.7) desired += wrap(Math.atan2(head.y - g.spine[0].y, head.x - g.spine[0].x) - desired) * 0.25 * (1 - d / (L * 0.7));
      }
      const turn = (best || this.flee > 0 ? 2.6 : 1.3) * dt;
      this.ang += clamp(wrap(desired - this.ang), -turn, turn);
      this.speed += (want - this.speed) * Math.min(1, dt * 1.5);
      this.phase += dt * (2.2 + this.speed / L * 6);
      const ha = this.ang + Math.sin(this.phase) * 0.16;
      head.x += Math.cos(ha) * this.speed * dt; head.y += Math.sin(ha) * this.speed * dt;
      // soft walls
      head.x = clamp(head.x, -L * 0.2, W + L * 0.2); head.y = clamp(head.y, -L * 0.2, H + L * 0.2);
      for (let i = 1; i < this.n; i++) {
        const a = this.spine[i - 1], b = this.spine[i];
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        b.x = a.x + dx / l * this.seg; b.y = a.y + dy / l * this.seg;
      }
      // turning around in side view: squash through 0 and flip
      const c = Math.cos(this.ang);
      const tgt = Math.abs(c) > 0.25 ? Math.sign(c) : (this.side >= 0 ? 1 : -1);
      this.side += (tgt - this.side) * Math.min(1, dt * 3);
      this.updateFins(dt);
    }
    updateFins(dt, init = false) {
      const sq = Math.max(Math.abs(this.side), 0.28);
      for (const fin of this.fins) {
        const fr = this.frame(fin.u);
        const h = this.hw(fin.u) * sq;
        const rx = fr.x + fr.dx * fin.v * h, ry = fr.y + fr.dy * fin.v * h;
        for (const s of fin.strands) {
          s.p[0].x = rx + fr.dx * s.off * h; s.p[0].y = ry + fr.dy * s.off * h;
          for (let k = 1; k < s.p.length; k++) {
            const q = k / (s.p.length - 1);
            const sway = Math.sin(time * fin.freq + this.phase * 0.6 - k * 0.45 + s.ph) * fin.sway * q;
            const a = s.a + s.curl * q + sway;
            // a is measured from "backwards" toward the dorsal side
            const bx = -fr.fx * Math.cos(a) + fr.dx * Math.sin(a) * sq;
            const by = -fr.fy * Math.cos(a) + fr.dy * Math.sin(a) * sq;
            const tx = s.p[k - 1].x + bx * s.seg, ty = s.p[k - 1].y + by * s.seg;
            const st = init ? 1 : Math.min(1, (0.55 - 0.42 * q) * dt * 60);
            s.p[k].x += (tx - s.p[k].x) * st; s.p[k].y += (ty - s.p[k].y) * st;
            const dx = s.p[k].x - s.p[k - 1].x, dy = s.p[k].y - s.p[k - 1].y, l = Math.hypot(dx, dy) || 1;
            s.p[k].x = s.p[k - 1].x + dx / l * s.seg; s.p[k].y = s.p[k - 1].y + dy / l * s.seg;
          }
        }
      }
    }
    drawFins(front) {
      for (const fin of this.fins) {
        if (!!fin.front !== front) continue;
        for (const s of fin.strands) {
          const n = s.p.length;
          for (let k = 1; k < n; k++) {
            const q = k / (n - 1);
            const inten = (1 - q * 0.62) * fin.inten;
            const tone = 0.35 + q * 0.6;
            if (k === n - 1) put(s.p[k].x, s.p[k].y, "'", inten * 0.8, tone);
            else stroke(s.p[k - 1].x, s.p[k - 1].y, s.p[k].x, s.p[k].y, inten, tone);
          }
        }
      }
    }
    drawBody() {
      const L = this.L, sq = Math.max(Math.abs(this.side), 0.28);
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const p of this.spine) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
      const pad = L * 0.32;
      const c0 = Math.max(0, Math.floor((minx - pad) / cw)), c1 = Math.min(cols - 1, Math.ceil((maxx + pad) / cw));
      const r0 = Math.max(0, Math.floor((miny - pad) / chh)), r1 = Math.min(rows - 1, Math.ceil((maxy + pad) / chh));
      const s = this.side >= 0 ? 1 : -1;
      const head = this.frame(0);
      const tailOnLeft = head.fx > 0; // head faces right → scales open to the left
      const scaleChar = tailOnLeft ? '(' : ')';
      const gillChar = tailOnLeft ? ')' : '(';
      const scale = Math.max(cw * 1.7, L * 0.065);
      const dark = this.variant === 'dark';
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const qx = (cx + 0.5) * cw, qy = (cy + 0.5) * chh;
        // nearest point on spine
        let bu = 0, bd = Infinity, blat = 0, balong = 0;
        for (let i = 0; i < this.n - 1; i++) {
          const a = this.spine[i], b = this.spine[i + 1];
          const ex = b.x - a.x, ey = b.y - a.y, ll = ex * ex + ey * ey || 1;
          let t = ((qx - a.x) * ex + (qy - a.y) * ey) / ll;
          const tc = i === 0 ? Math.max(t, -0.6) : clamp(t, 0, 1);
          const px = a.x + ex * tc, py = a.y + ey * tc;
          const d = Math.hypot(qx - px, qy - py);
          if (d < bd) {
            bd = d; bu = (i + tc) / (this.n - 1);
            const l = Math.sqrt(ll), fx = -ex / l, fy = -ey / l;
            const perp = ((qx - px) * fy - (qy - py) * fx) * s; // + = dorsal
            // beyond the end of the spine: use the true distance so points straight ahead of the mouth stay outside
            blat = t === tc ? perp : (perp >= 0 ? 1 : -1) * d;
            balong = bu * L;
          }
        }
        if (bu > 1) continue;
        const u = Math.max(bu, 0);
        const hh = this.hw(u) * (blat > 0 ? 1.08 : 0.92) * sq;
        let e = Math.abs(blat) / hh;
        if (balong < 0) { const ax = balong / (this.hw(0) * 0.55); e = Math.hypot(ax, e); }
        if (e > 1) continue;
        const vd = blat / hh; // -1 belly … +1 back
        const x = qx, y = qy;
        if (o.tiles) {
          const n = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;           // stable per-cell noise for a mottled look
          const jit = ((n % 1000) / 1000 - 0.5) * 0.22;
          const back = Math.max(0, vd), belly = Math.max(0, -vd);
          const tTone = dark ? clamp(0.05 + belly * 0.55 + jit, 0, 1) : clamp(0.32 - back * 0.25 + belly * 0.62 + jit + (u < 0.26 ? 0.08 : 0), 0, 1);
          const tA = (dark ? 0.75 : 0.92) * (1 - smooth((u - 0.86) / 0.14) * 0.6) * (e > 0.9 ? 0.55 : 1);
          tile(x, y, tA, tTone, true);
        }
        // eye
        const ex = L * 0.11, ey = 0.2, er = L * 0.065;
        const de = Math.hypot((balong - ex) / er, (vd - ey) * hh / er);
        if (de < 0.5) { if (o.tiles) { tile(x, y, 1, -1, true); put(x, y, 'o', 1, 0, 4, true); } else put(x, y, '@', 1, 0, 1, true); continue; }
        if (de < 1.1) { put(x, y, de < 0.8 ? ' ' : lineChar(-(vd - ey) * hh, balong - ex), de < 0.8 ? 0.05 : 1, 0.95, 0, true); continue; }
        if (e > 0.86) { // outline
          const ang = balong < this.hw(0) * 0.3 ? Math.atan2(-vd, Math.max(0.2, -balong / L * 6 + 0.5)) : 0;
          const tf = Math.cos(ang), tl = Math.sin(ang);
          const fr = this.frame(u);
          const wx = fr.fx * tf + fr.dx * tl * Math.sign(vd || 1), wy = fr.fy * tf + fr.dy * tl * Math.sign(vd || 1);
          put(x, y, lineChar(wx, wy), 0.95, 0.4 + (vd < 0 ? 0.35 : 0), 0, true);
          continue;
        }
        const back = Math.max(0, vd), belly = Math.max(0, -vd);
        if (balong < L * 0.26) { // head: smooth shading, gill arc at the back of the head
          if (Math.abs(balong - L * 0.25) < cw * 0.7 && Math.abs(vd) < 0.8) { put(x, y, gillChar, 0.95, 0.35, 0, true); continue; }
          const shade = clamp(0.7 - belly * 0.5 + back * 0.2, 0, 1);
          if (((cx * 5 + cy * 11) % 4) / 4 > shade + 0.2) continue;
          put(x, y, '.:;'[Math.floor(shade * 2.99)], 0.85, dark ? 0.15 + belly * 0.5 : 0.3 + belly * 0.6, 0, true);
          continue;
        }
        // scales: staggered rows of ( or )
        const su = (balong - L * 0.26) / scale;
        const row = Math.floor((vd * hh) / scale + 100);
        const fu = (su + (row % 2) * 0.5) % 1;
        const fv = ((vd * hh) / scale + 100) % 1;
        const r = Math.hypot(fu - 0.15, (fv - 0.5) * 0.9);
        const tail = smooth((u - 0.8) / 0.2);
        if (r > 0.42 && r < 0.62 && fu > 0.3) {
          put(x, y, scaleChar, (dark ? 0.75 : 0.95) * (1 - tail * 0.4), dark ? 0.55 + belly * 0.4 : 0.45 + belly * 0.45, 0, true);
        } else {
          // sparse fill: dense dots on the back, fading to empty toward the belly
          const shade = dark ? clamp(0.9 - belly * 0.6, 0, 1) : clamp(0.55 + back * 0.4 - belly * 0.5, 0, 1);
          if (((cx * 7 + cy * 13) % 5) / 5 > shade) continue;
          const ch = RAMP[1 + Math.floor(shade * 2.99)];
          put(x, y, ch, (dark ? 0.5 : 0.6) * (1 - tail * 0.5), dark ? 0.02 + belly * 0.4 : 0.15 + belly * 0.6, 0, true);
        }
      }
    }
  }

  function buildFins(f) {
    const L = f.L;
    const fan = (opts) => {
      const strands = [];
      for (let i = 0; i < opts.count; i++) {
        const q = opts.count === 1 ? 0.5 : i / (opts.count - 1);
        const a = opts.a0 + (opts.a1 - opts.a0) * q;
        const len = L * (opts.len(q));
        const segs = opts.segs || 10;
        const p = []; for (let k = 0; k < segs + 1; k++) p.push({ x: f.spine[0].x, y: f.spine[0].y });
        strands.push({ a, curl: opts.curl(q), seg: len / segs, ph: rand(0, 1) + q * 1.5, off: (opts.off || 0) * (q - 0.5), p });
      }
      return { u: opts.u, v: opts.v, front: opts.front, sway: opts.sway, freq: opts.freq, inten: opts.inten ?? 1, strands };
    };
    const D = Math.PI / 180;
    return [
      // tail: two lobes, long outer rays, short middle (forked fan tail)
      fan({ u: 1, v: 0, count: 32, a0: 70 * D, a1: -64 * D, off: 0.6, segs: 14,
        len: (q) => 0.6 + 0.85 * Math.pow(Math.abs(q - 0.5) * 2, 0.7), curl: (q) => -0.75 + (0.5 - q) * 0.5, sway: 0.5, freq: 2.0 }),
      // dorsal fin
      fan({ u: 0.34, v: 0.97, count: 14, a0: 84 * D, a1: 22 * D, segs: 10,
        len: (q) => 0.34 + 0.26 * Math.sin(q * Math.PI), curl: () => -0.9, sway: 0.3, freq: 1.7 }),
      // anal fins (long, trailing)
      fan({ u: 0.82, v: -0.8, count: 10, a0: -24 * D, a1: -64 * D, segs: 11,
        len: (q) => 0.4 + 0.2 * q, curl: () => 0.55, sway: 0.4, freq: 1.9 }),
      // pelvic
      fan({ u: 0.5, v: -0.95, count: 8, a0: -50 * D, a1: -88 * D, segs: 9,
        len: () => 0.34, curl: () => 0.6, sway: 0.35, freq: 2.4 }),
      // pectoral (in front of the body)
      fan({ u: 0.3, v: -0.35, count: 7, a0: -30 * D, a1: -70 * D, segs: 7, front: true, inten: 0.9,
        len: () => 0.24, curl: () => 0.35, sway: 0.4, freq: 3 }),
    ];
  }

  function syncCount() {
    const L = Math.min(W, H) * o.fishScale;
    const sizes = [1, 0.74, 0.68, 0.82, 0.62, 0.9, 0.7, 0.78, 0.66];
    while (fish.length < o.count) {
      const k = fish.length;
      fish.push(new Fish(L * sizes[k % sizes.length], sizes[k % sizes.length], k === 1 ? 'dark' : 'gold'));
    }
    while (fish.length > o.count) fish.pop();
  }

  /* ---------- interaction ---------- */
  let lastTap = { t: 0, x: 0, y: 0 };
  function onDown(ev) {
    const r = el.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    ripples.push({ x, y, age: 0 });
    for (const f of fish) {
      const d = Math.hypot(f.spine[0].x - x, f.spine[0].y - y);
      if (d < f.L * 1.1) { f.flee = 0.9; f.fleeAng = Math.atan2(f.spine[0].y - y, f.spine[0].x - x); }
    }
    const now = performance.now();
    if (now - lastTap.t < 350 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
      for (let i = 0; i < 8; i++) food.push({ x: x + rand(-30, 30), y: y + rand(-24, 24), vx: rand(-6, 6), vy: rand(2, 8), age: 0, wob: rand(0, TAU) });
      for (const f of fish) f.flee = 0; // food wins over fright
      lastTap.t = 0;
    } else lastTap = { t: now, x, y };
    if (reduce) draw();
  }

  /* ---------- frame ---------- */
  function draw() {
    I.fill(0); F.fill(0);
    const th = o.themes[o.theme];
    // water specks
    if (o.water) {
      for (let cy = 0; cy < rows; cy += 2) for (let cx = (cy / 2) % 3; cx < cols; cx += 3) {
        const v = Math.sin(cx * 0.21 + time * 0.35) * Math.sin(cy * 0.17 - time * 0.27) + Math.sin((cx + cy) * 0.05 + time * 0.2) * 0.35;
        if (v > 0.9) put((cx + 0.5) * cw, (cy + 0.5) * chh, '.', (v - 0.9) * 0.9, 0, 2);
      }
    }
    // ripples: two ASCII rings
    for (const rp of ripples) {
      const life = 1 - rp.age / o.rippleLife;
      for (const k of [1, 0.62]) {
        const R = rp.age * o.rippleSpeed * k + 4;
        const n = Math.max(12, Math.ceil(TAU * R / (Math.min(cw, chh) * 0.6)));
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU;
          put(rp.x + Math.cos(a) * R, rp.y + Math.sin(a) * R * 0.6, lineChar(-Math.sin(a), Math.cos(a) * 0.6), life * 0.55 * k, 0, 3);
        }
      }
    }
    for (const p of food) put(p.x, p.y, 'o', Math.min(1, (o.foodLife - p.age) / 3), 0.1, 0);
    for (const f of fish) f.drawFins(false);
    for (const f of fish) f.drawBody();
    for (const f of fish) f.drawFins(true);

    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
    ctx.font = `${o.fontSize}px "DM Mono", ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'top';
    if (o.tiles) {
      for (let i = 0, n = cols * rows; i < n; i++) {
        const a = F[i]; if (a < 0.03) continue;
        ctx.fillStyle = FT[i] < 0 ? styles.eye : styles.ink[Math.min(11, Math.floor(FT[i] * 11.99))][Math.min(9, Math.floor(a * 10))];
        ctx.fillRect((i % cols) * cw + 0.5, Math.floor(i / cols) * chh + 0.5, cw - 1, chh - 1);
      }
    }
    for (let i = 0, n = cols * rows; i < n; i++) {
      const v = I[i]; if (v < 0.04) continue;
      if (o.tiles && F[i] > 0.4 && K[i] === 0) {
        ctx.fillStyle = styles.onTile[Math.min(11, Math.floor(FT[i] * 11.99))];
        ctx.fillText(String.fromCharCode(C[i]), (i % cols) * cw + cw * 0.08, Math.floor(i / cols) * chh + chh * 0.02);
        continue;
      }
      const a = Math.min(9, Math.floor(v * 10));
      const k = K[i];
      ctx.fillStyle = k === 4 ? styles.glint : k === 1 ? styles.eye : k === 2 ? styles.speck[Math.min(2, a)] : k === 3 ? styles.ring[a] : styles.ink[Math.min(11, Math.floor(T[i] * 11.99))][a];
      ctx.fillText(String.fromCharCode(C[i]), (i % cols) * cw, Math.floor(i / cols) * chh);
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    for (const f of fish) f.update(dt);
    for (const rp of ripples) rp.age += dt;
    ripples = ripples.filter((r) => r.age < o.rippleLife);
    for (const p of food) { p.age += dt; p.wob += dt; p.x += (p.vx + Math.sin(p.wob) * 4) * dt; p.y += p.vy * dt; p.vx *= 0.98; }
    food = food.filter((p) => p.age < o.foodLife && p.y < H + 10);
    draw();
    raf = requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(layout);
  ro.observe(el);
  layout();
  syncCount();
  el.addEventListener('pointerdown', onDown);
  if (reduce) draw(); else raf = requestAnimationFrame((t) => { last = t; loop(t); });

  const cleanup = () => {
    cancelAnimationFrame(raf); ro.disconnect();
    el.removeEventListener('pointerdown', onDown);
    canvas.remove();
  };
  cleanup.setTheme = (name) => { o.theme = name; buildStyles(); if (reduce) draw(); };
  cleanup.setCount = (n) => { o.count = clamp(Math.round(n), 1, o.maxCount); syncCount(); if (reduce) draw(); return o.count; };
  cleanup.setFontSize = (px) => { o.fontSize = clamp(px, 6, 28); layout(); };
  cleanup.getState = () => ({ theme: o.theme, count: o.count, fontSize: o.fontSize });
  return cleanup;
}
