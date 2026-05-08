PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS forecast_options;
DROP TABLE IF EXISTS forecasts;
DROP TABLE IF EXISTS draft_versions;
DROP TABLE IF EXISTS key_events;
DROP TABLE IF EXISTS session_turns;
DROP TABLE IF EXISTS chapter_sessions;
DROP TABLE IF EXISTS chapters;
DROP TABLE IF EXISTS story_line_progress;
DROP TABLE IF EXISTS story_lines;
DROP TABLE IF EXISTS memory_proposals;
DROP TABLE IF EXISTS memory_relations;
DROP TABLE IF EXISTS memory_items;
DROP TABLE IF EXISTS projects;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  synopsis TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  active_provider_id TEXT REFERENCES model_providers(id) ON DELETE SET NULL,
  active_model_id TEXT,
  expansion_policy TEXT NOT NULL DEFAULT 'ask',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_archived_at ON projects(archived_at);
CREATE INDEX idx_projects_active_provider_id ON projects(active_provider_id);
CREATE INDEX idx_projects_active_model_id ON projects(active_model_id);

CREATE TABLE memory_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN (
      'character',
      'location',
      'item',
      'group',
      'world_rule',
      'mystery',
      'event',
      'canon_fact',
      'note'
    )
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  summary TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('proposed', 'draft', 'canon', 'rejected', 'outdated')
  ),
  source_type TEXT,
  source_id TEXT,
  importance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memory_items_project_id ON memory_items(project_id);
CREATE INDEX idx_memory_items_project_type ON memory_items(project_id, type);
CREATE INDEX idx_memory_items_project_status ON memory_items(project_id, status);

CREATE TABLE memory_relations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_item_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  to_item_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (length(trim(relation_type)) > 0),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_memory_relations_project_id ON memory_relations(project_id);
CREATE INDEX idx_memory_relations_from_item_id ON memory_relations(from_item_id);
CREATE INDEX idx_memory_relations_to_item_id ON memory_relations(to_item_id);

CREATE TABLE memory_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK (length(trim(proposal_type)) > 0),
  target_item_id TEXT REFERENCES memory_items(id) ON DELETE SET NULL,
  suggested_payload TEXT NOT NULL DEFAULT '{}',
  reason TEXT,
  source_type TEXT,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'edited', 'rejected', 'deferred')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memory_proposals_project_id ON memory_proposals(project_id);
CREATE INDEX idx_memory_proposals_project_status ON memory_proposals(project_id, status);
CREATE INDEX idx_memory_proposals_target_item_id ON memory_proposals(target_item_id);

CREATE TABLE story_lines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('character', 'mystery', 'relationship', 'threat', 'theme', 'custom')
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  current_state TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'active', 'sleeping', 'completed', 'rejected')
  ),
  priority INTEGER NOT NULL DEFAULT 0,
  last_progress_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_story_lines_project_id ON story_lines(project_id);
CREATE INDEX idx_story_lines_project_status ON story_lines(project_id, status);
CREATE INDEX idx_story_lines_project_type ON story_lines(project_id, type);

CREATE TABLE story_line_progress (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  story_line_id TEXT NOT NULL REFERENCES story_lines(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES chapter_sessions(id) ON DELETE SET NULL,
  before_state TEXT,
  after_state TEXT,
  event_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_story_line_progress_project_id ON story_line_progress(project_id);
CREATE INDEX idx_story_line_progress_story_line_id ON story_line_progress(story_line_id);
CREATE INDEX idx_story_line_progress_chapter_id ON story_line_progress(chapter_id);
CREATE INDEX idx_story_line_progress_session_id ON story_line_progress(session_id);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN (
      'planned',
      'in_session',
      'session_done',
      'draft_generated',
      'reviewing',
      'completed'
    )
  ),
  synopsis TEXT,
  draft_markdown TEXT NOT NULL DEFAULT '',
  final_markdown TEXT NOT NULL DEFAULT '',
  session_id TEXT REFERENCES chapter_sessions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chapters_project_id ON chapters(project_id);
CREATE INDEX idx_chapters_project_status ON chapters(project_id, status);
CREATE INDEX idx_chapters_session_id ON chapters(session_id);

CREATE TABLE chapter_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (
    status IN ('preparing', 'active', 'paused', 'completed', 'draft_ready', 'reviewed')
  ),
  user_role TEXT,
  controlled_character_ids TEXT NOT NULL DEFAULT '[]',
  active_story_line_ids TEXT NOT NULL DEFAULT '[]',
  tone TEXT,
  pace TEXT,
  expansion_policy_override TEXT,
  started_at TEXT,
  paused_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chapter_sessions_project_id ON chapter_sessions(project_id);
CREATE INDEX idx_chapter_sessions_chapter_id ON chapter_sessions(chapter_id);
CREATE INDEX idx_chapter_sessions_project_status ON chapter_sessions(project_id, status);

CREATE TABLE session_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chapter_sessions(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ai', 'user', 'system')),
  turn_type TEXT NOT NULL CHECK (
    turn_type IN (
      'narration',
      'action',
      'dialogue',
      'author_command',
      'choice',
      'note',
      'summary'
    )
  ),
  content TEXT NOT NULL,
  related_memory_item_ids TEXT NOT NULL DEFAULT '[]',
  related_story_line_ids TEXT NOT NULL DEFAULT '[]',
  is_key_event INTEGER NOT NULL DEFAULT 0 CHECK (is_key_event IN (0, 1)),
  exclude_from_draft INTEGER NOT NULL DEFAULT 0 CHECK (exclude_from_draft IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, turn_index)
);

CREATE INDEX idx_session_turns_session_id ON session_turns(session_id);
CREATE INDEX idx_session_turns_session_key_event ON session_turns(session_id, is_key_event);

CREATE TABLE key_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES chapter_sessions(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  summary TEXT,
  consequences TEXT,
  related_memory_item_ids TEXT NOT NULL DEFAULT '[]',
  related_story_line_ids TEXT NOT NULL DEFAULT '[]',
  include_in_draft INTEGER NOT NULL DEFAULT 1 CHECK (include_in_draft IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_key_events_project_id ON key_events(project_id);
CREATE INDEX idx_key_events_session_id ON key_events(session_id);
CREATE INDEX idx_key_events_chapter_id ON key_events(chapter_id);

CREATE TABLE draft_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  source_session_id TEXT REFERENCES chapter_sessions(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (
    mode IN (
      'faithful',
      'literary',
      'shorter',
      'expanded',
      'dialogue_focus',
      'atmosphere_focus'
    )
  ),
  markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (
    status IN ('generated', 'edited', 'accepted')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_draft_versions_project_id ON draft_versions(project_id);
CREATE INDEX idx_draft_versions_chapter_id ON draft_versions(chapter_id);
CREATE INDEX idx_draft_versions_source_session_id ON draft_versions(source_session_id);

CREATE TABLE forecasts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'generated',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_forecasts_project_id ON forecasts(project_id);
CREATE INDEX idx_forecasts_source_chapter_id ON forecasts(source_chapter_id);

CREATE TABLE forecast_options (
  id TEXT PRIMARY KEY,
  forecast_id TEXT NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  likely_consequences TEXT NOT NULL DEFAULT '[]',
  related_story_line_ids TEXT NOT NULL DEFAULT '[]',
  risks TEXT NOT NULL DEFAULT '[]',
  is_selected_as_orientation INTEGER NOT NULL DEFAULT 0 CHECK (
    is_selected_as_orientation IN (0, 1)
  )
);

CREATE INDEX idx_forecast_options_forecast_id ON forecast_options(forecast_id);

PRAGMA foreign_keys = ON;
