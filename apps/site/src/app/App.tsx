// App shell: sidebar, page header, banners, toasts, mobile tab bar.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './ui/icons';
import { Btn, Chip, Modal, Note, cx } from './ui/kit';
import { useRoute, href, onLink, go, redirect, type Route } from './lib/router';
import { greeting } from './ui/dash';
import { TopSearch } from './ui/search';
import { AddressDialog, openAddress } from './ui/address';
import { useStore, setState, getState, useToasts } from './lib/store';
import { CHAIN, short, switchToChain } from './lib/chain';
import { ConnectDialog, disconnectWallet } from './ui/connect';
import { Setup } from './pages/Onboarding';
import { setOpenWallet, needKey, setNeedKey } from './lib/ui';
import { Overview } from './pages/Overview';
import { Shield } from './pages/Shield';
import { Send } from './pages/Send';
import { Receive } from './pages/Receive';
import { Withdraw } from './pages/Withdraw';
import { VaultsPage } from './pages/VaultsPage';
import { ActivityPage, ActivityActions } from './pages/Activity';
import { Account } from './pages/Account';
import { Fallback } from './pages/Fallback';
import { NET } from './lib/network';
import deployments from '../data/deployments.json';

type NavItem = { r: Route; label: string; icon: string; hint: string };
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [
    { r: 'overview', label: 'Overview', icon: 'overview', hint: 'Balances and this month' },
    { r: 'shield', label: 'Shield', icon: 'shield', hint: 'Deposit into the pool' },
    { r: 'send', label: 'Send', icon: 'send', hint: 'Pay a shielded address' },
    { r: 'withdraw', label: 'Withdraw', icon: 'withdraw', hint: 'Back to a public address' },
    { r: 'receive', label: 'Receive', icon: 'receive', hint: 'Your address and requests' },
    { r: 'vaults', label: 'Vaults', icon: 'vaults', hint: 'Your private balance by purpose' },
    { r: 'activity', label: 'Activity', icon: 'history', hint: 'Everything you did' },
  ] },
];
const TITLES: Record<Route, [string, string]> = {
  overview: ['Overview', 'What you hold privately, what the chain can see, and what you have shared.'],
  shield: ['Shield', 'Move tokens from your wallet into your private balance.'],
  send: ['Send', 'Pay another shielded address privately.'],
  receive: ['Receive', 'Share your shielded address or ask for a payment.'],
  withdraw: ['Withdraw', 'Move tokens from the pool back to a public address.'],
  vaults: ['Vaults', 'Labels for your private balance. Open a vault to see the tokens it holds.'],
  assets: ['Assets', 'Every token you hold, private and public, and which vaults hold it.'],
  activity: ['Activity', 'Every action on this device, with what was public. Share a receipt for any one of them.'],
  receipts: ['Receipts', 'Prove one payment, and nothing else.'],
  account: ['Privacy account', 'Keys, recovery, preferences and this device.'],
  fallback: ['Fallback withdrawal', 'How to withdraw without this interface.'],
}

// Mono kicker above each page title, numbered in sidebar order like the site's sections.
const KICKER: Record<Route, [string, string]> = {
  overview: ['01', 'At a glance'], shield: ['02', 'Public to private'], send: ['03', 'Inside the pool'], withdraw: ['04', 'Private to public'],
  receive: ['05', 'Inside the pool'], assets: ['06', 'Private balance by purpose'], vaults: ['06', 'Private balance by purpose'], activity: ['07', 'Records on this device'],
  receipts: ['07', 'Records on this device'], account: ['08', 'Keys and recovery'], fallback: ['08', 'Without this app'],
};

