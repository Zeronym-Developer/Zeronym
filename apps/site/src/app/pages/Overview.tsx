// Overview: what you hold privately, what's on its way, recent activity, service status.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { AssetGlyph, Btn, Money, Note, Seg, Empty, StatusPill, Progress, cx } from '../ui/kit';
import { Panel, Ring } from '../ui/dash';
import { ActivityTable } from '../ui/activity';
import { useStore, setState, balances, activeVaults, KIND_LABEL, type State, type Activity } from '../lib/store';
import { POOL_ADDRESS } from '../lib/pool';
import { openWallet } from '../lib/ui';
import { ASSETS, formatUnits } from '../lib/amount';
import { href } from '../lib/router';
import { CHAIN } from '../lib/chain';
import { NET, SITE_ORIGIN } from '../lib/network';
import { useNoEth } from '../ui/gas';

export function Overview() {
  const s = useStore((x) => x);
  const [view, setView] = useState<'me' | 'out'>('me');
  const locked = !s.keys;
  const tn = s.mode === 'testnet';
  const setupOpen = !s.prefs.setupHidden && !setupDone(s);
  const live = s.activity.filter((a) => a.status !== 'credited' && a.status !== 'failed');

  return (
    <div class="ov5 ov6">
      {s.keys && !s.backedUp && !setupOpen && (
        <Note tone="warn" title="Back up your recovery phrase">
          You can't shield until your backup is confirmed. Without it, losing this device means losing access. <a href={href('account', { backup: '1' })}>Back up now</a>
        </Note>
      )}
      {setupOpen && <Setup />}
      {tn && setupDone(s) && !s.prefs.celebrated && <FirstDone />}
      <Balances />
      {live.length > 0 && <InProgress list={live} />}

      <Panel title="Recent activity" class="ov-act"
        actions={s.activity.length > 0 && <><Seg label="Point of view" value={view} onChange={setView} options={[['me', 'You'], ['out', 'A stranger']]} /><a class="alink" href={href('activity')}>View all <Icon name="chevron" size={14} /></a></>}>
        {s.activity.length > 0 ? (
          <>
            {view === 'out' && <p class="ov-out-note"><Icon name="globe" size={14} />Only the edges are public. Everything inside the pool shows up as an encrypted pool transaction.</p>}
            <ActivityTable list={s.activity} limit={5} outsider={view === 'out'} />
          </>
        ) : (
          <Empty icon="activity" title="Nothing here yet">
            <p>{tn ? (NET.isTestnet ? 'Get testnet USDG from the Paxos faucet, then shield it. You’ll see each step as it happens on testnet.' : 'Shield USDG from your wallet. You’ll see each step as it happens on Robinhood Chain.') : 'Start by shielding some demo funds. You’ll see each step as it happens.'}</p>
            {locked ? <Btn kind="primary" icon="wallet" onClick={openWallet}>{s.wallet ? 'Set up privacy key' : 'Connect a wallet'}</Btn> : <Btn kind="primary" icon="shield" href={href('shield')}>{tn ? (NET.isTestnet ? 'Shield test dollars' : 'Shield USDG') : 'Shield demo funds'}</Btn>}
          </Empty>
        )}
      </Panel>

      <Service />
    </div>
  );
}

// ---- Actions on their way: submitted, confirming, proving. Never shown as spendable. ----
function InProgress({ list }: { list: Activity[] }) {
  return (
    <Panel title="In progress" icon="clock" sub="Not spendable until credited. Each step is checked against the chain." class="ov6-live">
      <ul class="ov6-live-l">
        {list.slice(0, 4).map((a) => (
          <li>
            <div class="ov6-live-h"><b>{KIND_LABEL[a.kind]} · <Money v={a.amount} symbol={a.asset} /></b><StatusPill a={a} /></div>
            <Progress a={a} />
          </li>
        ))}
      </ul>
      {list.length > 4 && <a class="alink dp-more" href={href('activity', { status: 'live' })}>{list.length - 4} more in Activity <Icon name="chevron" size={14} /></a>}
    </Panel>
  );
}

