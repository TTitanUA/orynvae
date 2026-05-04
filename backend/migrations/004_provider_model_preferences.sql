ALTER TABLE provider_models
ADD COLUMN is_allowed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE provider_models
ADD COLUMN routing_config_json TEXT;

UPDATE provider_models
SET is_allowed = 1;

UPDATE provider_models
SET is_allowed = 1
WHERE EXISTS (
  SELECT 1
  FROM model_providers
  WHERE model_providers.id = provider_models.provider_id
    AND model_providers.default_model_id = provider_models.model_id
);
