// App state, the demo protocol engine, and the hook for the testnet engine (pool.ts).
// Demo mode (demo wallet): proofs, relaying and settlement are simulated in this browser.
// Testnet mode (browser wallet): actions run against the pool on the chain this build uses.
import { useEffect, useState } from 'preact/hooks';
import { ASSETS, asset, parseUnits, setAssetMode } from './amount';
import { loadState, saveState, randomId, fakeHash, addressOf, type Keys } from './vault-store';
import POOL from '../../../../../contracts/pool/deployments/testnet.json';

// Identifies the pool this build uses. Saved chain data from any other pool (for example the
// testnet one) must never show up as a balance here.
const POOL_ID = `${POOL.chainId}:${String((POOL.contracts as { pool?: { address: string } }).pool?.address || '').toLowerCase()}`;

export type Kind = 'shield' | 'send' | 'receive' | 'withdraw' | 'move';
export type Status = 'swapping' | 'approving' | 'proving' | 'scheduled' | 'signing' | 'submitted' | 'confirming' | 'credited' | 'failed';
export type Mode = 'demo' | 'testnet';
export type Fee = { relayer: string; max: string; networkEth: string };
export type Activity = {
  id: string; kind: Kind; asset: string; amount: string; fee: Fee;
  vault: string; toVault?: string; counterparty?: string; memo?: string;
  createdAt: number; plan: { submit: number; confirm: number; done: number };
  status: Status; failAt?: number; tx: string; delayed?: boolean;
  // Testnet only
  net?: 'testnet'; error?: string; at?: Status; via?: 'relayer' | 'wallet'; step?: string;
  ins?: string[]; outs?: string[]; change?: string; txs?: string[];
  /** Paid with ETH: the most ETH the swap could take, the pool fee tier, and the ETH it took. */
  payEth?: { max: string; fee: number; paid?: string };
  /** Received as ETH: the least ETH the swap could give, the pool fee tier, and the ETH that arrived. */
  toEth?: { min: string; fee: number; got?: string };
};
// A note this account controls in the testnet pool. c = commitment, i = leaf index, nf = nullifier.
export type PoolNote = { c: string; i: number; amount: string; blinding: string; asset: string; memo: string; block: number; tx: string; nf: string; spent: boolean; vault: string; mine?: boolean };
export type Testnet = {
  /** The pool these notes belong to (chain ID and address). Notes from another pool are dropped on load. */
  pool?: string;
  notes: PoolNote[]; vaultOf: Record<string, string>; synced: number; poolSize: number; eth: string; error: string; /** Wallet the public balances were last read for. */ balFor?: string;
  /** Notes spent (NewNullifier events) and pool transactions seen in the chain's events. */
  spentCount?: number; txCount?: number;
  relayer?: { address: string; fees: Record<string, string> } | null;
};
export type Vault = { id: string; name: string; archived: boolean; createdAt: number; hue: number };
export type Request = { id: string; asset: string; amount: string; memo: string; expiresAt: number | null; createdAt: number };
export type Receipt = { id: string; activityId: string; fields: string[]; createdAt: number; code: string };
export type Wallet = { address: string; kind: 'injected' | 'demo'; name: string; chainId?: number; icon?: string; via?: 'extension' | 'walletconnect' };
export type Prefs = { hideBalances: boolean; outsider: boolean; delayDefault: boolean; failNext: boolean; setupHidden?: boolean; celebrated?: boolean; sideMini?: boolean; viewKeyShownAt?: number };
export type State = {
  v: 1;
  ready: boolean;
  wallet: Wallet | null;
  keys: Keys | null;
  backedUp: boolean;
  createdAt: number;
  publicBal: Record<string, string>;
  vaults: Vault[];
  activity: Activity[];
  requests: Request[];
  receipts: Receipt[];
  prefs: Prefs;
  mode: Mode;
  tn: Testnet;
  stash: Partial<Record<Mode, { activity: Activity[]; publicBal: Record<string, string> }>>;
};

