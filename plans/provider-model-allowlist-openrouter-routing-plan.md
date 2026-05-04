# Provider model allow-list and OpenRouter routing plan

## Goal

Improve `/settings/providers` so a provider can expose many discovered models, while the user curates a smaller set of allowed models for the rest of the app. The app should only offer allowed models in project setup, project workspace, chapter editor, and direct provider chat flows. The provider default model must be selected from the allowed set.

For OpenRouter providers, each allowed model should also support per-model routing preferences. These preferences should be sent as the OpenRouter `provider` object in chat completion requests.

## Current State

- `model_providers.default_model_id` stores a single default model per provider.
- `provider_models` stores all discovered models, but has no user-facing enabled/allowed state.
- `/api/providers` returns every stored model for each provider.
- Frontend model selectors use `provider.models` directly in:
  - `frontend/src/routes/ProviderSettingsRoute.tsx`
  - `frontend/src/routes/ProjectsRoute.tsx`
  - `frontend/src/routes/ProjectWorkspaceRoute.tsx`
  - `frontend/src/routes/ChapterEditorPanel.tsx`
- Backend validation only checks that a provider exists. It does not verify that the selected model belongs to the provider or is allowed.
- `OpenAICompatibleAdapter` builds OpenAI-compatible payloads with `model`, `messages`, `temperature`, and `stream`, but does not include OpenRouter routing preferences.

## OpenRouter Routing Reference

OpenRouter routing is configured by adding a `provider` object to the chat completions request body. The documented fields include:

- `order`: provider slugs to try first, in order.
- `allow_fallbacks`: whether backup providers may be used.
- `require_parameters`: only use providers supporting all request parameters.
- `data_collection`: `allow` or `deny`.
- `zdr`: restrict to zero-data-retention endpoints.
- `enforce_distillable_text`: restrict to models allowing text distillation.
- `only`: allow only listed provider slugs.
- `ignore`: skip listed provider slugs.
- `quantizations`: restrict by quantization level.
- `sort`: `price`, `throughput`, `latency`, or an object with `by` and `partition`.
- `preferred_min_throughput` and `preferred_max_latency`: performance preferences.
- `max_price`: maximum accepted pricing.

Because this app calls the REST API directly, persisted config should serialize to snake_case keys.

Source: https://openrouter.ai/docs/guides/routing/provider-selection

## Stage 1. Data Model and Migration

Add a migration, for example `backend/migrations/004_provider_model_preferences.sql`.

Schema changes:

- Add `provider_models.is_allowed INTEGER NOT NULL DEFAULT 0`.
- Add `provider_models.routing_config_json TEXT`.

Backfill policy:

- Mark existing `provider_models` rows as allowed to preserve current behavior after migration.
- Ensure any `model_providers.default_model_id` that exists in `provider_models` remains allowed.
- During later refreshes, preserve existing `is_allowed` and `routing_config_json` on conflict.
- Newly discovered models should default to not allowed, so a refresh does not suddenly flood app selectors.

Store shape:

```json
{
  "order": ["deepinfra/turbo"],
  "allow_fallbacks": false,
  "require_parameters": true,
  "data_collection": "deny",
  "zdr": true,
  "sort": { "by": "latency", "partition": "model" },
  "preferred_max_latency": { "p90": 3 },
  "max_price": { "prompt": 1, "completion": 2 }
}
```

Do not store OpenRouter routing fields on `model_providers`; the requested behavior is per model.

## Stage 2. Backend Models and Store API

Update `backend/app/models/providers.py`:

- Extend `ProviderModelRecord` with:
  - `is_allowed: bool`
  - `routing_config: dict[str, object] | None`
- Add typed request models:
  - `ProviderModelPreference`
  - `ProviderModelPreferencesUpdate`
  - `OpenRouterRoutingConfig`

Keep validation strict enough to avoid bad JSON, but flexible enough for OpenRouter changes:

- Known fields get typed validation.
- Unknown fields are either rejected by default or allowed only through an explicit advanced JSON editor decision.
- Empty arrays, empty objects, and falsey optional values should be stripped before sending to OpenRouter, except intentional booleans like `allow_fallbacks: false`.

Update `backend/app/services/provider_store.py`:

- Read/write `is_allowed` and `routing_config_json`.
- Add `list_allowed_models(provider_id)`.
- Add `get_allowed_model(provider_id, model_id)`.
- Add `update_model_preferences(provider_id, payload)` to save allow-list, default model, and routing configs atomically.
- Add a helper to clear or reject `default_model_id` when it is not allowed.

Update `upsert_models`:

- On insert: create the model with `is_allowed = 0`, unless it matches the current provider default.
- On conflict: update display/capability metadata, but never overwrite `is_allowed` or `routing_config_json`.

## Stage 3. Backend API Contract

Add or replace with one batch endpoint:

```http
PATCH /api/providers/{provider_id}/models/preferences
```

Request:

```json
{
  "default_model_id": "anthropic/claude-sonnet-4.5",
  "models": [
    {
      "model_id": "anthropic/claude-sonnet-4.5",
      "is_allowed": true,
      "routing_config": {
        "order": ["anthropic"],
        "allow_fallbacks": true,
        "data_collection": "deny"
      }
    }
  ]
}
```

Behavior:

- Reject unknown provider with 404.
- Reject a default model that is not allowed with 422.
- Reject OpenRouter routing config on non-OpenRouter providers, or store it as null.
- Return the updated `ProviderWithModels`.
- Keep `/default-model` temporarily for compatibility, but make it validate against allowed models.

Update model selection validation:

- `_validate_provider_selection` should confirm:
  - provider exists;
  - provider is enabled when used for an AI call;
  - model exists under that provider;
  - model is allowed.
- Apply the same guard to `/api/providers/{provider_id}/chat`, project setup analysis, chapter assist, and continuity check.

## Stage 4. OpenRouter Request Integration

Extend adapter method signatures:

```python
complete_chat(..., routing_config: dict[str, object] | None = None)
stream_chat(..., routing_config: dict[str, object] | None = None)
```

For `OpenAICompatibleAdapter`:

- If `provider.type == "openrouter"` and a routing config exists, add it to payload as `provider`.
- For non-OpenRouter providers, ignore routing config.
- Apply the same payload construction to streaming and non-streaming requests.
- Consider centralizing payload creation so streaming and non-streaming cannot drift.

Example REST payload:

```json
{
  "model": "deepseek/deepseek-r1",
  "messages": [{ "role": "user", "content": "Hello" }],
  "temperature": 0.7,
  "stream": true,
  "provider": {
    "order": ["deepinfra/turbo"],
    "allow_fallbacks": false
  }
}
```

## Stage 5. Frontend Types and API Client

Update `frontend/src/types/providers.ts`:

- Extend `ProviderModel` with:
  - `is_allowed: boolean`
  - `routing_config: Record<string, unknown> | null`
- Add payload types for model preference updates and OpenRouter routing config.

Update `frontend/src/api/providers.ts`:

- Add `updateProviderModelPreferences(providerId, payload)`.
- Add helpers:
  - `allowedModels(provider)`
  - `defaultModelFor(provider)` so it is not duplicated across routes.
- Update `preferredProvider` to consider allowed models, not all discovered models.

## Stage 6. Provider Settings UX

In `ProviderSettingsRoute.tsx`, replace the single "model for project" select with a model management panel per provider.

Controls:

- Search/filter input for large model lists.
- Allowed checkbox per model.
- Default radio button or star button per allowed model.
- "Allowed only" / "All models" filter.
- Bulk actions: allow selected, disallow selected, clear selection.
- Count badges: total discovered, allowed, default set.
- Save button that persists model allow-list, default model, and routing configs in one request.

