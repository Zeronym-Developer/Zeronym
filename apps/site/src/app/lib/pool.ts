// Chain engine: the real Zeronym pool on Robinhood Chain (testnet or mainnet, per build).
// The deployment record import is swapped for the mainnet one in a mainnet build (astro.config.mjs).
// Proofs are built in this browser (prover.worker.ts). Public deposits are sent by
// your wallet; private actions go through the relayer, or your wallet if it's down.
import { encodeFunctionData, decodeFunctionResult, parseAbi, hexToBytes } from 'viem';
import * as core from '../../../../../contracts/pool/lib/core.mjs';
import POOL from '../../../../../contracts/pool/deployments/testnet.json';
import { rpc, activeProvider, switchToChain, CHAIN } from './chain';
import { getState, setState, registerEngine, pushToast, KIND_LABEL, type Activity, type PoolNote, type State } from './store';
import { ASSETS, asset, fmt } from './amount';
import { hex } from './vault-store';
import { NET } from './network';
import { quoteEth, swapTx, quoteToEth, ETH_EXIT } from './swap';

export const POOL_ADDRESS = POOL.contracts.pool.address as `0x${string}`;
export const POOL_INFO = POOL;
const DEPLOY_BLOCK = POOL.contracts.pool.block;
// Copied into public/zk by scripts/copy-zk.mjs, named by content hash.
const WASM = `/zk/transaction-${POOL.circuit.wasmSha256.slice(0, 8)}.wasm`;
const ZKEY = `/zk/transaction-${POOL.circuit.zkeySha256.slice(0, 8)}.zkey`;
const TX_GAS = '0x186a00'; // 1.6M; a pool transaction uses about 1.2M

const poolAbi = parseAbi([
  'function transact((bytes proof, bytes32 root, bytes32[2] inputNullifiers, bytes32[2] outputCommitments, uint256 publicAmount, bytes32 extDataHash) _args, (address recipient, int256 extAmount, address relayer, uint256 fee, bytes encryptedOutput1, bytes encryptedOutput2, address token) _extData)',
  'function getLastRoot() view returns (bytes32)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
]);
// Receive as ETH (contracts/pool/contracts/ZeronymEthExit.sol).
const ORDER = '(address token, address recipient, uint256 minEthOut, uint256 deadline, uint24 fee, bytes32 nonce)';
const exitAbi = parseAbi([
  `function forwarderOf(${ORDER} o) view returns (address)`,
  `function withdraw((bytes proof, bytes32 root, bytes32[2] inputNullifiers, bytes32[2] outputCommitments, uint256 publicAmount, bytes32 extDataHash) args, (address recipient, int256 extAmount, address relayer, uint256 fee, bytes encryptedOutput1, bytes encryptedOutput2, address token) extData, ${ORDER} o) returns (uint256)`,
]);
export type EthOrder = { token: `0x${string}`; recipient: `0x${string}`; minEthOut: bigint; deadline: bigint; fee: number; nonce: `0x${string}` };
const EXIT_GAS = '0x2625a0'; // 2.5M; withdraw and swap together use about 1.4M
// Settled(address indexed forwarder, address indexed recipient, address token, uint256 amountIn, uint256 ethOut, bool swapped)
const SETTLED_TOPIC = '0x3cb6e91197902c8fbb546002986511a6d13fcb6ef576da2a38914eb8ad796566';
const ercAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
]);

// ---------- Keys ----------
let keyCache: { id: string; k: core.PoolKeys } | null = null;
export function poolKeys(s: State = getState()): core.PoolKeys {
  const k = s.keys!;
  if (keyCache?.id !== k.spend) keyCache = { id: k.spend, k: core.keysFromSeeds(hexToBytes(`0x${k.spend}`), hexToBytes(`0x${k.view}`)) };
  return keyCache.k;
}
export const isShieldedAddress = (a: string) => core.isShieldedAddress(a);

const addrOf = (v: bigint) => ('0x' + v.toString(16).padStart(40, '0')) as `0x${string}`;
const tokenOf = (symbol: string) => asset(symbol).address as `0x${string}`;
export const symbolOf = (token: string) => ASSETS.find((a) => a.address?.toLowerCase() === token.toLowerCase())?.symbol || '?';