const fresh = (): State => ({
  v: 1, ready: false, wallet: null, keys: null, backedUp: false, createdAt: 0,
  publicBal: Object.fromEntries(ASSETS.map((a) => [a.symbol, (parseUnits(a.demoBalance, a.decimals) || 0n).toString()])),
  vaults: [{ id: 'main', name: 'Main', archived: false, createdAt: Date.now(), hue: 268 }],
  activity: [], requests: [], receipts: [],
  prefs: { hideBalances: false, outsider: false, delayDefault: false, failNext: false },
  mode: 'testnet', tn: freshTn(), stash: {},
});
const freshTn = (): Testnet => ({ pool: POOL_ID, notes: [], vaultOf: {}, synced: 0, poolSize: 0, eth: '0', error: '' });
// Testnet is the default, even before a wallet connects. Only the demo wallet switches to demo mode.
const modeOf = (s: State): Mode => (s.wallet?.kind === 'demo' ? 'demo' : 'testnet');

// The testnet engine registers itself here, so this module doesn't import it.
type Engine = {
  start: (input: SubmitInput, a: Activity) => void; startEngine: () => void; stopEngine: () => void;
  feeFor: (symbol: string, kind: Kind) => bigint;
};
let engine: Engine | null = null;
export function registerEngine(e: Engine) { engine = e; }
export const isTestnet = (s: State = state) => s.mode === 'testnet';

// Demo and testnet keep separate activity and wallet balances; switching swaps them.
function applyMode(s: State): State {
  const m = modeOf(s);
  if (m === s.mode) return s;
  const stash = { ...s.stash, [s.mode]: { activity: s.activity, publicBal: s.publicBal } };
  const back = stash[m];
  const zero = Object.fromEntries(ASSETS.map((a) => [a.symbol, '0']));
  setAssetMode(m);
  const demoBal = Object.fromEntries(ASSETS.map((a) => [a.symbol, (parseUnits(a.demoBalance, a.decimals) || 0n).toString()]));
  const next = { ...s, mode: m, stash, activity: back?.activity || [], publicBal: back?.publicBal || (m === 'demo' ? demoBal : zero) };
  if (m === 'testnet') setTimeout(() => engine?.startEngine(), 0); else engine?.stopEngine();
  if (m === 'testnet') next.publicBal = Object.fromEntries(ASSETS.map((a) => [a.symbol, next.publicBal[a.symbol] || '0']));
  return next;
}

let state: State = fresh();
const subs = new Set<() => void>();
let saveTimer = 0;

export const getState = () => state;
export function setState(fn: (s: State) => State | void, persist = true) {
  const next = fn(state);
  state = applyMode({ ...(next || state) });
  subs.forEach((f) => f());
  if (persist && state.keys) {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveState({ ...state, ready: undefined }), 150);
  }
}
export function useStore<T>(pick: (s: State) => T): T {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return pick(state);
}

// Demo tokens were dUSD and dETH; they are now USDG and ETH. Rename them in saved demo data.
const DEMO_RENAME: Record<string, string> = { dUSD: 'USDG', dETH: 'ETH' };
function renameDemoAssets(s: State) {
  const ren = (x: string) => DEMO_RENAME[x] || x;
  const acts = (l: Activity[] = []) => l.map((a) => (DEMO_RENAME[a.asset] ? { ...a, asset: ren(a.asset) } : a));
  const bal = (b: Record<string, string> = {}) => Object.fromEntries(Object.entries(b).map(([k, v]) => [ren(k), v]));
  if (s.mode === 'demo') { s.activity = acts(s.activity); s.publicBal = bal(s.publicBal); }
  if (s.stash.demo) s.stash = { ...s.stash, demo: { activity: acts(s.stash.demo.activity), publicBal: bal(s.stash.demo.publicBal) } };
  s.requests = (s.requests || []).map((r) => (DEMO_RENAME[r.asset] ? { ...r, asset: ren(r.asset) } : r));
}

