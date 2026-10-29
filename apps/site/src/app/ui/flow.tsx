// Shared pieces of the action flows: vault picker and the review → progress modal.
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { Btn, Card, FeeTable, Modal, Money, Note, Progress, Toggle, cx } from './kit';
import { openWallet } from '../lib/ui';
import { useStore, activeVaults, balances, submit, setState, type Activity, type Kind } from '../lib/store';
import { href } from '../lib/router';
import { NET, POOL_LABEL } from '../lib/network';

/** Inside a dialog, a list floats over the content (fixed to the screen) instead of pushing it down or
 * being cut off by the dialog's scroll. It opens upward when there's more room above. */
export function useFloat(open: boolean, anchor: { current: HTMLElement | null }) {
  const [style, setStyle] = useState<Record<string, string> | undefined>();
  useLayoutEffect(() => {
    const el = anchor.current, dlg = el?.closest('dialog');
    if (!open || !el || !dlg) { setStyle(undefined); return; }
    const place = () => {
      const r = el.getBoundingClientRect();
      const below = innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 240 && above > below;
      const max = Math.max(140, Math.min(380, up ? above : below));
      setStyle({ position: 'fixed', left: `${r.left}px`, right: 'auto', width: `${r.width}px`, maxHeight: `${max}px`, overflowY: 'auto',
        ...(up ? { top: 'auto', bottom: `${innerHeight - r.top + 6}px` } : { top: `${r.bottom + 6}px`, bottom: 'auto' }) });
    };
    place();
    dlg.addEventListener('scroll', place); addEventListener('resize', place);
    return () => { dlg.removeEventListener('scroll', place); removeEventListener('resize', place); };
  }, [open]);
  return style;
}

export type DDItem = { id: string; label: ComponentChildren; text: string; sub?: ComponentChildren; meta?: ComponentChildren; hue?: number; icon?: string };

