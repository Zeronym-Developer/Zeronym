// The connect dialog. Desktop: wallet list on the left, the chosen route on the right
// (extension prompt or a WalletConnect QR). Phone: a bottom sheet of wallet apps that open
// through WalletConnect deep links, plus any wallet this browser already has built in.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './icons';
import { Btn, Chip, Note, Qr, cx } from './kit';
import { Identicon } from './viz';
import { byId, defFor, isIOS, isPhone, type WalletDef } from './wallets';
import { useStore, setState, getState, pushToast } from '../lib/store';
import { CHAIN, connect, discoverWallets, disconnect, short, switchToChain, watch, type WalletInfo } from '../lib/chain';
import { wcDisconnect, wcOnDisconnect, wcPair, wcRestore } from '../lib/walletconnect';
import { hex } from '../lib/vault-store';
import { NET } from '../lib/network';

type View =
  | { t: 'home' }
  | { t: 'inj'; w: WalletInfo }
  | { t: 'qr'; def?: WalletDef }
  | { t: 'app'; def: WalletDef }
  | { t: 'get' };

const POPULAR = ['metamask', 'rabby', 'coinbase', 'trust', 'okx', 'rainbow', 'zerion'];
const APPS = ['metamask', 'trust', 'coinbase', 'rainbow', 'okx', 'zerion', 'uniswap', 'bitget', 'ledger'];

function saveLast(rdns: string | null) {
  try { rdns ? localStorage.setItem('zn-wallet', rdns) : localStorage.removeItem('zn-wallet'); } catch { /* storage off */ }
}
function adopt(w: WalletInfo, r: { address: string; chainId: number }) {
  setState((s) => { s.wallet = { address: r.address, kind: 'injected', name: w.name, chainId: r.chainId, icon: w.icon || undefined, via: w.rdns === 'walletconnect' ? 'walletconnect' : 'extension' }; });
  saveLast(w.rdns);
  watch(
    (acc) => setState((s) => { s.wallet = acc[0] ? { ...s.wallet!, address: acc[0] } : null; }),
    (id) => setState((s) => { if (s.wallet) s.wallet = { ...s.wallet, chainId: id }; }),
  );
}

export function disconnectWallet() {
  if (getState().wallet?.via === 'walletconnect') wcDisconnect();
  disconnect(); saveLast(null);
  setState((s) => { s.wallet = null; });
}

// Each pairing finishes once, however many views asked for its link.
const handled = new WeakSet<Promise<WalletInfo>>();
async function finishPair(done: Promise<WalletInfo>, onOk: () => void, onErr: (m: string) => void) {
  if (handled.has(done)) return;
  handled.add(done);
  try {
    const w = await done;
    const r = await connect(w);
    adopt(w, r);
    pushToast({ tone: 'ok', title: `Connected to ${w.name}`, body: 'Through WalletConnect. Approve each transaction in the app.' });
    onOk();
  } catch (e: any) {
    const m = String(e?.message || '');
    onErr(/expired/i.test(m) ? 'That link expired. Get a new one to try again.' : /reject|declin|denied/i.test(m) ? 'The connection was declined in the wallet.' : 'Could not finish connecting. Try again.');
  }
}

