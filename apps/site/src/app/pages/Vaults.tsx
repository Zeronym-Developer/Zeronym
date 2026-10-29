// Vault dialogs: create a vault and move between vaults (PRD R3.3). The list lives on the Assets page.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { AmountField, Btn, Field, Modal, Note, cx } from '../ui/kit';
import { ActionModal, VaultSelect, ConnectBtn, useReady } from '../ui/flow';
import { useStore, setState, balances, activeVaults, quote } from '../lib/store';
import { ASSETS, asset, parseUnits, fmt } from '../lib/amount';
import { randomId } from '../lib/vault-store';

const HUES = [268, 200, 160, 32, 330, 220];

export function CreateVault({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [hue, setHue] = useState(HUES[1]);
  const ideas = ['Trading', 'Savings', 'Payroll', 'Taxes', 'Grants'];
  const create = () => {
    const n = name.trim().slice(0, 32);
    if (!n) return;
    setState((st) => { st.vaults = [...st.vaults, { id: randomId('v'), name: n, archived: false, createdAt: Date.now(), hue }]; });
    setName(''); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="New vault">
      <form class="anewv" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <Field label="Name" id="vname" hint="Encrypted on this device. Never sent anywhere."><input id="vname" class="z-input" maxLength={32} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Savings" /></Field>
        <div class="anewv-ideas">{ideas.map((i) => <button type="button" class="achip achip-neutral achip-btn" onClick={() => setName(i)}>{i}</button>)}</div>
        <div class="afield"><label>Colour</label><div class="anewv-hues">{HUES.map((h) => <button type="button" aria-label={`Colour ${h}`} aria-pressed={h === hue} class={cx(h === hue && 'on')} style={{ '--h': h } as any} onClick={() => setHue(h)} />)}</div></div>
        <Note tone="info">Creating or renaming a vault is free and doesn't touch the chain. Only moving funds is a transaction.</Note>
        <Btn kind="primary" size="lg" block type="submit" icon="plus" disabled={!name.trim()}>Create vault</Btn>
      </form>
    </Modal>
  );
}

/** A Savings vault for the first private transfer, made only when there's just one vault. */
export function firstVault() {
  setState((st) => {
    if (st.vaults.filter((v) => !v.archived).length > 1) return;
    st.vaults = [...st.vaults, { id: randomId('v'), name: 'Savings', archived: false, createdAt: Date.now(), hue: HUES[1] }];
  });
}

export function MoveModal({ from: initial, amount: preset, onClose }: { from: string; amount?: string; onClose: () => void }) {
  const s = useStore((x) => x);
  const ready = useReady();
  const [from, setFrom] = useState(initial);
  const [to, setTo] = useState(activeVaults(s).find((v) => v.id !== initial)?.id || '');
  const [symbol, setSymbol] = useState(ASSETS.find((a) => balances(s, initial)[a.symbol].spendable > 0n)?.symbol || ASSETS[0].symbol);
  const [value, setValue] = useState(/^\d{1,6}(\.\d{1,2})?$/.test(preset || '') ? preset! : '');
  const [review, setReview] = useState(false);
  const a = asset(symbol);
  const amount = parseUnits(value, a.decimals) ?? -1n;
  const fee = BigInt(quote(symbol, 'move').relayer);
  const avail = balances(s, from)[symbol].spendable;
  const valid = to && to !== from && amount > 0n && amount + fee <= avail;
  if (review) return (
    <ActionModal open onClose={onClose} title="Vault move" confirmLabel="Prove and move"
      plan={{ kind: 'move', asset: symbol, amount, vault: from, toVault: to }}
      extra={<dl class="areview-dl"><div><dt>From</dt><dd>{s.vaults.find((v) => v.id === from)?.name}</dd></div><div><dt>To</dt><dd>{s.vaults.find((v) => v.id === to)?.name}</dd></div></dl>}
      disclosure={<Note tone="priv" title="A real shielded transfer">Moving value between vaults is a proved movement inside the pool, with a fee. Outsiders see only a pool transaction.</Note>} />
  );
  return (
    <Modal open onClose={onClose} title="Move between vaults">
      <div class="amove">
        <VaultSelect value={from} onChange={(id) => { setFrom(id); if (id === to) setTo(activeVaults(s).find((v) => v.id !== id)?.id || ''); }} label="From" symbol={symbol} />
        <div class="amove-arrow" aria-hidden="true"><Icon name="down" size={18} /></div>
        <VaultSelect value={to} onChange={setTo} label="To" exclude={from} />
        <AmountField label="Amount" symbol={symbol} onSymbol={setSymbol} value={value} onValue={setValue} available={avail} availableLabel="Spendable" reserve={fee} />
        {!ready ? <ConnectBtn action="move funds" /> : <Btn kind="primary" size="lg" block disabled={!valid} onClick={() => setReview(true)} iconRight="chevron">{valid ? `Review moving ${fmt(amount, symbol)}` : 'Choose vaults and an amount'}</Btn>}
      </div>
    </Modal>
  );
}