// ---------- Chain reads ----------
const call = async (to: string, data: string, block: string = 'latest') => rpc('eth_call', [{ to, data }, block]);
async function readErc(token: string, fn: 'balanceOf' | 'allowance', args: string[]): Promise<bigint> {
  const data = encodeFunctionData({ abi: ercAbi, functionName: fn, args: args as any });
  return decodeFunctionResult({ abi: ercAbi, functionName: fn, data: await call(token, data) }) as bigint;
}

// ---------- Pool view (public data, in memory) ----------
type Mem = { commitments: core.PoolCommitment[]; nullifiers: Set<bigint>; block: number; tree: core.MerkleTree };
let mem: Mem = { commitments: [], nullifiers: new Set(), block: DEPLOY_BLOCK - 1, tree: new core.MerkleTree() };
let syncing: Promise<void> | null = null;

async function getLogs(from: number, to: number): Promise<any[]> {
  try {
    return await rpc('eth_getLogs', [{ address: POOL_ADDRESS, fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) }]);
  } catch (e) {
    if (to - from < 1000) throw e;
    const mid = Math.floor((from + to) / 2);
    return [...(await getLogs(from, mid)), ...(await getLogs(mid + 1, to))];
  }
}

export function sync(): Promise<void> {
  syncing ??= doSync().finally(() => { syncing = null; });
  return syncing;
}

async function doSync() {
  const latest = parseInt(await rpc('eth_blockNumber', []), 16);
  if (latest > mem.block) {
    const { commitments, nullifiers } = core.decodePoolLogs(await getLogs(mem.block + 1, latest));
    const fresh = commitments.filter((c) => c.index >= mem.commitments.length);
    const next = [...mem.commitments, ...fresh];
    if (next.some((c, i) => c.index !== i)) { mem = { commitments: [], nullifiers: new Set(), block: DEPLOY_BLOCK - 1, tree: new core.MerkleTree() }; return doSync(); }
    mem.tree.insert(fresh.map((c) => c.commitment));
    mem.commitments = next;
    nullifiers.forEach((n) => mem.nullifiers.add(n));
    mem.block = latest;
  }
  // R3.10: the local tree must match the contract at the same block.
  const root = decodeFunctionResult({ abi: poolAbi, functionName: 'getLastRoot', data: await call(POOL_ADDRESS, encodeFunctionData({ abi: poolAbi, functionName: 'getLastRoot' }), '0x' + mem.block.toString(16)) });
  const matches = root === core.hex32(mem.tree.root());
  // Without a privacy key yet, only the public pool view is kept.
  const s0 = getState();
  const keys = s0.keys ? poolKeys(s0) : null;
  const known = new Set(s0.tn.notes.map((n) => n.c));
  const found = keys ? await core.findNotes(keys, mem.commitments.filter((c) => !known.has(core.hex32(c.commitment))), mem.nullifiers) : [];
  setState((s) => {
    if (s.keys?.spend !== s0.keys?.spend) return; // the key changed while scanning; the next sync picks it up
    const firstSync = !s.tn.notes.length && !Object.keys(s.tn.vaultOf).length;
    const added: PoolNote[] = found.map((n) => {
      const c = core.hex32(n.commitment);
      return { c, i: n.index, amount: n.amount.toString(), blinding: n.blinding.toString(), asset: addrOf(n.asset), memo: n.memo, block: n.block, tx: n.tx, nf: core.hex32(n.nullifier), spent: n.spent, vault: s.tn.vaultOf[c] || 'main', mine: c in s.tn.vaultOf };
    });
    const notes = [...s.tn.notes, ...added].map((n) => ({ ...n, spent: n.spent || mem.nullifiers.has(BigInt(n.nf)) }));
    // Payments from someone else become "received" activity.
    const received: Activity[] = added.filter((n) => !n.mine && BigInt(n.amount) > 0n).map((n) => ({
      id: 'rx' + n.c.slice(2, 14), net: 'testnet', kind: 'receive', asset: symbolOf(n.asset), amount: n.amount, fee: { relayer: '0', max: '0', networkEth: '0' },
      vault: n.vault, memo: n.memo || (firstSync ? 'Found on chain' : ''), createdAt: Date.now(), plan: { submit: 0, confirm: 0, done: 0 }, status: 'credited', tx: n.tx,
    }));
    received.forEach((a) => pushToast({ tone: 'ok', title: `Received ${fmt(a.amount, a.asset)}`, body: 'A private payment was credited.' }));
    const have = new Set(notes.map((n) => n.c));
    const spentSet = new Set(notes.filter((n) => n.spent).map((n) => n.c));
    // An action is credited once its new notes are on chain and its inputs are spent.
    const activity = s.activity.map((a) => {
      if (a.net !== 'testnet' || a.status === 'credited' || !a.outs?.length) return a;
      if (!a.outs.every((c) => have.has(c)) || !(a.ins || []).every((c) => spentSet.has(c))) return a;
      if (a.status !== 'failed') toastDone(a);
      return { ...a, status: 'credited' as const, error: undefined };
    });
    s.tn = { ...s.tn, notes, synced: mem.block, poolSize: mem.commitments.length, spentCount: mem.nullifiers.size, txCount: new Set(mem.commitments.map((c) => c.tx)).size, error: matches ? '' : 'mismatch' };
    s.activity = [...received.filter((r) => !s.activity.some((a) => a.id === r.id)), ...activity];
  });
}

