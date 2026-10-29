// Copies the pool prover files into public/zk, named by content hash so they can be cached forever.
// The hashes come from the deployment record of the network being built, and the files must match them.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pool = new URL('../../../contracts/pool/', import.meta.url).pathname;
const out = new URL('../public/zk/', import.meta.url).pathname;
const rec = JSON.parse(readFileSync(pool + `deployments/${process.env.ZERONYM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'}.json`, 'utf8'));
const files = [
  ['build/transaction_js/transaction.wasm', rec.circuit.wasmSha256, 'wasm'],
  ['build/tx_final.zkey', rec.circuit.zkeySha256, 'zkey'],
];
mkdirSync(out, { recursive: true });
const keep = new Set();
for (const [src, sha, ext] of files) {
  const name = `transaction-${sha.slice(0, 8)}.${ext}`;
  keep.add(name);
  if (existsSync(out + name)) continue;
  const buf = readFileSync(pool + src);
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== sha) throw new Error(`${src} doesn't match the deployed circuit (${got} vs ${sha}).`);
  writeFileSync(out + name, buf);
  console.log(`zk: ${name} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
for (const f of readdirSync(out)) if (!keep.has(f)) rmSync(out + f);
