ALTER TABLE chapter_sessions
  ADD COLUMN agent_instructions TEXT;

ALTER TABLE chapter_sessions
  ADD COLUMN agent_temperature REAL DEFAULT 0.7 CHECK (
    agent_temperature IS NULL OR (agent_temperature >= 0 AND agent_temperature <= 2)
  );

ALTER TABLE chapter_sessions
  ADD COLUMN agent_top_p REAL CHECK (
    agent_top_p IS NULL OR (agent_top_p >= 0 AND agent_top_p <= 1)
  );

ALTER TABLE chapter_sessions
  ADD COLUMN agent_reasoning_effort TEXT CHECK (
    agent_reasoning_effort IS NULL OR agent_reasoning_effort IN ('low', 'medium', 'high')
  );

ALTER TABLE key_events
  ADD COLUMN source_turn_id TEXT REFERENCES session_turns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_key_events_source_turn_id
  ON key_events(source_turn_id);
