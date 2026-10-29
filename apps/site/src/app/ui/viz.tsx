// Interactive pieces for the action pages and overview: action tabs, amount entry,
// a live "what the explorer shows" preview, the pool visual and the privacy meter.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { AssetPicker, Card, Chip, Money, Seg, cx } from './kit';
import { useStore } from '../lib/store';
import { asset, formatUnits, parseUnits } from '../lib/amount';
import { score, type Finding } from '../lib/privacy';
import { href, type Route } from '../lib/router';
import { Panel } from './dash';
import { ActivityTable } from './activity';
import { NET } from '../lib/network';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function hash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

// ---- Action tabs: Shield / Send / Withdraw with a sliding indicator ----
const TABS: [Route, string, string][] = [['shield', 'Shield', 'shield'], ['send', 'Send', 'send'], ['withdraw', 'Withdraw', 'withdraw']];
let lastTab = -1;
export function ActionTabs({ current }: { current: Route }) {
  const idx = Math.max(0, TABS.findIndex(([r]) => r === current));
  const [pos, setPos] = useState(lastTab < 0 ? idx : lastTab);
  useEffect(() => { const id = requestAnimationFrame(() => setPos(idx)); lastTab = idx; return () => cancelAnimationFrame(id); }, [idx]);
  return (
    <nav class="atabs" aria-label="Actions" style={{ '--i': pos } as any}>
      <span class="atabs-ind" aria-hidden="true" />
      {TABS.map(([r, l, ic]) => (
        <a href={href(r)} class={cx('atabs-a', r === current && 'on')} aria-current={r === current ? 'page' : undefined}><Icon name={ic} size={16} />{l}</a>
      ))}
    </nav>
  );
}

// ---- Layout: action card with a side column ----
export function ActionShell({ current, children, side }: { current: Route; children: ComponentChildren; side: ComponentChildren }) {
  return (
    <>
      <div class="acon">
        <div class="acon-main">
          <ActionTabs current={current} />
          <Card class="acon-card">{children}</Card>
        </div>
        <aside class="acon-side">{side}</aside>
      </div>
      {(current === 'shield' || current === 'send' || current === 'withdraw') && <RecentOf kind={current} />}
    </>
  );
}

const RECENT: Record<string, string> = { shield: 'Recent shields', send: 'Recent private sends', withdraw: 'Recent withdrawals' };
function RecentOf({ kind }: { kind: 'shield' | 'send' | 'withdraw' }) {
  const list = useStore((s) => s.activity.filter((a) => a.kind === kind));
  if (!list.length) return null;
  return (
    <Panel title={RECENT[kind]} class="acon-recent" actions={<a class="alink" href={href('activity', { q: `kind:${kind}` })}>View all <Icon name="chevron" size={14} /></a>}>
      <ActivityTable list={list} limit={5} />
    </Panel>
  );
}

export function Pane({ label, icon, right, tone, children, class: cls }: { label: string; icon?: string; right?: ComponentChildren; tone?: 'pub' | 'priv'; children: ComponentChildren; class?: string }) {
  return (
    <section class={cx('apane', tone, cls)}>
      <header class="apane-h"><span class="apane-l">{icon && <Icon name={icon} size={14} />}{label}</span>{right}</header>
      {children}
    </section>
  );
}

/** The round link between the two panes. It spins while an amount is set. */
export function PaneLink({ active, icon = 'down', label }: { active: boolean; icon?: string; label: string }) {
  return <div class={cx('alinkr', active && 'on')} role="img" aria-label={label}><span class="alinkr-b"><Icon name={icon} size={18} /></span></div>;
}

// ---- Identicon: a small mirrored grid drawn from an address ----
export function Identicon({ seed, size = 28 }: { seed: string; size?: number }) {
  const h = hash(seed.toLowerCase());
  const hue = h % 360;
  let x = h || 1;
  const cells: [number, number][] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    if (x % 2) { cells.push([c, r]); if (c < 2) cells.push([4 - c, r]); }
  }
  return (
    <svg class="aident" width={size} height={size} viewBox="-1 -1 7 7" aria-hidden="true" style={{ background: `hsl(${hue} 45% 13%)` }}>
      {cells.map(([c, r]) => <rect x={c} y={r} width="1.02" height="1.02" fill={`hsl(${hue} 75% 68%)`} />)}
    </svg>
  );
}

