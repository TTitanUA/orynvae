# План перевода AI-ассистентов на глобальные настройки проекта

Дата: 2026-05-10
Ветка: `v2`
Область: project AI settings, action settings resolver, per-agent temperature/Top P, shared frontend modal, removal of scattered model selectors.

## Цель

Сделать проектные настройки AI единой точкой управления для всех ассистентов внутри проекта:

- проект хранит активного провайдера, модель, температуру по умолчанию и Top P по умолчанию;
- эти настройки доступны из любого экрана проекта через кнопку в общем shell/header и модалку "Модель ассистента";
- каждый ассистент имеет свои настройки температуры и Top P;
- provider/model больше не выбираются отдельно на экранах ассистентов после создания проекта;
- backend сам резолвит настройки для каждого `AiActionRequest`, чтобы frontend не был источником истины для LLM-параметров.

## Текущее состояние

- `projects` хранит только `active_provider_id` и `active_model_id`.
- `AiActionRequest` уже несет `provider_id`, `model_id`, `temperature`, `top_p`, `reasoning_effort`, но `temperature=0.7` задана как default на уровне модели запроса. Из-за этого backend не отличает "пользователь передал 0.7" от "экран ничего не выбрал".
- Большинство frontend-экранов держит собственные state-поля `provider/model/temperature/top_p/reasoning` и отправляет их в payload.
- Рассказчик имеет сохраненные session-level поля `agent_temperature`, `agent_top_p`, `agent_reasoning_effort` и `agent_instructions`.
- `runtime_status` выбирает project provider/model, затем fallback на default provider/model. Настроек температуры и Top P в runtime нет.

## Архитектурные решения

- Provider/model становятся только проектными настройками. Per-agent provider/model в MVP не добавляем.
- Project default generation settings:
  - `projects.default_temperature`;
  - `projects.default_top_p`.
- Per-agent generation settings хранятся отдельно от `projects`, потому что список ассистентов будет расти и не должен раздувать таблицу проектов.
- Для per-agent параметров нужен источник значения:
  - `project`: использовать `projects.default_temperature/default_top_p`;
  - `agent_default`: использовать кодовый пресет для конкретного ассистента;
  - `custom`: использовать сохраненное значение пользователя.
- `reasoning_effort` не включаем в этот план как обязательную глобальную настройку, потому что пользовательский запрос требует provider/model/temperature/top_p. Существующее поле оставляем в API для совместимости и кодовых кейсов, но убираем из обязательного глобального UI, если не появится отдельное продуктовое решение.
- `agent_instructions` рассказчика остаются session-level настройкой рассказчика. Новая глобальная модалка не содержит секцию "Инструкции".
- Старт истории до создания проекта остается особым bootstrap flow: пользователь выбирает provider/model/default temperature/default Top P на экране создания, а при подтверждении эти значения сохраняются в созданный проект. После создания проекта все AI-действия идут через проектные настройки.

## Словарь ассистентов

Ввести backend enum/string union `ProjectAgentKey` и маппинг из `AiActionType`:

- `start_story_interviewer`: `analyze_synopsis`, `extract_story_memory`, `suggest_start_points`;
- `story_line_generator`: `suggest_story_lines`, `update_story_lines`;
- `chapter_preparer`: `prepare_chapter_session`;
- `narrator`: `narrate_turn`;
- `narrator_action_variants`: `suggest_turn_actions`;
- `draft_assembler`: `assemble_draft`;
- `draft_fragment_editor`: `edit_markdown_fragment`;
- `chapter_reviewer`: `review_chapter`, `extract_key_events`, `extract_memory_updates`;
- `forecaster`: `forecast_next`;
- `contradiction_checker`: `check_contradictions`;
- `session_summarizer`: `summarize_session`.

Начальные кодовые пресеты держать рядом с resolver, например:

```text
narrator: project defaults
narrator_action_variants: temperature 0.8, Top P project
chapter_reviewer: temperature 0.35, Top P project
contradiction_checker: temperature 0.2, Top P project
forecaster: temperature 0.75, Top P project
draft_fragment_editor: temperature 0.55, Top P project
```

Точные числа можно скорректировать при реализации, но сам механизм должен поддерживать и project defaults, и строгие кодовые дефолты.

## Backend data model

Добавить миграцию, например `011_project_ai_settings.sql`:

- `projects.default_temperature REAL NOT NULL DEFAULT 0.7 CHECK (default_temperature >= 0 AND default_temperature <= 2)`;
- `projects.default_top_p REAL NOT NULL DEFAULT 0.9 CHECK (default_top_p >= 0 AND default_top_p <= 1)`;
- `project_agent_settings`:
  - `project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE`;
  - `agent_key TEXT NOT NULL`;
  - `temperature_source TEXT NOT NULL DEFAULT 'agent_default' CHECK (...)`;
  - `temperature_value REAL CHECK (temperature_value IS NULL OR temperature_value BETWEEN 0 AND 2)`;
  - `top_p_source TEXT NOT NULL DEFAULT 'agent_default' CHECK (...)`;
  - `top_p_value REAL CHECK (top_p_value IS NULL OR top_p_value BETWEEN 0 AND 1)`;
  - `created_at`, `updated_at`;
  - primary key `(project_id, agent_key)`.