// ---- Where things run, and what's been verified ----
function Service() {
  const s = useStore((x) => x);
  if (s.mode !== 'testnet') return (
    <div class="ov6-svc"><span class="warn"><Icon name="info" size={14} /><b>Demo mode.</b> Everything runs in this browser and nothing touches a chain.</span></div>
  );
  const err = s.tn.error;
  return (
    <div class="ov6-svc">
      <span class="warn"><Icon name="warn" size={14} />{NET.isTestnet ? <><b>Testnet.</b> Test tokens only, with no value.</> : <><b>Mainnet.</b> Real funds. Only deposit what you can afford to lose.</>}</span>
      <span class={err ? 'bad' : 'ok'}><Icon name={err ? 'warn' : 'check'} size={14} /><b>Pool view:</b> {err === 'mismatch' ? 'doesn’t match the chain yet; actions paused' : err === 'offline' ? 'can’t reach the RPC, retrying' : `checked against the chain at block ${s.tn.synced.toLocaleString('en-US')}${s.tn.txCount ? `. ${s.tn.txCount} pool transactions so far: ${s.tn.poolSize} notes created (NewCommitment events), ${s.tn.spentCount ?? 0} spent (NewNullifier events)` : ''}`}</span>
      <span class={s.tn.relayer ? 'ok' : s.tn.relayer === null ? 'bad' : ''}><Icon name={s.tn.relayer ? 'check' : s.tn.relayer === null ? 'warn' : 'clock'} size={14} /><b>Relayer:</b> {s.tn.relayer ? 'available' : s.tn.relayer === null ? 'unavailable' : 'checking'}</span>
      <a class="alink" href={`${CHAIN.explorer}/address/${POOL_ADDRESS}`} target="_blank" rel="noopener">Pool contract <Icon name="external" size={12} /></a>
    </div>
  );
}

// ---- Get set up: four steps, dismissible ----
const shieldedOnce = (s: State) => s.activity.some((a) => a.kind === 'shield' && a.status === 'credited');
// A send or a vault move: both are private transfers inside the pool.
const sentOnce = (s: State) => s.activity.some((a) => (a.kind === 'send' || a.kind === 'move') && a.status === 'credited');
const setupDone = (s: State) => !!s.wallet && !!s.keys && s.backedUp && shieldedOnce(s) && sentOnce(s);
// First amounts the steps suggest. The relayer fee is fixed per transfer, so the first shield
// leaves room for a move and a little to spare.
const FIRST_SHIELD = '5';
const FIRST_MOVE = '1';

function Setup() {
  const s = useStore((x) => x);
  const tn = s.mode === 'testnet';
  const hasPub = ASSETS.some((a) => BigInt(s.publicBal[a.symbol] || '0') > 0n);
  const noEth = useNoEth();
  const sym = ASSETS[0].symbol;
  const ethPay = tn && !NET.isTestnet && s.tn.balFor === s.wallet?.address && !hasPub && BigInt(s.tn.eth || '0') > 0n;
  const shieldStep = !tn || NET.isTestnet
    ? { title: tn ? 'Shield test dollars' : 'Shield demo funds', body: tn && !hasPub ? 'Get free test dollars, then move them into your private balance.' : 'Move funds from your wallet into your private balance.', href: href('shield') }
    : {
      title: `Shield your first ${FIRST_SHIELD} ${sym}`,
      body: noEth ? `First get a few dollars of ETH on ${CHAIN.name}. The Shield page lists the quickest bridges.`
        : ethPay ? `Pay with ETH: the app buys ${FIRST_SHIELD} ${sym} for you and shields it. No ${sym} needed.`
        : `Move ${FIRST_SHIELD} ${sym} from your wallet into your private balance.`,
      href: href('shield', { amount: FIRST_SHIELD, ...(ethPay ? { pay: 'eth' } : {}) }),
    };
  const steps: { done: boolean; icon: string; title: string; body: string; href?: string; onClick?: () => void }[] = [
    { done: !!s.wallet, icon: 'wallet', title: 'Connect a wallet', body: tn ? `A browser or phone wallet on ${CHAIN.name}.` : 'You’re using the demo wallet.', onClick: openWallet },
    { done: !!s.keys && s.backedUp, icon: 'key', title: 'Back up your key', body: s.keys ? 'Save your 24-word recovery phrase. Shielding waits for it.' : 'Create a privacy key, then save its 24-word phrase.', ...(s.keys ? { href: href('account', { backup: '1' }) } : { onClick: openWallet }) },
    { done: shieldedOnce(s), icon: 'shield', ...shieldStep },
    { done: sentOnce(s), icon: 'send', title: 'Make a private transfer', body: `Move ${FIRST_MOVE} ${sym} into a Savings vault, or pay a friend. The chain sees a pool transaction, not who paid whom or how much.`, href: href('vaults', { first: '1', amount: FIRST_MOVE }) },
  ];
  const done = steps.filter((x) => x.done).length;
  const next = steps.findIndex((x) => !x.done);
  return (
    <section class="dp ov5-setup">
      <header class="dp-h">
        <div class="ov5-setup-t"><Ring done={done} total={steps.length} /><div><h2>Get set up</h2><p>{done === 0 ? 'Four steps to your first private transfer. About five minutes.' : `${done} of ${steps.length} done. ${steps.length - done === 1 ? 'One step' : `${steps.length - done} steps`} to your first private transfer${NET.isTestnet ? ' on testnet' : ''}.`}</p></div></div>
        <button type="button" class="dx" aria-label="Hide these steps" title="Hide these steps" onClick={() => setState((st) => { st.prefs = { ...st.prefs, setupHidden: true }; })}><Icon name="x" size={18} /></button>
      </header>
      <ol class="ov5-steps">
        {steps.map((x, i) => {
          const body = <><span class="ov5-step-h"><span class="ov5-step-ic"><Icon name={x.done ? 'check' : x.icon} size={18} /></span><small>Step {i + 1}</small></span><b>{x.title}</b><span class="ov5-step-p">{x.body}</span></>;
          const cls = cx('ov5-step', x.done && 'done', i === next && 'now');
          return <li>{x.done ? <div class={cls}>{body}</div> : x.href ? <a class={cls} href={x.href}>{body}</a> : <button type="button" class={cls} onClick={x.onClick}>{body}</button>}</li>;
        })}
      </ol>
    </section>
  );
}

