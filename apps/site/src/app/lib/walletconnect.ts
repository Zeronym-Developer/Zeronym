// WalletConnect (Reown) for phone wallets: a QR code on desktop, a deep link on phones.
// The library loads only when someone picks this route, so the app stays light otherwise.
import { CHAIN, type WalletInfo } from './chain';
import { WALLETS } from '../ui/wallets';
import { NET } from './network';

// A public client ID from the Reown dashboard. It identifies the app to the relay; it isn't a secret.
// Each build can set its own (PUBLIC_WC_PROJECT_ID); the mainnet site needs one with its domain allowed.
export const WC_PROJECT_ID = (import.meta.env.PUBLIC_WC_PROJECT_ID as string | undefined) || '972ae484dd974f1c5e2c08b056586b70';

type Provider = WalletInfo['provider'] & {
  session?: { peer?: { metadata?: { name?: string; icons?: string[] } } };
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  on: (e: string, f: (...a: any[]) => void) => void;
  removeListener: (e: string, f: (...a: any[]) => void) => void;
};

let init: Promise<Provider> | null = null;
function provider(): Promise<Provider> {
  init ||= import('@walletconnect/ethereum-provider').then(({ EthereumProvider }) => EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: false,
    // Robinhood Chain first. Ethereum is listed only so wallets that don't know the chain yet can
    // still open a session; the app then asks the wallet to add and switch to it.
    optionalChains: [CHAIN.id, 1],
    rpcMap: { [CHAIN.id]: CHAIN.rpc },
    metadata: {
      name: 'Zeronym',
      description: NET.isTestnet ? 'Private balances on Robinhood Chain testnet (testnet only)' : 'Private balances on Robinhood Chain',
      url: location.origin,
      icons: [`${location.origin}/zeronym-icon.webp`],
    },
  }) as unknown as Provider).catch((e) => { init = null; throw e; });
  return init;
}

// Our own copy of the wallet's official logo when we know the wallet; a generic mark otherwise.
function info(p: Provider): WalletInfo {
  const name = p.session?.peer?.metadata?.name || 'Phone wallet';
  const known = WALLETS.find((w) => name.toLowerCase().includes(w.match));
  return { uuid: 'walletconnect', name: known?.name || name, icon: known?.icon || '/wallets/walletconnect.svg', rdns: 'walletconnect', provider: p };
}

type Pairing = { uri: string; subs: Set<(u: string) => void>; done: Promise<WalletInfo> };
let current: Pairing | null = null;

// Starts one pairing at a time and shares its link with every view that asks for it.
export function wcPair(onUri: (uri: string) => void): { done: Promise<WalletInfo>; off: () => void } {
  if (!current) {
    const st: Pairing = { uri: '', subs: new Set(), done: Promise.resolve(null as any) };
    st.done = (async () => {
      const p = await provider();
      const h = (u: string) => { st.uri = u; st.subs.forEach((f) => f(u)); };
      p.on('display_uri', h);
      try {
        if (p.session) await p.disconnect().catch(() => {});
        await p.connect();
        return info(p);
      } finally {
        p.removeListener('display_uri', h);
        if (current === st) current = null;
      }
    })();
    current = st;
  }
  const st = current;
  st.subs.add(onUri);
  if (st.uri) onUri(st.uri);
  return { done: st.done, off: () => { st.subs.delete(onUri); } };
}

// Reconnects a session from an earlier visit without showing anything.
export async function wcRestore(): Promise<WalletInfo | null> {
  const p = await provider();
  return p.session ? info(p) : null;
}

export async function wcDisconnect() {
  if (!init) return;
  const p = await init;
  if (p.session) await p.disconnect().catch(() => {});
}

export function wcOnDisconnect(f: () => void) {
  provider().then((p) => p.on('disconnect', f)).catch(() => {});
}