function toastDone(a: Activity) {
  pushToast({ tone: 'ok', title: `${KIND_LABEL[a.kind]} ${a.kind === 'send' ? 'sent' : a.kind === 'withdraw' ? 'settled' : 'credited'}`, body: a.kind === 'withdraw' ? 'The withdrawal is public on the chain.' : undefined });
}

export async function refreshPublic() {
  const w = getState().wallet;
  if (w?.kind !== 'injected') return;
  const [eth, ...bals] = await Promise.all([rpc('eth_getBalance', [w.address, 'latest']), ...ASSETS.map((a) => readErc(a.address!, 'balanceOf', [w.address]))]);
  setState((s) => {
    s.publicBal = Object.fromEntries(ASSETS.map((a, i) => [a.symbol, bals[i].toString()]));
    s.tn = { ...s.tn, eth: BigInt(eth).toString(), balFor: w.address };
  });
}

// ---------- Relayer ----------
export type RelayerInfo = { address: `0x${string}`; fees: Record<string, string>; chainId: number; pool: string };
let relayer: Promise<RelayerInfo | null> | null = null;
export function relayerInfo(force = false): Promise<RelayerInfo | null> {
  if (force || !relayer) {
    relayer = fetch('/api/relay', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.address && j.chainId === CHAIN.id && j.pool?.toLowerCase() === POOL_ADDRESS.toLowerCase() ? j : null))
      .catch(() => null)
      .then((info) => { setState((s) => { s.tn = { ...s.tn, relayer: info }; }, false); return info; });
  }
  return relayer;
}

async function freshTree() {
  await sync();
  if (getState().tn.error === 'mismatch') throw new Error('Your view of the pool doesn’t match the chain yet. Try again in a moment.');
}

// ---------- Proving ----------
let worker: Worker | null = null;
const waiting = new Map<number, (r: any) => void>();
let seq = 0;
function prover(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./prover.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
  }
  return worker;
}
function ask(msg: object): Promise<any> {
  const id = ++seq;
  return new Promise((res, rej) => {
    waiting.set(id, (r) => (r.error ? rej(new Error(r.error)) : res(r)));
    prover().postMessage({ id, wasm: WASM, zkey: ZKEY, ...msg });
  });
}
export const warmProver = () => ask({ type: 'warm' }).catch(() => {});
async function prove(input: Record<string, unknown>) {
  const r = await ask({ type: 'prove', input });
  return core.packProof(r.proof);
}

// ---------- Wallet ----------
async function walletTx(to: string, data: string, gas?: string, value?: bigint): Promise<`0x${string}`> {
  const p = activeProvider();
  const w = getState().wallet;
  if (!p || w?.kind !== 'injected') throw new Error('Connect your wallet first.');
  if (parseInt(await p.request({ method: 'eth_chainId' }), 16) !== CHAIN.id) await switchToChain();
  const v = value ? { value: '0x' + value.toString(16) } : {};
  // Dry run first, so a revert shows its reason instead of a vague wallet error.
  await rpc('eth_call', [{ from: w.address, to, data, ...v, ...(gas ? { gas } : {}) }, 'latest']).catch((e) => { throw new Error(revertText(e)); });
  try {
    return await p.request({ method: 'eth_sendTransaction', params: [{ from: w.address, to, data, ...v, ...(gas ? { gas } : {}) }] });
  } catch (e: any) {
    // Some wallets refuse a transaction that comes with its own gas limit (one answers "invalid id").
    // Unless the person declined it, ask once more and let the wallet set the limit itself.
    if (!gas || e?.code === 4001 || /user (rejected|denied)/i.test(String(e?.message))) throw e;
    return p.request({ method: 'eth_sendTransaction', params: [{ from: w.address, to, data, ...v }] });
  }
}

