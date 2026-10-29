// Withdraw as ETH (ZeronymEthExit), on a local fork of Robinhood Chain mainnet: the deployed
// Zeronym pool, real USDG, real Uniswap pools and real Groth16 proofs.
// Needs the network (it reads mainnet state as it goes). Run: node --test test/eth-exit.test.mjs
// FORK_RPC=https://... picks another Robinhood Chain RPC.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ganache from 'ganache';
import * as snarkjs from 'snarkjs';
import { createPublicClient, createWalletClient, custom, http, getContract, parseAbi, parseUnits, getAddress, keccak256, toHex } from 'viem';
import * as core from '../lib/core.mjs';

const C = JSON.parse(readFileSync(new URL('../build/contracts.json', import.meta.url)));
const MAINNET = JSON.parse(readFileSync(new URL('../deployments/mainnet.json', import.meta.url)));
const WASM = new URL('../build/transaction_js/transaction.wasm', import.meta.url).pathname;
const ZKEY = new URL('../build/tx_final.zkey', import.meta.url).pathname;

const RPC = process.env.FORK_RPC || 'https://rpc.mainnet.chain.robinhood.com';
const USDG = getAddress('0x5fc5360d0400a0fd4f2af552add042d716f1d168');
const ROUTER = getAddress('0xcaf681a66d020601342297493863e78c959e5cb2');
const QUOTER = getAddress('0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7');
const WETH = getAddress('0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73');
const FEE_TIER = 500;

const provider = ganache.provider({ logging: { quiet: true }, fork: { url: RPC }, chain: { hardfork: 'shanghai', chainId: 1337, vmErrorsOnRPCResponse: true }, wallet: { totalAccounts: 4, defaultBalance: 100 }, miner: { defaultTransactionGasLimit: 'estimate' } });
const chain = { id: 1337, name: 'fork', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://x'] } } };
const pub = createPublicClient({ chain, transport: custom(provider) });
const erc = parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address, uint256) returns (bool)']);
const routerAbi = parseAbi(['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256)']);
const quoterAbi = parseAbi(['function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160, uint32, uint256)']);

let accounts, wallet, pool, exit, deployBlock, forkBlock, before_ = [];
// Logs from before the fork come straight from the chain (the fork can't serve old logs).
const live = createPublicClient({ transport: http(RPC) });
const seed = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
const alice = core.keysFromSeeds(seed(), seed());
const usdg = (v) => parseUnits(v, 6);
const relayerFee = usdg('0.5');
const fresh = () => getAddress(keccak256(toHex(seed())).slice(0, 42)); // a new, empty address
const balance = (token, who) => pub.readContract({ address: token, abi: erc, functionName: 'balanceOf', args: [who] });

async function deploy(name, args = []) {
  const hash = await wallet.deployContract({ abi: C[name].abi, bytecode: C[name].bytecode, args, gas: 8_000_000n });
  const r = await pub.waitForTransactionReceipt({ hash });
  assert.equal(r.status, 'success', `${name} deploy failed`);
  return getContract({ address: r.contractAddress, abi: C[name].abi, client: { public: pub, wallet } });
}
async function send(promise) {
  const r = await pub.waitForTransactionReceipt({ hash: await promise });
  assert.equal(r.status, 'success');
  return r;
}
async function rejects(p, reason) {
  await assert.rejects(p, (e) => { assert.match(String(e.shortMessage || '') + ' ' + String(e.details || '') + ' ' + String(e.message), new RegExp(reason)); return true; });
}
const now = async () => (await pub.getBlock()).timestamp;
async function quote(amountIn) {
  const { result } = await pub.simulateContract({ address: QUOTER, abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn: USDG, tokenOut: WETH, amountIn, fee: FEE_TIER, sqrtPriceLimitX96: 0n }] });
  return result[0];
}
async function myNotes() {
  const logs = [...before_, ...(await pub.getLogs({ address: pool.address, fromBlock: forkBlock + 1n, toBlock: 'latest' }))];
  const { commitments, nullifiers } = core.decodePoolLogs(logs);
  const tree = new core.MerkleTree(commitments.map((c) => c.commitment));
  const notes = (await core.findNotes(alice, commitments, nullifiers)).filter((n) => n.amount > 0n && !n.spent);
  return { tree, notes };
}
async function prove(tx) {
  const { proof } = await snarkjs.groth16.fullProve(tx.input, WASM, ZKEY);
  return { ...tx.args, proof: core.packProof(proof) };
}
// A withdrawal of `amount` USDG (plus the relayer fee) to the forwarder of a new order.
async function withdrawal(amount, order = {}) {
  const { tree, notes } = await myNotes();
  const note = notes.find((n) => n.amount >= amount + relayerFee);
  assert.ok(note, 'a note big enough');
  const o = { token: USDG, recipient: fresh(), minEthOut: 0n, deadline: (await now()) + 1800n, fee: FEE_TIER, nonce: keccak256(seed()), ...order };
  const forwarder = await exit.read.forwarderOf([o]);
  const tx = await core.prepareTransaction({
    tree, keys: alice, token: USDG, inputs: [note],
    outputs: [{ amount: note.amount - amount - relayerFee, pubKey: alice.pubKey, encPub: alice.encPub }],
    extAmount: -amount, fee: relayerFee, recipient: forwarder, relayer: accounts[1],
  });
  return { o, forwarder, args: await prove(tx), extData: tx.extData, nullifiers: tx.args.inputNullifiers };
}

