// Pay with ETH: swap ETH for an exact, round token amount on Uniswap, then deposit as usual.
// Exact output keeps the deposit at the round amount the person typed, so it blends in with
// other deposits. Leftover ETH is refunded in the same transaction. Only on builds whose
// deployment record lists a swap route (mainnet).
// Receive as ETH: the other way round on withdrawal. The pool pays the round token amount to a
// one-off forwarder of the ETH exit contract, which swaps all of it for ETH in the same
// transaction and sends the ETH on (contracts/pool/contracts/ZeronymEthExit.sol). Only when
// the pool record lists the exit contract.
import { encodeFunctionData, decodeFunctionResult, parseAbi } from 'viem';
import deployments from '../../data/deployments.json';
import POOL from '../../../../../contracts/pool/deployments/testnet.json';
import { rpc } from './chain';
import { asset, parseUnits } from './amount';

type SwapConfig = { dex: string; router: `0x${string}`; quoter: `0x${string}`; weth: `0x${string}`; fees: number[]; slippageBps: number; gasReserveEth: string; tokens: string[] };
const CFG = (deployments.app as { swap?: SwapConfig }).swap;

export const SWAP_DEX = CFG?.dex || '';
export const canPayEth = (symbol: string) => !!CFG && CFG.tokens.includes(symbol) && !!asset(symbol).address;
/** ETH kept back for network fees (swap, approve and deposit together cost far less). */
export const GAS_RESERVE = CFG ? parseUnits(CFG.gasReserveEth, 18)! : 0n;
/** The ETH exit contract, when this network has one. */
export const ETH_EXIT = ((POOL as { contracts?: { ethExit?: { address?: string } } }).contracts?.ethExit?.address || '') as `0x${string}` | '';
export const canGetEth = (symbol: string) => !!ETH_EXIT && canPayEth(symbol);

const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);
const routerAbi = parseAbi([
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
  'function refundETH() payable',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
]);

export type EthQuote = { symbol: string; amountOut: bigint; ethIn: bigint; maxIn: bigint; fee: number; at: number };

/** The ETH needed for exactly `amountOut` of the token, on the cheapest listed pool. */
export async function quoteEth(symbol: string, amountOut: bigint): Promise<EthQuote> {
  if (!CFG || !canPayEth(symbol)) throw new Error('Paying with ETH isn’t available for this token.');
  const tokenOut = asset(symbol).address as `0x${string}`;
  const tries = await Promise.all(CFG.fees.map(async (fee) => {
    try {
      const data = encodeFunctionData({ abi: quoterAbi, functionName: 'quoteExactOutputSingle', args: [{ tokenIn: CFG.weth, tokenOut, amount: amountOut, fee, sqrtPriceLimitX96: 0n }] });
      const out = decodeFunctionResult({ abi: quoterAbi, functionName: 'quoteExactOutputSingle', data: await rpc('eth_call', [{ to: CFG.quoter, data }, 'latest']) });
      return { fee, ethIn: out[0] as bigint };
    } catch { return null; }
  }));
  const best = tries.filter((t): t is { fee: number; ethIn: bigint } => !!t).sort((a, b) => (a.ethIn < b.ethIn ? -1 : 1))[0];
  if (!best) throw new Error(`${CFG.dex} can’t fill that amount right now.`);
  // Slippage cap, rounded up. Anything not used comes back to the wallet.
  const maxIn = best.ethIn + (best.ethIn * BigInt(CFG.slippageBps) + 9999n) / 10000n;
  return { symbol, amountOut, ethIn: best.ethIn, maxIn, fee: best.fee, at: Date.now() };
}

/** One router call: swap up to `maxIn` ETH for exactly `amountOut`, sent to `recipient`, then refund the rest. */
export function swapTx(q: EthQuote, recipient: `0x${string}`): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
  if (!CFG) throw new Error('No swap route on this network.');
  const tokenOut = asset(q.symbol).address as `0x${string}`;
  const swap = encodeFunctionData({ abi: routerAbi, functionName: 'exactOutputSingle', args: [{ tokenIn: CFG.weth, tokenOut, fee: q.fee, recipient, amountOut: q.amountOut, amountInMaximum: q.maxIn, sqrtPriceLimitX96: 0n }] });
  const refund = encodeFunctionData({ abi: routerAbi, functionName: 'refundETH' });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  return { to: CFG.router, data: encodeFunctionData({ abi: routerAbi, functionName: 'multicall', args: [deadline, [swap, refund]] }), value: q.maxIn };
}

export type EthOutQuote = { symbol: string; amountIn: bigint; ethOut: bigint; minOut: bigint; fee: number; at: number };

/** The ETH that exactly `amountIn` of the token buys, on the best listed pool, and the least the swap may give. */
export async function quoteToEth(symbol: string, amountIn: bigint): Promise<EthOutQuote> {
  if (!CFG || !canGetEth(symbol)) throw new Error('Receiving ETH isn’t available for this token.');
  const tokenIn = asset(symbol).address as `0x${string}`;
  const tries = await Promise.all(CFG.fees.map(async (fee) => {
    try {
      const data = encodeFunctionData({ abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn, tokenOut: CFG.weth, amountIn, fee, sqrtPriceLimitX96: 0n }] });
      const out = decodeFunctionResult({ abi: quoterAbi, functionName: 'quoteExactInputSingle', data: await rpc('eth_call', [{ to: CFG.quoter, data }, 'latest']) });
      return { fee, ethOut: out[0] as bigint };
    } catch { return null; }
  }));
  const best = tries.filter((t): t is { fee: number; ethOut: bigint } => !!t && t.ethOut > 0n).sort((a, b) => (a.ethOut > b.ethOut ? -1 : 1))[0];
  if (!best) throw new Error(`${CFG.dex} can’t take that amount right now.`);
  // The swap reverts, and nothing is spent, if it would give less than this.
  const minOut = (best.ethOut * BigInt(10000 - CFG.slippageBps)) / 10000n;
  return { symbol, amountIn, ethOut: best.ethOut, minOut, fee: best.fee, at: Date.now() };
}
