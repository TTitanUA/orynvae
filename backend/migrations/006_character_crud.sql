ALTER TABLE characters
ADD COLUMN gender TEXT;

ALTER TABLE characters
ADD COLUMN age TEXT;

CREATE INDEX IF NOT EXISTS idx_characters_project_updated
ON characters(project_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_character_relationships_project_source
ON character_relationships(project_id, source_character_id);

CREATE INDEX IF NOT EXISTS idx_character_relationships_project_target
ON character_relationships(project_id, target_character_id);
