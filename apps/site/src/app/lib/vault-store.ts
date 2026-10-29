// Local key handling and encrypted storage (PRD R3.1, R3.3, R3.13).
// - The recovery phrase comes from fresh random entropy, never from a wallet signature.
// - Everything the app keeps is encrypted with a device key that cannot be exported
//   from this browser, and stored in IndexedDB. Nothing is sent to any server.
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { keysFromSeeds } from '../../../../../contracts/pool/lib/core.mjs';

const DB = 'zeronym-app';
const STORE = 'kv';
const enc = new TextEncoder();
const dec = new TextDecoder();

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result as T);
    q.onerror = () => rej(q.error);
  });
}
async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
async function kvClear(): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).clear();
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));

async function deviceKey(): Promise<CryptoKey> {
  let k = await kvGet<CryptoKey>('device-key');
  if (!k) {
    k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await kvSet('device-key', k);
  }
  return k;
}

async function seal(key: CryptoKey, data: unknown): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
  return { iv: b64(iv), ct: b64(ct) };
}
async function open<T>(key: CryptoKey, box: { iv: string; ct: string }): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt)) as T;
}

export async function loadState<T>(): Promise<T | null> {
  try {
    const box = await kvGet<{ iv: string; ct: string }>('state');
    if (!box) return null;
    return await open<T>(await deviceKey(), box);
  } catch {
    return null;
  }
}
export async function saveState(state: unknown): Promise<void> {
  await kvSet('state', await seal(await deviceKey(), state));
}
export async function forgetDevice(): Promise<void> {
  await kvClear();
}

// ---- Keys ----
export type Keys = { entropy: string; spend: string; view: string; address: string };

async function hkdf(ikm: Uint8Array, info: string, len = 32): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('zeronym-v1'), info: enc.encode(info) }, base, len * 8);
  return new Uint8Array(bits);
}

// The shielded address encodes the pool spending public key and the note encryption key.
export const addressOf = (spendHex: string, viewHex: string) => keysFromSeeds(unhex(spendHex), unhex(viewHex)).address;

export async function deriveKeys(entropy: Uint8Array): Promise<Keys> {
  const spend = hex(await hkdf(entropy, 'spend'));
  const view = hex(await hkdf(entropy, 'view'));
  return { entropy: hex(entropy), spend, view, address: addressOf(spend, view) };
}

export function newEntropy(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
export const phraseOf = (entropyHex: string) => entropyToMnemonic(unhex(entropyHex), wordlist).split(' ');
export function entropyFromPhrase(phrase: string): Uint8Array | null {
  const p = phrase.trim().toLowerCase().split(/\s+/).join(' ');
  if (!validateMnemonic(p, wordlist)) return null;
  return mnemonicToEntropy(p, wordlist);
}
export const isWord = (w: string) => wordlist.includes(w.trim().toLowerCase());

// Encrypted export for the user's own records (R3.13): readable only with the recovery phrase.
async function exportKey(entropyHex: string): Promise<CryptoKey> {
  const raw = await hkdf(unhex(entropyHex), 'export');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function exportHistory(entropyHex: string, data: unknown): Promise<string> {
  const box = await seal(await exportKey(entropyHex), data);
  return JSON.stringify({ format: 'zeronym-history', version: 1, ...box });
}
export async function importHistory<T>(entropyHex: string, text: string): Promise<T | null> {
  try {
    const f = JSON.parse(text);
    if (f.format !== 'zeronym-history') return null;
    return await open<T>(await exportKey(entropyHex), f);
  } catch {
    return null;
  }
}

export function randomId(prefix = ''): string {
  return prefix + hex(crypto.getRandomValues(new Uint8Array(6)));
}
export function fakeHash(): string {
  return '0x' + hex(crypto.getRandomValues(new Uint8Array(32)));
}
