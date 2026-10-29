// Deploys the Zeronym pool (no external review yet) to Robinhood Chain mainnet (chain ID 4663).
// Run it on your own computer. The deployer key never goes in the project folder, in chat or in CI.
//
//   npm run deploy
//
// It asks for the deployer private key (hidden, never saved), runs every check, shows the plan and
// asks you to type "yes" before sending anything.
// Optional: ADMIN_MULTISIG=0x... (default: the Zeronym Safe), RPC_URL=https://...,
// DEPLOYER_KEY_FILE=<file outside this folder> instead of the prompt, DRY_RUN=1 (checks only).
//
// What it does, in order:
//   1. Checks the chain, the deployer's ETH, the multisig (it must be a contract), USDG, and the
//      setup ceremony (at least 3 contributions + beacon, verified key, matching Verifier.sol).
//   2. Deploys the hasher, the verifier and the pool. The deployer is admin only for step 3.
//      A hasher or verifier already in deployments/mainnet.json is reused, not deployed again.
//   3. Turns USDG deposits on, then hands admin to the multisig and checks it took.
//   4. Writes deployments/mainnet.json and the site's mainnet record.
// Safe to re-run: finished steps are read back from deployments/mainnet.json.
// DRY_RUN=1 runs every check and prints the plan without sending anything.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { createWalletClient, createPublicClient, http, parseUnits, formatEther, formatUnits, defineChain, getAddress, parseAbi, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MerkleTree, hex32 } from '../lib/core.mjs';

const CHAIN_ID = 4663;
const EXPLORER = 'https://robinhoodchain.blockscout.com';
// Paxos USDG on Robinhood Chain (docs.paxos.com, "USDG on mainnet networks"). 6 decimals.
const USDG = getAddress(process.env.TOKEN_ADDRESS || '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168');
const OUT = 'deployments/mainnet.json';
const SITE = '../../apps/site/src/data/deployments.mainnet.json';
const DRY = process.env.DRY_RUN === '1';
// The Zeronym Safe on Robinhood Chain: 2 of 3 owners.
const DEFAULT_ADMIN = '0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3';
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const fail = (m) => { console.error(`\nStopped: ${m}`); process.exit(1); };
// Reads one line from the terminal. With hidden, nothing typed or pasted is shown.
function ask(question, hidden = false) {
  return new Promise((done) => {
    const out = new Writable({ write(chunk, enc, cb) { if (!out.muted) process.stdout.write(chunk, enc); cb(); } });
    out.muted = false;
    const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); done(answer.trim()); });
    out.muted = hidden;
  });
}

const chain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER } },
});

// ---- 1. Checks ----
const keyFile = (process.env.DEPLOYER_KEY_FILE || '').replace(/^~(?=\/)/, homedir());
let rawKey;
if (keyFile) {
  const repo = resolve('../..');
  if (resolve(keyFile).startsWith(repo + '/') || /project-files/.test(resolve(keyFile))) fail('the key file is inside the project. Move it somewhere private first.');
  rawKey = readFileSync(keyFile, 'utf8').trim();
} else {
  if (!process.stdin.isTTY) fail('run this in Terminal so it can ask for the deployer key.');
  rawKey = await ask('Paste the deployer private key and press Enter (hidden, never saved): ', true);
}
rawKey = rawKey.replace(/^0x/i, '');
if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) fail('that is not a private key (it should be 64 letters and numbers, with or without 0x).');
const account = privateKeyToAccount(`0x${rawKey}`);
rawKey = undefined;
const adminInput = process.env.ADMIN_MULTISIG || DEFAULT_ADMIN;
if (!isAddress(adminInput)) fail('ADMIN_MULTISIG is not an address.');
const MULTISIG = getAddress(adminInput);
if (MULTISIG === account.address) fail('the admin must be a multisig, not the deployer.');
// The deployed source is published on Sourcify, so it must not carry prototype notes.
for (const f of ['contracts/ZeronymPool.sol', 'contracts/MerkleTreeWithHistory.sol']) {
  if (/testnet|prototype|test only|TestDollar/i.test(readFileSync(f, 'utf8'))) fail(`${f} still mentions testnet or prototype. Fix its comments first.`);
}

const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ chain, transport: http(), account });
const chainId = await pub.getChainId();
if (chainId !== CHAIN_ID) fail(`the RPC is on chain ${chainId}, not Robinhood Chain mainnet (${CHAIN_ID}).`);
const code = await pub.getCode({ address: MULTISIG });
if (!code || code === '0x') fail(`${MULTISIG} has no contract code on Robinhood Chain. Deploy the multisig there first.`);
const erc = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const [sym, dec] = await Promise.all([pub.readContract({ address: USDG, abi: erc, functionName: 'symbol' }), pub.readContract({ address: USDG, abi: erc, functionName: 'decimals' })])
  .catch(() => fail(`no ERC-20 token at ${USDG} on this chain.`));
if (!process.env.TOKEN_ADDRESS && (sym !== 'USDG' || dec !== 6)) fail(`USDG check failed: ${sym}, ${dec} decimals.`);
if (process.env.TOKEN_ADDRESS) console.warn(`WARNING: TOKEN_ADDRESS override (${sym}). Use this only for a local rehearsal.`);