export function App() {
  const { route } = useRoute();
  const ready = useStore((s) => s.ready);
  const wallet = useStore((s) => s.wallet);
  const keys = useStore((s) => s.keys);
  const mode = useStore((s) => s.mode);
  const mini = useStore((s) => !!s.prefs.sideMini);
  const [drawer, setDrawer] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  useEffect(() => { document.title = `${TITLES[route][0]} · Zeronym app`; setDrawer(false); }, [route]);
  useEffect(() => setOpenWallet(() => setWalletOpen(true)), []);
  // A connected wallet needs a privacy key. The flag keeps the dialog up across reloads.
  useEffect(() => { if (ready && wallet && !keys) setNeedKey(true); if (keys) setNeedKey(false); }, [ready, wallet, keys]);
  const keyDialog = ready && !keys && (!!wallet || needKey());

  return (
    <div class={cx('ashell', drawer && 'drawer', mini && 'mini')} onClick={onLink as any}>
      <Sidebar route={route} onClose={() => setDrawer(false)} />
      <button type="button" class="aside-mini" aria-label={mini ? 'Expand the sidebar' : 'Collapse the sidebar'} aria-expanded={!mini} title={mini ? 'Expand' : 'Collapse'}
        onClick={() => setState((s) => { s.prefs = { ...s.prefs, sideMini: !s.prefs.sideMini }; })}><Icon name="collapse" size={14} /></button>
      <div class="ascrim" onClick={() => setDrawer(false)} />
      <div class="amain">
        <header class="atop">
          <button type="button" class="atop-menu" aria-label="Open menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
          <a class="atop-brand" href="/" aria-label="Zeronym home"><img src="/zeronym-icon.webp" width="190" height="120" alt="" /></a>
          <TopSearch />
          <div class="atop-r">
            <TokenCA />
            <NetworkChip />
            <a class="atop-ic" href="/docs/" target="_blank" rel="noopener" aria-label="Docs and help" title="Docs and help"><Icon name="help" size={19} /></a>
            <WalletButton onOpen={() => setWalletOpen(true)} />
          </div>
        </header>
        <PageHead route={route} />
        <main id="main" class={cx('apage', `apage-${route}`)} key={route + mode + String(!!keys)}>
          {!ready ? <div class="aloading"><span class="spin" />Opening your encrypted storage…</div> : <Page route={route} />}
        </main>
        <footer class="afoot">
          <span>Zeronym runs on Robinhood Chain mainnet. Nothing here is financial advice.</span>
          <span><a href="/security/">Security</a><a href="/terms/">Terms</a><a href="/privacy/">Privacy</a></span>
        </footer>
      </div>
      <MobileBar route={route} onMore={() => setDrawer(true)} />
      <ConnectDialog open={walletOpen && !keyDialog} onClose={() => setWalletOpen(false)} />
      <Modal open={keyDialog} onClose={() => {}} locked wide title="Create your privacy key" class="akeydlg">
        <Setup inDialog onDisconnect={() => { disconnectWallet(); setNeedKey(false); }} />
      </Modal>
      <AddressDialog />
      <Toasts />
    </div>
  );
}

function Page({ route }: { route: Route }) {
  switch (route) {
    case 'overview': return <Overview />;
    case 'shield': return <Shield />;
    case 'send': return <Send />;
    case 'receive': return <Receive />;
    case 'withdraw': return <Withdraw />;
    case 'vaults': return <VaultsPage />;
    case 'assets': return <OldAssets />;
    case 'activity': return <ActivityPage />;
    case 'receipts': return <OldReceipts />;
    case 'account': return <Account />;
    case 'fallback': return <Fallback />;
  }
}

function Sidebar({ route, onClose }: { route: Route; onClose: () => void }) {
  const pending = useStore((s) => s.activity.filter((a) => a.status !== 'credited' && a.status !== 'failed').length);
  const keys = useStore((s) => !!s.keys);
  const backedUp = useStore((s) => s.backedUp);
  const tn = useStore((s) => s.mode === 'testnet');
  const synced = useStore((s) => s.tn.synced);
  const off = useStore((s) => s.tn.error);
  const item = (n: { r: Route; label: string; icon: string }, badge?: ComponentChildren) => (
    <li>
      <a href={href(n.r)} class={cx('anav-a', route === n.r && 'on')} aria-current={route === n.r ? 'page' : undefined} title={n.label}>
        <Icon name={n.icon} size={20} />
        <span class="anav-l">{n.label}</span>
        {badge}
      </a>
    </li>
  );
  const state = !keys ? ['', 'No key yet'] : !backedUp ? ['warn', 'Back up'] : tn && off ? ['warn', off === 'offline' ? 'Offline' : 'Checking'] : tn && !synced ? ['', 'Syncing'] : ['ok', 'Synced'];
  return (
    <aside class="aside" aria-label="App navigation">
      <div class="aside-top">
        <a class="aside-brand" href="/" aria-label="Zeronym home">
          <img src="/zeronym-icon.webp" width="190" height="120" alt="" />
          <span>ZERONYM</span>
        </a>
        <button type="button" class="aside-close" aria-label="Close menu" onClick={onClose}><Icon name="x" /></button>
      </div>
      <nav class="anav">
        {NAV.map((g) => (
          <div class="anav-g">
            {g.group && <p class="anav-h"><span>{g.group}</span></p>}
            <ul>{g.items.map((n) => item(n, n.r === 'activity' && pending > 0 ? <span class="anav-badge" aria-label={`${pending} in progress`}>{pending}</span> : undefined))}</ul>
          </div>
        ))}
      </nav>
      <div class="aside-bot">
        <a href={href('account')} class={cx('anav-a', 'aside-set', route === 'account' && 'on')} aria-current={route === 'account' ? 'page' : undefined} title="Privacy account">
          <Icon name="settings" size={20} />
          <span class="anav-l">Account</span>
          <span class={cx('aside-st', state[0])}><i />{state[1]}</span>
        </a>
      </div>
    </aside>
  );
}