Backfill:

- всем существующим проектам поставить `default_temperature=0.7`, `default_top_p=0.9`;
- для narrator можно создать `project_agent_settings` из последней обновленной сессии проекта, если там есть `agent_temperature/agent_top_p`;
- старые `chapter_sessions.agent_temperature/agent_top_p` не удалять в этой миграции, чтобы не ломать существующие сессии и тесты; новые вызовы рассказчика должны читать per-agent settings проекта.

## Backend API

Добавить проектно-скоупленные endpoints:

- `GET /api/projects/{project_id}/ai-settings`;
- `PATCH /api/projects/{project_id}/ai-settings`.

Response должен возвращать:

- project default provider/model/temperature/top_p;
- список доступных ассистентов с label, effective temperature/top_p, source и custom value;
- runtime/read-only reason;
- предупреждение, если выбранная модель стала недоступной или не поддерживает параметр.

PATCH должен уметь атомарно обновлять:

- `active_provider_id`;
- `active_model_id`;
- `default_temperature`;
- `default_top_p`;
- per-agent `temperature_source/value`;
- per-agent `top_p_source/value`.

Валидация:

- provider должен существовать, быть enabled и не иметь `last_error`;
- model должен существовать и быть `is_allowed`;
- если модель не поддерживает `top_p`, сохранять настройку можно, но resolver не должен отправлять `top_p` в provider request;
- сохранение AI-настроек является конфигурацией, а не творческим действием. GET и PATCH должны быть доступны в read-only режиме, чтобы пользователь мог восстановить проект, выбрав рабочий provider/model. Творческие AI-действия остаются заблокированы до появления доступной модели.

## Backend resolver

Добавить единый сервис, например `backend/app/services/project_ai_settings.py`:

- `get_project_ai_settings(project_id)`;
- `update_project_ai_settings(project_id, payload)`;
- `resolve_project_generation_settings(project_id, action_type)`;
- `agent_key_for_action(action_type)`;
- `effective_agent_parameter(project, agent_settings, preset)`.

Результат resolver:

```text
provider_id
model_id
temperature
top_p
agent_key
source metadata for logs/tests
```

Изменить создание `AiActionRequest` так, чтобы project-scoped services не прокидывали scattered настройки из UI. Лучше добавить wrapper:

- `execute_project_action(project_id, action_type, input, context, streaming=False, privacy_level='project')`;
- `stream_project_action_events(...)`.

Wrapper резолвит provider/model/temperature/top_p и потом вызывает существующий `execute_action`.

Важно: публичные request-модели для project-scoped AI-действий должны сделать `temperature/top_p/provider_id/model_id` optional или убрать их из frontend payload. Иначе default `0.7` продолжит маскировать отсутствие настроек.

## Backend services to update

Обновить все project-scoped AI-вызовы:

- `start_story.py`: pre-project analyze/refine оставляет bootstrap параметры; confirm сохраняет project defaults.
- `story_lines.py`: убрать зависимость от payload provider/model/temp/top_p, использовать resolver.
- `chapters.py`: `prepare_chapter_session` использует `chapter_preparer`.
- `narrator_sessions.py`: `narrate_turn` использует `narrator`; `suggest_turn_actions` использует `narrator_action_variants`; session `agent_instructions` продолжает попадать в context.
- `stage7.py`: draft assembly, fragment edit, review and forecast используют свои agent keys.
- `memory.py`: contradiction check использует `contradiction_checker`, а не жесткое `project.active_provider_id/active_model_id` плюс default `AiActionRequest`.

Старые payload поля можно временно оставить в Pydantic моделях как deprecated optional для API compatibility, но frontend не должен их отправлять для project-scoped экранов.

## Frontend UI

Создать общий feature/entity слой:

- `frontend/src/entities/project-ai-settings`;
- API helpers, query keys, mutations, types;
- helper для effective settings и provider/model capabilities.

Создать reusable modal:

- `ProjectAssistantModelSettingsModal`;
- внешний вид основан на текущем блоке `AgentSettingsPanel` в narrator route;
- заголовок "Модель ассистента";
- секции:
  - project defaults: provider, model, temperature, Top P;
  - ассистенты: список per-agent temperature/top_p with source controls;
- без секции "Инструкции";
- ссылка/иконка на `/settings/providers`, если provider/model недоступны;
- save/cancel, pending/error states, optimistic refresh через React Query.

Доступ из любого экрана проекта:

- добавить кнопку с `SlidersHorizontal` или `Bot` в `AppShell`, когда route содержит `projectId`;
- кнопка должна быть видна на `/projects/:projectId` и всех дочерних маршрутах;
- модалка грузит `project-ai-settings` по текущему `projectId`;
- на страницах вне конкретного проекта кнопку не показывать.