// ---- Scrambled text for encrypted fields ----
const HEX = '0123456789abcdef';
const rnd = (n: number) => Array.from({ length: n }, () => HEX[(Math.random() * 16) | 0]).join('');
export function Scramble({ len = 10 }: { len?: number }) {
  const [t, setT] = useState(() => rnd(len));
  useEffect(() => {
    if (reduced()) return;
    const id = setInterval(() => setT(rnd(len)), 110);
    return () => clearInterval(id);
  }, [len]);
  return <span class="ascr z-data">{t}</span>;
}

// ---- Amount entry: big number, asset pill, balance, slider and presets ----
export function AmountEntry({ symbol, onSymbol, value, onValue, available, reserve = 0n, balanceLabel = 'Balance', balances, any }: {
  symbol: string; onSymbol: (s: string) => void; value: string; onValue: (v: string) => void;
  available: bigint; reserve?: bigint; balanceLabel?: string; balances?: Record<string, bigint>; any?: boolean;
}) {
  const a = asset(symbol);
  const parsed = value ? parseUnits(value, a.decimals) : 0n;
  const bad = value !== '' && parsed === null;
  const max = available - reserve > 0n ? available - reserve : 0n;
  const over = !any && parsed != null && parsed > 0n && parsed > max;
  const pct = !any && max > 0n && parsed ? Math.min(100, Number((parsed * 1000n) / max) / 10) : 0;
  const set = (v: bigint) => onValue(v > 0n ? formatUnits(v, a.decimals, { max: a.decimals }).replace(/,/g, '') : '');
  const len = value.length;
  return (
    <div class={cx('aentry', (bad || over) && 'err')}>
      <div class="aentry-row">
        <input id="amt" inputMode="decimal" autocomplete="off" placeholder="0" value={value} aria-invalid={bad || over} aria-label="Amount"
          style={{ fontSize: len > 14 ? '26px' : len > 9 ? '34px' : undefined }}
          onInput={(e) => onValue((e.target as HTMLInputElement).value.replace(/[^\d.]/g, ''))} />
        <AssetPicker value={symbol} onChange={onSymbol} balances={balances} />
      </div>
      {!any && (
        <>
          <div class="aentry-meta">
            <span class="aentry-name">{a.name}</span>
            <button type="button" class="aentry-bal" onClick={() => set(max)} disabled={max === 0n}>{balanceLabel}: <Money v={available} symbol={symbol} /><b>Max</b></button>
          </div>
          <div class="aentry-slide" style={{ '--p': `${pct}%` } as any}>
            <input type="range" min="0" max="100" step="1" value={Math.round(pct)} aria-label="Share of your balance" disabled={max === 0n}
              onInput={(e) => set((max * BigInt((e.target as HTMLInputElement).value)) / 100n)} />
            <div class="aentry-ticks">
              {[25, 50, 75, 100].map((p) => <button type="button" class={cx(max > 0n && Math.round(pct) === p && 'on')} disabled={max === 0n} onClick={() => set((max * BigInt(p)) / 100n)}>{p === 100 ? 'Max' : `${p}%`}</button>)}
            </div>
          </div>
        </>
      )}
      {bad && <p class="aentry-msg">Use up to {a.decimals} decimal places.</p>}
      {!bad && over && <p class="aentry-msg">That's more than you have{reserve > 0n ? ' after the fee' : ''}.</p>}
    </div>
  );
}

export function Summary({ rows }: { rows: [ComponentChildren, ComponentChildren][] }) {
  return <dl class="asum">{rows.map(([k, v]) => <div><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

// ---- Privacy meter: a gauge with the checks behind it ----
const LABEL = { good: 'Looks good', fair: 'Some risk', weak: 'Easy to link' };
const POS = { good: 84, fair: 50, weak: 16 };
export function PrivacyMeter({ list, idle = 'Enter an amount to run the privacy check.' }: { list: Finding[]; idle?: string }) {
  const [open, setOpen] = useState(false);
  const worst = list.length ? score(list) : null;
  return (
    <div class={cx('ameter', worst || 'idle', open && 'open')}>
      <button type="button" class="ameter-h" aria-expanded={open} disabled={!worst} onClick={() => setOpen(!open)}>
        <span class="ameter-t"><Icon name="shield" size={16} />Privacy check</span>
        <span class="ameter-l">{worst ? LABEL[worst] : 'Waiting'}</span>
        {worst && <span class="ameter-n">{list.length} {list.length === 1 ? 'check' : 'checks'}<Icon name="down" size={14} /></span>}
      </button>
      <div class="ameter-track" aria-hidden="true"><i /><i /><i /><span class="ameter-pin" style={{ left: `${worst ? POS[worst] : 50}%` }} /></div>
      {!worst && <p class="ameter-idle">{idle}</p>}
      {worst && open && (
        <div class="ameter-body">
          <ul>
            {list.map((f) => <li class={f.level}><span class="ameter-sym" aria-hidden="true">{f.level === 'good' ? '✓' : f.level === 'fair' ? '!' : '✕'}</span><div><b>{f.title}</b><small>{f.body}</small></div></li>)}
          </ul>
          <p class="ameter-foot">These checks catch common patterns. Passing them doesn't guarantee privacy.</p>
        </div>
      )}
    </div>
  );
}

// ---- Explorer preview: what the chain shows, next to what only you see ----
export type PRow = { k: string; pub: ComponentChildren | null; me?: ComponentChildren; len?: number };
export function ChainPreview({ rows, title, foot }: { rows: PRow[]; title: string; foot?: ComponentChildren }) {
  const [view, setView] = useState<'out' | 'me'>('out');
  const hidden = rows.filter((r) => r.pub == null).length;
  return (
    <Card class={cx('aprev', view)}>
      <header class="aprev-h">
        <p class="akicker"><Icon name={view === 'out' ? 'globe' : 'eye'} size={14} />{title}</p>
        <Seg label="Point of view" value={view} onChange={setView} options={[['out', 'Explorer'], ['me', 'You']]} />
      </header>
      <div class="aprev-fig">
      <div class="aprev-win">
      <div class="aprev-bar"><i /><i /><i /><b>{view === 'out' ? 'Block explorer' : 'Your view'}</b><span class="aprev-st"><i />Preview</span></div>
      <div class="aprev-tx">
        <span class="aprev-hash"><b>Tx</b> 0x<Scramble len={14} /></span>
      </div>
      <dl class="aprev-dl">
        {rows.map((r) => {
          const hid = r.pub == null;
          return (
            <div class={cx(hid && 'hid')}>
              <dt>{r.k}</dt>
              <dd>{hid
                ? (view === 'me' ? <span class="aprev-me">{r.me}<em>only you</em></span> : <span class="aprev-lock"><Icon name="lock" size={12} /><Scramble len={r.len || 10} /></span>)
                : r.pub}</dd>
            </div>
          );
        })}
      </dl>
      </div>
      </div>
      <p class="aprev-foot">{foot || <><b>{hidden}</b> of {rows.length} fields stay encrypted on chain. Switch to <em>You</em> to see them.</>}</p>
    </Card>
  );
}

// ---- Pool visual: every note in the pool as a point on a tilted disc ----
type Dot = { r: number; a: number; s: number; z: number; born: number };
export function PoolPulse({ title = 'Shielded pool' }: { title?: string }) {
  const tn = useStore((s) => s.mode === 'testnet');
  const size = useStore((s) => s.tn.poolSize);
  const synced = useStore((s) => s.tn.synced);
  const relayer = useStore((s) => !!s.tn.relayer);
  const demo = useStore((s) => s.activity.filter((a) => a.status === 'credited').length * 2);
  const n = tn ? size : demo;
  const txs = Math.floor(n / 2);
  const ref = useRef<HTMLCanvasElement>(null);
  const nRef = useRef(n);
  nRef.current = n;

  useLayoutEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dots: Dot[] = [];
    const add = (born: number) => dots.push({ r: 0.34 + Math.random() * 0.62, a: Math.random() * Math.PI * 2, s: 0.08 + Math.random() * 0.16, z: Math.random(), born });
    let w = 0, h = 0, raf = 0, seen = true, t0 = performance.now();
    const still = reduced();
    const fit = () => {
      const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
      w = r.width; h = r.height; cv.width = Math.round(w * d); cv.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const draw = (now: number) => {
      const want = Math.min(nRef.current, 220);
      while (dots.length < want) add(still || now - t0 < 400 ? 0 : now);
      if (dots.length > want) dots.length = want;
      const t = (now - t0) / 1000;
      const cx0 = w / 2, cy0 = h / 2, R = Math.min(w * 0.46, h * 0.95), tilt = 0.38;
      ctx.clearRect(0, 0, w, h);
      // core glow
      const g = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, R * 0.55);
      g.addColorStop(0, 'rgba(185,153,255,.55)'); g.addColorStop(0.35, 'rgba(139,61,255,.22)'); g.addColorStop(1, 'rgba(139,61,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx0, cy0, R * 0.55, R * 0.55 * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      // orbit rings
      ctx.lineWidth = 1;
      for (const k of [0.36, 0.62, 0.96]) {
        ctx.strokeStyle = `rgba(200,197,208,${k === 0.96 ? 0.16 : 0.1})`;
        ctx.beginPath(); ctx.ellipse(cx0, cy0, R * k, R * k * tilt, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // pulse
      if (!still) {
        const p = (t % 3.2) / 3.2;
        ctx.strokeStyle = `rgba(185,153,255,${0.35 * (1 - p)})`;
        ctx.beginPath(); ctx.ellipse(cx0, cy0, R * (0.2 + p * 0.8), R * (0.2 + p * 0.8) * tilt, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // notes
      for (const d of dots) {
        const age = d.born ? Math.min(1, (now - d.born) / 1400) : 1;
        const ease = 1 - Math.pow(1 - age, 3);
        const rr = d.r * (1.6 - 0.6 * ease);
        const a = d.a + (still ? 0 : t * d.s);
        const x = cx0 + Math.cos(a) * R * rr, y = cy0 + Math.sin(a) * R * rr * tilt;
        const front = Math.sin(a) > 0;
        const size = (front ? 1.9 : 1.3) + d.z * 0.9;
        ctx.fillStyle = age < 1 ? `rgba(244,242,248,${0.4 + 0.6 * ease})` : front ? `rgba(217,204,255,${0.75 + d.z * 0.25})` : `rgba(160,140,220,${0.35 + d.z * 0.3})`;
        ctx.beginPath(); ctx.arc(x, y, age < 1 ? size + 2.5 * (1 - ease) : size, 0, Math.PI * 2); ctx.fill();
      }
      // core
      ctx.fillStyle = 'rgba(244,242,248,.9)'; ctx.beginPath(); ctx.ellipse(cx0, cy0, 3.2, 3.2 * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    };
    const loop = (now: number) => { draw(now); if (!still && seen) raf = requestAnimationFrame(loop); };
    fit(); raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { fit(); if (still) draw(performance.now()); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { const was = seen; seen = e.isIntersecting; if (seen && !was) raf = requestAnimationFrame(loop); });
    io.observe(cv);
    const redraw = still ? setInterval(() => draw(performance.now()), 2000) : 0;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); if (redraw) clearInterval(redraw); };
  }, []);

  return (
    <Card class="apulse">
      <header class="apulse-h">
        <p class="akicker"><Icon name="lock" size={14} />{title}</p>
        {tn ? <Chip tone={synced ? 'ok' : 'neutral'} dot={!!synced}>{synced ? (NET.isTestnet ? 'Live on testnet' : 'Live on Robinhood Chain') : 'Syncing…'}</Chip> : <Chip tone="neutral">Demo</Chip>}
      </header>
      <canvas ref={ref} class="apulse-c" aria-label={`${n.toLocaleString('en-US')} notes in the pool`} role="img" />
      <div class="apulse-stats">
        <div><b>{n.toLocaleString('en-US')}</b><small>Notes in the pool</small></div>
        <div><b>{txs.toLocaleString('en-US')}</b><small>Transactions</small></div>
        <div><b class={cx('apulse-dot', tn && relayer ? 'ok' : 'off')}>{tn ? (relayer ? 'Online' : 'Offline') : 'n/a'}</b><small>Relayer</small></div>
      </div>
      <p class="apulse-foot">{tn
        ? (txs < 200 ? `Each point is a note. This ${NET.isTestnet ? 'testnet ' : ''}pool is small, so activity in it is easier to trace.` : 'Each point is a note. A bigger pool hides you among more people.')
        : 'Demo mode: the points are your simulated notes.'}{tn && synced ? <> Synced to block <span class="z-data">{synced.toLocaleString('en-US')}</span>.</> : null}</p>
    </Card>
  );
}