const T = 'build/ceremony/transcript.json';
if (!existsSync(T)) fail('no setup ceremony found. Run scripts/ceremony.mjs first.');
const cer = JSON.parse(readFileSync(T, 'utf8'));
if ((cer.contributions || []).length < 3 || !cer.beacon || !cer.final) fail('the ceremony needs at least 3 contributions and a final beacon.');
if (sha('build/tx_final.zkey') !== cer.final.zkeySha256) fail('build/tx_final.zkey is not the ceremony result.');
if (sha('build/transaction_js/transaction.wasm') !== cer.final.wasmSha256) fail('the circuit wasm changed since the ceremony.');
if (sha('contracts/Verifier.sol') !== cer.final.verifierSha256) fail('contracts/Verifier.sol was not made from the ceremony key.');
execFileSync('node', ['scripts/compile.mjs'], { stdio: 'inherit' });
const C = JSON.parse(readFileSync('build/contracts.json', 'utf8'));

const balance = await pub.getBalance({ address: account.address });
const gasPrice = await pub.getGasPrice();
const need = 12_000_000n * gasPrice; // hasher + verifier + pool + 2 admin calls, with margin
console.log(`Deployer  ${account.address}  ${formatEther(balance)} ETH (needs about ${formatEther(need)})`);
console.log(`Admin     ${MULTISIG} (multisig)`);
console.log(`Token     USDG ${USDG}, no deposit cap`);
console.log(`Ceremony  ${cer.contributions.length} contributions: ${cer.contributions.map((c) => c.name).join(', ')} + beacon`);
if (balance < need) fail('the deployer needs more ETH on Robinhood Chain.');
if (DRY) { console.log('\nDRY_RUN: every check passed. Nothing was sent.'); process.exit(0); }
console.log('\nEvery check passed. Nothing has been sent yet.');
if (process.stdin.isTTY && (await ask('Type yes to deploy to Robinhood Chain mainnet: ')).toLowerCase() !== 'yes') { console.log('Cancelled. Nothing was sent.'); process.exit(0); }

// ---- 2. Deploy ----
const rec = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
for (const k of ['hasher', 'verifier']) {
  const a = rec.contracts?.[k]?.address;
  if (a && (await pub.getCode({ address: a })) === undefined) fail(`the recorded ${k} ${a} has no code on this chain.`);
}
rec.network = 'robinhood-chain-mainnet'; rec.chainId = CHAIN_ID; rec.audited = false; rec.contracts ||= {};
const save = () => writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n');
async function deploy(key, name, args = []) {
  if (rec.contracts[key]) { console.log(`${key}: already at ${rec.contracts[key].address}`); return rec.contracts[key].address; }
  const hash = await wallet.deployContract({ abi: C[name].abi, bytecode: C[name].bytecode, args });
  console.log(`${key}: tx ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') fail(`${key} deploy reverted`);
  rec.contracts[key] = { address: r.contractAddress, deployTx: hash, block: Number(r.blockNumber), explorer: `${EXPLORER}/address/${r.contractAddress}` };
  save();
  console.log(`${key}: ${r.contractAddress} (block ${r.blockNumber})`);
  return r.contractAddress;
}
const hasher = await deploy('hasher', 'Hasher');
const verifier = await deploy('verifier', 'Groth16Verifier');
const pool = await deploy('pool', 'ZeronymPool', [verifier, hasher, 20, account.address]);
const root = await pub.readContract({ address: pool, abi: C.ZeronymPool.abi, functionName: 'getLastRoot' });
if (root !== hex32(new MerkleTree().root())) fail(`root mismatch: ${root}`);

// ---- 3. USDG, then admin to the multisig ----
const read = (fn, args = []) => pub.readContract({ address: pool, abi: C.ZeronymPool.abi, functionName: fn, args });
async function send(fn, args) {
  const hash = await wallet.writeContract({ address: pool, abi: C.ZeronymPool.abi, functionName: fn, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') fail(`${fn} reverted`);
  console.log(`${fn}: ${hash}`);
  return hash;
}
let admin = getAddress(await read('admin'));
if (admin === account.address) {
  if (!(await read('supportedToken', [USDG]))) rec.adminTxs = { ...rec.adminTxs, setToken: await send('setToken', [USDG, true]) };
  rec.adminTxs = { ...rec.adminTxs, setAdmin: await send('setAdmin', [MULTISIG]) };
  admin = getAddress(await read('admin'));
}
if (admin !== MULTISIG) fail(`the pool admin is ${admin}, not the multisig.`);

// ---- 4. Records ----
rec.status = 'mainnet';
rec.tokens = { USDG: { address: USDG.toLowerCase(), decimals: 6, faucet: false, issuer: 'Paxos' } };
rec.admin = MULTISIG; rec.adminKind = 'multisig'; rec.levels = 20; rec.compiler = C.compiler;
rec.circuit = {
  name: 'transaction(20, 2, 2)', wasmSha256: cer.final.wasmSha256, zkeySha256: cer.final.zkeySha256,
  ptau: 'PSE perpetual powers of tau, ppot_0080_15.ptau (phase 1)',
  phase2: `${cer.contributions.length} contributors (${cer.contributions.map((c) => c.name).join(', ')}) + beacon ${cer.beacon.value}`,
};
rec.deployedAt ||= new Date().toISOString();
delete rec.$comment;
save();

const site = JSON.parse(readFileSync(SITE, 'utf8'));
for (const r of site.records) {
  if (r.id === 'pool' || r.id === 'verifier') Object.assign(r, { address: rec.contracts[r.id].address, chainId: CHAIN_ID, status: 'mainnet', explorer: rec.contracts[r.id].explorer });
  if (r.id === 'admin') r.status = 'mainnet';
}
const a = site.app.chainAssets.find((x) => x.symbol === 'USDG');
Object.assign(a, { address: USDG.toLowerCase() });
delete a.maxDeposit;
writeFileSync(SITE, JSON.stringify(site, null, 2) + '\n');
console.log(`\nDone. Pool ${pool}, admin ${MULTISIG}.\nCheck both on ${EXPLORER}, then build the site with ZERONYM_NETWORK=mainnet.`);
