// Shield: public deposit into the pool (PRD R3.2).
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { AssetGlyph, Btn, Chip, Money, Note, Seg } from '../ui/kit';
import { ActionModal, VaultSelect, ConnectBtn, useReady } from '../ui/flow';
import { ActionShell, AmountEntry, ChainPreview, Identicon, Pane, PaneLink, PrivacyMeter, Summary } from '../ui/viz';
import { useStore, balances, initialVault } from '../lib/store';
import { POOL_ADDRESS, refreshPublic } from '../lib/pool';
import { FaucetButton } from './Overview';
import { ASSETS, asset, parseUnits, fmt, formatUnits } from '../lib/amount';
import { canPayEth, quoteEth, GAS_RESERVE, SWAP_DEX, type EthQuote } from '../lib/swap';
import { checkShield } from '../lib/privacy';
import { short } from '../lib/chain';
import { href } from '../lib/router';
import { NET } from '../lib/network';
import { GasHelp, useNoEth } from '../ui/gas';

export function Shield() {
  const s = useStore((x) => x);
  const ready = useReady();
  const q = new URLSearchParams(location.search);
  const [symbol, setSymbol] = useState(q.get('asset') && ASSETS.some((a) => a.symbol === q.get('asset')) ? q.get('asset')! : ASSETS[0].symbol);
  // ?amount= comes from the Get set up steps on Overview.
  const [value, setValue] = useState(/^\d{1,6}(\.\d{1,2})?$/.test(q.get('amount') || '') ? q.get('amount')! : '');
  const [vault, setVault] = useState(initialVault(s, q.get('vault')));
  const [open, setOpen] = useState(false);
  const a = asset(symbol);
  const amount = parseUnits(value, a.decimals) ?? -1n;
  const avail = BigInt(s.publicBal[symbol] || '0');
  const tn = s.mode === 'testnet';
  // Pay with ETH: the amount typed is what lands in the pool; the app swaps just enough ETH for it.
  const ethOk = tn && canPayEth(symbol);
  const [payWith, setPayWith] = useState<'token' | 'eth'>(q.get('pay') === 'eth' ? 'eth' : 'token');
  const eth = ethOk && payWith === 'eth';
  const ethBal = BigInt(s.tn.eth || '0');
  const noEth = useNoEth();
  // Set by a payment link's Send screen when the private balance was short.
  // Return address for a payment in progress. Kept in this tab's storage, not the URL, so the note stays off the server.
  const then = (() => { if (q.get('then') !== '1') return ''; try { const t = sessionStorage.getItem('zn-pay-return') || ''; return t.startsWith('/app/send/') ? t : ''; } catch { return ''; } })();
  // No USDG in the wallet but some ETH: start on Pay with ETH, unless the person picked already.
  const [payPicked, setPayPicked] = useState(q.get('pay') != null);
  const balsRead = !!s.wallet && s.tn.balFor === s.wallet.address;
  useEffect(() => {
    if (!payPicked && ethOk && balsRead && avail === 0n && ethBal > 0n) setPayWith('eth');
  }, [payPicked, ethOk, balsRead, avail.toString(), ethBal.toString()]);
  useEffect(() => { if (eth) void refreshPublic().catch(() => {}); }, [eth, s.wallet?.address]);
  const [quote, setQuote] = useState<EthQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState('');
  useEffect(() => {
    setQuote(null); setQuoteErr('');
    if (!eth || amount <= 0n) return;
    let live = true;
    const get = () => quoteEth(symbol, amount).then((r) => { if (live) { setQuote(r); setQuoteErr(''); } }).catch((e) => { if (live) setQuoteErr(String(e?.message || e)); });
    const t = setTimeout(get, 350);
    const every = setInterval(get, 20_000); // prices move; keep the estimate fresh
    return () => { live = false; clearTimeout(t); clearInterval(every); };
  }, [eth, symbol, amount.toString()]);
  const ethShort = eth && !!s.wallet && !!quote && quote.maxIn + GAS_RESERVE > ethBal;
  const eth6 = (v: bigint) => `${formatUnits(v, 18, { max: 6 })} ETH`;
  const approved = !tn && s.activity.some((x) => x.kind === 'shield' && x.asset === symbol && x.status !== 'failed');
  const max = a.maxDeposit ? BigInt(a.maxDeposit) : null;
  const overMax = max != null && amount > max;
  const valid = amount > 0n && !overMax && (eth ? !!quote && quote.amountOut === amount && !ethShort : amount <= avail);
  const has = amount > 0n;
  const priv = s.keys ? balances(s, vault)[symbol].spendable : 0n;
  const walletBals = Object.fromEntries(ASSETS.map((x) => [x.symbol, BigInt(s.publicBal[x.symbol] || '0')]));
  const vName = s.vaults.find((v) => v.id === vault)?.name || 'Main';
  const who = s.wallet ? short(s.wallet.address) : 'Your wallet';

  const side = (
    <>
      <ChainPreview title="What the explorer shows" rows={[
        { k: 'From', pub: <span class="aprev-addr">{s.wallet && <Identicon seed={s.wallet.address} size={16} />}<span class="z-data">{who}</span></span> },
        { k: 'To', pub: <span class="aprev-addr"><Icon name="lock" size={13} />Zeronym pool</span> },
        ...(eth ? [{ k: 'Swap', pub: <>ETH → {symbol} on {SWAP_DEX}</> }] : []),
        { k: 'Token', pub: symbol },
        { k: 'Amount', pub: has ? fmt(amount, symbol) : <span class="muted">Your amount</span> },
        { k: 'New notes', pub: null, me: 'A note only your key can open', len: 12 },
        { k: 'Owner', pub: null, me: 'You (privacy key)', len: 8 },
        { k: 'Vault', pub: null, me: vName, len: 6 },
      ]} foot={<>A deposit is public: anyone can see that this wallet put this amount in. <b>What happens next isn't.</b></>} />
    </>
  );

  return (
    <ActionShell current="shield" side={side}>
      {ready && !s.backedUp && <Note tone="warn" title="Back up first">Confirm your recovery phrase backup before you shield. <a href={href('account')}>Back up now</a></Note>}
      {then && <Note tone="info" title="Paying a request?">Once this shield is credited, go back to the payment. <a class="alink" href={then}>Back to the payment</a></Note>}
      {ready && noEth && <GasHelp />}
      <Pane label="From your wallet" icon="globe" tone="pub" right={<span class="apane-who">{s.wallet ? <Identicon seed={s.wallet.address} size={18} /> : <Icon name="wallet" size={14} />}<span class="z-data">{who}</span><Chip tone="pub">Public</Chip></span>}>
        {ethOk && (
          <div class="ashield-pay">
            <span>Pay with</span>
            <Seg label="Pay with" value={payWith} onChange={(v) => { setPayPicked(true); setPayWith(v); }} options={[['token', symbol], ['eth', 'ETH']]} />
          </div>
        )}
        <AmountEntry symbol={symbol} onSymbol={setSymbol} value={value} onValue={setValue} available={avail} balanceLabel="In wallet" balances={walletBals} any={eth} />
        {eth && (
          <div class={`ashield-quote${ethShort || quoteErr ? ' err' : ''}`} aria-live="polite">
            <div><span>You pay</span><b>{!has ? 'Enter how much to shield' : quote ? <>≈ {eth6(quote.ethIn)}</> : quoteErr ? 'No price right now' : 'Getting a price…'}</b></div>
            {quote && <small>At most {eth6(quote.maxIn)}. Whatever the swap doesn’t use comes straight back.</small>}
            {quoteErr && <small>{quoteErr}</small>}
            {s.wallet && <small>In wallet: {eth6(ethBal)}{ethShort ? `. That’s not enough: keep about ${eth6(GAS_RESERVE)} extra for network fees.` : ''}</small>}
          </div>
        )}
      </Pane>
      <PaneLink active={has && !overMax} icon="lock" label="Shield into the pool" />
      <Pane label="Into your private balance" icon="lock" tone="priv" right={<Chip tone="priv" icon="lock">Encrypted</Chip>}>
        <div class="apane-after">
          <AssetGlyph symbol={symbol} size={38} />
          <div>
            <small>{vName} vault after this</small>
            <b><Money v={priv + (has ? amount : 0n)} symbol={symbol} /></b>
          </div>
          {has && <span class="apane-delta">+{fmt(amount, symbol)}</span>}
        </div>
        <VaultSelect value={vault} onChange={setVault} label="Credit to vault" />
      </Pane>
      {overMax && <Note tone="warn">The {NET.isTestnet ? 'testnet pool' : 'pool'} takes at most {fmt(max!, symbol)} per deposit.</Note>}
      {tn && ready && avail === 0n && a.faucetUrl && <div class="ashield-faucet"><span>No {symbol} in your wallet yet.</span><FaucetButton /></div>}
      <Summary rows={[
        [<><Icon name="clock" size={14} />Steps</>, eth ? `Swap ETH for ${symbol}, approve, then deposit` : approved || !tn ? 'Deposit' : `Approve ${symbol}, then deposit`],
        [<><Icon name="wallet" size={14} />Network fee</>, eth ? 'About 0.00005 ETH for all three, paid by your wallet' : tn ? 'About 0.000012 ETH, paid by your wallet' : 'None in demo'],
        [<><Icon name="check" size={14} />Spendable</>, 'Once the deposit confirms'],
      ]} />
      <PrivacyMeter list={checkShield(symbol, has ? amount : 0n)} />
      {!ready ? <ConnectBtn action="shield" /> : <Btn kind="primary" size="lg" block icon="shield" class="acon-cta" disabled={!valid || !s.backedUp} onClick={() => setOpen(true)}>
        {!s.backedUp ? 'Back up your phrase to shield' : !value ? 'Enter an amount' : eth && ethShort ? 'Not enough ETH' : eth && has && !overMax && !quote ? (quoteErr ? 'No price right now' : 'Getting a price…') : !valid ? 'Check the amount' : eth ? `Review paying ETH for ${fmt(amount, symbol)}` : `Review shielding ${fmt(amount, symbol)}`}
      </Btn>}
      <p class="acon-note"><Icon name="warn" size={13} />The token's issuer can still freeze or block the token itself, inside or outside the pool.</p>
      <ActionModal
        open={open} onClose={() => { setOpen(false); }}
        plan={valid ? { kind: 'shield', asset: symbol, amount, vault, ...(eth && quote ? { payEth: { maxIn: quote.maxIn, fee: quote.fee } } : {}) } : null}
        title="Shield" confirmLabel={eth ? 'Swap and deposit' : 'Deposit'}
        steps={approved || eth ? undefined : [`Approve ${symbol}`, 'Deposit']}
        walletNote={eth ? 'Your wallet asks you to confirm up to 3 times: the swap, the approval, then the deposit.' : undefined}
        onDone={() => setValue('')}
        extra={<dl class="areview-dl"><div><dt>Contract</dt><dd>{tn ? <a class="alink z-data" href={`${NET.explorer}/address/${POOL_ADDRESS}`} target="_blank" rel="noopener">{short(POOL_ADDRESS)} <Icon name="external" size={12} /></a> : <>Shielded pool · <span class="muted">not published (demo)</span></>}{tn && <small class="muted"> · {NET.isTestnet ? 'testnet' : 'mainnet'}</small>}</dd></div><div><dt>Credit to</dt><dd>{vName}</dd></div>{eth && quote && <><div><dt>You pay</dt><dd>≈ {eth6(quote.ethIn)} <small class="muted">· at most {eth6(quote.maxIn)}</small></dd></div><div><dt>Swap</dt><dd>{SWAP_DEX}, {quote.fee / 10000}% pool fee <small class="muted">· unused ETH comes back in the same transaction</small></dd></div></>}</dl>}
        disclosure={<Note tone="pub" title="This deposit is public">Anyone can see that <span class="z-data">{s.wallet ? short(s.wallet.address) : 'your wallet'}</span> {eth ? <>swapped ETH for {value ? fmt(amount, symbol) : 'this amount'} and deposited it into the pool, and when.</> : <>deposited {value ? fmt(amount, symbol) : 'this amount'} into the pool, and when.</>}</Note>}
      />
    </ActionShell>
  );
}
