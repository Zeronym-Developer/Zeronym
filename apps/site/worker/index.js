// Zeronym site Worker: serves the static site, the waitlist API and the pool relayer.
// Privacy rule: never log or store IP addresses. The waitlist never accepts wallet addresses.
import { relay, relayerAddress } from './relayer.js';
import { poolStats, summarize, renderText, renderHtml, toJson } from './pool-stats.js';
import SEED from './pool-seed.json';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function verifyTurnstile(token, secret) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await res.json();
  return out.success === true;
}

async function handleWaitlist(request, env) {
  if (request.method !== 'POST') return json(405, { message: 'Use POST.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { message: 'Send the form again; the request was not valid.' }); }

  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return json(400, { message: 'Enter a valid email address.' });
  if (body.consent !== true) return json(400, { message: 'Tick the box to agree to receive updates.' });
  // Honeypot: real visitors never fill the hidden "website" field.
  if (body.website) return json(200, { message: 'You are on the list. We will email you only when records are published.' });

  // Rate limit per connection. The IP is used only as a transient key and is never stored or logged.
  if (env.WAITLIST_LIMIT) {
    const { success } = await env.WAITLIST_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
    if (!success) return json(429, { message: 'Too many attempts. Wait a minute and try again.' });
  }

  // Turnstile is required whenever a secret is configured.
  if (env.TURNSTILE_SECRET) {
    if (!body.token) return json(400, { message: 'Complete the human check, then try again.' });
    const human = await verifyTurnstile(String(body.token), env.TURNSTILE_SECRET);
    if (!human) return json(400, { message: 'The human check expired. Complete it again and resend.' });
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    'INSERT INTO waitlist (email, consent_at, status, created_at) VALUES (?1, ?2, ?3, ?2) ON CONFLICT(email) DO NOTHING'
  ).bind(email, now, 'subscribed').run();

  const added = result.meta && result.meta.changes > 0;
  return json(200, {
    message: added
      ? 'You are on the list. We will email you only when records are published.'
      : 'This address is already on the list.',
  });
}

// ---- Live pool transactions (llms.txt, the docs' Check it yourself page, /api/pool) ----
// Progress is kept in D1 (one row: the last block scanned and per-transaction totals), so each
// refresh reads only the new blocks. Nothing about visitors is stored.
const POOL_TTL = 120_000;
let poolCache = null; // { at, stats } per Worker instance
async function loadState(env) {
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS pool_state (id INTEGER PRIMARY KEY, scanned INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
    const row = await env.DB.prepare('SELECT scanned, data FROM pool_state WHERE id = 1').first();
    if (row && row.scanned >= SEED.scanned) return JSON.parse(row.data);
  } catch { /* fall back to the shipped snapshot */ }
  return SEED;
}
async function saveState(env, state) {
  try {
    await env.DB.prepare('INSERT INTO pool_state (id, scanned, data, updated_at) VALUES (1, ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET scanned = excluded.scanned, data = excluded.data, updated_at = excluded.updated_at WHERE excluded.scanned > pool_state.scanned')
      .bind(state.scanned, JSON.stringify(state), new Date().toISOString()).run();
  } catch { /* next request scans again */ }
}
async function livePool(env) {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL) return poolCache.stats;
  const state = await loadState(env);
  let extra = [];
  try { const a = relayerAddress(env); if (a) extra = [a]; } catch { /* no relayer key here */ }
  // The provider RPC first if one is set, then the chain's public RPC.
  const rpcs = [...new Set([env.RPC_URL, 'https://rpc.mainnet.chain.robinhood.com'].filter(Boolean))];
  let res, err;
  for (const rpc of rpcs) {
    try { res = await poolStats(rpc, extra, state); break; } catch (e) { err = e; }
  }
  if (!res) {
    // Serve what was last read rather than nothing.
    if (state.balance != null) {
      const stats = summarize(state, state.scanned, BigInt(state.balance));
      poolCache = { at: Date.now() - POOL_TTL + 60_000, stats }; // try the chain again in a minute
      return stats;
    }
    throw err;
  }
  poolCache = { at: Date.now(), stats: res.stats };
  await saveState(env, res.state);
  return res.stats;
}

// Swap the hand-written section of llms.txt for the live one. If the chain can't be read,
// the static file is served as is.
async function serveLlms(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok) return res;
  const text = await res.text();
  const start = text.indexOf('## Pool transactions so far');
  const end = text.indexOf('## Re-check it yourself');
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'public, max-age=60');
  if (start < 0 || end < start) return new Response(text, { status: res.status, headers });
  try {
    const live = renderText(await livePool(env));
    return new Response(text.slice(0, start) + live + '\n' + text.slice(end), { status: res.status, headers });
  } catch {
    return new Response(text, { status: res.status, headers });
  }
}

// Fill <div id="pool-txs"> on the Check it yourself page with the live table.
async function serveVerify(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  let html;
  try { html = renderHtml(await livePool(env)); } catch { return res; }
  const out = new HTMLRewriter().on('#pool-txs', { element(el) { el.setInnerContent(html, { html: true }); } }).transform(res);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60');
  return new Response(out.body, { status: out.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/waitlist') {
      try { return await handleWaitlist(request, env); }
      catch { return json(500, { message: 'Something went wrong on our side. Please try again in a minute.' }); }
    }
    if (url.pathname === '/api/relay') {
      try { return await relay(request, env); }
      catch { return json(500, { message: 'The relayer had a problem. Nothing was spent. Try again in a minute.' }); }
    }
    if (url.pathname === '/api/pool') {
      try {
        const body = JSON.stringify(toJson(await livePool(env)), null, 2);
        return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' } });
      } catch (e) { return json(503, { message: 'Couldn\u2019t read the chain just now. Try again in a minute.', reason: String(e?.message || e).slice(0, 160) }); }
    }
    if (url.pathname === '/llms.txt') return serveLlms(request, env);
    if (url.pathname === '/docs/verify/' || url.pathname === '/docs/verify') return serveVerify(request, env);
    if (url.pathname.startsWith('/api/')) return json(404, { message: 'Not found.' });
    return env.ASSETS.fetch(request);
  },
};
