import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pool = new URL('../../contracts/pool/', import.meta.url);
const record = JSON.parse(readFileSync(new URL('deployments/mainnet.json', pool)));
const built = JSON.parse(readFileSync(new URL('build/contracts.json', pool)));
assert.equal(built.compiler, record.compiler, 'Compiler matches the mainnet deployment record');

for (const name of ['ZeronymPool', 'Groth16Verifier', 'ZeronymEthExit', 'ZeronymEthExitForwarder', 'Hasher', 'TestDollar']) {
  assert.ok(Array.isArray(built[name]?.abi), `${name}: ABI exists`);
  assert.match(built[name]?.bytecode || '', /^0x[0-9a-f]+$/i, `${name}: bytecode exists`);
}

const functions = built.ZeronymPool.abi.filter((entry) => entry.type === 'function');
const writes = functions.filter((entry) => !['view', 'pure'].includes(entry.stateMutability)).map((entry) => entry.name).sort();
assert.deepEqual(writes, ['setAdmin', 'setToken', 'transact'], 'Pool exposes only the expected state-changing entry points');
assert.deepEqual(functions.find((entry) => entry.name === 'setToken').inputs.map((input) => input.type), ['address', 'bool'], 'Token support has no configurable deposit cap');
assert.ok(!functions.some((entry) => entry.name === 'maxDeposit'), 'No deposit-cap getter is exposed');
assert.equal(functions.find((entry) => entry.name === 'verifier')?.stateMutability, 'view', 'Verifier address is readable');
assert.ok(built.Groth16Verifier.abi.some((entry) => entry.name === 'verifyProof'), 'Verifier exports proof verification');
for (const name of ['withdraw', 'settle', 'forwarderOf']) {
  assert.ok(built.ZeronymEthExit.abi.some((entry) => entry.name === name), `ETH exit exports ${name}`);
}
console.log('Contract artifacts, compiler version and public interfaces checked.');
