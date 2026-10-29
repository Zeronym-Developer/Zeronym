// How it works: the five-step switcher. Tabs on wide screens, a plain stack
// on phones and without JavaScript. Steps advance on their own while the
// switcher is in view, until the visitor picks one.
import './sections';

const root = document.getElementById('hw-steps');
if (root) {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tabbed = () => getComputedStyle(root.querySelector('.hw-tabs')!).display !== 'none';
  const STEP_MS = 6000;
  let idx = 0;
  let timer = 0;
  let manual = false;
  let inView = false;

  const show = (i: number, focus = false) => {
    idx = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === idx;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.remove('run');
    });
    panels.forEach((p, k) => p.classList.toggle('on', k === idx));
    if (focus) tabs[idx].focus();
    schedule();
  };

  const stop = () => { clearTimeout(timer); timer = 0; };
  const schedule = () => {
    stop();
    if (manual || !inView || reduced.matches || !tabbed()) return;
    const t = tabs[idx];
    void t.offsetWidth; // restart the progress bar
    t.classList.add('run');
    timer = window.setTimeout(() => show(idx + 1), STEP_MS);
  };
  const pick = (i: number, focus = false) => {
    manual = true;
    root.classList.add('manual');
    show(i, focus);
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(i));
    t.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); pick(idx + 1, true); }
      else if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); pick(idx - 1, true); }
      else if (k === 'Home') { e.preventDefault(); pick(0, true); }
      else if (k === 'End') { e.preventDefault(); pick(tabs.length - 1, true); }
    });
  });

  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (inView) schedule(); else { stop(); tabs.forEach((t) => t.classList.remove('run')); }
  }, { threshold: 0.5 }).observe(root);

  root.classList.add('ready');
}
