// End-to-end pool tests on a local ganache chain, with real Groth16 proofs.
// Run: npm test   (takes about a minute: each transaction is proved for real)
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ganache from 'ganache';
import * as snarkjs from 'snarkjs';
import { createPublicClient, createWalletClient, custom, getContract, parseUnits } from 'viem';
import * as core from '../lib/core.mjs';

const C = JSON.parse(readFileSync(new URL('../build/contracts.json', import.meta.url)));
const WASM = new URL('../build/transaction_js/transaction.wasm', import.meta.url).pathname;
const ZKEY = new URL('../build/tx_final.zkey', import.meta.url).pathname;
const VKEY = JSON.parse(readFileSync(new URL('../build/verification_key.json', import.meta.url)));

const provider = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai', chainId: 1337, vmErrorsOnRPCResponse: true }, wallet: { totalAccounts: 5, defaultBalance: 1000 }, miner: { defaultTransactionGasLimit: 'estimate' } });
const chain = { id: 1337, name: 'ganache', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://x'] } } };
const pub = createPublicClient({ chain, transport: custom(provider) });
let accounts, wallet, pool, usd, deployBlock;
const seed = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
const alice = core.keysFromSeeds(seed(), seed());
const bob = core.keysFromSeeds(seed(), seed());

async function deploy(name, args = [], from) {
  const hash = await wallet.deployContract({ abi: C[name].abi, bytecode: C[name].bytecode, args, account: from, gas: 8_000_000n });
  const r = await pub.waitForTransactionReceipt({ hash });
  assert.equal(r.status, 'success', `${name} deploy failed`);
  return getContract({ address: r.contractAddress, abi: C[name].abi, client: { public: pub, wallet } });
}

async function send(promise) {
  const r = await pub.waitForTransactionReceipt({ hash: await promise });
  assert.equal(r.status, 'success');
  return r;
}

async function scan() {
  const logs = await pub.getLogs({ address: pool.address, fromBlock: deployBlock, toBlock: 'latest' });
  const { commitments, nullifiers } = core.decodePoolLogs(logs);
  const tree = new core.MerkleTree(commitments.map((c) => c.commitment));
  return { commitments, nullifiers, tree };
}

async function prove(tx) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(tx.input, WASM, ZKEY);
  // The contract passes public inputs in this exact order.
  const expected = [tx.input.root, tx.input.publicAmount, tx.input.extDataHash, tx.input.asset, ...tx.input.inputNullifier, ...tx.input.outputCommitment];
  assert.deepEqual(publicSignals, expected, 'public signal order');
  assert.ok(await snarkjs.groth16.verify(VKEY, publicSignals, proof), 'proof verifies off chain');
  return { ...tx.args, proof: core.packProof(proof) };
}

async function transact(params, from = accounts[0]) {
  const { tree } = await scan();
  const tx = await core.prepareTransaction({ tree, token: usd.address, ...params });
  const args = await prove(tx);
  return {
    tx, args,
    run: (ext = tx.extData, a = args) => pool.write.transact([a, ext], { account: from, gas: 3_000_000n }),
    // A dry run (eth_call) returns the revert reason directly.
    sim: (ext = tx.extData, a = args) => pool.simulate.transact([a, ext], { account: from }),
  };
}

async function rejects(p, reason) {
  await assert.rejects(p, (e) => { assert.match(String(e.shortMessage || '') + ' ' + String(e.details || '') + ' ' + String(e.message), new RegExp(reason)); return true; });
}

