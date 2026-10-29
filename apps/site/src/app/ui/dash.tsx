// Shared dashboard pieces: panels, stat tiles, period maths and small avatars.
import type { ComponentChildren } from 'preact';
import { Icon } from './icons';
import { cx } from './kit';
import type { Activity } from '../lib/store';

export function Panel({ title, icon, sub, actions, children, class: cls, flush, id }: { title?: ComponentChildren; icon?: string; sub?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; class?: string; flush?: boolean; id?: string }) {
  return (
    <section class={cx('dp', flush && 'flush', cls)} id={id}>
      {(title || actions) && (
        <header class="dp-h">
          <div>{title && <h2>{icon && <Icon name={icon} size={17} />}{title}</h2>}{sub && <p>{sub}</p>}</div>
          {actions && <div class="dp-act">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** One number with a label, an optional change chip and a comparison line. */
export function Stat({ label, icon, value, sub, tone, delta, class: cls, title }: { label: string; icon?: string; value: ComponentChildren; sub?: ComponentChildren; tone?: string; delta?: ComponentChildren; class?: string; title?: string }) {
  return (
    <div class={cx('ds', tone && `ds-${tone}`, cls)} title={title}>
      <div class="ds-top">
        <p class="ds-l">{icon && <span class="ds-ic"><Icon name={icon} size={15} /></span>}{label}</p>
        {delta}
      </div>
      <div class="ds-v">{value}</div>
      {sub && <div class="ds-s">{sub}</div>}
    </div>
  );
}

/** Percent change as a small chip. `upIsGood` decides the colour. */
export function Delta({ pct, upIsGood = true }: { pct: number | null; upIsGood?: boolean }) {
  if (pct === null || !isFinite(pct)) return null;
  const up = pct > 0, flat = pct === 0;
  const good = flat ? null : up === upIsGood;
  return <span class={cx('dd', flat ? 'flat' : good ? 'good' : 'bad')}>{flat ? '↑' : up ? '↑' : '↓'} {Math.abs(pct)}%</span>;
}

// ---- Periods: this week or month, stepped back with an offset ----
export type Period = 'week' | 'month';
export function periodOf(p: Period, off: number, now = new Date()) {
  let start: Date, end: Date;
  if (p === 'month') {
    start = new Date(now.getFullYear(), now.getMonth() + off, 1);
    end = new Date(now.getFullYear(), now.getMonth() + off + 1, 1);
  } else {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start = new Date(d); start.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7);
    end = new Date(start); end.setDate(start.getDate() + 7);
  }
  return { start: start.getTime(), end: end.getTime() };
}
const dm = (t: number) => new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
export function periodLabel(p: Period, off: number) {
  const { start, end } = periodOf(p, off);
  if (p === 'month') return new Date(start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${dm(start)} – ${dm(end - 1)}`;
}
/** "September", "last week", "the week of 6 Oct". */
export function prevName(p: Period, off: number) {
  const { start } = periodOf(p, off - 1);
  if (p === 'month') return new Date(start).toLocaleDateString('en-US', { month: 'long' });
  return off === 0 ? 'last week' : `the week of ${dm(start)}`;
}

export type Flows = { in: bigint; out: bigint; net: bigint; moved: bigint; fees: bigint; n: number };
/** Credited totals of one asset between two times. */
export function flows(list: Activity[], symbol: string, from: number, to: number): Flows {
  const f: Flows = { in: 0n, out: 0n, net: 0n, moved: 0n, fees: 0n, n: 0 };
  for (const a of list) {
    if (a.asset !== symbol || a.status !== 'credited' || a.createdAt < from || a.createdAt >= to) continue;
    const v = BigInt(a.amount);
    if (a.kind === 'shield' || a.kind === 'receive') f.in += v;
    else if (a.kind === 'send' || a.kind === 'withdraw') f.out += v;
    else f.moved += v;
    if (a.kind !== 'shield' && a.kind !== 'receive') f.fees += BigInt(a.fee?.relayer || '0');
    f.n++;
  }
  f.net = f.in - f.out - f.fees;
  return f;
}
/** This period against the one before. For the current period, only up to the same point in time. */
export function compare(p: Period, off: number, list: Activity[], symbol: string) {
  const cur = periodOf(p, off), prev = periodOf(p, off - 1);
  const live = off === 0;
  const cutoff = live ? Math.min(prev.end, prev.start + (Date.now() - cur.start)) : prev.end;
  return { cur: flows(list, symbol, cur.start, cur.end), prev: flows(list, symbol, prev.start, cutoff), live };
}
export const pct = (a: bigint, b: bigint): number | null => (b === 0n ? null : Math.round(Number(((a - b) * 1000n) / (b < 0n ? -b : b))) / 10);

export const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
/** A soft round avatar with one letter, coloured from the seed. */
export function Avatar({ seed, label, size = 36 }: { seed: string; label?: string; size?: number }) {
  const h = hash(seed) % 360;
  const ch = (label || seed.replace(/^(zn1|0x)/i, '')).slice(0, 1).toUpperCase();
  return <span class="dav" style={{ width: size, height: size, '--h': h } as any} aria-hidden="true">{ch}</span>;
}

/** A progress ring: done of total. */
export function Ring({ done, total, size = 44 }: { done: number; total: number; size?: number }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  return (
    <span class="dring" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${total} done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} class="dring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} class="dring-fg" stroke-dasharray={`${(c * done) / total} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{done}/{total}</b>
    </span>
  );
}
