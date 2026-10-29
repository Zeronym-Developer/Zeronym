// Small UI hooks shared across pages, set by the app shell.
let openWalletFn: () => void = () => {};
export const setOpenWallet = (f: () => void) => { openWalletFn = f; };
export const openWallet = () => openWalletFn();

// The privacy-key dialog stays up across reloads until a key exists (it's mandatory once a wallet connects).
const FLAG = 'zn-need-key';
export const needKey = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
export const setNeedKey = (v: boolean) => { try { v ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch { /* storage off */ } };
