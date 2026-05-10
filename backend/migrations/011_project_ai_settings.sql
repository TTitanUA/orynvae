ALTER TABLE projects
ADD COLUMN default_temperature REAL NOT NULL DEFAULT 0.7 CHECK (
  default_temperature >= 0 AND default_temperature <= 2
);

ALTER TABLE projects
ADD COLUMN default_top_p REAL NOT NULL DEFAULT 0.9 CHECK (
  default_top_p >= 0 AND default_top_p <= 1
);

CREATE TABLE IF NOT EXISTS project_agent_settings (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  temperature_source TEXT NOT NULL DEFAULT 'agent_default' CHECK (
    temperature_source IN ('project', 'agent_default', 'custom')
  ),
  temperature_value REAL CHECK (
    temperature_value IS NULL OR (temperature_value >= 0 AND temperature_value <= 2)
  ),
  top_p_source TEXT NOT NULL DEFAULT 'agent_default' CHECK (
    top_p_source IN ('project', 'agent_default', 'custom')
  ),
  top_p_value REAL CHECK (
    top_p_value IS NULL OR (top_p_value >= 0 AND top_p_value <= 1)
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, agent_key)
);

CREATE INDEX IF NOT EXISTS idx_project_agent_settings_project_id
  ON project_agent_settings(project_id);

WITH latest_narrator_settings AS (
  SELECT
    project_id,
    agent_temperature,
    agent_top_p,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_index
  FROM chapter_sessions
  WHERE agent_top_p IS NOT NULL
     OR (agent_temperature IS NOT NULL AND agent_temperature != 0.7)
)
INSERT OR IGNORE INTO project_agent_settings (
  project_id,
  agent_key,
  temperature_source,
  temperature_value,
  top_p_source,
  top_p_value
)
SELECT
  project_id,
  'narrator',
  CASE
    WHEN agent_temperature IS NOT NULL AND agent_temperature != 0.7 THEN 'custom'
    ELSE 'agent_default'
  END,
  CASE
    WHEN agent_temperature IS NOT NULL AND agent_temperature != 0.7 THEN agent_temperature
    ELSE NULL
  END,
  CASE
    WHEN agent_top_p IS NOT NULL THEN 'custom'
    ELSE 'agent_default'
  END,
  agent_top_p
FROM latest_narrator_settings
WHERE row_index = 1;
