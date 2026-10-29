// Wallet and chain access: EIP-6963 wallet discovery, network switching,
// add-token, and read-only calls to the chain's RPC (PRD R2.4, R2.5).
import deployments from '../../data/deployments.json';
import { NET } from './network';
import { isShieldedAddress } from '../../../../../contracts/pool/lib/core.mjs';

export const CHAIN = {
  id: NET.id,
  hex: '0x' + NET.id.toString(16),
  name: NET.name,
  rpc: NET.rpc,
  explorer: NET.explorer,
};
const tokenRec = deployments.records.find((r) => r.id === 'token') as { address: string; chainId: number; status: string } | undefined;
export const TOKEN = tokenRec?.address ? { address: tokenRec.address, chainId: tokenRec.chainId, status: tokenRec.status } : null;

type Eip1193 = { request: (a: { method: string; params?: unknown[] | object }) => Promise<any>; on?: (e: string, f: (...a: any[]) => void) => void; removeListener?: (e: string, f: (...a: any[]) => void) => void };
export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string; provider: Eip1193 };

const found = new Map<string, WalletInfo>();
export function discoverWallets(onChange: (w: WalletInfo[]) => void) {
  const h = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (!d?.info || !d.provider) return;
    found.set(d.info.uuid, { ...d.info, provider: d.provider });
    onChange([...found.values()]);
  };
  window.addEventListener('eip6963:announceProvider', h);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Older wallets only inject window.ethereum.
  setTimeout(() => {
    const eth = (window as any).ethereum as Eip1193 | undefined;
    if (!found.size && eth) {
      found.set('legacy', { uuid: 'legacy', name: (eth as any).isMetaMask ? 'MetaMask' : 'Browser wallet', icon: '', rdns: 'legacy', provider: eth });
      onChange([...found.values()]);
    }
  }, 400);
  return () => window.removeEventListener('eip6963:announceProvider', h);
}

let active: WalletInfo | null = null;
export const activeProvider = () => active?.provider || null;

export async function connect(w: WalletInfo): Promise<{ address: string; chainId: number }> {
  const accounts: string[] = await w.provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('No account was shared.');
  active = w;
  const chainId = parseInt(await w.provider.request({ method: 'eth_chainId' }), 16);
  return { address: accounts[0], chainId };
}
export function disconnect() { active = null; }

export function watch(onAccounts: (a: string[]) => void, onChain: (id: number) => void) {
  const p = active?.provider;
  if (!p?.on) return () => {};
  const a = (x: string[]) => onAccounts(x);
  const c = (x: string) => onChain(parseInt(x, 16));
  p.on('accountsChanged', a);
  p.on('chainChanged', c);
  return () => { p.removeListener?.('accountsChanged', a); p.removeListener?.('chainChanged', c); };
}

export async function switchToChain(): Promise<void> {
  const p = activeProvider();
  if (!p) throw new Error('Connect a wallet first.');
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] });
  } catch (e: any) {
    if (e?.code !== 4902 && !/Unrecognized|not added|unknown chain/i.test(String(e?.message))) throw e;
    await p.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: CHAIN.hex, chainName: CHAIN.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer] }],
    });
  }
}

// R2.5: add the token from the deployment record, on the right network.
export async function addToken(symbol: string, decimals: number): Promise<boolean> {
  const p = activeProvider();
  if (!p || !TOKEN) throw new Error('Connect a wallet first.');
  const id = parseInt(await p.request({ method: 'eth_chainId' }), 16);
  if (id !== TOKEN.chainId) await switchToChain();
  return p.request({ method: 'wallet_watchAsset', params: { type: 'ERC20', options: { address: TOKEN.address, symbol, decimals } } });
}

// ---- Read-only RPC ----
export async function rpc(method: string, params: unknown[], tries = 3): Promise<any> {
  try { return await rpcOnce(method, params); }
  catch (e: any) {
    // The public RPC sits behind several nodes; one can lag a block behind another for a moment.
    if (tries > 1 && /unsupported block number|header not found|block not found/i.test(String(e?.message))) {
      await new Promise((r) => setTimeout(r, 1200));
      return rpc(method, params, tries - 1);
    }
    throw e;
  }
}
async function rpcOnce(method: string, params: unknown[]): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(CHAIN.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctl.signal });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  } finally {
    clearTimeout(t);
  }
}
const call = (to: string, data: string) => rpc('eth_call', [{ to, data }, 'latest']);
const word = (hexStr: string) => BigInt(hexStr === '0x' ? 0 : hexStr);
function decodeString(h: string): string {
  const b = h.slice(2);
  const len = parseInt(b.slice(64, 128), 16);
  const bytes = b.slice(128, 128 + len * 2).match(/../g) || [];
  return new TextDecoder().decode(Uint8Array.from(bytes.map((x) => parseInt(x, 16))));
}

export type TokenFacts = { name: string; symbol: string; decimals: number; totalSupply: bigint; block: number; chainId: number };
export async function readToken(): Promise<TokenFacts> {
  if (!TOKEN) throw new Error('No token record');
  const [name, symbol, decimals, supply, block, chainId] = await Promise.all([
    call(TOKEN.address, '0x06fdde03'), call(TOKEN.address, '0x95d89b41'), call(TOKEN.address, '0x313ce567'),
    call(TOKEN.address, '0x18160ddd'), rpc('eth_blockNumber', []), rpc('eth_chainId', []),
  ]);
  return { name: decodeString(name), symbol: decodeString(symbol), decimals: Number(word(decimals)), totalSupply: word(supply), block: parseInt(block, 16), chainId: parseInt(chainId, 16) };
}
export async function readBalance(holder: string): Promise<bigint> {
  if (!TOKEN) return 0n;
  return word(await call(TOKEN.address, '0x70a08231' + holder.toLowerCase().replace(/^0x/, '').padStart(64, '0')));
}

export const short = (a: string, n = 4) => (a.length > 2 * n + 4 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);
export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a.trim());
export const isShielded = (a: string) => isShieldedAddress(a.trim());
