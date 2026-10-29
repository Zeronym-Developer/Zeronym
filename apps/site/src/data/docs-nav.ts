// Sidebar order for /docs. Each slug is a file in src/docs/ (except the overview and whitepaper).
export const docsNav: { group: string; items: { slug: string; title: string }[] }[] = [
  { group: 'Get started', items: [
    { slug: '', title: 'Overview' },
    { slug: 'project-status', title: 'Project status' },
    { slug: 'verify', title: 'Check it yourself' },
    { slug: 'key-ideas', title: 'Key ideas' },
  ] },
  { group: 'Using Zeronym', items: [
    { slug: 'shield', title: 'Shield' },
    { slug: 'vaults', title: 'Private vaults' },
    { slug: 'send', title: 'Send and receive' },
    { slug: 'disclose', title: 'Share a record' },
    { slug: 'withdraw', title: 'Withdraw' },
  ] },
  { group: 'Coming soon', items: [
    { slug: 'swaps', title: 'Swaps' },
    { slug: 'shared-treasuries', title: 'Shared treasuries' },
  ] },
  { group: 'Privacy and safety', items: [
    { slug: 'privacy', title: 'What stays private' },
    { slug: 'keys', title: 'Keys and recovery' },
    { slug: 'security-model', title: 'Security model' },
    { slug: 'risks', title: 'Risks' },
  ] },
  { group: 'Token and fees', items: [
    { slug: 'token', title: 'Token framework' },
    { slug: 'fees', title: 'Fees' },
  ] },
  { group: 'Developers', items: [
    { slug: 'architecture', title: 'Architecture' },
    { slug: 'contracts', title: 'Network and contracts' },
  ] },
  { group: 'Help', items: [
    { slug: 'faq', title: 'FAQ' },
    { slug: 'glossary', title: 'Glossary' },
    { slug: 'whitepaper', title: 'Whitepaper' },
  ] },
];

export const flat = docsNav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));
export const href = (slug: string) => (slug ? `/docs/${slug}/` : '/docs/');
