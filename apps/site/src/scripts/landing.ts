// Landing page behaviour: the 3D pool scene, the scroll story, and the small
// interactive pieces. Everything here is an enhancement: the page reads fully
// without it, and motion follows the visitor's reduced-motion setting.
import type { SceneHandle, StreamSeed } from './pool-scene';

import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import './sections';

const root = document.documentElement;
const reducedQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reducedQ.matches;
const mobile = window.matchMedia('(max-width: 760px)').matches;
// Phones and tablets in landscape get the lighter scene too.
const lite = mobile || window.matchMedia('(pointer: coarse)').matches;

// Smooth scrolling (Lenis) for mouse wheels and trackpads. Touch keeps native scrolling,
// and visitors who ask for reduced motion get plain scrolling.
let lenis: Lenis | null = null;
const startLenis = () => { if (!lenis && !isReduced()) lenis = new Lenis({ autoRaf: true, anchors: { offset: -80 }, lerp: 0.09, wheelMultiplier: 0.9 }); };
const stopLenis = () => { lenis?.destroy(); lenis = null; };
startLenis();
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const $ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = document) => el.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = document) => Array.from(el.querySelectorAll(sel)) as T[];
root.classList.add('js');

/* Text scramble used by labels and the outro. */
const GLYPHS = '#%&*+=<>/\\|?@$0123456789abcdef';
const scrambles = new WeakMap<HTMLElement, number>();
function scramble(el: HTMLElement, to: string, dur = 520) {
  const id = (scrambles.get(el) || 0) + 1;
  scrambles.set(el, id);
  if (isReduced()) { el.textContent = to; return; }
  const from = el.textContent || '';
  const len = Math.max(from.length, to.length);
  const start = performance.now();
  const tick = (now: number) => {
    if (scrambles.get(el) !== id) return;
    const p = clamp((now - start) / dur);
    let out = '';
    for (let i = 0; i < len; i++) {
      const settle = 0.25 + (i / len) * 0.75;
      if (p >= settle) out += to[i] ?? '';
      else if (p < 0.2 && from[i] && Math.random() < 0.5) out += from[i];
      else out += i < to.length || p < 0.5 ? (to[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]) : '';
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Scene and scroll story ---------- */
const wrap = $('#lp-wrap');
const canvas = $<HTMLCanvasElement>('#lp-canvas');
const story = $('#lp-story');
const heroMain = $('.lp-hero-main');
const heroBits = $$('.lp-hero-top, .lp-hint');
const caps = story ? $$('.lp-cap', story) : [];
const railBtns = story ? $$<HTMLButtonElement>('.lp-rail button', story) : [];
const rail = $('.lp-rail');
const txEls = $$('.tx');
const vEls = $$('.vlabel');
const lensEl = $('#lp-lens');
let scene: SceneHandle | null = null;
let stage = 0;
let storyTop = 0; let storyH = 0; let vh = window.innerHeight;

if (story) story.classList.add('is-live');

const header = $('.site-header');
const setHeader = () => header?.classList.toggle('scrolled', window.scrollY > 8);

function measure() {
  vh = window.innerHeight;
  const pb = $('.preview-bar');
  const pbH = pb ? pb.offsetHeight : 0;
  root.style.setProperty('--pb-h', `${pbH}px`);
  root.style.setProperty('--lp-top', `${pbH + (header?.offsetHeight || 64)}px`);
  if (story) { storyTop = story.getBoundingClientRect().top + window.scrollY; storyH = story.offsetHeight; }
}

function stageFromScroll() {
  const y = window.scrollY;
  if (y < storyTop) return storyTop > 0 ? smooth(0.12, 1, y / storyTop) : 1;
  const len = Math.max(1, storyH - vh);
  const u = clamp((y - storyTop) / len) * 5;
  const k = Math.min(4, Math.floor(u));
  return 1 + k + (k < 4 ? smooth(0.5, 1, u - k) : 0);
}

function scrollToStage(k: number) {
  const len = Math.max(1, storyH - vh);
  const top = storyTop + ((k - 1) / 5) * len + len * 0.02;
  if (lenis) lenis.scrollTo(top, { duration: 1.4 });
  else window.scrollTo({ top, behavior: isReduced() ? 'auto' : 'smooth' });
}
railBtns.forEach((b) => b.addEventListener('click', () => scrollToStage(Number(b.dataset.k))));

let lastActive = -1;
function updateStory() {
  stage = stageFromScroll();
  scene?.setProgress(stage);
  const y = window.scrollY;
  const heroFade = 1 - smooth(0, Math.max(1, storyTop * 0.75), y);
  if (heroMain) { heroMain.style.opacity = String(heroFade); heroMain.style.transform = isReduced() ? '' : `translate3d(0, ${(-y * 0.18).toFixed(1)}px, 0)`; }
  heroBits.forEach((el) => { el.style.opacity = String(heroFade); });
  caps.forEach((c) => {
    const k = Number(c.dataset.k);
    const d = stage - k;
    const op = clamp(1 - Math.abs(d) / 0.42);
    c.style.opacity = c.querySelector(':focus-visible') ? '1' : op.toFixed(3);
    c.style.transform = isReduced() ? '' : `translate3d(0, ${(-d * 40).toFixed(1)}px, 0)`;
    c.classList.toggle('on', op > 0.5);
  });
  const active = Math.round(clamp(stage, 1, 5));
  if (active !== lastActive) {
    railBtns.forEach((b) => b.setAttribute('aria-current', Number(b.dataset.k) === active ? 'step' : 'false'));
    lastActive = active;
  }
  const inStory = y > storyTop - vh * 0.5 && y < storyTop + storyH - vh * 0.6;
  rail?.classList.toggle('show', inStory && stage > 0.6);
}

/* Labels that ride the stream, plus vault labels. */
const seeds: StreamSeed[] = txEls.map((_, i) => ({ x: (i / txEls.length + 0.07) % 1, z: 0.11 + i * 0.19, w: 0.3 + (i % 3) * 0.22, speed: 0.024 + (i % 2) * 0.004 }));
const txState = txEls.map(() => '');
const txMask = txEls.map(() => '');
const txLeft: number[] = [];
const txText = txEls.map((el) => $('span', el)!);
if (mobile) txEls.slice(3).forEach((el) => el.remove());
const twins = txEls.map((el) => {
  const t = el.cloneNode(true) as HTMLElement;
  t.setAttribute('aria-hidden', 'true');
  el.after(t);
  return t;
});
const twText = twins.map((el) => $('span', el)!);
const twState = twins.map(() => '');
const twMask = twins.map(() => '');
// Switch a badge between its public, encrypted and withdrawn text.
function setTx(i: number, states: string[], el: HTMLElement, text: HTMLElement, st: string) {
  if (st === states[i]) return;
  const first = states[i] === '';
  states[i] = st;
  el.classList.toggle('priv', st === 'priv');
  const target = st === 'priv' ? 'encrypted note' : st === 'in' ? el.dataset.in! : `withdrawn · ${el.dataset.out!}`;
  if (first) text.textContent = target; else scramble(text, target, st === 'priv' ? 420 : 560);
}
let V3: any = null;
let lensX = -999; let lensY = -999;

function updateLabels() {
  if (!scene || !V3) return;
  const w = scene.weights();
  const L = scene.lens();
  const n = mobile ? 3 : txEls.length;
  for (let i = 0; i < n; i++) {
    const el = txEls[i];
    const pt = scene.streamPoint(seeds[i], V3.a);
    const p = scene.project(V3.a);
    let vis = pt.vis * (p.on ? 1 : 0) * (1 - w.dim);
    // In the hero, keep labels out of the headline area.
    const H = Math.max(1, canvas!.clientHeight); const W = Math.max(1, canvas!.clientWidth);
    if (stage < 0.9) vis *= 1 - smooth(mobile ? 0.34 : 0.5, mobile ? 0.44 : 0.6, p.y / H) * (1 - stage);
    // Keep clear of the chapter rail on the right edge.
    if (stage > 0.5) vis *= 1 - smooth(W - 330, W - 230, p.x);
    const dx = p.x - L.x; const dy = p.y - L.y;
    const inLens = L.on > 0.5 && dx * dx + dy * dy < L.r * L.r;
    // Each badge has a twin for the far side of the portal. The original shows only what
    // hasn't gone in yet; the twin, already encrypted, shows only what has come out from
    // behind the ring. Together they read as one badge turning into its encrypted version.
    const tw = twins[i];
    const far = pt.along >= 0;
    setTx(i, txState, el, txText[i], inLens ? 'priv' : 'in');
    setTx(i, twState, tw, twText[i], !far || pt.priv > 0.5 || inLens ? 'priv' : 'out');
    const tf = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    el.style.transform = tf; tw.style.transform = tf;
    let front = '', back = '';
    let fo = far ? 0 : vis, bo = far ? vis : 0;
    if (vis > 0.01 && Math.abs(pt.along) < 6) {
      const left = p.x + (txLeft[i] ??= el.offsetLeft);
      const cut = scene.ringCut(seeds[i], p.y);
      const a = cut.inX - left;
      const b = cut.outX === null ? a : Math.max(a, cut.outX - left);
      fo = a > 0 ? vis : 0; bo = vis;
      if (fo) front = `linear-gradient(90deg, #000 ${a.toFixed(1)}px, transparent ${a.toFixed(1)}px)`;
      back = `linear-gradient(90deg, transparent ${b.toFixed(1)}px, #000 ${b.toFixed(1)}px)`;
    }
    el.style.opacity = fo.toFixed(3); tw.style.opacity = bo.toFixed(3);
    if (front !== txMask[i]) { txMask[i] = front; el.style.maskImage = front; el.style.webkitMaskImage = front; }
    if (back !== twMask[i]) { twMask[i] = back; tw.style.maskImage = back; tw.style.webkitMaskImage = back; }
  }
  vEls.forEach((el, k) => {
    scene!.vaultTop(k, V3.b);
    const p = scene!.project(V3.b);
    el.style.opacity = (smooth(0.55, 1, w.vault) * (1 - w.dim * 0.6)).toFixed(3);
    const W = canvas!.clientWidth;
    const x = Math.min(W - 78, Math.max(78, p.x));
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
  });
  if (lensEl) {
    lensX += (L.x - lensX) * 0.35; lensY += (L.y - lensY) * 0.35;
    lensEl.style.opacity = (L.on * (1 - w.vault) * 0.9).toFixed(3);
    lensEl.style.width = lensEl.style.height = `${(L.r * 2).toFixed(0)}px`;
    lensEl.style.transform = `translate3d(${(lensX - L.r).toFixed(1)}px, ${(lensY - L.r).toFixed(1)}px, 0)`;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

async function startScene() {
  if (!canvas || !wrap) return;
  if (!hasWebGL()) { wrap.classList.add('no-gl'); return; }
  wrap.classList.add('gl-loading');
  try {
    const { createPoolScene, vec3 } = await import('./pool-scene');
    V3 = { a: vec3(), b: vec3(), c: vec3() };
    scene = createPoolScene(canvas, { reduced: isReduced(), mobile: lite, onFrame: updateLabels });
    if (!scene) { wrap.classList.remove('gl-loading'); wrap.classList.add('no-gl'); return; }
    // Show the scene once its first frame has been drawn.
    requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.remove('gl-loading'); wrap.classList.add('gl-on'); }));
    scene.setProgress(stage);
    canvas.addEventListener('zeronym:lost', () => { wrap.classList.remove('gl-on'); wrap.classList.add('no-gl'); });
  } catch (err) {
    console.warn('Zeronym scene unavailable', err);
    wrap.classList.remove('gl-loading');
    wrap.classList.add('no-gl');
  }
}

reducedQ.addEventListener?.('change', () => { scene?.setReduced(isReduced()); if (isReduced()) stopLenis(); else startLenis(); updateStory(); });

let ticking = false;
const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; updateStory(); setHeader(); });
};
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { measure(); updateStory(); });
document.fonts?.ready.then(() => { measure(); updateStory(); });
new ResizeObserver(() => { measure(); updateStory(); }).observe(document.body);
measure();
updateStory();
setHeader();
startScene();

/* ---------- Disclosure receipt ---------- */
const btn = $('#disclose-btn');
const card = $('#receipt');
const label = $('#disclose-label');
btn?.addEventListener('click', () => {
  const on = btn.getAttribute('aria-pressed') !== 'true';
  btn.setAttribute('aria-pressed', String(on));
  card?.classList.toggle('open', on);
  card?.querySelectorAll<HTMLElement>('.v').forEach((el) => { el.hidden = !on; });
  if (label) label.textContent = on ? 'Disclosed · select to hide' : 'Disclose this receipt';
});

/* ---------- See the difference: rows arrive one by one when it scrolls in ---------- */
const cmp = $('#cmp');
const replay = $<HTMLButtonElement>('#cmp-replay');
if (cmp) {
  const play = () => {
    if (isReduced()) return;
    cmp.classList.remove('play'); cmp.classList.add('wait');
    void cmp.offsetWidth;
    requestAnimationFrame(() => { cmp.classList.remove('wait'); cmp.classList.add('play'); });
  };
  if (isReduced()) { if (replay) replay.hidden = true; }
  else {
    cmp.classList.add('wait');
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.35 });
    io.observe(cmp);
    replay?.addEventListener('click', play);
  }
}
