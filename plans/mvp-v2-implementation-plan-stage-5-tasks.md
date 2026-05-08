# План реализации MVP v2 - stage 5 Линии истории и подготовка главы

Дата: 2026-05-08
Ветка: `v2`
Область: backend story lines / chapters API and services, AI chapter preparation action, frontend story-lines and chapter-preparation flows.
Источник: `plans/mvp-v2-implementation-plan.md`, раздел "Этап 5. Линии истории и подготовка главы".

## Цель этапа

Заменить жесткий сюжетный план мягкими линиями истории и дать пользователю подготовку следующей интерактивной главы: выбрать роль, управляемых персонажей, линии в фокусе и примерное направление сцены. Этап должен создать игровую рамку для будущего narrator mode, но не фиксировать финал, не запускать полноценный loop ходов и не добавлять ручные творческие fallback-сценарии без AI.

Stage 5 продолжает Stage 3-4: проект уже может появиться из синопсиса со стартовой памятью, стартовыми линиями и optional planned chapter; workspace уже показывает synopsis, next step, memory attention и compact active lines. Теперь эти линии становятся управляемым workflow, а planned chapter превращается в подготовленную сессию рассказчика.

## Текущее состояние

- Репозиторий находится на ветке `v2`; рабочее дерево перед составлением плана было чистым.
- Stage 1 создал v2 runtime schema: `story_lines`, `story_line_progress`, `chapters`, `chapter_sessions`, `session_turns`, `key_events`, `draft_versions`, `forecasts` and related indexes.
- `backend/app/models/story_runtime.py` уже содержит базовые Pydantic-модели для `StoryLine`, `StoryLineProgress`, `Chapter`, `ChapterSession`, `SessionTurn` and related records.
- `backend/app/services/story_runtime_store.py` уже умеет создавать/читать story lines, progress, chapters, chapter sessions, turns and key events, но не умеет обновлять story lines, менять статусы линий, фильтровать линии, обновлять chapters/sessions или получать session by id.
- Stage 2 уже зарегистрировал AI actions `suggest_story_lines`, `prepare_chapter_session`, `narrate_turn`, `update_story_lines`; Stage 5 должен использовать `suggest_story_lines` and `prepare_chapter_session`, оставив `narrate_turn` для Stage 6 and `update_story_lines` mostly for Stage 7.
- `PrepareChapterSessionOutput` сейчас возвращает `narrator_opening`, `suggested_actions`, `relevant_memory_titles`, `warnings`. Для подготовки главы может понадобиться расширить output model только тем, что реально отображается в UI and persists safely.
- Stage 3 `confirm_start_story` сохраняет стартовые story lines через `story_runtime_store.create_story_line` and optional стартовую `chapters` запись со статусом `planned`.
- Stage 4 добавил `GET /api/projects/{project_id}/workspace-summary`, memory endpoints and read-only guard. Workspace summary уже возвращает `active_story_lines`, `planned_chapter`, `latest_chapter`, но line management and chapter preparation intentionally deferred to Stage 5.
- Backend routers for `/api/projects/{project_id}/story-lines`, `/api/projects/{project_id}/chapters`, and `/api/projects/{project_id}/chapters/{chapter_id}/session/prepare` do not exist yet.
- Frontend currently has no `entities/story-line`, `entities/chapter`, `features/prepare-chapter`, or dedicated routes for story lines / chapter preparation. `ProjectWorkspaceRoute` shows active lines inline only.
- Frontend still has v1-era project workspace/chapter/canon types and API helpers in `entities/project`; Stage 5 should not extend those legacy endpoints.
- Frontend rules apply: MVP is desktop-only, minimum width 1366px, visible changes require automated checks plus Chrome DevTools manual QA.

## Рабочие решения

- Продолжаем в текущей ветке `v2`; новую ветку для Stage 5 не создаем.
- Stage 5 включает:
  - story lines API and UI;
  - AI suggestion of additional story lines from synopsis/current memory/current lines;
  - story line status/edit/progress read flow;
  - chapters API for planned chapter preparation;
  - AI `prepare_chapter_session` endpoint that creates a saved preparation/session frame for Stage 6.