// Uniswap v3 Swap event: the positive amount is what went into the pool, so the ETH the swap took.
const SWAP_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
function ethPaid(r: { logs?: { topics: string[]; data: string }[] }): bigint | null {
  const log = r.logs?.find((l) => l.topics[0] === SWAP_TOPIC);
  if (!log) return null;
  const int = (h: string) => { const x = BigInt('0x' + h); return x >= 1n << 255n ? x - (1n << 256n) : x; };
  const a0 = int(log.data.slice(2, 66)), a1 = int(log.data.slice(66, 130));
  return a0 > 0n ? a0 : a1 > 0n ? a1 : null;
}

async function receipt(hash: string, timeoutMs = 180_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
    if (r) {
      if (r.status !== '0x1') throw new Error('The transaction reverted on chain. Nothing was spent.');
      return r;
    }
    await sleep(1200);
  }
  throw new Error('No confirmation after 3 minutes. Check the explorer: it may still go through.');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function revertText(e: any): string {
  const m = String(e?.message || e);
  if (/already spent/i.test(m)) return 'One of these notes was already spent. Your balance will refresh.';
  if (/maximumDepositAmount/i.test(m)) return `That deposit is above the ${NET.isTestnet ? 'testnet' : 'per-deposit'} limit for this token.`;
  if (/Invalid merkle root/i.test(m)) return 'The pool moved on while this was being built. Try again.';
  if (/InsufficientBalance|exceeds balance/i.test(m)) return 'Your wallet doesn’t hold enough of this token.';
  if (/InsufficientAllowance|allowance/i.test(m)) return 'The pool isn’t approved to take this amount yet.';
  if (/Too much requested|Transaction too old|Too little received|too little ETH|\bSTF\b/i.test(m)) return 'The ETH price moved before the swap went through. Nothing was spent. Try again.';
  if (/order expired/i.test(m)) return 'This took too long, so the ETH price it was built on expired. Nothing was spent. Try again.';
  if (/insufficient funds/i.test(m)) return `Your wallet needs a little ${NET.isTestnet ? 'testnet ' : ''}ETH on Robinhood Chain for the network fee.`;
  return m.replace(/^execution reverted:?\s*/i, '') || 'The transaction would fail.';
}
function friendly(e: any): string {
  if (e?.code === 4001 || /user (rejected|denied)/i.test(String(e?.message))) return 'You declined it in your wallet. Nothing was spent.';
  return revertText(e);
}

// ---------- Actions ----------
type Input = { kind: Activity['kind']; asset: string; amount: bigint; vault: string; toVault?: string; counterparty?: string; memo?: string; delayed?: boolean; payEth?: { maxIn: bigint; fee: number }; toEth?: { minOut: bigint; fee: number } };
const reserved = () => new Set(getState().activity.filter((a) => a.net === 'testnet' && a.status !== 'credited' && a.status !== 'failed').flatMap((a) => a.ins || []));

export function spendable(s: State, symbol: string, vault: string): PoolNote[] {
  const token = tokenOf(symbol).toLowerCase();
  const r = reserved();
  return s.tn.notes.filter((n) => !n.spent && n.asset.toLowerCase() === token && n.vault === vault && BigInt(n.amount) > 0n && !r.has(n.c));
}

// Smallest single note, or the smallest pair, that covers the amount.
function pick(notes: PoolNote[], need: bigint): PoolNote[] | null {
  const sorted = [...notes].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? -1 : 1));
  const one = sorted.find((n) => BigInt(n.amount) >= need);
  if (one) return [one];
  let best: PoolNote[] | null = null;
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const t = BigInt(sorted[i].amount) + BigInt(sorted[j].amount);
    if (t >= need && (!best || t < BigInt(best[0].amount) + BigInt(best[1].amount))) best = [sorted[i], sorted[j]];
  }
  return best;
}
const asInput = (n: PoolNote): core.InputNote => ({ amount: BigInt(n.amount), blinding: BigInt(n.blinding), asset: BigInt(n.asset), index: n.i });

