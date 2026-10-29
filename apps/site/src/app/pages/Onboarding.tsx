// Wallet connect and privacy account setup (PRD R3.1).
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { Btn, Card, Note, cx } from '../ui/kit';
import { useStore, setState } from '../lib/store';
import { setNeedKey } from '../lib/ui';
import { sync } from '../lib/pool';
import { deriveKeys, entropyFromPhrase, newEntropy, phraseOf, isWord, type Keys } from '../lib/vault-store';
import { short } from '../lib/chain';
import { NET } from '../lib/network';

type Step = 'intro' | 'show' | 'verify' | 'restore';


function Steps({ at }: { at: number }) {
  const s = ['Connect a wallet', 'Create privacy keys', 'Back up your phrase', 'Start'];
  return (
    <ol class="aonb-steps" aria-label="Setup progress">
      {s.map((t, i) => <li class={cx(i < at && 'done', i === at && 'now')}><span>{i < at ? <Icon name="check" size={12} /> : i + 1}</span>{t}</li>)}
    </ol>
  );
}

// Shown on Overview until a wallet is connected. Everything else in the app stays usable.
// The privacy-key setup. In the app it runs inside a dialog that can't be dismissed.
export function Setup({ inDialog, onDisconnect }: { inDialog?: boolean; onDisconnect?: () => void }) {
  const wallet = useStore((s) => s.wallet);
  const [step, setStep] = useState<Step>('intro');
  const [keys, setKeys] = useState<Keys | null>(null);
  const [revealed, setRevealed] = useState(false);
  const words = useMemo(() => (keys ? phraseOf(keys.entropy) : []), [keys]);
  const picks = useMemo(() => {
    if (!words.length) return [];
    const idx = new Set<number>();
    while (idx.size < 3) idx.add(crypto.getRandomValues(new Uint32Array(1))[0] % words.length);
    return [...idx].sort((a, b) => a - b);
  }, [words]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [restoreText, setRestoreText] = useState('');
  const [restoreErr, setRestoreErr] = useState('');

  const create = async () => { setKeys(await deriveKeys(newEntropy())); setRevealed(false); setStep('show'); };
  const finish = (k: Keys, backedUp: boolean) => {
    setState((s) => { s.keys = k; s.backedUp = backedUp; s.createdAt = Date.now(); });
    setNeedKey(false);
    void sync().catch(() => {});
  };
  const verified = picks.every((i) => (answers[i] || '').trim().toLowerCase() === words[i]);
  const restore = async () => {
    const e = entropyFromPhrase(restoreText);
    if (!e) { setRestoreErr('That phrase isn’t valid. Check each word and the order.'); return; }
    finish(await deriveKeys(e), true);
  };
  const typed = restoreText.trim().split(/\s+/).filter(Boolean);
  const unknown = typed.filter((w) => !isWord(w));

  return (
    <div class="aonb">
      {!inDialog && <Steps at={step === 'intro' || step === 'restore' ? 1 : 2} />}
      <div class="aonb-setup">
        <Card class="aonb-main" glow>
          {step === 'intro' && (
            <>
              <p class="akicker">Required · one time on this device</p>
              <h2>Your wallet isn't a privacy account.</h2>
              <p class="aonb-p">{wallet ? <>Connecting <span class="z-data">{short(wallet.address)}</span> only lets you sign public deposits.</> : 'Your wallet only signs public deposits.'} Private balances need their own privacy key, made here:</p>
              <ul class="aonb-facts">
                <li><Icon name="spark" size={18} /><div><b>Generated in this browser</b><span>From fresh randomness, not from a wallet signature, so recovery never depends on your wallet.</span></div></li>
                <li><Icon name="lock" size={18} /><div><b>Stored encrypted on this device</b><span>Under a key this browser can't export. Nothing goes to a server.</span></div></li>
                <li><Icon name="key" size={18} /><div><b>Recovered with 24 words</b><span>Your recovery phrase is the only way back in on a new device. Zeronym can't reset it.</span></div></li>
              </ul>
              <div class="aonb-cta">
                <Btn kind="primary" size="lg" onClick={create} iconRight="chevron">Create privacy key</Btn>
                <Btn kind="ghost" size="lg" onClick={() => setStep('restore')}>I have a recovery phrase</Btn>
              </div>
              {onDisconnect && <p class="aonb-small aonb-out">Not now? <button type="button" class="alink" onClick={onDisconnect}>Disconnect the wallet</button>. You can browse the app, but connecting a wallet always asks for a privacy key.</p>}
            </>
          )}
          {step === 'show' && keys && (
            <>
              <p class="akicker">Recovery phrase</p>
              <h2>Write down your recovery phrase.</h2>
              <p class="aonb-p">On paper, in this order. Anyone with these words can spend your shielded funds and read your history.</p>
              <div class={cx('aphrase', !revealed && 'blur')}>
                <ol>{words.map((w) => <li><span>{w}</span></li>)}</ol>
                {!revealed && <button type="button" class="aphrase-reveal" onClick={() => setRevealed(true)}><Icon name="eye" size={18} />Reveal phrase<small>Make sure no one can see your screen</small></button>}
              </div>
              <Note tone="warn" title="Never share it">Zeronym will never ask for it. Don't type it into a website, a chat or a cloud note.</Note>
              <div class="aonb-cta">
                <Btn kind="primary" size="lg" disabled={!revealed} onClick={() => setStep('verify')} iconRight="chevron">I've written it down</Btn>
                <Btn kind="ghost" size="lg" onClick={() => finish(keys, false)}>Back up later</Btn>
              </div>
              <p class="aonb-small">If you back up later, you can look around but can't shield until the backup is confirmed.</p>
            </>
          )}
          {step === 'verify' && keys && (
            <>
              <p class="akicker">Recovery phrase</p>
              <h2>Check your backup.</h2>
              <p class="aonb-p">Enter these words from your phrase.</p>
              <div class="averify">
                {picks.map((i) => {
                  const v = (answers[i] || '').trim().toLowerCase();
                  const ok = v === words[i];
                  return (
                    <label class={cx('averify-w', v && (ok ? 'ok' : 'bad'))}>
                      <span>Word #{i + 1}</span>
                      <input autocomplete="off" autocapitalize="off" spellcheck={false} value={answers[i] || ''} onInput={(e) => setAnswers({ ...answers, [i]: (e.target as HTMLInputElement).value })} />
                      {v && <Icon name={ok ? 'check' : 'x'} size={16} />}
                    </label>
                  );
                })}
              </div>
              <div class="aonb-cta">
                <Btn kind="primary" size="lg" disabled={!verified} onClick={() => finish(keys, true)} iconRight="chevron">Finish setup</Btn>
                <Btn kind="ghost" size="lg" onClick={() => setStep('show')}>Show the phrase again</Btn>
              </div>
            </>
          )}
          {step === 'restore' && (
            <>
              <p class="akicker">Restore</p>
              <h2>Enter your recovery phrase.</h2>
              <p class="aonb-p">All 24 words, in order, separated by spaces.</p>
              <textarea class="arestore" rows={5} autocomplete="off" autocapitalize="off" spellcheck={false} value={restoreText} placeholder="word1 word2 word3 …" onInput={(e) => { setRestoreText((e.target as HTMLTextAreaElement).value); setRestoreErr(''); }} />
              <p class="arestore-meta"><span>{typed.length} of 24 words</span>{unknown.length > 0 && <span class="bad">Not in the word list: {unknown.slice(0, 3).join(', ')}</span>}</p>
              {restoreErr && <p class="aerr">{restoreErr}</p>}
              <Note tone="info">Restoring brings back your privacy key and shielded address. Your {NET.isTestnet ? 'testnet ' : 'private '}balance is rebuilt from the chain. Vault names and demo history stay on the device where they were made.</Note>
              <div class="aonb-cta">
                <Btn kind="primary" size="lg" disabled={typed.length !== 24} onClick={restore}>Restore</Btn>
                <Btn kind="ghost" size="lg" onClick={() => setStep('intro')}>Back</Btn>
              </div>
            </>
          )}
        </Card>
        {!inDialog && <aside class="aonb-side">
          <Card>
            <b class="aonb-side-t"><Icon name="info" size={16} />What this account is</b>
            <p>A set of keys that controls your shielded notes. One spends, one lets you read your own history. Your shielded address is made from them.</p>
            <p>Connecting a different wallet later doesn't change your privacy account.</p>
            <a href="/docs/keys/" target="_blank" rel="noopener">Keys and recovery in the docs <Icon name="external" size={12} /></a>
          </Card>
        </aside>}
      </div>
    </div>
  );
}
