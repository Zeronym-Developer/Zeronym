// Run the existing integration tests with the exact circuit files served by the app.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkProver } from './check-prover.mjs';

const pool = new URL('../../contracts/pool/', import.meta.url);
const require = createRequire(new URL('package.json', pool));
const snarkjs = require('snarkjs');
mkdirSync(new URL('build/transaction_js/', pool), { recursive: true });
for (const file of checkProver()) {
  const target = file.extension === 'wasm' ? 'build/transaction_js/transaction.wasm' : 'build/tx_final.zkey';
  copyFileSync(file.source, new URL(target, pool));
}
try {
  const key = await snarkjs.zKey.exportVerificationKey(fileURLToPath(new URL('build/tx_final.zkey', pool)));
  writeFileSync(new URL('build/verification_key.json', pool), JSON.stringify(key, null, 2) + '\n');
  console.log('Prepared recorded prover files and exported their verification key.');
} finally {
  await globalThis.curve_bn128?.terminate();
}
