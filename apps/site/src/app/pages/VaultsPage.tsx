// Vaults: labels on your private balance. Open a vault to see the tokens it holds.
// Vaults live only on this device, encrypted, and don't add privacy on their own.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { AssetGlyph, Btn, Chip, Money, cx } from '../ui/kit';
import { Panel } from '../ui/dash';
import { href, setQuery, useRoute } from '../lib/router';
import { useStore, setState, balances, activeVaults, type Vault } from '../lib/store';
import { ASSETS } from '../lib/amount';
import { ConnectCard } from '../ui/flow';
import { CreateVault, MoveModal, firstVault } from './Vaults';

const held = (b: { spendable: bigint; incoming: bigint; outgoing: bigint }) => b.spendable > 0n || b.incoming > 0n || b.outgoing > 0n;

export function VaultsPage() {
  const s = useStore((x) => x);
  const { q } = useRoute();
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const vaults = activeVaults(s);
  const [open, setOpen] = useState<Set<string>>(() => {
    const first = vaults.find((v) => ASSETS.some((a) => held(balances(s, v.id)[a.symbol]))) || vaults[0];
    return new Set(first ? [first.id] : []);
  });
  // From the Get set up steps: make sure there's a second vault to move into, then open the move.
  const first = q.get('first') === '1';
  useEffect(() => { if (first && s.keys && vaults.length === 1) firstVault(); }, [first, !!s.keys, vaults.length]);
  if (!s.keys) return <div class="avpage"><ConnectCard title="Your vaults appear once you have a privacy key" /></div>;
  const archived = s.vaults.filter((v) => v.archived);
  const total = balances(s);
  const tokensHeld = ASSETS.filter((a) => held(total[a.symbol])).length;
  const moving = moveFrom || ((q.get('move') === '1' || first) && vaults.length > 1 ? vaults[0].id : null);
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div class="avpage">
      <div class="dstrip">
        <div><span>Vaults</span><b>{vaults.length}</b></div>
        <div><span>Tokens held privately</span><b>{tokensHeld}</b></div>
        <div><span>Archived</span><b>{archived.length}</b></div>
      </div>

      <Panel flush title="Your vaults" sub="Labels for your private balance, like Savings or Taxes. Open a vault to see what it holds. Moving between vaults is a private transfer inside the pool."
        actions={archived.length > 0 && <button type="button" class="alink" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide archived' : `Show archived (${archived.length})`}</button>}>
        <div class="avl">
          {vaults.map((v) => <VaultRow v={v} open={open.has(v.id)} onToggle={() => toggle(v.id)} onMove={() => setMoveFrom(v.id)} canMove={vaults.length > 1} />)}
          {showArchived && archived.map((v) => <VaultRow v={v} open={open.has(v.id)} onToggle={() => toggle(v.id)} onMove={() => {}} canMove={false} />)}
        </div>
      </Panel>
      <p class="aact-foot"><Icon name="lock" size={14} />Vault names and splits are stored encrypted on this device. On chain, every vault is just notes owned by the same key.</p>

      <CreateVault open={q.get('new') === '1'} onClose={() => setQuery({})} />
      {moving && <MoveModal from={moving} amount={moveFrom ? undefined : q.get('amount') || undefined} onClose={() => { setMoveFrom(null); if (q.get('move') || first) setQuery({}); }} />}
    </div>
  );
}

