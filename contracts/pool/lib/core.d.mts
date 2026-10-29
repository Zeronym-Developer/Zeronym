// Types for core.mjs (the Zeronym pool client library).
export const FIELD: bigint;
export const LEVELS: number;
export const ZERO_VALUE: bigint;
export const ZERO_ADDRESS: `0x${string}`;
export const ZEROS: bigint[];
export function hex32(v: bigint | string | number): `0x${string}`;
export function randomField(): bigint;

export class MerkleTree {
  constructor(leaves?: (bigint | string)[]);
  readonly size: number;
  root(): bigint;
  insert(leaves: (bigint | string)[]): void;
  path(index: number): { pathElements: bigint[]; pathIndices: number };
}

export type PoolKeys = { privKey: bigint; pubKey: bigint; encPriv: Uint8Array; encPub: Uint8Array; address: string };
export function keysFromSeeds(spendSeed: Uint8Array, viewSeed: Uint8Array): PoolKeys;
export function encodeAddress(pubKey: bigint, encPub: Uint8Array): string;
export function decodeAddress(addr: string): { pubKey: bigint; encPub: Uint8Array } | null;
export function isShieldedAddress(addr: string): boolean;

export type NoteData = { amount: bigint; blinding: bigint; asset: bigint; memo: string };
export function commitment(n: { amount: bigint | string; pubKey: bigint | string; blinding: bigint | string; asset: bigint | string }): bigint;
export function nullifier(n: { amount: bigint | string; pubKey: bigint | string; blinding: bigint | string; asset: bigint | string }, index: number, privKey: bigint): bigint;
export function encryptNote(encPub: Uint8Array, n: { amount: bigint; blinding: bigint; asset: bigint; memo?: string }): Promise<`0x${string}`>;
export function decryptNote(encPriv: Uint8Array, encPub: Uint8Array, data: `0x${string}`): Promise<NoteData | null>;

export type ExtData = { recipient: `0x${string}`; extAmount: bigint; relayer: `0x${string}`; fee: bigint; encryptedOutput1: `0x${string}`; encryptedOutput2: `0x${string}`; token: `0x${string}` };
export type ProofArgs = { proof: `0x${string}`; root: `0x${string}`; inputNullifiers: `0x${string}`[]; outputCommitments: `0x${string}`[]; publicAmount: bigint; extDataHash: `0x${string}` };
export function extDataHash(e: ExtData): bigint;
export function publicAmount(extAmount: bigint, fee: bigint): bigint;

export type InputNote = { amount: bigint; blinding: bigint; asset: bigint; index: number };
export type OutputNote = { amount: bigint; pubKey: bigint; encPub: Uint8Array; blinding?: bigint; memo?: string };
export function prepareTransaction(p: {
  tree: MerkleTree; keys: PoolKeys; token: `0x${string}`;
  inputs?: InputNote[]; outputs?: OutputNote[];
  extAmount?: bigint; fee?: bigint; recipient?: `0x${string}`; relayer?: `0x${string}`;
}): Promise<{ input: Record<string, unknown>; args: ProofArgs; extData: ExtData; outputs: (OutputNote & { asset: bigint; blinding: bigint })[] }>;
export function packProof(proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }): `0x${string}`;

export type PoolCommitment = { commitment: bigint; index: number; encryptedOutput: `0x${string}`; block: number; tx: `0x${string}` };
export const POOL_EVENTS: readonly unknown[];
export function decodePoolLogs(logs: { data: `0x${string}`; topics: `0x${string}`[]; blockNumber: string | bigint | number; transactionHash: `0x${string}` }[]): { commitments: PoolCommitment[]; nullifiers: Set<bigint> };
export type FoundNote = NoteData & { pubKey: bigint; index: number; block: number; tx: `0x${string}`; commitment: bigint; nullifier: bigint; spent: boolean };
export function findNotes(keys: PoolKeys, commitments: PoolCommitment[], nullifiers: Set<bigint>): Promise<FoundNote[]>;
