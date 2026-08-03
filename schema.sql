-- Neuromodulator colour poll — D1 schema
-- Apply with:  npx wrangler d1 execute nm-colors --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS responses (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),

  -- one column per neuromodulator, storing the palette KEY (e.g. 'yellow'),
  -- never a hex value. This way you can restyle the palette later without
  -- corrupting historical data.
  serotonin          TEXT    NOT NULL,
  noradrenaline      TEXT    NOT NULL,
  dopamine           TEXT    NOT NULL,
  acetylcholine      TEXT    NOT NULL,

  -- covariate: 1 = works in neuroscience, 0 = does not
  neuro_work         INTEGER NOT NULL CHECK (neuro_work IN (0, 1)),

  -- the randomised order this respondent saw, comma-separated,
  -- so you can test for an order effect afterwards
  presentation_order TEXT    NOT NULL,

  -- SHA-256(ip + user-agent + secret salt). The raw IP is never stored.
  submitter_hash     TEXT    NOT NULL,

  -- crude geographic/linguistic covariate, from Cloudflare. May be NULL.
  country            TEXT,

  -- milliseconds from page load to submit; useful for filtering junk later
  elapsed_ms         INTEGER
);

-- Supports the rate-limit lookup (hash + recent window).
CREATE INDEX IF NOT EXISTS idx_responses_hash_time
  ON responses (submitter_hash, created_at);

-- Supports the tally queries.
CREATE INDEX IF NOT EXISTS idx_responses_neuro_work
  ON responses (neuro_work);
