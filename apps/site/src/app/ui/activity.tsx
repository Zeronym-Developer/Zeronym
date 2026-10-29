// Activity rows, details and the outsider view.
import { useState } from 'preact/hooks';
import { Icon } from './icons';
import type { ComponentChildren } from 'preact';
import { Btn, Chip, FeeTable, Modal, Money, Note, Progress, StatusPill, statusLabel, cx } from './kit';
import { useStore, vaultName, KIND_LABEL, type Activity } from '../lib/store';
import { short } from '../lib/chain';
import { fmt, formatUnits } from '../lib/amount';
import type { Finding } from '../lib/privacy';
import { openTool } from './receipts';
import { NET } from '../lib/network';

const ICON: Record<string, string> = { shield: 'shield', send: 'send', receive: 'receive', withdraw: 'withdraw', move: 'swap' };
export const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

function subline(a: Activity, vn: (id?: string) => string) {
  if (a.kind === 'shield') return `From your wallet into ${vn(a.vault)}`;
  if (a.kind === 'move') return `${vn(a.vault)} → ${vn(a.toVault)}`;
  if (a.kind === 'send') return `To ${short(a.counterparty || '', 6)} · from ${vn(a.vault)}`;
  if (a.kind === 'receive') return `Into ${vn(a.vault)}${a.memo ? ` · ${a.memo}` : ''}`;
  const asEth = a.toEth ? ` · as ${a.toEth.got ? `${formatUnits(BigInt(a.toEth.got), 18, { max: 6 })} ` : ''}ETH` : '';
  return `To ${short(a.counterparty || '')}${asEth} · from ${vn(a.vault)}`;
}
const sign = (a: Activity) => (a.kind === 'shield' || a.kind === 'receive' ? '+' : a.kind === 'move' ? '' : '−');

export function ActivityRow({ a, onOpen }: { a: Activity; onOpen: (a: Activity) => void }) {
  const vaults = useStore((s) => s.vaults);
  const vn = (id?: string) => vaults.find((v) => v.id === id)?.name || 'Main';
  const pub = a.kind === 'shield' || a.kind === 'withdraw';
  return (
    <button type="button" class={cx('arow', `arow-${a.kind}`)} onClick={() => onOpen(a)}>
      <span class="arow-ic"><Icon name={ICON[a.kind]} size={18} /></span>
      <span class="arow-main"><b>{KIND_LABEL[a.kind]}</b><small>{subline(a, vn)}</small></span>
      <span class="arow-vis">{pub ? <Chip tone="pub" icon="globe">Public</Chip> : <Chip tone="priv" icon="lock">Private</Chip>}</span>
      <span class="arow-amt"><span class={cx('arow-v', sign(a) === '+' && 'in')}>{sign(a)}<Money v={a.amount} symbol={a.asset} /></span><small>{ago(a.createdAt)}</small></span>
      <span class="arow-st"><StatusPill a={a} /></span>
    </button>
  );
}

// What a stranger watching the chain would see for the same activity.
export function OutsiderRow({ a }: { a: Activity }) {
  const wallet = useStore((s) => s.wallet);
  if (a.kind === 'shield') return (
    <div class="aorow pub"><span class="arow-ic"><Icon name="globe" size={18} /></span><span class="arow-main"><b>Deposit to the shielded pool</b><small class="z-data">From {short(wallet?.address || '0x')} · tx {short(a.tx)}</small></span><span class="aorow-v">{fmt(a.amount, a.asset)}</span><small class="aorow-t">{ago(a.createdAt)}</small></div>
  );
  if (a.kind === 'withdraw') return (
    <div class="aorow pub"><span class="arow-ic"><Icon name="globe" size={18} /></span><span class="arow-main"><b>Withdrawal from the shielded pool</b><small class="z-data">To {short(a.counterparty || '')} · tx {short(a.tx)}</small></span><span class="aorow-v">{fmt(a.amount, a.asset)}</span><small class="aorow-t">{ago(a.createdAt)}</small></div>
  );
  return (
    <div class="aorow hid"><span class="arow-ic"><Icon name="lock" size={18} /></span><span class="arow-main"><b>Pool transaction</b><small>Sender, recipient, amount and vault: encrypted</small></span><span class="aorow-v"><i class="aenc" /></span><small class="aorow-t">{ago(a.createdAt)}</small></div>
  );
}

