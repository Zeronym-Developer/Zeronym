// Live list of pool transactions, read from Robinhood Chain with plain JSON-RPC.
// Used by /api/pool, /llms.txt and the docs' Check it yourself page, so reviewers always see
// the current numbers instead of a list written by hand. Everything here is public chain data.
//
// How a transaction's kind is judged, from logs only:
// - pool events but no new notes: an admin call (token settings or the admin handover)
// - USDG moved into the pool: a shield
// - USDG moved out of the pool to anyone but the relayer: a withdrawal
// - otherwise: a private transfer (at most the relayer fee leaves the pool)
// A pool transaction only emits events if its proof passed the verifier; a bad proof reverts.

export const POOL = '0x84c21f20959f0d00892007f2a7cfe46d19077877';
export const POOL_BLOCK = 100011515;
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const USDG_DECIMALS = 6;
const RELAYERS = ['0xc38e587856452610f41bbb57be25a14d2eb2959a'];
const EXPLORER = 'https://robinhoodchain.blockscout.com';

const T = {
  commitment: '0xf3843eddcfcac65d12d9f26261dab50671fdbf5dc44441816c8bbdace2411afd',
  nullifier: '0x5e58f77bbf94b46d8d896e29753e4458c6e59b48581e20ed58c9558e96f297ce',
  tokenSupport: '0x9acd25432e73c8fd87c1f86fcc1337f44943fe5d5b8ff9651af0fd79a3e2b15e',
  adminChanged: '0x7ce7ec0b50378fb6c0186ffb5f48325f6593fcb4ca4386f21861af3129188f5c',
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
};
const pad = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const addrOf = (topic) => '0x' + topic.slice(26).toLowerCase();

// One call at a time, with a short retry on rate limits (public RPCs limit shared Worker IPs).
async function call(rpc, method, params) {
  let last;
  for (const wait of [0, 400, 1200, 2500]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'zeronym.lat pool stats' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (res.status === 429 || res.status >= 500) { last = `RPC answered ${res.status} to ${method}`; continue; }
    if (!res.ok) throw new Error(`RPC answered ${res.status} to ${method}`);
    const j = await res.json();
    if (j.error) { last = `RPC error on ${method}: ${JSON.stringify(j.error).slice(0, 120)}`; if (j.error.code === -32005 || /rate|limit/i.test(j.error.message || '')) continue; throw new Error(last); }
    return j.result;
  }
  throw new Error(last);
}
async function batch(rpc, calls) {
  const out = [];
  for (const [m, p] of calls) out.push(await call(rpc, m, p));
  return out;
}

// Reading every log since the pool's deploy block is heavy, and public RPCs rate-limit it from
// shared Worker IPs. So progress is kept as a small "state": the per-transaction totals and the
// last block scanned. Each refresh only reads the blocks added since then. The state starts from
// a snapshot shipped with the site (pool-seed.json), which anyone can re-check with the script.
const SCAN_CHUNK = 10_000; // within common provider limits for eth_getLogs
const MAX_SCAN = 300_000; // per refresh; the rest is read on the next one

