// Multi-party phase 2 setup for the mainnet pool circuit (Groth16).
// The proving key is safe as long as at least ONE contributor destroys their randomness.
// A testnet key made by one person is not enough for mainnet: that person could forge proofs.
//
//   node scripts/ceremony.mjs setup                 compile the circuit, check the ptau file, start at contribution 0
//   node scripts/ceremony.mjs contribute "<name>"   add one contribution (each person runs this once, in turn)
//   node scripts/ceremony.mjs finish <beacon>       apply a public random beacon, verify everything,
//                                                   write build/tx_final.zkey and contracts/Verifier.sol
//   node scripts/ceremony.mjs verify                check the final key against the circuit and the ptau file again
//
// Files live in build/ceremony/. Pass the newest tx_NNNN.zkey to the next contributor; it's not secret.
// The beacon is a value nobody can know in advance, e.g. the hash of an Ethereum block chosen before it exists.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as snarkjs from 'snarkjs';

const DIR = 'build/ceremony';
const R1CS = 'build/transaction.r1cs';
const WASM = 'build/transaction_js/transaction.wasm';
// PSE perpetual powers of tau, contribution 80, 2^15 constraints (the circuit has about 13,300).
const PTAU = 'ptau/ppot_0080_15.ptau';
const PTAU_URL = 'https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_15.ptau';
const PTAU_SHA256 = '4a8eb5a754ed4710d6ad603c2e1a89c72325a448e4474f8694d2c71c7c272f3d';
const LOG = `${DIR}/transcript.json`;

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const logger = { debug() {}, info: (m) => console.log(m), warn: (m) => console.warn(m), error: (m) => console.error(m) };
const name = (n) => `${DIR}/tx_${String(n).padStart(4, '0')}.zkey`;
const latest = () => {
  const n = readdirSync(DIR).map((f) => /^tx_(\d{4})\.zkey$/.exec(f)?.[1]).filter(Boolean).map(Number);
  if (!n.length) throw new Error('No ceremony files yet. Run: node scripts/ceremony.mjs setup');
  return Math.max(...n);
};
const readLog = () => (existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { contributions: [] });
const saveLog = (l) => writeFileSync(LOG, JSON.stringify(l, null, 2) + '\n');

async function setup() {
  mkdirSync(DIR, { recursive: true });
  mkdirSync('ptau', { recursive: true });
  if (existsSync(name(0))) throw new Error(`${name(0)} already exists. Delete build/ceremony to start over.`);
  // Circuit: circom if it's installed, otherwise the circom2 package from npm.
  mkdirSync('build', { recursive: true });
  const args = ['circuits/transaction.circom', '--r1cs', '--wasm', '--O2', '-o', 'build'];
  try { execFileSync('circom', args, { stdio: 'inherit' }); }
  catch { execFileSync('npx', ['--yes', 'circom2@0.2.23', ...args], { stdio: 'inherit' }); }
  if (!existsSync(PTAU)) {
    console.log(`Downloading ${PTAU_URL} (38 MB)…`);
    const r = await fetch(PTAU_URL);
    if (!r.ok) throw new Error(`ptau download failed: ${r.status}`);
    writeFileSync(PTAU, Buffer.from(await r.arrayBuffer()));
  }
  if (sha(PTAU) !== PTAU_SHA256) throw new Error(`${PTAU} doesn't match the pinned hash.`);
  await snarkjs.zKey.newZKey(R1CS, PTAU, name(0), logger);
  saveLog({ circuit: 'transaction(20, 2, 2)', r1csSha256: sha(R1CS), wasmSha256: sha(WASM), ptau: PTAU_URL, ptauSha256: PTAU_SHA256, startedAt: new Date().toISOString(), contributions: [] });
  console.log(`\nReady: ${name(0)}. Next: node scripts/ceremony.mjs contribute "<your name>"`);
}

async function contribute(who) {
  if (!who) throw new Error('Give your name: node scripts/ceremony.mjs contribute "Alice"');
  const n = latest();
  // 64 random bytes from the operating system. They are used once and never written anywhere.
  const entropy = randomBytes(64).toString('hex');
  const hash = await snarkjs.zKey.contribute(name(n), name(n + 1), who, entropy, logger);
  const log = readLog();
  log.contributions.push({ n: n + 1, name: who, at: new Date().toISOString(), file: name(n + 1), fileSha256: sha(name(n + 1)), contributionHash: Buffer.from(hash).toString('hex') });
  saveLog(log);
  console.log(`\nDone: ${name(n + 1)}\nYour contribution hash (save it, and check it appears in the final transcript):\n${Buffer.from(hash).toString('hex')}`);
  console.log('Pass this file and build/ceremony/transcript.json to the next contributor.');
}

async function finish(beacon) {
  if (!/^[0-9a-fA-F]{64}$/.test(beacon || '')) throw new Error('The beacon must be 32 bytes of hex, e.g. a block hash without 0x.');
  const log = readLog();
  if (log.contributions.length < 3) throw new Error(`Only ${log.contributions.length} contribution(s). Mainnet needs at least 3 independent people.`);
  const n = latest();
  await snarkjs.zKey.beacon(name(n), name(n + 1), 'Final beacon', beacon, 10, logger);
  const ok = await snarkjs.zKey.verifyFromR1cs(R1CS, PTAU, name(n + 1), logger);
  if (!ok) throw new Error('The final key does NOT verify against the circuit and ptau. Do not deploy.');
  copyFileSync(name(n + 1), 'build/tx_final.zkey');
  const templates = { groth16: readFileSync(new URL('../node_modules/snarkjs/templates/verifier_groth16.sol.ejs', import.meta.url), 'utf8') };
  writeFileSync('contracts/Verifier.sol', await snarkjs.zKey.exportSolidityVerifier('build/tx_final.zkey', templates, logger));
  writeFileSync('build/verification_key.json', JSON.stringify(await snarkjs.zKey.exportVerificationKey('build/tx_final.zkey', logger), null, 1));
  log.beacon = { value: beacon, iterationsExp: 10 };
  log.final = { zkeySha256: sha('build/tx_final.zkey'), wasmSha256: sha(WASM), verifierSha256: sha('contracts/Verifier.sol'), finishedAt: new Date().toISOString() };
  saveLog(log);
  console.log(`\nFinal key verified with ${log.contributions.length} contributions + beacon.\nWrote build/tx_final.zkey, build/verification_key.json and contracts/Verifier.sol.\nNext: npm run compile, then the mainnet deploy.`);
}

async function verify() {
  const ok = await snarkjs.zKey.verifyFromR1cs(R1CS, PTAU, 'build/tx_final.zkey', logger);
  console.log(ok ? 'OK: build/tx_final.zkey verifies against the circuit and ptau.' : 'FAILED: do not deploy.');
  if (!ok) process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
const run = { setup, contribute: () => contribute(arg), finish: () => finish(arg), verify }[cmd];
if (!run) { console.log('Usage: node scripts/ceremony.mjs setup | contribute "<name>" | finish <beacon hex> | verify'); process.exit(1); }
await run();
process.exit(0);
