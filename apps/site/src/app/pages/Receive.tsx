// Receive: payment requests, with the shielded address one click away in a dialog (PRD R3.5).
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { AmountField, Btn, Chip, Copy, Field, Modal, Note, Qr, Seg, Money, cx } from '../ui/kit';
import { openAddress } from '../ui/address';
import { Panel } from '../ui/dash';
import { setQuery, useRoute, href } from '../lib/router';
import { ConnectCard } from '../ui/flow';
import { useStore, setState, getState } from '../lib/store';
import { ASSETS, asset, parseUnits } from '../lib/amount';
import { randomId } from '../lib/vault-store';
import { ago } from '../ui/activity';
import { SITE_ORIGIN } from '../lib/network';

const EXP: [string, string][] = [['0', 'No expiry'], ['1', '1 hour'], ['24', '1 day'], ['168', '7 days']];

export function Receive() {
  const s = useStore((x) => x);
  const { q } = useRoute();
  const creating = q.get('new') === '1' || q.get('tab') === 'req';
  if (!s.keys) return <div class="arecv"><ConnectCard title="Your shielded address comes from your privacy key" /></div>;
  const now = Date.now();
  const open = s.requests.filter((r) => r.expiresAt == null || now <= r.expiresAt);
  return (
    <div class="arecv5">
      <PayLink />
      <Requests onNew={() => setQuery({ new: '1' })} openCount={open.length} />
      <NewRequest open={creating} onClose={() => setQuery({})} />
    </div>
  );
}