export async function boot() {
  const saved = await loadState<State>();
  if (saved && saved.v === 1) {
    state = { ...fresh(), ...saved, tn: { ...freshTn(), ...(saved.tn || {}) }, stash: saved.stash || {}, mode: saved.mode || 'demo', ready: true };
    // Chain data saved for another pool (or before pools were tagged) belongs to a different
    // network: drop the notes and the on-chain history, keep keys, vaults and demo data.
    if ((saved.tn?.pool || '') !== POOL_ID) {
      state.tn = freshTn();
      const offChain = (l: Activity[] = []) => l.filter((a) => !a.net);
      state.activity = offChain(state.activity);
      if (state.stash.testnet) state.stash = { ...state.stash, testnet: { activity: offChain(state.stash.testnet.activity), publicBal: {} } };
    }
    // A browser wallet reconnects on its own; until then the app shows testnet data without a wallet.
    const m: Mode = saved.wallet?.kind === 'demo' ? 'demo' : 'testnet';
    if (m === 'testnet') state.wallet = null;
    if (state.mode !== m) {
      const back = state.stash[m];
      state.stash = { ...state.stash, [state.mode]: { activity: state.activity, publicBal: state.publicBal } };
      state.activity = back?.activity || [];
      state.publicBal = back?.publicBal || {};
      state.mode = m;
    }
    // Public balances belong to a wallet; show none until it reconnects.
    if (m === 'testnet') state.publicBal = {};
    renameDemoAssets(state);
    setAssetMode(state.mode);
    // Addresses carry the pool keys; recompute them in case the format changed.
    if (state.keys) state.keys = { ...state.keys, address: addressOf(state.keys.spend, state.keys.view) };
  } else { setAssetMode('testnet'); state = { ...fresh(), ready: true }; }
  if (state.mode === 'testnet') setTimeout(() => engine?.startEngine(), 0);
  subs.forEach((f) => f());
  tick();
  setInterval(tick, 400);
}

// ---- Balances ----
// Spendable counts only credited inflows (R3.2: never show funds as spendable before they are credited).
export type Bal = { spendable: bigint; incoming: bigint; outgoing: bigint };
export function balances(s: State, vaultId?: string): Record<string, Bal> {
  if (s.mode === 'testnet') return testnetBalances(s, vaultId);
  const out: Record<string, Bal> = Object.fromEntries(ASSETS.map((a) => [a.symbol, { spendable: 0n, incoming: 0n, outgoing: 0n }]));
  for (const a of s.activity) {
    const b = out[a.asset];
    if (!b) continue;
    const amt = BigInt(a.amount);
    const fee = BigInt(a.fee.relayer);
    const done = a.status === 'credited';
    const failed = a.status === 'failed';
    const inV = (id: string) => !vaultId || vaultId === id;
    if (a.kind === 'shield' || a.kind === 'receive') {
      if (!inV(a.vault) || failed) continue;
      if (done) b.spendable += amt; else b.incoming += amt;
    } else if (a.kind === 'move') {
      if (failed) continue;
      if (inV(a.vault)) { b.spendable -= amt + fee; if (!done) b.outgoing += amt + fee; }
      if (inV(a.toVault!)) { if (done) b.spendable += amt; else b.incoming += amt; }
      if (!vaultId) { /* within the pool the move nets out to the fee */ }
    } else {
      if (!inV(a.vault) || failed) continue;
      b.spendable -= amt + fee;
      if (!done) b.outgoing += amt + fee;
    }
  }
  return out;
}

