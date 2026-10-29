// Activity: a searchable statement of every action, grouped by day.
import { useState } from 'preact/hooks';
import { Btn, Empty, Money, Seg, cx } from '../ui/kit';
import { Panel } from '../ui/dash';
import { ActivityTable, isPublicKind } from '../ui/activity';
import { useStore, pushToast, vaultName, KIND_LABEL, type Activity, type State } from '../lib/store';
import { href, setQuery, useRoute } from '../lib/router';
import { ASSETS, asset, parseUnits } from '../lib/amount';
import { statusLabel } from '../ui/kit';
import { sync } from '../lib/pool';
import { Icon } from '../ui/icons';
import { ReceiptTools, ReceiptButtons } from '../ui/receipts';
import { NET } from '../lib/network';

// Filters live in the URL, so the header's export and the top search bar share them.
type Filters = { q: string; dir: string; when: string; vault: string; asset: string; status: string; view: string };
const KEYS: (keyof Filters)[] = ['q', 'dir', 'when', 'vault', 'asset', 'status', 'view'];
const read = (q: URLSearchParams): Filters => Object.fromEntries(KEYS.map((k) => [k, q.get(k) || ''])) as Filters;
const DIR: Record<string, Activity['kind'][]> = { in: ['shield', 'receive'], out: ['send', 'withdraw'], self: ['move'] };
const live = (a: Activity) => a.status !== 'credited' && a.status !== 'failed';

function since(w: string) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (w === 'today') return [d.getTime(), Infinity];
  if (w === '7d') { d.setDate(d.getDate() - 6); return [d.getTime(), Infinity]; }
  if (w === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), Infinity];
  if (w === 'last') return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime()];
  return [0, Infinity];
}

/** Free text plus key:value terms: kind:send vault:savings asset:tUSD status:failed amount:>100 to:zn1q */
export function filterActivity(s: State, f: Filters) {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const [from, to] = since(f.when);
  return s.activity.filter((a) => {
    if (f.dir && !DIR[f.dir]?.includes(a.kind)) return false;
    if (a.createdAt < from || a.createdAt >= to) return false;
    if (f.vault && a.vault !== f.vault && a.toVault !== f.vault) return false;
    if (f.asset && a.asset !== f.asset) return false;
    if (f.status === 'done' && a.status !== 'credited') return false;
    if (f.status === 'live' && !live(a)) return false;
    if (f.status === 'failed' && a.status !== 'failed') return false;
    const hay = [KIND_LABEL[a.kind], a.kind, vaultName(s, a.vault), a.toVault ? vaultName(s, a.toVault) : '', a.memo, a.counterparty, a.tx, a.asset, statusLabel(a), isPublicKind(a.kind) ? 'public' : 'private'].join(' ').toLowerCase();
    return terms.every((t) => {
      const m = t.match(/^(\w+):(.*)$/);
      if (!m) return hay.includes(t);
      const [, k, v] = m;
      if (!v) return true;
      if (k === 'kind' || k === 'type') return a.kind.startsWith(v) || KIND_LABEL[a.kind].toLowerCase().includes(v);
      if (k === 'vault') return vaultName(s, a.vault).toLowerCase().includes(v) || (!!a.toVault && vaultName(s, a.toVault).toLowerCase().includes(v));
      if (k === 'asset') return a.asset.toLowerCase() === v;
      if (k === 'status') return v.startsWith('fail') ? a.status === 'failed' : v.startsWith('pend') || v.startsWith('prog') ? live(a) : a.status === 'credited';
      if (k === 'to' || k === 'from' || k === 'addr') return (a.counterparty || '').toLowerCase().includes(v);
      if (k === 'memo' || k === 'note') return (a.memo || '').toLowerCase().includes(v);
      if (k === 'amount') {
        const mm = v.match(/^(>=|<=|>|<|=)?([\d.]+)$/);
        if (!mm) return true;
        const n = parseUnits(mm[2], asset(a.asset).decimals);
        if (n === null) return true;
        const x = BigInt(a.amount);
        return mm[1] === '>' ? x > n : mm[1] === '<' ? x < n : mm[1] === '>=' ? x >= n : mm[1] === '<=' ? x <= n : x === n;
      }
      return hay.includes(t);
    });
  });
}

