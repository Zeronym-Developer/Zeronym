// Privacy checks for public edges (shield and withdraw). They catch common
// linking patterns. Passing them doesn't guarantee privacy.
import { amountShape, asset } from './amount';
import type { State } from './store';
import { NET } from './network';

export type Finding = { level: 'good' | 'fair' | 'weak'; title: string; body: string };

export function checkWithdraw(s: State, symbol: string, amount: bigint, dest: string, delayed: boolean): Finding[] {
  const out: Finding[] = [];
  const a = asset(symbol);
  if (amount > 0n) {
    const shape = amountShape(amount, a.decimals);
    out.push(shape === 'unusual'
      ? { level: 'weak', title: 'Unusual amount', body: 'One-of-a-kind amounts are easier to match with a deposit. A rounder amount blends in better.' }
      : { level: 'good', title: 'Common-looking amount', body: 'Round amounts are harder to single out.' });
    const recent = s.activity.find((x) => x.kind === 'shield' && x.asset === symbol && x.status !== 'failed' && BigInt(x.amount) === amount);
    if (recent) {
      const mins = Math.round((Date.now() - recent.createdAt) / 60000);
      out.push({ level: 'weak', title: 'Matches a deposit', body: `You shielded exactly this amount ${mins < 1 ? 'moments' : `${mins} min`} ago. Someone could guess the two are linked.` });
    }
  }
  const lastShield = s.activity.find((x) => x.kind === 'shield' && x.asset === symbol && x.status !== 'failed');
  if (lastShield && Date.now() - lastShield.createdAt < 30 * 60000) {
    out.push({ level: delayed ? 'fair' : 'weak', title: 'Soon after a deposit', body: 'Withdrawing shortly after shielding makes timing links easier. Waiting longer helps' + (delayed ? '; delayed submission adds a little randomness.' : '.') });
  } else if (lastShield) {
    out.push({ level: 'good', title: 'Time has passed since your deposit', body: 'More time between deposit and withdrawal makes timing links harder.' });
  }
  const d = dest.trim().toLowerCase();
  if (d && s.wallet && d === s.wallet.address.toLowerCase() && s.activity.some((x) => x.kind === 'shield')) {
    out.push({ level: 'weak', title: 'Same address as your deposits', body: 'This address funded your deposits, so withdrawing to it links them publicly.' });
  }
  if (s.mode === 'testnet') {
    const txs = Math.floor(s.tn.poolSize / 2);
    out.push({ level: txs < 200 ? 'weak' : 'fair', title: `Small pool: ${txs.toLocaleString('en-US')} transactions so far`, body: `This ${NET.isTestnet ? 'testnet ' : ''}pool has few users, so any withdrawal is easier to trace. A bigger pool hides you among more people.` });
    if (!s.tn.relayer) out.push({ level: 'weak', title: 'The relayer is unavailable', body: 'Your wallet would submit this withdrawal, which links it to your wallet address in public.' });
  } else out.push({ level: 'fair', title: 'Pool size unknown', body: 'In demo mode there is no real pool. With few users, any withdrawal is easier to trace.' });
  return out;
}

export function checkShield(symbol: string, amount: bigint): Finding[] {
  const a = asset(symbol);
  if (amount <= 0n) return [];
  const shape = amountShape(amount, a.decimals);
  return [shape === 'unusual'
    ? { level: 'fair', title: 'Unusual amount', body: 'If you later withdraw this exact amount, the two are easy to match. Consider a rounder deposit.' }
    : { level: 'good', title: 'Common-looking amount', body: 'Round deposits are easier to blend in with others.' }];
}

export function score(f: Finding[]): 'good' | 'fair' | 'weak' {
  if (f.some((x) => x.level === 'weak')) return 'weak';
  if (f.some((x) => x.level === 'fair')) return 'fair';
  return 'good';
}
