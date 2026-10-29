// Tiny client router for /app/*. Every route also exists as a static page,
// so a reload or a shared link opens the same screen.
import { useEffect, useState } from 'preact/hooks';

export const ROUTES = ['overview', 'shield', 'send', 'receive', 'withdraw', 'assets', 'vaults', 'activity', 'receipts', 'account', 'fallback'] as const;
export type Route = (typeof ROUTES)[number];

export function parse(path = location.pathname): { route: Route; q: URLSearchParams } {
  const seg = path.replace(/^\/app\/?/, '').replace(/\/$/, '').split('/')[0] || 'overview';
  return { route: (ROUTES as readonly string[]).includes(seg) ? (seg as Route) : 'overview', q: new URLSearchParams(location.search) };
}
export const href = (r: Route, q?: Record<string, string>) => (r === 'overview' ? '/app/' : `/app/${r}/`) + (q ? '?' + new URLSearchParams(q) : '');

const subs = new Set<() => void>();
export function go(r: Route, q?: Record<string, string>) {
  const url = href(r, q);
  if (url !== location.pathname + location.search) history.pushState(null, '', url);
  subs.forEach((f) => f());
  window.scrollTo({ top: 0 });
}
// Swap the current URL for another route without adding a history entry (old links).
export function redirect(r: Route, q?: Record<string, string>) {
  history.replaceState(null, '', href(r, q));
  // Notify after the current render, so listeners that subscribe in the same pass hear it.
  setTimeout(() => subs.forEach((f) => f()), 0);
}
// Update the query string in place (filters, search). Empty values are dropped.
export function setQuery(q: Record<string, string>) {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
  const url = location.pathname + (p.toString() ? `?${p}` : '');
  if (url !== location.pathname + location.search) history.replaceState(null, '', url);
  subs.forEach((f) => f());
}
window.addEventListener('popstate', () => subs.forEach((f) => f()));

export function useRoute() {
  const [r, setR] = useState(parse());
  useEffect(() => {
    const f = () => setR(parse());
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return r;
}

// Intercept in-app links so navigation keeps state without a reload.
export function onLink(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || !u.pathname.startsWith('/app')) return;
  e.preventDefault();
  const { route } = parse(u.pathname);
  go(route, Object.fromEntries(u.searchParams));
}
