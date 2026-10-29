// Zeronym shielded pool: client protocol library.
// Shared by the tests, the deploy scripts and the web app.
//
// Keys
//   spending key  privKey (field element)    publicKey = Poseidon(privKey)
//   viewing key   x25519 key pair            encrypts notes sent to you
//   address       "zn1" + base32(publicKey ‖ encPub)
// Notes
//   commitment = Poseidon(amount, publicKey, blinding, asset)
//   nullifier  = Poseidon(commitment, index, Poseidon(privKey, commitment, index))
import { poseidon1, poseidon2, poseidon3, poseidon4 } from 'poseidon-lite';
import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { encodeAbiParameters, keccak256, bytesToHex, hexToBytes, decodeEventLog, parseAbi } from 'viem';

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const LEVELS = 20;
export const ZERO_VALUE = 19506251170085072150679270423557939845240257468815860835066582187690914938146n;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const NOTE_BYTES = 128; // amount 32 | blinding 32 | asset 20 | memo 44 (fixed size, so length leaks nothing)
const MEMO_BYTES = 44;

const subtle = globalThis.crypto.subtle;
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const toBig = (u) => BigInt(bytesToHex(u));
const be = (v, n = 32) => hexToBytes(('0x' + BigInt(v).toString(16).padStart(n * 2, '0')));
const concat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
export const hex32 = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
export const randomField = () => toBig(rand(31));

// ---------- Merkle tree ----------
export const ZEROS = (() => { const z = [ZERO_VALUE]; for (let i = 1; i <= LEVELS; i++) z.push(poseidon2([z[i - 1], z[i - 1]])); return z; })();

export class MerkleTree {
  constructor(leaves = []) { this.layers = [leaves.map(BigInt)]; this.build(); }
  build() {
    for (let l = 1; l <= LEVELS; l++) {
      const prev = this.layers[l - 1];
      const cur = [];
      for (let i = 0; i < Math.ceil(prev.length / 2); i++) cur.push(poseidon2([prev[2 * i], prev[2 * i + 1] ?? ZEROS[l - 1]]));
      this.layers[l] = cur;
    }
  }
  get size() { return this.layers[0].length; }
  root() { return this.layers[LEVELS][0] ?? ZEROS[LEVELS]; }
  insert(leaves) { this.layers[0].push(...leaves.map(BigInt)); this.build(); }
  path(index) {
    const pathElements = [];
    let idx = index;
    for (let l = 0; l < LEVELS; l++) { pathElements.push(this.layers[l][idx ^ 1] ?? ZEROS[l]); idx >>= 1; }
    return { pathElements, pathIndices: index };
  }
}