// Testnet: spendable = unspent notes not held by an action in flight (R3.2).
const live = (a: Activity) => a.net === 'testnet' && a.status !== 'credited' && a.status !== 'failed';
function testnetBalances(s: State, vaultId?: string): Record<string, Bal> {
  const out: Record<string, Bal> = Object.fromEntries(ASSETS.map((a) => [a.symbol, { spendable: 0n, incoming: 0n, outgoing: 0n }]));
  const inV = (id?: string) => !vaultId || vaultId === id;
  const held = new Set(s.activity.filter(live).flatMap((a) => a.ins || []));
  for (const n of s.tn.notes) {
    const sym = ASSETS.find((a) => a.address?.toLowerCase() === n.asset.toLowerCase())?.symbol;
    if (!sym || n.spent || held.has(n.c) || !inV(n.vault)) continue;
    out[sym].spendable += BigInt(n.amount);
  }
  for (const a of s.activity.filter(live)) {
    const b = out[a.asset];
    if (!b) continue;
    const amt = BigInt(a.amount);
    const fee = BigInt(a.fee.relayer || '0');
    const change = BigInt(a.change || '0');
    if (a.kind === 'shield') { if (inV(a.vault)) b.incoming += amt; continue; }
    if (inV(a.vault)) { b.outgoing += amt + fee; b.incoming += change; }
    if (a.kind === 'move' && inV(a.toVault)) b.incoming += amt;
  }
  return out;
}

// ---- Fees (R3.8) ----
export function quote(symbol: string, kind: Kind): Fee {
  if (state.mode === 'testnet') { const f = (engine?.feeFor(symbol, kind) ?? 0n).toString(); return { relayer: f, max: f, networkEth: '0.000012' }; }
  const a = asset(symbol);
  const relayer = kind === 'shield' || kind === 'receive' ? 0n : parseUnits(a.fee.relayer, a.decimals) || 0n;
  return { relayer: relayer.toString(), max: ((relayer * 3n) / 2n).toString(), networkEth: '0.00002' };
}

// ---- Actions ----
const DUR = { prove: 3200, submit: 1600, confirm: 4200 };
export type SubmitInput = { kind: Kind; asset: string; amount: bigint; vault: string; toVault?: string; counterparty?: string; memo?: string; delayed?: boolean;
  /** Swap ETH for exactly `amount` first (shield only). */
  payEth?: { maxIn: bigint; fee: number };
  /** Swap the withdrawn amount for ETH on the way out, for at least `minOut` (withdraw only). */
  toEth?: { minOut: bigint; fee: number } };
export function submit(input: SubmitInput): Activity {
  const now = Date.now();
  if (state.mode === 'testnet' && engine) {
    const t: Activity = {
      id: randomId('a'), net: 'testnet', kind: input.kind, asset: input.asset, amount: input.amount.toString(),
      fee: quote(input.asset, input.kind), vault: input.vault, toVault: input.toVault, counterparty: input.counterparty, memo: input.memo,
      createdAt: now, plan: { submit: 0, confirm: 0, done: 0 }, status: input.payEth ? 'swapping' : 'proving', tx: '', delayed: !!input.delayed,
      ...(input.payEth ? { payEth: { max: input.payEth.maxIn.toString(), fee: input.payEth.fee } } : {}),
      ...(input.toEth ? { toEth: { min: input.toEth.minOut.toString(), fee: input.toEth.fee } } : {}),
    };
    setState((s) => { s.activity = [t, ...s.activity]; });
    engine.start(input, t);
    return t;
  }
  const proving = input.kind !== 'shield' && input.kind !== 'receive';
  const delay = input.delayed ? 8000 + Math.round(Math.random() * 12000) : 0;
  const submitAt = now + (proving ? DUR.prove : 300) + delay;
  const confirmAt = submitAt + DUR.submit;
  const doneAt = confirmAt + DUR.confirm;
  const a: Activity = {
    id: randomId('a'), kind: input.kind, asset: input.asset, amount: input.amount.toString(),
    fee: quote(input.asset, input.kind), vault: input.vault, toVault: input.toVault,
    counterparty: input.counterparty, memo: input.memo, createdAt: now,
    plan: { submit: submitAt, confirm: confirmAt, done: doneAt },
    status: proving ? 'proving' : 'submitted', tx: fakeHash(), delayed: !!input.delayed,
  };
  setState((s) => {
    if (s.prefs.failNext) { a.failAt = confirmAt + 1200; s.prefs = { ...s.prefs, failNext: false }; }
    if (a.kind === 'shield') {
      s.publicBal = { ...s.publicBal, [a.asset]: (BigInt(s.publicBal[a.asset] || '0') - input.amount).toString() };
    }
    s.activity = [a, ...s.activity];
  });
  return a;
}

