// Shared behaviour for the marketing sections: reveal on scroll, word-by-word
// headings, card spotlight, figure toggles and the closing particle wordmark.
// Everything is an enhancement and follows the reduced-motion setting.

document.documentElement.classList.add('js');
const reducedQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reducedQ.matches;
const $ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = document) => el.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = document) => Array.from(el.querySelectorAll(sel)) as T[];

/* ---------- Cursor spotlight on cards ---------- */
$$('.lp-card').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

/* ---------- Reveal on scroll ---------- */
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } });
}, { rootMargin: '0px 0px -8% 0px' });
$$('[data-reveal]').forEach((el) => {
  if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in');
  else { el.classList.add('pre'); revealIO.observe(el); }
});


/* ---------- Section headings: words rise in one after another ---------- */
const headIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('go'); headIO.unobserve(e.target); } });
}, { rootMargin: '0px 0px -12% 0px' });
$$('[data-words]').forEach((h) => {
  let n = 0;
  const wrapWords = (node: Node) => {
    Array.from(node.childNodes).forEach((c) => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        (c.textContent || '').split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const s = document.createElement('span');
          s.className = 'w'; s.style.setProperty('--w', String(n++)); s.textContent = part;
          frag.append(s);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1) wrapWords(c);
    });
  };
  wrapWords(h);
  h.classList.add('wsplit');
  headIO.observe(h);
});

/* ---------- Audience figures: flip between today and with Zeronym ---------- */
const figs = $$<HTMLButtonElement>('button.lp-fig');
figs.forEach((f, i) => {
  let timer = 0;
  let manual = false;
  const set = (alt: boolean) => { f.classList.toggle('alt', alt); f.setAttribute('aria-pressed', String(alt)); };
  const stop = () => { clearInterval(timer); timer = 0; };
  const start = () => {
    if (manual || timer || isReduced()) return;
    timer = window.setTimeout(() => {
      set(!f.classList.contains('alt'));
      timer = window.setInterval(() => set(!f.classList.contains('alt')), 3200);
    }, 900 + i * 500) as unknown as number;
  };
  f.addEventListener('click', () => { manual = true; stop(); set(!f.classList.contains('alt')); });
  new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else { clearTimeout(timer); stop(); } }, { threshold: 0.6 }).observe(f);
});

/* ---------- Closing call to action: a soft light follows the cursor ---------- */
const cta = $('#lp-cta');
cta?.addEventListener('pointermove', (e) => {
  const r = cta.getBoundingClientRect();
  cta.style.setProperty('--mx', `${e.clientX - r.left}px`);
  cta.style.setProperty('--my', `${e.clientY - r.top}px`);
});

/* ---------- Closing wordmark: ZERONYM drawn in particles ----------
   Each particle has a home pixel taken from the rendered word. They gather
   when the section scrolls in, drift a little, and move away from the cursor. */
