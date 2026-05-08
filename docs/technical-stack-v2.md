# Orynvae: технический стек v2

Этот документ фиксирует актуальный технический стек Orynvae v2. Он заменяет стек из старой технической спецификации на уровне продуктовой архитектуры, но не удаляет низкоуровневые детали, которые еще могут быть полезны при миграции.

Основные источники:

- [Концепт v2](concept-v2.md)
- [MVP v2](mvp-v2.md)
- [Модель данных MVP v2](mvp-v2/12-data-model.md)
- [API MVP v2](mvp-v2/13-api-scope.md)

## 1. Архитектурная позиция

Orynvae v2 остается локальным web-приложением:

- backend запускается локально;
- frontend запускается локально;
- runtime-данные хранятся в `data/`;
- приложение не требует собственного облачного backend;
- AI-провайдер выбирает пользователь;
- внешние AI-провайдеры явно помечаются;
- без доступного AI приложение работает только в режиме чтения.

Главный продуктовый сценарий v2 строится вокруг интерактивной AI-сессии:

```text
синопсис -> память истории -> линии истории -> режим рассказчика -> лог -> markdown-черновик -> разбор -> прогноз
```

Markdown - единственный формат художественного текста в приложении. Главы, сцены, черновики, версии черновиков и экспортируемый текст хранятся и редактируются как markdown. HTML, rich text JSON, proprietary editor state и plain text без markdown-семантики не являются форматами хранения текста в Orynvae.

## 2. Базовая структура приложения

```text
orynvae/
  backend/
    app/
      api/
      cli/
      core/
      models/
      providers/
      services/
      storage/
    migrations/
    tests/
    pyproject.toml
  frontend/
    src/
      app/
      pages/
      widgets/
      features/
      entities/
      shared/
    package.json
  data/
    app.db
    projects/
    backups/
  docs/
  scripts/
```

Frontend уже идет в сторону feature-sliced структуры (`app`, `pages`, `widgets`, `features`, `entities`, `shared`). Для v2 эту структуру стоит продолжать, а не возвращаться к старому `components/atoms/molecules`.

## 3. Backend stack

### Основной стек

- Python 3.11+
- FastAPI
- Uvicorn
- Pydantic v2
- SQLite
- `httpx`
- `python-multipart`
- `uv`
- pytest
- ruff

### Почему остается FastAPI

FastAPI хорошо подходит для v2, потому что приложению нужны:

- локальный HTTP API;
- typed request/response models;
- streaming/SSE endpoints;
- простой слой provider adapters;
- быстрые тесты сервисов;
- понятная интеграция с Pydantic для structured AI output.

### Миграции

Оставляем текущий подход с SQL-миграциями в `backend/migrations/` и локальным runner в backend storage layer.

Требования:

- миграции идемпотентны на уровне версии БД;
- foreign keys включены;
- все основные сущности имеют `created_at` и `updated_at`;
- опасные удаления заменяются архивированием или статусами там, где пользователь может потерять работу.

## 4. Frontend stack

### Основной стек

- Vite
- React 18
- TypeScript
- React Router
- TanStack Query
- Zustand
- Radix UI primitives
- lucide-react
- react-markdown
- CodeMirror 6 для markdown-редактора
- Vitest
- Testing Library
- ESLint
- Prettier
- pnpm

### UI-стиль

- без Tailwind на MVP v2;
- без shadcn на MVP v2;
- CSS через обычные `.css` файлы и дизайн-токены;
- плотный рабочий интерфейс;
- без landing page логики;
- основной экран должен быть рабочим пространством, а не маркетинговой страницей.

## 5. Markdown editor

### Решение

Для MVP v2 выбираем не готовый простой markdown textarea и не полностью собственный редактор с нуля, а собственный слой:

```text
OrynvaeMarkdownEditor
  -> CodeMirror 6
  -> Orynvae editor extensions
  -> agent integration layer
```

Markdown остается единственным canonical format для текста глав, сцен и черновиков.

### Markdown-only rule

