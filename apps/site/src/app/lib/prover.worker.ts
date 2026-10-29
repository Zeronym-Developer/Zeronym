// Builds Groth16 proofs off the main thread. Keys and note secrets arrive as the
// circuit input and never leave this browser.
import { groth16 } from 'snarkjs';

let files: Promise<[Uint8Array, Uint8Array]> | null = null;

async function get(url: string): Promise<Uint8Array> {
  // The files are named by content hash, so a cached copy is always the right one.
  let cache: Cache | null = null;
  try { cache = await caches.open('zeronym-prover'); } catch { /* no Cache API */ }
  const hit = await cache?.match(url);
  const res = hit || (await fetch(url));
  if (!res.ok) throw new Error(`Couldn't download the prover (${res.status}).`);
  if (!hit && cache) await cache.put(url, res.clone()).catch(() => {});
  return new Uint8Array(await res.arrayBuffer());
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, input, wasm, zkey } = e.data;
  try {
    files ??= Promise.all([get(wasm), get(zkey)]);
    const [w, z] = await files.catch((err) => { files = null; throw err; });
    if (type === 'warm') { postMessage({ id, ok: true }); return; }
    const t0 = performance.now();
    const { proof, publicSignals } = await groth16.fullProve(input, w, z);
    postMessage({ id, proof, publicSignals, ms: Math.round(performance.now() - t0) });
  } catch (err: any) {
    postMessage({ id, error: String(err?.message || err) });
  }
};