// ---- Balances: private or public, one tile per asset ----
function Balances() {
  const s = useStore((x) => x);
  const [side, setSide] = useState<'priv' | 'pub'>('priv');
  const bal = balances(s);
  const locked = !s.keys;
  const tn = s.mode === 'testnet';
  const pubOf = (sym: string) => BigInt(s.publicBal[sym] || '0');
  const privEmpty = ASSETS.every((a) => bal[a.symbol].spendable === 0n && bal[a.symbol].incoming === 0n);
  const idle = privEmpty ? ASSETS.find((a) => pubOf(a.symbol) > 0n) : undefined;
  const showPriv = side === 'priv';
  return (
    <section class={cx('dp ov5-bal', !locked && 'ov-bal')}>
      <header class="dp-h">
        <div><h2>Balances</h2></div>
        <div class="dp-act">
          <span class="ov5-where"><Icon name={showPriv ? 'lock' : 'globe'} size={14} />{showPriv ? 'Shielded pool' : 'Your wallet'}<b>· {tn ? CHAIN.name : 'Demo, in this browser'}</b></span>
          <Seg label="Which balance" value={side} onChange={setSide} options={[['priv', 'Private'], ['pub', 'Public']]} />
        </div>
      </header>
      <div class="ov5-tiles">
        {ASSETS.filter((a) => !a.retired || bal[a.symbol].spendable + bal[a.symbol].incoming + bal[a.symbol].outgoing > 0n || pubOf(a.symbol) > 0n).map((a) => {
          const b = bal[a.symbol];
          const hidden = showPriv && locked;
          return (
            <div class={cx('ov5-tile', showPriv ? 'priv' : 'pub')}>
              <p class="ov5-tile-h"><AssetGlyph symbol={a.symbol} size={30} /><b>{a.symbol}</b><span>{a.name}</span></p>
              <div class="ov5-tile-v">{hidden ? <span class="amoney masked">••••••</span> : <Money v={showPriv ? b.spendable : pubOf(a.symbol)} symbol={a.symbol} hideSymbol />}</div>
              <p class="ov5-tile-s">
                {hidden ? 'Locked until you connect'
                  : !showPriv ? (s.wallet ? 'Visible to anyone on chain' : 'Connect a wallet to see it')
                  : b.incoming > 0n ? <span class="in"><Icon name="clock" size={13} />+<Money v={b.incoming} symbol={a.symbol} hideSymbol /> arriving</span>
                  : b.outgoing > 0n ? <span><Icon name="clock" size={13} /><Money v={b.outgoing} symbol={a.symbol} hideSymbol /> leaving</span>
                  : 'Spendable now'}
              </p>
            </div>
          );
        })}
      </div>
      <div class={cx('ov5-bal-f', !locked && idle && showPriv && 'hint')}>
        {locked ? (
          <><span>Your private balance appears once you {s.wallet ? 'create or restore your privacy key' : 'connect a wallet and create a privacy key'}.</span><Btn kind="primary" size="sm" icon="wallet" onClick={openWallet}>{s.wallet ? 'Set up privacy key' : 'Connect a wallet'}</Btn></>
        ) : idle && showPriv ? (
          <><span><b><Money v={pubOf(idle.symbol)} symbol={idle.symbol} /></b> is in your public wallet. Shield it to use it privately.</span><Btn kind="primary" size="sm" icon="shield" href={href('shield', { asset: idle.symbol })}>Shield</Btn></>
        ) : showPriv ? (
          <><span>In your public wallet: {ASSETS.filter((a) => !a.retired || pubOf(a.symbol) > 0n).map((a, i) => <>{i > 0 && ' · '}<Money v={pubOf(a.symbol)} symbol={a.symbol} /></>)}</span><a class="alink" href={href('shield')}>Shield more <Icon name="chevron" size={14} /></a></>
        ) : (
          <><span>{tn && s.wallet ? <>Network fees: {s.prefs.hideBalances ? '••••' : formatUnits(BigInt(s.tn.eth || '0'), 18, { max: 6 })} ETH. </> : null}Public balances are visible to anyone who knows this address.</span><a class="alink" href={href('withdraw')}>Withdraw to it <Icon name="chevron" size={14} /></a></>
        )}
        {tn && s.wallet && <FaucetButton />}
      </div>
    </section>
  );
}

