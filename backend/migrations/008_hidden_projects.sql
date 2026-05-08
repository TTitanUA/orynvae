ALTER TABLE projects
ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1));

CREATE INDEX idx_projects_is_hidden ON projects(is_hidden);
