// Fills in the payment link card from the URL (the part after #). Values are shown as text only.
const ZN = /^zn1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{109}$/;
const AMT = /^\d{1,9}(\.\d{1,6})?$/;

export function readPay(search: string) {
  const q = new URLSearchParams(search);
  const to = (q.get('to') || '').trim();
  const amount = (q.get('amount') || '').trim();
  const asset = (q.get('asset') || 'USDG').trim();
  const memo = (q.get('memo') || '').trim().slice(0, 80);
  const exp = Number(q.get('exp') || 0);
  return {
    to: ZN.test(to) ? to : '',
    amount: AMT.test(amount) && Number(amount) > 0 ? amount : '',
    asset: asset === 'USDG' ? 'USDG' : 'USDG',
    memo,
    exp: Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0,
  };
}

const fmtAmt = (a: string) => Number(a).toLocaleString('en-US', { maximumFractionDigits: 6 });

export function payLink() {
  const card = document.querySelector<HTMLElement>('[data-pay]');
  if (!card) return;
  // Details live after the #. Older links used ?…; move those to # so a copied URL doesn't carry them to the server.
  const fromHash = location.hash.length > 1;
  const p = readPay(fromHash ? location.hash.slice(1) : location.search);
  if (!fromHash && location.search) history.replaceState(null, '', location.pathname + '#' + location.search.slice(1));
  const $ = <T extends HTMLElement>(k: string) => card.querySelector<T>(`[data-${k}]`)!;
  $('amt').textContent = p.amount ? `${fmtAmt(p.amount)} ${p.asset}` : 'Any amount';
  if (p.memo) { $('memo').textContent = p.memo; $('memo').hidden = false; }
  if (p.to) { $('to').textContent = `${p.to.slice(0, 10)}…${p.to.slice(-6)}`; $('to').title = p.to; }
  const go = $<HTMLAnchorElement>('go');
  if (!p.to) { $('bad').hidden = false; go.hidden = true; $('hint').hidden = true; return; }
  if (p.exp && Date.now() > p.exp) {
    $('exp').hidden = false;
    $('exp').textContent = `This request expired on ${new Date(p.exp).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}. You can still pay it, but check with the person first.`;
  }
  const s = new URLSearchParams({ to: p.to, asset: p.asset });
  if (p.amount) s.set('amount', p.amount);
  if (p.memo) s.set('memo', p.memo);
  go.href = `/app/send/#${s}`;
  go.textContent = p.amount ? `Pay ${fmtAmt(p.amount)} ${p.asset} privately` : 'Choose an amount and pay privately';
}