// Assets became the Vaults page. Old links keep their ?new / ?move.
function OldAssets() {
  const { q } = useRoute();
  useEffect(() => { redirect('vaults', Object.fromEntries(q)); }, []);
  return null;
}

// Receipts moved into Activity. Old links, including shared receipt links, land in the right dialog.
function OldReceipts() {
  const { q } = useRoute();
  useEffect(() => {
    const v = q.get('verify'), f = q.get('for'), t = q.get('tab');
    redirect('activity', v ? { receipt: v } : f ? { share: f } : t === 'check' ? { receipt: '1' } : t === 'key' ? { viewkey: '1' } : {});
  }, []);
  return null;
}

// Page title, subtitle and the page's own actions.
function PageHead({ route }: { route: Route }) {
  const keys = useStore((s) => !!s.keys);
  const [t, sub] = TITLES[route];
  const kind = route === 'shield' || route === 'send' || route === 'withdraw' ? route : '';
  if (route === 'overview') return (
    <div class="ahead">
      <div><p class="akick"><span>{KICKER.overview[0]}</span>{greeting()}</p><h1>Overview</h1><p>{sub}</p></div>
      <div class="ahead-act">
        <Btn kind="secondary" icon="history" href={href('activity')}>Activity</Btn>
        {keys && <Btn kind="secondary" icon="receive" href={href('receive')}>Receive</Btn>}
      </div>
    </div>
  );
  return (
    <div class="ahead">
      <div><p class="akick"><span>{KICKER[route][0]}</span>{KICKER[route][1]}</p><h1>{t}</h1><p>{sub}</p></div>
      <div class="ahead-act">
        {route === 'activity' && <ActivityActions />}
        {kind && <Btn kind="secondary" icon="history" href={href('activity', { q: `kind:${kind}` })}>History</Btn>}
        {route === 'vaults' && keys && <><Btn kind="secondary" icon="swap" href={href('vaults', { move: '1' })}>Move between vaults</Btn><Btn kind="secondary" icon="plus" href={href('vaults', { new: '1' })}>New vault</Btn></>}
        {route === 'receive' && keys && <><Btn kind="secondary" icon="qr" onClick={openAddress}>Shielded address</Btn><Btn kind="secondary" icon="plus" href={href('receive', { new: '1' })}>New request</Btn></>}
      </div>
    </div>
  );
}

function MobileBar({ route, onMore }: { route: Route; onMore: () => void }) {
  const items: [Route, string, string][] = [['overview', 'overview', 'Home'], ['shield', 'shield', 'Shield'], ['send', 'send', 'Send'], ['activity', 'history', 'Activity']];
  return (
    <nav class="amob" aria-label="Quick navigation">
      {items.map(([r, ic, l]) => <a href={href(r)} class={cx(route === r && 'on')} aria-current={route === r ? 'page' : undefined}><Icon name={ic} size={20} /><span>{l}</span></a>)}
      <button type="button" onClick={onMore}><Icon name="menu" size={20} /><span>More</span></button>
    </nav>
  );
}