const when = (t: number) => new Date(t).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Requests({ onNew, openCount }: { onNew: () => void; openCount: number }) {
  const s = useStore((x) => x);
  const cancel = (id: string) => setState((st) => { st.requests = st.requests.filter((x) => x.id !== id); });
  return (
    <Panel flush title="Payment requests" sub={s.requests.length ? `${openCount} open · ${s.requests.length - openCount} expired. Send request links in a DM: whoever has the link sees the amount and note.` : 'A link with an amount and a note, for one person. Send it in a DM.'} class="areqs6">
      {s.requests.length === 0 ? (
        <div class="dnone big"><Icon name="receive" size={22} /><p>No requests yet.<br /><small>Create one to ask for a set amount, or share your shielded address for anything.</small></p><span class="dnone-act"><Btn kind="secondary" size="sm" icon="plus" onClick={onNew}>New request</Btn><Btn kind="ghost" size="sm" icon="qr" onClick={openAddress}>Shielded address</Btn></span></div>
      ) : (
        <div class="rtab" role="table" aria-label="Payment requests">
          <div class="rtab-row rtab-head" role="row">
            <span role="columnheader">Request</span><span role="columnheader">Created</span><span role="columnheader">Expires</span><span role="columnheader">Status</span><span role="columnheader" class="r" aria-label="Actions" />
          </div>
          {s.requests.map((r) => {
            const expired = r.expiresAt != null && Date.now() > r.expiresAt;
            return (
              <div class={cx('rtab-row', expired && 'expired')} role="row">
                <span class="rtab-main" role="cell">
                  <span class="rtab-ic"><Icon name={expired ? 'clock' : 'receive'} size={17} /></span>
                  <span><b><Money v={r.amount} symbol={r.asset} /></b><small>{r.memo || 'No note'}</small></span>
                </span>
                <span class="rtab-c" role="cell"><em>Created </em>{ago(r.createdAt)}</span>
                <span class="rtab-c" role="cell"><em>Expires </em>{r.expiresAt ? when(r.expiresAt) : 'No expiry'}</span>
                <span role="cell"><Chip tone={expired ? 'neutral' : 'violet'}>{expired ? 'Expired' : 'Open'}</Chip></span>
                <span class="rtab-act" role="cell">
                  {!expired && <Copy text={requestLink(s, r)} label="Copy link" small />}
                  <Btn kind="ghost" size="sm" icon="x" ariaLabel={expired ? 'Remove request' : 'Cancel request'} title={expired ? 'Remove' : 'Cancel request'} onClick={() => cancel(r.id)} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

const requestLink = (s: ReturnType<typeof getState>, r: { asset: string; amount: string; memo: string; expiresAt: number | null }) => {
  const p = new URLSearchParams({ to: s.keys!.address, asset: r.asset, amount: (Number(r.amount) / 10 ** asset(r.asset).decimals).toString() });
  if (r.memo) p.set('memo', r.memo);
  if (r.expiresAt) p.set('exp', String(Math.floor(r.expiresAt / 1000)));
  return `${SITE_ORIGIN}/pay/#${p}`;
};

// One link anyone can pay any amount to. It carries only the shielded address.
const tipLink = (s: ReturnType<typeof getState>) => `${SITE_ORIGIN}/pay/#${new URLSearchParams({ to: s.keys!.address })}`;

function ShareLinks({ url, text }: { url: string; text: string }) {
  const x = `https://x.com/intent/tweet?${new URLSearchParams({ text, url })}`;
  const tg = `https://t.me/share/url?${new URLSearchParams({ url, text })}`;
  return (
    <span class="ashare">
      <a class="ab ab-ghost ab-sm ab-icon" href={x} target="_blank" rel="noopener noreferrer" aria-label="Share on X" title="Share on X"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg></a>
      <a class="ab ab-ghost ab-sm ab-icon" href={tg} target="_blank" rel="noopener noreferrer" aria-label="Share on Telegram" title="Share on Telegram"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" /></svg></a>
    </span>
  );
}

function PayLink() {
  const s = useStore((x) => x);
  const link = tipLink(s);
  return (
    <Panel title="Your payment link" icon="share" sub="Anyone with this link can pay you any amount, privately. Put it in your bio or send it to a friend." class="apaylink">
      <div class="apaylink-b">
        <span class="apaylink-url z-data" title={link}>{link.replace(/^https?:\/\//, '').slice(0, 34)}…</span>
        <span class="apaylink-act">
          <Copy text={link} label="Copy link" small />
          <ShareLinks url={link} text="Pay me privately in USDG on @zeronym_app:" />
          <Btn kind="secondary" size="sm" icon="plus" href={href('receive', { new: '1' })}>Ask for a set amount</Btn>
        </span>
      </div>
      <p class="apaylink-note"><Icon name="lock" size={13} />The link shows your shielded address. That address reveals nothing about your balance or your payments.</p>
    </Panel>
  );
}

function NewRequest({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((x) => x);
  const [symbol, setSymbol] = useState(ASSETS[0].symbol);
  const [value, setValue] = useState('');
  const [memo, setMemo] = useState('');
  const [exp, setExp] = useState('24');
  const a = asset(symbol);
  const amount = parseUnits(value, a.decimals) ?? -1n;
  const create = () => {
    const now = Date.now();
    setState((st) => { st.requests = [{ id: randomId('r'), asset: symbol, amount: amount.toString(), memo, expiresAt: exp === '0' ? null : now + Number(exp) * 3600_000, createdAt: now }, ...st.requests]; });
    setValue(''); setMemo(''); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="New payment request" wide>
      <div class="anewreq">
        <div class="aform">
          <AmountField label="Request" symbol={symbol} onSymbol={setSymbol} value={value} onValue={setValue} available={10n ** 30n} availableLabel="Any amount" />
          <Field label="Note for the payer (optional)" id="rmemo"><input id="rmemo" class="z-input" maxLength={80} value={memo} onInput={(e) => setMemo((e.target as HTMLInputElement).value)} placeholder="Design work, October" /></Field>
          <div class="afield"><label>Expires</label><Seg label="Expiry" value={exp} onChange={setExp} options={EXP} /></div>
          <Note tone="warn" title="Who sees what">Whoever you send this link to sees the amount and note. Link previews on X and Telegram don't show them, and the chain never does. Send it in a DM rather than posting it.</Note>
          <Btn kind="primary" size="lg" block icon="plus" disabled={!(amount > 0n)} onClick={create}>Create request</Btn>
        </div>
        <div class="anewreq-prev">
          <p class="anewreq-k"><Icon name="eye" size={14} />What the payer opens</p>
          {amount > 0n ? (
            <>
              <Qr text={requestLink(s, { asset: symbol, amount: amount.toString(), memo, expiresAt: exp === '0' ? null : Date.now() + Number(exp) * 3600_000 })} size={148} />
              <b><Money v={amount} symbol={symbol} /></b>
              {memo && <p class="areq-memo">{memo}</p>}
              <small>{exp === '0' ? 'No expiry' : `Expires in ${EXP.find(([k]) => k === exp)?.[1].toLowerCase()}`} · opens a payment page, filled in</small>
            </>
          ) : <small>Enter an amount to see the request.</small>}
        </div>
      </div>
    </Modal>
  );
}
