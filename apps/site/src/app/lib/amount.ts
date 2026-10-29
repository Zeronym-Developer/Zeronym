// Token amounts as integer base units (bigint), stored as strings.
import deployments from '../../data/deployments.json';

export type Asset = {
  symbol: string; name: string; decimals: number; kind: string; behaviour: string;
  demoBalance: string; step: string; fee: { relayer: string };
  address?: string; faucet?: boolean; maxDeposit?: string;
  /** No new deposits; still listed so existing balances can be sent and withdrawn. */
  retired?: boolean; faucetUrl?: string; issuer?: string;
};

// R3.9: only standard tokens from the deployment record are offered.
const DEMO: Asset[] = (deployments.app.assets as Asset[]).filter((a) => a.behaviour === 'standard');
// Real tokens on the chain this build uses (testnet or mainnet).
const TESTNET: Asset[] = (deployments.app.chainAssets as Asset[]).filter((a) => a.behaviour === 'standard');
// Live binding: importers always see the assets of the current mode.
export let ASSETS: Asset[] = TESTNET;
export function setAssetMode(mode: 'demo' | 'testnet') { ASSETS = mode === 'testnet' ? TESTNET : DEMO; }
export const NETWORK_FEE_ETH = deployments.app.networkFeeEth;
export const asset = (symbol: string) => ASSETS.find((a) => a.symbol === symbol) || ASSETS[0];

export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  const [i, f = ''] = s.split('.');
  if (f.length > decimals) return null;
  return BigInt((i || '0') + f.padEnd(decimals, '0'));
}

export function formatUnits(v: bigint | string, decimals: number, opts: { max?: number; min?: number; sign?: boolean } = {}): string {
  let n = typeof v === 'string' ? BigInt(v) : v;
  const neg = n < 0n;
  if (neg) n = -n;
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  let frac = (n % base).toString().padStart(decimals, '0');
  const max = opts.max ?? Math.min(decimals, 6);
  frac = frac.slice(0, max).replace(/0+$/, '');
  if (opts.min && frac.length < opts.min) frac = frac.padEnd(opts.min, '0');
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const out = frac ? `${w}.${frac}` : w;
  return (neg ? '−' : opts.sign ? '+' : '') + out;
}

export const fmt = (v: bigint | string, symbol: string, opts?: { sign?: boolean }) => {
  const a = asset(symbol);
  return `${formatUnits(v, a.decimals, { min: a.decimals === 2 ? 2 : 0, sign: opts?.sign })} ${symbol}`;
};

// How "unusual" an amount looks: many significant digits make an amount easier to match.
export function amountShape(v: bigint, decimals: number): 'round' | 'normal' | 'unusual' {
  const s = v.toString().replace(/0+$/, '');
  const total = v.toString().length;
  const sig = s.length;
  const zeros = total - sig;
  if (zeros >= decimals + 1 || (zeros >= decimals && sig <= 2)) return 'round';
  if (sig <= 3) return 'normal';
  return 'unusual';
}
