# 13. API MVP

## 1. Назначение

Этот документ описывает API-поверхность MVP v2 на уровне продукта. Названия endpoint можно уточнить на этапе реализации, но покрытие функций должно сохраниться.

Все mutating endpoint для проектов, памяти, линий, сессий, черновиков, разборов и прогнозов должны проверять доступность активного AI-провайдера, если действие относится к творческому workflow. Без AI API должен позволять только чтение уже сохраненных данных и настройку/проверку провайдеров.

Debug-логи не относятся к модели данных приложения и не хранятся в БД. При включенном debug API пишет диагностические события только в `logs/app-<yyyy>-<mm>-<dd>.jsonl`.

## 2. Провайдеры

### Получить список провайдеров

`GET /api/providers`

Возвращает сохраненные AI-провайдеры.

### Создать провайдера

`POST /api/providers`

Создает провайдера.

### Обновить провайдера

`PATCH /api/providers/{provider_id}`

Обновляет настройки.

### Проверить подключение

`POST /api/providers/{provider_id}/test`

Проверяет доступность.

### Получить модели

`GET /api/providers/{provider_id}/models`

Возвращает модели, если провайдер поддерживает список.

## 3. Debug logs

### Получить статус debug logging

`GET /api/debug/logs`

Возвращает:

```json
{ "enabled": true }
```

Endpoint нужен frontend-у, чтобы понять, устанавливать ли debug interceptors.

### Принять frontend debug batch

`POST /api/debug/logs`

Принимает batch frontend entries:

```json
{
  "entries": [
    {
      "timestamp": "2026-05-08 15:30:45.123 +0300",
      "module": "frontend",
      "category": "http",
      "operation": "fetch.http.error",
      "payload": {}
    }
  ]
}
```

Если debug включен, backend пишет entries в `logs/app-<yyyy>-<mm>-<dd>.jsonl`. Если debug выключен, endpoint возвращает success и ничего не пишет.

Важно:

- `GET /api/debug/logs` и `POST /api/debug/logs` не должны логироваться;
- будущие `/api/debug/logs/*` тоже не должны логироваться;
- debug entries не сохраняются в SQLite.

## 4. Проекты

### Список проектов

`GET /api/projects`

### Создать проект

`POST /api/projects`

Создает проект. Для MVP v2 создание может идти через отдельный start-story flow.

### Получить проект

`GET /api/projects/{project_id}`

### Обновить проект

`PATCH /api/projects/{project_id}`

### Архивировать проект

`POST /api/projects/{project_id}/archive`

## 5. Старт истории

### Анализ синопсиса

`POST /api/projects/start/analyze`

Вход:

- synopsis;
- title;
- tone;
- avoid;
- preferred_user_role;
- provider_id;
- model_id.

Выход:

- understood_synopsis;
- emotional_core;
- suggested_title;
- memory_items;
- story_lines;
- start_points;
- questions.

### Создать проект из анализа

`POST /api/projects/start/confirm`

Вход:

- исходный синопсис;
- отредактированный анализ;
- выбранные элементы памяти;
- выбранные линии;
- правила расширения мира;
- выбранная стартовая точка.

Выход:

- project;
- created_memory_items;
- created_story_lines;
- start_points.

## 6. Память истории

### Список элементов памяти

`GET /api/projects/{project_id}/memory`

Фильтры:

- type;
- status;
- search;
- requires_confirmation.

### Создать элемент

`POST /api/projects/{project_id}/memory`

### Обновить элемент

`PATCH /api/projects/{project_id}/memory/{item_id}`

### Изменить статус

`POST /api/projects/{project_id}/memory/{item_id}/status`

### Предложения памяти

`GET /api/projects/{project_id}/memory-proposals`

### Принять предложение

`POST /api/projects/{project_id}/memory-proposals/{proposal_id}/accept`

### Отклонить предложение

`POST /api/projects/{project_id}/memory-proposals/{proposal_id}/reject`

### Проверить противоречия

`POST /api/projects/{project_id}/memory/check-conflicts`

## 7. Линии истории

### Список линий

`GET /api/projects/{project_id}/story-lines`

