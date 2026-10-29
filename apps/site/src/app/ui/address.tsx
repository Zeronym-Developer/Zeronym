// The shielded address, shown in a dialog that any page can open (profile menu, Receive).
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './icons';
import { Copy, Modal, Qr, cx } from './kit';
import { useStore } from '../lib/store';

const subs = new Set<(v: boolean) => void>();
export const openAddress = () => subs.forEach((f) => f(true));

export function AddressDialog() {
  const addr = useStore((s) => s.keys?.address);
  const [open, setOpen] = useState(false);
  useEffect(() => { subs.add(setOpen); return () => { subs.delete(setOpen); }; }, []);
  if (!addr) return null;
  const chunks = addr.match(/.{1,4}/g) || [addr];
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Your shielded address" class="aaddr-dlg">
      <div class="aaddr5">
        <div class="aaddr5-qr"><Qr text={`zeronym:${addr}`} size={196} /></div>
        <p class="aaddr5-sub">Starts with zn1 · {addr.length} characters · has a checksum</p>
        <code class="arecv2-code z-data" aria-label={addr}>{chunks.map((c, i) => <span class={cx(i % 2 === 1 && 'alt', (i === 0 || i === chunks.length - 1) && 'edge')}>{c}</span>)}</code>
        <Copy text={addr} label="Copy address" />
        <p class="arecv2-tip"><Icon name="eye" size={14} />Check the first and last four characters with the sender before they pay.</p>
        <ul class="aaddr5-facts">
          <li class="ok"><Icon name="lock" size={15} /><span><b>Paid inside the pool.</b> Outsiders can't see the amount, or that the payment was to you.</span></li>
          <li class="ok"><Icon name="globe" size={15} /><span><b>Not linked to your wallet.</b> Nothing on chain ties this address to your public wallet address.</span></li>
          <li class="warn"><Icon name="warn" size={15} /><span><b>Senders can recognise it.</b> Anyone you give it to can spot payments they send you. Use a request for one-offs.</span></li>
        </ul>
      </div>
    </Modal>
  );
}
