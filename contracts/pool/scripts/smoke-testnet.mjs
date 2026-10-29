// Live check of the deployed testnet pool: faucet, shield, private send, withdraw.
// Uses throwaway shielded keys and the testnet deployer wallet. TESTNET ONLY.
// Usage: DEPLOYER_KEY_FILE=/path/to/key node scripts/smoke-testnet.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as snarkjs from 'snarkjs';
import * as core from '../lib/core.mjs';

const chain = defineChain({ id: 46630, name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } } });
const D = JSON.parse(readFileSync('deployments/testnet.json', 'utf8'));
const C = JSON.parse(readFileSync('build/contracts.json', 'utf8'));
const account = privateKeyToAccount(readFileSync(process.env.DEPLOYER_KEY_FILE, 'utf8').trim());
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ chain, transport: http(), account });
const POOL = D.contracts.pool.address;
const USD = D.tokens.tUSD.address;
const seed = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
const a = core.keysFromSeeds(seed(), seed());
const b = core.keysFromSeeds(seed(), seed());
const log = [];

async function wait(hash, label) {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${label} reverted`);
  console.log(`${label}: ${hash} (gas ${r.gasUsed})`);
  log.push({ step: label, tx: hash, gasUsed: r.gasUsed.toString() });
  return r;
}
async function scan() {
  const logs = await pub.getLogs({ address: POOL, fromBlock: BigInt(D.contracts.pool.block), toBlock: 'latest' });
  const { commitments, nullifiers } = core.decodePoolLogs(logs);
  const tree = new core.MerkleTree(commitments.map((c) => c.commitment));
  const onChain = await pub.readContract({ address: POOL, abi: C.ZeronymPool.abi, functionName: 'getLastRoot' });
  if (core.hex32(tree.root()) !== onChain) throw new Error('Local tree root differs from the contract');
  return { commitments, nullifiers, tree };
}
const live = async (keys) => { const s = await scan(); return (await core.findNotes(keys, s.commitments, s.nullifiers)).filter((n) => n.amount > 0n && !n.spent); };
async function transact(label, params) {
  const { tree } = await scan();
  const tx = await core.prepareTransaction({ tree, token: USD, ...params });
  const t0 = Date.now();
  const { proof } = await snarkjs.groth16.fullProve(tx.input, 'build/transaction_js/transaction.wasm', 'build/tx_final.zkey');
  console.log(`${label}: proved in ${Date.now() - t0} ms`);
  const args = { ...tx.args, proof: core.packProof(proof) };
  await pub.simulateContract({ address: POOL, abi: C.ZeronymPool.abi, functionName: 'transact', args: [args, tx.extData], account });
  return wait(await wallet.writeContract({ address: POOL, abi: C.ZeronymPool.abi, functionName: 'transact', args: [args, tx.extData] }), label);
}

const usd = (fn, args = []) => pub.readContract({ address: USD, abi: C.TestDollar.abi, functionName: fn, args });
const last = await usd('lastDrip', [account.address]);
if (BigInt(Math.floor(Date.now() / 1000)) >= last + 3600n) await wait(await wallet.writeContract({ address: USD, abi: C.TestDollar.abi, functionName: 'faucet' }), 'faucet');
if ((await usd('allowance', [account.address, POOL])) < parseUnits('10', 6)) await wait(await wallet.writeContract({ address: USD, abi: C.TestDollar.abi, functionName: 'approve', args: [POOL, parseUnits('1000000', 6)] }), 'approve');

const ten = parseUnits('10', 6);
await transact('shield 10 tUSD', { keys: a, outputs: [{ amount: ten, pubKey: a.pubKey, encPub: a.encPub }], extAmount: ten });
const [n1] = await live(a);
const four = parseUnits('4', 6);
await transact('private send 4 tUSD', { keys: a, inputs: [n1], outputs: [{ amount: four, pubKey: b.pubKey, encPub: b.encPub }, { amount: n1.amount - four, pubKey: a.pubKey, encPub: a.encPub }] });
const [bn] = await live(b);
if (bn?.amount !== four) throw new Error('Recipient did not find the 4 tUSD note');
const [n2] = await live(a);
const before = await usd('balanceOf', [account.address]);
await transact('withdraw 6 tUSD', { keys: a, inputs: [n2], extAmount: -n2.amount, recipient: account.address });
const got = (await usd('balanceOf', [account.address])) - before;
if (got !== parseUnits('6', 6)) throw new Error(`Withdrawal paid ${got}`);
console.log(`OK. Recipient note found: ${formatUnits(bn.amount, 6)} tUSD. Withdrawal paid ${formatUnits(got, 6)} tUSD.`);
writeFileSync('deployments/testnet-smoke.json', JSON.stringify({ checkedAt: new Date().toISOString(), pool: POOL, steps: log, result: 'ok' }, null, 2));
await globalThis.curve_bn128?.terminate();
