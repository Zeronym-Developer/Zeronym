-- Waitlist: email only. No IP addresses, no wallet addresses.
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_confirmation', 'confirmed', 'unsubscribed')),
  created_at TEXT NOT NULL
);