OpenRouter-only controls per model:

- Collapsible "Routing" section or modal.
- Provider slug chip inputs for `order`, `only`, and `ignore`.
- `allow_fallbacks` toggle.
- `require_parameters` toggle.
- `data_collection` segmented control: `allow` / `deny`.
- `zdr` toggle.
- `enforce_distillable_text` toggle.
- `sort` control: default, price, throughput, latency.
- Optional sort partition: `model` / `none`.
- Quantization chip selector for `int4`, `int8`, `fp4`, `fp6`, `fp8`, `fp16`, `bf16`, `fp32`, `unknown`.
- Optional numeric fields for `max_price`, `preferred_min_throughput`, and `preferred_max_latency`.
- Read-only JSON preview of the generated `provider` object.

UX validation:

- Do not allow setting default on a disallowed model.
- If the current default is unchecked, require choosing a new default or confirm clearing it.
- Warn when `allow_fallbacks` is false and neither `order` nor `only` is set.
- Warn when the same provider slug appears in both `only` and `ignore`.
- Keep provider slugs free-form because OpenRouter variant slugs may include suffixes like `deepinfra/turbo` or region suffixes.

## Stage 7. Consumer Screens

Update all app model selectors to use allowed models:

- `ProjectsRoute.tsx`
- `ProjectWorkspaceRoute.tsx`
- `ChapterEditorPanel.tsx`
- Any direct provider chat/test UI if added later.

Behavior:

- Provider dropdown still lists enabled providers.
- Model dropdown only lists `allowedModels(provider)`.
- Default model is selected from allowed models.
- If a project references a model that is no longer allowed, show it as a legacy/current option with a warning, but do not offer it as a normal choice for new selections.
- AI calls should fail fast with a clear backend error if a disallowed model is submitted.

## Stage 8. Tests

Backend tests:

- Migration adds `is_allowed` and `routing_config_json`.
- Existing provider models are backfilled as allowed.
- Refresh preserves existing allow-list and routing config.
- Newly discovered models default to not allowed.
- Default model cannot be set to a disallowed model.
- Project/provider chat rejects disallowed models.
- OpenRouter chat payload includes the saved `provider` object.
- Non-OpenRouter chat payload never includes OpenRouter routing config.

Frontend tests:

- Provider settings can allow multiple models.
- Default model can only be chosen from allowed models.
- App selectors show only allowed models.
- OpenRouter routing editor serializes expected snake_case config.
- Disallowed current project model shows a warning state.

## Stage 9. Manual Verification

Use the project launcher on Windows:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; . .\scripts\tool-env.ps1
.\scripts\dev.cmd
```

Manual Chrome DevTools flow:

1. Open `http://127.0.0.1:9002/settings/providers`.
2. Refresh models for a provider with many models.
3. Allow several models and choose one default.
4. Save and reload the page; verify allowed/default state persists.
5. Open project setup and verify only allowed models appear.
6. Open an existing project workspace and verify model selection uses the same allowed set.
7. For OpenRouter, set routing on one model, run a test or AI action, and inspect the network/backend request path to confirm the `provider` object is sent.
8. Check browser console and network panels for errors.

## Suggested Implementation Order

1. Migration and backend data model.
2. Store helpers and API endpoint for model preferences.
3. Backend validation and OpenRouter payload integration.
4. Frontend types/API helpers.
5. Provider settings UI.
6. Consumer screen filtering.
7. Tests.
8. Manual browser verification.

## Open Decisions

- Whether to expose a raw advanced JSON editor for routing configs in v1, or keep only structured controls.
- Whether newly discovered local-provider models should default to allowed while external-provider models default to disallowed. The safer global rule is "new models are disallowed until selected".
- Whether to support OpenRouter multi-model fallback requests using `models: [...]`. This plan keeps app behavior as one selected model per action, chosen from the allow-list.
