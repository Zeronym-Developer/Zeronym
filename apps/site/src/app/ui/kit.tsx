// Shared building blocks for the Zeronym app.
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { encode } from 'uqr';
import { Icon } from './icons';
import { ASSETS, asset, formatUnits, parseUnits, NETWORK_FEE_ETH } from '../lib/amount';
import { useStore, getState, type Activity, type Fee, type Status, type Kind } from '../lib/store';
import { NET } from '../lib/network';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Btn(p: { kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: string; iconRight?: string; disabled?: boolean; type?: 'button' | 'submit'; onClick?: (e: MouseEvent) => void; href?: string; children?: ComponentChildren; class?: string; block?: boolean; title?: string; ariaLabel?: string }) {
  const c = cx('ab', `ab-${p.kind || 'secondary'}`, `ab-${p.size || 'md'}`, p.block && 'ab-block', !p.children && 'ab-icon', p.class);
  const inner = <>{p.icon && <Icon name={p.icon} size={p.size === 'sm' ? 16 : 18} />}{p.children && <span>{p.children}</span>}{p.iconRight && <Icon name={p.iconRight} size={16} />}</>;
  if (p.href) return <a class={c} href={p.href} title={p.title} aria-label={p.ariaLabel} target={p.href.startsWith('http') ? '_blank' : undefined} rel={p.href.startsWith('http') ? 'noopener noreferrer' : undefined}>{inner}</a>;
  return <button type={p.type || 'button'} class={c} disabled={p.disabled} onClick={p.onClick} title={p.title} aria-label={p.ariaLabel}>{inner}</button>;
}

export function Card(p: { children: ComponentChildren; class?: string; pad?: boolean; glow?: boolean; as?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return <div ref={ref} onPointerMove={onMove} class={cx('acard', p.pad !== false && 'acard-pad', p.glow && 'acard-glow', p.class)}>{p.children}</div>;
}

export function Note(p: { tone?: 'info' | 'warn' | 'danger' | 'ok' | 'pub' | 'priv'; title?: string; children?: ComponentChildren; icon?: string; class?: string }) {
  const tone = p.tone || 'info';
  const ic = p.icon || { info: 'info', warn: 'warn', danger: 'warn', ok: 'check', pub: 'globe', priv: 'lock' }[tone];
  return (
    <div class={cx('anote', `anote-${tone}`, p.class)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={ic} size={18} />
      <div>{p.title && <b>{p.title}</b>}{p.children && <div class="anote-body">{p.children}</div>}</div>
    </div>
  );
}

export function Chip(p: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'violet' | 'pub' | 'priv'; children: ComponentChildren; dot?: boolean; icon?: string; class?: string; title?: string }) {
  return <span class={cx('achip', `achip-${p.tone || 'neutral'}`, p.class)} title={p.title}>{p.dot && <i class="achip-dot" />}{p.icon && <Icon name={p.icon} size={14} />}{p.children}</span>;
}

// Status with label and symbol, never colour alone (R3.2).
const STATUS: Record<Status, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'bad' | 'violet'; sym: string }> = {
  swapping: { label: 'Swap in wallet', tone: 'warn', sym: '◌' },
  approving: { label: 'Approve in wallet', tone: 'warn', sym: '◌' },
  proving: { label: 'Building proof', tone: 'violet', sym: '◌' },
  signing: { label: 'Confirm in wallet', tone: 'warn', sym: '◌' },
  scheduled: { label: 'Waiting to submit', tone: 'neutral', sym: '◷' },
  submitted: { label: 'Submitted', tone: 'neutral', sym: '↑' },
  confirming: { label: 'Confirming', tone: 'warn', sym: '◔' },
  credited: { label: 'Credited', tone: 'ok', sym: '✓' },
  failed: { label: 'Failed', tone: 'bad', sym: '✕' },
};
export function statusLabel(a: Activity) {
  if (a.status !== 'credited') return STATUS[a.status].label;
  return a.kind === 'send' ? 'Sent' : a.kind === 'withdraw' ? 'Withdrawn' : 'Credited';
}
export function StatusPill({ a }: { a: Activity }) {
  const s = STATUS[a.status];
  const live = a.status !== 'credited' && a.status !== 'failed';
  return <span class={cx('astatus', `achip-${s.tone}`, live && 'live')}><span class="astatus-sym" aria-hidden="true">{s.sym}</span>{statusLabel(a)}</span>;
}