- Stage 5 не включает:
  - narrator turn loop (`POST /api/sessions/{session_id}/turns`);
  - pause/continue/complete session lifecycle beyond the initial prepared session frame;
  - draft assembly;
  - post-chapter memory/story-line updates;
  - forecast;
  - markdown chapter editor.
- All creative mutating endpoints for lines and chapter preparation must call project-aware `runtime_status.require_creative_write(project_id)`. Without AI, reads remain available and writes return `READ_ONLY_WITHOUT_AI`.
- Story line edits are allowed only while AI is available. This is not a manual fallback: AI availability is the hard gate, and AI-generated suggestions remain candidates until the user accepts/edits/rejects them.
- For line listing, add filters that match product needs without over-designing: `type`, `status`, `search`, and optional attention grouping computed in service/API response. Avoid a new migration for attention flags unless implementation proves persistence is necessary.
- For story line progress, use existing `story_line_progress` table. Stage 5 displays progress history and last-progress metadata, but creation of post-chapter progress updates remains Stage 7 except for test/dev records and future session links.
- For `POST /story-lines/suggest`, use AI action `suggest_story_lines` with project synopsis, canon/draft memory, existing lines, and optional user instruction. The endpoint returns candidates and warnings; it must not persist candidates automatically.
- For chapters, keep `chapters.draft_markdown` and `final_markdown` untouched unless a future draft stage writes markdown. Stage 5 stores preparation intent in `chapters.synopsis` / request fields and session configuration in `chapter_sessions`.
- `ChapterCreate` currently requires `title`; Stage 5 request may accept optional title and generate a conservative default such as `Глава N` server-side when the user leaves it empty.
- `focus` / "цель главы" maps to a chapter-preparation field in API models and can be persisted as `chapters.synopsis` for MVP if no migration is needed. If richer structured preparation is necessary, add a narrowly scoped migration instead of packing opaque JSON into artistic markdown fields.
- `prepare_chapter_session` should validate controlled character ids against project memory and active line ids against project story lines. Unknown ids return 422/404 rather than being silently ignored.
- The preparation AI result should persist enough state to survive refresh. Preferred minimal path: create/update a `chapter_sessions` row, store selected ids/settings there, and persist `narrator_opening` as the first AI `session_turn` or a clearly named preparation note. Quick `suggested_actions` may remain response-only unless Stage 6 needs persisted choices.
- Do not start a full narrator session in Stage 5. The UI can end on a prepared-session preview / "ready for narrator" state and link to the Stage 6 narrator route shell if implemented.
- Update workspace summary next-step logic so planned chapters and prepared sessions point to the chapter-preparation flow instead of a dead CTA. Extend frontend types/tests when adding new next-step codes.
- Keep route ordering explicit: story-line/chapter routers should not be shadowed by `/projects/{project_id}` dynamic route.
- Frontend should follow the feature/domain-first layout:
  - `entities/story-line` for line types, labels, API, queries, mutations;
  - `entities/chapter` or `entities/chapter-session` for chapter/session contracts;
  - `features/prepare-chapter` for form state, selected role/characters/lines, and AI-preparation submit flow;
  - `pages/projects/story-lines` and `pages/projects/chapter-prepare` for route-level composition.
- UI should be a working tool surface, not a marketing page. Use dense desktop layouts, familiar controls, clear disabled states, and no manual creative actions when runtime is read-only.

## Задачи

