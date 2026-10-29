// Docs: heading anchors, on-this-page highlight, phone menu and search.
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];

// Heading anchors
$$('.docs-body h2[id], .docs-body h3[id]').forEach((h) => {
  const a = document.createElement('a');
  a.className = 'anchor'; a.href = `#${h.id}`; a.textContent = '#'; a.setAttribute('aria-label', `Link to ${h.textContent}`);
  h.appendChild(a);
});

// Wide tables scroll on their own instead of the page
$$('.docs-body table').forEach((t) => {
  if (t.parentElement?.classList.contains('docs-table')) return;
  const w = document.createElement('div'); w.className = 'docs-table';
  t.replaceWith(w); w.appendChild(t);
});

// On this page: mark the section in view
const tocLinks = $$<HTMLAnchorElement>('.docs-toc a[href^="#"]:not(.docs-top)');
if (tocLinks.length) {
  const targets = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean) as HTMLElement[];
  const mark = () => {
    let cur = targets[0];
    for (const t of targets) if (t.getBoundingClientRect().top < 140) cur = t;
    tocLinks.forEach((a) => a.toggleAttribute('aria-current', a.hash === `#${cur?.id}`));
    tocLinks.forEach((a) => { if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'location'); });
  };
  addEventListener('scroll', mark, { passive: true }); mark();
}

// Phone menu
const menuBtn = $<HTMLButtonElement>('[data-docs-menu]');
const side = $('#docs-side');
menuBtn?.addEventListener('click', () => {
  const open = menuBtn.getAttribute('aria-expanded') !== 'true';
  menuBtn.setAttribute('aria-expanded', String(open));
  side?.classList.toggle('open', open);
});

// Search
const dlg = $<HTMLDialogElement>('#docs-search');
const q = $<HTMLInputElement>('#docs-q');
const hits = $('#docs-hits');
type Entry = { t: string; g: string; u: string; d: string; h: [string, string][] };
const index: Entry[] = dlg ? JSON.parse(dlg.dataset.index || '[]') : [];
let sel = 0;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const search = (term: string) => {
  const s = term.trim().toLowerCase();
  if (!s) return index.filter((e) => ['Project status', 'What stays private', 'Withdraw', 'Token framework', 'FAQ'].includes(e.t)).map((e) => ({ e, sub: '' as string, url: e.u }));
  const out: { e: Entry; sub: string; url: string; score: number }[] = [];
  for (const e of index) {
    if (e.t.toLowerCase().includes(s)) out.push({ e, sub: '', url: e.u, score: 3 });
    else if (e.d.toLowerCase().includes(s)) out.push({ e, sub: '', url: e.u, score: 1 });
    for (const [text, slug] of e.h) if (text.toLowerCase().includes(s)) out.push({ e, sub: text, url: `${e.u}#${slug}`, score: 2 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
};
const render = () => {
  if (!hits || !q) return;
  const res = search(q.value);
  sel = Math.min(sel, Math.max(0, res.length - 1));
  hits.innerHTML = res.length
    ? res.map((r, i) => `<li role="option" aria-selected="${i === sel}"><a href="${r.url}"><b>${esc(r.sub || r.e.t)}</b><span>${esc(r.sub ? r.e.t : r.e.g)} · ${esc(r.e.d)}</span></a></li>`).join('')
    : `<li class="none">No results for “${esc(q.value)}”.</li>`;
};
const openSearch = () => { if (!dlg) return; if (!dlg.open) dlg.showModal(); q!.value = ''; sel = 0; render(); q!.focus(); };
$$('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch));
$('[data-search-close]')?.addEventListener('click', () => dlg?.close());
dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
q?.addEventListener('input', () => { sel = 0; render(); });
q?.addEventListener('keydown', (e) => {
  const items = $$('#docs-hits li[role="option"]');
  if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); render(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
  if (e.key === 'Enter') { const a = items[sel]?.querySelector('a'); if (a) { location.href = a.getAttribute('href')!; dlg?.close(); } }
});
hits?.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) dlg?.close(); });
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === '/' && !(e.target as Element).closest('input, textarea')) { e.preventDefault(); openSearch(); }
});
