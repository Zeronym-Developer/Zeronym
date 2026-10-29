-- Double opt-in dropped: signups are subscribed immediately.
CREATE TABLE waitlist_new (
  email TEXT PRIMARY KEY,
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('subscribed', 'unsubscribed')),
  created_at TEXT NOT NULL
);
INSERT INTO waitlist_new (email, consent_at, status, created_at)
  SELECT email, consent_at, CASE WHEN status = 'unsubscribed' THEN 'unsubscribed' ELSE 'subscribed' END, created_at FROM waitlist;
DROP TABLE waitlist;
ALTER TABLE waitlist_new RENAME TO waitlist;
