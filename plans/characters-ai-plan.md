# Characters CRUD + AI assistants plan

## Цель

Сделать раздел персонажей полноценным рабочим инструментом:

- лист персонажей на текущем URL `/projects/:projectId/workspace/characters`;
- страницы создания и редактирования персонажа;
- удаление персонажа без отдельной read/detail-страницы;
- связи между персонажами как часть модели, API и UI;
- ассистент на лист-странице для массового создания персонажей с базовой информацией;
- ассистент на create/edit-странице для подробного раскрытия одного персонажа.

## Текущее состояние

- В `frontend/src/pages/projects/project-workspace/ProjectWorkspaceRoute.tsx` раздел `characters` сейчас встроен в общий workspace и редактирует массив карточек прямо на странице.
- В `frontend/src/entities/project/model/types.ts` `CharacterWorkspace` содержит только `name`, `role`, `biography`, `motivation`, `goal`, `fear`, `internal_conflict`.
- В `backend/migrations/001_initial.sql` уже есть таблица `character_relationships`, но она не подключена к Pydantic-моделям, store, API и UI.
- В `backend/app/services/project_store.py` `_replace_characters` удаляет всех персонажей проекта и вставляет их заново с новыми UUID. Это ломает будущие связи, потому что relationship-таблица ссылается на стабильные `characters.id`.
- В backend уже есть AI-паттерны:
  - project setup JSON endpoint;
  - chapter assistant streaming/text endpoint;
  - continuity check с JSON parsing и fallback.

Главный предварительный фикс: сделать ID персонажей стабильными до добавления связей и CRUD-страниц.

## UX-решение

### Лист

URL остается:

`/projects/:projectId/workspace/characters`

Лист показывает:

- таблицу или плотный список персонажей;
- имя, роль, пол, возраст;
- краткую биографическую строку;
- chips/строку связей;
- действия: create, edit, delete.

Клик по персонажу ведет сразу на edit, не на read page.

### Create

Новый URL:

`/projects/:projectId/workspace/characters/create`

Форма содержит:

- имя;
- роль;
- пол;
- возраст;
- краткое описание/биография;
- мотивация;
- цель;
- страх;
- внутренний конфликт;
- связи с уже существующими персонажами.

### Edit

Новый URL:

`/projects/:projectId/workspace/characters/:characterId/edit`

Edit использует тот же компонент формы, но:

- подтягивает текущего персонажа;
- показывает существующие связи;
- позволяет удалить персонажа с подтверждением;
- не имеет отдельного режима просмотра.

## Модель данных

### Character

Расширить персонажа полями:

- `gender: string | null`
- `age: string | null`

`age` лучше хранить строкой, а не числом: для фэнтези, sci-fi, бессмертных, условных возрастов и формулировок вроде `около 30`, `17 по документам`, `древний`.

### Relationship

Использовать существующую таблицу `character_relationships` и вывести ее в модель:

- `id`
- `project_id`
- `source_character_id`
- `target_character_id`
- `relationship_type`
- `description`
- `created_at`
- `updated_at`

Рекомендуемые правила:

- `source_character_id != target_character_id`;
- оба персонажа обязаны принадлежать тому же проекту;
- удаление персонажа каскадно удаляет его связи;
- при редактировании связи нельзя выбрать персонажа из другого проекта;
- для отображения на листе backend возвращает связи уже с краткой информацией о target/source персонаже.

### Миграция

Добавить миграцию:

- `ALTER TABLE characters ADD COLUMN gender TEXT;`
- `ALTER TABLE characters ADD COLUMN age TEXT;`
- индексы:
  - `characters(project_id, updated_at)`;
  - `character_relationships(project_id, source_character_id)`;
  - `character_relationships(project_id, target_character_id)`.

Отдельно исправить `_replace_characters`, чтобы он сохранял `character.id`, если id пришел с клиента. Это нужно даже если основной CRUD будет жить на отдельных endpoints, потому что workspace save пока остается в проекте.

## Backend API

Добавить модели в `backend/app/models/projects.py`:

- `CharacterRecord`
- `CharacterRelationshipRecord`
- `CharacterCreate`
- `CharacterUpdate`
- `CharacterRelationshipCreate`
- `CharacterRelationshipUpdate`
- `CharacterListItem`
- `CharacterBulkDraftRequest`
- `CharacterBulkDraftResponse`
- `CharacterProfileAssistRequest`
- `CharacterProfileAssistResponse`

Добавить store-функции в `backend/app/services/project_store.py` или отдельный `character_store.py`.

Рекомендуемый отдельный store лучше, потому что персонажи перестают быть только частью workspace.

### CRUD endpoints

В `backend/app/api/projects.py` или новом `backend/app/api/characters.py`:

- `GET /api/projects/{project_id}/characters`
- `POST /api/projects/{project_id}/characters`
- `GET /api/projects/{project_id}/characters/{character_id}`
- `PATCH /api/projects/{project_id}/characters/{character_id}`
- `DELETE /api/projects/{project_id}/characters/{character_id}`

Примечание: read page в UI не делаем. `GET character` нужен только как техническая загрузка edit-route после refresh/deep link.

### Relationship endpoints

Вариант A, проще для формы:

- relationships передаются внутри create/update character payload;
- backend заменяет связи этого персонажа атомарно.

Вариант B, более REST:

- `POST /api/projects/{project_id}/characters/{character_id}/relationships`
- `PATCH /api/projects/{project_id}/characters/{character_id}/relationships/{relationship_id}`
- `DELETE /api/projects/{project_id}/characters/{character_id}/relationships/{relationship_id}`

Рекомендуемый вариант для MVP: A. Форма редактирует персонажа целиком, включая связи, и сохраняет одним действием.

### Bulk create endpoint

Добавить:

`POST /api/projects/{project_id}/characters/bulk`

Payload:

- `characters`: массив базовых персонажей;
- `relationships`: массив связей, где временные draft-id резолвятся backend-ом в реальные IDs.

Backend должен:

- создать персонажей в транзакции;
- затем создать связи;
- вернуть созданные records с реальными IDs;
- частично не сохранять результат при ошибке в связях.

## AI backend

### List assistant: bulk draft

Endpoint:

`POST /api/projects/{project_id}/characters/assist/bulk-draft`

Input:

- свободное описание от пользователя;
- optional provider/model override;
- optional limits: max characters, include relationships.

Output:

```json
{
  "characters": [
    {
      "draft_id": "draft-1",
      "name": "Name",
      "gender": "Gender",
      "age": "Age",
      "role": "Role",
      "biography": "Short base note"
    }
  ],
  "relationships": [
    {
      "source_draft_id": "draft-1",
      "target_draft_id": "draft-2",
      "relationship_type": "mentor",
      "description": "Short relationship note"
    }
  ],
  "warnings": []
}
```

Prompt должен учитывать:

- проект: название, synopsis, genre, tone, setting;
- уже существующих персонажей, чтобы не плодить явные дубликаты;
- язык пользовательского ввода;
- требование возвращать compact JSON only.

Fallback без модели:

- парсить строки вида `Имя, пол, возраст, роль`;
- связи искать по простым маркерам `A - тип - B`;
- возвращать warnings, что использован fallback.

### Create/edit assistant: profile assist

Endpoint:

`POST /api/projects/{project_id}/characters/assist/profile`

Input:

- `character_id?: string`;
- текущий form draft;
- user instruction;
- provider/model;
- режим: `expand`, `revise`, `relationships`, `conflict`.

Output:

- structured patch персонажа;
- suggested relationships;
- warnings.

UI не должен слепо перезаписывать форму. Он показывает preview/diff и кнопки:

- apply all;
- apply selected fields;
- discard.

## Frontend архитектура

Создать отдельную entity-область:

- `frontend/src/entities/character/model/types.ts`
- `frontend/src/entities/character/model/character-query-keys.ts`
- `frontend/src/entities/character/model/character-queries.ts`
- `frontend/src/entities/character/model/character-mutations.ts`
- `frontend/src/entities/character/api/character-api.ts`
- `frontend/src/entities/character/index.ts`

Создать feature-области:

- `frontend/src/features/manage-character-form/...`
- `frontend/src/features/assist-character-bulk/...`
- `frontend/src/features/assist-character-profile/...`

Создать pages:

- `frontend/src/pages/projects/characters/CharacterListRoute.tsx`
- `frontend/src/pages/projects/characters/CharacterFormRoute.tsx`
- `frontend/src/pages/projects/characters/CharacterListRoute.css`
- `frontend/src/pages/projects/characters/CharacterFormRoute.css`

### Router

Добавить explicit routes до generic workspace route:

- `/projects/:projectId/workspace/characters`
- `/projects/:projectId/workspace/characters/create`
- `/projects/:projectId/workspace/characters/:characterId/edit`

После этого убрать или заменить старый `currentSection === "characters"` branch в `ProjectWorkspaceRoute.tsx`, чтобы не было двух реализаций одного раздела.

Навигационная вкладка Characters в workspace должна вести на list route.

### Query invalidation

После create/update/delete/bulk:

- invalidation `characters(projectId)`;
- invalidation `project workspace(projectId)`, потому что editor/canon используют персонажей из workspace;
- invalidation chapter editor, если он кэширует characters отдельно.

## UI details

