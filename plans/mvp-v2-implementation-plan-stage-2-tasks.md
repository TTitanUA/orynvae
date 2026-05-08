# План реализации MVP v2 - stage 2 AI-провайдеры и action layer

Дата: 2026-05-08
Ветка: `v2`
Область: backend provider adapters, AI action service, structured output validation/repair, SSE streaming foundation, minimal frontend API contract if needed.
Источник: `plans/mvp-v2-implementation-plan.md`, раздел "Этап 2. AI-провайдеры и action layer".

## Цель этапа

Превратить существующую AI-интеграцию из набора provider endpoints и диагностического chat endpoint в типизированный слой AI-действий MVP v2. Этот слой должен быть пригоден для последующих этапов: анализа синопсиса, извлечения памяти, предложений линий, подготовки и ходов рассказчика, сборки черновика, редакторных помощников, разбора главы и прогноза.

Этап должен дать единый контракт: action type -> prompt/context -> provider request -> raw text -> optional structured JSON -> Pydantic validation -> optional AI repair -> normalized result/error -> optional SSE stream. Он не должен реализовывать полноценный Start Story flow, narrator mode, draft assembly, review/apply или markdown editor UI.

## Текущее состояние

- Репозиторий остается на ветке `v2`; пользователь выбрал продолжать в текущей ветке.
- Этап 1 уже создал v2 runtime schema и базовые storage primitives для проектов, памяти, линий, глав, сессий, ходов, key events, draft versions и forecasts.
- `backend/app/providers/adapters.py` уже содержит определения провайдеров для `lmstudio`, `ollama`, `openai`, `openrouter`, `custom_openai`, adapter interface и реализации `OpenAICompatibleAdapter`/`OllamaAdapter`.
- Provider adapters уже умеют `list_models`, non-stream chat и stream chat; OpenAI-compatible streaming читает `data: ...`, Ollama streaming читает JSON lines.
- `backend/app/api/providers.py` уже поддерживает настройку провайдеров, refresh/test, model preferences, default provider/model и прямой `POST /api/providers/{provider_id}/chat`.
- Прямой provider chat сейчас возвращает `text/plain` или raw text streaming. Это полезно для диагностики, но не является v2 action layer: нет action type, project context, output schema, structured validation, repair или нормализованных SSE events.
- `backend/app/services/runtime_status.py` уже содержит `get_runtime_status` и `require_creative_write`; guard проверяет enabled provider, отсутствие `last_error`, выбранную и allowed модель.
- `backend/app/core/debug_logging.py` уже пишет sanitized JSONL-логи только в файлы и подходит для LLM diagnostics, если не добавлять SQLite-логи.
- `backend/app/models/story_runtime.py` уже содержит Pydantic-модели runtime-сущностей, но AI output schemas для action results пока отсутствуют.
- Отдельного пакета или сервиса `ai_actions` пока нет: нет enum action types, request/result models, prompt builders, schema registry, JSON extraction, repair loop, normalized errors и SSE event formatter.
- Frontend уже имеет настройки провайдеров и runtime status, но не имеет доменного client для AI actions. На этом этапе frontend можно трогать только если нужен минимальный API contract/test helper; пользовательские экраны будущих сценариев остаются вне scope.

## Рабочие решения

