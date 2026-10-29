// Relayer for the Zeronym pool on Robinhood Chain (testnet or mainnet).
// It submits proved pool transactions and pays the network fee, so the user's wallet
// isn't linked to private sends and withdrawals. The proof fixes the recipient, amount
// and fee, so the relayer can't change them.
// Settings: NETWORK ("mainnet" or "testnet", default testnet), RELAYER_KEY (secret),
// RPC_URL (optional; a provider endpoint, kept secret), RELAYER_FEES (optional JSON of
// symbol -> fee in token base units, e.g. {"USDG":"500000"}).
// Privacy rule: nothing about a request is logged or stored. The IP is used only as a
// transient rate-limit key.
// Receive as ETH: a request may carry an `exit` order. The relayer then calls the ETH exit
// contract (contracts/pool/contracts/ZeronymEthExit.sol), which runs the same pool transaction
// and swaps the withdrawn tokens for ETH in it. The order is bound to the proof through the
// recipient address, so the relayer can't change it either.
import { createPublicClient, createWalletClient, http, parseAbi, defineChain, isAddress, isHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import TESTNET from '../../../contracts/pool/deployments/testnet.json';
import MAINNET from '../../../contracts/pool/deployments/mainnet.json';

const NETWORKS = {
  testnet: { pool: TESTNET, name: 'Robinhood Chain Testnet', rpc: 'https://rpc.testnet.chain.robinhood.com', testnet: true,
    // Test tokens have no value.
    fees: { USDG: 100000n, tUSD: 100000n, tZNYM: 10n ** 18n } },
  mainnet: { pool: MAINNET, name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', testnet: false,
    // 0.50 USDG per private send or withdrawal; it pays the relayer's gas.
    fees: { USDG: 500000n } },
};
const MIN_ETH = 30_000_000_000_000n; // keep enough for a couple of transactions
const PROOF = '(bytes proof, bytes32 root, bytes32[2] inputNullifiers, bytes32[2] outputCommitments, uint256 publicAmount, bytes32 extDataHash)';
const EXT = '(address recipient, int256 extAmount, address relayer, uint256 fee, bytes encryptedOutput1, bytes encryptedOutput2, address token)';
const ORDER = '(address token, address recipient, uint256 minEthOut, uint256 deadline, uint24 fee, bytes32 nonce)';
const abi = parseAbi([`function transact(${PROOF} _args, ${EXT} _extData)`]);
const exitAbi = parseAbi([`function withdraw(${PROOF} args, ${EXT} extData, ${ORDER} o) returns (uint256)`]);
const TX_GAS = 1_600_000n;
const EXIT_GAS = 2_500_000n; // pool transaction plus the swap: about 1.4M

function setup(env) {
  const net = env.NETWORK === 'mainnet' ? NETWORKS.mainnet : NETWORKS.testnet;
  const POOL = net.pool;
  const chain = defineChain({
    id: POOL.chainId,
    name: net.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [env.RPC_URL || net.rpc] } },
    testnet: net.testnet,
  });
  let fees = net.fees;
  if (env.RELAYER_FEES) {
    try { fees = Object.fromEntries(Object.entries(JSON.parse(env.RELAYER_FEES)).map(([k, v]) => [k, BigInt(v)])); } catch { /* keep defaults */ }
  }
  const tokens = Object.fromEntries(Object.entries(POOL.tokens || {}).map(([sym, t]) => [t.address.toLowerCase(), sym]));
  return { net, chain, pool: POOL.contracts?.pool?.address, exit: POOL.contracts?.ethExit?.address, fees, tokens, label: net.testnet ? 'testnet ' : '' };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const b32 = (v) => typeof v === 'string' && isHex(v) && v.length === 66;
const big = (v) => { if (typeof v !== 'string' || !/^-?\d{1,80}$/.test(v)) throw new Error('number'); return BigInt(v); };

function parse(body) {
  const { args, extData } = body || {};
  if (!args || !extData) throw new Error('shape');
  if (!isHex(args.proof) || args.proof.length !== 2 + 64 * 8) throw new Error('proof');
  if (!b32(args.root) || !b32(args.extDataHash)) throw new Error('root');
  if (!Array.isArray(args.inputNullifiers) || args.inputNullifiers.length !== 2 || !args.inputNullifiers.every(b32)) throw new Error('nullifiers');
  if (!Array.isArray(args.outputCommitments) || args.outputCommitments.length !== 2 || !args.outputCommitments.every(b32)) throw new Error('commitments');
  for (const k of ['recipient', 'relayer', 'token']) if (!isAddress(extData[k])) throw new Error(k);
  for (const k of ['encryptedOutput1', 'encryptedOutput2']) if (!isHex(extData[k]) || extData[k].length > 2 + 2 * 512) throw new Error(k);
  let exit;
  if (body.exit != null) {
    const o = body.exit;
    for (const k of ['token', 'recipient']) if (!isAddress(o?.[k])) throw new Error(`exit.${k}`);
    if (!b32(o.nonce) || !Number.isInteger(o.fee) || o.fee <= 0 || o.fee >= 2 ** 24) throw new Error('exit');
    exit = { token: o.token, recipient: o.recipient, minEthOut: big(o.minEthOut), deadline: big(o.deadline), fee: o.fee, nonce: o.nonce };
  }
  return {
    args: { ...args, publicAmount: big(args.publicAmount) },
    extData: { ...extData, extAmount: big(extData.extAmount), fee: big(extData.fee) },
    exit,
  };
}