export function ActivityDetail({ a, onClose }: { a: Activity | null; onClose: () => void }) {
  const live = useStore((s) => (a ? s.activity.find((x) => x.id === a.id) || a : null));
  const vn = useStore((s) => (id?: string) => vaultName(s, id));
  if (!live) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const pub = live.kind === 'shield' || live.kind === 'withdraw';
  return (
    <Modal open={!!a} onClose={onClose} title={KIND_LABEL[live.kind]}>
      <div class="adet">
        <div class="adet-top">
          <span class="adet-amt"><Money v={live.amount} symbol={live.asset} big /></span>
          <StatusPill a={live} />
        </div>
        <Progress a={live} />
        <dl class="adet-dl">
          {live.kind === 'move' ? <><div><dt>From vault</dt><dd>{vn(live.vault)}</dd></div><div><dt>To vault</dt><dd>{vn(live.toVault)}</dd></div></>
            : <div><dt>Vault</dt><dd>{vn(live.vault)}</dd></div>}
          {live.counterparty && <div><dt>{live.kind === 'receive' ? 'From' : 'To'}</dt><dd class="z-data">{live.counterparty}</dd></div>}
          {live.toEth && <div><dt>Received as</dt><dd>{live.toEth.got ? `${formatUnits(BigInt(live.toEth.got), 18, { max: 6 })} ETH` : `ETH, at least ${formatUnits(BigInt(live.toEth.min), 18, { max: 6 })}`}</dd></div>}
          {live.memo && <div><dt>Note</dt><dd>{live.memo}</dd></div>}
          <div><dt>Started</dt><dd>{new Date(live.createdAt).toLocaleString('en-US')}</dd></div>
          {live.net ? (live.tx
            ? <div><dt>Transaction</dt><dd class="z-data"><a class="alink" href={`${NET.explorer}/tx/${live.tx}`} target="_blank" rel="noopener">{short(live.tx, 10)} <Icon name="external" size={12} /></a></dd></div>
            : null)
            : <div><dt>Reference</dt><dd class="z-data">{short(live.tx, 10)} <small class="muted">(demo, not on chain)</small></dd></div>}
          {live.net && live.kind !== 'shield' && live.kind !== 'receive' && <div><dt>Submitted by</dt><dd>{live.via === 'wallet' ? 'Your wallet (linked to it)' : 'The relayer'}</dd></div>}
        </dl>
        {live.kind !== 'receive' && <FeeTable kind={live.kind} symbol={live.asset} amount={BigInt(live.amount)} fee={live.net ? live.fee : undefined} />}
        <Note tone={pub ? 'pub' : 'priv'} title={pub ? 'This action is public' : 'This action is private'}>
          {live.kind === 'shield' && 'Anyone can see the funding address, the asset, the amount and the time.'}
          {live.kind === 'withdraw' && 'Anyone can see the destination, the asset, the amount and the time.'}
          {(live.kind === 'send' || live.kind === 'move' || live.kind === 'receive') && 'Outsiders see only that a pool transaction happened, and when.'}
        </Note>
        {(live.kind === 'send' || live.kind === 'withdraw' || live.kind === 'shield') && live.status === 'credited' && (
          <Btn kind="secondary" icon="receipts" block onClick={() => { onClose(); openTool('share', live.id); }}>Share a receipt for this payment</Btn>
        )}
      </div>
    </Modal>
  );
}