- Делать Этап 2 backend-first. UI-сценарии Start Story и narrator mode появятся в Этапах 3 и 6; здесь нужен надежный сервисный слой, тесты и минимальные endpoints для проверки контракта.
- Не удалять текущий provider settings API. Он остается способом настроить AI и выйти из read-only режима.
- Рассматривать `POST /api/providers/{provider_id}/chat` как низкоуровневый диагностический endpoint. Доменные creative flows должны использовать новый action layer, а не дергать provider chat напрямую.
- Вынести action layer в отдельные модули, например `backend/app/ai/` или `backend/app/services/ai_actions.py` плюс `backend/app/models/ai_actions.py`. Выбор сделать по фактической локальной архитектуре: если файлов становится несколько, лучше пакет `app/ai`.
- Ввести единый `AiActionType` со значениями из `docs/technical-stack-v2.md`: `analyze_synopsis`, `extract_story_memory`, `suggest_story_lines`, `suggest_start_points`, `prepare_chapter_session`, `narrate_turn`, `summarize_session`, `extract_key_events`, `assemble_draft`, `edit_markdown_fragment`, `review_chapter`, `extract_memory_updates`, `update_story_lines`, `forecast_next`, `check_contradictions`.
- Для каждого action type завести output schema, даже если часть схем на этом этапе минимальная. Лучше иметь строгий маленький contract, чем произвольный `dict[str, object]`.
- Разделить text-only и structured actions. Structured actions обязаны проходить Pydantic validation; text-only actions могут возвращать `text` без `structured_json`.
- JSON repair делать ровно одним дополнительным AI-запросом через тот же provider/model. Если repair не прошел validation, action завершается ошибкой. Не добавлять ручное заполнение результата, heuristic fallback или silent partial success.
- Использовать provider-specific JSON mode только как optional hint в prompt/request later, но не как источник доверия. Backend всегда валидирует результат Pydantic-моделью.
- Не сохранять raw prompts/responses/request payloads в SQLite. При `DEBUG` логировать sanitized metadata/payload только через `debug_log`.
- Для provider errors добавить normalized service-level exceptions, чтобы UI и будущие endpoints не получали сырой stack trace или provider-specific body.
- SSE реализовать как общий formatter событий `start`, `delta`, `structured_delta`, `warning`, `error`, `done`; narrator-specific события (`narration_delta`, `suggested_action`, `memory_candidate`, `line_update_candidate`) можно заложить в enum/model, но не строить полноценный narrator endpoint.
- Read-only guard должен применяться ко всем новым creative action endpoints. Provider configuration/test/model refresh остаются разрешенными без AI.
- Project-specific actions должны уметь брать provider/model из project active settings или принимать явный `provider_id`/`model_id` там, где это нужно для Start Story до создания проекта.

## Задачи

