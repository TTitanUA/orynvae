# План реализации MVP v2 - stage 1 Runtime, данные и системные ограничения

Дата: 2026-05-08
Ветка: `v2`
Область: backend runtime, SQLite schema, storage layer, API guards, debug logging, minimal frontend runtime contract.
Источник: `plans/mvp-v2-implementation-plan.md`, раздел "Этап 1. Runtime, данные и системные ограничения".

## Цель этапа

Подготовить устойчивую runtime-основу MVP v2: базовая SQLite-схема должна покрывать проекты, память, линии истории, главы, сессии, ходы, черновики и прогнозы; backend должен иметь единый guard для режима чтения без AI; debug logging должен оставаться строго файловым JSONL-контуром; markdown-поля должны быть закреплены как canonical storage для художественного текста.

Этап не должен запускать полноценный Start Story, narrator mode, draft assembly или редакторные AI-помощники. Он должен дать безопасные таблицы, модели, storage primitives и системные ограничения, на которые эти сценарии опираются в следующих этапах.

## Текущее состояние

- Репозиторий находится на ветке `v2`, рабочее дерево перед планированием чистое.
- Backend уже использует FastAPI, SQLite, SQL-миграции из `backend/migrations/`, Pydantic v2, pytest и provider adapter layer.
- Текущие миграции создают `model_providers`, `provider_models`, минимальную `projects`, `app_settings` и `schema_migrations`; `003_canon_workspace.sql` и `006_character_crud.sql` оставлены пустыми как удаленные из активного scope.
- Таблица `projects` сейчас содержит только legacy-поля `id`, `name`, timestamps, `archived_at` и `is_hidden`; она не покрывает v2-поля `title`, `synopsis`, `status`, `active_provider_id`, `active_model_id`, `expansion_policy` и должна быть полностью заменена, а не совместимо расширена.
- Таблиц для `memory_items`, `memory_relations`, `memory_proposals`, `story_lines`, `story_line_progress`, `chapters`, `chapter_sessions`, `session_turns`, `key_events`, `draft_versions`, `forecasts` и `forecast_options` пока нет.
- Debug logging уже пишет JSONL в `logs/app-<yyyy>-<mm>-<dd>.jsonl` через `app.core.debug_logging`, sanitizes секреты и не пишет в SQLite.
- Backend HTTP middleware сейчас логирует все HTTP-запросы при `DEBUG`, поэтому `/api/debug/logs` нужно явно исключить, чтобы выполнить v2-инвариант.
- Frontend debug interceptor уже пропускает точный `/api/debug/logs`, но должен пропускать и будущие `/api/debug/logs/*`.
- Frontend типы и API-клиент все еще содержат часть старой workspace/setup поверхности, которую backend сейчас не реализует и тестами ожидает как 404.

## Рабочие решения

- Добавить новую миграцию `backend/migrations/007_v2_runtime_schema.sql`, не переписывая уже примененные миграции.
- Существующие provider-таблицы не переименовывать на этом этапе. `model_providers` и `provider_models` остаются фактической storage-основой provider layer, а v2-термины `Provider` и `ProviderModel` остаются доменными именами в моделях/API.
- `projects` полностью снести и создать заново как v2-таблицу. Не сохранять совместимые aliases `name`/`is_hidden`, не делать backfill из старых проектов и не тащить старую visibility-модель в новый runtime.
- Потеря старых project rows в локальной БД на этом этапе считается допустимой destructive migration, потому что v1/v1.5 project-модель не совместима с v2 Start Story и story runtime.
- Все enum-like поля закреплять через `CHECK` constraints там, где значения стабильны из `docs/mvp-v2/12-data-model.md`.
- Списки id и structured payloads хранить как JSON `TEXT` с валидацией на уровне Pydantic/storage helpers: `controlled_character_ids`, `active_story_line_ids`, `related_memory_item_ids`, `related_story_line_ids`, `suggested_payload`, `likely_consequences`, `risks`.
- Художественный текст хранить только в markdown-полях: `chapters.draft_markdown`, `chapters.final_markdown`, `draft_versions.markdown`. Не добавлять HTML, rich text JSON или editor state columns.
- Read-only guard реализовать backend-first: единый сервис определения AI-доступности и FastAPI dependency/helper для творческих mutating endpoints.
- Добавить минимальный runtime/status API, например `GET /api/runtime/status`, чтобы frontend мог показать `read_only`, причину блокировки и активный provider/model без самостоятельной сборки правил.
- Provider settings и provider test/model refresh остаются разрешенными без AI, потому что они нужны для выхода из read-only режима.
- Не восстанавливать старые v1 workspace/setup endpoints ради совместимости; если frontend меняется в этом этапе, приводить его к v2 runtime/read-only контракту, а не возвращать удаленную v1-модель.