function reason(e) {
  const m = String(e?.shortMessage || e?.details || e?.message || e);
  if (/already spent/i.test(m)) return 'One of these notes was already spent. Nothing new was spent.';
  if (/Invalid merkle root/i.test(m)) return 'The pool moved on while this was being built. Try again.';
  if (/Invalid transaction proof/i.test(m)) return 'The proof didn’t verify, so it wasn’t submitted.';
  if (/external data hash|not this order's forwarder/i.test(m)) return 'The transaction details don’t match the proof, so it wasn’t submitted.';
  if (/Too little received|too little ETH/i.test(m)) return 'The ETH price moved, so the swap would give less than the minimum. Nothing was spent. Try again.';
  if (/order expired/i.test(m)) return 'The ETH price this was built on expired. Nothing was spent. Try again.';
  return 'The transaction would fail, so it wasn’t submitted. Nothing was spent.';
}

/** The relayer's address, so fee transfers to it can be told apart from withdrawals. */
export function relayerAddress(env) {
  if (!env.RELAYER_KEY) return '';
  const rawKey = env.RELAYER_KEY.trim();
  return privateKeyToAccount(rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`).address;
}

export async function relay(request, env) {
  const { chain, pool, exit, fees, tokens, label, net } = setup(env);
  if (!pool) return json(503, { message: 'The pool isn’t deployed on this network yet.' });
  if (!env.RELAYER_KEY) return json(503, { message: `The ${label}relayer is not set up.` });
  const rawKey = env.RELAYER_KEY.trim();
  const account = privateKeyToAccount(rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`);
  const pub = createPublicClient({ chain, transport: http() });

  if (request.method === 'GET') {
    const bal = await pub.getBalance({ address: account.address }).catch(() => 0n);
    if (bal < MIN_ETH) return json(503, { message: `The ${label}relayer is out of gas.` });
    return json(200, { address: account.address, chainId: chain.id, pool, ...(exit ? { ethExit: exit } : {}), fees: Object.fromEntries(Object.entries(fees).map(([k, v]) => [k, v.toString()])), network: net.testnet ? 'testnet' : 'mainnet' });
  }
  if (request.method !== 'POST') return json(405, { message: 'Use GET or POST.' });

  if (env.RELAY_LIMIT) {
    const { success } = await env.RELAY_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
    if (!success) return json(429, { message: 'Too many requests. Wait a minute and try again.' });
  }
  let tx;
  try { tx = parse(await request.json()); } catch { return json(400, { message: 'That request isn’t a valid pool transaction.' }); }
  const { args, extData, exit: order } = tx;
  const sym = tokens[extData.token.toLowerCase()];
  if (!sym || fees[sym] == null) return json(400, { message: 'That token isn’t supported by the pool.' });
  if (extData.relayer.toLowerCase() !== account.address.toLowerCase()) return json(400, { message: 'The proof names a different relayer.' });
  if (extData.fee < fees[sym]) return json(400, { message: 'The fee in the proof is below the relayer fee.' });
  // A deposit would take tokens from the relayer itself.
  if (extData.extAmount > 0n) return json(400, { message: 'Deposits are sent from your own wallet, not the relayer.' });

  if (order) {
    if (!exit) return json(400, { message: 'Receiving ETH isn’t set up on this network.' });
    if (order.token.toLowerCase() !== extData.token.toLowerCase()) return json(400, { message: 'That ETH order is for a different token.' });
    if (extData.extAmount >= 0n) return json(400, { message: 'Only a withdrawal can be received as ETH.' });
  }
  // With an ETH order the exit contract makes the pool call; it checks the order against the proof.
  const call = order
    ? { address: exit, abi: exitAbi, functionName: 'withdraw', args: [args, extData, order], gas: EXIT_GAS }
    : { address: pool, abi, functionName: 'transact', args: [args, extData], gas: TX_GAS };
  try {
    await pub.simulateContract({ ...call, gas: undefined, account });
  } catch (e) {
    return json(400, { message: reason(e) });
  }
  const wallet = createWalletClient({ chain, transport: http(), account });
  const txHash = await wallet.writeContract(call);
  return json(200, { txHash });
}