- [x] Создать backend-модели AI action layer: `AiActionType`, `AiActionRequest`, `AiActionContext`, `AiActionResult`, `AiActionWarning`, `AiActionError`, privacy level, streaming flag, provider/model reference.
- [x] Описать минимальные Pydantic output schemas для всех action types из технического стека; для будущих сложных сценариев оставить узкий, но валидируемый контракт вместо свободного dict.
- [x] Выделить schemas для Start Story foundation: analysis result, memory candidates, story line candidates, start point candidates, questions.
- [x] Выделить schemas для narrator foundation: prepared session output, narrator turn output, suggested actions, key event candidates, memory proposal candidates, line update candidates.
- [x] Выделить schemas для draft/review/editor/forecast foundation: draft markdown output, review output, markdown edit suggestion, memory updates, story line updates, forecast options, contradictions.
- [x] Добавить action schema registry: по `AiActionType` возвращается output Pydantic model, JSON schema hint, default streaming capability и краткое назначение.
- [x] Добавить prompt builder/renderer для action layer с системными правилами Orynvae v2: AI-first, пользователь сохраняет авторство, markdown-only для художественного текста, no manual fallback, JSON-only для structured actions.
- [x] Добавить context builder interfaces: action получает только нужный контекст, а не весь проект. На этом этапе реализован thin contract через `AiActionContext` и prompt payload без полной бизнес-логики будущих этапов.
- [x] Реализовать provider resolver для action layer: явный provider/model из request или активный project provider/model; проверка allowed model и routing config; понятная ошибка при missing provider/model.
- [x] Подключить `require_creative_write` или эквивалентный project-aware guard ко всем creative action executions.
- [x] Нормализовать provider adapter interface на уровне action layer: `chat`/`stream_chat` возвращают единый action result/events или превращаются в normalized `AI_PROVIDER_ERROR`.
- [x] Добавить extraction structured JSON из ответа модели: чистый JSON, JSON fenced block, допустимое окружение текстом только если можно однозначно извлечь объект.
- [x] Добавить Pydantic validation для structured output с полезной ошибкой, где видно action type и validation path без раскрытия секретов.
- [x] Реализовать single AI repair request: передать исходный invalid output, validation error summary и target JSON schema; повторно проваленный repair возвращает structured action error.
- [x] Гарантировать, что repair не превращается в ручной workflow: backend не создает synthetic memory/story/draft data без успешного AI output.
- [x] Добавить generic action execution service для non-stream actions: собрать messages, вызвать adapter, валидировать output, вернуть `AiActionResult`.
- [x] Добавить generic streaming action execution для text streaming: нормализовать provider chunks в SSE события `start`, `delta`, `done`, `error`.
- [x] Добавить начальный контур для structured streaming: если provider stream используется для structured action, накопить текст, отправлять `delta`, а validated structured result отправлять только после полного validation как `structured_delta` или final payload.
- [x] Добавить SSE formatter helper с `text/event-stream`, JSON payload на каждое событие и безопасным завершением `done`.
- [x] Добавить backend API router `backend/app/api/ai_actions.py` с минимальными endpoints: `GET /api/ai-actions/definitions`, `POST /api/ai-actions/execute`, `POST /api/ai-actions/stream`.
- [x] Не делать frontend экран для action execution. Frontend touched только для debug classification, технический action runner не добавлялся.
- [x] Обновить frontend debug LLM classification для нового `/api/ai-actions/*` endpoint, чтобы debug logging относил эти запросы к `LLM` и продолжал исключать `/api/debug/logs/*`.
- [x] Добавить debug logging вокруг action lifecycle: `action.start`, `action.provider.request`, `action.provider.response`, `action.validation.error`, `action.repair.start`, `action.repair.end`, `action.error`, `action.done`; все payloads проходят existing sanitize.
- [x] Добавить backend-тесты provider resolver: default provider, project provider override, missing provider, disabled provider, disallowed model, provider last_error.
- [x] Добавить backend-тесты action type registry: все action types из technical stack имеют schema и не возвращают свободный unvalidated dict.
- [x] Добавить backend-тесты structured validation: valid JSON проходит, invalid JSON вызывает ровно один repair, failed repair возвращает ошибку.
- [x] Добавить backend-тест, что structured repair использует AI adapter и не создает manual fallback result.
- [x] Добавить backend-тесты SSE formatter: события имеют expected event names, JSON payload, `done` на успех и `error` на provider failure.
- [x] Проверить provider adapters на уровне необходимости: adapter parsers не менялись, существующие provider tests остались зелеными; action streaming покрыт новым SSE test.
- [x] Добавить тест, что raw prompts/responses/debug payloads не создают SQLite tables и не пишутся в SQLite.
- [x] Добавить тест, что API action endpoints возвращают normalized error envelope или FastAPI error shape без raw provider exception body.
- [x] Решить судьбу `POST /api/providers/{provider_id}/chat`: оставить как diagnostic endpoint с ясной областью применения. Product flows должны использовать `/api/ai-actions/*`.
- [x] Запустить backend checks: `uv run pytest`, `uv run ruff check .` из `backend` через `scripts/tool-env.ps1`.
- [x] Если frontend менялся: запустить `pnpm test`, `pnpm lint`, `pnpm build` из `frontend` через `scripts/tool-env.ps1`.
- [x] Если появились видимые frontend изменения, запустить `scripts/dev.ps1`, проверить релевантный UI в Chrome DevTools, console и network; видимых UI-изменений не было, но dev/browser smoke все равно выполнен для frontend debug behavior.

## Acceptance