## Задачи

- [x] Добавить destructive-миграцию `backend/migrations/007_v2_runtime_schema.sql`: удалить текущую legacy-таблицу `projects` и создать новую `projects` с v2-полями `id`, `title`, `synopsis`, `status`, `active_provider_id`, `active_model_id`, `expansion_policy`, `created_at`, `updated_at`, `archived_at`.
- [x] В этой же миграции добавить таблицы `memory_items`, `memory_relations`, `memory_proposals`, `story_lines`, `story_line_progress`, `chapters`, `chapter_sessions`, `session_turns`, `key_events`, `draft_versions`, `forecasts`, `forecast_options`.
- [x] Убрать `name` и `is_hidden` из backend project models, project store, API responses и backend tests; project title в v2 должен называться только `title`.
- [x] Убрать зависимость project list от старого privacy-флага `show_hidden_items`; архивирование остается через `archived_at`, скрытие проекта не входит в v2 data model.
- [x] Добавить индексы для `projects.status`, `projects.archived_at`, `projects.active_provider_id`, `projects.active_model_id` и основных project-scoped списков: memory, story lines, chapters, sessions, turns, key events, draft versions, forecasts.
- [x] Проверить foreign key дизайн для `chapters.session_id` и `chapter_sessions.chapter_id`; избежать циклической обязательности, оставить nullable связь там, где глава может существовать до сессии.
- [x] Обновить `backend/tests/test_migrations.py`: свежая БД создает все v2-таблицы; debug/AI request log таблиц нет; markdown columns называются явно как markdown; старые removed tables не возвращаются.
- [x] Добавить backend Pydantic-модели для runtime-доменов в `backend/app/models/`: projects v2, memory, story lines, chapters/sessions/turns, drafts, forecasts.
- [x] Добавить storage/service модули в `backend/app/services/` для базового CRUD/read primitives без AI-логики генерации: project v2 fields, memory items/proposals, story lines/progress, chapters/sessions/turns, draft versions, forecasts.
- [x] Не выносить общий SQLite connection/helper слой: текущий объем не потребовал большого repository abstraction, чтобы не раздувать stage.
- [x] Реализовать сервис AI availability: active/default provider должен быть enabled, иметь выбранную allowed model, не иметь последней ошибки проверки и быть пригоден для creative mutations.
- [x] Реализовать единый read-only guard для creative mutating endpoints с единым error response `409` и кодом `READ_ONLY_WITHOUT_AI`.
- [x] Применить guard к текущим mutating project endpoints (`POST/PATCH/DELETE /api/projects`) до появления Start Story, потому что без AI проектные изменения в v2 запрещены.
- [x] Не применять guard к `GET` endpoints, provider settings, provider connection test, provider model refresh, debug status/batch и health/runtime status.
- [x] Добавить `GET /api/runtime/status`, возвращающий `read_only`, `ai_available`, `reason`, `active_provider`, `active_model`.
- [x] Исправить backend `debug_http_middleware`, чтобы `GET /api/debug/logs`, `POST /api/debug/logs` и любые `/api/debug/logs/*` не попадали в JSONL.
- [x] Исправить frontend `isDebugLogEndpoint`, чтобы он исключал не только точный `/api/debug/logs`, но и future prefix `/api/debug/logs/*`.
- [x] Добавить backend-тесты read-only guard: без provider, без default model, disabled provider, last_error, disallowed model; provider settings остаются доступны.
- [x] Добавить backend-тесты debug logging: запросы к `/api/debug/logs` не появляются в JSONL, frontend batch не вызывает рекурсивное логирование, SQLite не содержит debug tables.
- [x] Перевести frontend `Project` type и project API/tests на новую v2-форму `title`, `synopsis`, `status`, `active_provider_id`, `active_model_id`, `expansion_policy`, без `name`/`is_hidden`.
- [x] Добавить frontend entity/runtime types и API client для runtime status.
- [x] Обновить frontend helper-level тесты для read-only состояния и debug endpoint exclusion.
- [x] Если меняются видимые frontend controls, показать read-only состояние в существующих проектных действиях без создания полноценного Start Story UI.
- [x] Обновить документацию только если фактические dev commands, storage layout или API status endpoint отличаются от текущих docs. Отдельных doc-правок не потребовалось.
- [x] Запустить backend checks: `uv run pytest`, `uv run ruff check .` из `backend` через `scripts/tool-env.ps1`.
- [x] Запустить frontend checks при frontend-изменениях: `pnpm test`, `pnpm lint`, `pnpm build` из `frontend` через `scripts/tool-env.ps1`.
- [x] При видимых frontend-изменениях запустить `scripts/dev.ps1`, открыть приложение в Chrome DevTools, проверить project list/read-only state, console и network; после проверки остановить dev server.

