import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

// ZERONYM_NETWORK=mainnet builds the mainnet site: every import of the testnet deployment
// records resolves to the mainnet ones instead. Any other value builds the testnet site.
const MAINNET = process.env.ZERONYM_NETWORK === 'mainnet';
const swap = {
  [fileURLToPath(new URL('./src/data/deployments.json', import.meta.url))]: fileURLToPath(new URL('./src/data/deployments.mainnet.json', import.meta.url)),
  [fileURLToPath(new URL('../../contracts/pool/deployments/testnet.json', import.meta.url))]: fileURLToPath(new URL('../../contracts/pool/deployments/mainnet.json', import.meta.url)),
};
const network = {
  name: 'zeronym-network',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!MAINNET || !/(deployments|testnet)\.json$/.test(source)) return null;
    const r = await this.resolve(source, importer, { ...options, skipSelf: true });
    return r && swap[r.id] ? swap[r.id] : null;
  },
};

export default defineConfig({
  // SITE_URL picks the public address per host.
  site: process.env.SITE_URL || 'https://zeronym-site.zeronym.workers.dev',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: {
    plugins: [network],
    build: { assetsInlineLimit: 0 },
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    // The pool client library lives in contracts/pool; bundle one copy of each dependency.
    resolve: {
      dedupe: ['viem', 'poseidon-lite', '@noble/curves', '@noble/hashes'],
      // Zeronym draws its own connect dialog, so Reown's modal is left out of the bundle.
      alias: { '@reown/appkit/core': fileURLToPath(new URL('./src/app/lib/appkit-stub.ts', import.meta.url)) },
    },
    worker: { format: 'es' },
  },
});
