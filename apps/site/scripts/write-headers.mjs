// Writes dist/_headers with security headers and a CSP that allows only
// this site's own inline scripts (by hash) plus Cloudflare Turnstile.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
// The RPC the app reads from: a provider endpoint set for this build, or the network's public one.
const rec = JSON.parse(readFileSync(new URL(process.env.ZERONYM_NETWORK === 'mainnet' ? '../src/data/deployments.mainnet.json' : '../src/data/deployments.json', import.meta.url), 'utf8'));
const rpcOrigin = new URL(process.env.PUBLIC_RPC_URL || rec.app.rpc).origin;
const hashes = new Set();
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return walk(p);
  if (!p.endsWith('.html')) return;
  const html = readFileSync(p, 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  }
});
walk(dist);

const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the browser compile the proof system's WebAssembly; it doesn't allow eval().
  `script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com ${[...hashes].join(' ')}`,
  // The prover runs in a worker, and spreads work over helper workers created from blobs.
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // WalletConnect: the relay that carries messages to phone wallets, and its verify service.
  `connect-src 'self' ${rpcOrigin} wss://relay.walletconnect.org wss://relay.walletconnect.com https://rpc.walletconnect.org https://rpc.walletconnect.com https://pulse.walletconnect.org https://verify.walletconnect.org https://verify.walletconnect.com https://api.web3modal.org`,
  'frame-src https://challenges.cloudflare.com https://verify.walletconnect.org https://verify.walletconnect.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/zk/*
  Cache-Control: public, max-age=31536000, immutable
`;
writeFileSync(join(dist, '_headers'), headers);
console.log(`Wrote _headers with ${hashes.size} inline script hashes.`);
