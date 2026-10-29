// Top bar search: jump to a page or an action, or search activity. Press / to focus.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { Money, cx } from './kit';
import { useStore, KIND_LABEL } from '../lib/store';
import { go, type Route } from '../lib/router';
import { filterActivity } from '../pages/Activity';
import { ago } from './activity';

type Item = { icon: string; label: string; hint?: string; r: Route; q?: Record<string, string>; words?: string };
const PAGES: Item[] = [
  { icon: 'overview', label: 'Overview', hint: 'Balances and this month', r: 'overview', words: 'home dashboard balance' },
  { icon: 'shield', label: 'Shield', hint: 'Move tokens into your private balance', r: 'shield', words: 'deposit' },
  { icon: 'send', label: 'Send privately', hint: 'Pay a shielded address', r: 'send', words: 'pay transfer' },
  { icon: 'receive', label: 'Receive', hint: 'Your shielded address', r: 'receive', words: 'address qr get paid' },
  { icon: 'plus', label: 'New payment request', hint: 'A link with an amount', r: 'receive', q: { new: '1' }, words: 'request invoice link' },
  { icon: 'withdraw', label: 'Withdraw', hint: 'Back to a public address', r: 'withdraw', words: 'unshield cash out' },
  { icon: 'history', label: 'Activity', hint: 'Every action, grouped by day', r: 'activity', words: 'history transactions statement' },
  { icon: 'vaults', label: 'Vaults', hint: 'Your private balance by purpose, and the tokens in each', r: 'vaults', words: 'folders buckets labels tokens coins balances portfolio holdings assets' },
  { icon: 'plus', label: 'New vault', r: 'vaults', q: { new: '1' }, words: 'create vault label' },
  { icon: 'swap', label: 'Move between vaults', r: 'vaults', q: { move: '1' }, words: 'transfer vault' },
  { icon: 'receipts', label: 'Share a receipt', hint: 'Use the share icon on a payment in Activity', r: 'activity', words: 'receipt proof disclosure' },
  { icon: 'search', label: 'Open a receipt', hint: 'Read one someone sent you', r: 'activity', q: { receipt: '1' }, words: 'receipt verify check proof' },
  { icon: 'key', label: 'Viewing key', hint: 'Reveals your full history', r: 'activity', q: { viewkey: '1' }, words: 'auditor disclosure view key' },
  { icon: 'key', label: 'Back up recovery phrase', hint: 'Privacy account', r: 'account', q: { backup: '1' }, words: 'backup phrase seed words' },
  { icon: 'settings', label: 'Privacy account', hint: 'Keys, preferences, this device', r: 'account', words: 'settings preferences keys' },
  { icon: 'fallback', label: 'Fallback withdrawal', hint: 'Withdraw without this app', r: 'fallback', words: 'emergency exit' },
];

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function TopSearch() {
  const s = useStore((x) => x);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === '/' && !typing(e.target)) { e.preventDefault(); setWide(true); ref.current?.focus(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  const term = q.trim().toLowerCase();
  const pages = PAGES.filter((p) => !term || `${p.label} ${p.hint || ''} ${p.words || ''}`.toLowerCase().includes(term)).slice(0, term ? 5 : 7);
  const acts = term && s.keys ? filterActivity(s, { q: term, dir: '', when: '', vault: '', asset: '', status: '', view: '' }).slice(0, 4) : [];
  const items: { key: string; run: () => void; el: ComponentChildren }[] = [
    ...pages.map((p) => ({ key: p.label, run: () => go(p.r, p.q), el: <><span class="ts-ic"><Icon name={p.icon} size={16} /></span><span class="ts-t"><b>{p.label}</b>{p.hint && <small>{p.hint}</small>}</span></> })),
    ...acts.map((a) => ({ key: a.id, run: () => go('activity', { q: a.tx || term }), el: <><span class="ts-ic"><Icon name="history" size={16} /></span><span class="ts-t"><b>{KIND_LABEL[a.kind]} · <Money v={a.amount} symbol={a.asset} /></b><small>{a.memo || ago(a.createdAt)}</small></span></> })),
    ...(term ? [{ key: 'all', run: () => go('activity', { q: q.trim() }), el: <><span class="ts-ic"><Icon name="search" size={16} /></span><span class="ts-t"><b>Search all activity for “{q.trim()}”</b><small>Try kind:send, vault:main or amount:&gt;100</small></span></> }] : []),
  ];
  const pick = (n: number) => { items[n]?.run(); setQ(''); setOpen(false); setWide(false); ref.current?.blur(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(i); }
    else if (e.key === 'Escape') { setOpen(false); setWide(false); ref.current?.blur(); }
  };
  return (
    <div class={cx('tsearch', wide && 'wide', open && 'open')}>
      <button type="button" class="tsearch-btn atop-ic" aria-label="Search" onClick={() => { setWide(true); setTimeout(() => ref.current?.focus(), 0); }}><Icon name="search" size={19} /></button>
      <label class="tsearch-box">
        <Icon name="search" size={17} />
        <input ref={ref} type="search" value={q} placeholder="Search pages and activity" aria-label="Search pages and activity" role="combobox" aria-expanded={open} aria-controls="ts-list" autocomplete="off"
          onFocus={() => { setOpen(true); setI(0); }} onBlur={() => setTimeout(() => { setOpen(false); setWide(false); }, 150)}
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); setI(0); setOpen(true); }} onKeyDown={onKey as any} />
        <kbd aria-hidden="true">/</kbd>
      </label>
      {open && items.length > 0 && (
        <ul class="tsearch-list" id="ts-list" role="listbox">
          {items.map((it, n) => <li role="option" aria-selected={n === i}><button type="button" class={cx(n === i && 'on')} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setI(n)} onClick={() => pick(n)}>{it.el}</button></li>)}
        </ul>
      )}
    </div>
  );
}