- [x] Add backend API models for story line list filters, create/update/status payloads, suggest-line request/response, line progress response, chapter create/update payloads, chapter preparation request/response.
- [x] Extend `story_runtime_store` with `update_story_line`, `update_story_line_status`, filtered `list_story_lines`, and project-scoped validation helpers for line ids.
- [x] Extend `story_runtime_store` with `update_chapter`, `get_chapter_session`, `update_chapter_session`, and helper to link `chapters.session_id` after session preparation.
- [x] Decide and implement the minimal persistence shape for `prepare_chapter_session` output: persisted opening turn/preparation note plus response-only or persisted suggested actions.
- [x] Add backend `story_lines` router under `/api/projects/{project_id}/story-lines`:
  - [x] `GET /api/projects/{project_id}/story-lines`;
  - [x] `POST /api/projects/{project_id}/story-lines`;
  - [x] `PATCH /api/projects/{project_id}/story-lines/{line_id}`;
  - [x] `POST /api/projects/{project_id}/story-lines/{line_id}/status`;
  - [x] `GET /api/projects/{project_id}/story-lines/{line_id}/progress`;
  - [x] `POST /api/projects/{project_id}/story-lines/suggest`.
- [x] Add backend `chapters` router under `/api/projects/{project_id}/chapters`:
  - [x] `GET /api/projects/{project_id}/chapters`;
  - [x] `POST /api/projects/{project_id}/chapters`;
  - [x] `GET /api/projects/{project_id}/chapters/{chapter_id}`;
  - [x] `PATCH /api/projects/{project_id}/chapters/{chapter_id}`;
  - [x] `POST /api/projects/{project_id}/chapters/{chapter_id}/session/prepare`.
- [x] Wire new routers into `backend/app/api/router.py` and add route-order tests so project dynamic routes do not shadow nested resources.
- [x] Implement `suggest_story_lines` service using `ai_service.execute_action(action_type="suggest_story_lines")` with project synopsis, memory context and existing lines; return candidates without automatic persistence.
- [x] Implement `prepare_chapter_session` service using `ai_service.execute_action(action_type="prepare_chapter_session")` with selected role, controlled characters, active lines, tone, pace, expansion policy and start/focus text.
- [x] Ensure all mutating story-line/chapter/session-preparation endpoints are blocked by project-aware read-only guard, while list/get/progress reads remain available without AI.
- [x] Update workspace summary backend model/service so next-step CTA can point to line/chapter preparation states introduced by Stage 5.
- [x] Add backend tests for story line listing/filtering, create/update/status, progress read, AI line suggestions with mocked adapter, chapter create/update/list/get, session preparation with mocked `prepare_chapter_session`, and read-only blocks.
- [x] Add backend tests that Start Story-created lines are visible through the new line API and can be accepted/edited/rejected while AI is available.
- [x] Add frontend `entities/story-line` public slice: types, labels, API helpers, query keys/options, mutations and API tests.
- [x] Add frontend `entities/chapter` or `entities/chapter-session` public slice: types, API helpers, query keys/options, mutations and API tests.
- [x] Add route(s) for story lines, for example `/projects/:projectId/story-lines`, and wire navigation/links from workspace active-lines block.
- [x] Build `StoryLinesRoute` with grouped line list: active, needs attention/proposed, sleeping, completed, rejected; support type/status/search filters and read-only rendering.
- [x] Add line card edit/status actions and AI suggestion review flow: suggestions can be accepted as `proposed`/`active`, edited before save, deferred by doing nothing, or rejected by not persisting.
- [x] Add route(s) for chapter preparation, for example `/projects/:projectId/chapters/prepare` and/or `/projects/:projectId/chapters/:chapterId/prepare`.
- [x] Build `ChapterPrepareRoute` / feature form for title/focus, user role, controlled characters from memory, primary/secondary/ignored lines, tone, pace, expansion policy override and start situation.
- [x] Add client-side validation matching backend rules: at most one primary line, up to two secondary lines, controlled characters must come from project memory, read-only disables submit.
- [x] Show AI preparation result with narrator opening, suggested actions, relevant memory and warnings; after success show the saved prepared-session state and the next CTA for Stage 6 narrator mode.
- [x] Update `ProjectWorkspaceRoute` next-step CTA and active-lines block to link to the new routes without turning workspace into a second line editor.
- [x] Keep legacy v1 project workspace/chapter/canon API helpers unused and do not extend removed `/workspace`, `/chapter-editor`, `/canon/check` routes.
- [x] Add frontend route/API smoke tests for story line read-only rendering, line suggestion review, chapter-preparation disabled state without AI, and successful prepare response.
- [x] Run backend checks: `uv run pytest`, `uv run ruff check .`.
- [x] Run frontend checks: `pnpm test`, `pnpm lint`, `pnpm build`.
- [x] Run the project dev launcher (`scripts/dev.ps1`) and manually verify in Chrome DevTools at 1366px and wider desktop: story lines route, line filters/edit/suggest UI, chapter preparation form, AI-disabled read-only state, console and network.
- [x] Update this task file during implementation with completed checklist items, `Verification notes`, deviations from plan, and any intentionally deferred Stage 6/7 work.

