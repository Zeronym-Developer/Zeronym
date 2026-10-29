// Updates which tokens the testnet pool accepts for deposits.
// TESTNET ONLY. Usage: DEPLOYER_KEY_FILE=/path/to/key node scripts/set-tokens-testnet.mjs
// Turning a token off blocks new deposits only; existing notes can still be sent and withdrawn.
import { readFileSync, writeFileSync } from 'node:fs';
import { createWalletClient, createPublicClient, http, defineChain, parseAbi, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const chain = defineChain({
  id: 46630, name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } }, testnet: true,
});
const OUT = 'deployments/testnet.json';
const rec = JSON.parse(readFileSync(OUT, 'utf8'));
const POOL = rec.contracts.pool.address;
// Paxos-issued testnet USDG on Robinhood Chain testnet (docs.paxos.com, "USDG on test networks").
const USDG = getAddress('0x7E955252E15c84f5768B83c41a71F9eba181802F');
const abi = parseAbi(['function setToken(address,bool,uint256)', 'function supportedToken(address) view returns (bool)', 'function maxDeposit(address) view returns (uint256)', 'function admin() view returns (address)']);
const erc = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);

const account = privateKeyToAccount(readFileSync(process.env.DEPLOYER_KEY_FILE, 'utf8').trim());
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ chain, transport: http(), account });
if ((await pub.getChainId()) !== 46630) throw new Error('Wrong chain');
if ((await pub.readContract({ address: POOL, abi, functionName: 'admin' })).toLowerCase() !== account.address.toLowerCase()) throw new Error('Key is not the pool admin');
if ((await pub.readContract({ address: USDG, abi: erc, functionName: 'symbol' })) !== 'USDG') throw new Error('USDG check failed');
if ((await pub.readContract({ address: USDG, abi: erc, functionName: 'decimals' })) !== 6) throw new Error('USDG decimals check failed');

const plan = [
  ['USDG', USDG, true, 10_000_000_000n],                       // up to 10,000 USDG per deposit
  ['tUSD', getAddress(rec.tokens.tUSD.address), false, 0n],    // retired: no new deposits
];
rec.tokenChanges ||= [];
for (const [sym, token, on, max] of plan) {
  const cur = await pub.readContract({ address: POOL, abi, functionName: 'supportedToken', args: [token] });
  const curMax = await pub.readContract({ address: POOL, abi, functionName: 'maxDeposit', args: [token] });
  if (cur === on && curMax === max) { console.log(`${sym}: already set`); continue; }
  const hash = await wallet.writeContract({ address: POOL, abi, functionName: 'setToken', args: [token, on, max] });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${sym}: setToken reverted`);
  console.log(`${sym}: supported=${on} maxDeposit=${max} tx ${hash}`);
  rec.tokenChanges.push({ token: sym, address: token, supported: on, maxDeposit: max.toString(), tx: hash, block: Number(r.blockNumber) });
}
rec.tokens.USDG = { address: USDG.toLowerCase(), decimals: 6, maxDeposit: '10000000000', faucet: false, issuer: 'Paxos testnet USDG', faucetUrl: 'https://faucet.paxos.com/' };
rec.tokens.tUSD.retired = true;
writeFileSync(OUT, JSON.stringify(rec, null, 2));
console.log('Saved', OUT);