export function feeFor(symbol: string, kind: Activity['kind']): bigint {
  if (kind === 'shield' || kind === 'receive') return 0n;
  const r = getState().tn.relayer;
  return r ? BigInt(r.fees[symbol] || '0') : 0n;
}

function update(id: string, patch: Partial<Activity>) {
  setState((s) => { s.activity = s.activity.map((a) => (a.id === id ? { ...a, ...patch } : a)); });
}

export function start(input: Input, a: Activity) {
  run(input, a).catch((e) => {
    update(a.id, { status: 'failed', at: getState().activity.find((x) => x.id === a.id)?.status, error: friendly(e) });
    pushToast({ tone: 'bad', title: `${KIND_LABEL[a.kind]} failed`, body: friendly(e) });
  });
}

async function run(input: Input, a: Activity) {
  const keys = poolKeys();
  const token = tokenOf(input.asset);
  const me = { pubKey: keys.pubKey, encPub: keys.encPub };
  const remember = (outs: { c: string; vault: string }[]) => setState((s) => { s.tn = { ...s.tn, vaultOf: { ...s.tn.vaultOf, ...Object.fromEntries(outs.map((o) => [o.c, o.vault])) } }; });

  if (input.kind === 'shield') {
    const w = getState().wallet!;
    let swapped = false;
    if (input.payEth) {
      // Price check again right before the swap. The cap is never above what the person reviewed.
      update(a.id, { status: 'swapping' });
      const q = await quoteEth(input.asset, input.amount);
      const cap = q.maxIn < input.payEth.maxIn ? q.maxIn : input.payEth.maxIn;
      if (q.ethIn > cap) throw new Error('The ETH price moved since you reviewed this. Nothing was spent. Review it again.');
      const before = await readErc(token, 'balanceOf', [w.address]);
      if (BigInt(getState().tn.eth || '0') < cap) await refreshPublic();
      if (BigInt(getState().tn.eth || '0') < cap) throw new Error('Your wallet doesn’t hold enough ETH for this swap and its network fee.');
      const t = swapTx({ ...q, maxIn: cap }, w.address as `0x${string}`);
      const h = await walletTx(t.to, t.data, undefined, t.value);
      update(a.id, { txs: [h], payEth: { max: cap.toString(), fee: q.fee } });
      const r = await receipt(h);
      const paid = ethPaid(r);
      update(a.id, { payEth: { max: cap.toString(), fee: q.fee, ...(paid != null ? { paid: paid.toString() } : {}) } });
      if ((await readErc(token, 'balanceOf', [w.address])) - before < input.amount) throw new Error(`The swap finished but less ${input.asset} arrived than expected. Check your wallet before shielding.`);
      swapped = true;
      void refreshPublic();
    }
    try {
      await deposit();
    } catch (e: any) {
      if (!swapped) throw e;
      // The swap already went through, so "nothing was spent" would be wrong here.
      throw new Error(`${friendly(e).replace(/\s*Nothing was spent\.?/, '')} The swap went through, so the ${fmt(input.amount, input.asset)} is in your wallet: shield it again and pay with ${input.asset}.`);
    }
    return;
  }
  async function deposit() {
    const w = getState().wallet!;
    if ((await readErc(token, 'allowance', [w.address, POOL_ADDRESS])) < input.amount) {
      update(a.id, { status: 'approving' });
      const h = await walletTx(token, encodeFunctionData({ abi: ercAbi, functionName: 'approve', args: [POOL_ADDRESS, input.amount] }));
      update(a.id, { txs: [...(getState().activity.find((x) => x.id === a.id)?.txs || []), h] });
      await receipt(h);
    }
    update(a.id, { status: 'proving' });
    await freshTree();
    const tx = await core.prepareTransaction({ tree: mem.tree, keys, token, outputs: [{ ...me, amount: input.amount }], extAmount: input.amount });
    const outs = tx.args.outputCommitments.map((c) => ({ c, vault: input.vault }));
    remember(outs);
    update(a.id, { outs: outs.map((o) => o.c) });
    const proof = await prove(tx.input);
    update(a.id, { status: 'signing' });
    const hash = await walletTx(POOL_ADDRESS, encodeFunctionData({ abi: poolAbi, functionName: 'transact', args: [{ ...tx.args, proof } as any, tx.extData] }), TX_GAS);
    update(a.id, { status: 'confirming', tx: hash });
    await receipt(hash);
    await sync();
    void refreshPublic();
  }

  // Private actions: send, withdraw, vault move. Each is one proof.
  const info = await relayerInfo();
  const via: 'relayer' | 'wallet' = info ? 'relayer' : 'wallet';
  const fee = via === 'relayer' ? BigInt(info!.fees[input.asset] || '0') : 0n;
  update(a.id, { via, fee: { relayer: fee.toString(), max: fee.toString(), networkEth: '0' } });
  const need = input.amount + fee;

  // Combine notes first when no one or two of them cover the amount.
  for (;;) {
    const notes = spendable(getState(), input.asset, input.vault);
    if (pick(notes, need)) break;
    const total = notes.reduce((t, n) => t + BigInt(n.amount), 0n);
    if (total < need) throw new Error('Not enough spendable balance in this vault.');
    const two = [...notes].sort((x, y) => (BigInt(x.amount) > BigInt(y.amount) ? -1 : 1)).slice(0, 2);
    update(a.id, { status: 'proving', step: 'Combining notes first', ins: two.map((n) => n.c) });
    await freshTree();
    const sum = two.reduce((t, n) => t + BigInt(n.amount), 0n);
    const tx = await core.prepareTransaction({ tree: mem.tree, keys, token, inputs: two.map(asInput), outputs: [{ ...me, amount: sum - fee }], fee, relayer: info?.address });
    remember(tx.args.outputCommitments.map((c) => ({ c, vault: input.vault })));
    const proof = await prove(tx.input);
    const hash = await submitTx(a.id, via, { ...tx.args, proof }, tx.extData);
    await receipt(hash);
    await sync();
  }

  const inputs = pick(spendable(getState(), input.asset, input.vault), need)!;
  const sum = inputs.reduce((t, n) => t + BigInt(n.amount), 0n);
  const change = sum - need;
  update(a.id, { status: 'proving', step: undefined, ins: inputs.map((n) => n.c), change: change.toString() });
  await freshTree();
  let outputs: core.OutputNote[];
  let vaults: string[];
  let extAmount = 0n;
  let recipient = core.ZERO_ADDRESS;
  if (input.kind === 'send') {
    const to = core.decodeAddress(input.counterparty || '');
    if (!to) throw new Error('That shielded address isn’t valid.');
    outputs = [{ ...to, amount: input.amount, memo: input.memo }, { ...me, amount: change }];
    vaults = [to.pubKey === keys.pubKey ? input.vault : '', input.vault];
  } else if (input.kind === 'move') {
    outputs = [{ ...me, amount: input.amount, memo: 'Vault move' }, { ...me, amount: change }];
    vaults = [input.toVault!, input.vault];
  } else {
    outputs = [{ ...me, amount: change }];
    vaults = [input.vault, input.vault];
    extAmount = -input.amount;
    recipient = input.counterparty as `0x${string}`;
  }
  // Receive as ETH: the proof pays a forwarder that only this order can use (see ZeronymEthExit.sol).
  let order: EthOrder | undefined;
  if (input.kind === 'withdraw' && input.toEth) {
    if (!ETH_EXIT) throw new Error('Receiving ETH isn’t available on this network. Nothing was spent.');
    const q = await quoteToEth(input.asset, input.amount);
    if (q.ethOut < input.toEth.minOut) throw new Error('The ETH price moved since you reviewed this. Nothing was spent. Review it again.');
    // Never accept less than what the person reviewed.
    const minEthOut = q.minOut > input.toEth.minOut ? q.minOut : input.toEth.minOut;
    order = { token, recipient, minEthOut, deadline: BigInt(Math.floor(Date.now() / 1000) + 15 * 60), fee: q.fee, nonce: `0x${hex(crypto.getRandomValues(new Uint8Array(32)))}` };
    recipient = await forwarderOf(order);
    update(a.id, { toEth: { min: minEthOut.toString(), fee: q.fee } });
  }
  const tx = await core.prepareTransaction({ tree: mem.tree, keys, token, inputs: inputs.map(asInput), outputs, extAmount, fee, recipient, relayer: info?.address });
  // Notes sent to someone else are tracked too, so they never look like income.
  const outs = tx.args.outputCommitments.map((c, i) => ({ c, vault: vaults[i] || '-sent' }));
  remember(outs);
  update(a.id, { outs: outs.filter((o) => o.vault !== '-sent').map((o) => o.c) });
  const proof = await prove(tx.input);
  if (input.delayed && via === 'relayer') {
    update(a.id, { status: 'scheduled' });
    await sleep(8000 + Math.round(Math.random() * 12000));
  }
  const hash = await submitTx(a.id, via, { ...tx.args, proof }, tx.extData, order);
  const r = await receipt(hash);
  if (order) {
    const got = ethReceived(r);
    if (got != null) setState((s) => { s.activity = s.activity.map((x) => (x.id === a.id && x.toEth ? { ...x, toEth: { ...x.toEth, got: got.toString() } } : x)); });
  }
  await sync();
  if (input.kind === 'withdraw') void refreshPublic();
}

