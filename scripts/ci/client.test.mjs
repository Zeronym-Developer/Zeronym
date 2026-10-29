import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as core from '../../contracts/pool/lib/core.mjs';

const require = createRequire(new URL('../../contracts/pool/package.json', import.meta.url));
const { poseidon2 } = require('poseidon-lite');
const seed = (byte) => new Uint8Array(32).fill(byte);
const alice = core.keysFromSeeds(seed(1), seed(2));
const bob = core.keysFromSeeds(seed(3), seed(4));
const token = '0x0000000000000000000000000000000000000001';
const note = { amount: 250_000_000n, blinding: 42n, asset: BigInt(token), pubKey: alice.pubKey, memo: 'invoice 17' };

test('shielded addresses round-trip and reject a changed checksum', () => {
  const decoded = core.decodeAddress(alice.address);
  assert.equal(decoded.pubKey, alice.pubKey);
  assert.deepEqual(decoded.encPub, alice.encPub);
  assert.equal(core.decodeAddress(alice.address.slice(0, -2) + (alice.address.at(-2) === 'q' ? 'p' : 'q') + alice.address.at(-1)), null);
  assert.equal(core.decodeAddress('0x1234'), null);
});

test('only the recipient can decrypt a note, and ciphertext is randomized', async () => {
  const a = await core.encryptNote(alice.encPub, note);
  const b = await core.encryptNote(alice.encPub, note);
  assert.notEqual(a, b);
  assert.equal(a.length, b.length);
  assert.deepEqual(await core.decryptNote(alice.encPriv, alice.encPub, a), {
    amount: note.amount, blinding: note.blinding, asset: note.asset, memo: note.memo,
  });
  assert.equal(await core.decryptNote(bob.encPriv, bob.encPub, a), null);
});

test('altered or truncated ciphertext is rejected', async () => {
  const cipher = await core.encryptNote(alice.encPub, note);
  const changed = cipher.slice(0, -2) + (cipher.endsWith('00') ? '01' : '00');
  assert.equal(await core.decryptNote(alice.encPriv, alice.encPub, changed), null);
  assert.equal(await core.decryptNote(alice.encPriv, alice.encPub, cipher.slice(0, -2)), null);
});

test('encrypted note size does not reveal the amount or memo length', async () => {
  const short = await core.encryptNote(alice.encPub, { ...note, amount: 1n, memo: '' });
  const long = await core.encryptNote(alice.encPub, { ...note, amount: 999_999_999n, memo: 'x'.repeat(44) });
  assert.equal(short.length, long.length);
});

test('commitments bind the amount, recipient and asset; nullifiers bind the leaf', () => {
  const commitment = core.commitment(note);
  for (const change of [{ amount: note.amount + 1n }, { pubKey: bob.pubKey }, { asset: 2n }, { blinding: 43n }]) {
    assert.notEqual(core.commitment({ ...note, ...change }), commitment);
  }
  assert.notEqual(core.nullifier(note, 0, alice.privKey), core.nullifier(note, 1, alice.privKey));
});

test('Merkle membership paths reconstruct the root before and after insertion', () => {
  const tree = new core.MerkleTree([11n, 22n, 33n]);
  for (const extra of [[], [44n, 55n]]) {
    tree.insert(extra);
    for (let index = 0; index < tree.size; index++) {
      let root = tree.layers[0][index];
      let position = index;
      for (const sibling of tree.path(index).pathElements) {
        root = position & 1 ? poseidon2([sibling, root]) : poseidon2([root, sibling]);
        position >>= 1;
      }
      assert.equal(root, tree.root());
    }
  }
});

test('transaction preparation rejects unbalanced amounts and excess inputs', async () => {
  const base = { tree: new core.MerkleTree(), keys: alice, token };
  await assert.rejects(core.prepareTransaction({ ...base, extAmount: 10n, outputs: [{ amount: 11n, pubKey: alice.pubKey, encPub: alice.encPub }] }), /add up/);
  await assert.rejects(core.prepareTransaction({ ...base, inputs: [note, note, note] }), /At most two/);
});

test('note scanning rejects commitment mismatches and tracks spent notes', async () => {
  const encryptedOutput = await core.encryptNote(alice.encPub, note);
  const commitment = core.commitment(note);
  const entry = { commitment, encryptedOutput, index: 7, block: 1, tx: '0x01' };
  assert.equal((await core.findNotes(bob, [entry], new Set())).length, 0);
  assert.equal((await core.findNotes(alice, [{ ...entry, commitment: commitment + 1n }], new Set())).length, 0);
  const unspent = await core.findNotes(alice, [entry], new Set());
  assert.equal(unspent.length, 1);
  assert.equal(unspent[0].spent, false);
  const spent = await core.findNotes(alice, [entry], new Set([unspent[0].nullifier]));
  assert.equal(spent[0].spent, true);
});