describe('Zeronym pool', () => {
  before(async () => {
    accounts = await provider.request({ method: 'eth_accounts', params: [] });
    wallet = createWalletClient({ chain, transport: custom(provider), account: accounts[0] });
    const hasher = await deploy('Hasher');
    const verifier = await deploy('Groth16Verifier');
    usd = await deploy('TestDollar');
    pool = await deploy('ZeronymPool', [verifier.address, hasher.address, 20, accounts[0]]);
    deployBlock = await pub.getBlockNumber();
    await send(pool.write.setToken([usd.address, true]));
    await send(usd.write.faucet());
    await send(usd.write.approve([pool.address, 2n ** 256n - 1n]));
  });

  // snarkjs keeps worker threads alive; close them and the chain so the run exits.
  after(async () => {
    await globalThis.curve_bn128?.terminate();
    await Promise.race([provider.disconnect(), new Promise((r) => setTimeout(r, 2000))]);
  });

  test('empty tree root matches the contract', async () => {
    assert.equal(core.hex32(new core.MerkleTree().root()), await pool.read.getLastRoot());
  });

  test('shield 100 tUSD', async () => {
    const amount = parseUnits('100', 6);
    const { run } = await transact({ keys: alice, outputs: [{ amount, pubKey: alice.pubKey, encPub: alice.encPub, memo: 'first shield' }], extAmount: amount });
    await send(run());
    assert.equal(await usd.read.balanceOf([pool.address]), amount);
    const { commitments, nullifiers, tree } = await scan();
    assert.equal(core.hex32(tree.root()), await pool.read.getLastRoot(), 'local root = contract root');
    const notes = (await core.findNotes(alice, commitments, nullifiers)).filter((n) => n.amount > 0n);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].amount, amount);
    assert.equal(notes[0].memo, 'first shield');
    assert.equal(notes[0].spent, false);
    assert.equal((await core.findNotes(bob, commitments, nullifiers)).length, 0, 'bob sees nothing');
  });

  test('there is no deposit cap: a 10,001 tUSD deposit passes every check', async () => {
    // The faucet drips 1,000 per hour, so move the clock forward to collect enough.
    for (let i = 0; i < 10; i++) {
      await provider.request({ method: 'evm_increaseTime', params: [3601] });
      await provider.request({ method: 'evm_mine', params: [] });
      await send(usd.write.faucet());
    }
    const amount = parseUnits('10001', 6);
    const { sim } = await transact({ keys: alice, outputs: [{ amount, pubKey: alice.pubKey, encPub: alice.encPub }], extAmount: amount });
    await sim();
    assert.ok(!C.ZeronymPool.abi.some((x) => x.name === 'maxDeposit'), 'the pool has no cap setting');
  });

  test('private send 30 tUSD to bob, with change', async () => {
    const { commitments, nullifiers } = await scan();
    const [note] = (await core.findNotes(alice, commitments, nullifiers)).filter((n) => n.amount > 0n && !n.spent);
    const thirty = parseUnits('30', 6);
    const { run } = await transact({
      keys: alice, inputs: [note],
      outputs: [{ amount: thirty, pubKey: bob.pubKey, encPub: bob.encPub, memo: 'for bob' }, { amount: note.amount - thirty, pubKey: alice.pubKey, encPub: alice.encPub }],
    });
    const before = await usd.read.balanceOf([pool.address]);
    await send(run());
    assert.equal(await usd.read.balanceOf([pool.address]), before, 'no tokens leave the pool');
    const s = await scan();
    const bobNotes = (await core.findNotes(bob, s.commitments, s.nullifiers)).filter((n) => n.amount > 0n);
    assert.equal(bobNotes.length, 1);
    assert.equal(bobNotes[0].amount, thirty);
    assert.equal(bobNotes[0].memo, 'for bob');
    const aliceLive = (await core.findNotes(alice, s.commitments, s.nullifiers)).filter((n) => n.amount > 0n && !n.spent);
    assert.deepEqual(aliceLive.map((n) => n.amount), [parseUnits('70', 6)]);
  });

  test('spending the same note twice is rejected', async () => {
    const s = await scan();
    const [spent] = (await core.findNotes(alice, s.commitments, s.nullifiers)).filter((n) => n.amount === parseUnits('100', 6));
    assert.equal(spent.spent, true);
    const { sim } = await transact({ keys: alice, inputs: [spent], outputs: [{ amount: spent.amount, pubKey: alice.pubKey, encPub: alice.encPub }] });
    await rejects(sim(), 'already spent');
  });

  test('changing the recipient after proving is rejected', async () => {
    const s = await scan();
    const [note] = (await core.findNotes(bob, s.commitments, s.nullifiers)).filter((n) => n.amount > 0n && !n.spent);
    const { tx, sim } = await transact({ keys: bob, inputs: [note], extAmount: -note.amount, recipient: accounts[3] });
    await rejects(sim({ ...tx.extData, recipient: accounts[4] }), 'external data hash');
  });

  test('a proof for one token cannot move another', async () => {
    const other = await deploy('TestDollar');
    await send(pool.write.setToken([other.address, true]));
    const s = await scan();
    const [note] = (await core.findNotes(bob, s.commitments, s.nullifiers)).filter((n) => n.amount > 0n && !n.spent);
    const { tx, args, sim } = await transact({ keys: bob, inputs: [note], extAmount: -note.amount, recipient: accounts[3] });
    await rejects(sim({ ...tx.extData, token: other.address }, args), 'external data hash');
    // Even with a matching extData hash, the proof is bound to the original token.
    const ext = { ...tx.extData, token: other.address };
    await rejects(sim(ext, { ...args, extDataHash: core.hex32(core.extDataHash(ext)) }), 'Invalid transaction proof');
  });

  test('turning a token off stops deposits but never withdrawals', async () => {
    const other = await deploy('TestDollar');
    await send(other.write.faucet());
    await send(other.write.approve([pool.address, 2n ** 256n - 1n]));
    await send(pool.write.setToken([other.address, true]));
    const five = parseUnits('5', 6);
    const { tree } = await scan();
    const dep = await core.prepareTransaction({ tree, keys: alice, token: other.address, outputs: [{ amount: five, pubKey: alice.pubKey, encPub: alice.encPub }], extAmount: five });
    await send(pool.write.transact([await prove(dep), dep.extData], { gas: 3_000_000n }));
    await send(pool.write.setToken([other.address, false]));
    const s = await scan();
    const [note] = (await core.findNotes(alice, s.commitments, s.nullifiers)).filter((n) => n.asset === BigInt(other.address) && n.amount > 0n && !n.spent);
    const again = await core.prepareTransaction({ tree: s.tree, keys: alice, token: other.address, outputs: [{ amount: five, pubKey: alice.pubKey, encPub: alice.encPub }], extAmount: five });
    await rejects(pool.simulate.transact([await prove(again), again.extData], { account: accounts[0] }), 'token not supported');
    const out = await core.prepareTransaction({ tree: s.tree, keys: alice, token: other.address, inputs: [note], extAmount: -five, recipient: accounts[4] });
    await send(pool.write.transact([await prove(out), out.extData], { gas: 3_000_000n }));
    assert.equal(await other.read.balanceOf([accounts[4]]), five);
  });

  test('bob withdraws 30 tUSD through a relayer that takes a 1 tUSD fee', async () => {
    const s = await scan();
    const [note] = (await core.findNotes(bob, s.commitments, s.nullifiers)).filter((n) => n.amount > 0n && !n.spent);
    const fee = parseUnits('1', 6);
    const [, relayer, , recipient] = accounts;
    const { run } = await transact({ keys: bob, inputs: [note], extAmount: fee - note.amount, fee, recipient, relayer }, relayer);
    await send(run());
    assert.equal(await usd.read.balanceOf([recipient]), parseUnits('29', 6));
    assert.equal(await usd.read.balanceOf([relayer]), fee);
    assert.equal(await usd.read.balanceOf([pool.address]), parseUnits('70', 6));
    const after = await scan();
    assert.equal(core.hex32(after.tree.root()), await pool.read.getLastRoot());
    assert.equal((await core.findNotes(bob, after.commitments, after.nullifiers)).filter((n) => n.amount > 0n && !n.spent).length, 0);
  });

  test('alice withdraws everything, joining two notes', async () => {
    const s = await scan();
    const live = (await core.findNotes(alice, s.commitments, s.nullifiers)).filter((n) => !n.spent).sort((a, b) => Number(b.amount - a.amount)).slice(0, 2);
    const total = live.reduce((t, n) => t + n.amount, 0n);
    const recipient = accounts[2];
    const { run } = await transact({ keys: alice, inputs: live, extAmount: -total, recipient });
    await send(run());
    assert.equal(await usd.read.balanceOf([recipient]), parseUnits('70', 6));
    assert.equal(await usd.read.balanceOf([pool.address]), 0n);
  });
});