async function forwarderOf(o: EthOrder): Promise<`0x${string}`> {
  const data = encodeFunctionData({ abi: exitAbi, functionName: 'forwarderOf', args: [o] });
  return decodeFunctionResult({ abi: exitAbi, functionName: 'forwarderOf', data: await call(ETH_EXIT, data) }) as `0x${string}`;
}
/** The ETH the exit contract sent, from its Settled event. */
function ethReceived(r: { logs?: { address: string; topics: string[]; data: string }[] }): bigint | null {
  const log = r.logs?.find((l) => l.address.toLowerCase() === ETH_EXIT.toLowerCase() && l.topics[0] === SETTLED_TOPIC);
  return log ? BigInt('0x' + log.data.slice(2 + 64 * 2, 2 + 64 * 3)) : null;
}

async function submitTx(id: string, via: 'relayer' | 'wallet', args: core.ProofArgs, extData: core.ExtData, order?: EthOrder): Promise<`0x${string}`> {
  let hash: `0x${string}`;
  if (via === 'relayer') {
    update(id, { status: 'submitted' });
    const body = JSON.stringify(order ? { args, extData, exit: order } : { args, extData }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const r = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.txHash) throw new Error(j.message || 'The relayer couldn’t submit it. Nothing was spent.');
    hash = j.txHash;
  } else {
    update(id, { status: 'signing' });
    hash = order
      ? await walletTx(ETH_EXIT, encodeFunctionData({ abi: exitAbi, functionName: 'withdraw', args: [args as any, extData, order] }), EXIT_GAS)
      : await walletTx(POOL_ADDRESS, encodeFunctionData({ abi: poolAbi, functionName: 'transact', args: [args as any, extData] }), TX_GAS);
  }
  setState((s) => { s.activity = s.activity.map((a) => (a.id === id ? { ...a, status: 'confirming', tx: hash, txs: [...(a.txs || []), hash] } : a)); });
  return hash;
}

