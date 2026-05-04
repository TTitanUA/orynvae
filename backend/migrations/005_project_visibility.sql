ALTER TABLE projects
ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (key, value_json)
VALUES ('privacy', '{"show_hidden_items": false}');