// A number that can be hidden by the privacy screen toggle.
export function Money({ v, symbol, sign, big, hideSymbol }: { v: bigint | string; symbol: string; sign?: boolean; big?: boolean; hideSymbol?: boolean }) {
  const hide = useStore((s) => s.prefs.hideBalances);
  const a = asset(symbol);
  const txt = formatUnits(v, a.decimals, { min: a.decimals === 2 ? 2 : 0, sign });
  if (hide) return <span class={cx('amoney', 'masked', big && 'big')} aria-label="Hidden">••••••{!hideSymbol && <small> {symbol}</small>}</span>;
  return <span class={cx('amoney', big && 'big')}>{txt}{!hideSymbol && <small> {symbol}</small>}</span>;
}

// Official token logos, served from /tokens. Tokens without one get a lettered disc.
const LOGO: Record<string, string> = { USDG: '/tokens/usdg.svg', ETH: '/tokens/eth.svg', tZNYM: '/zeronym-icon.webp' };
export function AssetGlyph({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const src = LOGO[symbol];
  if (src) return <span class={cx('aglyph', 'aglyph-img', `aglyph-${symbol}`)} style={{ width: size, height: size }} aria-hidden="true"><img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" /></span>;
  const g = symbol === 'tUSD' ? '$' : symbol.slice(0, 1);
  return <span class={cx('aglyph', `aglyph-${symbol}`)} style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden="true">{g}</span>;
}

export function AssetPicker({ value, onChange, balances }: { value: string; onChange: (s: string) => void; balances?: Record<string, bigint> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div class="apick" ref={ref}>
      <button type="button" class="apick-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <AssetGlyph symbol={value} size={24} /><b>{value}</b><Icon name="down" size={16} />
      </button>
      {open && (
        <div class="apick-menu" role="listbox">
          {ASSETS.filter((a) => !a.retired || a.symbol === value).map((a) => (
            <button type="button" role="option" aria-selected={a.symbol === value} class={cx('apick-opt', a.symbol === value && 'on')} onClick={() => { onChange(a.symbol); setOpen(false); }}>
              <AssetGlyph symbol={a.symbol} size={30} />
              <span><b>{a.symbol}</b><small>{a.name}</small></span>
              {balances && <span class="apick-bal"><Money v={balances[a.symbol] ?? 0n} symbol={a.symbol} hideSymbol /></span>}
            </button>
          ))}
          <p class="apick-foot">Only standard tokens from the deployment record are listed. Rebasing, fee-on-transfer and callback tokens aren't supported.</p>
        </div>
      )}
    </div>
  );
}

// Big amount input with asset picker, max button and live validation.
export function AmountField({ label, symbol, onSymbol, value, onValue, available, availableLabel = 'Available', reserve = 0n }: { label: string; symbol: string; onSymbol: (s: string) => void; value: string; onValue: (v: string) => void; available: bigint; availableLabel?: string; reserve?: bigint }) {
  const a = asset(symbol);
  const parsed = value ? parseUnits(value, a.decimals) : 0n;
  const bad = value !== '' && parsed === null;
  const over = parsed != null && parsed + (parsed > 0n ? reserve : 0n) > available;
  const max = available - reserve > 0n ? available - reserve : 0n;
  const open = available >= 10n ** 27n; // "any amount": no balance to show, no shortcuts
  return (
    <div class={cx('aamount', (bad || over) && 'err')}>
      <div class="aamount-top"><label for="amt">{label}</label><span>{open ? availableLabel : <>{availableLabel}: <Money v={available} symbol={symbol} /></>}</span></div>
      <div class="aamount-row">
        <input id="amt" inputMode="decimal" autocomplete="off" placeholder="0" value={value} aria-invalid={bad || over}
          onInput={(e) => onValue((e.target as HTMLInputElement).value.replace(/[^\d.]/g, ''))} />
        {!open && <button type="button" class="aamount-max" onClick={() => onValue(formatUnits(max, a.decimals, { max: a.decimals }).replace(/,/g, ''))}>Max</button>}
        <AssetPicker value={symbol} onChange={onSymbol} />
      </div>
      {!open && <div class="aamount-quick">
        {[25, 50, 75].map((p) => (
          <button type="button" onClick={() => onValue(formatUnits((max * BigInt(p)) / 100n, a.decimals, { max: a.decimals }).replace(/,/g, ''))}>{p}%</button>
        ))}
      </div>}
      {bad && <p class="aamount-msg">Use up to {a.decimals} decimal places.</p>}
      {!bad && over && <p class="aamount-msg">That's more than you have{reserve > 0n ? ' after fees' : ''}.</p>}
    </div>
  );
}

// Fee breakdown shown before every authorization (R3.8).
export function FeeTable({ kind, symbol, amount, fee, ethMax }: { kind: Kind; symbol: string; amount: bigint; fee?: Fee; /** Paying with ETH: the most the swap can take. */ ethMax?: bigint }) {
  const tn = useStore((s) => s.mode === 'testnet');
  const via = useStore((s) => (s.tn.relayer ? 'relayer' : 'wallet'));
  const a = asset(symbol);
  const f = (v: bigint) => `${formatUnits(v, a.decimals, { min: a.decimals === 2 ? 2 : 0 })} ${symbol}`;
  if (tn) {
    const relayer = kind === 'shield' ? 0n : BigInt(fee?.relayer ?? (via === 'relayer' ? getState().tn.relayer?.fees[symbol] || '0' : '0'));
    const wallet = kind === 'shield' || (via === 'wallet' && relayer === 0n);
    return (
      <div class="afees">
        <div class="afees-row"><span>Protocol fee</span><span>{f(0n)}</span></div>
        {wallet ? (
          <div class="afees-row"><span>Network fee <small>paid in {NET.isTestnet ? 'testnet ' : ''}ETH by your wallet{ethMax != null ? ', for all three steps' : ''}</small></span><span>≈ {ethMax != null ? '0.00005' : '0.000012'} ETH</span></div>
        ) : (
          <div class="afees-row"><span>Relayer fee <small>the relayer pays the network fee</small></span><span>{f(relayer)}</span></div>
        )}
        <div class="afees-row total"><span>{kind === 'shield' ? 'Leaves your wallet' : 'Total from your balance'}{ethMax != null && <small>at most, plus the network fee</small>}</span><span>{ethMax != null ? `${formatUnits(ethMax, 18, { max: 6 })} ETH` : f(amount + relayer)}</span></div>
        {NET.isTestnet ? <p class="afees-foot">Testnet fees. Test tokens have no value.</p> : !wallet && <p class="afees-foot">The relayer fee covers the network fee it pays for you.</p>}
      </div>
    );
  }
  const relayer = kind === 'shield' ? 0n : parseUnits(a.fee.relayer, a.decimals) || 0n;
  const max = (relayer * 3n) / 2n;
  return (
    <div class="afees">
      <div class="afees-row"><span>Protocol fee</span><span>{f(0n)}</span></div>
      {kind === 'shield' ? (
        <div class="afees-row"><span>Network fee <small>paid by your wallet</small></span><span>≈ {NETWORK_FEE_ETH} ETH</span></div>
      ) : (
        <>
          <div class="afees-row"><span>Relayer fee <small>covers the ≈ {NETWORK_FEE_ETH} ETH network fee</small></span><span>{f(relayer)}</span></div>
          <div class="afees-row max"><span>Maximum fee you sign <small>the relayer can't charge more</small></span><span>{f(max)}</span></div>
        </>
      )}
      <div class="afees-row total"><span>{kind === 'shield' ? 'Leaves your wallet' : 'Total from your balance'}</span><span>{f(amount + relayer)}</span></div>
      <p class="afees-foot">Demo estimates. The real fee schedule isn't published yet.</p>
    </div>
  );
}

// Live progress of one action: proof, submission, confirmation, credit.
type Step = { k: Status; t: string; d: string };
function stepsFor(a: Activity): Step[] {
  const done: Step = { k: 'credited', t: a.kind === 'withdraw' ? 'Withdrawn' : a.kind === 'send' ? 'Sent' : 'Credited', d: a.kind === 'shield' ? 'Now spendable inside the pool.' : a.kind === 'withdraw' ? (a.toEth ? `${a.toEth.got ? formatUnits(BigInt(a.toEth.got), 18, { max: 6 }) + ' ETH is' : 'The ETH is'} at the public address.` : 'Funds are at the public address.') : a.kind === 'move' ? 'Now spendable in the new vault.' : 'The recipient can now see it.' };
  const confirm: Step = { k: 'confirming', t: 'Confirm on chain', d: a.net ? `Waiting for ${NET.name}.` : 'Waiting for the block to be final.' };
  if (a.net === 'testnet') {
    if (a.kind === 'shield') return [
      ...(a.payEth ? [{ k: 'swapping' as Status, t: `Swap ETH for ${a.asset}`, d: `Your wallet swaps ETH for exactly this amount on Uniswap. Unused ETH comes straight back.` }] : []),
      ...(a.txs?.length || a.status === 'approving' || a.payEth ? [{ k: 'approving' as Status, t: `Approve ${a.asset}`, d: 'Your wallet lets the pool take this amount.' }] : []),
      { k: 'proving', t: 'Build proof', d: 'In this browser. The first time, it downloads the 12 MB prover.' },
      { k: 'signing', t: 'Confirm the deposit', d: 'Your wallet sends a public deposit.' }, confirm, done,
    ];
    return [
      { k: 'proving', t: a.step || 'Build proof', d: a.step ? 'Your balance was split across too many notes. This joins two of them.' : 'In this browser. Your keys never leave the device.' },
      ...(a.delayed && a.via === 'relayer' ? [{ k: 'scheduled' as Status, t: 'Wait for a random moment', d: 'Delayed submission is on. Keep this tab open.' }] : []),
      a.via === 'wallet'
        ? { k: 'signing', t: 'Confirm in your wallet', d: 'The relayer is unavailable, so your wallet submits it and is linked to it.' }
        : { k: 'submitted', t: 'Send to the relayer', d: a.toEth ? `The relayer submits it and pays the network fee. The same transaction swaps the ${a.asset} for ETH on Uniswap.` : 'The relayer submits it and pays the network fee.' },
      confirm, done,
    ];
  }
  const private_ = a.kind !== 'shield' && a.kind !== 'receive';
  return [
    ...(private_ ? [{ k: 'proving' as Status, t: 'Build proof', d: 'In this browser. Your keys never leave the device.' }] : []),
    ...(a.delayed ? [{ k: 'scheduled' as Status, t: 'Wait for a random moment', d: 'Delayed submission is on.' }] : []),
    { k: 'submitted', t: private_ ? 'Send to the relayer' : 'Send the deposit', d: private_ ? 'The relayer submits it and pays the network fee.' : 'Your wallet submits a public transaction.' },
    confirm, done,
  ];
}
export function Progress({ a }: { a: Activity }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 200); return () => clearInterval(t); }, []);
  const steps = stepsFor(a);
  const order = steps.map((s) => s.k);
  const failedAt = a.net ? Math.max(0, order.indexOf(a.at || order[0])) : order.indexOf('confirming');
  const cur = a.status === 'failed' ? failedAt : order.indexOf(a.status);
  const now = Date.now();
  const pct = a.status === 'credited' ? 100
    : a.net ? Math.min(96, Math.max(4, ((cur + 0.5) / steps.length) * 100))
    : Math.min(99, Math.max(2, ((now - a.createdAt) / (a.plan.done - a.createdAt)) * 100));
  return (
    <div class={cx('aprog', a.status === 'failed' && 'failed')}>
      <div class="aprog-bar"><i style={{ width: `${pct}%` }} /></div>
      <ol>
        {steps.map((s, i) => {
          const st = a.status === 'credited' || i < cur ? 'done' : i === cur ? (a.status === 'failed' ? 'fail' : 'now') : 'todo';
          return (
            <li class={st}>
              <span class="aprog-dot">{st === 'done' ? <Icon name="check" size={14} /> : st === 'fail' ? <Icon name="x" size={14} /> : <i />}</span>
              <div><b>{st === 'fail' ? 'Failed' : s.t}</b><small>{st === 'fail' ? a.error || 'The transaction did not go through. Nothing was spent.' : s.d}</small></div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// locked: a required step. No close button, and Escape or a backdrop click doesn't close it.
export function Modal({ open, onClose, title, children, wide, locked, class: cls }: { open: boolean; onClose: () => void; title: string; children: ComponentChildren; wide?: boolean; locked?: boolean; class?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} class={cx('amodal', wide && 'wide', cls)} onClose={onClose} onCancel={(e) => { if (locked) e.preventDefault(); }} onClick={(e) => { if (!locked && e.target === ref.current) onClose(); }}>
      {open && (
        <div class="amodal-in">
          <header><h2>{title}</h2>{!locked && <Btn kind="ghost" size="sm" icon="x" onClick={onClose} ariaLabel="Close" />}</header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Copy({ text, label = 'Copy', small }: { text: string; label?: string; small?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <Btn kind="ghost" size={small ? 'sm' : 'md'} icon={ok ? 'check' : 'copy'} onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); } catch { /* clipboard blocked */ } }}>
      {ok ? 'Copied' : label}
    </Btn>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: ComponentChildren }) {
  return (
    <label class="atoggle">
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="aseg" role="radiogroup" aria-label={label}>
      {options.map(([v, t]) => <button type="button" role="radio" aria-checked={v === value} class={cx(v === value && 'on')} onClick={() => onChange(v)}>{t}</button>)}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ComponentChildren }) {
  return <div class="aempty"><span class="aempty-ic"><Icon name={icon} size={24} /></span><b>{title}</b>{children && <div>{children}</div>}</div>;
}

export function Qr({ text, size = 168, ecc = 'M' }: { text: string; size?: number; ecc?: 'L' | 'M' | 'Q' | 'H' }) {
  const { data, size: n } = encode(text, { ecc, border: 1 });
  const cell = size / n;
  let d = '';
  data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${(x * cell).toFixed(2)} ${(y * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`; }));
  return <svg class="aqr" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code"><rect width={size} height={size} fill="#F4F2F8" rx="6" /><path d={d} fill="#0C0B11" /></svg>;
}

export function Field(p: { label: string; hint?: ComponentChildren; error?: string; children: ComponentChildren; id?: string }) {
  return (
    <div class={cx('afield', p.error && 'err')}>
      <label for={p.id}>{p.label}</label>
      {p.children}
      {p.error ? <p class="afield-msg">{p.error}</p> : p.hint ? <p class="afield-hint">{p.hint}</p> : null}
    </div>
  );
}

export function Section({ title, aside, children, class: cls }: { title: string; aside?: ComponentChildren; children: ComponentChildren; class?: string }) {
  return <section class={cx('asec', cls)}><header class="asec-head"><h2>{title}</h2>{aside}</header>{children}</section>;
}

export type Tone = JSX.HTMLAttributes['class'];
