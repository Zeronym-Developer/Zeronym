// Fallback withdrawal route (PRD R3.11).
import { Icon } from '../ui/icons';
import { Card, Chip, Note } from '../ui/kit';
import { NET } from '../lib/network';

const steps = [
  ['Restore your keys offline', 'Open the open-source fallback tool on your own computer and enter your recovery phrase. It never talks to Zeronym servers.'],
  ['Rebuild your notes from the chain', 'The tool reads pool events from any public RPC you choose, and finds the notes your keys can open.'],
  ['Build the proof locally', 'It proves the withdrawal on your machine, exactly as this app would.'],
  ['Submit from your own wallet', 'You send the withdrawal transaction yourself and pay the network fee. No relayer is involved.'],
];

export function Fallback() {
  return (
    <div class="afall">
      <Note tone="info" title="Tool not published yet">{NET.isTestnet ? 'The testnet pool is live, but the standalone fallback tool isn\'t published yet. The steps below are how it will work. Testnet tokens have no value.' : 'The pool is live on Robinhood Chain, but the standalone fallback tool isn\'t published yet. The steps below are how it will work.'}</Note>
      <div class="afall-grid">
        <Card class="afall-steps" glow>
          <p class="akicker">The route</p>
          <h2>Withdraw without this app, the relayer or the indexer.</h2>
          <ol>{steps.map(([t, d], i) => <li><span>{i + 1}</span><div><b>{t}</b><small>{d}</small></div></li>)}</ol>
          <div class="afall-status"><Chip tone="neutral" icon="clock">Tool: not published</Chip><Chip tone="violet" icon="check">{NET.isTestnet ? 'Pool contract: testnet only' : 'Pool contract: mainnet'}</Chip></div>
        </Card>
        <Card class="afall-meta">
          <p class="akicker"><Icon name="warn" size={14} />Extra metadata this route can expose</p>
          <ul>
            <li><b>Your wallet pays the fee</b><span>The address that submits the withdrawal is public and linked to it. Use an address that isn't tied to you.</span></li>
            <li><b>The RPC sees your requests</b><span>The RPC provider you choose sees your IP address and which events you read.</span></li>
            <li><b>No timing help</b><span>There's no relayer queue or delayed submission, so timing links are easier.</span></li>
          </ul>
          <a class="alink" href="/docs/security-model/" target="_blank" rel="noopener">Security model <Icon name="external" size={12} /></a>
        </Card>
      </div>
    </div>
  );
}
