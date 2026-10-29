// Privacy account: backup, recovery phrase, preferences, export, demo tools, device.
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import type { ComponentChildren } from 'preact';
import { Btn, Chip, Copy, Modal, Note, Toggle, cx } from '../ui/kit';
import { Panel } from '../ui/dash';
import { useStore, setState, getState, submit, type State } from '../lib/store';
import { phraseOf, exportHistory, importHistory, forgetDevice, deriveKeys, newEntropy } from '../lib/vault-store';
import { ASSETS, parseUnits } from '../lib/amount';
import { short } from '../lib/chain';
import { href } from '../lib/router';
import { sync, POOL_ADDRESS } from '../lib/pool';
import { FaucetButton } from './Overview';
import { ConnectCard } from '../ui/flow';
import { NET } from '../lib/network';

export function Account() {
  const s = useStore((x) => x);
  const [phraseOpen, setPhraseOpen] = useState(new URLSearchParams(location.search).get('backup') === '1');
  const [forget, setForget] = useState(false);
  const [msg, setMsg] = useState('');
  const pref = (k: keyof State['prefs'], v: boolean) => setState((st) => { st.prefs = { ...st.prefs, [k]: v }; });

  const doExport = async () => {
    const st = getState();
    const text = await exportHistory(st.keys!.entropy, { vaults: st.vaults, activity: st.activity, requests: st.requests, receipts: st.receipts, exportedAt: Date.now() });
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `zeronym-history-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg('Exported. The file can only be opened with your recovery phrase.');
  };
  const doImport = async (f: File) => {
    const data = await importHistory<Pick<State, 'vaults' | 'activity' | 'requests' | 'receipts'>>(getState().keys!.entropy, await f.text());
    if (!data) { setMsg('That file couldn’t be opened with this account’s keys.'); return; }
    setState((st) => {
      const ids = new Set(st.activity.map((a) => a.id));
      st.activity = [...st.activity, ...data.activity.filter((a) => !ids.has(a.id))].sort((a, b) => b.createdAt - a.createdAt);
      const vids = new Set(st.vaults.map((v) => v.id));
      st.vaults = [...st.vaults, ...data.vaults.filter((v) => !vids.has(v.id))];
      st.requests = [...st.requests, ...data.requests.filter((r) => !st.requests.some((x) => x.id === r.id))];
      st.receipts = [...st.receipts, ...data.receipts.filter((r) => !st.receipts.some((x) => x.id === r.id))];
    });
    setMsg(`Imported ${data.activity.length} actions.`);
  };

  if (!s.keys) return <div class="aacct"><ConnectCard title="No privacy account on this device yet">Connect a browser wallet, then create a new privacy key or restore one with your 24-word recovery phrase.</ConnectCard></div>;
  const row = (title: string, desc: ComponentChildren, control?: ComponentChildren, cls?: string) => (
    <div class={cx('srow', cls)}><div class="srow-l"><b>{title}</b><small>{desc}</small></div>{control && <div class="srow-c">{control}</div>}</div>
  );
  return (
    <div class="aacct5">
      <nav class="snav" aria-label="Sections">
        {[['acc', 'Account', 'key'], ['rec', 'Recovery', 'shield'], ['pref', 'Preferences', 'settings'], ['data', 'Your records', 'download'], ['net', s.mode === 'testnet' ? (NET.isTestnet ? 'Testnet' : 'Network') : 'Demo tools', 'flag'], ['dev', 'This device', 'phone']].map(([id, l, ic]) => (
          <a href={`#s-${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon name={ic} size={16} />{l}</a>
        ))}
      </nav>
      <div class="sbody">
        <Panel title="Account" id="s-acc">
          {row('Shielded address', `Created ${new Date(s.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })} in this browser.`, <><code class="z-data scode">{short(s.keys.address, 10)}</code><Copy text={s.keys.address} label="Copy" small /></>)}
          {s.wallet && row('Connected wallet', s.wallet.kind === 'demo' ? 'The demo wallet. Nothing touches a chain.' : `${s.wallet.name || 'Wallet'}${s.wallet.via === 'walletconnect' ? ' over WalletConnect' : ''}. It pays network fees and funds shields.`, <code class="z-data scode">{short(s.wallet.address)}</code>)}
        </Panel>

        <Panel title="Recovery" id="s-rec">
          {row('Recovery phrase', '24 words. The only way to restore this account on another device.', <>{s.backedUp ? <Chip tone="ok" icon="check">Backed up</Chip> : <Chip tone="warn" icon="warn">Not backed up</Chip>}<Btn kind={s.backedUp ? 'secondary' : 'primary'} size="sm" icon={s.backedUp ? 'eye' : 'shield'} onClick={() => setPhraseOpen(true)}>{s.backedUp ? 'Show phrase' : 'Back up now'}</Btn></>)}
          {row('New device', s.mode === 'testnet' ? `Restore with your phrase and connect a wallet: your ${NET.isTestnet ? 'testnet' : 'private'} balance is rebuilt from the chain. Vault names and history come from an encrypted export.` : 'Restore with your phrase, then import an encrypted history file. With the real pool, history is rebuilt from chain data instead.')}
        </Panel>

        <Panel title="Preferences" id="s-pref" class="spref">
          <Toggle on={s.prefs.hideBalances} onChange={(v) => pref('hideBalances', v)} label="Hide balances on screen" hint="Useful when sharing your screen. Same as the eye button." />
          <Toggle on={s.prefs.delayDefault} onChange={(v) => pref('delayDefault', v)} label="Delayed submission by default" hint="Private actions wait a random moment before they're submitted. It may reduce some timing links but guarantees nothing." />
          <Toggle on={!s.prefs.setupHidden} onChange={(v) => pref('setupHidden', !v)} label="Show “Get set up” on Overview" hint="The four steps to a first private payment. Hidden once they're all done." />
        </Panel>

        <Panel title="Your records" id="s-data">
          {row('Encrypted history export', 'Vaults, activity, requests and receipts. Only your recovery phrase can open it.', <>
            <Btn kind="secondary" size="sm" icon="download" onClick={doExport}>Export</Btn>
            <label class="ab ab-ghost ab-sm"><Icon name="upload" size={16} /><span>Import</span><input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) doImport(f); }} /></label>
          </>)}
          {msg && <p class="aacct-msg" role="status">{msg}</p>}
        </Panel>

        {s.mode === 'testnet' ? (
          <Panel title={NET.isTestnet ? 'Testnet' : 'Network'} id="s-net">
            {row(NET.isTestnet ? 'Pool on Robinhood Chain testnet' : 'Pool on Robinhood Chain', <>{NET.isTestnet ? 'Test tokens only. They have no value. ' : 'Real funds. Only deposit what you can afford to lose. '}<a class="alink" href={`${NET.explorer}/address/${POOL_ADDRESS}`} target="_blank" rel="noopener">Pool contract <Icon name="external" size={12} /></a></>)}
            {row('Pool view', s.tn.error === 'mismatch' ? 'Your local view doesn’t match the chain yet. Actions are paused until it does.' : s.tn.error === 'offline' ? `Couldn’t reach the ${NET.isTestnet ? 'testnet ' : ''}RPC. Retrying.` : `${s.tn.poolSize.toLocaleString('en-US')} notes in the pool · synced at block ${s.tn.synced.toLocaleString('en-US')}`,
              <Btn kind="secondary" size="sm" icon="refresh" onClick={() => { sync().then(() => setMsg('Rescanned the pool.')).catch((e) => setMsg(e?.message || 'Rescan failed.')); }}>Rescan now</Btn>)}
            {s.wallet && NET.isTestnet && row('Testnet USDG', 'Paxos, the issuer, runs a free faucet for testnet USDG. It has no value.', <FaucetButton />)}
          </Panel>
        ) : (
          <Panel title="Demo tools" id="s-net" sub="These exist only in demo mode, to try every state.">
            {row('Demo funds', 'Add the starting demo balance to your public wallet again.', <Btn kind="secondary" size="sm" icon="plus" onClick={() => setState((st) => { st.publicBal = Object.fromEntries(ASSETS.map((a) => [a.symbol, (BigInt(st.publicBal[a.symbol] || '0') + (parseUnits(a.demoBalance, a.decimals) || 0n)).toString()])); })}>Add demo funds</Btn>)}
            {row('Incoming payment', 'Receive a private payment into Main from a random shielded address. The amount is picked at random.', <DemoIncoming />)}
            {row('Failure test', 'Make the next action fail, to see how errors look.', <Btn kind={s.prefs.failNext ? 'primary' : 'secondary'} size="sm" icon="warn" onClick={() => pref('failNext', !s.prefs.failNext)}>{s.prefs.failNext ? 'Next action will fail' : 'Make the next one fail'}</Btn>)}
          </Panel>
        )}

        <Panel title="This device" id="s-dev">
          <ul class="aacct-facts">
            <li><Icon name="lock" size={16} /><span>Keys and history are encrypted with a key this browser can't export.</span></li>
            {s.mode === 'testnet'
              ? <li><Icon name="globe" size={16} /><span>The app reads the pool from {NET.isTestnet ? 'the public testnet RPC' : 'a Robinhood Chain RPC'}. Private actions go to the Zeronym {NET.isTestnet ? 'testnet ' : ''}relayer, which sees your IP address and the transaction it submits, but never your keys or balances.</span></li>
              : <li><Icon name="globe" size={16} /><span>Nothing is sent to Zeronym. In demo mode nothing touches a chain either.</span></li>}
            <li><Icon name="fallback" size={16} /><span>If this app is ever unavailable, see the <a href={href('fallback')}>fallback withdrawal</a>.</span></li>
          </ul>
          {row('Forget this device', 'Deletes your keys and history from this browser.', <Btn kind="danger" size="sm" icon="logout" onClick={() => setForget(true)}>Forget</Btn>, 'danger')}
        </Panel>
      </div>

      <PhraseModal open={phraseOpen} onClose={() => setPhraseOpen(false)} />
      <Modal open={forget} onClose={() => setForget(false)} title="Forget this device?">
        <div class="areview">
          <Note tone="danger" title="This deletes your keys and history from this browser">{s.backedUp ? 'You can restore the account with your recovery phrase. Export your history first if you want to keep it.' : 'You haven’t backed up your recovery phrase. This account will be lost for good.'}</Note>
          <div class="areview-cta row">
            <Btn kind="danger" onClick={async () => { await forgetDevice(); try { localStorage.removeItem('zn-wallet'); } catch { /* */ } location.href = '/app/'; }}>Delete from this device</Btn>
            <Btn kind="secondary" onClick={() => setForget(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PhraseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((x) => x);
  const words = useMemo(() => (s.keys ? phraseOf(s.keys.entropy) : []), [s.keys]);
  const [revealed, setRevealed] = useState(false);
  const [checking, setChecking] = useState(false);
  const picks = useMemo(() => { const i = new Set<number>(); while (i.size < 3) i.add(crypto.getRandomValues(new Uint32Array(1))[0] % 24); return [...i].sort((a, b) => a - b); }, [open]);
  const [ans, setAns] = useState<Record<number, string>>({});
  const ok = picks.every((i) => (ans[i] || '').trim().toLowerCase() === words[i]);
  const close = () => { setRevealed(false); setChecking(false); setAns({}); onClose(); };
  return (
    <Modal open={open} onClose={close} title={checking ? 'Check your backup' : 'Recovery phrase'}>
      <div class="areview">
        {!checking ? (
          <>
            <div class={cx('aphrase', !revealed && 'blur')}>
              <ol>{words.map((w) => <li><span>{w}</span></li>)}</ol>
              {!revealed && <button type="button" class="aphrase-reveal" onClick={() => setRevealed(true)}><Icon name="eye" size={18} />Reveal phrase<small>Make sure no one can see your screen</small></button>}
            </div>
            <Note tone="warn">Anyone with these words can spend your shielded funds and read your history. Zeronym will never ask for them.</Note>
            {!s.backedUp && <Btn kind="primary" size="lg" block disabled={!revealed} onClick={() => setChecking(true)} iconRight="chevron">I've written it down</Btn>}
          </>
        ) : (
          <>
            <div class="averify">
              {picks.map((i) => { const v = (ans[i] || '').trim().toLowerCase(); return (
                <label class={cx('averify-w', v && (v === words[i] ? 'ok' : 'bad'))}><span>Word #{i + 1}</span><input autocomplete="off" autocapitalize="off" spellcheck={false} value={ans[i] || ''} onInput={(e) => setAns({ ...ans, [i]: (e.target as HTMLInputElement).value })} />{v && <Icon name={v === words[i] ? 'check' : 'x'} size={16} />}</label>
              ); })}
            </div>
            <Btn kind="primary" size="lg" block disabled={!ok} onClick={() => { setState((st) => { st.backedUp = true; }); close(); }}>Confirm backup</Btn>
          </>
        )}
      </div>
    </Modal>
  );
}

// Demo only: a payment from a random shielded address, to see one arrive and get credited.
function DemoIncoming() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const a = ASSETS[Math.floor(Math.random() * ASSETS.length)];
    const amt = a.symbol === 'USDG' ? BigInt([25000, 50000, 120000, 7500][Math.floor(Math.random() * 4)]) : BigInt([250000, 500000, 100000][Math.floor(Math.random() * 3)]);
    const from = (await deriveKeys(newEntropy())).address;
    submit({ kind: 'receive', asset: a.symbol, amount: amt, vault: 'main', counterparty: from, memo: 'Demo payment' });
    setBusy(false);
  };
  return <Btn kind="secondary" size="sm" icon="receive" disabled={busy} onClick={run}>Receive a demo payment</Btn>;
}