let restored = false;
export function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallet = useStore((s) => s.wallet);
  const ref = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<WalletInfo[]>([]);
  const [view, setView] = useState<View>({ t: 'home' });
  const [uri, setUri] = useState('');
  const [wcErr, setWcErr] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [gen, setGen] = useState(0);
  const phone = isPhone();

  useEffect(() => discoverWallets(setList), []);

  // Quietly reconnect a wallet that already shared an account on an earlier visit.
  useEffect(() => {
    if (restored) return;
    let last = ''; try { last = localStorage.getItem('zn-wallet') || ''; } catch { /* storage off */ }
    if (last === 'walletconnect') {
      restored = true;
      wcRestore().then(async (w) => { if (w && !getState().wallet) adopt(w, await connect(w)); }).catch(() => {});
      return;
    }
    if (!list.length) return;
    restored = true;
    const w = list.find((x) => x.rdns === last);
    if (!w || getState().wallet) return;
    w.provider.request({ method: 'eth_accounts' }).then(async (acc: string[]) => {
      if (acc?.length) adopt(w, await connect(w));
    }).catch(() => {});
  }, [list]);

  useEffect(() => wcOnDisconnect(() => {
    if (getState().wallet?.via === 'walletconnect') { disconnect(); saveLast(null); setState((s) => { s.wallet = null; }); }
  }), []);

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (open) { setView({ t: 'home' }); setErr(''); }
  }, [open]);

  // A WalletConnect link is needed for the QR view, and on phones as soon as the sheet opens,
  // so tapping a wallet app can follow the link straight away.
  const wantLink = open && !wallet && (view.t === 'qr' || view.t === 'app' || (phone && view.t === 'home'));
  useEffect(() => {
    if (!wantLink) return;
    let got = false;
    const pair = wcPair((u) => { got = true; setUri(u); setWcErr(''); });
    finishPair(pair.done, onClose, (m) => { setUri(''); setWcErr(m); });
    const slow = setTimeout(() => { if (!got) setWcErr('WalletConnect is taking a while to respond. Check your connection, or try again.'); }, 15000);
    return () => { pair.off(); clearTimeout(slow); };
  }, [wantLink, gen]);

  const installed = (def: WalletDef) => list.find((w) => def.rdns?.includes(w.rdns) || w.name.toLowerCase().includes(def.match));

  const pickInjected = async (w: WalletInfo) => {
    setErr(''); setBusy(w.uuid); setView({ t: 'inj', w });
    try { adopt(w, await connect(w)); onClose(); }
    catch (e: any) { setErr(e?.code === 4001 ? 'The request was declined in your wallet.' : e?.message || 'Could not connect.'); }
    finally { setBusy(''); }
  };
  const demo = () => {
    const addr = '0x' + hex(crypto.getRandomValues(new Uint8Array(20)));
    setState((s) => { s.wallet = { address: addr, kind: 'demo', name: 'Demo wallet' }; });
    onClose();
  };
  const appHref = (def: WalletDef) => def.browse ? def.browse(location.href) : uri && def.deep ? def.deep(uri) : undefined;

  const close = <button type="button" class="acw-x" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>;
  const back = <button type="button" class="acw-back" aria-label="Back" onClick={() => { setView({ t: 'home' }); setErr(''); }}><Icon name="back" size={18} /></button>;

  let body: ComponentChildren;
  if (wallet) {
    body = <Connected onClose={onClose} />;
  } else {
    const side = (
      <div class="acw-list">
        <header class="acw-head"><h2>Connect a wallet</h2>{close}</header>
        {list.length > 0 && (
          <Group label={phone ? 'In this browser' : 'Installed'}>
            {list.map((w) => (
              <Row key={w.uuid} icon={w.icon || defFor(w.rdns, w.name)?.icon} name={w.name} on={view.t === 'inj' && view.w.uuid === w.uuid}
                tag={<span class="acw-tag ok">Detected</span>} onClick={() => pickInjected(w)} />
            ))}
          </Group>
        )}
        {phone ? (
          <Group label="Wallet apps">
            <div class="acw-apps">
              {APPS.map(byId).filter((d) => d && !installed(d!)).map((d) => {
                const h = appHref(d!);
                return (
                  <a class={cx('acw-app', !h && 'wait')} href={h} key={d!.id} onClick={() => setView({ t: 'app', def: d! })} rel="noopener">
                    <img src={d!.icon} width="52" height="52" alt="" /><span>{d!.name.replace(' Wallet', '')}</span>
                  </a>
                );
              })}
              <button type="button" class="acw-app" onClick={() => setView({ t: 'qr' })}>
                <img src="/wallets/walletconnect.svg" width="52" height="52" alt="" /><span>Other</span>
              </button>
            </div>
          </Group>
        ) : (
          <Group label="Popular">
            {POPULAR.map(byId).filter((d) => d && !installed(d!)).map((d) => (
              <Row key={d!.id} icon={d!.icon} name={d!.name} on={view.t === 'qr' && view.def?.id === d!.id} onClick={() => setView({ t: 'qr', def: d! })} />
            ))}
          </Group>
        )}
        <Group label="More options">
          {!phone && <Row icon="/wallets/walletconnect.svg" name="WalletConnect" sub="Scan with any phone wallet" on={view.t === 'qr' && !view.def} onClick={() => setView({ t: 'qr' })} />}
          <Row glyph="spark" name="Demo wallet" sub="Simulated funds, nothing on chain" dashed onClick={demo} />
        </Group>
        <button type="button" class="acw-new" onClick={() => setView({ t: 'get' })}><Icon name="info" size={14} />I don't have a wallet</button>
      </div>
    );

    let main: ComponentChildren;
    if (view.t === 'inj') {
      const def = defFor(view.w.rdns, view.w.name);
      main = (
        <Stage back={back} close={close} logo={view.w.icon || def?.icon} spin={busy === view.w.uuid} bad={!!err}
          title={err ? 'Not connected' : `Opening ${view.w.name}`}
          text={err || 'Confirm the connection in the extension. It shares your public address only.'}>
          {err && <Btn kind="primary" icon="swap" onClick={() => pickInjected(view.w)}>Try again</Btn>}
        </Stage>
      );
    } else if (view.t === 'app') {
      const d = view.def;
      const h = appHref(d);
      main = (
        <Stage back={back} close={close} logo={d.icon} spin={!!h && !wcErr} bad={!!wcErr}
          title={d.browse ? `Open Zeronym in ${d.name}` : `Continue in ${d.name}`}
          text={wcErr || (d.browse
            ? `This page opens inside ${d.name}'s own browser, where it can connect directly.`
            : h ? 'Approve the connection in the app, then come back to this tab.' : 'Preparing a secure link…')}>
          <div class="acw-cta">
            {h ? <a class="ab ab-primary ab-md ab-block" href={h} rel="noopener"><span>Open {d.name}</span></a> : !wcErr && <span class="acw-skel" />}
            {wcErr && <Btn kind="primary" block onClick={() => setGen((g) => g + 1)}>Get a new link</Btn>}
            {!d.browse && uri && <CopyLink uri={uri} />}
          </div>
          {d.browse && <p class="acw-fine">Your privacy key is kept per browser. In {d.name} you'd restore it with your recovery phrase.</p>}
          {(isIOS() ? d.ios : d.android) && <p class="acw-fine">Don't have it? <a href={isIOS() ? d.ios : d.android} target="_blank" rel="noopener noreferrer">Get {d.name}</a></p>}
        </Stage>
      );
    } else if (view.t === 'qr') {
      const d = view.def;
      main = (
        <div class="acw-stage">
          <div class="acw-bar">{back}{close}</div>
          <h3>{d ? `Scan with ${d.name}` : phone ? 'Use another wallet app' : 'Scan with your phone'}</h3>
          <p class="acw-sub">{d ? `Open ${d.name} on your phone and scan this code.` : phone ? 'Copy the link and paste it into your wallet app’s WalletConnect option, or scan this code from another device.' : 'Open your wallet app, find its scanner, and point it at this code.'}</p>
          <div class={cx('acw-qr', !uri && 'load')}>
            {uri ? <Qr text={uri} size={phone ? 220 : 248} ecc="Q" /> : <span class="acw-qr-ph" />}
            <img class="acw-qr-logo" src={d?.icon || '/wallets/walletconnect.svg'} width="46" height="46" alt="" />
            {!uri && !wcErr && <span class="acw-qr-wait">Making a secure link…</span>}
          </div>
          {wcErr ? <div class="acw-cta"><p class="acw-err">{wcErr}</p><Btn kind="primary" onClick={() => setGen((g) => g + 1)}>Try again</Btn></div>
            : <p class="acw-live"><span />Waiting for you to approve in the app</p>}
          <div class="acw-cta row">
            {uri && <CopyLink uri={uri} primary={phone && !d} />}
            {d?.extension && !phone && <Btn kind="ghost" size="sm" icon="download" href={d.extension}>Get the extension</Btn>}
          </div>
        </div>
      );
    } else if (view.t === 'get') {
      main = (
        <div class="acw-stage">
          <div class="acw-bar">{back}{close}</div>
          <h3>Get a wallet</h3>
          <p class="acw-sub">A wallet holds your public address and signs transactions. Pick one, set it up, then come back here.</p>
          <div class="acw-gets">
            {['metamask', 'rabby', 'coinbase', 'trust', 'rainbow', 'zerion'].map(byId).map((d) => {
              const link = phone ? (isIOS() ? d!.ios : d!.android) || d!.extension : d!.extension || d!.ios;
              return link && <a class="acw-get" href={link} target="_blank" rel="noopener noreferrer" key={d!.id}><img src={d!.icon} width="36" height="36" alt="" /><b>{d!.name}</b><small>{phone ? 'App' : d!.extension ? 'Browser extension' : 'Phone app'}</small><Icon name="external" size={14} /></a>;
            })}
          </div>
          <p class="acw-fine">Just looking? The demo wallet needs nothing installed.</p>
        </div>
      );
    } else {
      main = <Intro close={close} onGet={() => setView({ t: 'get' })} />;
    }

    body = <div class={cx('acw-grid', view.t !== 'home' && 'has-view')}>{side}<div class="acw-main">{main}</div></div>;
  }

  return (
    <dialog ref={ref} class={cx('acw', wallet && 'acw-done')} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label="Connect a wallet">
      {open && body}
      {open && !wallet && <footer class="acw-foot"><Icon name="lock" size={13} />Zeronym never asks for your recovery phrase. <a href="/security/">How to spot scams</a></footer>}
    </dialog>
  );
}

function Group({ label, children }: { label: string; children: ComponentChildren }) {
  return <section class="acw-group"><h3>{label}</h3><div class="acw-rows">{children}</div></section>;
}

function Row({ icon, glyph, name, sub, tag, on, dashed, onClick }: { icon?: string; glyph?: string; name: string; sub?: string; tag?: ComponentChildren; on?: boolean; dashed?: boolean; onClick: () => void }) {
  return (
    <button type="button" class={cx('acw-row', on && 'on', dashed && 'dashed')} onClick={onClick}>
      {icon ? <img src={icon} width="36" height="36" alt="" /> : <span class="acw-glyph"><Icon name={glyph || 'wallet'} size={18} /></span>}
      <span class="acw-row-t"><b>{name}</b>{sub && <small>{sub}</small>}</span>
      {tag}
    </button>
  );
}

function Stage({ back, close, logo, spin, bad, title, text, children }: { back: ComponentChildren; close: ComponentChildren; logo?: string; spin?: boolean; bad?: boolean; title: string; text: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="acw-stage">
      <div class="acw-bar">{back}{close}</div>
      <div class={cx('acw-orb', spin && 'spin', bad && 'bad')}>
        {logo ? <img src={logo} width="72" height="72" alt="" /> : <span class="acw-glyph big"><Icon name="wallet" size={30} /></span>}
      </div>
      <h3>{title}</h3>
      <p class={cx('acw-sub', bad && 'bad')}>{text}</p>
      {children}
    </div>
  );
}

function CopyLink({ uri, primary }: { uri: string; primary?: boolean }) {
  const [ok, setOk] = useState(false);
  return <Btn kind={primary ? 'primary' : 'ghost'} size={primary ? 'md' : 'sm'} icon={ok ? 'check' : 'copy'} onClick={async () => { try { await navigator.clipboard.writeText(uri); setOk(true); setTimeout(() => setOk(false), 1600); } catch { /* clipboard blocked */ } }}>{ok ? 'Copied' : 'Copy link'}</Btn>;
}

function Intro({ close, onGet }: { close: ComponentChildren; onGet: () => void }) {
  const logos = ['metamask', 'rabby', 'coinbase', 'trust', 'rainbow', 'okx', 'zerion', 'uniswap'].map(byId);
  return (
    <div class="acw-stage acw-intro">
      <div class="acw-bar end">{close}</div>
      <div class="acw-orbit" aria-hidden="true">
        <img class="acw-orbit-c" src="/zeronym-icon.webp" width="40" height="25" alt="" />
        {logos.map((d, i) => <img src={d!.icon} width="34" height="34" alt="" style={{ '--i': i } as any} />)}
      </div>
      <h3>What connecting does</h3>
      <ul class="acw-facts">
        <li><Icon name="globe" size={16} /><span>Shares your <b>public address</b> with this page. Nothing moves until you approve a transaction.</span></li>
        <li><Icon name="lock" size={16} /><span>Your private balance uses a <b>separate privacy key</b> kept in this browser, not your wallet.</span></li>
        <li><Icon name="phone" size={16} /><span>On a phone, your wallet app opens to approve, then you come back here.</span></li>
      </ul>
      <Chip tone="warn" icon="warn">{NET.isTestnet ? 'Testnet only' : 'Real funds'}</Chip>
      <button type="button" class="acw-new" onClick={onGet}>New to wallets? Get one</button>
    </div>
  );
}

function Connected({ onClose }: { onClose: () => void }) {
  const wallet = useStore((s) => s.wallet)!;
  const [err, setErr] = useState('');
  const wc = wallet.via === 'walletconnect';
  return (
    <div class="acw-conn">
      <header class="acw-head"><h2>Wallet</h2><button type="button" class="acw-x" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button></header>
      <div class="acw-me">
        <span class="acw-me-av"><Identicon seed={wallet.address} size={56} />{wallet.icon && <img src={wallet.icon} width="24" height="24" alt="" />}</span>
        <b class="z-data">{short(wallet.address, 6)}</b>
        <small>{wallet.name}{wc ? ' · via WalletConnect' : ''}{wallet.kind === 'injected' ? ` · chain ${wallet.chainId}` : ''}</small>
      </div>
      <Note tone="pub" title="Your wallet address is public">Deposits from it and withdrawals to it can be seen by anyone. Your shielded balance is separate and isn't linked to this address on chain, except through those deposits and withdrawals.</Note>
      <div class="acw-acts">
        {wallet.kind === 'injected' && wallet.chainId !== CHAIN.id && <Btn kind="primary" icon="swap" onClick={() => switchToChain().catch((e) => setErr(e?.message))}>Switch to {CHAIN.name}</Btn>}
        <Btn kind="secondary" icon="external" href={`${CHAIN.explorer}/address/${wallet.address}`}>View on explorer</Btn>
        <Btn kind="ghost" icon="logout" onClick={() => { disconnectWallet(); onClose(); }}>Disconnect</Btn>
      </div>
      {err && <p class="aerr">{err}</p>}
    </div>
  );
}