/** A dropdown list for picks that can grow long (vaults, payments). Adds a search box past 6 items. */
export function Dropdown({ label, value, onChange, items, placeholder = 'Choose one', findLabel = 'Find', footer }: {
  label: string; value: string; onChange: (id: string) => void; items: DDItem[]; placeholder?: string; findLabel?: string; footer?: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const find = useRef<HTMLInputElement>(null);
  const id = useId();
  const many = items.length > 6;
  const list = q ? items.filter((v) => v.text.toLowerCase().includes(q.trim().toLowerCase())) : items;
  const cur = items.find((v) => v.id === value);
  const float = useFloat(open, btn);
  const show = (on: boolean) => {
    setOpen(on); setQ('');
    if (on) {
      setI(Math.max(0, items.findIndex((v) => v.id === value)));
      setTimeout(() => {
        (many ? find.current : root.current?.querySelector<HTMLElement>('.vdd-o.on, .vdd-o'))?.focus({ preventScroll: true });
        if (!root.current?.closest('dialog')) root.current?.querySelector('.vdd-menu')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 0);
    }
  };
  const pick = (vid: string) => { onChange(vid); setOpen(false); setQ(''); btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('pointerdown', out);
    return () => removeEventListener('pointerdown', out);
  }, [open]);
  const onKey = (e: KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(true); } return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = list.length ? (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length : 0;
      setI(n); if (!many) root.current?.querySelectorAll<HTMLElement>('.vdd-o')[n]?.focus();
    } else if (e.key === 'Enter' && many && list[i]) { e.preventDefault(); pick(list[i].id); }
  };
  const mark = (v?: DDItem) => (v?.icon ? <span class="vdd-ic"><Icon name={v.icon} size={15} /></span> : <i style={{ '--h': v?.hue ?? 268 } as any} />);
  return (
    <div class={cx('avsel vdd', open && 'open')} ref={root} onKeyDown={onKey as any}>
      <span class="avsel-l" id={`${id}-l`}>{label}</span>
      <button type="button" ref={btn} class="vdd-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} onClick={() => show(!open)}>
        {mark(cur)}<span class="vdd-v" id={`${id}-v`}><b>{cur?.label || placeholder}</b>{cur?.sub && <small>{cur.sub}</small>}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div class="vdd-menu" style={float}>
          {many && <label class="vdd-find"><Icon name="search" size={15} /><input ref={find} value={q} placeholder={findLabel} aria-label={findLabel} aria-controls={`${id}-list`} onInput={(e) => { setQ((e.target as HTMLInputElement).value); setI(0); }} /></label>}
          <ul role="listbox" id={`${id}-list`} aria-labelledby={`${id}-l`}>
            {list.map((v, n) => (
              <li role="option" aria-selected={v.id === value}>
                <button type="button" tabIndex={-1} class={cx('vdd-o', v.id === value && 'on', many && n === i && 'hi')} onMouseEnter={() => setI(n)} onClick={() => pick(v.id)}>
                  {mark(v)}<b>{v.label}</b>{v.meta != null && <small>{v.meta}</small>}{v.id === value && <Icon name="check" size={15} />}
                </button>
              </li>
            ))}
            {!list.length && <li class="vdd-none">Nothing matches “{q.trim()}”</li>}
          </ul>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Vault picker. Shows each vault's spendable balance when a token is given. */
export function VaultSelect({ value, onChange, label = 'Vault', symbol, exclude }: { value: string; onChange: (id: string) => void; label?: string; symbol?: string; exclude?: string }) {
  const s = useStore((x) => x);
  const bal = (vid: string) => (symbol ? balances(s, vid)[symbol]?.spendable ?? 0n : null);
  const items: DDItem[] = activeVaults(s).filter((v) => v.id !== exclude).map((v) => {
    const b = bal(v.id);
    return { id: v.id, label: v.name, text: v.name, hue: v.hue, meta: b != null && symbol ? <Money v={b} symbol={symbol} /> : undefined, sub: b != null && symbol ? <><Money v={b} symbol={symbol} /> available</> : undefined };
  });
  return <Dropdown label={label} value={value} onChange={onChange} items={items} placeholder="Choose a vault" findLabel="Find a vault"
    footer={<a class="vdd-new" href={href('vaults', { new: '1' })}><Icon name="plus" size={15} />New vault</a>} />;
}

export type Plan = { kind: Kind; asset: string; amount: bigint; vault: string; toVault?: string; counterparty?: string; memo?: string; payEth?: { maxIn: bigint; fee: number }; toEth?: { minOut: bigint; fee: number } };

export function ActionModal({ open, onClose, plan, title, confirmLabel, disclosure, extra, steps, onDone, walletNote }: {
  open: boolean; onClose: () => void; plan: Plan | null; title: string; confirmLabel: string;
  disclosure: ComponentChildren; extra?: ComponentChildren; steps?: string[]; onDone?: (a: Activity) => void;
  /** Replaces the line under the button that says what the wallet will ask. */
  walletNote?: string;
}) {
  const delayDefault = useStore((s) => s.prefs.delayDefault);
  const tn = useStore((s) => s.mode === 'testnet');
  const relayer = useStore((s) => !!s.tn.relayer);
  const wrongNet = useStore((s) => s.wallet?.kind === 'injected' && s.wallet.chainId !== undefined && s.wallet.chainId !== NET.id);
  const [delayed, setDelayed] = useState(delayDefault);
  const [act, setAct] = useState<Activity | null>(null);
  const [stage, setStage] = useState(0);
  const live = useStore((s) => (act ? s.activity.find((x) => x.id === act.id) || act : null));
  const close = () => { setAct(null); setStage(0); onClose(); };
  const isPrivate = plan && plan.kind !== 'shield';
  const multi = !tn && steps && steps.length > 1;
  const go = () => {
    if (!plan) return;
    if (multi && stage < steps!.length - 1) { setStage(stage + 1); return; }
    const a = submit({ ...plan, delayed: isPrivate ? delayed : false });
    setAct(a);
    onDone?.(a);
  };
  return (
    <Modal open={open} onClose={close} title={live ? (live.status === 'credited' ? 'Done' : live.status === 'failed' ? 'It didn’t go through' : 'In progress') : title}>
      {plan && !live && (
        <div class="areview">
          <div class="areview-amt"><span>Amount</span><Money v={plan.amount} symbol={plan.asset} big /></div>
          {extra}
          <FeeTable kind={plan.kind} symbol={plan.asset} amount={plan.amount} ethMax={plan.payEth?.maxIn} />
          {disclosure}
          {isPrivate && (!tn || relayer) && (
            <Toggle on={delayed} onChange={setDelayed} label="Delayed submission" hint={tn ? 'Waits 8 to 20 seconds before the relayer submits. Keep this tab open. It may reduce some timing links, but it guarantees nothing.' : 'Waits a random moment before submitting. It may reduce some timing links, but it guarantees nothing.'} />
          )}
          {tn && isPrivate && !relayer && <Note tone="warn" title="The relayer is unavailable">Your wallet will submit this and pay the network fee, so this transaction is publicly linked to your wallet address.</Note>}
          {multi && (
            <ol class="areview-steps">
              {steps!.map((t, i) => <li class={cx(i < stage && 'done', i === stage && 'now')}><span>{i < stage ? <Icon name="check" size={12} /> : i + 1}</span>{t}</li>)}
            </ol>
          )}
          <div class="areview-cta">
            <Btn kind="primary" size="lg" block onClick={go} icon={multi && stage < steps!.length - 1 ? 'check' : isPrivate ? 'lock' : 'wallet'}>
              {multi ? steps![stage] : confirmLabel}
            </Btn>
            <small>{!tn ? 'Demo: no wallet prompt and nothing is sent to a chain.'
              : walletNote ? `${POOL_LABEL}. ${walletNote}`
              : plan.kind === 'shield' ? `${POOL_LABEL}. Your wallet asks you to confirm${steps && steps.length > 1 ? ' twice: approve, then deposit' : ''}.`
              : relayer ? `${POOL_LABEL}. The relayer submits it; your wallet isn’t asked.`
              : `${POOL_LABEL}. Your wallet asks you to confirm.`}{wrongNet ? ' It will ask to switch network first.' : ''}</small>
          </div>
        </div>
      )}
      {live && (
        <div class="areview">
          <div class="areview-amt"><span>{title}</span><Money v={live.amount} symbol={live.asset} big /></div>
          <Progress a={live} />
          {live.status === 'credited' ? (
            <div class="areview-cta row">
              <Btn kind="primary" onClick={close}>Close</Btn>
              <Btn kind="secondary" href={href('activity')}>View activity</Btn>
            </div>
          ) : live.status === 'failed' ? (
            <div class="areview-cta row"><Btn kind="primary" onClick={close}>Close</Btn></div>
          ) : (
            <div class="areview-cta row"><Btn kind="secondary" onClick={close}>Keep going in the background</Btn></div>
          )}
          {live.status !== 'credited' && live.status !== 'failed' && <Note tone="info">{live.net && (live.status === 'approving' || live.status === 'signing') ? 'Check your wallet: it’s waiting for you to confirm.' : live.net && live.delayed && live.status !== 'confirming' ? 'Keep this tab open until it’s submitted. Funds aren’t spendable until the status reads Credited.' : 'You can close this. Funds aren’t spendable until the status reads Credited.'}</Note>}
          {live.net && live.tx && <a class="alink" href={`${NET.explorer}/tx/${live.tx}`} target="_blank" rel="noopener">View transaction on the explorer <Icon name="external" size={12} /></a>}
        </div>
      )}
    </Modal>
  );
}

export function useFailNext() {
  return () => setState((s) => { s.prefs = { ...s.prefs, failNext: true }; });
}

// ---- Before a wallet and privacy key exist ----
export const useReady = () => useStore((s) => !!s.wallet && !!s.keys);

/** Takes the place of an action button until a wallet and privacy key exist. */
export function ConnectBtn({ action }: { action: string }) {
  const wallet = useStore((s) => s.wallet);
  return <Btn kind="primary" size="lg" block icon="wallet" onClick={openWallet}>{wallet ? 'Create your privacy key first' : `Connect a wallet to ${action}`}</Btn>;
}

/** A placeholder for screens that show your own keys or history. */
export function ConnectCard({ title, children }: { title: string; children?: ComponentChildren }) {
  const wallet = useStore((s) => s.wallet);
  return (
    <Card class="aconnect" glow>
      <span class="aconnect-ic" aria-hidden="true"><Icon name={wallet ? 'key' : 'wallet'} size={24} /></span>
      <div>
        <b>{title}</b>
        <p>{children || 'Connect a browser wallet, then create or restore your privacy key. The key is made in this browser and never leaves it.'}</p>
      </div>
      <Btn kind="primary" icon="wallet" onClick={openWallet}>{wallet ? 'Create your privacy key' : 'Connect a wallet'}</Btn>
    </Card>
  );
}
