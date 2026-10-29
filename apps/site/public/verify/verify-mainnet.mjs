// Independent check of the live Zeronym pool on Robinhood Chain. Read-only: it needs no key
// and sends no transaction. Anyone can run it against any public RPC.
//
// It is one file with one dependency (viem). In an empty folder:
//
//   npm init -y && npm i viem
//   node verify-mainnet.mjs                  # uses Robinhood Chain's public RPC
//   RPC_URL=https://... node verify-mainnet.mjs
//   node verify-mainnet.mjs --json           # machine-readable output
//
// It checks three things:
// 1. Admin powers: the pool is not a proxy, has no DELEGATECALL or SELFDESTRUCT in its code,
//    its verifier is fixed, and its admin is the listed Safe (owners and threshold read live).
// 2. Every pool transaction: what kind it is (shield, private transfer, withdrawal, or withdrawal
//    received as ETH through the ETH exit contract), judged from the call itself and the token
//    movements in its receipt.
// 3. Every proof: it is sent again to the deployed verifier with eth_call. A real proof returns
//    true. The same proof with one public input changed must return false.
import { createPublicClient, http, defineChain, parseAbi, decodeFunctionData, decodeEventLog, formatUnits, getAddress } from 'viem';

// The published mainnet record (zeronym.lat/docs/contracts/). The site build checks that these
// values match contracts/pool/deployments/mainnet.json.
const D = {
  chainId: 4663,
  contracts: {
    pool: { address: '0x84c21f20959f0d00892007f2a7cfe46d19077877', block: 100011515 },
    verifier: { address: '0xa1cb0bf67c66749bd6075ead69fb1ede77757101' },
    ethExit: { address: '0xcf05a3b5e418dd0afe3ffb075f7b64c27019bb63' },
  },
  tokens: { USDG: { address: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', decimals: 6 } },
  admin: '0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3',
};
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const asJson = process.argv.includes('--json');
const chain = defineChain({ id: D.chainId, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 3 }) });

const POOL = getAddress(D.contracts.pool.address);
const VERIFIER = getAddress(D.contracts.verifier.address);
const EXIT = getAddress(D.contracts.ethExit.address);
const TOKENS = Object.fromEntries(Object.entries(D.tokens).map(([sym, t]) => [t.address.toLowerCase(), { sym, decimals: t.decimals }]));

const proofT = '(bytes proof, bytes32 root, bytes32[2] inputNullifiers, bytes32[2] outputCommitments, uint256 publicAmount, bytes32 extDataHash)';
const extT = '(address recipient, int256 extAmount, address relayer, uint256 fee, bytes encryptedOutput1, bytes encryptedOutput2, address token)';
const poolAbi = parseAbi([
  `function transact(${proofT} _args, ${extT} _extData)`,
  `function verifyProof(${proofT} _args, address _token) view returns (bool)`,
  'function admin() view returns (address)',
  'function verifier() view returns (address)',
  'function supportedToken(address) view returns (bool)',
  'event NewCommitment(bytes32 commitment, uint256 index, bytes encryptedOutput)',
  'event NewNullifier(bytes32 nullifier)',
  'event TokenSupport(address indexed token, bool supported)',
  'event AdminChanged(address admin)',
]);
const orderT = '(address token, address recipient, uint256 minEthOut, uint256 deadline, uint24 fee, bytes32 nonce)';
const exitAbi = parseAbi([
  `function withdraw(${proofT} args, ${extT} extData, ${orderT} o) returns (uint256)`,
  'function pool() view returns (address)',
  'event Settled(address indexed forwarder, address indexed recipient, address token, uint256 amountIn, uint256 ethOut, bool swapped)',
]);
const safeAbi = parseAbi(['function getOwners() view returns (address[])', 'function getThreshold() view returns (uint256)', 'function VERSION() view returns (string)']);
const erc20 = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Walk runtime bytecode, skipping PUSH data, and report opcodes that could change what the code does.
function riskyOpcodes(code) {
  const b = Buffer.from(code.slice(2), 'hex');
  const found = new Set();
  for (let i = 0; i < b.length; i++) {
    const op = b[i];
    if (op === 0xf4) found.add('DELEGATECALL');
    if (op === 0xff) found.add('SELFDESTRUCT');
    if (op === 0xf2) found.add('CALLCODE');
    if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
    if (op === 0xfe) break; // INVALID marks the start of the metadata trailer
  }
  return [...found];
}

async function getPoolLogs(from, to) {
  try {
    return await pub.getLogs({ address: POOL, fromBlock: from, toBlock: to });
  } catch (e) {
    if (to - from < 1000n) throw e;
    const mid = from + (to - from) / 2n;
    return [...(await getPoolLogs(from, mid)), ...(await getPoolLogs(mid + 1n, to))];
  }
}

