// Private transfer to a shielded address (PRD R3.4).
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { Btn, Chip, Note, cx } from '../ui/kit';
import { ActionModal, VaultSelect, ConnectBtn, useReady } from '../ui/flow';
import { ActionShell, AmountEntry, ChainPreview, Identicon, Pane, PaneLink, Summary } from '../ui/viz';
import { useStore, balances, quote, initialVault } from '../lib/store';
import { ASSETS, asset, parseUnits, fmt } from '../lib/amount';
import { isAddress, isShielded, short } from '../lib/chain';
import { go, href } from '../lib/router';

export function Send() {
  const s = useStore((x) => x);
  const ready = useReady();
  // Payment links put the details after # so they never reach the server; older links used ?.
  const q = new URLSearchParams(location.hash.length > 1 ? location.hash.slice(1) : location.search);
  const [to, setTo] = useState(q.get('to') || '');
  const [symbol, setSymbol] = useState(ASSETS.some((a) => a.symbol === q.get('asset')) ? q.get('asset')! : ASSETS[0].symbol);
  const [value, setValue] = useState(q.get('amount') || '');
  const [memo, setMemo] = useState(q.get('memo') || '');
  const [memoOpen, setMemoOpen] = useState(!!q.get('memo'));
  const [vault, setVault] = useState(initialVault(s, q.get('vault')));
  const [open, setOpen] = useState(false);
  const a = asset(symbol);
  const amount = parseUnits(value, a.decimals) ?? -1n;
  const fee = BigInt(quote(symbol, 'send').relayer);
  const avail = balances(s, vault)[symbol].spendable;
  const t = to.trim();
  const pub = isAddress(t);
  const shielded = isShielded(t);
  const self = shielded && t === s.keys?.address;
  const toErr = t && !pub && !shielded ? 'That isn’t a shielded address (zn1…) or a public address (0x…).' : '';
  const valid = shielded && !self && amount > 0n && amount + fee <= avail;
  const has = amount > 0n;
  const tn = s.mode === 'testnet';
  const relayer = s.tn.relayer;
  const vBals = Object.fromEntries(ASSETS.map((x) => [x.symbol, balances(s, vault)[x.symbol].spendable]));
  // From a payment link: an expiry, and a way to shield first when the private balance is short.
  const expAt = Number(q.get('exp') || 0) * 1000;
  const expired = expAt > 0 && Date.now() > expAt;
  const short_ = ready && shielded && !self && amount > 0n && amount + fee > avail;
  const need = short_ ? amount + fee - avail : 0n;
  const shieldAmt = short_ ? String(Math.ceil(Number(need) / 10 ** a.decimals)) : '';
  // Remember this payment so Shield can link back to it (kept in this tab, not in the URL).
  useEffect(() => { if (short_) try { sessionStorage.setItem('zn-pay-return', location.pathname + location.search + location.hash); } catch {} }, [short_]);
  const paste = async () => { try { const v = await navigator.clipboard.readText(); if (v) setTo(v.trim()); } catch { /* no clipboard permission */ } };

  const side = (
    <>
      <ChainPreview title="What the explorer shows" rows={[
        { k: 'Submitted by', pub: tn && !relayer ? <span class="z-data">{s.wallet ? short(s.wallet.address) : 'Your wallet'}</span> : <span class="aprev-addr"><Icon name="spark" size={13} />Relayer{relayer ? <span class="z-data muted"> {short(relayer.address)}</span> : null}</span> },
        { k: 'Contract', pub: <span class="aprev-addr"><Icon name="lock" size={13} />Zeronym pool</span> },
        { k: 'Token', pub: symbol },
        { k: 'Relayer fee', pub: fee > 0n ? fmt(fee, symbol) : '—' },
        { k: 'Sender', pub: null, me: 'You', len: 8 },
        { k: 'Recipient', pub: null, me: shielded ? <span class="z-data">{short(t, 8)}</span> : 'The address you enter', len: 12 },
        { k: 'Amount', pub: null, me: has ? fmt(amount, symbol) : 'Your amount', len: 7 },
        { k: 'Note', pub: null, me: memo || 'None', len: 9 },
      ]} foot={<>Outsiders see a pool transaction in {symbol} and the relayer's fee. <b>Who paid whom and how much stay encrypted.</b></>} />
    </>
  );

  return (
    <ActionShell current="send" side={side}>
      {expired && <Note tone="warn" title="This request has expired">It expired on {new Date(expAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. Check with the person before you pay it.</Note>}
      {short_ && (
        <Note tone="info" title={`Shield ${shieldAmt} ${symbol} first`}>
          Your private balance is {fmt(avail, symbol)}, and this payment needs {fmt(amount + fee, symbol)} with the relayer fee. Shield first, then come back here.
          <div class="asend-first"><Btn kind="primary" size="sm" icon="shield" href={href('shield', { amount: shieldAmt, then: '1' })}>Shield {shieldAmt} {symbol}</Btn></div>
        </Note>
      )}
      <Pane label="From your private balance" icon="lock" tone="priv" right={<Chip tone="priv" icon="lock">Private</Chip>}>
        <VaultSelect value={vault} onChange={setVault} label="Pay from vault" symbol={symbol} />
        <AmountEntry symbol={symbol} onSymbol={setSymbol} value={value} onValue={setValue} available={avail} reserve={fee} balanceLabel="Spendable" balances={vBals} />
      </Pane>
      <PaneLink active={has && shielded && !self} icon="send" label="Send privately" />
      <Pane label="To" icon="send" tone={pub ? 'pub' : 'priv'} right={shielded && !self ? <Chip tone="ok" icon="check">Shielded address</Chip> : pub ? <Chip tone="pub" icon="globe">Public address</Chip> : null}>
        <div class={cx('ato', shielded && !self && 'ok', pub && 'pub', toErr && 'bad')}>
          {shielded || pub ? <Identicon seed={t} size={30} /> : <span class="ato-ph"><Icon name="lock" size={16} /></span>}
          <input id="to" class="z-data" autocomplete="off" spellcheck={false} placeholder="zn1… shielded address" aria-label="Recipient" aria-invalid={!!toErr} value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
          {!t && <button type="button" class="ato-quick" onClick={paste}>Paste</button>}
          {t && <button type="button" class="ato-clear" aria-label="Clear" onClick={() => setTo('')}><Icon name="x" size={14} /></button>}
        </div>
        {toErr ? <p class="aentry-msg">{toErr}</p> : !t && <p class="apane-hint">Paste it or scan it from the recipient's Receive screen.</p>}
        {pub && (
          <div class="aswitch">
            <Note tone="pub" title="That's a public address, so this becomes a withdrawal">
              Sending to <span class="z-data">{short(t)}</span> takes funds out of the pool. The destination, asset, amount and time will be public.
            </Note>
            <Btn kind="primary" iconRight="chevron" onClick={() => go('withdraw', { to: t, asset: symbol, amount: value })}>Continue as a withdrawal</Btn>
          </div>
        )}
        {self && <Note tone="info">That's your own shielded address. To move funds between your vaults, use Move between vaults on <a href={href('vaults')}>Vaults</a>.</Note>}
        {!pub && (memoOpen
          ? <div class="amemo"><Icon name="lock" size={14} /><input id="memo" class="z-input" maxLength={80} value={memo} aria-label="Private note" onInput={(e) => setMemo((e.target as HTMLInputElement).value)} placeholder="Private note, e.g. Invoice 0142" /><small>{memo.length}/80 · encrypted</small></div>
          : <button type="button" class="amemo-add" onClick={() => setMemoOpen(true)}><Icon name="plus" size={14} />Add a private note</button>)}
      </Pane>
      {!pub && (
        <>
          <Summary rows={[
            [<><Icon name="spark" size={14} />Submitted by</>, tn && !relayer ? 'Your wallet (relayer offline)' : 'Relayer, so your wallet stays out of it'],
            [<><Icon name="wallet" size={14} />Fee</>, fee > 0n ? `${fmt(fee, symbol)}, fixed by the proof` : 'None'],
            [<><Icon name="check" size={14} />Recipient gets</>, has ? fmt(amount, symbol) : '—'],
          ]} />
          {tn && !relayer && <Note tone="warn" title="The relayer is unavailable">Your wallet would submit this, which links the transaction to your wallet address in public.</Note>}
          {!ready ? <ConnectBtn action="send" /> : <Btn kind="primary" size="lg" block icon="lock" class="acon-cta" disabled={!valid} onClick={() => setOpen(true)}>
            {!shielded ? 'Enter a shielded recipient' : !value ? 'Enter an amount' : !valid ? 'Check the amount' : `Review sending ${fmt(amount, symbol)}`}
          </Btn>}
          <p class="acon-note"><Icon name="info" size={13} />The person you pay sees the amount and your note, as with any payment.</p>
        </>
      )}
      <ActionModal
        open={open} onClose={() => setOpen(false)}
        plan={valid ? { kind: 'send', asset: symbol, amount, vault, counterparty: t, memo: memo || undefined } : null}
        title="Private send" confirmLabel="Prove and send"
        onDone={() => { setValue(''); setMemo(''); }}
        extra={<dl class="areview-dl"><div><dt>To</dt><dd class="z-data">{short(t, 8)}</dd></div><div><dt>From vault</dt><dd>{s.vaults.find((v) => v.id === vault)?.name}</dd></div>{memo && <div><dt>Note</dt><dd>{memo}</dd></div>}</dl>}
        disclosure={<Note tone="priv" title="Private inside the pool">Outsiders see only that a pool transaction happened, in which token, and the relayer's fee. The recipient sees the amount and the note.</Note>}
      />
    </ActionShell>
  );
}
