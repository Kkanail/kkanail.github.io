// Shared site script: mounts the hero effect and renders data-driven pages.
// Content lives in /data/*.json — pages read it, so adding content never needs UI edits.

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isExternal = (url) => /^https?:\/\//.test(url || '');
const monthYear = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

// Count tags across items, most used first.
function tagCounts(items) {
  const m = new Map();
  for (const it of items) for (const t of it.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Keep ?tag= in the URL so a filtered view can be shared.
function getParam(name) { return new URLSearchParams(location.search).get(name); }
function setParam(name, value) {
  const u = new URL(location.href);
  if (value) u.searchParams.set(name, value); else u.searchParams.delete(name);
  history.replaceState(null, '', u);
}

/* ---------- hero effect slot ---------- */
async function mountEffect() {
  const slot = $('.effect-slot[data-effect]');
  if (!slot) return;
  try {
    const mod = await import(`/assets/js/effects/${slot.dataset.effect}.js`);
    let opts = {};
    try { opts = JSON.parse(slot.dataset.options || '{}'); } catch (err) { console.warn('Bad data-options on the effect slot', err); }
    mod.mount(slot, opts);
  } catch (err) { console.warn('Effect failed to load', err); }
}

/* ---------- playground ---------- */
async function renderPlayground() {
  const root = $('#playground');
  if (!root) return;
  const items = (await loadJSON('/data/experiments.json')).sort((a, b) => b.date.localeCompare(a.date));
  $('#exp-count').textContent = String(items.length).padStart(2, '0');
  if (items[0]) $('#exp-updated').textContent = `Experiments · updated ${monthYear(items[0].date)}`;

  let active = getParam('tag');
  const bar = $('#exp-filters');
  const paint = () => {
    bar.innerHTML = [['All', items.length, null], ...tagCounts(items).map(([t, n]) => [`#${t}`, n, t])]
      .map(([label, n, tag]) => `<button class="chip" data-tag="${esc(tag ?? '')}" aria-pressed="${(tag ?? null) === (active ?? null)}">${esc(label)} · ${n}</button>`).join('');
    const shown = active ? items.filter((it) => (it.tags || []).includes(active)) : items;
    root.innerHTML = shown.map(card).join('') + nextCard();
  };
  const card = (it) => {
    const ext = isExternal(it.link);
    const target = ext ? ' target="_blank" rel="noopener"' : '';
    const badge = it.label ? `<span class="badge ${esc(it.label.toLowerCase())}">${it.label === 'Featured' ? '★ ' : ''}${esc(it.label)}</span>` : '';
    const thumb = it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : '<span class="ph-label">No preview yet</span>';
    return `<article class="cell">
      <a class="thumb" href="${esc(it.link)}"${target}>${thumb}${badge}</a>
      <div class="meta"><span class="mono">${esc(it.date)}</span></div>
      <h3><a href="${esc(it.link)}"${target}>${esc(it.title)}</a></h3>
      <p>${esc(it.description)}</p>
      <div class="tags">${(it.tags || []).map((t) => `<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>
      <div class="actions">
        <a class="btn primary small" href="${esc(it.link)}"${target}>Try it ↗</a>
        ${it.how ? `<a class="btn small" href="${esc(it.how)}"${isExternal(it.how) ? ' target="_blank" rel="noopener"' : ''}>How I made it</a>` : ''}
        ${(it.notes || (it.refs || []).length) && !ext ? `<a class="btn small" href="${esc(it.link)}#notes">Notes</a>` : ''}
      </div>
    </article>`;
  };
  const nextCard = () => `<div class="cell next"><div class="slot"><span>+ Next experiment</span><span class="mono">Coming soon</span></div></div>`;

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b || !document.body.contains(b)) return;
    const t = b.dataset.tag || null;
    active = (b.classList.contains('tag') && active === t) ? null : t;
    setParam('tag', active); paint();
    if (b.classList.contains('tag')) bar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  paint();
}

/* ---------- notes ---------- */
async function renderNotes() {
  const root = $('#notes');
  if (!root) return;
  const items = (await loadJSON('/data/notes.json')).sort((a, b) => b.date.localeCompare(a.date));
  const KIND = { note: 'Note', reading: 'Reading', update: 'Site update' };
  let kind = getParam('type'), tag = getParam('tag');

  const opt = (label, n, attr, val, on) => `<button class="opt" ${attr}="${esc(val ?? '')}" aria-pressed="${on}"><span>${esc(label)}</span><span class="mono">${n}</span></button>`;
  const paint = () => {
    const kinds = Object.keys(KIND).map((k) => [k, items.filter((i) => i.type === k).length]).filter(([, n]) => n);
    $('#notes-types').innerHTML = opt('All', items.length, 'data-type', '', !kind) + kinds.map(([k, n]) => opt(KIND[k], n, 'data-type', k, kind === k)).join('');
    const tags = tagCounts(items);
    $('#notes-tags').innerHTML = tags.length ? `<div class="tags">${tags.map(([t]) => `<button class="tag" data-ntag="${esc(t)}" ${t === tag ? 'style="background:var(--ink);color:#fff;border-color:var(--ink)"' : ''}>#${esc(t)}</button>`).join('')}</div>` : '<span class="mono">No tags yet</span>';
    const years = [...new Set(items.map((i) => i.date.slice(0, 4)))];
    $('#notes-years').innerHTML = years.map((y) => opt(y, items.filter((i) => i.date.startsWith(y)).length, 'data-year', y, false)).join('');

    const shown = items.filter((i) => (!kind || i.type === kind) && (!tag || (i.tags || []).includes(tag)));
    root.innerHTML = shown.length ? shown.map(entry).join('') : '<p class="empty">Nothing here yet.</p>';
  };
  const entry = (i) => {
    const link = i.link ? (inner) => `<a href="${esc(i.link)}"${isExternal(i.link) ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>` : (x) => x;
    if (i.type === 'update') return `<div class="entry update" id="${esc(i.date)}"><span class="mono">${esc(i.date)}</span><div class="body"><span class="pill">Site update</span><span>${link(esc(i.title))}</span></div></div>`;
    return `<article class="entry"><span class="mono">${esc(i.date)}</span><div class="body">
      <span class="mono kind">${esc(KIND[i.type] || i.type)}</span>
      <h3>${link(esc(i.title))}</h3>
      ${i.excerpt ? `<p>${esc(i.excerpt)}</p>` : ''}
      ${(i.tags || []).length ? `<div class="tags">${i.tags.map((t) => `<button class="tag" data-ntag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
    </div></article>`;
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type],[data-ntag],[data-year]');
    if (!t) return;
    if ('type' in t.dataset) { kind = t.dataset.type || null; setParam('type', kind); }
    if ('ntag' in t.dataset) { tag = tag === t.dataset.ntag ? null : t.dataset.ntag; setParam('tag', tag); }
    if ('year' in t.dataset) { const el = [...root.children].find((c) => (c.querySelector('.mono')?.textContent || '').startsWith(t.dataset.year)); el?.scrollIntoView({ behavior: 'smooth' }); return; }
    paint();
  });
  paint();
}

/* ---------- work ---------- */
async function renderWork() {
  const root = $('#work');
  if (!root) return;
  const items = await loadJSON('/data/works.json');
  const COLORS = { Web3: 'var(--c-web3)', AI: 'var(--c-ai)', Fintech: 'var(--c-fintech)', Hardware: 'var(--c-hardware)', 'Public service': 'var(--c-public)' };
  let active = getParam('tag');
  const paint = () => {
    const cats = tagCounts(items.map((i) => ({ tags: [i.category] })));
    $('#work-filters').innerHTML = [['All', items.length, null], ...cats.map(([c, n]) => [c, n, c])]
      .map(([l, n, c]) => `<button class="chip" data-wtag="${esc(c ?? '')}" aria-pressed="${(c ?? null) === (active ?? null)}">${c ? `<span class="dot" style="background:${COLORS[c] || 'var(--ph-ink)'};margin-right:6px"></span>` : ''}${esc(l)} · ${n}</button>`).join('');
    const shown = active ? items.filter((i) => i.category === active) : items;
    root.innerHTML = shown.map((i) => `<article class="cell">
      <div class="work-cover">${i.cover ? `<img src="${esc(i.cover)}" alt="${esc(i.title)}" loading="lazy">` : `<span>${esc(i.title)}</span>`}</div>
      <div class="meta"><span class="mono" style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${COLORS[i.category] || 'var(--ph-ink)'}"></span>${esc(i.category)}</span><span class="mono">${esc(i.year)}</span></div>
      <h3>${esc(i.title)}</h3>
      <p>${esc(i.org)}</p>
    </article>`).join('');
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wtag]'); if (!b) return;
    active = b.dataset.wtag || null; setParam('tag', active); paint();
  });
  paint();
}

mountEffect();
renderPlayground().catch(console.error);
renderNotes().catch(console.error);
renderWork().catch(console.error);
