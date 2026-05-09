CREATE TABLE IF NOT EXISTS session_suggested_actions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chapter_sessions(id) ON DELETE CASCADE,
  source_turn_id TEXT REFERENCES session_turns(id) ON DELETE SET NULL,
  action_index INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  action TEXT NOT NULL CHECK (length(trim(action)) > 0),
  tone TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (
    status IN ('suggested', 'selected', 'dismissed')
  ),
  selected_turn_id TEXT REFERENCES session_turns(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_suggested_actions_session_id
  ON session_suggested_actions(session_id);

CREATE INDEX IF NOT EXISTS idx_session_suggested_actions_source_turn_id
  ON session_suggested_actions(source_turn_id);

CREATE INDEX IF NOT EXISTS idx_session_suggested_actions_selected_turn_id
  ON session_suggested_actions(selected_turn_id);