describe('Withdraw as ETH (mainnet fork)', () => {
  before(async () => {
    accounts = await provider.request({ method: 'eth_accounts', params: [] });
    wallet = createWalletClient({ chain, transport: custom(provider), account: accounts[0] });
    // The deployed mainnet pool, as recorded in deployments/mainnet.json.
    pool = getContract({ address: MAINNET.contracts.pool.address, abi: C.ZeronymPool.abi, client: { public: pub, wallet } });
    deployBlock = BigInt(MAINNET.contracts.pool.block);
    forkBlock = await pub.getBlockNumber();
    before_ = await live.getLogs({ address: pool.address, fromBlock: deployBlock, toBlock: forkBlock });
    assert.equal(await pool.read.supportedToken([USDG]), true, 'the pool takes USDG');
    exit = await deploy('ZeronymEthExit', [pool.address, ROUTER, WETH]);
    assert.equal((await exit.read.pool()).toLowerCase(), pool.address.toLowerCase());
    // Buy 100 USDG with ETH on Uniswap, then shield it.
    await send(wallet.writeContract({ address: ROUTER, abi: routerAbi, functionName: 'exactInputSingle', value: parseUnits('0.06', 18), args: [{ tokenIn: WETH, tokenOut: USDG, fee: FEE_TIER, recipient: accounts[0], amountIn: parseUnits('0.06', 18), amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] }));
    assert.ok((await balance(USDG, accounts[0])) >= usdg('100'), 'bought USDG');
    await send(wallet.writeContract({ address: USDG, abi: erc, functionName: 'approve', args: [pool.address, usdg('100')] }));
    const { tree } = await myNotes();
    const tx = await core.prepareTransaction({ tree, keys: alice, token: USDG, outputs: [{ amount: usdg('100'), pubKey: alice.pubKey, encPub: alice.encPub }], extAmount: usdg('100') });
    await send(pool.write.transact([await prove(tx), tx.extData], { gas: 3_000_000n }));
  });

  after(async () => {
    await globalThis.curve_bn128?.terminate();
    await Promise.race([provider.disconnect(), new Promise((r) => setTimeout(r, 2000))]);
  });

  test('a relayer withdraws 10 USDG as ETH to a fresh wallet in one transaction', async () => {
    const q = await quote(usdg('10'));
    const w = await withdrawal(usdg('10'), { minEthOut: (q * 995n) / 1000n });
    const relayerBefore = await balance(USDG, accounts[1]);
    const r = await send(exit.write.withdraw([w.args, w.extData, w.o], { account: accounts[1], gas: 2_500_000n }));
    const got = await pub.getBalance({ address: w.o.recipient });
    assert.ok(got >= w.o.minEthOut, `recipient got ${got} wei, at least ${w.o.minEthOut}`);
    assert.equal(got, q, 'exactly the quoted amount (nothing else traded in between)');
    assert.equal(await balance(USDG, accounts[1]) - relayerBefore, relayerFee, 'relayer fee paid in USDG by the pool');
    for (const n of w.nullifiers) assert.equal(await pool.read.isSpent([n]), true);
    // Nothing stays behind.
    for (const who of [w.forwarder, exit.address]) {
      assert.equal(await balance(USDG, who), 0n);
      assert.equal(await balance(WETH, who), 0n);
      assert.equal(await pub.getBalance({ address: who }), 0n);
    }
    console.log(`    10 USDG -> ${Number(got) / 1e18} ETH, gas ${r.gasUsed}`);
  });

  test('if the price moved below the minimum, nothing happens and no note is spent', async () => {
    const q = await quote(usdg('10'));
    const w = await withdrawal(usdg('10'), { minEthOut: q * 2n });
    await rejects(exit.simulate.withdraw([w.args, w.extData, w.o], { account: accounts[1] }), 'Too little received');
    for (const n of w.nullifiers) assert.equal(await pool.read.isSpent([n]), false);
  });

  test('the proof is useless with any other recipient, minimum, deadline, fee tier or nonce', async () => {
    const w = await withdrawal(usdg('5'));
    for (const change of [{ recipient: accounts[2] }, { minEthOut: 1n }, { deadline: w.o.deadline + 1n }, { fee: 3000 }, { nonce: keccak256(seed()) }]) {
      await rejects(exit.simulate.withdraw([w.args, w.extData, { ...w.o, ...change }], { account: accounts[1] }), "recipient is not this order's forwarder");
    }
    // The untouched order does go through.
    await exit.simulate.withdraw([w.args, w.extData, w.o], { account: accounts[1] });
  });

  test('an expired order is refused before anything is spent', async () => {
    const w = await withdrawal(usdg('5'), { deadline: (await now()) - 1n });
    await rejects(exit.simulate.withdraw([w.args, w.extData, w.o], { account: accounts[1] }), 'order expired');
  });

  test('if the proof reaches the pool directly, anyone can settle it to the recipient as ETH', async () => {
    const q = await quote(usdg('5'));
    const w = await withdrawal(usdg('5'), { minEthOut: (q * 99n) / 100n });
    await send(pool.write.transact([w.args, w.extData], { account: accounts[2], gas: 3_000_000n }));
    assert.equal(await balance(USDG, w.forwarder), usdg('5'), 'tokens wait in the forwarder');
    await rejects(exit.simulate.withdraw([w.args, w.extData, w.o], { account: accounts[1] }), 'already spent');
    await send(exit.write.settle([w.o], { account: accounts[3], gas: 1_000_000n }));
    assert.ok((await pub.getBalance({ address: w.o.recipient })) >= w.o.minEthOut);
    assert.equal(await balance(USDG, w.forwarder), 0n);
    await rejects(exit.simulate.settle([w.o], { account: accounts[3] }), 'nothing to settle');
  });

  test('after the deadline, settle sends the USDG itself', async () => {
    const w = await withdrawal(usdg('5'), { minEthOut: 1n, deadline: (await now()) + 60n });
    await send(pool.write.transact([w.args, w.extData], { account: accounts[2], gas: 3_000_000n }));
    await provider.request({ method: 'evm_increaseTime', params: [120] });
    await provider.request({ method: 'evm_mine', params: [] });
    await send(exit.write.settle([w.o], { account: accounts[3], gas: 1_000_000n }));
    assert.equal(await balance(USDG, w.o.recipient), usdg('5'));
    assert.equal(await pub.getBalance({ address: w.o.recipient }), 0n);
  });

  test('a recipient contract that refuses ETH gets WETH', async () => {
    const q = await quote(usdg('5'));
    const w = await withdrawal(usdg('5'), { minEthOut: (q * 99n) / 100n, recipient: pool.address });
    const before = await pub.getBalance({ address: pool.address });
    await send(exit.write.withdraw([w.args, w.extData, w.o], { account: accounts[1], gas: 2_500_000n }));
    assert.ok((await balance(WETH, pool.address)) >= w.o.minEthOut);
    assert.equal(await pub.getBalance({ address: pool.address }), before);
  });

  test('only the exit contract can move a forwarder\'s tokens', async () => {
    const fwd = getContract({ address: await exit.read.forwarderImplementation(), abi: C.ZeronymEthExitForwarder.abi, client: { public: pub, wallet } });
    await rejects(fwd.simulate.sweep([USDG], { account: accounts[2] }), 'only the exit contract');
    await rejects(pub.call({ account: accounts[2], to: exit.address, value: 1n }), 'only WETH');
  });
});