## Frontend screens to simplify

Убрать локальные provider/model/temp/top_p controls и заменить на compact model summary/link to modal:

- `StoryLinesRoute`;
- `StoryLineDetailRoute`;
- `ChapterPrepareRoute`;
- `NarratorSessionRoute`;
- `DraftAssemblyRoute`;
- `ChapterReviewRoute`, если появится UI выбора;
- `ForecastRoute`, если появится UI выбора;
- memory contradiction check UI, если будет отдельный экран.

Для narrator:

- убрать из route модельный selector и sliders;
- оставить отдельный session-level блок "Инструкции рассказчика";
- turns/regenerate actions отправляют только контент, selected option, comment/prompt. Настройки берет backend.

Для draft assembly:

- убрать встроенный блок "Модель ассистента";
- draft assembly/assist payload не содержит provider/model/temp/top_p.

Для start story:

- сохранить bootstrap model block на экране создания проекта;
- при confirm отправить выбранные provider/model/default temperature/default Top P, чтобы новый проект сразу получил глобальные настройки.

## Tests

Backend:

- migration добавляет новые поля и таблицу;
- project store читает/пишет `default_temperature/default_top_p`;
- settings endpoint возвращает defaults and effective agent settings;
- PATCH валидирует disabled provider, unknown/disallowed model and parameter bounds;
- resolver выбирает project provider/model;
- resolver применяет `project`, `agent_default`, `custom` sources;
- resolver не отправляет `top_p`, если модель его не поддерживает;
- каждый service вызывает AI через resolver с правильным `agent_key`;
- narrator больше не использует `chapter_sessions.agent_temperature/top_p` для новых ходов;
- legacy payload provider/model/temp/top_p не ломает API, но не имеет приоритета над project settings для project-scoped actions;
- read-only без AI блокирует creative actions, но settings GET/PATCH работают для восстановления provider/model;
- debug/AI request logs не попадают в SQLite.

Frontend:

- API helper tests for `project-ai-settings`;
- `AppShell` показывает кнопку только внутри project routes;
- modal loads provider/model/defaults and agent rows;
- changing project provider/model/defaults calls PATCH and invalidates project/runtime/workspace queries;
- changing per-agent source/value calls PATCH and refreshes effective values;
- unsupported Top P скрывается или disabled для текущей модели без layout break;
- routes no longer send provider/model/temp/top_p in project-scoped mutations;
- narrator keeps instructions save flow independent from model settings;
- start story confirm persists selected defaults into created project.

Manual frontend QA:

- запустить `scripts/dev.ps1`;
- открыть project workspace, narrator, draft, review, forecast;
- убедиться, что кнопка настроек есть на каждом project route;
- открыть модалку, поменять model/default temperature/default Top P, сохранить;
- проверить в Network, что последующие AI-запросы не несут локальные scattered параметры из экранов;
- проверить, что backend request использует сохраненные project/per-agent settings;
- проверить read-only state при disabled provider;
- проверить console/network на ошибки и layout на desktop viewport.

## Acceptance

- В проекте есть одна глобальная настройка provider/model/default temperature/default Top P.
- Настройка открывается из любого экрана проекта через общую кнопку в shell/header.
- Модалка выглядит как текущий блок "Модель ассистента", но без "Инструкции".
- У каждого ассистента есть per-agent effective temperature/top_p.
- Per-agent values могут наследоваться от проекта, брать кодовый пресет или быть пользовательскими.
- Project-scoped frontend actions больше не выбирают и не отправляют provider/model/temp/top_p локально.
- Backend сам резолвит LLM-настройки по `project_id + action_type`.
- Рассказчик сохраняет только свои инструкции на уровне сессии; модельные параметры рассказчика становятся project-agent settings.
- Start story до создания проекта сохраняет выбранные bootstrap настройки в новый проект.
- AI-unavailable режим остается read-only для творческих действий.
- Не добавлены manual creative fallback workflows.
- Не добавлено хранение debug logs, prompts or raw provider responses в SQLite.

## Риски и вопросы

- `AiActionRequest.temperature=0.7` сейчас скрывает отсутствие значения. Это нужно исправить первым, иначе resolver будет работать неполно.
- Миграция narrator session settings может быть неоднозначной, если у проекта много сессий с разными настройками. Практичный вариант: брать последнюю обновленную сессию и записывать это как initial custom для `narrator`.
- Если пользователь меняет project defaults, ассистенты с source `project` должны сразу получить новые effective values, а `custom` и `agent_default` не должны меняться.
- Start story остается исключением, потому что проекта еще нет. Это исключение нужно явно покрыть тестами, чтобы оно не вернуло scattered settings на остальные экраны.
- Reasoning settings лучше не тащить в эту миграцию без отдельного решения по продукту. Иначе модалка быстро превратится в техническую панель провайдера.