export function ActivityPage() {
  const { q } = useRoute();
  const s = useStore((x) => x);
  const f = read(q);
  const set = (p: Partial<Filters>) => setQuery({ ...f, ...p });
  const shown = filterActivity(s, f);
  const main = ASSETS[0].symbol;
  const sum = (kinds: Activity['kind'][]) => shown.filter((a) => a.asset === main && a.status === 'credited' && kinds.includes(a.kind)).reduce((t, a) => t + BigInt(a.amount), 0n);
  const any = KEYS.some((k) => k !== 'view' && f[k]);
  const testnet = s.mode === 'testnet';
  const vaults = s.vaults.filter((v) => !v.archived || s.activity.some((a) => a.vault === v.id));
  if (!s.activity.length) return (
    <>
      <Empty icon="activity" title="No activity yet">
        <p>{testnet ? (NET.isTestnet ? 'Shield test dollars to see the full lifecycle of an action on testnet.' : 'Shield some USDG to see the full lifecycle of an action.') : 'Shield demo funds to see the full lifecycle of an action.'}</p>
        <Btn kind="primary" icon="shield" href={href('shield')}>{testnet ? (NET.isTestnet ? 'Shield test dollars' : 'Shield USDG') : 'Shield demo funds'}</Btn>
      </Empty>
      <ReceiptTools />
    </>
  );
  return (
    <div class="aact5">
      <div class="dstrip">
        <div><span>Actions</span><b>{shown.length}</b></div>
        <div class="in"><span>Money in</span><b><Money v={sum(['shield', 'receive'])} symbol={main} /></b></div>
        <div><span>Money out</span><b><Money v={sum(['send', 'withdraw'])} symbol={main} /></b></div>
        <div class="hide-s"><span>In progress</span><b>{shown.filter(live).length}</b></div>
      </div>

      <Panel flush class="aact5-table">
        <div class="dtool">
          <div class="dtool-r1">
            <label class="dsearch">
              <Icon name="search" size={17} />
              <input type="search" value={f.q} placeholder="Search, or filter like kind:send" aria-label="Search activity" onInput={(e) => set({ q: (e.target as HTMLInputElement).value })} />
            </label>
            <Seg label="Direction" value={f.dir || 'all'} onChange={(v) => set({ dir: v === 'all' ? '' : v })} options={[['all', 'All'], ['in', 'In'], ['out', 'Out'], ['self', 'Between vaults']]} />
          </div>
          <div class="dtool-r2">
            <span class="dpill"><Icon name="calendar" size={15} /><select value={f.when} onChange={(e) => set({ when: (e.target as HTMLSelectElement).value })} aria-label="Date">
              <option value="">Any date</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="month">This month</option><option value="last">Last month</option>
            </select></span>
            <span class="dpill"><select value={f.vault} onChange={(e) => set({ vault: (e.target as HTMLSelectElement).value })} aria-label="Vault">
              <option value="">All vaults</option>{vaults.map((v) => <option value={v.id}>{v.name}</option>)}
            </select></span>
            <span class="dpill"><select value={f.asset} onChange={(e) => set({ asset: (e.target as HTMLSelectElement).value })} aria-label="Asset">
              <option value="">All assets</option>{ASSETS.map((a) => <option value={a.symbol}>{a.symbol}</option>)}
            </select></span>
            <span class="dpill"><select value={f.status} onChange={(e) => set({ status: (e.target as HTMLSelectElement).value })} aria-label="Status">
              <option value="">Any status</option><option value="done">Done</option><option value="live">In progress</option><option value="failed">Failed</option>
            </select></span>
            {any && <button type="button" class="alink dclear" onClick={() => setQuery(f.view ? { view: f.view } : {})}>Clear filters</button>}
            <span class="dtool-sp" />
            <Seg label="Point of view" value={f.view === 'stranger' ? 'out' : 'me'} onChange={(v) => set({ view: v === 'out' ? 'stranger' : '' })} options={[['me', 'You'], ['out', 'A stranger']]} />
          </div>
        </div>
        {f.view === 'stranger' && <p class="ov-out-note dtool-note"><Icon name="globe" size={14} />This is what anyone reading the chain sees. Only shields and withdrawals are tied to an address.</p>}
        <ActivityTable list={shown} byDay actions outsider={f.view === 'stranger'}
          empty={<div class="dnone big"><Icon name="search" size={22} /><p>Nothing matches these filters.</p>{any && <Btn kind="secondary" size="sm" onClick={() => setQuery({})}>Clear filters</Btn>}</div>} />
      </Panel>
      <p class="aact-foot"><Icon name="lock" size={14} />This history is stored encrypted on this device. You can export an encrypted copy from <a href={href('account')}>Privacy account</a>. To prove one payment, open it and share a receipt.</p>
      <ReceiptTools />
    </div>
  );
}

// ---- Header actions: viewing key, and sync with the pool on testnet ----
export function ActivityActions() {
  const testnet = useStore((s) => s.mode === 'testnet');
  const [busy, setBusy] = useState(false);
  const doSync = () => {
    setBusy(true);
    sync().then(() => pushToast({ tone: 'ok', title: 'Synced with the pool' })).catch((e) => pushToast({ tone: 'bad', title: 'Sync failed', body: e?.message })).finally(() => setBusy(false));
  };
  return (
    <>
      {testnet && <Btn kind="secondary" icon="refresh" disabled={busy} onClick={doSync} class={cx(busy && 'spinning')}>{busy ? 'Syncing…' : 'Sync now'}</Btn>}
      <ReceiptButtons />
    </>
  );
}
