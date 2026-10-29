import { render } from 'preact';
import { App } from './App';
import { boot } from './lib/store';
import './lib/pool';

// Spotlight edge on cards, as on the marketing site: one listener sets the pointer position.
const LIT = '.dp, .ov5-tile, .ov5-step, .acard, .dstrip';
let lit: HTMLElement | null = null, raf = 0, px = 0, py = 0;
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  lit = (e.target as Element).closest?.(LIT) as HTMLElement | null; px = e.clientX; py = e.clientY;
  if (!raf) raf = requestAnimationFrame(() => {
    raf = 0; if (!lit) return;
    const r = lit.getBoundingClientRect();
    lit.style.setProperty('--mx', `${px - r.left}px`); lit.style.setProperty('--my', `${py - r.top}px`);
  });
}, { passive: true });

const root = document.getElementById('zn-app')!;
boot().then(() => render(<App />, root)).catch(() => render(<App />, root));