- Provider layer продолжает поддерживать LMStudio, Ollama, OpenAI, OpenRouter и Custom OpenAI-compatible через единый action-compatible путь.
- Creative action execution невозможен без доступного active provider/model; read-only guard возвращает понятную ошибку и не блокирует provider settings/test/refresh.
- Все AI action types из технического стека представлены в enum/registry и имеют Pydantic output schema.
- Structured output всегда валидируется backend-ом; invalid output вызывает максимум один AI repair request.
- Если initial output и repair output невалидны, action завершается ошибкой, а не ручным fallback результатом.
- Text/markdown outputs для artistic prose остаются markdown strings; action layer не вводит HTML, rich text JSON или editor-specific canonical storage.
- Streaming/SSE foundation возвращает нормализованные события `start`, `delta`, `warning`, `error`, `done`, а для structured result есть понятный final validated payload.
- Debug logging AI/action lifecycle идет только в JSONL при включенном `DEBUG`, проходит sanitize и не создает SQLite tables/log rows.
- API action endpoints, если добавлены, имеют typed request/response models и normalized error handling.
- Тесты покрывают provider resolver, action schemas, structured validation/repair, SSE events и запрет SQLite debug/AI request logs.

## Критический анализ

- Этап 2 легко расползается в реализацию Start Story или narrator mode. Нужно остановиться на reusable action layer и минимальных contract tests; пользовательские flows должны появиться позже.
- Слишком подробные output schemas для будущих этапов могут оказаться неверными. Поэтому схемы должны быть достаточно строгими для validation, но не тащить premature workflow детали вроде полного review/apply state machine.
- Прямой provider chat endpoint уже существует и может соблазнить будущий код обойти action layer. В плане нужно явно отделить diagnostic provider chat от creative product actions.
- Runtime guard сейчас опирается на сохраненное состояние provider/model, а не live health check на каждый action. Это быстро и предсказуемо, но может пропустить провайдера, который упал после последнего test. Action layer обязан превращать реальную provider failure в normalized AI error и обновлять диагностику там, где это уместно.
- JSON extraction из ответов модели не должна становиться эвристическим исправлением содержания. Допустимо только извлечь явно присутствующий JSON object; смысловой ремонт должен идти AI repair request.
- Structured streaming трудно валидировать до конца ответа. Для MVP безопаснее стримить текстовые deltas как provisional UI material, а structured payload отдавать только после полного validation.
- Нельзя хранить raw prompt/response для удобства отладки в БД. При DEBUG можно писать sanitized JSONL, но нужно учитывать, что story text может быть чувствительным.
- OpenRouter routing config уже хранится per model. Action layer должен передавать его в adapter, иначе существующая настройка silently перестанет работать.

## Риски и проверки

- Риск несовпадения provider capabilities: проверить локальные OpenAI-compatible и Ollama paths mock-тестами, без необходимости реального LMStudio/Ollama на CI.
- Риск невалидного JSON от локальных моделей: проверить malformed JSON, fenced JSON, JSON с лишним текстом, validation error и failed repair.
- Риск двойного repair или hidden fallback: тестировать adapter call count и отсутствие synthetic successful result после failed repair.
- Риск утечки секретов и пользовательского текста: проверить sanitize в debug logs и отсутствие SQLite-таблиц/записей для prompt/response/request logs.
- Риск поломки read-only invariant: проверить action endpoints в состояниях no provider, disabled provider, missing/default disallowed model, last_error.
- Риск browser-visible scope creep: если frontend не получает видимых изменений, не запускать лишний UI flow; если получает новый client/UI state, выполнить обязательную Chrome DevTools проверку.

## Verification notes

- `backend`: `uv run pytest` - 36 passed.
- `backend`: `uv run ruff check .` - passed.
- `frontend`: `pnpm test` - 6 files / 14 tests passed.
- `frontend`: `pnpm lint` - passed with existing warning in `frontend/src/shared/testing/query-client.tsx` (`react-refresh/only-export-components`).
- `frontend`: `pnpm build` - passed.
- Dev launcher: `scripts/dev.ps1` started backend `http://127.0.0.1:9001` and frontend `http://127.0.0.1:9002`.
- Chrome DevTools: opened `/projects`, verified page renders, console has no errors, API network requests returned 200/204, and `/api/ai-actions/definitions` returned 15 action definitions.
- Dev processes were stopped after manual verification: port `9002` -> PID `37368` `node.exe` Vite; port `9001` -> PID `50712`/child PID `51504` project-local `python.exe` backend dev server. Ports `9001` and `9002` are free.
