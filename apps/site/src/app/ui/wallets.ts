// Wallets the connect dialog offers by name. Logos in /public/wallets are each wallet's own
// published mark (as shipped in RainbowKit's wallet list); installed extensions use the icon
// they announce themselves.
export type WalletDef = {
  id: string;
  name: string;
  match: string; // lowercase text found in the wallet's own name, to recognise it
  icon: string;
  rdns?: string[];
  // Phone: opens the app with a WalletConnect link.
  deep?: (uri: string) => string;
  // Phone: opens this page inside the app's own browser instead.
  browse?: (url: string) => string;
  extension?: string;
  ios?: string;
  android?: string;
};

const e = encodeURIComponent;
export const WALLETS: WalletDef[] = [
  { id: 'metamask', name: 'MetaMask', match: 'metamask', icon: '/wallets/metamask.svg', rdns: ['io.metamask', 'io.metamask.flask'],
    deep: (u) => `https://metamask.app.link/wc?uri=${e(u)}`,
    extension: 'https://chromewebstore.google.com/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn',
    ios: 'https://apps.apple.com/us/app/metamask/id1438144202', android: 'https://play.google.com/store/apps/details?id=io.metamask' },
  { id: 'rabby', name: 'Rabby', match: 'rabby', icon: '/wallets/rabby.svg', rdns: ['io.rabby'],
    extension: 'https://chromewebstore.google.com/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch' },
  { id: 'coinbase', name: 'Coinbase Wallet', match: 'coinbase', icon: '/wallets/coinbase.svg', rdns: ['com.coinbase.wallet'],
    browse: (url) => `https://go.cb-w.com/dapp?cb_url=${e(url)}`,
    extension: 'https://chromewebstore.google.com/detail/coinbase-wallet-extension/hnfanknocfeofbddgcijnmhnfnkdnaad',
    ios: 'https://apps.apple.com/us/app/coinbase-wallet-store-crypto/id1278383455', android: 'https://play.google.com/store/apps/details?id=org.toshi' },
  { id: 'trust', name: 'Trust Wallet', match: 'trust', icon: '/wallets/trust.svg', rdns: ['com.trustwallet.app'],
    deep: (u) => `trust://wc?uri=${e(u)}`,
    extension: 'https://chromewebstore.google.com/detail/trust-wallet/egjidjbpglichdcondbcbdnbeeppgdph',
    ios: 'https://apps.apple.com/us/app/trust-crypto-bitcoin-wallet/id1288339409', android: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp' },
  { id: 'rainbow', name: 'Rainbow', match: 'rainbow', icon: '/wallets/rainbow.svg', rdns: ['me.rainbow'],
    deep: (u) => `rainbow://wc?uri=${e(u)}`,
    ios: 'https://apps.apple.com/app/apple-store/id1457119021', android: 'https://play.google.com/store/apps/details?id=me.rainbow' },
  { id: 'okx', name: 'OKX Wallet', match: 'okx', icon: '/wallets/okx.svg', rdns: ['com.okex.wallet'],
    deep: (u) => `okex://main/wc?uri=${e(u)}`,
    extension: 'https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge',
    ios: 'https://itunes.apple.com/app/id1327268470', android: 'https://play.google.com/store/apps/details?id=com.okinc.okex.gp' },
  { id: 'zerion', name: 'Zerion', match: 'zerion', icon: '/wallets/zerion.svg', rdns: ['io.zerion.wallet'],
    deep: (u) => `zerion://wc?uri=${e(u)}`,
    extension: 'https://chromewebstore.google.com/detail/klghhnkeealcohjjanjjdaeeggmfmlpl',
    ios: 'https://apps.apple.com/app/apple-store/id1456732565', android: 'https://play.google.com/store/apps/details?id=io.zerion.android' },
  { id: 'uniswap', name: 'Uniswap Wallet', match: 'uniswap', icon: '/wallets/uniswap.svg',
    deep: (u) => `uniswap://wc?uri=${e(u)}`,
    ios: 'https://apps.apple.com/app/apple-store/id6443944476', android: 'https://play.google.com/store/apps/details?id=com.uniswap.mobile' },
  { id: 'bitget', name: 'Bitget Wallet', match: 'bitget', icon: '/wallets/bitget.svg', rdns: ['com.bitget.web3'],
    deep: (u) => `bitkeep://wc?uri=${e(u)}`,
    extension: 'https://chromewebstore.google.com/detail/bitkeep-crypto-nft-wallet/jiidiaalihmmhddjgbnbgdfflelocpak',
    ios: 'https://apps.apple.com/app/bitkeep/id1395301115', android: 'https://web3.bitget.com/en/wallet-download?type=0' },
  { id: 'ledger', name: 'Ledger Live', match: 'ledger', icon: '/wallets/ledger.svg',
    deep: (u) => `ledgerlive://wc?uri=${e(u)}`,
    ios: 'https://apps.apple.com/us/app/ledger-live-web3-wallet/id1361671700', android: 'https://play.google.com/store/apps/details?id=com.ledger.live' },
];

export const byId = (id: string) => WALLETS.find((w) => w.id === id);
export const defFor = (rdns: string, name: string) =>
  WALLETS.find((w) => w.rdns?.includes(rdns)) || WALLETS.find((w) => name.toLowerCase().includes(w.match));

// A phone or tablet, where wallets are apps rather than browser extensions.
export const isPhone = () => typeof navigator !== 'undefined'
  && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
export const isIOS = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