const wordBox = $('.lp-cta-word');
const WORD = wordBox?.dataset.word || 'ZERONYM';
const wordCanvas = $<HTMLCanvasElement>('#lp-word');
const wordCtx = wordCanvas?.getContext('2d');
if (cta && wordBox && wordCanvas && wordCtx) {
  type P = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; c: string; ph: number };
  let parts: P[] = [];
  let W = 0, H = 0, dpr = 1, raf = 0, visible = false, gathered = false;
  let px = -9999, py = -9999;
  const palette = ['#C8C5D0', '#E9E6F0', '#B999FF', '#8B3DFF', '#8E879C'];

  const build = () => {
    const r = wordCanvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    if (!W || !H) return;
    wordCanvas.width = Math.round(W * dpr); wordCanvas.height = Math.round(H * dpr);
    // Render the word once, off screen, and sample its pixels.
    const off = document.createElement('canvas');
    off.width = Math.round(W); off.height = Math.round(H);
    const o = off.getContext('2d')!;
    let fs = H * 1.18;
    o.font = `600 ${fs}px "Space Grotesk", Inter, sans-serif`;
    const tw = o.measureText(WORD).width;
    if (tw > W * 0.94) fs *= (W * 0.94) / tw;
    o.font = `600 ${fs}px "Space Grotesk", Inter, sans-serif`;
    if ('letterSpacing' in o) (o as any).letterSpacing = `${-fs * 0.04}px`;
    o.textAlign = 'center'; o.textBaseline = 'alphabetic';
    o.fillStyle = '#fff';
    o.fillText(WORD, W / 2, H * 0.97);
    const data = o.getImageData(0, 0, off.width, off.height).data;
    const step = W < 600 ? 3 : W < 1100 ? 4 : 5;
    const old = parts;
    parts = [];
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 140) {
          const t = x / W;
          const c = Math.random() < 0.12 ? palette[2 + ((Math.random() * 2) | 0)] : t > 0.72 && Math.random() < 0.45 ? palette[2] : palette[(Math.random() * 2) | 0];
          const prev = old[parts.length];
          parts.push({ hx: x, hy: y, x: prev ? prev.x : x, y: prev ? prev.y : y, vx: 0, vy: 0, c, ph: Math.random() * Math.PI * 2 });
        }
      }
    }
    if (!gathered && !isReduced()) parts.forEach((p) => { p.x = W / 2 + (Math.random() - 0.5) * W * 1.1; p.y = H + Math.random() * H * 1.5; });
    wordBox.classList.add('live');
    draw(performance.now(), true);
  };

  const size = () => (W < 600 ? 1.6 : 2.1);
  const draw = (now: number, still = false) => {
    wordCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wordCtx.clearRect(0, 0, W, H);
    const s = size();
    const t = now / 1000;
    const R = W < 600 ? 50 : 90;
    for (const p of parts) {
      if (!still) {
        // Spring toward home with a small drift, and push away from the cursor.
        const dx = p.x - px, dy = p.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) { const d = Math.sqrt(d2); const f = (1 - d / R) * 2.4; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
        const hx = p.hx + Math.sin(t * 0.9 + p.ph) * 0.8;
        const hy = p.hy + Math.cos(t * 0.7 + p.ph) * 0.8;
        p.vx += (hx - p.x) * (gathered ? 0.045 : 0); p.vy += (hy - p.y) * (gathered ? 0.045 : 0);
        p.vx *= 0.86; p.vy *= 0.86;
        p.x += p.vx; p.y += p.vy;
      }
      const tw = still ? 0.85 : 0.55 + 0.45 * Math.sin(t * 2 + p.ph * 3);
      wordCtx.globalAlpha = tw;
      wordCtx.fillStyle = p.c;
      wordCtx.fillRect(p.x, p.y, s, s);
    }
    wordCtx.globalAlpha = 1;
  };

  const loop = (now: number) => { draw(now); raf = visible ? requestAnimationFrame(loop) : 0; };
  const start = () => { if (!raf && !isReduced()) raf = requestAnimationFrame(loop); };

  cta.addEventListener('pointermove', (e) => { const r = wordCanvas.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; });
  cta.addEventListener('pointerleave', () => { px = py = -9999; });

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) {
      if (!gathered) setTimeout(() => { gathered = true; }, 150);
      start();
    }
  }, { threshold: 0.25 });

  const init = () => {
    if (isReduced()) gathered = true;
    build();
    io.observe(cta);
    let lastW = W;
    window.addEventListener('resize', () => {
      const w = wordCanvas.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 2) return;
      lastW = w; build();
    });
  };
  (document.fonts ? document.fonts.load('600 100px "Space Grotesk"').catch(() => null).then(() => document.fonts.ready) : Promise.resolve()).then(init);
}

/* ---------- Page hero: the glow follows the cursor ---------- */
const pgHero = $('.pg-hero');
pgHero?.addEventListener('pointermove', (e) => {
  const r = pgHero.getBoundingClientRect();
  pgHero.style.setProperty('--mx', `${e.clientX - r.left}px`);
  pgHero.style.setProperty('--my', `${e.clientY - r.top}px`);
});
