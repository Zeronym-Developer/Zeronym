// Shown when the connected wallet has no ETH on the chain: how to bring some in.
import { Icon } from './icons';
import { Note } from './kit';
import { NET } from '../lib/network';
import { useStore } from '../lib/store';

/** True once the wallet's balances have been read and it holds no ETH. */
export function useNoEth() {
  return useStore((s) => s.mode === 'testnet' && !!s.wallet && s.tn.balFor === s.wallet.address && BigInt(s.tn.eth || '0') === 0n);
}

export function GasHelp() {
  if (!NET.bridges.length) return null;
  return (
    <Note tone="info" title={`Get a little ETH on ${NET.name} first`} class="agas">
      <p>Your wallet pays a small network fee in ETH to shield. With Pay with ETH, the same ETH also buys the USDG you shield, so you don't need USDG first. A few dollars of ETH is enough to start.</p>
      <ul class="agas-l">
        {NET.bridges.map((b) => (
          <li><a class="alink" href={b.url} target="_blank" rel="noopener">{b.name} <Icon name="external" size={12} /></a><small>{b.note}</small></li>
        ))}
      </ul>
      {NET.bridgeDocs && <p class="agas-src">These routes are listed in <a class="alink" href={NET.bridgeDocs} target="_blank" rel="noopener">{NET.name}'s bridging docs</a>. Check the address bar before you connect your wallet.</p>}
    </Note>
  );
}
