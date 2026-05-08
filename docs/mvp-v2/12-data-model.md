# 12. Модель данных

## 1. Назначение

Этот документ описывает концептуальную модель данных MVP v2. Он не заменяет SQL-миграции, но задает сущности, связи и статусы, которые нужны для реализации.

Markdown - единственный формат хранения художественного текста. Поля глав и версий черновиков должны хранить markdown, а не HTML, rich text JSON или proprietary editor state.

## 2. Основные сущности

### Project

Проект истории.

Поля:

- id;
- title;
- synopsis;
- status;
- active_provider_id;
- active_model_id;
- expansion_policy;
- created_at;
- updated_at;
- archived_at.

### Provider

AI-провайдер.

Поля:

- id;
- name;
- type;
- base_url;
- api_key_ref;
- is_external;
- supports_streaming;
- status;
- last_checked_at.

### ProviderModel

Модель провайдера.

Поля:

- id;
- provider_id;
- model_id;
- display_name;
- supports_streaming;
- is_selected;

## 3. Память истории

### MemoryItem

Универсальная сущность памяти.

Поля:

- id;
- project_id;
- type;
- title;
- summary;
- body;
- status;
- source_type;
- source_id;
- importance;
- created_at;
- updated_at;

Типы:

- character;
- location;
- item;
- group;
- world_rule;
- mystery;
- event;
- canon_fact;
- note.

Статусы:

- proposed;
- draft;
- canon;
- rejected;
- outdated.

### MemoryRelation

Связь между элементами памяти.

Поля:

- id;
- project_id;
- from_item_id;
- to_item_id;
- relation_type;
- description;
- status.

Примеры relation_type:

- knows;
- owns;
- located_in;
- belongs_to;
- contradicts;
- supports;
- related_to.

### MemoryProposal

Предложение обновления памяти.

Поля:

- id;
- project_id;
- proposal_type;
- target_item_id;
- suggested_payload;
- reason;
- source_type;
- source_id;
- status;
- created_at.

Статусы:

- pending;
- accepted;
- edited;
- rejected;
- deferred.

## 4. Линии истории

### StoryLine

Мягкая арка или линия.

Поля:

- id;
- project_id;
- type;
- title;
- description;
- current_state;
- status;
- priority;
- last_progress_chapter_id;
- created_at;
- updated_at.

Типы:

- character;
- mystery;
- relationship;
- threat;
- theme;
- custom.

Статусы:

- proposed;
- active;
- sleeping;
- completed;
- rejected.

### StoryLineProgress

Запись изменения линии.

Поля:

- id;
- project_id;
- story_line_id;
- chapter_id;
- session_id;
- before_state;
- after_state;
- event_summary;
- created_at.

## 5. Главы и сессии

### Chapter

Текстовая глава или будущая глава.

Поля:

- id;
- project_id;
- title;
- order_index;
- status;
- synopsis;
- draft_markdown;
- final_markdown;
- session_id;
- created_at;
- updated_at.

Статусы:

- planned;
- in_session;
- session_done;
- draft_generated;
- reviewing;
- completed.

### ChapterSession

Интерактивная сессия главы.

Поля:

- id;
- project_id;
- chapter_id;
- status;
- user_role;
- controlled_character_ids;
- active_story_line_ids;
- tone;
- pace;
- expansion_policy_override;
- started_at;
- paused_at;
- completed_at.

Статусы:

- preparing;
- active;
- paused;
- completed;
- draft_ready;
- reviewed.

### SessionTurn

Ход в режиме рассказчика.

Поля:

- id;
- session_id;
- turn_index;
- actor_type;
- turn_type;
- content;
- related_memory_item_ids;
- related_story_line_ids;
- is_key_event;
- exclude_from_draft;
- created_at.

actor_type:

- ai;
- user;
- system.

turn_type:

- narration;
- action;
- dialogue;
- author_command;
- choice;
- note;
- summary.

### KeyEvent

Ключевое событие сессии.

Поля:

- id;
- project_id;
- session_id;
- chapter_id;
- title;
- summary;
- consequences;
- related_memory_item_ids;
- related_story_line_ids;
- include_in_draft;
- created_at.

## 6. Черновики

### DraftVersion

Версия черновика главы.

Поля:

- id;
- project_id;
- chapter_id;
- source_session_id;
- mode;
- markdown;
- status;
- created_at;

mode:

- faithful;
- literary;
- shorter;
- expanded;
- dialogue_focus;
- atmosphere_focus.

status:

- generated;
- edited;
- accepted;

## 7. Прогноз

### Forecast

Прогноз развития.

Поля:

- id;
- project_id;
- source_chapter_id;
- summary;
- status;
- created_at.

### ForecastOption

Вариант развития.

Поля:

- id;
- forecast_id;
- title;
- description;
- likely_consequences;
- related_story_line_ids;
- risks;
- is_selected_as_orientation.

Прогноз не является планом. Поле `is_selected_as_orientation` означает только мягкий ориентир.

## 8. Debug-логи не хранятся в БД

В MVP v2 запрещено хранить debug-логи, AI request logs, prompt/response dumps или frontend debug entries в SQLite.

Если debug включен, все диагностические события пишутся только в JSONL-файлы:

```text
logs/app-<yyyy>-<mm>-<dd>.jsonl
```

Формат строки:

```json
{
  "timestamp": "2026-05-08 15:30:45.123 +0300",
  "module": "backend",
  "category": "LLM",
  "operation": "chat.request",
  "payload": {}
}
```

Правила:

- `module`: `backend` или `frontend`;
- `category`: `system`, `http` или `LLM`;
- `payload` должен проходить sanitize;
- секреты в ключах `authorization`, `api_key`, `apikey`, `password`, `secret`, `token`, `cookie` заменяются на `[redacted]`;
- запросы к `/api/debug/logs` не логируются;
- таблицы для debug logs или AI request logs не создаются.

## 9. Связи

Ключевые связи:

- Project имеет много MemoryItem.
- Project имеет много StoryLine.
- Project имеет много Chapter.
- Chapter может иметь ChapterSession.
- ChapterSession имеет много SessionTurn.
- ChapterSession имеет много KeyEvent.
- Chapter имеет много DraftVersion.
- MemoryProposal может ссылаться на ChapterSession, Chapter или MemoryItem.
- StoryLineProgress связывает StoryLine с Chapter и Session.
- Debug logs не имеют связей в модели данных, потому что живут только в JSONL-файлах.

## 10. Миграционный подход

MVP v2 можно реализовать поэтапно:

1. добавить универсальную память истории;
2. добавить линии истории;
3. добавить главы и сессии;
4. добавить ходы;
5. добавить черновики;
6. добавить предложения памяти;
7. добавить прогнозы.

## 11. Критерии готовности

Модель данных готова для MVP, если она позволяет:

- создать проект из синопсиса;
- хранить память с разными статусами;
- хранить линии и их прогресс;
- хранить интерактивную сессию ходами;
- собрать черновик из сессии;
- предложить обновления канона;
- сохранить прогноз следующих глав;
- не содержит таблиц или сущностей для debug logs / AI request logs.
