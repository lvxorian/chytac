CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  domain_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'monitoring',
  last_checked_at TIMESTAMPTZ,
  first_seen_free_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS check_logs (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  status_code INTEGER,
  rdap_status TEXT,
  is_free BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_check_logs_domain_id ON check_logs(domain_id);
CREATE INDEX IF NOT EXISTS idx_check_logs_checked_at ON check_logs(checked_at);