// ---------- Lifecycle ----------
let timer = 0;
let running = false;
function onVisible() { if (document.visibilityState === 'visible') void sync().catch(() => {}); }
async function resume() {
  // Actions that were mid-flight when the page closed.
  for (const a of getState().activity) {
    if (a.net !== 'testnet' || a.status === 'credited' || a.status === 'failed') continue;
    if (a.status === 'confirming' && a.tx) receipt(a.tx).then(() => sync()).catch((e) => update(a.id, { status: 'failed', at: 'confirming', error: friendly(e) }));
    else update(a.id, { status: 'failed', at: a.status, error: 'The page closed before this was sent. If your wallet sent it anyway, it will show here once it confirms.' });
  }
}
export function startEngine() {
  if (running) return;
  running = true;
  const tick = () => { if (document.visibilityState === 'visible') { void sync().catch((e) => setState((s) => { s.tn = { ...s.tn, error: 'offline' }; }, false)); void refreshPublic().catch(() => {}); } };
  tick();
  void relayerInfo(true);
  void resume();
  timer = window.setInterval(tick, 12_000);
  document.addEventListener('visibilitychange', onVisible);
}
export function stopEngine() {
  running = false;
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
}
export const explorerTx = (h: string) => `${CHAIN.explorer}/tx/${h}`;
export const poolStats = () => ({ commitments: mem.commitments.length, block: mem.block });
export const hexId = () => hex(crypto.getRandomValues(new Uint8Array(6)));

registerEngine({ start, startEngine, stopEngine, feeFor });
