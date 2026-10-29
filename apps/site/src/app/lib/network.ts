// Which chain this build talks to. Set ZERONYM_NETWORK=mainnet at build time for the
// mainnet site; anything else builds the testnet site. The deployment records for the
// chosen network are swapped in by the build (see astro.config.mjs), so every import of
// deployments.json or the pool's testnet.json gets that network's file.
import deployments from '../../data/deployments.json';

const isMainnet = (deployments as { network?: string }).network === 'mainnet';
export const NET = {
  isMainnet,
  isTestnet: !isMainnet,
  /** Added after "Robinhood Chain" in labels: "Testnet" on testnet, nothing on mainnet. */
  suffix: isMainnet ? '' : ' testnet',
  id: deployments.hostChain.chainId as number,
  name: deployments.hostChain.chainName as string,
  // An RPC from a provider can be set per build; the public RPC is the fallback.
  rpc: (import.meta.env.PUBLIC_RPC_URL as string | undefined) || deployments.app.rpc,
  explorer: deployments.hostChain.explorer as string,
  gasFaucet: ((deployments.hostChain as { gasFaucet?: string }).gasFaucet || '') as string,
  /** Ways to bring ETH onto the chain, as listed in Robinhood Chain's own bridging docs. */
  bridges: ((deployments.hostChain as { bridges?: Bridge[] }).bridges || []) as Bridge[],
  bridgeDocs: ((deployments.hostChain as { bridgeDocs?: string }).bridgeDocs || '') as string,
};
type Bridge = { name: string; url: string; note: string };

/** The site's public address (SITE_URL at build time). Links people share always use it,
 * even when the app is opened from a preview address. */
export const SITE_ORIGIN = ((import.meta.env.SITE as string | undefined) || location.origin).replace(/\/$/, '');

/** How the pool is described next to every action. */
export const POOL_LABEL = isMainnet ? 'Mainnet pool' : 'Testnet pool';
