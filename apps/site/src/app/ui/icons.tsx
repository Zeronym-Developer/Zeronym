// Line icons, 24px grid, drawn for Zeronym. currentColor stroke.
import type { JSX } from 'preact';

const P: Record<string, JSX.Element> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="8" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="14.5" width="7" height="6" rx="2" /></>,
  shield: <><path d="M12 3.2 4.8 6v5.6c0 4.4 3 7.8 7.2 9.2 4.2-1.4 7.2-4.8 7.2-9.2V6L12 3.2Z" /><path d="M12 8.5v6M9.2 12 12 14.8 14.8 12" /></>,
  send: <><path d="M4 12.5 20 4l-5.5 16-3.2-6.8L4 12.5Z" /><path d="m11.3 13.2 4-4" /></>,
  receive: <><path d="M17 7 7 17M7 9.5V17h7.5" /><path d="M4 20.5h16" /></>,
  withdraw: <><path d="M14 4h5.5v5.5M19.5 4l-8 8" /><path d="M17 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4.5" /></>,
  vaults: <><rect x="3.5" y="4" width="17" height="16" rx="3" /><circle cx="12" cy="12" r="3.4" /><path d="M12 8.6V7M12 17v-1.6M15.4 12H17M7 12h1.6" /></>,
  activity: <><path d="M3.5 12h3.8l2.4-6 4.6 12 2.4-6h3.8" /></>,
  receipts: <><path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.5v-17Z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></>,
  token: <><circle cx="12" cy="12" r="8.5" /><path d="M9 9h6l-6 6h6" /></>,
  account: <><circle cx="8.5" cy="12" r="4" /><path d="M12.5 12h8M17.5 12v3M20.5 12v2.5" /></>,
  docs: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /></>,
  fallback: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.3C3.9 9 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.6 4.6-1.4" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  external: <><path d="M13.5 4H20v6.5M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.4" /></>,
  warn: <><path d="M12 3.5 21.5 20h-19L12 3.5Z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16.5" height="11.5" rx="2.5" /><circle cx="16" cy="13.75" r="1.2" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19.5h1M19.5 14v1" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4.5 19.5h15" /></>,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  archive: <><rect x="3.5" y="4" width="17" height="4.5" rx="1.5" /><path d="M5 8.5v9A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-9M10 12.5h4" /></>,
  swap: <><path d="M7 4 3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  spark: <path d="M12 3.5 13.6 10.4 20.5 12l-6.9 1.6L12 20.5l-1.6-6.9L3.5 12l6.9-1.6L12 3.5Z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5Z" /></>,
  logout: <><path d="M14 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H14" /><path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" /></>,
  back: <path d="M14.5 6 8.5 12l6 6" />,
  phone: <><rect x="7" y="3.5" width="10" height="17" rx="2.5" /><path d="M11 17.5h2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 16.9v.2" /></>,
  history: <><path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8L3.8 8.6" /><path d="M3.8 4.5v4.1h4.1M12 8v4l2.8 1.8" /></>,
  report: <><path d="M6.5 3.5h7.5l4 4v13h-11.5z" /><path d="M14 3.5v4h4M9.5 17v-2.5M12 17v-5M14.5 17v-3.5" /></>,
  arrowIn: <path d="M17 7 7 17M7 9v8h8" />,
  arrowOut: <path d="M7 17 17 7M9 7h8v8" />,
  trend: <><path d="m3.5 16.5 5.5-5.5 4 4 7.5-7.5" /><path d="M15 7.5h5.5V13" /></>,
  refresh: <><path d="M19.5 12A7.5 7.5 0 0 1 6.2 16.8M4.5 12a7.5 7.5 0 0 1 13.3-4.8" /><path d="M18 3.8v3.6h-3.6M6 20.2v-3.6h3.6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.8 19.5c.6-3.2 3.1-5.3 6.2-5.3s5.6 2.1 6.2 5.3M15.8 5.3a3.5 3.5 0 0 1 0 6.4M17.8 14.5c1.8.7 3 2.4 3.4 5" /></>,
  share: <><path d="M12 14.5V3.5" /><path d="m7.5 8 4.5-4.5L16.5 8" /><path d="M5.5 12.5v7h13v-7" /></>,
  collapse: <path d="m11 7-5 5 5 5M18 7l-5 5 5 5" />,
  settings: <><path d="M10.3 3.5h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9L6 13V11.1L4.2 9.5l1.7-2.9 2.3.8 1.6-.9.5-2.4Z" /><circle cx="12" cy="12" r="2.8" /></>,
  flag: <><path d="M5 20.5V4M5 4.5h11l-2 4 2 4H5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></>,
};

export function Icon({ name, size = 20, class: cls }: { name: keyof typeof P | string; size?: number; class?: string }) {
  return (
    <svg class={cls ? `ic ${cls}` : 'ic'} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {P[name] || P.info}
    </svg>
  );
}