/** Read the pool's logs between two blocks and fold them into the state. */
async function scan(rpc, state, from, to, relayers) {
  const txs = new Map(state.txs.map((t) => [t.hash, t]));
  const get = (l) => {
    if (!txs.has(l.transactionHash)) txs.set(l.transactionHash, { hash: l.transactionHash, block: parseInt(l.blockNumber, 16), index: parseInt(l.transactionIndex, 16), commitments: 0, nullifiers: 0, admin: '', inAmt: '0', outAmt: '0', fee: '0' });
    return txs.get(l.transactionHash);
  };
  const add = (t, k, v) => { t[k] = (BigInt(t[k]) + BigInt(v)).toString(); };
  for (let b = from; b <= to; b += SCAN_CHUNK) {
    const fromBlock = '0x' + b.toString(16), toBlock = '0x' + Math.min(b + SCAN_CHUNK - 1, to).toString(16);
    const [poolLogs, into, out] = await batch(rpc, [
      ['eth_getLogs', [{ address: POOL, fromBlock, toBlock }]],
      ['eth_getLogs', [{ address: USDG, fromBlock, toBlock, topics: [T.transfer, null, pad(POOL)] }]],
      ['eth_getLogs', [{ address: USDG, fromBlock, toBlock, topics: [T.transfer, pad(POOL)] }]],
    ]);
    for (const l of poolLogs) {
      const t = get(l);
      if (l.topics[0] === T.commitment) t.commitments++;
      else if (l.topics[0] === T.nullifier) t.nullifiers++;
      else if (l.topics[0] === T.tokenSupport) t.admin = 'turn on USDG deposits';
      else if (l.topics[0] === T.adminChanged) t.admin = 'hand the admin role to the Safe';
    }
    for (const l of into) if (txs.has(l.transactionHash)) add(txs.get(l.transactionHash), 'inAmt', l.data);
    for (const l of out) {
      const t = txs.get(l.transactionHash);
      if (t) add(t, relayers.has(addrOf(l.topics[2])) ? 'fee' : 'outAmt', l.data);
    }
  }
  return { scanned: to, txs: [...txs.values()] };
}

/** Bring the state up to the chain head and summarise it. */
export async function poolStats(rpc, extraRelayers = [], state = null) {
  const relayers = new Set([...RELAYERS, ...extraRelayers.map((a) => a.toLowerCase())]);
  const head = parseInt(await call(rpc, 'eth_blockNumber', []), 16);
  let st = state && state.scanned ? state : { scanned: POOL_BLOCK - 1, txs: [] };
  const target = Math.min(head, st.scanned + MAX_SCAN);
  if (target > st.scanned) st = await scan(rpc, st, st.scanned + 1, target, relayers);
  const balance = BigInt(await call(rpc, 'eth_call', [{ to: USDG, data: '0x70a08231' + pad(POOL).slice(2) }, 'latest']));
  return { stats: summarize(st, target, balance), state: { ...st, balance: balance.toString() } };
}

export function summarize(st, head, balance) {
  const list = [...st.txs].sort((a, b) => b.block - a.block || b.index - a.index).map((t) => {
    const inAmt = BigInt(t.inAmt), outAmt = BigInt(t.outAmt);
    return {
      hash: t.hash,
      block: t.block,
      kind: !t.commitments ? 'admin' : inAmt > 0n ? 'shield' : outAmt > 0n ? 'withdrawal' : 'private transfer',
      admin: t.admin || undefined,
      amountIn: inAmt,
      amountOut: outAmt,
      fee: BigInt(t.fee),
    };
  });
  const user = list.filter((t) => t.kind !== 'admin');
  const sum = (k, f) => user.filter((t) => !k || t.kind === k).reduce((a, t) => a + t[f], 0n);
  return {
    block: head,
    pool: POOL,
    counts: {
      user: user.length,
      shield: user.filter((t) => t.kind === 'shield').length,
      privateTransfer: user.filter((t) => t.kind === 'private transfer').length,
      withdrawal: user.filter((t) => t.kind === 'withdrawal').length,
      admin: list.length - user.length,
      notesCreated: st.txs.reduce((a, t) => a + t.commitments, 0),
      notesSpent: st.txs.reduce((a, t) => a + t.nullifiers, 0),
    },
    usdgDecimals: USDG_DECIMALS,
    usdg: { shielded: sum('shield', 'amountIn'), withdrawn: sum('withdrawal', 'amountOut'), relayerFees: sum('', 'fee'), inPool: balance },
    transactions: list,
  };
}