## Acceptance

- Story lines created during Start Story are visible in the project line UI and through `GET /api/projects/{project_id}/story-lines`.
- User can accept, edit, activate, put to sleep, complete or reject a line while AI is available.
- User can ask AI to suggest additional lines from current synopsis/memory/existing lines; suggestions are candidates and are not persisted until the user chooses.
- Story lines are grouped in UI by practical attention state: active, proposed/needs decision, sleeping, completed/rejected.
- Line progress history can be opened/read for a line.
- Workspace active-lines block links to the full line workflow and does not pretend line management is complete inline.
- User can create or open a planned chapter preparation.
- Before the chapter, user can choose role, controlled character(s), primary/secondary story lines or no line focus, tone, pace, expansion policy override and start/focus text.
- AI preparation returns a starting narrator frame: opening, suggested actions, relevant memory/line context and warnings.
- The prepared chapter/session state is persisted enough to survive a page refresh and serve as Stage 6 input.
- Preparation does not fix a final plot outcome and does not generate a full chapter.
- Without available AI, story lines, chapters and prepared sessions are readable, but line creation/edit/status changes, AI suggestions and chapter/session preparation are blocked.
- No manual creative fallback workflow is added for project creation, story editing, narrator mode, memory updates, story lines, draft assembly or forecasts.
- Markdown-only invariant is preserved; no chapter prose is stored as HTML, rich text JSON or editor-specific state.
- Debug logs, prompt/response dumps and frontend debug entries are not stored in SQLite.
- Visible frontend behavior is verified by automated checks plus Chrome DevTools manual QA.

## Критический анализ

- Stage 5 sits on a boundary: it must prepare narrator mode but not implement narrator mode. The main risk is accidentally building half of Stage 6. Keep the cut at "prepared session frame plus opening", and leave user turns, pause/continue/complete, log editing and key event extraction to Stage 6.
- Existing `PrepareChapterSessionOutput` is minimal. It may not carry all UI copy promised by docs (`start situation`, `participants`, `risks`). Extending the schema is acceptable if the output remains structured and validated, but broad free-form JSON would make Stage 6 harder.
- Existing schema has no dedicated persistence for `suggested_actions`. Persisting them as opaque JSON would be convenient but may be a premature migration. If suggestions are response-only, document the limitation and ensure the core opening/session context persists.
- Story line "attention" is a product concept, not a current database field. It should be computed from status, priority, progress and chapter recency first. Add persisted fields only if the UI needs user decisions that cannot be derived.
- Product docs say lines are created and changed with AI available. Stage 4 already permits user memory edits while AI is available. Stage 5 can mirror that gate, but the UI copy must not imply the app works creatively without AI.
- `StoryLineStatus` lacks `advanced/продвинута`, while docs list it in lifecycle. Current data model uses progress records plus `last_progress_chapter_id`; do not add a new status unless the product explicitly needs it in filters.
- Chapter preparation needs controlled characters from memory, but memory items are generic. Start with `type=character` and non-rejected statuses; relation-based participant grouping can wait.
- `ChapterStatus` has no `preparing` value, only `planned` before `in_session`. Keep `planned` for preparation drafts and use `chapter_sessions.status='preparing'` for the prepared session frame.
- Workspace summary currently has a narrow `next_step.code` union. Extending it will ripple through frontend types/tests; do it deliberately rather than overloading `continue_story` with ambiguous destinations.
- Browser QA may depend on having local AI available. Backend AI behavior should be covered by mocked tests; manual QA can verify disabled/read-only behavior and, when a local provider is available, one real prepare call.

