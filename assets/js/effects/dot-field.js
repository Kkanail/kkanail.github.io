// Dot field — mouse-reactive hero effect.
// Effect contract (every file in assets/js/effects/ follows it):
//   export function mount(el, options) -> returns a cleanup function
// To swap the homepage effect, change data-effect="..." on the .effect-slot in index.html.

export function mount(el, options = {}) {
  const o = {
    gap: 28,          // px between dots
    base: 1.6,        // resting dot radius
    grow: 4.6,        // extra radius at the cursor
    radius: 180,      // influence radius in px
    push: 14,         // how far dots are pushed away
    rest: [207, 207, 207],
    hot: [110, 86, 207],
    ...options,
  };

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, dpr = 1, dots = [];
  const pointer = { x: -9999, y: -9999, active: false, lastMove: 0 };
  const focus = { x: -9999, y: -9999 }; // smoothed point the dots react to
  let raf = 0, t0 = performance.now();

  function layout() {
    const r = el.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    const ox = ((w % o.gap) + o.gap) / 2, oy = ((h % o.gap) + o.gap) / 2;
    for (let y = oy; y < h; y += o.gap) for (let x = ox; x < w; x += o.gap) dots.push({ x, y, e: 0 });
    if (reduce) draw(0);
  }

  function onMove(ev) {
    const r = el.getBoundingClientRect();
    pointer.x = ev.clientX - r.left; pointer.y = ev.clientY - r.top;
    pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= w && pointer.y <= h;
    pointer.lastMove = performance.now();
  }
  function onLeave() { pointer.active = false; }

  function draw(now) {
    // With no recent pointer, an "autopilot" point drifts slowly so the area never feels dead (and works on touch).
    const idle = !pointer.active || now - pointer.lastMove > 4000;
    let tx, ty;
    if (reduce) { tx = w * 0.5; ty = h * 0.46; }
    else if (idle) {
      const s = (now - t0) / 1000;
      tx = w * (0.5 + 0.28 * Math.sin(s * 0.37)); ty = h * (0.5 + 0.26 * Math.sin(s * 0.53 + 1.1));
    } else { tx = pointer.x; ty = pointer.y; }
    if (focus.x < -999) { focus.x = tx; focus.y = ty; }
    const k = idle ? 0.04 : 0.25;
    focus.x += (tx - focus.x) * k; focus.y += (ty - focus.y) * k;

    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      const dx = d.x - focus.x, dy = d.y - focus.y, dist = Math.hypot(dx, dy);
      const t = Math.max(0, 1 - dist / o.radius);
      const target = t * t * (3 - 2 * t);
      d.e += (target - d.e) * (reduce ? 1 : 0.18); // ease toward target so dots settle back smoothly
      const e = d.e;
      const px = d.x + (dist ? dx / dist : 0) * o.push * e;
      const py = d.y + (dist ? dy / dist : 0) * o.push * e;
      const c = o.rest.map((v, i) => Math.round(v + (o.hot[i] - v) * e));
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.beginPath(); ctx.arc(px, py, o.base + o.grow * e, 0, Math.PI * 2); ctx.fill();
    }
  }

  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }

  const ro = new ResizeObserver(layout);
  ro.observe(el);
  layout();
  window.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerleave', onLeave);
  if (!reduce) raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf); ro.disconnect();
    window.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
    canvas.remove();
  };
}