### List assistant

Расположение:

- основной список слева;
- assistant panel справа или ниже на узких экранах.

Поток:

1. Пользователь описывает группу персонажей.
2. Нажимает Generate draft.
3. UI показывает preview таблицу персонажей и preview связей.
4. Пользователь правит draft inline.
5. Нажимает Create selected или Create all.
6. После сохранения список обновляется.

Нужно предусмотреть:

- empty state;
- loading state;
- AI unavailable/fallback state;
- validation errors на уровне строки;
- duplicate warnings.

### Character form assistant

Расположение:

- форма занимает основную ширину;
- assistant panel рядом или ниже.

Поток:

1. Пользователь вводит короткую идею или текущие поля.
2. Нажимает Expand / Improve / Suggest relationships.
3. Assistant возвращает structured patch.
4. UI показывает изменения по полям.
5. Пользователь применяет выбранное.
6. Обычная кнопка Save сохраняет персонажа.

## Implementation stages

### Stage 1. Data foundation

- Добавить миграцию для `gender`, `age`, индексов.
- Подключить `character_relationships` в backend models.
- Сделать store-функции для characters и relationships.
- Исправить сохранение стабильных character IDs в workspace replace-flow.
- Добавить backend tests на ID stability и relationship validation.

### Stage 2. REST CRUD

- Добавить API endpoints для list/create/get/update/delete.
- Добавить bulk create endpoint.
- Добавить tests:
  - create character;
  - update character;
  - delete character cascades relationships;
  - cannot relate to character from another project;
  - cannot relate character to itself;
  - bulk create is transactional.

### Stage 3. Frontend CRUD pages

- Создать `entities/character`.
- Добавить routes.
- Вынести characters из монолитного workspace section.
- Реализовать list/create/edit/delete UI.
- Реализовать relationship rows в форме.
- Добавить focused frontend tests на API layer и form helpers.

### Stage 4. Bulk list assistant

- Добавить backend assist endpoint с JSON response и fallback.
- Добавить frontend assistant panel на list page.
- Добавить preview/edit/apply flow.
- Добавить tests на fallback parsing и frontend draft-to-payload mapping.

### Stage 5. Profile assistant

- Добавить backend profile assist endpoint.
- Добавить frontend assistant panel на create/edit page.
- Реализовать field diff и apply selected fields.
- Добавить tests на structured patch application.

### Stage 6. Integration cleanup

- Проверить, что canon links и chapter editor продолжают получать персонажей.
- Убедиться, что удаление персонажа не оставляет битые canon links; для MVP минимум показывать warning, лучше чистить или помечать orphaned links.
- Убедиться, что old workspace payload не стирает новые поля `gender`, `age`, `relationships`.
- Обновить docs при необходимости.

## Verification

Backend:

- `pytest` для project/character store и API.

Frontend:

- `pnpm test` или существующий frontend test command;
- typecheck/build;
- API tests для `character-api`.

Manual browser check обязателен, потому что это frontend work:

1. Запустить проект через `scripts/dev.ps1` или `scripts/dev.cmd`.
2. Открыть `http://127.0.0.1:9002/projects/07b996f4-af69-4989-9218-60ff97dda0eb/workspace/characters`.
3. Проверить list page.
4. Создать персонажа вручную.
5. Отредактировать персонажа.
6. Создать связь между двумя персонажами.
7. Удалить персонажа и проверить, что связи не ломают UI.
8. Прогнать bulk assistant: draft, preview, create selected.
9. Прогнать profile assistant на create/edit.
10. Проверить Chrome DevTools console/network на ошибки.

Перед запуском команд на Windows:

`Set-ExecutionPolicy -Scope Process Bypass -Force; . .\scripts\tool-env.ps1`

## Acceptance criteria

- На `/workspace/characters` больше нет inline workspace-card редактора из старой реализации.
- Есть отдельные create/edit pages, но нет read/detail page.
- Персонаж имеет `name`, `gender`, `age`, `role`, `biography`, `motivation`, `goal`, `fear`, `internal_conflict`.
- Связи между персонажами сохраняются, отображаются и удаляются корректно.
- ID персонажей стабильны после любых сохранений workspace/character flows.
- List assistant создает несколько персонажей и связи только после пользовательского подтверждения.
- Form assistant предлагает подробное описание персонажа через preview/diff, без скрытого overwrite.
- Существующие разделы canon/editor не регрессируют.

## Notes

- Пользовательское "CRUD без read" трактуем как отсутствие read/detail page. Технический `GET /characters/{id}` допустим для прямой загрузки edit route.
- Возраст храним строкой для художественных проектов.
- Relationships уже есть в schema, но сейчас фактически не существуют на уровне приложения.
