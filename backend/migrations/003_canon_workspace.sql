ALTER TABLE canon_facts
ADD COLUMN title TEXT;

ALTER TABLE canon_facts
ADD COLUMN category TEXT NOT NULL DEFAULT 'general';

ALTER TABLE canon_facts
ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';

ALTER TABLE canon_facts
ADD COLUMN notes TEXT;

CREATE TABLE IF NOT EXISTS canon_fact_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fact_id TEXT NOT NULL REFERENCES canon_facts(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('character', 'chapter', 'scene', 'event', 'world')),
  target_id TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  event_time TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  source_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS continuity_checks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  result_json TEXT NOT NULL,
  provider_id TEXT REFERENCES model_providers(id) ON DELETE SET NULL,
  model_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
