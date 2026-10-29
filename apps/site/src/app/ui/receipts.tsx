// Receipts and the viewing key, opened from the Activity page (PRD R3.7).
// Dialogs follow the URL: ?share=<payment id> (from a row's share icon), ?receipt=<code|1>, ?viewkey=1, so links and Back work.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { Btn, Card, Chip, Copy, Empty, Field, Modal, Money, Note, Toggle, cx } from './kit';
import { ConnectCard, useFloat } from './flow';
import { useStore, setState, KIND_LABEL, type Activity } from '../lib/store';
import { fmt } from '../lib/amount';
import { randomId } from '../lib/vault-store';
import { short } from '../lib/chain';
import { SITE_ORIGIN } from '../lib/network';
import { ago } from './activity';
import { go, parse, setQuery, useRoute } from '../lib/router';

type Payload = { v: 1; scope: 'single'; kind: string; asset: string; amount: string; date?: number; to?: string; memo?: string; from?: string; ref: string; issued: number };
const enc = (p: Payload) => btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (c: string): Payload | null => { try { const p = JSON.parse(decodeURIComponent(escape(atob(c.trim().replace(/-/g, '+').replace(/_/g, '/'))))); return p?.scope === 'single' ? p : null; } catch { return null; } };
/** Pulls the code out of a pasted link (new ?receipt= or old ?verify=) or takes the code as is. */
const codeOf = (t: string) => {
  const v = t.trim();
  if (!/[?&](receipt|verify)=/.test(v)) return v;
  try { const u = new URL(v, location.origin); return u.searchParams.get('receipt') || u.searchParams.get('verify') || ''; } catch { return v; }
};

const TOOL_KEYS = ['share', 'receipt', 'viewkey'] as const;
type Tool = (typeof TOOL_KEYS)[number];
/** Open a receipt dialog on the Activity page, keeping any filters already set there. */
export function openTool(k: Tool, v = '1') {
  const { route, q } = parse();
  if (route !== 'activity') return go('activity', { [k]: v });
  const o = Object.fromEntries([...q].filter(([key]) => !(TOOL_KEYS as readonly string[]).includes(key)));
  setQuery({ ...o, [k]: v });
}
function closeTools() {
  const { q } = parse();
  setQuery(Object.fromEntries([...q].filter(([key]) => !(TOOL_KEYS as readonly string[]).includes(key))));
}

/** Header button on Activity: the viewing key. Receipt links open their dialog on their own. */
export function ReceiptButtons() {
  const keys = useStore((s) => !!s.keys);
  return keys ? <Btn kind="secondary" icon="key" onClick={() => openTool('viewkey')}>Viewing key</Btn> : null;
}

/** One "Share receipt" button. Uses the device's share sheet; where there isn't one, a small menu. */
function ShareReceipt({ url, onShare }: { url: string; onShare?: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const float = useFloat(open, ref);
  const text = 'A Zeronym receipt for one payment. It shows only what I chose to share.';
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [open]);
  const share = async () => {
    onShare?.();
    const data = { title: 'Payment receipt', text, url };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try { await navigator.share(data); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
    }
    setOpen(!open);
  };
  const copy = () => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 1200); }).catch(() => {}); };
  const enc = encodeURIComponent;
  return (
    <div class={cx('amenu arc-share', open && 'open')} ref={ref} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}>
      <Btn kind="primary" size="lg" block icon="share" onClick={share}>Share receipt</Btn>
      {open && (
        <div class="amenu-list" role="menu" style={float}>
          <button type="button" role="menuitem" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={16} /><span><b>{copied ? 'Copied' : 'Copy link'}</b></span></button>
          <a role="menuitem" href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><Icon name="send" size={16} /><span><b>WhatsApp</b></span></a>
          <a role="menuitem" href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><Icon name="send" size={16} /><span><b>Telegram</b></span></a>
          <a role="menuitem" href={`mailto:?subject=${enc('Payment receipt')}&body=${enc(`${text}\n\n${url}`)}`} onClick={() => setOpen(false)}><Icon name="external" size={16} /><span><b>Email</b></span></a>
        </div>
      )}
    </div>
  );
}

