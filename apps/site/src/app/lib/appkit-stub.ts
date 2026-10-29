// WalletConnect's provider can load Reown's own modal; Zeronym draws its own dialog instead,
// so the modal is never bundled. This stands in for it.
export function createAppKit(): never {
  throw new Error('The Reown modal is not bundled. Zeronym uses its own connect dialog.');
}