function VaultRow({ v, open, onToggle, onMove, canMove }: { v: Vault; open: boolean; onToggle: () => void; onMove: () => void; canMove: boolean }) {
  const s = useStore((x) => x);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(v.name);
  const b = balances(s, v.id);
  const total = balances(s);
  const tokens = ASSETS.filter((a) => held(b[a.symbol]));
  const empty = tokens.length === 0;
  const isLast = activeVaults(s).length === 1;
  const count = s.activity.filter((a) => a.vault === v.id || a.toVault === v.id).length;
  const save = () => { const n = name.trim().slice(0, 32); if (n) setState((st) => { st.vaults = st.vaults.map((x) => (x.id === v.id ? { ...x, name: n } : x)); }); setEditing(false); };
  const archive = (on: boolean) => setState((st) => { st.vaults = st.vaults.map((x) => (x.id === v.id ? { ...x, archived: on } : x)); });
  const share = (sym: string) => { const t = total[sym].spendable; return t > 0n ? Math.round(Number((b[sym].spendable * 1000n) / t) / 10) : 0; };
  const panel = `vault-${v.id}`;
  return (
    <div class={cx('avg', open && 'open', v.archived && 'archived')} style={{ '--h': v.hue } as any}>
      <div class="avl-row click" role="button" tabIndex={0} aria-expanded={open} aria-controls={panel}
        onClick={() => !editing && onToggle()} onKeyDown={(e) => { if (!editing && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}>
        <span class="avl-name">
          <i aria-hidden="true" />
          {editing ? (
            <form class="avault-edit" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(); }}>
              <input class="z-input" value={name} maxLength={32} autoFocus onInput={(e) => setName((e.target as HTMLInputElement).value)} aria-label="Vault name" />
              <Btn kind="primary" size="sm" type="submit" icon="check" ariaLabel="Save name" />
            </form>
          ) : <span><b>{v.name}{v.archived && <Chip tone="neutral">Archived</Chip>}</b><small>{count} {count === 1 ? 'action' : 'actions'} · {tokens.length} {tokens.length === 1 ? 'token' : 'tokens'}</small></span>}
        </span>
        <span class="avl-act" onClick={(e) => e.stopPropagation()}>
          {v.archived ? <Btn kind="ghost" size="sm" icon="archive" onClick={() => archive(false)}>Restore</Btn> : <>
            <Btn kind="secondary" size="sm" icon="swap" disabled={!canMove || empty} onClick={onMove} title={!canMove ? 'Create a second vault first' : empty ? 'Nothing to move' : 'Move funds'}>Move</Btn>
            <Btn kind="ghost" size="sm" icon="edit" onClick={() => setEditing(true)} ariaLabel={`Rename ${v.name}`} title="Rename (free, not a transfer)" />
            <Btn kind="ghost" size="sm" icon="archive" disabled={!empty || isLast} ariaLabel={`Archive ${v.name}`} title={!empty ? 'Move its funds out first' : isLast ? 'You need at least one vault' : 'Archive'} onClick={() => archive(true)} />
          </>}
        </span>
        <span class="avl-chev" aria-hidden="true"><Icon name="down" size={16} /></span>
      </div>

      {open && (
        <div class="avd" id={panel}>
          {empty ? (
            <div class="avd-empty"><span>Nothing in {v.name} yet.</span>{!v.archived && <Btn kind="secondary" size="sm" icon="shield" href={href('shield', { vault: v.id })}>Shield into {v.name}</Btn>}</div>
          ) : (
            <div class="avd-t" role="table" aria-label={`Tokens in ${v.name}`}>
              <div class="avd-row avd-head" role="row"><span role="columnheader">Token</span><span role="columnheader" class="r">Private balance</span><span role="columnheader">Share of your total</span><span role="columnheader" class="r">Actions</span></div>
              {tokens.map((a) => {
                const t = b[a.symbol];
                const p = share(a.symbol);
                return (
                  <div class="avd-row" role="row">
                    <span class="avd-name" role="cell"><AssetGlyph symbol={a.symbol} size={32} /><span><b>{a.symbol}</b><small>{a.name}</small></span></span>
                    <span class="avd-amt r" role="cell">
                      <b><Money v={t.spendable} symbol={a.symbol} hideSymbol /></b>
                      {t.incoming > 0n && <small class="in">+<Money v={t.incoming} symbol={a.symbol} hideSymbol /> arriving</small>}
                      {t.outgoing > 0n && <small>−<Money v={t.outgoing} symbol={a.symbol} hideSymbol /> leaving</small>}
                    </span>
                    <span class="avd-share" role="cell" style={{ '--p': `${p}%` } as any}><span class="dsplit-bar"><i /></span><em>{total[a.symbol].spendable > 0n ? `${p}%` : '—'}</em></span>
                    <span class="avd-act" role="cell">
                      <Btn kind="ghost" size="sm" icon="send" href={href('send', { asset: a.symbol, vault: v.id })} ariaLabel={`Send ${a.symbol} from ${v.name}`} title="Send privately" />
                      <Btn kind="ghost" size="sm" icon="withdraw" href={href('withdraw', { asset: a.symbol, vault: v.id })} ariaLabel={`Withdraw ${a.symbol} from ${v.name}`} title="Withdraw" />
                      {canMove && <Btn kind="ghost" size="sm" icon="swap" disabled={t.spendable === 0n} onClick={onMove} ariaLabel={`Move ${a.symbol} to another vault`} title="Move to another vault" />}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
