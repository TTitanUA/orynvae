# Orynvae: техническая спецификация

## 1. Архитектурная цель

Orynvae - локальное web-приложение для работы автора с AI-моделями. Оно должно запускаться на машине пользователя, хранить данные локально и подключаться к одному из поддерживаемых AI-провайдеров.

Архитектура ориентируется на подход проекта `F:\projects\sd-chisel`:

- отдельный `backend/`;
- отдельный `frontend/`;
- локальная папка `data/`;
- миграции SQLite;
- dev-скрипт для одновременного запуска backend и frontend;
- backend слушает порт `9001`;
- frontend слушает порт `9002`;
- frontend проксирует `/api` на backend;
- REST API для CRUD;
- SSE или streaming API для длинных AI-ответов.

## 2. Стек

### Backend

- Python 3.11+
- FastAPI
- uvicorn
- Pydantic v2
- SQLite
- `httpx` для прямых вызовов AI-провайдеров
- `python-multipart` при появлении импорта файлов
- `pytest` для тестов
- `ruff` для lint
- `uv` для окружения и команд

Backend dev server должен запускаться на `http://localhost:9001`.

Опционально после MVP:

- `sqlite-vec` для локального семантического поиска по канону, главам и лору;
- `sentence-transformers` для локальных embeddings;
- background task registry для долгих операций индексации.

### Frontend

- Vite
- React 18
- TypeScript
- React Router
- TanStack Query
- Zustand
- Radix UI primitives
- lucide-react
- react-markdown
- `@uiw/react-md-editor` или собственный markdown/editor layer
- Vitest
- ESLint
- Prettier
- pnpm

Frontend dev server должен запускаться на `http://localhost:9002`.
Vite proxy должен направлять запросы `/api` на `http://localhost:9001`.

UI-стиль:

- без Tailwind на старте;
- без shadcn;
- компоненты организуются по паттерну atomic design;
- CSS Modules или обычные CSS-файлы с дизайн-токенами;
- плотный рабочий интерфейс, похожий на authoring workspace, а не landing page.

## 3. Структура репозитория

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
    ruff.toml
  frontend/
    src/
      api/
      components/
        atoms/
        molecules/
        organisms/
        templates/
      routes/
      store/
      styles/
      types/
    package.json
    vite.config.ts
    tsconfig.json
  data/
    app.db
    projects/
  docs/
  scripts/
    dev.mjs
    dev.ps1
    dev.sh
  README.md
```

## 4. Локальное хранение данных

Все runtime-данные хранятся в `data/` в корне проекта.

Минимально:

- `data/app.db` - SQLite база;
- `data/projects/` - будущие вложения, экспорты, изображения, референсы;
- `data/backups/` - будущие локальные резервные копии.

`data/` должна быть добавлена в `.gitignore`.

База должна включать:

- миграции;
- foreign keys;
- `created_at` и `updated_at` для основных сущностей;
- мягкое удаление или архивирование там, где пользователь может случайно потерять работу.

## 5. AI provider layer

В backend нужен единый слой провайдеров, чтобы UI и продуктовые сервисы не знали деталей LMStudio, Ollama, OpenAI, OpenRouter или custom endpoint.

### 5.1. Общий интерфейс

Каждый provider adapter должен поддерживать:

- проверку подключения;
- получение списка моделей, если provider это умеет;
- обычный chat completion;
- streaming chat completion;
- базовую нормализацию ошибок;
- единый формат сообщений;
- единый формат ответа;
- флаг `is_local`;
- флаг `supports_streaming`;
- флаг `supports_model_listing`.

Базовая структура:

```text
ProviderAdapter
  check_connection(config)
  list_models(config)
  chat(config, request)
  stream_chat(config, request)
```

### 5.2. LMStudio

Тип: локальный provider.

Настройки:

- `base_url`, например `http://localhost:1234`;
- `api_key`, опционально;
- `model_id`;
- `streaming_enabled`.

Ожидаемые endpoint:

- `GET {base_url}/v1/models`;
- `POST {base_url}/v1/chat/completions`.

