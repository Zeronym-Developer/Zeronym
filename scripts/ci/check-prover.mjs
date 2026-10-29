import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkProver() {
  const record = JSON.parse(readFileSync(new URL('../../contracts/pool/deployments/mainnet.json', import.meta.url)));
  const directory = new URL('../../apps/site/public/zk/', import.meta.url);
  const files = [['wasm', record.circuit.wasmSha256], ['zkey', record.circuit.zkeySha256]];
  const checked = files.map(([extension, expected]) => {
    assert.match(expected, /^[a-f0-9]{64}$/, `${extension}: SHA-256 is recorded`);
    const name = `transaction-${expected.slice(0, 8)}.${extension}`;
    const source = new URL(name, directory);
    const bytes = readFileSync(source);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `${name}: matches deployed circuit`);
    if (extension === 'wasm') assert.equal(bytes.subarray(0, 4).toString('hex'), '0061736d', 'WASM magic');
    console.log(`${name}: SHA-256 verified (${bytes.length} bytes)`);
    return { extension, name, source };
  });
  assert.deepEqual(readdirSync(directory).sort(), checked.map((file) => file.name).sort(), 'Only the recorded mainnet prover files are shipped');
  return checked;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) checkProver();
