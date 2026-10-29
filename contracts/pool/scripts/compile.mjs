// Compiles the pool contracts with solc-js into build/contracts.json,
// and generates the Poseidon(2) hasher bytecode from circomlibjs.
import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { poseidonContract } = require('circomlibjs');

const files = ['contracts/ZeronymPool.sol', 'contracts/MerkleTreeWithHistory.sol', 'contracts/Verifier.sol', 'contracts/TestDollar.sol', 'contracts/ZeronymEthExit.sol'];
const input = {
  language: 'Solidity',
  sources: Object.fromEntries(files.map((f) => [f, { content: readFileSync(f, 'utf8') }])),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'metadata'] } },
  },
};
const findImports = (p) => {
  try { return { contents: readFileSync(require.resolve(p), 'utf8') }; } catch { return { error: `Not found: ${p}` }; }
};
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
(out.errors || []).filter((e) => e.severity === 'error').forEach((e) => console.error(e.formattedMessage));
if ((out.errors || []).some((e) => e.severity === 'error')) process.exit(1);
const pick = (f, n) => ({ abi: out.contracts[f][n].abi, bytecode: '0x' + out.contracts[f][n].evm.bytecode.object });
const res = {
  compiler: solc.version(),
  ZeronymPool: pick('contracts/ZeronymPool.sol', 'ZeronymPool'),
  Groth16Verifier: pick('contracts/Verifier.sol', 'Groth16Verifier'),
  TestDollar: pick('contracts/TestDollar.sol', 'TestDollar'),
  ZeronymEthExit: pick('contracts/ZeronymEthExit.sol', 'ZeronymEthExit'),
  ZeronymEthExitForwarder: pick('contracts/ZeronymEthExit.sol', 'ZeronymEthExitForwarder'),
  Hasher: { abi: poseidonContract.generateABI(2), bytecode: poseidonContract.createCode(2) },
};
mkdirSync('build', { recursive: true });
writeFileSync('build/contracts.json', JSON.stringify(res, null, 1));
// Standard JSON input for explorer source verification.
// Each contract's own sources only, so a verified contract shows exactly what it was built from.
const standardInput = (file, name) => {
  const used = Object.keys(JSON.parse(out.contracts[file][name].metadata).sources);
  return JSON.stringify({ ...input, sources: Object.fromEntries(used.map((k) => [k, { content: files.includes(k) ? input.sources[k].content : readFileSync(require.resolve(k), 'utf8') }])) });
};
writeFileSync('build/standard-input.json', standardInput('contracts/ZeronymPool.sol', 'ZeronymPool'));
writeFileSync('build/standard-input-eth-exit.json', standardInput('contracts/ZeronymEthExit.sol', 'ZeronymEthExit'));
for (const k of ['ZeronymPool', 'Groth16Verifier', 'TestDollar', 'ZeronymEthExit', 'Hasher']) console.log(k, (res[k].bytecode.length - 2) / 2, 'bytes');