### Создать линию

`POST /api/projects/{project_id}/story-lines`

### Обновить линию

`PATCH /api/projects/{project_id}/story-lines/{line_id}`

### Обновить статус

`POST /api/projects/{project_id}/story-lines/{line_id}/status`

### Получить прогресс линии

`GET /api/projects/{project_id}/story-lines/{line_id}/progress`

### Предложить линии из памяти

`POST /api/projects/{project_id}/story-lines/suggest`

## 8. Главы

### Список глав

`GET /api/projects/{project_id}/chapters`

### Создать подготовку главы

`POST /api/projects/{project_id}/chapters`

### Получить главу

`GET /api/projects/{project_id}/chapters/{chapter_id}`

### Обновить главу

`PATCH /api/projects/{project_id}/chapters/{chapter_id}`

## 9. Сессии рассказчика

### Подготовить сессию

`POST /api/projects/{project_id}/chapters/{chapter_id}/session/prepare`

Вход:

- user_role;
- controlled_character_ids;
- active_story_line_ids;
- tone;
- pace;
- expansion_policy_override;
- start_point.

Выход:

- session;
- narrator_opening;
- suggested_actions;
- relevant_memory.

### Начать или продолжить сессию

`POST /api/sessions/{session_id}/start`

### Отправить ход пользователя

`POST /api/sessions/{session_id}/turns`

Вход:

- input_type;
- content;
- selected_option_id, если выбран быстрый вариант.

Выход:

- ai_turn;
- suggested_actions;
- key_event_candidates;
- memory_proposal_candidates.

### Получить ходы

`GET /api/sessions/{session_id}/turns`

### Пауза

`POST /api/sessions/{session_id}/pause`

### Завершить сессию

`POST /api/sessions/{session_id}/complete`

## 10. Лог и ключевые события

### Получить лог

`GET /api/sessions/{session_id}/log`

### Обновить ход

`PATCH /api/sessions/{session_id}/turns/{turn_id}`

Используется для флагов:

- important;
- exclude_from_draft.

### Список ключевых событий

`GET /api/sessions/{session_id}/key-events`

### Обновить ключевое событие

`PATCH /api/sessions/{session_id}/key-events/{event_id}`

## 11. Сборка черновика

### Собрать черновик

`POST /api/sessions/{session_id}/assemble-draft`

Вход:

- mode;
- required_event_ids;
- excluded_turn_ids;
- style_notes.

Выход:

- draft_version;
- warnings.

### Обновить черновик

`PATCH /api/chapters/{chapter_id}/draft`

### AI-редактирование фрагмента

`POST /api/chapters/{chapter_id}/draft/assist`

## 12. Разбор после главы

### Сгенерировать разбор

`POST /api/chapters/{chapter_id}/review`

Выход:

- summary;
- memory_proposals;
- story_line_updates;
- contradictions;
- open_questions.

### Применить разбор

`POST /api/chapters/{chapter_id}/review/apply`

Принимает решения пользователя по предложениям.

## 13. Прогноз

### Сгенерировать прогноз

`POST /api/projects/{project_id}/forecast`

Вход:

- source_chapter_id;
- horizon_chapters;
- active_story_line_ids.

Выход:

- forecast;
- options.

### Выбрать ориентир

`POST /api/forecasts/{forecast_id}/options/{option_id}/select`

Выбор не фиксирует план, а сохраняет мягкий ориентир.

## 14. Streaming

Для режима рассказчика и сборки черновика желательно поддержать streaming.

MVP может реализовать:

- server-sent events;
- streaming response;
- fallback на обычный ответ.

UI должен работать и без streaming, если провайдер не поддерживает.

Fallback на обычный ответ допустим только при доступной модели. Fallback на работу без AI не допускается.

## 15. Критерии готовности

API готово для MVP v2, если покрывает:

- настройку AI;
- debug logging API без записи в БД;
- создание проекта из синопсиса;
- память истории;
- линии истории;
- главы;
- сессии рассказчика;
- ходы;
- лог;
- сборку черновика;
- разбор после главы;
- прогноз.