const fmt = (v, sym) => `${formatUnits(v, TOKENS[Object.keys(TOKENS).find((a) => TOKENS[a].sym === sym)]?.decimals ?? 18)} ${sym}`;

async function main() {
  const out = { rpc: RPC, chainId: await pub.getChainId(), pool: POOL, admin: {}, transactions: [] };
  if (out.chainId !== D.chainId) throw new Error(`RPC is on chain ${out.chainId}, expected ${D.chainId}`);

  // 1. Admin powers
  const [code, admin, verifier, implSlot, adminSlot, beaconSlot] = await Promise.all([
    pub.getCode({ address: POOL }),
    pub.readContract({ address: POOL, abi: poolAbi, functionName: 'admin' }),
    pub.readContract({ address: POOL, abi: poolAbi, functionName: 'verifier' }),
    pub.getStorageAt({ address: POOL, slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' }),
    pub.getStorageAt({ address: POOL, slot: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' }),
    pub.getStorageAt({ address: POOL, slot: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' }),
  ]);
  const zero = (s) => !s || BigInt(s === "0x" ? 0 : s) === 0n;
  const [owners, threshold, version] = await Promise.all([
    pub.readContract({ address: admin, abi: safeAbi, functionName: 'getOwners' }).catch(() => null),
    pub.readContract({ address: admin, abi: safeAbi, functionName: 'getThreshold' }).catch(() => null),
    pub.readContract({ address: admin, abi: safeAbi, functionName: 'VERSION' }).catch(() => null),
  ]);
  const tokenState = {};
  for (const [addr, t] of Object.entries(TOKENS)) {
    const a = getAddress(addr);
    tokenState[t.sym] = {
      supported: await pub.readContract({ address: POOL, abi: poolAbi, functionName: 'supportedToken', args: [a] }),
      cap: 'none (the pool has no cap setting)',
    };
  }
  out.admin = {
    admin,
    adminMatchesDocs: admin.toLowerCase() === D.admin.toLowerCase(),
    safe: owners ? { version, threshold: Number(threshold), owners } : null,
    verifier,
    verifierMatchesDocs: verifier === VERIFIER,
    proxySlotsEmpty: zero(implSlot) && zero(adminSlot) && zero(beaconSlot),
    riskyOpcodes: riskyOpcodes(code),
    tokens: tokenState,
  };

  out.ethExitPoolMatches = getAddress(await pub.readContract({ address: EXIT, abi: exitAbi, functionName: 'pool' })) === POOL;

  // 2 and 3. Every pool transaction
  const logs = await getPoolLogs(BigInt(D.contracts.pool.block), await pub.getBlockNumber());
  const hashes = [...new Set(logs.map((l) => l.transactionHash))];
  for (const hash of hashes) {
    const [tx, rc] = await Promise.all([pub.getTransaction({ hash }), pub.getTransactionReceipt({ hash })]);
    const row = { tx: hash, block: Number(rc.blockNumber), from: tx.from, status: rc.status };
    const events = rc.logs.filter((l) => l.address.toLowerCase() === POOL.toLowerCase()).map((l) => { try { return decodeEventLog({ abi: poolAbi, ...l }).eventName; } catch { return 'unknown'; } });
    row.poolEvents = events;
    // Transfers only: a token can log other events in the same transaction (an approval, for example).
    row.tokenMoves = rc.logs.filter((l) => TOKENS[l.address.toLowerCase()] && l.topics[0] === TRANSFER_TOPIC).map((l) => {
      const e = decodeEventLog({ abi: erc20, ...l });
      const sym = TOKENS[l.address.toLowerCase()].sym;
      const dir = e.args.to.toLowerCase() === POOL.toLowerCase() ? 'into pool' : e.args.from.toLowerCase() === POOL.toLowerCase() ? 'out of pool' : 'other';
      return { dir, amount: fmt(e.args.value, sym), from: e.args.from, to: e.args.to };
    });
    let call = null;
    let order = null;
    if (tx.to?.toLowerCase() === POOL.toLowerCase()) { try { call = decodeFunctionData({ abi: poolAbi, data: tx.input }); } catch { /* not a decodable pool call */ } }
    // A withdrawal received as ETH: the ETH exit contract made the pool call.
    if (tx.to?.toLowerCase() === EXIT.toLowerCase()) {
      try { const c = decodeFunctionData({ abi: exitAbi, data: tx.input }); call = { functionName: 'transact', args: [c.args[0], c.args[1]] }; order = c.args[2]; } catch { /* not a decodable exit call */ }
    }
    if (!call || call.functionName !== 'transact') {
      row.kind = events.includes('TokenSupport') ? 'admin: token settings' : events.includes('AdminChanged') ? 'admin: admin handover' : 'not a direct pool call (check by hand)';
      out.transactions.push(row);
      continue;
    }
    const [args, ext] = call.args;
    const sym = TOKENS[ext.token.toLowerCase()]?.sym || ext.token;
    row.kind = order ? 'withdrawal, received as ETH' : ext.extAmount > 0n ? 'shield' : ext.extAmount < 0n ? 'withdrawal' : 'private transfer';
    row.publicAmount = ext.extAmount === 0n ? `0 ${sym} (nothing enters or leaves)` : fmt(ext.extAmount < 0n ? -ext.extAmount : ext.extAmount, sym);
    row.relayerFee = fmt(ext.fee, sym);
    row.submittedBy = ext.relayer.toLowerCase() === tx.from.toLowerCase() && ext.fee > 0n ? 'relayer' : 'own wallet';
    if (ext.extAmount < 0n) row.withdrawTo = ext.recipient;
    if (order) {
      const settled = rc.logs.filter((l) => l.address.toLowerCase() === EXIT.toLowerCase()).map((l) => { try { return decodeEventLog({ abi: exitAbi, ...l }); } catch { return null; } }).find((e) => e?.eventName === 'Settled');
      row.withdrawTo = order.recipient;
      row.viaForwarder = ext.recipient;
      row.ethReceived = settled ? `${formatUnits(settled.args.ethOut, 18)} ETH (at least ${formatUnits(order.minEthOut, 18)} was required)` : 'no Settled event (check by hand)';
    }
    row.nullifiers = args.inputNullifiers;
    row.newNotes = args.outputCommitments;
    // Re-run the proof against the deployed verifier. verifyProof checks only the SNARK, so it
    // still answers for proofs whose notes are already spent.
    row.proofAccepted = await pub.readContract({ address: POOL, abi: poolAbi, functionName: 'verifyProof', args: [args, ext.token] });
    const tampered = { ...args, publicAmount: (args.publicAmount + 1n) };
    row.tamperedProofRejected = !(await pub.readContract({ address: POOL, abi: poolAbi, functionName: 'verifyProof', args: [tampered, ext.token] }));
    out.transactions.push(row);
  }

  if (asJson) { console.log(JSON.stringify(out, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)); return; }

  const ok = (b) => (b ? 'yes' : 'NO');
  console.log(`Zeronym pool ${POOL} on chain ${out.chainId} (RPC ${RPC})\n`);
  console.log('Admin powers');
  console.log(`  admin is the listed Safe:        ${ok(out.admin.adminMatchesDocs)} (${admin})`);
  if (out.admin.safe) console.log(`  Safe ${out.admin.safe.version}, ${out.admin.safe.threshold} of ${out.admin.safe.owners.length} owners: ${out.admin.safe.owners.join(', ')}`);
  console.log(`  verifier is the listed one:      ${ok(out.admin.verifierMatchesDocs)} (${verifier}, fixed at deploy)`);
  console.log(`  not a proxy (EIP-1967 slots):    ${ok(out.admin.proxySlotsEmpty)}`);
  console.log(`  no DELEGATECALL/SELFDESTRUCT:    ${ok(out.admin.riskyOpcodes.length === 0)}${out.admin.riskyOpcodes.length ? ' found ' + out.admin.riskyOpcodes.join(', ') : ''}`);
  for (const [s, t] of Object.entries(tokenState)) console.log(`  ${s}: deposits ${t.supported ? 'on' : 'off'}, deposit cap: ${t.cap}`);
  console.log(`  ETH exit ${EXIT} is fixed to this pool: ${ok(out.ethExitPoolMatches)}`);
  console.log(`\nPool transactions: ${out.transactions.length}`);
  for (const r of out.transactions) {
    console.log(`\n  ${r.tx}  block ${r.block}  ${r.status}`);
    console.log(`    kind: ${r.kind}`);
    if (r.publicAmount) {
      console.log(`    public amount: ${r.publicAmount}; relayer fee ${r.relayerFee}; sent from ${r.submittedBy} ${r.from}`);
      if (r.ethReceived) console.log(`    received as ETH: ${r.ethReceived} at ${r.withdrawTo}`);
      for (const m of r.tokenMoves) console.log(`    token move: ${m.amount} ${m.dir} (${m.from} -> ${m.to})`);
      if (!r.tokenMoves.length) console.log('    token move: none');
      console.log(`    verifier accepts the proof:      ${ok(r.proofAccepted)}`);
      console.log(`    verifier rejects a changed copy: ${ok(r.tamperedProofRejected)}`);
    }
  }
  const counts = out.transactions.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {});
  console.log(`\nSummary: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);
}

main().catch((e) => { console.error(e.shortMessage || e.message || e); process.exit(1); });