## Acceptance

- На пустой БД миграции создают все runtime-таблицы MVP v2, перечисленные в data model, и не создают debug/AI request log таблиц.
- После миграции таблица `projects` имеет только v2-схему; legacy columns `name` и `is_hidden` отсутствуют, старые project rows не сохраняются.
- Markdown-поля художественного текста названы и используются как markdown; в схеме нет canonical HTML/rich-text/editor-state storage.
- Storage layer может сохранять и читать project-scoped память, линии, главы, сессии, ходы, ключевые события, draft versions и forecasts без запуска AI workflows.
- Backend имеет один переиспользуемый механизм проверки read-only режима без AI; творческие mutating endpoints используют его, а чтение и настройка провайдеров остаются доступны.
- Runtime/status API дает frontend достаточную информацию, чтобы не дублировать правила AI availability.
- Debug JSONL logging работает только через файлы, sanitizes payload, не пишет в SQLite и не логирует `/api/debug/logs` или `/api/debug/logs/*`.
- Автотесты покрывают миграции, debug logging, read-only guard и основные storage contracts.
- Если затронут видимый frontend, ручная проверка через Chrome DevTools выполнена после автоматических проверок.

## Критический анализ

- Понятие "AI доступен" нельзя сделать идеально точным без live network check на каждый mutating endpoint. Для Этапа 1 нужно выбрать быстрый deterministic guard по сохраненному состоянию provider/model и последней проверке; live recovery остается за provider test endpoint.
- Текущий `POST /api/projects` является ручным созданием проекта и конфликтует с v2 Start Story. На Этапе 1 его лучше временно закрыть guard-ом без AI и не расширять в полноценный творческий workflow до Этапа 3.
- Разрушение legacy `projects` упростит v2, но сломает все места frontend/backend, где ожидаются `name` и `is_hidden`; эти места надо менять в этом же этапе, а не оставлять compatibility shim.
- JSON `TEXT` для списков id проще и достаточно для MVP, но требует строгой Pydantic-валидации. Нельзя рассчитывать, что SQLite сам защитит форму payload.
- Слишком жесткие `CHECK` constraints могут мешать новым статусам. Значения нужно брать только из текущих v2 docs и не добавлять speculative states.
- Связь chapters/sessions потенциально циклическая: глава может планироваться до сессии, сессия создается из главы, а глава позже ссылается на активную/завершенную сессию. Миграция должна разрешать этот жизненный цикл nullable FK.
- Frontend содержит старые типы workspace/setup. На этом этапе важно не оживить старую v1 модель: `Project` заменить на v2-форму сразу, а старые workspace/setup типы не расширять и не использовать как compatibility layer.
- Debug middleware уже полезен, но без prefix exclusion он нарушает инвариант и может создавать шумную рекурсию при frontend batch logging.

## Риски и проверки

- Риск миграции существующей локальной БД: проверить fresh DB и DB с уже примененными `001`-`006`; подтвердить, что legacy `projects` удаляется, новая v2-таблица создается, provider/settings data сохраняются.
- Риск нарушения read-only режима: проверить как минимум no provider, disabled provider, missing model, disallowed model и provider `last_error`.
- Риск случайного хранения debug/LLM payload в SQLite: проверить список таблиц и отсутствие любых `debug`, `log`, `prompt`, `response`, `ai_request` таблиц.
- Риск frontend/backend drift: runtime status contract должен иметь shared-ish tests на API client и backend response shape.
- Риск слишком широкого scope: не реализовывать AI action layer, structured output repair, Start Story analysis, narrator streaming, draft assembly и markdown editor в Этапе 1.

## Verification notes

- `backend`: `uv run pytest` - 23 passed.
- `backend`: `uv run ruff check .` - passed.
- `frontend`: `pnpm test` - 6 files / 14 tests passed.
- `frontend`: `pnpm lint` - passed with existing warning in `frontend/src/shared/testing/query-client.tsx` (`react-refresh/only-export-components`).
- `frontend`: `pnpm build` - passed.
- Dev launcher: `scripts/dev.ps1` started backend `http://127.0.0.1:9001` and frontend `http://127.0.0.1:9002`.
- Chrome DevTools: opened `/projects`, checked 1366px and wider viewport, verified `/api/projects` and `/api/runtime/status` returned 200, console had no errors.
- Dev processes were stopped after manual verification; ports `9001` and `9002` had no remaining listeners.
