// Build check for the deployment record (PRD R1.6).
// Fails the build when an address is malformed, a status is unknown,
// or a testnet record would ship in a production build.
import { readFileSync } from 'node:fs';

// ZERONYM_NETWORK=mainnet checks the mainnet record, which is always a production build.
const isMainnet = process.env.ZERONYM_NETWORK === 'mainnet';
const file = new URL(isMainnet ? '../src/data/deployments.mainnet.json' : '../src/data/deployments.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const allowed = new Set(['not-published', 'planned', 'testnet', 'mainnet']);
const isProduction = isMainnet || process.env.ZERONYM_ENV === 'production';
const errors = [];

if (isMainnet) {
  // The app needs a deployed pool: its address, block and the prover files' hashes.
  const pool = JSON.parse(readFileSync(new URL('../../../contracts/pool/deployments/mainnet.json', import.meta.url), 'utf8'));
  if (pool.chainId !== 4663) errors.push(`pool record: chain ID ${pool.chainId}, expected 4663`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool.contracts?.pool?.address || '')) errors.push('pool record: the mainnet pool is not deployed yet (run contracts/pool/scripts/deploy-mainnet.mjs)');
  if (!pool.circuit?.wasmSha256 || !pool.circuit?.zkeySha256) errors.push('pool record: no prover file hashes');
  if (pool.circuit && /single contributor/i.test(pool.circuit.phase2 || '')) errors.push('pool record: a single-contributor setup is testnet only');
  if (data.hostChain?.chainId !== 4663) errors.push(`site record: chain ID ${data.hostChain?.chainId}, expected 4663`);
  for (const r of ['pool', 'verifier']) {
    const rec = data.records.find((x) => x.id === r);
    const want = pool.contracts?.[r]?.address?.toLowerCase();
    if (want && rec?.address?.toLowerCase() !== want) errors.push(`${r}: site record ${rec?.address || 'empty'} doesn't match the pool record ${want}`);
  }
  // Receive as ETH: the exit contract must use the same Uniswap router and WETH as the app's swaps.
  const exit = pool.contracts?.ethExit;
  if (exit) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(exit.address || '')) errors.push('pool record: malformed ethExit address');
    if (exit.pool?.toLowerCase() !== pool.contracts?.pool?.address?.toLowerCase()) errors.push(`ethExit: made for pool ${exit.pool || '(none)'}, not ${pool.contracts?.pool?.address}`);
    const swap = data.app.swap;
    if (!swap) errors.push('ethExit is set but the site record has no swap settings');
    else if (exit.router?.toLowerCase() !== swap.router?.toLowerCase() || exit.weth?.toLowerCase() !== swap.weth?.toLowerCase()) errors.push('ethExit: its router or WETH differs from the site swap settings');
  }
  for (const a of data.app.chainAssets) {
    const t = pool.tokens?.[a.symbol];
    if (!t || t.address.toLowerCase() !== a.address?.toLowerCase() || t.decimals !== a.decimals) errors.push(`asset ${a.symbol}: doesn't match the pool record`);
    if (a.faucet || a.faucetUrl) errors.push(`asset ${a.symbol}: no faucets on mainnet`);
  }
  // The public check script (public/verify/verify-mainnet.mjs) carries its own copy of the record.
  const script = readFileSync(new URL('../public/verify/verify-mainnet.mjs', import.meta.url), 'utf8').toLowerCase();
  const want = [pool.contracts.pool.address, pool.contracts.verifier.address, pool.admin, String(pool.contracts.pool.block), ...Object.values(pool.tokens).map((t) => t.address)];
  for (const v of want) if (!script.includes(String(v).toLowerCase())) errors.push(`public/verify/verify-mainnet.mjs: missing ${v} from the pool record`);
}

for (const r of data.records) {
  if (!allowed.has(r.status)) errors.push(`${r.id}: unknown status "${r.status}"`);
  if (r.address != null && !/^0x[0-9a-fA-F]{40}$/.test(r.address)) errors.push(`${r.id}: malformed address`);
  if ((r.status === 'testnet' || r.status === 'mainnet') && 'address' in r && !r.address) errors.push(`${r.id}: status ${r.status} needs an address`);
  if (isProduction && r.status === 'testnet') errors.push(`${r.id}: testnet record in a production build`);
}
if (errors.length) {
  console.error('Deployment record check failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`Deployment record OK (${isMainnet ? 'mainnet' : 'testnet'}, ${data.records.length} records, ${isProduction ? 'production' : 'preview'} build).`);