Дополнительно можно добавить LMStudio-native возможности после MVP:

- список загруженных моделей;
- unload all;
- capability detection.

### 5.3. Ollama

Тип: локальный provider.

Настройки:

- `base_url`, например `http://localhost:11434`;
- `model_id`;
- `streaming_enabled`.

Ожидаемые endpoint:

- `GET {base_url}/api/tags` для списка моделей;
- `POST {base_url}/api/chat` для чата;
- streaming через NDJSON.

Если пользователь включает OpenAI-compatible режим Ollama, можно использовать:

- `GET {base_url}/v1/models`;
- `POST {base_url}/v1/chat/completions`.

### 5.4. OpenRouter

Тип: внешний provider.

Настройки:

- `base_url`, по умолчанию `https://openrouter.ai/api/v1`;
- `api_key`, обязателен;
- `model_id`;
- `streaming_enabled`.

Ожидаемые endpoint:

- `GET {base_url}/models`;
- `POST {base_url}/chat/completions`.

UI должен явно показывать, что OpenRouter отправляет данные внешнему провайдеру.

### 5.5. OpenAI

Тип: внешний provider.

Настройки:

- `base_url`, по умолчанию `https://api.openai.com/v1`;
- `api_key`, обязателен;
- `model_id`;
- `streaming_enabled`.

Ожидаемые endpoint:

- `GET {base_url}/models`;
- `POST {base_url}/chat/completions`.

OpenAI должен быть отдельным provider type, даже если технически использует тот же OpenAI-compatible client, что и custom endpoint. Это нужно для понятных defaults, отдельной маркировки внешнего провайдера и будущих OpenAI-specific возможностей.

UI должен явно показывать, что OpenAI отправляет данные во внешний сервис.

### 5.6. Custom OpenAI-compatible

Тип: зависит от настройки пользователя.

Настройки:

- `name`;
- `base_url`;
- `api_key`, опционально;
- `model_id`;
- `models_path`, по умолчанию `/v1/models`;
- `chat_path`, по умолчанию `/v1/chat/completions`;
- `streaming_enabled`;
- `is_local`.

Этот provider нужен для llama.cpp server, vLLM, LocalAI, proxy-серверов и других совместимых endpoint.

## 6. Backend API

Базовая группа API:

- `GET /api/health`
- `GET /api/providers`
- `POST /api/providers`
- `GET /api/providers/{provider_id}`
- `PATCH /api/providers/{provider_id}`
- `DELETE /api/providers/{provider_id}`
- `POST /api/providers/{provider_id}/check`
- `POST /api/providers/{provider_id}/models/refresh`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PATCH /api/projects/{project_id}`
- `DELETE /api/projects/{project_id}`
- `POST /api/projects/setup`
- `GET /api/projects/{project_id}/ideas`
- `GET /api/projects/{project_id}/world`
- `GET /api/projects/{project_id}/characters`
- `GET /api/projects/{project_id}/plot`
- `GET /api/projects/{project_id}/chapters`
- `GET /api/projects/{project_id}/canon`
- `POST /api/ai/actions`
- `POST /api/ai/actions/stream`

Для streaming:

- использовать SSE для ответа модели в UI;
- события нормализовать: `start`, `delta`, `tool_call` после MVP, `error`, `done`;
- сохранять итоговый assistant message в `ai_messages`.

## 7. Модель данных

Минимальные таблицы:

- `users`
- `projects`
- `project_settings`
- `model_providers`
- `provider_models`
- `ideas`
- `world_entries`
- `characters`
- `character_relationships`
- `factions`
- `locations`
- `plot_arcs`
- `chapters`
- `scenes`
- `canon_facts`
- `ai_messages`
- `generated_suggestions`

### 7.1. model_providers

Поля:

- `id`
- `type`: `lmstudio`, `ollama`, `openai`, `openrouter`, `custom_openai`
- `name`
- `base_url`
- `api_key_encrypted` или `api_key`
- `is_local`
- `streaming_enabled`
- `models_path`
- `chat_path`
- `default_model_id`
- `last_checked_at`
- `last_error`
- `created_at`
- `updated_at`

На MVP можно хранить API key в SQLite как обычное поле, но в техдолг сразу записать переход на защищенное хранение.

### 7.2. provider_models

Поля:

- `id`
- `provider_id`
- `model_id`
- `display_name`
- `supports_streaming`
- `context_window`
- `capabilities_json`
- `last_seen_at`
- `created_at`
- `updated_at`

### 7.3. projects

Поля:

- `id`
- `name`
- `description`
- `synopsis`
- `provider_id`
- `model_id`
- `status`
- `created_at`
- `updated_at`
- `archived_at`

## 8. AI actions

AI-действия должны быть не набором случайных prompt, а типизированными операциями.

Примеры action type:

- `project_setup`
- `expand_idea`
- `suggest_directions`
- `generate_world_seed`
- `generate_character`
- `generate_faction`
- `generate_location`
- `build_plot_outline`
- `continue_scene`
- `rewrite_fragment`
- `extract_canon_facts`
- `check_contradictions`

Каждое действие получает:

- `project_id`;
- `provider_id`;
- `model_id`;
- `input`;
- `context`;
- `output_format`;
- `streaming`.

Каждое действие возвращает:

- `text`;
- `structured_json`, если применимо;
- `suggestions`;
- `canon_candidates`;
- `warnings`;
- `raw_provider_metadata`.

## 9. Prompting и structured output

Для MVP:

- использовать строгие system prompts;
- просить JSON там, где нужен структурированный результат;
- валидировать ответ через Pydantic;
- при невалидном JSON делать один repair-запрос или fallback в plain text;
- сохранять исходный ответ и нормализованный результат.

Не полагаться на provider-specific JSON mode как на единственный путь, потому что локальные модели и разные OpenAI-compatible servers часто ведут себя по-разному.

## 10. Frontend routes

Базовые маршруты:

- `/`
- `/projects`
- `/projects/new`
- `/projects/:projectId`
- `/projects/:projectId/idea`
- `/projects/:projectId/world`
- `/projects/:projectId/characters`
- `/projects/:projectId/plot`
- `/projects/:projectId/chapters`
- `/projects/:projectId/chapters/:chapterId`
- `/projects/:projectId/canon`
- `/settings/providers`

## 11. UI-состояния

Обязательные состояния:

- provider не настроен;
- provider недоступен;
- model не выбрана;
- model отвечает;
- streaming идет;
- AI вернул ошибку;
- AI вернул частичный результат;
- пользователь редактирует AI-предложение;
- пользователь подтверждает факт как канон.

## 12. Безопасность и приватность

Требования:

- локальные данные не отправляются никуда, кроме выбранного AI-провайдера;
- внешний provider должен быть визуально помечен;
- перед использованием OpenAI показывать, что текст будет отправлен во внешний сервис;
- перед использованием OpenRouter показывать, что текст будет отправлен во внешний сервис;
- API key не логировать;
- provider errors не должны раскрывать ключи;
- в будущем добавить защищенное хранение ключей через OS keychain.

## 13. Dev commands

Ориентир:

```bash
# Backend
cd backend
uv sync --extra dev
uv run db-init
uv run dev  # http://localhost:9001

# Frontend
cd frontend
pnpm install
pnpm dev   # http://localhost:9002, /api -> http://localhost:9001

# Combined
node scripts/dev.mjs
```

Windows:

```powershell
.\scripts\dev.ps1
```

## 14. Тестирование

Backend:

- provider adapters с mock HTTP;
- миграции;
- CRUD проектов;
- AI Project Setup parsing;
- canon facts;
- streaming endpoint.

Frontend:

- настройки provider;
- создание проекта;
- Project Setup flow;
- editor actions;
- error states;
- streaming rendering.

## 15. Post-MVP

После первого MVP:

- sqlite-vec индекс по канону, главам и лору;
- локальные embeddings;
- импорт/экспорт проекта;
- резервные копии;
- Live Mode;
- tool use для моделей, которые это поддерживают;
- capability detection для моделей;
- отдельные модели под planning, prose, canon checking.