## Риски и проверки

- Route shadowing risk: nested `/projects/{project_id}/story-lines` and `/chapters` routes must work alongside `/projects/{project_id}`. Cover with API tests.
- Read-only risk: disabling frontend controls is not enough. Backend tests must prove every creative line/chapter mutation returns `READ_ONLY_WITHOUT_AI` without AI.
- Data integrity risk: selected line ids and character ids must belong to the same project; otherwise prepared sessions can reference foreign or deleted records.
- AI output risk: invalid `prepare_chapter_session` output must fail through the existing structured-output/repair path, not produce synthetic manual content.
- Scope creep risk: line updates after a completed chapter and forecast-by-lines belong to Stage 7/forecast work, not this stage.
- UX density risk: line management and chapter preparation can become giant forms. Keep line cards compact and use focused side panels/forms for editing and suggestion review.
- Layout risk: long line titles, current states, Cyrillic text and narrator openings must wrap cleanly at 1366px without overlapping controls.
- Persistence risk: if suggested actions are not persisted in Stage 5, Stage 6 must know that only opening/session settings are durable. Record the decision in verification notes.
- Migration risk: if a new migration is needed for preparation metadata, ensure it does not recreate removed v1 structures and does not add debug/prompt storage tables.

## Verification notes

- `backend`: `uv run pytest tests\test_story_lines_chapters.py` - 3 passed.
- `backend`: `uv run pytest` - 48 passed.
- `backend`: `uv run ruff check .` - passed.
- `frontend`: `pnpm test` - 12 files / 30 tests passed.
- `frontend`: `pnpm lint` - passed with existing warning in `frontend/src/shared/testing/query-client.tsx` (`react-refresh/only-export-components`).
- `frontend`: `pnpm build` - passed.
- Dev launcher: `scripts/dev.ps1` started backend `http://127.0.0.1:9001` and frontend `http://127.0.0.1:9002`.
- Chrome DevTools at 1366px: opened `/projects/{project_id}/story-lines`; verified line grouping, filters surface, edit form population, progress panel, clean console and no horizontal overflow.
- Chrome DevTools at 1366px: opened `/projects/{project_id}/chapters/prepare`; verified chapter selector, character list, primary/secondary line controls, prepare form, clean console, API requests for workspace/chapter/memory/story-lines returning 200, and no horizontal overflow.
- Chrome DevTools at 1600px: rechecked chapter preparation and workspace link surface; no horizontal overflow and no console warnings/errors.
- Chrome DevTools: verified workspace next-step CTA now points to `/projects/{project_id}/chapters/{chapter_id}/prepare`, and active-lines block links to `/projects/{project_id}/story-lines`.
- Real local AI chapter preparation was not submitted during browser QA to avoid a long-running provider call and mutating the local demo project; `prepare_chapter_session` behavior is covered by backend tests with a mocked adapter.
- Persistence decision: `prepare_chapter_session` persists a `chapter_sessions` row, links `chapters.session_id`, and stores `narrator_opening` as the first AI `session_turn`; quick `suggested_actions` remain response-only for Stage 5 and can be revisited in Stage 6.
- Dev processes were stopped after manual verification; ports `9001` and `9002` had no remaining `Listen` entries.
- Follow-up UI fix: story-line and chapter-preparation panels now clamp form controls to the panel content width with explicit `min/max-inline-size`; Chrome DevTools confirmed the `Добавить линию` controls stay inside the 400px side panel at 1366px with no horizontal overflow and a clean console.
