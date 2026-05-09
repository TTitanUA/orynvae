CREATE TABLE IF NOT EXISTS chapter_reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  source_session_id TEXT REFERENCES chapter_sessions(id) ON DELETE SET NULL,
  source_draft_version_id TEXT REFERENCES draft_versions(id) ON DELETE SET NULL,
  summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapter_reviews_project_id
  ON chapter_reviews(project_id);

CREATE INDEX IF NOT EXISTS idx_chapter_reviews_chapter_id
  ON chapter_reviews(chapter_id);

CREATE INDEX IF NOT EXISTS idx_chapter_reviews_project_status
  ON chapter_reviews(project_id, status);

CREATE TABLE IF NOT EXISTS chapter_review_story_line_updates (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES chapter_reviews(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_story_line_id TEXT REFERENCES story_lines(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  before_state TEXT,
  after_state TEXT NOT NULL CHECK (length(trim(after_state)) > 0),
  event_summary TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'rejected', 'deferred')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapter_review_line_updates_review_id
  ON chapter_review_story_line_updates(review_id);

CREATE INDEX IF NOT EXISTS idx_chapter_review_line_updates_project_status
  ON chapter_review_story_line_updates(project_id, status);

CREATE INDEX IF NOT EXISTS idx_chapter_review_line_updates_target
  ON chapter_review_story_line_updates(target_story_line_id);

CREATE TABLE IF NOT EXISTS chapter_review_notes (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES chapter_reviews(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (note_type IN ('contradiction', 'open_question')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body_json TEXT NOT NULL DEFAULT '{}',
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'resolved', 'rejected', 'deferred')
  ),
  decision_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapter_review_notes_review_id
  ON chapter_review_notes(review_id);

CREATE INDEX IF NOT EXISTS idx_chapter_review_notes_project_status
  ON chapter_review_notes(project_id, status);