// ---- Where the private balance sits, by vault ----
export function VaultSplit({ title = 'Where your private balance is', link = true }: { title?: string; link?: boolean }) {
  const s = useStore((x) => x);
  const vaults = activeVaults(s);
  const total = balances(s);
  const first = ASSETS.find((a) => total[a.symbol].spendable > 0n) || ASSETS[0];
  const [sym, setSym] = useState(first.symbol);
  const locked = !s.keys;
  const all = total[sym].spendable;
  const rows = vaults.map((v) => ({ v, amt: balances(s, v.id)[sym].spendable })).sort((a, b) => (b.amt > a.amt ? 1 : b.amt < a.amt ? -1 : 0));
  const share = (x: bigint) => (all > 0n ? Number((x * 1000n) / all) / 10 : 0);
  return (
    <Panel title={title} sub={`${vaults.length} ${vaults.length === 1 ? 'vault' : 'vaults'} · ${sym}`} class="ov5-split"
      actions={<div class="ov5-total">{ASSETS.length > 1 && <span class="dpill"><select value={sym} onChange={(e) => setSym((e.target as HTMLSelectElement).value)} aria-label="Token">{ASSETS.map((a) => <option value={a.symbol}>{a.symbol}</option>)}</select></span>}<span><b>{locked ? '••••' : <Money v={all} symbol={sym} />}</b><small>private total</small></span></div>}>
      <div class="dbar" role="img" aria-label={`Split across ${vaults.length} vaults`}>
        {all > 0n && !locked ? rows.filter((r) => r.amt > 0n).map((r) => <i style={{ flexGrow: share(r.amt), '--h': r.v.hue } as any} title={`${r.v.name}: ${share(r.amt)}%`} />) : <i class="empty" />}
      </div>
      <ul class="dsplit">
        {rows.map((r) => (
          <li style={{ '--h': r.v.hue, '--p': `${share(r.amt)}%` } as any}>
            <span class="dsplit-n"><i />{r.v.name}</span>
            <span class="dsplit-bar"><i /></span>
            <span class="dsplit-v">{locked ? '••••' : <Money v={r.amt} symbol={sym} hideSymbol />}</span>
            <span class="dsplit-p">{locked || all === 0n ? '—' : `${Math.round(share(r.amt))}%`}</span>
          </li>
        ))}
      </ul>
      {link && <a class="alink dp-more" href={href('vaults')}>All vaults <Icon name="chevron" size={14} /></a>}
    </Panel>
  );
}

// Testnet USDG comes from Paxos, its issuer. Gas comes from the Robinhood Chain faucet.
export function FaucetButton({ block }: { block?: boolean }) {
  const eth = useStore((s) => BigInt(s.tn.eth || '0'));
  const url = ASSETS.find((a) => a.faucetUrl)?.faucetUrl;
  if (!url) return null;
  return (
    <div class="ov-faucet">
      <Btn kind="secondary" size="sm" icon="external" block={block} href={url}>Get testnet USDG</Btn>
      <small>{eth === 0n ? <>Your wallet also needs a little testnet ETH for network fees, from the <a class="alink" href={NET.gasFaucet} target="_blank" rel="noopener">Robinhood Chain faucet</a>.</> : 'From the Paxos faucet. Testnet USDG has no value.'}</small>
    </div>
  );
}

// ---- Shown once, after the first private transfer ----
function FirstDone() {
  const close = () => setState((st) => { st.prefs = { ...st.prefs, celebrated: true }; });
  const text = `I just made my first private transfer on @zeronym_app. The chain shows a pool transaction, not who paid whom or how much.\n\nPrivate USDG payments on Robinhood Chain: ${SITE_ORIGIN}`;
  return (
    <section class="dp ov5-setup ov-done" aria-live="polite">
      <header class="dp-h">
        <div class="ov5-setup-t"><span class="ov-done-ic"><Icon name="check" size={22} /></span><div><h2>You made your first private transfer</h2><p>On the chain it's one more pool transaction. Every person who joins makes the crowd your notes blend into bigger, so bring a friend.</p></div></div>
        <button type="button" class="dx" aria-label="Close" title="Close" onClick={close}><Icon name="x" size={18} /></button>
      </header>
      <div class="ov-done-act">
        <a class="ab ab-primary ab-md" href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={close}><Icon name="external" size={18} /><span>Share on X</span></a>
        <Btn kind="secondary" icon="receive" href={href('receive')}>Ask a friend to pay you</Btn>
      </div>
    </section>
  );
}