function tick() {
  const now = Date.now();
  let changed = false;
  if (state.mode === 'testnet') return;
  const acts = state.activity.map((a) => {
    if (a.net || a.status === 'credited' || a.status === 'failed') return a;
    let st: Status = a.status;
    if (a.failAt && now >= a.failAt) st = 'failed';
    else if (now >= a.plan.done) st = 'credited';
    else if (now >= a.plan.confirm) st = 'confirming';
    else if (now >= a.plan.submit) st = 'submitted';
    else st = a.delayed && a.kind !== 'shield' && now >= a.createdAt + DUR.prove ? 'scheduled' : a.status;
    if (st === a.status) return a;
    changed = true;
    return { ...a, status: st };
  });
  if (!changed) return;
  setState((s) => {
    for (const a of acts) {
      const prev = s.activity.find((x) => x.id === a.id);
      if (!prev || prev.status === a.status) continue;
      if (a.status === 'credited' && a.kind === 'withdraw' && a.counterparty?.toLowerCase() === s.wallet?.address.toLowerCase()) {
        s.publicBal = { ...s.publicBal, [a.asset]: (BigInt(s.publicBal[a.asset] || '0') + BigInt(a.amount)).toString() };
      }
      if (a.status === 'failed' && a.kind === 'shield') {
        s.publicBal = { ...s.publicBal, [a.asset]: (BigInt(s.publicBal[a.asset] || '0') + BigInt(a.amount)).toString() };
      }
      toastFor(a);
    }
    s.activity = acts;
  });
}

// ---- Toasts ----
export type Toast = { id: string; tone: 'ok' | 'bad' | 'info'; title: string; body?: string };
let toasts: Toast[] = [];
const toastSubs = new Set<() => void>();
export const getToasts = () => toasts;
export function pushToast(t: Omit<Toast, 'id'>) {
  const id = randomId('t');
  toasts = [...toasts, { ...t, id }].slice(-4);
  toastSubs.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== id); toastSubs.forEach((f) => f()); }, 5200);
}
export function useToasts() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); toastSubs.add(f); return () => { toastSubs.delete(f); }; }, []);
  return toasts;
}
export const KIND_LABEL: Record<Kind, string> = { shield: 'Shield', send: 'Private send', receive: 'Received', withdraw: 'Withdrawal', move: 'Vault move' };
function toastFor(a: Activity) {
  if (a.status === 'credited') pushToast({ tone: 'ok', title: `${KIND_LABEL[a.kind]} ${a.kind === 'shield' || a.kind === 'receive' || a.kind === 'move' ? 'credited' : 'settled'}`, body: a.kind === 'withdraw' ? 'The withdrawal is public on the chain.' : undefined });
  if (a.status === 'failed') pushToast({ tone: 'bad', title: `${KIND_LABEL[a.kind]} failed`, body: a.kind === 'shield' ? 'Nothing was credited. The amount is back in your wallet.' : 'Nothing was spent. Your balance is unchanged.' });
}

export const vaultName = (s: State, id?: string) => s.vaults.find((v) => v.id === id)?.name || 'Main';
export const activeVaults = (s: State) => s.vaults.filter((v) => !v.archived);
/** The vault an action page starts on: ?vault= when it names an active vault, else the first one. */
export const initialVault = (s: State, want?: string | null) => (want && activeVaults(s).find((v) => v.id === want)?.id) || activeVaults(s)[0]?.id || 'main';
