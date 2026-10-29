// Withdraw to a public address (PRD R3.6), as the token itself or swapped to ETH on the way out.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { Btn, Chip, Note, Seg, cx } from '../ui/kit';
import { ActionModal, VaultSelect, ConnectBtn, useReady } from '../ui/flow';
import { ActionShell, AmountEntry, ChainPreview, Identicon, Pane, PaneLink, PrivacyMeter, Summary } from '../ui/viz';
import { useStore, balances, quote, initialVault } from '../lib/store';
import { ASSETS, asset, parseUnits, fmt, formatUnits } from '../lib/amount';
import { canGetEth, quoteToEth, SWAP_DEX, type EthOutQuote } from '../lib/swap';
import { checkWithdraw } from '../lib/privacy';
import { isAddress, isShielded, short } from '../lib/chain';
import { go, href } from '../lib/router';

export function Withdraw() {
  const s = useStore((x) => x);
  const ready = useReady();
  const q = new URLSearchParams(location.search);
  const [to, setTo] = useState(q.get('to') || '');
  const [symbol, setSymbol] = useState(ASSETS.some((a) => a.symbol === q.get('asset')) ? q.get('asset')! : ASSETS[0].symbol);
  const [value, setValue] = useState(q.get('amount') || '');
  const [vault, setVault] = useState(initialVault(s, q.get('vault')));
  const [open, setOpen] = useState(false);
  const a = asset(symbol);
  const amount = parseUnits(value, a.decimals) ?? -1n;
  const fee = BigInt(quote(symbol, 'withdraw').relayer);
  const avail = balances(s, vault)[symbol].spendable;
  const t = to.trim();
  const ok = isAddress(t);
  const toErr = t && !ok ? (isShielded(t) ? '' : 'Enter a public address that starts with 0x and has 40 characters after it.') : '';
  const has = amount > 0n;
  const tn = s.mode === 'testnet';
  // Receive as ETH: the amount typed leaves the pool as the token and is swapped for ETH in the same transaction.
  const ethOk = tn && canGetEth(symbol);
  const [recv, setRecv] = useState<'token' | 'eth'>(q.get('receive') === 'eth' ? 'eth' : 'token');
  const eth = ethOk && recv === 'eth';
  const [ethQ, setEthQ] = useState<EthOutQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState('');
  useEffect(() => {
    setEthQ(null); setQuoteErr('');
    if (!eth || amount <= 0n) return;
    let live = true;
    const get = () => quoteToEth(symbol, amount).then((r) => { if (live) { setEthQ(r); setQuoteErr(''); } }).catch((e) => { if (live) setQuoteErr(String(e?.message || e)); });
    const t = setTimeout(get, 350);
    const every = setInterval(get, 20_000); // prices move; keep the estimate fresh
    return () => { live = false; clearTimeout(t); clearInterval(every); };
  }, [eth, symbol, amount.toString()]);
  const eth6 = (v: bigint) => `${formatUnits(v, 18, { max: 6 })} ETH`;
  const quoted = !!ethQ && ethQ.amountIn === amount;
  const valid = ok && amount > 0n && amount + fee <= avail && (!eth || quoted);
  const arrives = eth ? (quoted ? `≈ ${eth6(ethQ!.ethOut)}` : 'ETH') : has ? fmt(amount, symbol) : '';
  const relayer = s.tn.relayer;
  const findings = checkWithdraw(s, symbol, has ? amount : 0n, t, s.prefs.delayDefault);
  const vBals = Object.fromEntries(ASSETS.map((x) => [x.symbol, balances(s, vault)[x.symbol].spendable]));
  const vName = s.vaults.find((v) => v.id === vault)?.name || 'Main';
  const mine = !!s.wallet && t.toLowerCase() === s.wallet.address.toLowerCase();
  const left = avail - (has ? amount + fee : 0n);

  const side = (
    <>
      <ChainPreview title="What the explorer shows" rows={[
        { k: 'Submitted by', pub: tn && !relayer ? <span class="z-data">{s.wallet ? short(s.wallet.address) : 'Your wallet'}</span> : <span class="aprev-addr"><Icon name="spark" size={13} />Relayer{relayer ? <span class="z-data muted"> {short(relayer.address)}</span> : null}</span> },
        { k: 'Recipient', pub: ok ? <span class="aprev-addr"><Identicon seed={t} size={16} /><span class="z-data">{short(t)}</span></span> : <span class="muted">The address you enter</span> },
        ...(eth ? [{ k: 'Via', pub: <span class="aprev-addr"><Icon name="swap" size={13} />Zeronym ETH exit</span> }] : []),
        { k: 'Token', pub: eth ? <>{symbol} → ETH on {SWAP_DEX}</> : symbol },
        { k: 'Amount', pub: has ? (eth ? <>{fmt(amount, symbol)}{quoted && <span class="muted"> → {eth6(ethQ!.ethOut)}</span>}</> : fmt(amount, symbol)) : <span class="muted">Your amount</span> },
        { k: 'Paid from', pub: null, me: `Notes in your ${vName} vault`, len: 12 },
        { k: 'Who withdrew', pub: null, me: 'You', len: 8 },
        { k: 'Balance left', pub: null, me: left >= 0n ? fmt(left, symbol) : '—', len: 7 },
      ]} foot={<>A withdrawal is public again: destination, token, amount and time. <b>Which deposit it came from stays hidden</b>, as long as nothing else links them.</>} />
    </>
  );

  return (
    <ActionShell current="withdraw" side={side}>
      <Pane label="From your private balance" icon="lock" tone="priv" right={<Chip tone="priv" icon="lock">Private</Chip>}>
        <VaultSelect value={vault} onChange={setVault} label="Withdraw from vault" symbol={symbol} />
        <AmountEntry symbol={symbol} onSymbol={setSymbol} value={value} onValue={setValue} available={avail} reserve={fee} balanceLabel="Spendable" balances={vBals} />
      </Pane>
      <PaneLink active={has && ok} icon="withdraw" label="Withdraw to a public address" />
      <Pane label="To a public address" icon="globe" tone="pub" right={<Chip tone="pub" icon="globe">Public</Chip>}>
        <div class={cx('ato', ok && 'pub', toErr && 'bad')}>
          {ok ? <Identicon seed={t} size={30} /> : <span class="ato-ph"><Icon name="globe" size={16} /></span>}
          <input id="wto" class="z-data" autocomplete="off" spellcheck={false} placeholder="0x… destination address" aria-label="Destination address" aria-invalid={!!toErr} value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
          {s.wallet && !mine && <button type="button" class="ato-quick" onClick={() => setTo(s.wallet!.address)}>My wallet</button>}
          {t && <button type="button" class="ato-clear" aria-label="Clear" onClick={() => setTo('')}><Icon name="x" size={14} /></button>}
        </div>
        {toErr ? <p class="aentry-msg">{toErr}</p> : <p class="apane-hint">{mine ? 'Your own wallet. If it also funded your deposits, this links them in public.' : 'Any public address. It will be visible on the chain.'}</p>}
        {ethOk && (
          <div class="ashield-pay awd-recv">
            <span>Receive as</span>
            <Seg label="Receive as" value={recv} onChange={setRecv} options={[['token', symbol], ['eth', 'ETH']]} />
          </div>
        )}
        {eth && (
          <div class={`ashield-quote${quoteErr ? ' err' : ''}`} aria-live="polite">
            <div><span>They get</span><b>{!has ? 'Enter how much to withdraw' : quoted ? <>≈ {eth6(ethQ!.ethOut)}</> : quoteErr ? 'No price right now' : 'Getting a price…'}</b></div>
            {quoted && <small>At least {eth6(ethQ!.minOut)}. If the price drops further before it goes through, nothing happens and nothing is spent.</small>}
            {quoteErr && <small>{quoteErr}</small>}
            <small>Good for a new wallet: it arrives with ETH for network fees.</small>
          </div>
        )}
        {isShielded(t) && (
          <div class="aswitch">
            <Note tone="priv" title="That's a shielded address">Paying it can stay inside the pool, which keeps the amount and both sides private.</Note>
            <Btn kind="primary" iconRight="chevron" onClick={() => go('send', { to: t, asset: symbol, amount: value })}>Send privately instead</Btn>
          </div>
        )}
      </Pane>
      <Summary rows={[
        [<><Icon name="spark" size={14} />Submitted by</>, tn && !relayer ? 'Your wallet (relayer offline)' : 'Relayer'],
        [<><Icon name="wallet" size={14} />Fee</>, fee > 0n ? `${fmt(fee, symbol)}, fixed by the proof` : 'None'],
        ...(eth ? [[<><Icon name="swap" size={14} />Swap</>, `${has ? fmt(amount, symbol) : symbol} for ETH on ${SWAP_DEX}, in the same transaction`] as [any, string]] : []),
        [<><Icon name="check" size={14} />Arrives</>, has ? `${arrives} at ${ok ? short(t) : 'the destination'}` : '—'],
      ]} />
      <PrivacyMeter list={has || t ? findings : []} idle="Enter an amount and a destination to run the privacy check." />
      {!ready ? <ConnectBtn action="withdraw" /> : <Btn kind="primary" size="lg" block icon="withdraw" class="acon-cta" disabled={!valid} onClick={() => setOpen(true)}>
        {!ok ? 'Enter a destination' : !value ? 'Enter an amount' : eth && has && amount + fee <= avail && !quoted ? (quoteErr ? 'No price right now' : 'Getting a price…') : !valid ? 'Check the amount' : eth ? `Review withdrawing ${fmt(amount, symbol)} as ETH` : `Review withdrawing ${fmt(amount, symbol)}`}
      </Btn>}
      <p class="acon-note"><Icon name="fallback" size={13} />If this interface is down, you can still withdraw without it. <a href={href('fallback')}>Fallback withdrawal</a></p>
      <ActionModal
        open={open} onClose={() => setOpen(false)}
        plan={valid ? { kind: 'withdraw', asset: symbol, amount, vault, counterparty: t, ...(eth && ethQ ? { toEth: { minOut: ethQ.minOut, fee: ethQ.fee } } : {}) } : null}
        title="Withdrawal" confirmLabel={eth ? 'Prove, withdraw and swap' : 'Prove and withdraw'}
        onDone={() => setValue('')}
        extra={<dl class="areview-dl"><div><dt>From vault</dt><dd>{vName}</dd></div>{eth && ethQ && <><div><dt>They get</dt><dd>≈ {eth6(ethQ.ethOut)} <small class="muted">· at least {eth6(ethQ.minOut)}</small></dd></div><div><dt>Swap</dt><dd>{SWAP_DEX}, {ethQ.fee / 10000}% pool fee <small class="muted">· below the minimum, nothing is spent</small></dd></div></>}</dl>}
        disclosure={
          <div class="apublic">
            <b><Icon name="globe" size={16} />This becomes public</b>
            <dl>
              <div><dt>Destination</dt><dd class="z-data">{t}</dd></div>
              <div><dt>Asset and amount</dt><dd>{value ? fmt(amount, symbol) : '—'}{eth && ethQ ? `, swapped to ≈ ${eth6(ethQ.ethOut)}` : ''}</dd></div>
              <div><dt>Time</dt><dd>When it confirms</dd></div>
            </dl>
            {eth && <small class="muted">The swap is public too: anyone can see this withdrawal went through the Zeronym ETH exit.</small>}
          </div>
        }
      />
    </ActionShell>
  );
}