export function ActivityList({ list, limit, outsider }: { list: Activity[]; limit?: number; outsider?: boolean }) {
  const [open, setOpen] = useState<Activity | null>(null);
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <>
      <div class={cx('alist', outsider && 'outsider')}>
        {shown.map((a) => (outsider ? <OutsiderRow a={a} key={a.id} /> : <ActivityRow a={a} key={a.id} onOpen={setOpen} />))}
      </div>
      <ActivityDetail a={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function Findings({ list, title = 'Privacy check' }: { list: Finding[]; title?: string }) {
  if (!list.length) return null;
  const worst = list.some((f) => f.level === 'weak') ? 'weak' : list.some((f) => f.level === 'fair') ? 'fair' : 'good';
  const label = { good: 'Looks good', fair: 'Some risk', weak: 'Easy to link' }[worst];
  return (
    <div class={cx('afind', `afind-${worst}`)}>
      <header><b><Icon name="shield" size={16} />{title}</b><span class="afind-meter" aria-label={label}><i /><i /><i /><em>{label}</em></span></header>
      <ul>
        {list.map((f) => <li class={f.level}><span class="afind-sym" aria-hidden="true">{f.level === 'good' ? '✓' : f.level === 'fair' ? '!' : '✕'}</span><div><b>{f.title}</b><small>{f.body}</small></div></li>)}
      </ul>
      <p class="afind-foot">These checks catch common patterns. Passing them doesn't guarantee privacy.</p>
    </div>
  );
}

// Table view of activity, laid out like a bank statement: one row per action, grouped by day.
const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const when = (t: number) => {
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString() ? `Today, ${time(t)}` : `${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}, ${time(t)}`;
};
export const dayLabel = (t: number) => {
  const d = new Date(t), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
};
export const isPublicKind = (k: Activity['kind']) => k === 'shield' || k === 'withdraw';
const canShare = (a: Activity) => a.status === 'credited' && a.kind !== 'move';
const DIR: Record<string, string> = { shield: 'in', receive: 'in', send: 'out', withdraw: 'out', move: 'self' };

function Status({ a }: { a: Activity }) {
  const live = a.status !== 'credited' && a.status !== 'failed';
  if (live) return <StatusPill a={a} />;
  return <span class={cx('dt-st', a.status === 'failed' ? 'bad' : 'ok')}><i aria-hidden="true" />{statusLabel(a)}</span>;
}

/** Signed per-asset totals for a set of rows, e.g. "−42.13 tUSD". */
function DayTotal({ list }: { list: Activity[] }) {
  const sums = new Map<string, bigint>();
  for (const a of list) {
    if (a.status === 'failed' || a.kind === 'move') continue;
    const v = BigInt(a.amount) * (DIR[a.kind] === 'in' ? 1n : -1n);
    sums.set(a.asset, (sums.get(a.asset) || 0n) + v);
  }
  return <span class="dt-day-t">{[...sums].map(([sym, v]) => <Money v={v} symbol={sym} sign />)}</span>;
}

export function ActivityTable({ list, limit, outsider, byDay, head = true, empty, actions = false }: { list: Activity[]; limit?: number; outsider?: boolean; byDay?: boolean; head?: boolean; empty?: ComponentChildren; actions?: boolean }) {
  const [open, setOpen] = useState<Activity | null>(null);
  const vaults = useStore((s) => s.vaults);
  const wallet = useStore((s) => s.wallet);
  const vault = (id?: string) => vaults.find((v) => v.id === id) || vaults[0];
  const shown = limit ? list.slice(0, limit) : list;
  const groups: [string, Activity[]][] = [];
  for (const a of shown) {
    const d = byDay ? dayLabel(a.createdAt) : '';
    if (!groups.length || groups[groups.length - 1][0] !== d) groups.push([d, []]);
    groups[groups.length - 1][1].push(a);
  }
  const t = (a: Activity) => (byDay ? time(a.createdAt) : when(a.createdAt));
  const act = actions && !outsider;
  const openRow = (a: Activity) => (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(a); } };
  if (!shown.length && empty) return <>{empty}</>;
  return (
    <>
      <div class={cx('dt', outsider && 'outsider', byDay && 'by-day', act && 'with-act')} role="table" aria-label="Activity">
        {head && (
          <div class="dt-row dt-head" role="row">
            <span role="columnheader">{outsider ? 'What a stranger sees' : 'Activity'}</span><span role="columnheader">Time</span><span role="columnheader">{outsider ? 'Linked to you' : 'Status'}</span><span role="columnheader">Visibility</span><span role="columnheader" class="r">Amount</span>{act && <span role="columnheader" class="r">Actions</span>}
          </div>
        )}
        {groups.map(([d, rows]) => (
          <div role="rowgroup">
            {d && <div class="dt-day" role="row"><span>{d}</span>{outsider ? <small>{rows.length} {rows.length === 1 ? 'transaction' : 'transactions'}</small> : <DayTotal list={rows} />}</div>}
            {rows.map((a) => {
              const pub = isPublicKind(a.kind);
              if (outsider) return (
                <div class={cx('dt-row', pub ? 'is-pub' : 'is-hid')} role="row" key={a.id}>
                  <span class="dt-main"><span class="dt-ic"><Icon name={pub ? 'globe' : 'lock'} size={17} /></span><span class="dt-tx">
                    <b>{a.kind === 'shield' ? 'Deposit to the pool' : a.kind === 'withdraw' ? 'Withdrawal from the pool' : 'Pool transaction'}</b>
                    <small class="z-data">{a.kind === 'shield' ? `From ${short(wallet?.address || '0x')}` : a.kind === 'withdraw' ? `To ${short(a.counterparty || '')}` : 'Sender, recipient and amount encrypted'}</small></span></span>
                  <span class="dt-c dt-time">{t(a)}</span>
                  <span class="dt-c">{pub ? 'Yes, by address' : 'No'}</span>
                  <span class="dt-c dt-vis"><em class={pub ? 'pub' : 'shd'}>{pub ? 'public' : 'hidden'}</em></span>
                  <span class="dt-amt r">{pub ? <b>{fmt(a.amount, a.asset)}</b> : <i class="aenc" />}<small class="dt-m">{t(a)}</small></span>
                </div>
              );
              const v = vault(a.vault);
              const fee = BigInt(a.fee?.relayer || '0');
              const dir = DIR[a.kind];
              return (
                <div class={cx('dt-row click', `dt-${a.kind}`, `dir-${dir}`)} role="row" tabIndex={0} aria-label={`${KIND_LABEL[a.kind]}, open details`} key={a.id} onClick={() => setOpen(a)} onKeyDown={openRow(a) as any}>
                  <span class="dt-main">
                    <span class="dt-ic"><Icon name={dir === 'in' ? 'arrowIn' : dir === 'out' ? 'arrowOut' : 'swap'} size={17} /></span>
                    <span class="dt-tx">
                      <b>{KIND_LABEL[a.kind]}</b>
                      <small>
                        <span class="dt-tag" style={{ '--h': v?.hue ?? 268 } as any}><i />{a.kind === 'move' ? `${v?.name} → ${vault(a.toVault)?.name}` : v?.name}</span>
                        <span class="dt-sub">{a.kind === 'shield' ? 'From your wallet' : a.kind === 'move' ? 'Inside the pool' : a.counterparty ? `${a.kind === 'receive' ? 'From' : 'To'} ${short(a.counterparty, 5)}` : ''}{a.toEth ? ` · as ${a.toEth.got ? `${formatUnits(BigInt(a.toEth.got), 18, { max: 6 })} ` : ''}ETH` : ''}{a.memo ? ` · ${a.memo}` : ''}</span>
                      </small>
                    </span>
                  </span>
                  <span class="dt-c dt-time">{t(a)}</span>
                  <span class="dt-c"><Status a={a} /></span>
                  <span class="dt-c dt-vis"><em class={pub ? 'pub' : 'shd'}>{pub ? 'public' : 'private'}</em></span>
                  <span class={cx('dt-amt r', dir === 'in' && 'in', a.status === 'failed' && 'void')}>
                    <b>{dir === 'in' ? '+' : dir === 'out' ? '−' : ''}<Money v={a.amount} symbol={a.asset} /></b>
                    {fee > 0n && dir !== 'in' ? <small>fee <Money v={fee} symbol={a.asset} hideSymbol /></small> : null}
                    <small class="dt-m">{t(a)}</small>
                  </span>
                  {act && (
                    <span class="dt-act" role="cell">
                      {canShare(a)
                        ? <button type="button" class="dt-share" aria-label={`Share a receipt for this ${KIND_LABEL[a.kind].toLowerCase()}`} title="Share a receipt" onClick={(e) => { e.stopPropagation(); openTool('share', a.id); }}><Icon name="share" size={17} /></button>
                        : <span class="dt-share off" title={a.kind === 'move' ? 'Moves between your own vaults have no receipt' : 'Available once credited'} aria-hidden="true"><Icon name="share" size={17} /></span>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ActivityDetail a={open} onClose={() => setOpen(null)} />
    </>
  );
}