/** The dialogs, driven by the URL. Rendered once on the Activity page. */
export function ReceiptTools() {
  const { q } = useRoute();
  const keys = useStore((s) => !!s.keys);
  const share = q.get('share'), receipt = q.get('receipt'), viewkey = q.get('viewkey');
  return (
    <>
      <Modal open={!!share} onClose={closeTools} title="Share a receipt" wide class="arc-dlg">
        {share && (keys ? <Share id={share} /> : <ConnectCard title="Receipts are made from your own payments" />)}
      </Modal>
      <Modal open={!!receipt} onClose={closeTools} title="Open a receipt" class="arc-dlg">
        {receipt && <Check initial={receipt === '1' ? '' : receipt} />}
      </Modal>
      <Modal open={!!viewkey} onClose={closeTools} title="Viewing key" class="arc-dlg">
        {viewkey && (keys ? <ViewKey /> : <ConnectCard title="A viewing key comes from your privacy key" />)}
      </Modal>
    </>
  );
}

function Share({ id }: { id: string }) {
  const s = useStore((x) => x);
  const sel = id;
  const [inc, setInc] = useState({ date: true, to: true, memo: false, from: false });
  const a = s.activity.find((x) => x.id === sel && x.status === 'credited' && x.kind !== 'move');
  const payload = useMemo<Payload | null>(() => a ? {
    v: 1, scope: 'single', kind: a.kind, asset: a.asset, amount: a.amount, ref: a.id, issued: Date.now(),
    ...(inc.date ? { date: a.createdAt } : {}), ...(inc.to && a.counterparty ? { to: a.counterparty } : {}),
    ...(inc.memo && a.memo ? { memo: a.memo } : {}), ...(inc.from ? { from: s.keys!.address } : {}),
  } : null, [a?.id, inc]);
  if (!a) return <Empty icon="receipts" title="No receipt for this one yet"><p>A receipt can be shared once a send, withdrawal, shield or incoming payment is credited. Use the share icon on that payment in the table.</p></Empty>;
  const set = (k: keyof typeof inc) => (v: boolean) => setInc({ ...inc, [k]: v });
  // The link is ready as soon as the fields are chosen. It's recorded as shared when the share button is used.
  const code = payload ? enc(payload) : '';
  const url = `${SITE_ORIGIN}/app/activity/?receipt=${code}`;
  const record = () => {
    if (!payload || s.receipts.some((r) => r.code === code)) return;
    setState((st) => { st.receipts = [{ id: randomId('c'), activityId: payload.ref, fields: Object.keys(inc).filter((k) => (inc as any)[k]), createdAt: Date.now(), code }, ...st.receipts]; });
  };
  const before = s.receipts.filter((r) => r.activityId === sel);
  return (
    <div class="arc-grid">
      <div class="aform arc-form">
        <div class="arc-pay">
          <span class="vdd-ic"><Icon name={a.kind} size={15} /></span>
          <span><b>{KIND_LABEL[a.kind]} · <Money v={a.amount} symbol={a.asset} /></b><small>{a.counterparty ? short(a.counterparty) : 'Your wallet'} · {new Date(a.createdAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{a.memo ? ` · ${a.memo}` : ''}</small></span>
        </div>
        <div class="afield"><label>What the receipt shows</label>
          <div class="atoggles">
            <div class="atoggle fixed"><span><b>Asset and amount</b><small>Always included</small></span><Icon name="check" size={16} /></div>
            <Toggle on={inc.date} onChange={set('date')} label="Date and time" />
            {a?.counterparty && <Toggle on={inc.to} onChange={set('to')} label={a.kind === 'receive' ? 'Sender address' : 'Recipient address'} />}
            {a?.memo && <Toggle on={inc.memo} onChange={set('memo')} label="Private note" />}
            <Toggle on={inc.from} onChange={set('from')} label="Your shielded address" hint="Lets the reader recognise other payments to or from it." />
          </div>
        </div>
        <ShareReceipt url={url} onShare={record} />
        <small class="muted arc-share-note">Anyone with the link can open this receipt, and only this one.</small>
        <Note tone="warn" title="Before you share">Once someone reads a receipt, it can't be taken back. A screenshot isn't proof of payment; share the receipt itself.</Note>
      </div>
      <div class="arc-side">
        {payload && <ReceiptCard p={payload} preview />}
        <div class="ascope"><Icon name="receipts" size={18} /><div><b>Scope: this receipt only</b><span>Your other payments, balances and vaults stay encrypted.</span></div></div>
        {before.length > 0 && <p class="arc-before"><Icon name="clock" size={14} />Shared {before.length === 1 ? 'once' : `${before.length} times`} for this payment · last {ago(before[0].createdAt)}</p>}
      </div>
    </div>
  );
}

function ReceiptCard({ p, preview }: { p: Payload; preview?: boolean }) {
  return (
    <Card class="areceipt">
      <div class="areceipt-head"><img src="/zeronym-icon.webp" width="190" height="120" alt="" /><div><b>Payment receipt</b><small>Scope: this payment only</small></div>{preview ? <Chip tone="neutral">Preview</Chip> : <Chip tone="warn" icon="warn">Not checked on chain</Chip>}</div>
      <div class="areceipt-amt">{fmt(p.amount, p.asset)}</div>
      <dl>
        <div><dt>Type</dt><dd>{KIND_LABEL[p.kind as Activity['kind']] || p.kind}</dd></div>
        <div><dt>Date</dt><dd>{p.date ? new Date(p.date).toLocaleString('en-US') : <span class="aredact">Not shared</span>}</dd></div>
        <div><dt>{p.kind === 'receive' ? 'From' : 'To'}</dt><dd class="z-data">{p.to ? short(p.to, 8) : <span class="aredact">Not shared</span>}</dd></div>
        {p.memo && <div><dt>Note</dt><dd>{p.memo}</dd></div>}
        <div><dt>Issuer</dt><dd class="z-data">{p.from ? short(p.from, 8) : <span class="aredact">Not shared</span>}</dd></div>
      </dl>
      <p class="areceipt-foot">Everything outside this receipt stays encrypted.{!preview && ' This preview reads the receipt’s contents; it isn’t checked against the chain yet.'}</p>
    </Card>
  );
}

function Check({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial);
  const p = code ? dec(codeOf(code)) : null;
  return (
    <div class="arc-check">
      <Field label="Receipt link or code" id="rc" error={code && !p ? 'That doesn’t look like a Zeronym receipt.' : ''}>
        <textarea id="rc" class="z-input arestore" rows={3} spellcheck={false} value={code} onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} placeholder="Paste a receipt link or code" />
      </Field>
      {p ? <ReceiptCard p={p} /> : <p class="muted arc-hint"><Icon name="info" size={14} />Opening a receipt doesn't need a wallet or a privacy account, and nothing is sent anywhere.</p>}
    </div>
  );
}

function ViewKey() {
  const keys = useStore((s) => s.keys!);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState(false);
  return (
    <div class="aform akey">
      <Note tone="danger" title="A viewing key reveals much more than a receipt">
        Whoever has it can read your <b>past and future</b> activity: every payment, amount and balance, until you move to a new account. It can't be revoked once shared.
      </Note>
      <div class="acompare">
        <div><b><Icon name="receipts" size={16} />Receipt</b><span>One payment. You choose the fields.</span><Chip tone="ok">Recommended</Chip></div>
        <div><b><Icon name="key" size={16} />Viewing key</b><span>Everything, past and future. Can't be undone.</span><Chip tone="bad">High impact</Chip></div>
      </div>
      {!shown ? (
        <>
          <label class="acheck"><input type="checkbox" checked={ack} onChange={(e) => setAck((e.target as HTMLInputElement).checked)} /><span>I understand this shares my full history, including future activity.</span></label>
          <Field label='Type "share my history" to continue' id="vk"><input id="vk" class="z-input" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} autocomplete="off" /></Field>
          <Btn kind="danger" size="lg" block icon="key" disabled={!ack || typed.trim().toLowerCase() !== 'share my history'} onClick={() => { setShown(true); setState((st) => { st.prefs = { ...st.prefs, viewKeyShownAt: Date.now() }; }); }}>Show viewing key</Btn>
        </>
      ) : (
        <div class="amade">
          <p class="akicker"><Icon name="key" size={14} />Viewing key</p>
          <code class="z-data amade-code wrap">zvk1{keys.view}</code>
          <div class="amade-act"><Copy text={`zvk1${keys.view}`} label="Copy viewing key" /><Btn kind="ghost" icon="eyeOff" onClick={() => { setShown(false); setAck(false); setTyped(''); }}>Hide</Btn></div>
        </div>
      )}
    </div>
  );
}