// ---------- Keys and addresses ----------
export function keysFromSeeds(spendSeed, viewSeed) {
  const privKey = toBig(spendSeed) % FIELD;
  const pubKey = poseidon1([privKey]);
  const encPriv = viewSeed.slice(0, 32);
  const encPub = x25519.getPublicKey(encPriv);
  return { privKey, pubKey, encPriv, encPub, address: encodeAddress(pubKey, encPub) };
}

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
// Address = "zn1" + base32(publicKey 32 | encryption key 32 | checksum 4). The checksum catches typos.
const ADDR_LEN = 109;
const base32 = (u) => {
  let bits = 0, val = 0, out = '';
  for (const b of u) { val = ((val << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
};
export function encodeAddress(pubKey, encPub) {
  const body = concat(be(pubKey), encPub);
  return 'zn1' + base32(concat(body, sha256(body).slice(0, 4)));
}
export function decodeAddress(addr) {
  const s = String(addr).trim().toLowerCase();
  if (!s.startsWith('zn1') || s.length !== 3 + ADDR_LEN) return null;
  const out = []; let bits = 0, val = 0;
  for (const ch of s.slice(3)) {
    const v = B32.indexOf(ch); if (v < 0) return null;
    val = ((val << 5) | v) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  const u = Uint8Array.from(out.slice(0, 68));
  const body = u.slice(0, 64);
  const sum = sha256(body);
  if (u.length < 68 || [0, 1, 2, 3].some((i) => sum[i] !== u[64 + i])) return null;
  const pubKey = toBig(body.slice(0, 32));
  if (pubKey >= FIELD) return null;
  return { pubKey, encPub: body.slice(32, 64) };
}
export const isShieldedAddress = (a) => decodeAddress(a) !== null;

// ---------- Notes ----------
export const commitment = (n) => poseidon4([BigInt(n.amount), BigInt(n.pubKey), BigInt(n.blinding), BigInt(n.asset)]);
export function nullifier(n, index, privKey) {
  const c = commitment(n);
  const sig = poseidon3([BigInt(privKey), c, BigInt(index)]);
  return poseidon3([c, BigInt(index), sig]);
}

async function aesKey(shared, ephPub, recipientPub) {
  return subtle.importKey('raw', sha256(concat(shared, ephPub, recipientPub)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptNote(encPub, { amount, blinding, asset, memo = '' }) {
  const memoBytes = new TextEncoder().encode(memo).slice(0, MEMO_BYTES);
  const pt = concat(be(amount), be(blinding), be(asset, 20), memoBytes, new Uint8Array(MEMO_BYTES - memoBytes.length));
  const eph = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(eph);
  const key = await aesKey(x25519.getSharedSecret(eph, encPub), ephPub, encPub);
  const iv = rand(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  return bytesToHex(concat(ephPub, iv, ct));
}
export async function decryptNote(encPriv, encPub, data) {
  try {
    const u = hexToBytes(data);
    if (u.length !== 32 + 12 + NOTE_BYTES + 16) return null;
    const ephPub = u.slice(0, 32), iv = u.slice(32, 44), ct = u.slice(44);
    const key = await aesKey(x25519.getSharedSecret(encPriv, ephPub), ephPub, encPub);
    const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
    const memo = new TextDecoder().decode(pt.slice(84)).replace(/\0+$/, '');
    return { amount: toBig(pt.slice(0, 32)), blinding: toBig(pt.slice(32, 64)), asset: toBig(pt.slice(64, 84)), memo };
  } catch {
    return null;
  }
}

// ---------- Transactions ----------
const EXT = [{ type: 'tuple', components: [
  { name: 'recipient', type: 'address' }, { name: 'extAmount', type: 'int256' }, { name: 'relayer', type: 'address' },
  { name: 'fee', type: 'uint256' }, { name: 'encryptedOutput1', type: 'bytes' }, { name: 'encryptedOutput2', type: 'bytes' }, { name: 'token', type: 'address' },
] }];
export const extDataHash = (e) => BigInt(keccak256(encodeAbiParameters(EXT, [e]))) % FIELD;
export function publicAmount(extAmount, fee) { const p = BigInt(extAmount) - BigInt(fee); return p >= 0n ? p : FIELD + p; }

/**
 * Build the circuit input and contract arguments for one transaction.
 * inputs:  owned notes { amount, blinding, asset, index } (0 to 2)
 * outputs: { amount, pubKey, encPub, blinding?, memo? } (0 to 2); padded with zero notes to self
 */
export async function prepareTransaction({ tree, keys, token, inputs = [], outputs = [], extAmount = 0n, fee = 0n, recipient = ZERO_ADDRESS, relayer = ZERO_ADDRESS }) {
  if (inputs.length > 2 || outputs.length > 2) throw new Error('At most two inputs and two outputs.');
  const asset = BigInt(token);
  const ins = inputs.map((n) => ({ ...n, privKey: keys.privKey, pubKey: keys.pubKey, owned: true }));
  // Padding inputs: zero-value notes under a throwaway key, never in the tree.
  while (ins.length < 2) { const pk = randomField(); ins.push({ amount: 0n, blinding: randomField(), asset, index: 0, privKey: pk, pubKey: poseidon1([pk]), owned: false }); }
  const outs = outputs.map((o) => ({ ...o, asset, blinding: o.blinding ?? randomField() }));
  while (outs.length < 2) outs.push({ amount: 0n, pubKey: keys.pubKey, encPub: keys.encPub, blinding: randomField(), asset });

  const sumIn = ins.reduce((s, n) => s + BigInt(n.amount), 0n);
  const sumOut = outs.reduce((s, n) => s + BigInt(n.amount), 0n);
  if (sumIn + BigInt(extAmount) - BigInt(fee) !== sumOut) throw new Error('Amounts don’t add up.');

  const inputNullifier = ins.map((n) => nullifier(n, n.index, n.privKey));
  const outputCommitment = outs.map(commitment);
  const [encryptedOutput1, encryptedOutput2] = await Promise.all(outs.map((o) => encryptNote(o.encPub, o)));
  const ext = { recipient, extAmount: BigInt(extAmount), relayer, fee: BigInt(fee), encryptedOutput1, encryptedOutput2, token };
  const extHash = extDataHash(ext);
  const root = tree.root();
  const paths = ins.map((n) => (n.owned ? tree.path(n.index) : { pathElements: Array(LEVELS).fill(0n), pathIndices: 0 }));
  const pubAmt = publicAmount(extAmount, fee);
  const s = (v) => BigInt(v).toString();

  const input = {
    root: s(root), publicAmount: s(pubAmt), extDataHash: s(extHash), asset: s(asset),
    inputNullifier: inputNullifier.map(s), outputCommitment: outputCommitment.map(s),
    inAmount: ins.map((n) => s(n.amount)), inPrivateKey: ins.map((n) => s(n.privKey)), inBlinding: ins.map((n) => s(n.blinding)),
    inPathIndices: paths.map((p) => s(p.pathIndices)), inPathElements: paths.map((p) => p.pathElements.map(s)),
    outAmount: outs.map((o) => s(o.amount)), outPubkey: outs.map((o) => s(o.pubKey)), outBlinding: outs.map((o) => s(o.blinding)),
  };
  const args = {
    proof: '0x', root: hex32(root), inputNullifiers: inputNullifier.map(hex32), outputCommitments: outputCommitment.map(hex32),
    publicAmount: pubAmt, extDataHash: hex32(extHash),
  };
  return { input, args, extData: ext, outputs: outs };
}

export function packProof(proof) {
  const p = [proof.pi_a[0], proof.pi_a[1], proof.pi_b[0][1], proof.pi_b[0][0], proof.pi_b[1][1], proof.pi_b[1][0], proof.pi_c[0], proof.pi_c[1]].map(BigInt);
  return encodeAbiParameters([{ type: 'uint256[8]' }], [p]);
}

// ---------- Chain data ----------
export const POOL_EVENTS = parseAbi([
  'event NewCommitment(bytes32 commitment, uint256 index, bytes encryptedOutput)',
  'event NewNullifier(bytes32 nullifier)',
]);
export function decodePoolLogs(logs) {
  const commitments = [];
  const nullifiers = new Set();
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi: POOL_EVENTS, data: log.data, topics: log.topics });
      if (ev.eventName === 'NewCommitment') commitments.push({ commitment: BigInt(ev.args.commitment), index: Number(ev.args.index), encryptedOutput: ev.args.encryptedOutput, block: Number(log.blockNumber), tx: log.transactionHash });
      else nullifiers.add(BigInt(ev.args.nullifier));
    } catch { /* another event */ }
  }
  commitments.sort((a, b) => a.index - b.index);
  return { commitments, nullifiers };
}

/** Find the notes that belong to these keys, check each against its commitment, and mark the spent ones. */
export async function findNotes(keys, commitments, nullifiers) {
  const notes = [];
  for (const c of commitments) {
    const n = await decryptNote(keys.encPriv, keys.encPub, c.encryptedOutput);
    if (!n) continue;
    const note = { ...n, pubKey: keys.pubKey, index: c.index, block: c.block, tx: c.tx };
    if (commitment(note) !== c.commitment) continue; // not really ours, or tampered
    note.commitment = c.commitment;
    note.nullifier = nullifier(note, c.index, keys.privKey);
    note.spent = nullifiers.has(note.nullifier);
    notes.push(note);
  }
  return notes;
}