function NetworkChip() {
  const wallet = useStore((s) => s.wallet);
  const wrong = wallet?.kind === 'injected' && wallet.chainId !== CHAIN.id;
  if (wrong) return <button type="button" class="achip achip-warn achip-btn" onClick={() => switchToChain().catch(() => {})} title="Your wallet is on another network"><Icon name="warn" size={14} />{NET.isTestnet ? 'Switch to testnet' : 'Switch to Robinhood Chain'}</button>;
  return <Chip tone="neutral" dot class="anet" title={`Chain ID ${CHAIN.id}`}><span class="anet-l">Robinhood Chain</span>{NET.isTestnet && ' Testnet'}</Chip>;
}

function Blockie({ seed, size = 22 }: { seed: string; size?: number }) {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 80 + (h >> 8) % 100) % 360;
  return <span class="ablockie" style={{ width: size, height: size, background: `conic-gradient(from ${h % 360}deg, hsl(${a} 70% 62%), hsl(${b} 60% 40%), hsl(${a} 70% 62%))` }} aria-hidden="true" />;
}

// The Zeronym token's contract address, with a copy button.
const TOKEN_CA = (deployments.records.find((r) => r.id === 'token') as { address?: string } | undefined)?.address;
function TokenCA() {
  const [copied, setCopied] = useState(false);
  if (!TOKEN_CA) return null;
  const copy = () => { navigator.clipboard?.writeText(TOKEN_CA).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); };
  return (
    <button type="button" class="atop-ca" onClick={copy} title={`Zeronym token (Znym): ${TOKEN_CA}. Click to copy`} aria-label={`Copy the Zeronym token contract address ${TOKEN_CA}`}>
      <span class="atop-ca-k">CA</span><span class="z-data">{short(TOKEN_CA, 4)}</span><Icon name={copied ? 'check' : 'copy'} size={14} />
    </button>
  );
}

function WalletButton({ onOpen }: { onOpen: () => void }) {
  const wallet = useStore((s) => s.wallet);
  const tn = useStore((s) => s.mode === 'testnet');
  const keys = useStore((s) => !!s.keys);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!wallet) return <Btn kind="secondary" icon="wallet" onClick={onOpen} class="atop-connect">Connect</Btn>;
  const copy = () => { navigator.clipboard?.writeText(wallet.address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); };
  const pick = (f: () => void) => () => { setOpen(false); f(); };
  return (
    <div class={cx('awm2', open && 'open')} ref={ref}>
      <button type="button" class="awallet" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {wallet.icon ? <img class="awallet-img" src={wallet.icon} alt="" width="22" height="22" /> : <Blockie seed={wallet.address} />}
        <span class="z-data">{short(wallet.address)}</span><Icon name="down" size={14} />
      </button>
      {open && (
        <div class="awm2-menu" role="menu">
          <div class="awm2-id">
            <Blockie seed={wallet.address} size={36} />
            <div><b>{wallet.kind === 'demo' ? 'Demo wallet' : wallet.name || 'Wallet'}</b><small class="z-data">{short(wallet.address, 6)}</small></div>
          </div>
          <button type="button" role="menuitem" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy address'}</button>
          {tn && wallet.kind !== 'demo' && <a role="menuitem" href={`${CHAIN.explorer}/address/${wallet.address}`} target="_blank" rel="noopener" onClick={() => setOpen(false)}><Icon name="external" size={16} />View on explorer</a>}
          {keys && <button type="button" role="menuitem" onClick={pick(openAddress)}><Icon name="qr" size={16} />Shielded address</button>}
          <a role="menuitem" href={href('account')} onClick={() => setOpen(false)}><Icon name="settings" size={16} />Privacy account</a>
          <button type="button" role="menuitem" onClick={pick(() => { disconnectWallet(); onOpen(); })}><Icon name="swap" size={16} />Switch wallet</button>
          <button type="button" role="menuitem" class="bad" onClick={pick(disconnectWallet)}><Icon name="logout" size={16} />Disconnect</button>
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const list = useToasts();
  return (
    <div class="atoasts" aria-live="polite">
      {list.map((t) => (
        <div class={cx('atoast', `atoast-${t.tone}`)} key={t.id}>
          <Icon name={t.tone === 'ok' ? 'check' : t.tone === 'bad' ? 'x' : 'info'} size={16} />
          <div><b>{t.title}</b>{t.body && <small>{t.body}</small>}</div>
        </div>
      ))}
    </div>
  );
}

export { go };
