// ASCII goldfish pond — fancy goldfish seen from above, drawn on a character grid.
// Bodies are coloured tiles with characters on top (scales, wen bumps, eyes); fins and tails are
// strands of line characters that trail behind and sway.
// Effect contract: export function mount(el, options) -> cleanup()
// The returned cleanup function also carries controls: .setTheme(name), .setCount(n), .setFontSize(px), .getState()

const CONFIG = {
  fontSize: 11,          // px; character cell size follows from this
  count: 3,              // number of fish
  theme: 'light',        // 'light' | 'dark'
  maxCount: 9,
  still: false,          // review mode: fish hold position, only fins move
  water: true,           // faint drifting specks in the background
  fishScale: 0.22,       // body length (head to tail root) as a fraction of min(viewport w, h)
  finTile: 0.45,         // tile strength under fin strands (0 = lines only)
  shadow: 0.9,           // strength of the shadow each fish casts (0 = none)
  rippleSpeed: 150,      // px / s
  rippleWave: 24,        // px between ripple crests
  rippleLife: 2.4,       // s
  foodLife: 24,          // s
  // One colour ramp per theme: tone 0 = red, 0.45 = orange, 1 = white
  themes: {
    light: { bg: '#ffffff', stops: [[196, 40, 28], [234, 104, 36], [246, 236, 228]], eye: [16, 24, 32], glint: [255, 255, 255], ring: [150, 156, 162], speck: [16, 24, 32],
             shade: [16, 24, 32], shadeA: 0.16, waveDark: [96, 104, 112], waveDarkA: 0.22, waveLight: [255, 255, 255], waveLightA: 0.85 },
    dark:  { bg: '#0c0c0d', stops: [[214, 48, 30], [244, 120, 44], [252, 244, 236]], eye: [8, 8, 9], glint: [255, 255, 255], ring: [200, 200, 204], speck: [255, 255, 255],
             shade: [0, 0, 0], shadeA: 0.6, waveDark: [0, 0, 0], waveDarkA: 0.45, waveLight: [255, 255, 255], waveLightA: 0.3 },
  },
};

// Three fancy goldfish, from the reference photos
const VARIANTS = [
  { name: 'oranda',    wen: true,  bubbleEyes: false, dorsal: true, body: (n) => 0.38 + n * 0.12,                    tailBase: 0.32, tailTip: 0.82 },
  { name: 'telescope', wen: false, bubbleEyes: true,  dorsal: true, body: (n) => (n > 0.15 ? 0.05 + n * 0.1 : 0.96), tailBase: 0.12, tailTip: 0.9, tailWhite: true },
  { name: 'ryukin',    wen: false, bubbleEyes: false, dorsal: true, body: (n) => (n > -0.45 ? 0.45 + n * 0.1 : 0.95), tailBase: 0.4, tailTip: 0.85 },
];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rand = (a, b) => a + Math.random() * (b - a);
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;