В Orynvae v2 действует жесткое правило:

- текст глав хранится только как markdown;
- текст сцен хранится только как markdown, если сцена сохраняется как художественный текст;
- draft versions хранят markdown;
- editor operations применяются к markdown;
- preview рендерится из markdown;
- экспорт строится из markdown;
- AI получает и возвращает markdown для художественного текста;
- HTML может существовать только как временный render output;
- editor-specific state может существовать только как transient UI state и не сохраняется как источник правды.

Исключение: лог сессии не является художественным текстом и хранится как структурированные turns/events. Когда лог превращается в сцену или главу, результатом становится markdown.

### Почему CodeMirror 6

CodeMirror 6 подходит лучше, чем простой `@uiw/react-md-editor`, потому что v2 нужен не только редактор текста, а поверхность для агентной работы:

- streaming-вставки;
- inline suggestions;
- подсветка AI-предложений;
- accept/reject для фрагментов;
- agent action menu на выделении;
- diff preview;
- annotations для транзакций;
- read-only lock при недоступном AI;
- связь фрагментов с логом сессии, фактами и линиями истории.

CodeMirror 6 построен как набор модулей и extensions, а изменения документа проходят через transactions. Это хорошо ложится на агентные операции: каждую AI-вставку, переписывание или accept/reject можно оформить как контролируемую транзакцию с metadata.

Официальные ориентиры:

- [CodeMirror docs](https://codemirror.net/docs/)
- [CodeMirror system guide](https://codemirror.net/docs/guide/)

### Пакеты редактора

Базовый набор:

- `codemirror`
- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/commands`
- `@codemirror/lang-markdown`
- `@codemirror/language-data`

Для preview и markdown processing:

- `react-markdown`
- `remark-gfm`
- опционально `unified`, `remark-parse`, `remark-stringify` для AST-операций, если они понадобятся редактору или экспорту.

### Что не выбираем как core MVP

#### `@uiw/react-md-editor`

Подходит для быстрого markdown-поля, но слишком ограничен как основа для глубокого агентного редактора.

Можно использовать только как временный прототип, но не как целевой core.

#### MDXEditor

Сильный вариант для WYSIWYG markdown: React-компонент, принимает и отдает markdown строку, построен на Lexical и MDAST, расширяется через plugins.

Официальные ориентиры:

- [MDXEditor overview](https://mdxeditor.dev/editor/docs/overview)
- [MDXEditor API](https://mdxeditor.dev/editor/api)

Не выбираем как core MVP, потому что для Orynvae важнее полный контроль над source text, streaming-транзакциями и агентными overlays. MDXEditor можно пересмотреть позже для WYSIWYG/prose mode.

#### Milkdown

Сильный WYSIWYG Markdown framework: plugin-driven, headless, основан на ProseMirror, Y.js и Remark.

Официальный ориентир:

- [Milkdown](https://milkdown.dev/core)

Не выбираем как core MVP, потому что он добавит больше сложности вокруг ProseMirror-модели. Можно рассмотреть позже, если понадобится полноценный WYSIWYG markdown mode.

### Не пишем редактор полностью с нуля

Полностью свой редактор текста не нужен для MVP v2. Это слишком большой риск:

- выделения;
- IME;
- undo/redo;
- accessibility;
- большие документы;
- mobile keyboard edge cases;
- composition events;
- copy/paste;
- scroll/viewport performance.

Пишем свой продуктовый editor layer поверх CodeMirror 6, а не свой text engine.

## 6. Agent editor integration

`OrynvaeMarkdownEditor` должен быть спроектирован как агентно-управляемый редактор.

### Editor gateway

Frontend должен иметь typed interface между UI/agent actions и редактором:

```ts
interface OrynvaeEditorGateway {
  getMarkdown(): string
  getSelection(): EditorSelectionSnapshot
  replaceRange(input: ReplaceRangeInput): void
  insertAtCursor(input: InsertTextInput): void
  applyAgentSuggestion(input: AgentSuggestionInput): void
  showInlineSuggestion(input: InlineSuggestionInput): void
  clearInlineSuggestion(id: string): void
  decorateRange(input: RangeDecorationInput): void
  setReadOnly(input: ReadOnlyInput): void
}
```

Это позволит агенту работать с текстом через ограниченный слой, а не напрямую дергать DOM или внутренности компонента.

### Agent metadata

Каждая агентная операция над текстом должна сохранять metadata:

- `projectId`;
- `chapterId`;
- `sessionId`;
- `draftVersionId`;
- `agentActionType`;
- `sourceTurnIds`;
- `relatedMemoryItemIds`;
- `relatedStoryLineIds`;
- `createdAt`.

### Agent actions в редакторе

Минимальный набор:

- продолжить фрагмент;
- переписать выделение;
- сделать проще;
- сделать выразительнее;
- усилить диалог;
- добавить атмосферу;
- сократить;
- проверить связность;
- извлечь факты;
- предложить обновления памяти;
- предложить обновления линий.

### Inline suggestions

Inline suggestion не должна сразу менять markdown.

Поток:

1. AI предлагает изменение.
2. Редактор показывает ghost text или highlighted replacement.
3. Пользователь принимает, изменяет или отклоняет.
4. Только после принятия создается transaction изменения markdown.

### Streaming insert

Streaming генерация не должна ломать undo history и канон.

Рекомендуемая модель MVP:

1. AI stream копится в provisional buffer.
2. UI показывает его как временную вставку или отдельную preview panel.
3. После завершения пользователь принимает вставку.
4. Редактор применяет один transaction с metadata.

Для режима рассказчика потоковые ответы отображаются в session UI, а не напрямую в markdown главе. Markdown обновляется на этапе сборки черновика.

### Read-only lock

Если AI недоступен:

- редактор открывает markdown только для чтения;
- selection и copy остаются доступны;
- любые commands изменения заблокированы;
- UI показывает причину блокировки;
- кнопки agent actions ведут к настройкам AI.

## 7. Markdown storage

Текст главы хранится только как markdown string.

Минимально:

- `chapters.draft_markdown`;
- `draft_versions.markdown`;
- связь draft version с session/log;
- timestamps;
- status.

Для больших глав позже можно перейти к file-backed storage в `data/projects/{projectId}/chapters/*.md`, но MVP может хранить markdown в SQLite.

## 8. AI provider layer

Сохраняем provider adapter слой из v1, но обновляем action model под v2.

### Провайдеры MVP v2

- LMStudio;
- Ollama;
- OpenAI;
- OpenRouter;
- Custom OpenAI-compatible.

### Общий adapter interface

```text
ProviderAdapter
  check_connection(config)
  list_models(config)
  chat(config, request)
  stream_chat(config, request)
```

### Общие требования

- нормализованные ошибки;
- флаг `is_local`;
- флаг `is_external`;
- флаг `supports_streaming`;
- флаг `supports_model_listing`;
- единый формат сообщений;
- единый формат streaming events;
- запрет на творческие mutating actions, если active provider недоступен.

## 9. AI action layer

AI-действия v2 должны быть типизированными.

Минимальный набор action types:

- `analyze_synopsis`;
- `extract_story_memory`;
- `suggest_story_lines`;
- `suggest_start_points`;
- `prepare_chapter_session`;
- `narrate_turn`;
- `summarize_session`;
- `extract_key_events`;
- `assemble_draft`;
- `edit_markdown_fragment`;
- `review_chapter`;
- `extract_memory_updates`;
- `update_story_lines`;
- `forecast_next`;
- `check_contradictions`.

Каждое действие получает:

- `project_id`;
- `provider_id`;
- `model_id`;
- `input`;
- `context`;
- `output_schema`;
- `streaming`;
- `privacy_level`.

Каждое действие возвращает:

- `text`;
- `structured_json`, если применимо;
- `suggestions`;
- `memory_candidates`;
- `story_line_updates`;
- `warnings`;

Raw request/response data не сохраняется в БД. Если включен debug, технические детали запросов пишутся только в файловые JSONL-логи.

## 10. Structured output

Для v2 structured output критичен, потому что AI должен обновлять память, линии, прогнозы и редакторные предложения.

Требования:

- Pydantic models на backend;
- JSON schema для каждого action type;
- validation на backend;
- один repair-запрос при невалидном JSON;
- если repair не помог, действие считается ошибочным;
- fallback в ручной workflow запрещен.

Важно: нельзя полагаться только на provider-specific JSON mode, потому что локальные и OpenAI-compatible модели ведут себя по-разному. Prompt должен явно требовать JSON, а backend обязан валидировать результат.

## 11. Streaming

Streaming нужен для:

- режима рассказчика;
- долгой сборки черновика;
- редакторных AI-действий;
- прогноза, если модель отвечает долго.

Backend может использовать FastAPI `StreamingResponse` для SSE.

Нормализованные события:

- `start`;
- `delta`;
- `structured_delta`, если применимо;
- `warning`;
- `error`;
- `done`.

Для режима рассказчика дополнительно:

- `narration_delta`;
- `suggested_action`;
- `memory_candidate`;
- `line_update_candidate`.

## 12. Data stack

Основное хранилище:

- SQLite в `data/app.db`.

Основные группы таблиц:

- providers;
- provider models;
- projects;
- memory items;
- memory relations;
- memory proposals;
- story lines;
- story line progress;
- chapters;
- chapter sessions;
- session turns;
- key events;
- draft versions;
- forecasts;

Debug-логи не входят в data stack и не имеют таблиц в SQLite.

## 13. Debug logging

Debug logging нужен для разработки и диагностики AI/provider/frontend проблем.

### Включение

Debug включается только через переменную окружения `DEBUG`.

Истинные значения:

- `1`;
- `true`;
- `yes`;
- `on`.

Если debug выключен, файлы логов не создаются и frontend debug batch игнорируется.

### Хранилище

Все debug-логи пишутся только в JSONL-файлы:

```text
logs/app-<yyyy>-<mm>-<dd>.jsonl
```

Пример:

```text
logs/app-2026-05-08.jsonl
```

Папка может быть переопределена через `ORYNVAE_LOG_DIR`.

В базе данных debug-логов быть не должно:

- не создавать таблицы debug logs;
- не создавать таблицы AI request logs;
- не хранить prompt/response/debug payload в SQLite;
- не использовать БД как fallback для логов.

### Формат строки JSONL

Каждая строка - один JSON object:

```json
{
  "timestamp": "2026-05-08 15:30:45.123 +0300",
  "module": "backend",
  "category": "LLM",
  "operation": "chat.request",
  "payload": {}
}
```

Поля:

- `timestamp`: локальное время с миллисекундами и timezone offset, формат `YYYY-MM-DD HH:mm:ss.SSS +ZZZZ`;
- `module`: `backend` или `frontend`;
- `category`: `system`, `http` или `LLM`;
- `operation`: короткое имя операции, например `fetch.http.start`, `chat.request`, `chat.response`;
- `payload`: произвольный JSON object после sanitize.

### Sanitizing

Перед записью payload должен проходить sanitize:

- секретные ключи редактируются в `[redacted]`;
- секретными считаются ключи, содержащие `authorization`, `api_key`, `apikey`, `password`, `secret`, `token`, `cookie`;
- слишком длинные строки обрезаются;
- глубина вложенности ограничивается;
- нестандартные объекты сериализуются безопасно.

### Что логировать при debug

Когда debug включен, логируем:

- backend system events;
- frontend system events;
- frontend HTTP start/end/error;
- backend provider requests/responses;
- LLM request/response metadata;
- LLM payloads после sanitize;
- streaming lifecycle events и ошибки.

Формулировка "логируем все" означает все диагностически значимые backend/frontend/provider/LLM события, но только после sanitize и только в JSONL-файлы.

### Что не логировать

Нельзя логировать запросы к самим debug-log endpoints:

- `GET /api/debug/logs`;
- `POST /api/debug/logs`;
- любые будущие `/api/debug/logs/*`.

Это правило обязательно и для frontend fetch interceptor, и для backend request logging, если он появится. Иначе приложение начнет логировать отправку логов, создавая рекурсию и шум.

### API

Debug API:

- `GET /api/debug/logs` возвращает `{ "enabled": boolean }`;
- `POST /api/debug/logs` принимает batch frontend entries и пишет их в JSONL только если debug включен.

Эти endpoints не должны сами попадать в debug logs.

Подробная модель фиксируется в [MVP v2 data model](mvp-v2/12-data-model.md).

## 14. Read-only mode without AI

Это обязательное системное поведение.

Если active AI provider:

- не настроен;
- недоступен;
- не имеет выбранной модели;
- возвращает ошибку проверки;

то приложение переходит в режим чтения.

Разрешено:

- открыть проект;
- читать синопсис;
- читать память;
- читать линии;
- читать главы;
- читать логи;
- читать черновики;
- читать прогнозы;
- открыть настройки AI.

Запрещено:

- создавать проект;
- редактировать проект;
- запускать режим рассказчика;
- продолжать сессию;
- завершать сессию;
- собирать черновик;
- редактировать markdown;
- подтверждать канон;
- обновлять линии;
- генерировать прогноз;
- имитировать AI ручными fallback-механиками.

## 15. API stack

Ориентир API фиксируется в [API MVP v2](mvp-v2/13-api-scope.md).

Технические требования:

- REST для CRUD и state transitions;
- SSE для streaming AI actions;
- typed request/response schemas;
- provider availability guard для mutating творческих endpoint;
- единый error envelope;
- no raw provider errors в UI;
- API key не логировать.

## 16. Frontend state

### TanStack Query

Использовать для:

- server state;
- projects;
- providers;
- memory;
- story lines;
- chapters;
- sessions;
- forecasts;
- optimistic refresh там, где это безопасно.

### Zustand

Использовать для:

- локального UI state;
- layout panels;
- текущего editor mode;
- transient narrator input;
- unsaved UI choices до отправки.

Не хранить canonical project data только в Zustand.

## 17. Testing stack

### Backend

- pytest;
- provider adapters с mock HTTP;
- migration tests;
- read-only guard tests;
- debug JSONL logging tests;
- tests proving debug logs are not stored in SQLite;
- tests proving `/api/debug/logs` requests are not logged;
- AI action schema validation tests;
- session lifecycle tests;
- draft assembly service tests.

### Frontend

- Vitest;
- Testing Library;
- API client tests;
- route/component smoke tests;
- editor gateway unit tests;
- read-only mode tests;
- frontend debug interceptor tests for excluding `/api/debug/logs`;
- AI error state tests.

### Manual browser verification

Для видимых frontend-изменений обязательно:

- запустить dev environment через project launcher;
- открыть приложение в Chrome;
- пройти релевантный пользовательский flow;
- проверить layout;
- проверить console;
- проверить network;
- проверить streaming UI, если менялся режим рассказчика или редактор.

## 18. Dev commands

Windows baseline:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
. .\scripts\tool-env.ps1
.\scripts\dev.ps1
```

Windows fallback launcher:

```powershell
.\scripts\dev.cmd
```

Backend:

```powershell
cd backend
uv sync --extra dev
uv run db-init
uv run dev
```

Frontend:

```powershell
cd frontend
pnpm install
pnpm dev
```

Ports:

- backend: `http://localhost:9001`;
- frontend: `http://localhost:9002`;
- frontend proxy: `/api -> http://localhost:9001`.

## 19. Post-MVP candidates

Не включать в MVP v2 без отдельного решения:

- sqlite-vec;
- local embeddings;
- semantic search по памяти и главам;
- OS keychain для API keys;
- Y.js collaboration;
- MDXEditor или Milkdown WYSIWYG/prose mode;
- экспорт `.docx`, `.pdf`, `.md`;
- visual graph;
- map view;
- cloud sync.
