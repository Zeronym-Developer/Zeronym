// Deploys the Zeronym pool to Robinhood Chain testnet (chain ID 46630).
// TESTNET ONLY. Mainnet deploys use a hardware wallet or multisig, never this script's key.
// Usage: DEPLOYER_KEY_FILE=/path/to/key node scripts/deploy-testnet.mjs
// Safe to re-run: finished steps are read back from deployments/testnet.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash as hash256 } from 'node:crypto';
import { createWalletClient, createPublicClient, http, parseUnits, formatEther, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MerkleTree, hex32 } from '../lib/core.mjs';

const chain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' } },
  testnet: true,
});
const EXPLORER = chain.blockExplorers.default.url;
const OUT = 'deployments/testnet.json';
const C = JSON.parse(readFileSync('build/contracts.json', 'utf8'));
const TZNYM = JSON.parse(readFileSync('../token/deployments/testnet.json', 'utf8'));
const sha = (f) => hash256('sha256').update(readFileSync(f)).digest('hex');

const account = privateKeyToAccount(readFileSync(process.env.DEPLOYER_KEY_FILE, 'utf8').trim());
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ chain, transport: http(), account });

const chainId = await pub.getChainId();
if (chainId !== 46630) throw new Error(`Wrong chain: ${chainId}`);
const balance = await pub.getBalance({ address: account.address });
console.log(`Deployer ${account.address}, balance ${formatEther(balance)} ETH`);
if (balance === 0n) throw new Error('Deployer has no testnet ETH.');

mkdirSync('deployments', { recursive: true });
const rec = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { network: 'robinhood-chain-testnet', chainId, status: 'testnet', audited: false, contracts: {} };
const save = () => writeFileSync(OUT, JSON.stringify(rec, null, 2));

async function deploy(key, name, args = []) {
  if (rec.contracts[key]) { console.log(`${key}: already at ${rec.contracts[key].address}`); return rec.contracts[key].address; }
  const hash = await wallet.deployContract({ abi: C[name].abi, bytecode: C[name].bytecode, args });
  console.log(`${key}: tx ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${key} deploy reverted`);
  rec.contracts[key] = { address: r.contractAddress, deployTx: hash, block: Number(r.blockNumber), explorer: `${EXPLORER}/address/${r.contractAddress}` };
  save();
  console.log(`${key}: ${r.contractAddress} (block ${r.blockNumber}, gas ${r.gasUsed})`);
  return r.contractAddress;
}

const hasher = await deploy('hasher', 'Hasher');
const verifier = await deploy('verifier', 'Groth16Verifier');
const tusd = await deploy('testDollar', 'TestDollar');
const pool = await deploy('pool', 'ZeronymPool', [verifier, hasher, 20, account.address]);

// The pool's empty root must match the client library, or no proof will ever verify.
const root = await pub.readContract({ address: pool, abi: C.ZeronymPool.abi, functionName: 'getLastRoot' });
if (root !== hex32(new MerkleTree().root())) throw new Error(`Root mismatch: ${root}`);

const tokens = [
  { symbol: 'tUSD', address: tusd, decimals: 6, maxDeposit: parseUnits('10000', 6), faucet: true },
  { symbol: 'tZNYM', address: TZNYM.address, decimals: 18, maxDeposit: parseUnits('1000000', 18), faucet: false },
];
rec.tokens = rec.tokens || {};
for (const t of tokens) {
  const ok = await pub.readContract({ address: pool, abi: C.ZeronymPool.abi, functionName: 'supportedToken', args: [t.address] });
  if (!ok) {
    const hash = await wallet.writeContract({ address: pool, abi: C.ZeronymPool.abi, functionName: 'setToken', args: [t.address, true] });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== 'success') throw new Error(`setToken ${t.symbol} reverted`);
    console.log(`setToken ${t.symbol}: ${hash}`);
  }
  rec.tokens[t.symbol] = { address: t.address, decimals: t.decimals, maxDeposit: t.maxDeposit.toString(), faucet: t.faucet };
}

rec.admin = account.address;
rec.levels = 20;
rec.compiler = C.compiler;
rec.circuit = {
  name: 'transaction(20, 2, 2)',
  wasmSha256: sha('build/transaction_js/transaction.wasm'),
  zkeySha256: sha('build/tx_final.zkey'),
  ptau: 'PSE perpetual powers of tau, ppot_0080_15.ptau (phase 1)',
  phase2: 'single contributor, testnet only',
};
rec.deployedAt = rec.deployedAt || new Date().toISOString();
save();
console.log(JSON.stringify(rec, null, 2));