export function mount(el, options = {}) {
  const o = { ...CONFIG, ...options, themes: CONFIG.themes };
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.touchAction = 'manipulation';
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1, cw = 0, chh = 0, cols = 0, rows = 0;
  let I, T, C, K;   // per-cell char intensity, tone, char code, kind (0 ink, 1 pupil, 2 speck, 3 ring, 4 glint)
  let F, FT;        // per-cell tile strength and tile tone (tone < 0 = pupil tile)
  let Z, S, RW, RG; // per-cell owner (fish index + 1), shadow strength, ripple light / dark
  let curZ = 0, touched = [];
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
    Z = new Uint8Array(n); S = new Float32Array(n); RW = new Float32Array(n); RG = new Float32Array(n);
    buildStyles();
    const L = Math.min(W, H) * o.fishScale;
    for (const f of fish) f.resize(L * f.sizeK);
    if (reduce) draw();
  }

  function rampColor(stops, t) {
    t = clamp(t, 0, 1);
    const [a, b, u] = t < 0.45 ? [stops[0], stops[1], t / 0.45] : [stops[1], stops[2], (t - 0.45) / 0.55];
    return a.map((v, i) => Math.round(v + (b[i] - v) * u));
  }

  function buildStyles() {
    const th = o.themes[o.theme];
    styles = { ink: [], onTile: [], eye: `rgb(${th.eye.join(',')})`, glint: `rgb(${th.glint.join(',')})`, ring: [], speck: [] };
    for (let t = 0; t < 16; t++) {
      const c = rampColor(th.stops, t / 15);
      const row = [];
      for (let a = 0; a < 10; a++) row.push(`rgba(${c.join(',')},${((a + 1) / 10).toFixed(2)})`);
      styles.ink.push(row);
      // characters on a tile: a darker shade of the tile colour (white tiles get a warm grey)
      const d = t / 15 > 0.8 ? [196, 168, 150] : c.map((v) => Math.round(v * 0.55));
      styles.onTile.push(`rgb(${d.join(',')})`);
    }
    for (let a = 0; a < 10; a++) {
      styles.ring.push(`rgba(${th.ring.join(',')},${((a + 1) / 10).toFixed(2)})`);
      styles.speck.push(`rgba(${th.speck.join(',')},${((a + 1) / 10).toFixed(2)})`);
    }
    canvas.style.background = th.bg;
  }
  const toneIdx = (t) => Math.min(15, Math.max(0, Math.floor(t * 15.99)));

  function cellAt(x, y) {
    const cx = Math.floor(x / cw), cy = Math.floor(y / chh);
    return cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : cy * cols + cx;
  }
  function put(x, y, ch, inten, tone, kind = 0, force = false) {
    const i = cellAt(x, y); if (i < 0) return;
    if (!force && inten <= I[i]) return;
    I[i] = inten; T[i] = tone; C[i] = ch.charCodeAt(0); K[i] = kind;
  }
  function tile(x, y, a, tone, force = false) {
    const i = cellAt(x, y); if (i < 0) return;
    if (!force && a <= F[i]) return;
    F[i] = a; FT[i] = tone;
    if (curZ) { Z[i] = curZ; S[i] = 0; touched.push(i); } // a fish on top hides shadows below it
  }

  // Cast the current fish's shadow down-right onto the pond floor and onto fish beneath it.
  function castShadow(L) {
    if (!o.shadow) return;
    const dx = Math.max(1, Math.round(L * 0.05 / cw)), dy = Math.max(1, Math.round(L * 0.07 / chh));
    for (const i of touched) {
      const cx = i % cols, cy = (i / cols) | 0;
      for (const [ox, oy, k] of [[dx, dy, 1], [dx + 1, dy + 1, 0.5]]) {
        if (cx + ox >= cols || cy + oy >= rows) continue;
        const j = (cy + oy) * cols + cx + ox;
        if (Z[j] === curZ) continue;
        const v = Math.min(1, F[i] * 1.2) * o.shadow * k;
        if (v > S[j]) S[j] = v;
      }
    }
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

  function stroke(ax, ay, bx, by, inten, tone) {
    const dx = bx - ax, dy = by - ay;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (Math.min(cw, chh) * 0.5)));
    const ch = lineChar(dx, dy);
    for (let s = 0; s <= n; s++) {
      const x = ax + dx * s / n, y = ay + dy * s / n;
      put(x, y, ch, inten, tone);
      if (o.finTile > 0) tile(x, y, inten * o.finTile, tone);
    }
  }

  /* ---------- fish ---------- */
  class Fish {
    constructor(L, sizeK, variant, index) {
      this.sizeK = sizeK; this.v = variant; this.index = index;
      this.n = 12;
      this.seed = rand(0, 100);
      this.x = rand(W * 0.2, W * 0.8); this.y = rand(H * 0.2, H * 0.8);
      this.ang = rand(-Math.PI, Math.PI);
      this.speed = 0; this.phase = rand(0, TAU);
      this.target = null; this.retarget = 0; this.flee = 0; this.fleeAng = 0;
      this.resize(L, true);
    }
    resize(L, init = false) {
      this.L = L; this.seg = L / (this.n - 1);
      if (init || !this.spine) {
        this.spine = [];
        for (let i = 0; i < this.n; i++) this.spine.push({ x: this.x - Math.cos(this.ang) * this.seg * i, y: this.y - Math.sin(this.ang) * this.seg * i });
      } else { // keep head, re-space the chain
        for (let i = 1; i < this.n; i++) {
          const a = this.spine[i - 1], b = this.spine[i];
          const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
          b.x = a.x + dx / l * this.seg; b.y = a.y + dy / l * this.seg;
        }
      }
      this.fins = buildFins(this);
      this.updateFins(0, true);
    }
    // half body width seen from above (0 = snout, 1 = tail root): egg shape, widest ~0.35
    hw(u) {
      const front = u < 0.32 ? 0.66 + 0.34 * Math.sin((u / 0.32) * Math.PI / 2) : 1;
      const back = 1 - 0.8 * smooth((u - 0.42) / 0.58);
      return this.L * 0.3 * front * back;
    }
    frame(u) { // point, forward unit vector, left unit vector at u
      const f = clamp(u, 0, 1) * (this.n - 1);
      const i = Math.min(this.n - 2, Math.floor(f)), t = f - i;
      const a = this.spine[i], b = this.spine[i + 1];
      let fx = a.x - b.x, fy = a.y - b.y; const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, fx, fy, lx: fy, ly: -fx };
    }
    update(dt) {
      const L = this.L, margin = L * 0.6;
      const head = this.spine[0];
      if (o.still) { // review mode: hold a pose, gentle tail wag
        this.phase += dt * 2.2;
        const n = fish.length, k = this.index;
        const hx = W * (0.5 + (n > 1 ? (k - (n - 1) / 2) * 0.3 : 0)) + L * 0.5;
        const hy = H * (n > 1 ? 0.3 + (k % 3) * 0.22 : 0.5);
        for (let i = 0; i < this.n; i++) {
          const q = i / (this.n - 1);
          this.spine[i].x = hx - i * this.seg;
          this.spine[i].y = hy + Math.sin(this.phase - q * 2.2) * q * q * L * 0.07;
        }
        this.updateFins(dt);
        return;
      }
      let desired, want = L * 0.28;
      let best = null, bd = Infinity;
      for (const p of food) { const d = Math.hypot(p.x - head.x, p.y - head.y); if (d < bd && d < Math.max(W, H) * 0.7) { bd = d; best = p; } }
      if (this.flee > 0) {
        this.flee -= dt; desired = this.fleeAng; want = L * 1.6;
      } else if (best) {
        desired = Math.atan2(best.y - head.y, best.x - head.x); want = L * 0.8;
        if (bd < L * 0.09) { food.splice(food.indexOf(best), 1); this.phase += 2; }
      } else {
        this.retarget -= dt;
        if (!this.target || this.retarget <= 0 || Math.hypot(this.target.x - head.x, this.target.y - head.y) < L * 0.35) {
          this.target = { x: rand(margin, Math.max(margin + 1, W - margin)), y: rand(margin, Math.max(margin + 1, H - margin)) };
          this.retarget = rand(5, 10);
        }
        desired = Math.atan2(this.target.y - head.y, this.target.x - head.x);
      }
      for (const g of fish) if (g !== this) { // keep a little apart
        const d = Math.hypot(g.spine[0].x - head.x, g.spine[0].y - head.y);
        if (d < L * 0.8) desired += wrap(Math.atan2(head.y - g.spine[0].y, head.x - g.spine[0].x) - desired) * 0.3 * (1 - d / (L * 0.8));
      }
      const turn = (best || this.flee > 0 ? 2.4 : 1.1) * dt;
      this.ang += clamp(wrap(desired - this.ang), -turn, turn);
      this.speed += (want - this.speed) * Math.min(1, dt * 1.4);
      this.phase += dt * (2 + this.speed / L * 5);
      const ha = this.ang + Math.sin(this.phase) * 0.14;
      head.x += Math.cos(ha) * this.speed * dt; head.y += Math.sin(ha) * this.speed * dt;
      head.x = clamp(head.x, -L * 0.3, W + L * 0.3); head.y = clamp(head.y, -L * 0.3, H + L * 0.3);
      for (let i = 1; i < this.n; i++) {
        const a = this.spine[i - 1], b = this.spine[i];
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        b.x = a.x + dx / l * this.seg; b.y = a.y + dy / l * this.seg;
      }
      this.updateFins(dt);
    }
    updateFins(dt, init = false) {
      for (const fin of this.fins) {
        const fr = this.frame(fin.u);
        const h = this.hw(fin.u);
        const rx = fr.x + fr.lx * fin.side * fin.v * h, ry = fr.y + fr.ly * fin.side * fin.v * h;
        for (const s of fin.strands) {
          s.p[0].x = rx + fr.lx * s.off * h; s.p[0].y = ry + fr.ly * s.off * h;
          for (let k = 1; k < s.p.length; k++) {
            const q = k / (s.p.length - 1);
            const sway = Math.sin(time * fin.freq + this.phase * 0.7 - k * 0.5 + s.ph) * fin.sway * q;
            // a: angle from "straight back", positive toward this fin's side
            const a = (s.a + s.curl * q) * fin.side + sway;
            const bx = -fr.fx * Math.cos(a) + fr.lx * Math.sin(a);
            const by = -fr.fy * Math.cos(a) + fr.ly * Math.sin(a);
            const tx = s.p[k - 1].x + bx * s.seg, ty = s.p[k - 1].y + by * s.seg;
            const st = init ? 1 : Math.min(1, (0.5 - 0.38 * q) * dt * 60);
            s.p[k].x += (tx - s.p[k].x) * st; s.p[k].y += (ty - s.p[k].y) * st;
            const dx = s.p[k].x - s.p[k - 1].x, dy = s.p[k].y - s.p[k - 1].y, l = Math.hypot(dx, dy) || 1;
            s.p[k].x = s.p[k - 1].x + dx / l * s.seg; s.p[k].y = s.p[k - 1].y + dy / l * s.seg;
          }
        }
      }
    }
    drawFins(layer) {
      for (const fin of this.fins) {
        if (fin.layer !== layer) continue;
        for (const s of fin.strands) {
          const n = s.p.length;
          for (let k = 1; k < n; k++) {
            const q = k / (n - 1);
            const inten = (1 - q * 0.35) * fin.inten;
            const tone = fin.tone0 + (fin.tone1 - fin.tone0) * smooth(q * 1.2) + s.tj;
            if (k === n - 1) put(s.p[k].x, s.p[k].y, "'", inten * 0.8, clamp(tone, 0, 1));
            else stroke(s.p[k - 1].x, s.p[k - 1].y, s.p[k].x, s.p[k].y, inten, clamp(tone, 0, 1));
          }
        }
      }
    }
    drawBody() {
      const L = this.L, v = this.v;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const p of this.spine) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
      const pad = L * 0.32;
      const c0 = Math.max(0, Math.floor((minx - pad) / cw)), c1 = Math.min(cols - 1, Math.ceil((maxx + pad) / cw));
      const r0 = Math.max(0, Math.floor((miny - pad) / chh)), r1 = Math.min(rows - 1, Math.ceil((maxy + pad) / chh));
      // scales open toward the tail; pick a bracket that bulges that way on screen
      const hf = this.frame(0.5);
      const tx = -hf.fx, ty = -hf.fy;
      const scaleChar = Math.abs(tx) * chh > Math.abs(ty) * cw ? (tx < 0 ? '(' : ')') : (ty < 0 ? 'n' : 'u');
      const scale = Math.max(cw * 1.6, L * 0.07);
      const eyeU = 0.1, eyeR = v.bubbleEyes ? L * 0.075 : L * 0.04;
      const eyes = [1, -1].map((sd) => {
        const fr = this.frame(eyeU), w = this.hw(eyeU);
        const out = v.bubbleEyes ? w + eyeR * 0.55 : w * 0.72;
        return { x: fr.x + fr.lx * sd * out, y: fr.y + fr.ly * sd * out };
      });
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const x = (cx + 0.5) * cw, y = (cy + 0.5) * chh;
        // eyes first (telescope eyes sit outside the body outline)
        let eyeHit = false;
        for (const e of eyes) {
          const d = Math.hypot(x - e.x, y - e.y) / eyeR;
          if (d < 1) {
            eyeHit = true;
            if (d < (v.bubbleEyes ? 0.42 : 0.7)) { tile(x, y, 1, -1, true); put(x, y, 'o', 1, 0, 4, true); }
            else { tile(x, y, 0.95, v.bubbleEyes ? 0.08 : 0.3, true); put(x, y, lineChar(-(y - e.y), x - e.x), 0.9, 0.08, 0, true); }
          }
        }
        if (eyeHit) continue;
        // nearest point on the spine
        let bu = 0, bd = Infinity, blat = 0;
        for (let i = 0; i < this.n - 1; i++) {
          const a = this.spine[i], b = this.spine[i + 1];
          const ex = b.x - a.x, ey = b.y - a.y, ll = ex * ex + ey * ey || 1;
          const t = ((x - a.x) * ex + (y - a.y) * ey) / ll;
          const tc = i === 0 ? Math.max(t, -0.7) : clamp(t, 0, 1);
          const px = a.x + ex * tc, py = a.y + ey * tc;
          const d = Math.hypot(x - px, y - py);
          if (d < bd) {
            bd = d; bu = (i + tc) / (this.n - 1);
            const l = Math.sqrt(ll), fx = -ex / l, fy = -ey / l;
            const perp = (x - px) * fy - (y - py) * fx; // + = left
            blat = t === tc ? perp : (perp >= 0 ? 1 : -1) * d;
          }
        }
        if (bu > 1) continue;
        const u = Math.max(bu, 0), along = bu * L;
        const w = this.hw(u);
        let e = Math.abs(blat) / w;
        if (along < 0) e = Math.hypot(along / (this.hw(0) * 0.7), e); // rounded snout
        if (e > 1) continue;
        const nz = hash(cx, cy);
        const pattern = Math.sin(u * 7 + this.seed) * Math.cos(blat / L * 9 + this.seed * 1.7) + Math.sin(u * 3.1 - blat / L * 5 + this.seed * 0.3) * 0.5;
        const tone = clamp(v.body(pattern) + (nz - 0.5) * 0.12, 0, 1);
        const edge = e > 0.88;
        const tailFade = smooth((u - 0.85) / 0.15);
        // oranda wen: bumpy red cap over the top of the head
        if (v.wen && u < 0.3 && e < 0.95) {
          const bump = Math.sin(cx * 1.7 + cy * 0.9) + Math.sin(cx * 0.8 - cy * 1.9);
          tile(x, y, 1, clamp(0.02 + (bump > 0.6 ? 0.1 : 0) + nz * 0.06, 0, 1), true);
          put(x, y, 'o8O@&o'[Math.floor(nz * 6)], 0.9, 0, 0, true);
          continue;
        }
        tile(x, y, (edge ? 0.65 : 0.95) * (1 - tailFade * 0.5), tone, true);
        if (edge) { const fr = this.frame(u); put(x, y, lineChar(fr.fx, fr.fy), 0.9, tone, 0, true); continue; }
        if (u < 0.26) { // head: sparse dots
          if (nz < 0.45) put(x, y, nz < 0.2 ? ':' : '.', 0.8, tone, 0, true);
          continue;
        }
        // scales: staggered rows of brackets
        const su = (along - L * 0.26) / scale;
        const row = Math.floor(blat / scale + 100);
        const fu = (su + (row % 2) * 0.5) % 1;
        const fv = (blat / scale + 100) % 1;
        const r = Math.hypot(fu - 0.15, (fv - 0.5) * 0.9);
        if (r > 0.4 && r < 0.62 && fu > 0.3) put(x, y, scaleChar, 0.9, tone, 0, true);
        else if (nz < 0.3) put(x, y, '.', 0.7, tone, 0, true);
      }
    }
  }

  function buildFins(f) {
    const L = f.L, v = f.v, D = Math.PI / 180;
    const fins = [];
    const fan = (opts) => {
      const strands = [];
      for (let i = 0; i < opts.count; i++) {
        const q = opts.count === 1 ? 0.5 : i / (opts.count - 1);
        const len = L * opts.len(q), segs = opts.segs || 10;
        const p = []; for (let k = 0; k <= segs; k++) p.push({ x: f.spine[0].x, y: f.spine[0].y });
        strands.push({ a: opts.a0 + (opts.a1 - opts.a0) * q, curl: opts.curl(q), seg: len / segs, ph: rand(0, 1) + q * 1.4,
          off: (opts.off || 0) * (q - 0.5), tj: (Math.random() - 0.5) * (opts.toneJitter || 0.1), p });
      }
      return { u: opts.u, v: opts.v || 0, side: opts.side || 1, layer: opts.layer || 0, sway: opts.sway, freq: opts.freq,
        inten: opts.inten ?? 1, tone0: opts.tone0, tone1: opts.tone1, strands };
    };
    // twin tail: one lobe to each side, spreading wide; telescope tails are mostly white with a red core
    for (const side of [1, -1]) {
      fins.push(fan({ u: 1, side, count: 18, a0: 6 * D, a1: 72 * D, off: 0.3, segs: 13,
        len: (q) => 0.62 + 0.42 * Math.sin(q * Math.PI * 0.85), curl: (q) => 0.25 + q * 0.35, sway: 0.42, freq: 2.0,
        tone0: v.tailBase, tone1: v.tailTip, toneJitter: v.tailWhite ? 0.3 : 0.12 }));
    }
    // pectoral fins
    for (const side of [1, -1]) {
      fins.push(fan({ u: 0.32, v: 0.85, side, count: 8, a0: 50 * D, a1: 100 * D, segs: 8, layer: 1,
        len: () => 0.34, curl: () => -0.2, sway: 0.55, freq: 3.2, tone0: 0.42, tone1: 0.8 }));
    }
    // pelvic fins
    for (const side of [1, -1]) {
      fins.push(fan({ u: 0.55, v: 0.6, side, count: 5, a0: 35 * D, a1: 60 * D, segs: 6,
        len: () => 0.2, curl: () => 0.1, sway: 0.4, freq: 2.6, tone0: 0.45, tone1: 0.85 }));
    }
    // dorsal fin seen from above: a narrow ridge of strands lying back along the spine
    if (v.dorsal) {
      fins.push(fan({ u: 0.45, count: 6, a0: -6 * D, a1: 6 * D, off: 0.25, segs: 8, layer: 1, inten: 0.9,
        len: () => 0.34, curl: () => 0, sway: 0.25, freq: 1.8, tone0: v.tailBase - 0.1, tone1: v.tailTip - 0.15 }));
    }
    return fins;
  }

  function syncCount() {
    const L = Math.min(W, H) * o.fishScale;
    const sizes = [1, 0.86, 0.78, 0.92, 0.72, 0.84, 0.8, 0.9, 0.74];
    while (fish.length < o.count) {
      const k = fish.length;
      fish.push(new Fish(L * sizes[k % sizes.length], sizes[k % sizes.length], VARIANTS[k % VARIANTS.length], k));
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
      for (let i = 0; i < 9; i++) food.push({ x: x + rand(-34, 34), y: y + rand(-30, 30), vx: rand(-5, 5), vy: rand(-5, 5), age: 0, wob: rand(0, TAU) });
      for (const f of fish) f.flee = 0; // food wins over fright
      lastTap.t = 0;
    } else lastTap = { t: now, x, y };
    if (reduce) draw();
  }

  /* ---------- frame ---------- */
  function draw() {
    I.fill(0); F.fill(0); Z.fill(0); S.fill(0); RW.fill(0); RG.fill(0);
    const th = o.themes[o.theme];
    if (o.water) {
      for (let cy = 0; cy < rows; cy += 2) for (let cx = (cy / 2) % 3; cx < cols; cx += 3) {
        const val = Math.sin(cx * 0.21 + time * 0.35) * Math.sin(cy * 0.17 - time * 0.27) + Math.sin((cx + cy) * 0.05 + time * 0.2) * 0.35;
        if (val > 0.9) put((cx + 0.5) * cw, (cy + 0.5) * chh, '.', (val - 0.9) * 0.9, 0, 2);
      }
    }
    for (const rp of ripples) { // a packet of rings: crests catch the light (white), troughs are shadow (grey)
      const life = 1 - rp.age / o.rippleLife;
      const R = rp.age * o.rippleSpeed + 6, wl = o.rippleWave, pw = wl * 1.8;
      const reach = R + pw * 1.6;
      const c0 = Math.max(0, Math.floor((rp.x - reach) / cw)), c1 = Math.min(cols - 1, Math.ceil((rp.x + reach) / cw));
      const r0 = Math.max(0, Math.floor((rp.y - reach) / chh)), r1 = Math.min(rows - 1, Math.ceil((rp.y + reach) / chh));
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const x = (cx + 0.5) * cw - rp.x, y = (cy + 0.5) * chh - rp.y, d = Math.hypot(x, y);
        const off = d - R;
        if (off > pw * 1.6 || off < -pw * 2.4) continue;
        const env = Math.exp(-(off * off) / (pw * pw)) * life * Math.min(1, d / (wl * 0.8));
        const w = Math.cos(off / wl * TAU) * env;
        const i = cy * cols + cx;
        if (w > 0) RW[i] = Math.max(RW[i], w); else RG[i] = Math.max(RG[i], -w);
        if (Math.abs(w) > 0.45) put((cx + 0.5) * cw, (cy + 0.5) * chh, lineChar(-y, x), Math.abs(w) * 0.8, 0, w > 0 ? 4 : 3);
      }
    }
    for (const p of food) { put(p.x, p.y, 'o', Math.min(1, (o.foodLife - p.age) / 3), 0.42, 0, true); tile(p.x, p.y, 0.25, 0.45); }
    fish.forEach((f, k) => {
      curZ = k + 1; touched = [];
      f.drawFins(0); f.drawBody(); f.drawFins(1);
      castShadow(f.L);
    });
    curZ = 0;

    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
    for (let i = 0, n = cols * rows; i < n; i++) { // tiles
      const a = F[i]; if (a < 0.03) continue;
      ctx.fillStyle = FT[i] < 0 ? styles.eye : styles.ink[toneIdx(FT[i])][Math.min(9, Math.floor(a * 10))];
      ctx.fillRect((i % cols) * cw + 0.5, Math.floor(i / cols) * chh + 0.5, cw - 1, chh - 1);
    }
    const sh = th.shade.join(','), wd = th.waveDark.join(','), wlc = th.waveLight.join(',');
    for (let i = 0, n = cols * rows; i < n; i++) { // shadows, then ripple troughs and crests
      const x = (i % cols) * cw + 0.5, y = Math.floor(i / cols) * chh + 0.5;
      if (S[i] > 0.03) { ctx.fillStyle = `rgba(${sh},${(S[i] * th.shadeA).toFixed(3)})`; ctx.fillRect(x, y, cw - 1, chh - 1); }
      if (RG[i] > 0.04) { ctx.fillStyle = `rgba(${wd},${(RG[i] * th.waveDarkA).toFixed(3)})`; ctx.fillRect(x, y, cw - 1, chh - 1); }
      if (RW[i] > 0.04) { ctx.fillStyle = `rgba(${wlc},${(RW[i] * th.waveLightA).toFixed(3)})`; ctx.fillRect(x, y, cw - 1, chh - 1); }
    }
    ctx.font = `${o.fontSize}px "DM Mono", ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'top';
    const ox = cw * 0.08;
    for (let i = 0, n = cols * rows; i < n; i++) { // characters
      const v = I[i]; if (v < 0.04) continue;
      const k = K[i];
      if (k === 0 && F[i] > 0.4) ctx.fillStyle = styles.onTile[toneIdx(FT[i])];
      else {
        const a = Math.min(9, Math.floor(v * 10));
        ctx.fillStyle = k === 4 ? styles.glint : k === 1 ? styles.eye : k === 2 ? styles.speck[Math.min(2, a)] : k === 3 ? styles.ring[a] : styles.ink[toneIdx(T[i])][a];
      }
      ctx.fillText(String.fromCharCode(C[i]), (i % cols) * cw + ox, Math.floor(i / cols) * chh);
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    for (const f of fish) f.update(dt);
    for (const rp of ripples) rp.age += dt;
    ripples = ripples.filter((r) => r.age < o.rippleLife);
    for (const p of food) { p.age += dt; p.wob += dt; p.x += (p.vx + Math.sin(p.wob) * 3) * dt; p.y += (p.vy + Math.cos(p.wob * 0.8) * 3) * dt; p.vx *= 0.98; p.vy *= 0.98; }
    food = food.filter((p) => p.age < o.foodLife);
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
