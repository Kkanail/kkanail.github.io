// Experiment notes drawer — shared by every playground/<slug>/ page.
// Reads this experiment's "notes" and "refs" from /data/experiments.json (matched by slug = folder name)
// and adds a "Notes" button to the page's top bar. Opens automatically when the URL ends with #notes.
// Include on an experiment page with: <script type="module" src="/assets/js/exp-notes.js"></script>

const slug = location.pathname.split('/').filter(Boolean).pop();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const css = `
.xn-btn { font: inherit; letter-spacing: inherit; text-transform: inherit; color: var(--ink, #101820); background: none; border: 0; cursor: pointer; padding: 4px 6px; border-radius: 4px; }
.xn-btn:hover { color: var(--accent, #6e56cf); }
.xn-btn:focus-visible, .xn-close:focus-visible, .xn-panel a:focus-visible { outline: 2px solid var(--accent, #6e56cf); outline-offset: 2px; }
.xn-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100%); z-index: 20; overflow-y: auto;
  background: var(--panel, var(--bg, #fff)); color: var(--ink, #101820); border-left: 1px solid var(--line, #e3e3e3);
  padding: calc(20px + env(safe-area-inset-top, 0px)) max(24px, env(safe-area-inset-right, 0px)) calc(24px + env(safe-area-inset-bottom, 0px)) 24px;
  font: 15px/1.7 "Open Sans", "Noto Sans TC", -apple-system, sans-serif; transform: translateX(100%); transition: transform .25s ease; }
.xn-panel.open { transform: none; }
.xn-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.xn-head h2 { font: 400 28px/1.1 "Newsreader", "Noto Serif TC", Georgia, serif; letter-spacing: -.01em; margin: 0; }
.xn-close { font: 12px "DM Mono", ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--mute, #6b6f76); background: none; border: 0; cursor: pointer; padding: 4px; }
.xn-meta { font: 12px "DM Mono", ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--mute, #6b6f76); margin-bottom: 20px; }
.xn-panel h3 { font: 12px "DM Mono", ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--accent, #6e56cf); margin: 28px 0 10px; font-weight: 400; }
.xn-panel p { margin: 0 0 12px; }
.xn-panel ul { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line, #e3e3e3); }
.xn-panel li { padding: 10px 0; border-bottom: 1px solid var(--line, #e3e3e3); }
.xn-panel a { color: inherit; text-decoration: underline; text-decoration-color: var(--line, #e3e3e3); text-underline-offset: 3px; }
.xn-panel a:hover { text-decoration-color: currentColor; }
.xn-panel .xn-note { display: block; color: var(--mute, #6b6f76); font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .xn-panel { transition: none; } }
`;

async function init() {
  let item;
  try {
    const list = await (await fetch('/data/experiments.json', { cache: 'no-cache' })).json();
    item = list.find((x) => x.slug === slug);
  } catch { return; }
  if (!item || (!item.notes && !(item.refs || []).length)) return;

  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.className = 'xn-panel'; panel.id = 'notes'; panel.setAttribute('aria-label', 'Notes'); panel.hidden = true;
  const paras = String(item.notes || '').split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
  const refs = (item.refs || []).map((r) => `<li>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)} ↗</a>` : esc(r.label)}${r.note ? `<span class="xn-note">${esc(r.note)}</span>` : ''}</li>`).join('');
  panel.innerHTML = `<div class="xn-head"><h2>Notes</h2><button class="xn-close" type="button">Close ✕</button></div>
    <div class="xn-meta">${esc(item.title)} · ${esc(item.date)}</div>
    ${paras ? `<h3>筆記</h3>${paras}` : ''}
    ${refs ? `<h3>References</h3><ul>${refs}</ul>` : ''}`;
  document.body.appendChild(panel);

  const btn = document.createElement('button');
  btn.className = 'xn-btn'; btn.type = 'button'; btn.textContent = 'Notes'; btn.setAttribute('aria-controls', 'notes'); btn.setAttribute('aria-expanded', 'false');
  const bar = document.querySelector('.bar.top, header');
  if (bar) bar.insertBefore(btn, bar.querySelector('a[href="/playground/"]')); else document.body.appendChild(btn);

  const open = (on) => {
    if (on) { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('open')); }
    else { panel.classList.remove('open'); setTimeout(() => { if (!panel.classList.contains('open')) panel.hidden = true; }, 260); }
    btn.setAttribute('aria-expanded', String(on));
  };
  btn.addEventListener('click', () => open(!panel.classList.contains('open')));
  panel.querySelector('.xn-close').addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  // clicks inside the panel shouldn't reach the experiment underneath
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  if (location.hash === '#notes') open(true);
}
init();
