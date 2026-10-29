// Deploys the ETH exit contract (contracts/ZeronymEthExit.sol) to Robinhood Chain mainnet.
// It lets a withdrawal arrive as ETH: the pool pays a one-off forwarder, and the exit contract
// swaps the tokens for ETH on Uniswap in the same transaction. The pool itself doesn't change.
// The exit contract has no owner or admin. It is fixed to the pool in deployments/mainnet.json.
// Run it on your own computer. The deployer key never goes in the project folder, in chat or in CI.
//
//   DRY_RUN=1 node scripts/deploy-eth-exit.mjs     # checks only, sends nothing
//   node scripts/deploy-eth-exit.mjs               # paste the deployer key when asked, type yes
//
// Optional: RPC_URL=https://..., DEPLOYER_KEY_FILE=<file outside this folder> instead of the prompt.
// It reads the pool from deployments/mainnet.json and the Uniswap router and WETH from the site's
// swap settings, checks them on chain,
// deploys, reads the contract back, and adds contracts.ethExit to deployments/mainnet.json.
// Safe to re-run: an exit contract already in the record is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { createWalletClient, createPublicClient, http, formatEther, defineChain, getAddress, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const CHAIN_ID = 4663;
const EXPLORER = 'https://robinhoodchain.blockscout.com';
const OUT = 'deployments/mainnet.json';
const SITE = '../../apps/site/src/data/deployments.mainnet.json';
const DRY = process.env.DRY_RUN === '1';
const fail = (m) => { console.error(`\nStopped: ${m}`); process.exit(1); };
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

// ---- Checks ----
const swap = JSON.parse(readFileSync(SITE, 'utf8')).app?.swap;
if (!swap?.router || !swap?.weth) fail('the site record has no Uniswap settings (app.swap.router and app.swap.weth).');
const ROUTER = getAddress(swap.router);
const WETH = getAddress(swap.weth);

const pub = createPublicClient({ chain, transport: http() });
const chainId = await pub.getChainId();
if (chainId !== CHAIN_ID) fail(`the RPC is on chain ${chainId}, not Robinhood Chain mainnet (${CHAIN_ID}).`);
const routerWeth = await pub.readContract({ address: ROUTER, abi: parseAbi(['function WETH9() view returns (address)']), functionName: 'WETH9' }).catch(() => null);
if (!routerWeth) fail(`${ROUTER} doesn't look like a Uniswap SwapRouter02 on this chain.`);
if (getAddress(routerWeth) !== WETH) fail(`the router's WETH is ${routerWeth}, the site record says ${WETH}.`);
for (const f of ['contracts/ZeronymEthExit.sol']) {
  if (/testnet|prototype|test only|TestDollar/i.test(readFileSync(f, 'utf8'))) fail(`${f} mentions testnet or prototype. Fix its comments first.`);
}

const rec0 = JSON.parse(readFileSync(OUT, 'utf8'));
if (!rec0.contracts?.pool?.address) fail('deployments/mainnet.json has no pool.');
const POOL = getAddress(rec0.contracts.pool.address);
if (!(await pub.getCode({ address: POOL }))) fail(`the pool ${POOL} has no code on this chain.`);
const existing = rec0.contracts?.ethExit?.address;
if (existing && rec0.contracts.ethExit.pool && getAddress(rec0.contracts.ethExit.pool) !== POOL) fail(`the recorded exit contract is for ${rec0.contracts.ethExit.pool}, not the pool ${POOL}. Remove contracts.ethExit from ${OUT} and run this again.`);
if (existing && (await pub.getCode({ address: existing }))) {
  console.log(`The ETH exit contract is already deployed at ${existing}. Nothing to do.`);
  process.exit(0);
}

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

execFileSync('node', ['scripts/compile.mjs'], { stdio: 'inherit' });
const C = JSON.parse(readFileSync('build/contracts.json', 'utf8'));
const balance = await pub.getBalance({ address: account.address });
const gasPrice = await pub.getGasPrice();
const need = 3_000_000n * gasPrice; // about 1.4M gas for the deploy, with margin
console.log(`Deployer  ${account.address}  ${formatEther(balance)} ETH (needs about ${formatEther(need)})`);
console.log(`Pool      ${POOL}`);
console.log(`Router    ${ROUTER} (Uniswap SwapRouter02)`);
console.log(`WETH      ${WETH}`);
if (balance < need) fail('the deployer needs more ETH on Robinhood Chain.');
if (DRY) { console.log('\nDRY_RUN: every check passed. Nothing was sent.'); process.exit(0); }
console.log('\nEvery check passed. Nothing has been sent yet.');
if (process.stdin.isTTY && (await ask('Type yes to deploy the ETH exit contract to Robinhood Chain mainnet: ')).toLowerCase() !== 'yes') { console.log('Cancelled. Nothing was sent.'); process.exit(0); }

// ---- Deploy ----
const wallet = createWalletClient({ chain, transport: http(), account });
const hash = await wallet.deployContract({ abi: C.ZeronymEthExit.abi, bytecode: C.ZeronymEthExit.bytecode, args: [POOL, ROUTER, WETH] });
console.log(`ethExit: tx ${hash}`);
const r = await pub.waitForTransactionReceipt({ hash });
if (r.status !== 'success') fail('the deploy reverted.');
const exit = r.contractAddress;
const read = (functionName) => pub.readContract({ address: exit, abi: C.ZeronymEthExit.abi, functionName });
const [gotPool, gotRouter, gotWeth, impl] = await Promise.all([read('pool'), read('router'), read('weth'), read('forwarderImplementation')]);
if (getAddress(gotPool) !== POOL || getAddress(gotRouter) !== ROUTER || getAddress(gotWeth) !== WETH || !(await pub.getCode({ address: impl }))) fail(`deployed at ${exit}, but reading it back failed. Check it on the explorer.`);

// Re-read the record right before writing, so nothing saved meanwhile is lost.
const rec = JSON.parse(readFileSync(OUT, 'utf8'));
rec.contracts ||= {};
rec.contracts.ethExit = { address: exit.toLowerCase(), deployTx: hash, block: Number(r.blockNumber), explorer: `${EXPLORER}/address/${exit.toLowerCase()}`, pool: POOL.toLowerCase(), router: ROUTER, weth: WETH };
writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n');
console.log(`ethExit: ${exit} (block ${r.blockNumber})`);
console.log(`Saved to ${OUT}. Source for Sourcify: build/standard-input-eth-exit.json.`);
console.log('The address is in deployments/mainnet.json. Delete the deployer key now.');