const usd = (v) => {
  const s = (Number(v) / 10 ** USDG_DECIMALS).toFixed(USDG_DECIMALS).replace(/\.?0+$/, '');
  return `${s} USDG`;
};
const what = (t) => t.kind === 'admin' ? `Admin: ${t.admin || 'pool settings'}`
  : t.kind === 'shield' ? 'Shield, from the sender’s wallet'
  : t.kind === 'withdrawal' ? `Withdrawal${t.fee > 0n ? ', through the relayer' : ''}`
  : `Private transfer${t.fee > 0n ? ', through the relayer' : ''}`;
const amountText = (t) => t.kind === 'admin' ? 'None'
  : t.kind === 'shield' ? `${usd(t.amountIn)} in`
  : t.kind === 'withdrawal' ? `${usd(t.amountOut)} out${t.fee > 0n ? `, plus ${usd(t.fee)} relayer fee` : ''}`
  : `None. ${t.fee > 0n ? `Only the ${usd(t.fee)} relayer fee leaves the pool; ` : ''}sender, recipient and amount stay encrypted`;

const lower = (x) => x[0].toLowerCase() + x.slice(1);

/** JSON-safe copy (bigints as decimal strings in base units). */
export function toJson(s) {
  return JSON.parse(JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

export function summaryLines(s) {
  const c = s.counts;
  return [
    `User transactions: ${c.user} (${c.shield} shields, ${c.privateTransfer} private transfers, ${c.withdrawal} withdrawals). Admin transactions: ${c.admin}.`,
    `USDG shielded in total: ${usd(s.usdg.shielded)}. Withdrawn in total: ${usd(s.usdg.withdrawn)}. Relayer fees: ${usd(s.usdg.relayerFees)}. In the pool now: ${usd(s.usdg.inPool)}.`,
    `Notes created: ${c.notesCreated} (NewCommitment events). Notes spent: ${c.notesSpent} (NewNullifier events).`,
  ];
}

export function renderText(s, limit = 100) {
  const rows = s.transactions.slice(0, limit);
  return [
    `## Pool transactions so far (live, read from Robinhood Chain at block ${s.block.toLocaleString('en-US')})`,
    '',
    'This section is generated from the chain each time llms.txt is requested (cached for up to two minutes). JSON: https://zeronym.lat/api/pool',
    '',
    ...summaryLines(s).map((l) => `- ${l}`),
    '- Every user transaction carries a zero-knowledge proof that the pool’s verifier accepted. A transaction with a bad proof reverts and leaves no events. To re-run every proof yourself, use the script under "Re-check it yourself".',
    '',
    `Newest first${s.transactions.length > limit ? `, the latest ${limit} of ${s.transactions.length}` : ''}:`,
    '',
    ...rows.map((t) => `- ${t.hash} (block ${t.block}): ${lower(what(t)).replace(/^admin: /, 'admin, ')}. ${t.kind === 'admin' ? 'No tokens move' : t.kind === 'private transfer' ? amountText(t).replace(/^None\. /, 'No public amount. ') : `Public amount: ${amountText(t)}`}.`),
    '',
  ].join('\n');
}

const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
export function renderHtml(s, limit = 100) {
  const rows = s.transactions.slice(0, limit);
  return `<p>Read live from Robinhood Chain at block ${s.block.toLocaleString('en-US')}, each time this page loads (cached for up to two minutes). The same data as JSON: <a href="/api/pool">/api/pool</a>.</p>
<ul>${summaryLines(s).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<table><thead><tr><th>Transaction</th><th>Kind</th><th>Public amount</th><th>Proof</th></tr></thead><tbody>
${rows.map((t) => `<tr><td><a href="${EXPLORER}/tx/${t.hash}" target="_blank" rel="noopener">${t.hash.slice(0, 10)}…</a></td><td>${esc(what(t))}</td><td>${esc(amountText(t))}</td><td>${t.kind === 'admin' ? 'No proof needed' : 'Accepted by the verifier'}</td></tr>`).join('\n')}
</tbody></table>${s.transactions.length > limit ? `<p>Showing the latest ${limit} of ${s.transactions.length}. The JSON has all of them.</p>` : ''}`;
}
