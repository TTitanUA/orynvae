# План реализации MVP v2 - stage 4 Рабочее пространство, память и канон

Дата: 2026-05-08
Ветка: `v2`
Область: backend memory/canon API and services, project workspace aggregation, frontend project workspace and memory UI.
Источник: `plans/mvp-v2-implementation-plan.md`, раздел "Этап 4. Рабочее пространство, память и канон".

## Цель этапа

Дать пользователю рабочее пространство проекта, где видно текущее состояние истории, следующий полезный шаг, стартовую память, предложения к канону и возможные противоречия. AI может предлагать факты, изменения и предупреждения, но каноном они становятся только после явного пользовательского решения.

Этап должен продолжить Start Story flow из stage 3: созданный проект уже имеет synopsis, active provider/model, expansion policy, стартовые `memory_items`, `story_lines` и optional planned chapter. Stage 4 превращает эти данные в читаемый workspace и добавляет полноценный контур памяти: список, фильтры, редактирование, подтверждение канона, очередь предложений и мягкую проверку противоречий.

## Текущее состояние

- Репозиторий находится на ветке `v2`; рабочее дерево перед составлением плана было чистым.
- Stage 1 создал v2 runtime schema: `projects`, `memory_items`, `memory_relations`, `memory_proposals`, `story_lines`, `chapters`, sessions, turns, drafts and forecasts.
- Stage 2 создал AI action layer и уже зарегистрировал `extract_memory_updates` и `check_contradictions`.
- Stage 3 создал Start Story endpoints: `POST /api/projects/start/analyze`, `POST /api/projects/start/refine`, `POST /api/projects/start/confirm`.
- `confirm_start_story` сохраняет стартовую память как `memory_items` и пропускает rejected candidates, но не создает `memory_proposals`.
- `story_runtime_store` умеет создавать и читать `memory_items` и `memory_proposals`, но еще не поддерживает фильтры, update, status transitions, accept/reject proposal flow или conflict-related decisions.
- Backend `projects.py` пока отдает только project CRUD and Start Story. Endpoints из API scope для памяти (`/memory`, `/memory-proposals`, `/memory/check-conflicts`) еще отсутствуют.
- Frontend project workspace route сейчас минимален: загружает только `GET /api/projects/{project_id}`, показывает synopsis, raw status и статичный next step.
- Frontend project entity еще содержит legacy workspace/setup/chapter/canon types and API helpers для удаленных v1 routes (`/workspace`, `/chapter-editor`, `/canon/check`, `/projects/setup/*`). Stage 4 должен не расширять legacy flow, а заменить нужную часть v2 memory/workspace контрактами.
- По frontend rules MVP desktop-only, минимальная ширина 1366px; для видимых изменений обязательны automated checks plus browser QA через Chrome DevTools.

## Рабочие решения

- Добавить backend memory API как отдельный router, подключенный к `api_router`, с prefix внутри project scope:
  - `GET /api/projects/{project_id}/memory`;
  - `POST /api/projects/{project_id}/memory`;
  - `PATCH /api/projects/{project_id}/memory/{item_id}`;
  - `POST /api/projects/{project_id}/memory/{item_id}/status`;
  - `GET /api/projects/{project_id}/memory-proposals`;
  - `POST /api/projects/{project_id}/memory-proposals/{proposal_id}/accept`;
  - `POST /api/projects/{project_id}/memory-proposals/{proposal_id}/reject`;
  - `POST /api/projects/{project_id}/memory/check-conflicts`.
- Все creative mutating memory actions guard-ить через project-aware AI availability. Без AI разрешить только чтение проекта, памяти, предложений и workspace summary.
- Для `GET /memory` реализовать фильтры из API scope: `type`, `status`, `search`, `requires_confirmation`.
- Для memory item editing использовать существующую таблицу `memory_items`; не добавлять rich text/editor state и не сохранять HTML.
- Для `status` endpoint разрешить явные переходы к `proposed`, `draft`, `canon`, `rejected`, `outdated`; подтверждение канона должно быть отдельным пользовательским действием.
- Для proposal accept/reject обновлять `memory_proposals.status`; при accept:
  - если есть `target_item_id`, применить safe patch к существующему `memory_item`;
  - если target отсутствует, создать новый `memory_item` из `suggested_payload`;
  - поддержать accept-with-edits payload, чтобы пользователь мог изменить AI-предложение до канонизации;
  - не принимать противоречивые предложения массово без просмотра.
- Для `check-conflicts` использовать AI action `check_contradictions`, передавая confirmed/draft memory context and candidate payload. Результат показывать как предупреждения/proposals, а не как автоматическое исправление.
- Добавить project workspace read model: отдельный response, который агрегирует project, runtime status for project, memory counts, pending proposals, active story lines summary, planned/last chapter and computed next step.
- Не реализовывать полноценный Stage 5 story-lines workflow. В workspace можно показать summary активных линий из уже сохраненных данных, но создание/развитие линий остается Stage 5.
- Не реализовывать post-chapter memory update generation из sessions. Stage 4 готовит proposal decision flow; появление новых предложений после сессии полноценно придет со Stage 6/7.
- На frontend ввести v2 memory entity/slice вместо использования legacy project workspace types. TanStack Query владеет server state, Zustand только transient filters/drafts if needed.
- Workspace UI должен быть рабочим экраном, не landing/dashboard ради украшения: project header, synopsis/current state, next step CTA, memory attention block, compact memory section, contradiction warnings.

## Задачи

- [x] Добавить backend Pydantic-модели для memory list filters, memory item create/update/status payloads, proposal decision payloads, conflict-check request/response and workspace summary response.
- [x] Расширить `story_runtime_store` чтением памяти с фильтрами `type`, `status`, `search`, `requires_confirmation`.
- [x] Добавить `update_memory_item`, `update_memory_item_status`, `update_memory_proposal_status` and helper для accept-with-edits.
- [x] Добавить безопасное применение proposal payload к `memory_items`: только разрешенные поля (`type`, `title`, `summary`, `body`, `status`, `source_type`, `source_id`, `importance`), без произвольной записи JSON в columns.
- [x] Добавить project existence checks для memory endpoints; отсутствующий/архивный project должен давать 404.
- [x] Реализовать `GET /api/projects/{project_id}/memory` с фильтрами и stable ordering.
- [x] Реализовать `POST /api/projects/{project_id}/memory` с read-only guard and source metadata.
- [x] Реализовать `PATCH /api/projects/{project_id}/memory/{item_id}` с read-only guard.
- [x] Реализовать `POST /api/projects/{project_id}/memory/{item_id}/status` с read-only guard and explicit status transition.
- [x] Реализовать `GET /api/projects/{project_id}/memory-proposals` для pending and historical proposals.
- [x] Реализовать proposal accept/reject endpoints, включая accept-with-edits and target-missing creation path.
- [x] Реализовать `POST /api/projects/{project_id}/memory/check-conflicts` через `ai_service.execute_action(action_type="check_contradictions")`, используя project synopsis, canonical/draft memory and submitted candidate context.
- [x] Сохранить contradiction result as warnings only: endpoint возвращает soft warnings и не меняет канон автоматически.
- [x] Добавить backend workspace read endpoint `GET /api/projects/{project_id}/workspace-summary`, чтобы frontend не собирал overview десятком запросов.
- [x] В workspace summary вычислить next step conservatively: no AI -> `Настроить AI`, planned chapter -> `Подготовить первую главу`, pending memory proposals -> `Проверить память`, otherwise `Продолжить историю`.
- [x] Добавить backend tests для memory list filters, create/update/status transitions, proposal accept/reject, check-conflicts mocked AI action and read-only блокировок.
- [x] Добавить backend tests, что read-only mode still allows `GET /project`, `GET /memory`, `GET /memory-proposals`, workspace summary but blocks memory mutation/proposal decisions/conflict check.
- [x] Обновить frontend project/memory API types and query keys под v2 endpoints.
- [x] Изолировать legacy frontend project API helpers/types для удаленных workspace/setup/canon routes: Stage 4 UI использует новую `entities/memory`, legacy helpers не расширялись.
- [x] Переработать `ProjectWorkspaceRoute` на workspace summary endpoint: header with provider/model/read-only status, synopsis, status, saving/updated metadata, expansion policy and computed CTA.
- [x] Добавить workspace block `Где мы сейчас` на основе planned/last chapter, pending memory count, active lines count and open warnings.
- [x] Добавить workspace block `Память требует внимания`: pending proposals, proposed memory items, contradiction warnings and cautious actions.
- [x] Добавить memory view/section inside project route with filters: all/type/status/search/requires_confirmation.
- [x] Реализовать memory cards with type, title, status, summary/body preview, source, updated time and actions.
- [x] Реализовать editable proposal review UI: edit suggested payload, accept as canon/draft, reject, defer через existing reject endpoint status.
- [x] Реализовать visual distinction for `proposed`, `draft`, `canon`, `rejected`, `outdated` without relying only on raw enum text.
- [x] Заблокировать mutating memory UI when runtime/project status is read-only; backend tests cover hard guard, frontend smoke test covers read-only rendering.
- [x] Добавить frontend tests for memory API helpers, query keys and smoke-level workspace/memory read-only rendering.
- [x] Оставить project list cards без counts в Stage 4: workspace summary exposes counts for the project page, but list-card aggregation would add an extra list summary endpoint and is deferred from this slice.
- [x] Запустить backend checks: `uv run pytest`, `uv run ruff check .`.
- [x] Запустить frontend checks: `pnpm test`, `pnpm lint`, `pnpm build`.
- [x] Запустить `scripts/dev.ps1` and manually verify in Chrome DevTools at 1366px and wider desktop: project workspace, memory filters, proposal/edit UI surface, console and network.
- [x] Обновить этот task-файл по факту реализации: отмечать выполненные задачи, добавить `Verification notes`, записать отклонения от плана.

## Acceptance

- Пользователь открывает проект после Start Story and sees synopsis, active provider/model, project status, expansion policy, last activity and next useful action.
- Workspace показывает memory attention state: pending proposals, proposed items, possible contradictions and links/actions to review.
- Memory items of different MVP types can be listed, searched and filtered by type/status/requires-confirmation.
- Memory statuses are visually distinct: AI proposal, draft, canon, rejected, outdated.
- User can create/edit memory only while AI is available; without AI memory is readable but all creative mutations are blocked.
- User can confirm a memory item as canon, move it to draft, reject it or mark it outdated.
- AI proposals can be edited before acceptance, accepted, rejected or deferred without silently changing canon.
- Conflict check uses AI and returns warnings; it does not auto-fix memory and does not block the workspace.
- Backend read-only guard is enforced on every memory mutation, proposal decision and conflict check.
- No manual creative fallback workflow is added for memory/canon work without AI.
- Markdown-only invariant is preserved; no artistic/canonical text is stored as HTML, rich text JSON or editor-specific state.
- Debug logs, prompt/response dumps and frontend debug entries are not stored in SQLite.
- Visible frontend behavior is verified by automated checks plus Chrome DevTools manual QA.

## Критический анализ

- Parent Stage 4 mixes workspace UX and memory/canon mechanics. To keep scope coherent, backend should expose a compact workspace summary while the deeper implementation focuses on memory/proposal/canon. Full line management remains Stage 5.
- The schema has `memory_relations`, but current store has no relation API. MVP Stage 4 can show relation fields only if they are already present in payloads; полноценный relation editor is likely scope creep unless needed for contradiction display.
- `memory_proposals.suggested_payload` is flexible JSON. This is useful for AI candidates but risky for applying edits. Accept flow must validate and whitelist fields before writing into `memory_items`.
- `check_contradictions` output currently has titles/descriptions and related memory titles, not direct item ids. Stage 4 should not pretend it has perfect linking. It can show soft warnings and optionally attach best-effort related titles.
- Stage 3 stores Start Story memory directly as `memory_items`, not proposals. Stage 4 therefore needs to treat `status="proposed"` memory items as requiring attention even when no `memory_proposals` rows exist.
- Frontend still contains v1-era project workspace/canon/chapter API helpers. Using them would reintroduce removed scope. Stage 4 should either delete them if unused or leave them clearly unused while adding v2 memory APIs.
- Browser QA may depend on having at least one local project with pending/proposed memory. If no real AI is available, seed via backend tests/dev data only for QA setup, not as a production fallback workflow.
- The `require_creative_write` dependency currently supports project_id as a parameter but route dependencies may not inject it automatically in nested project routes. Verify the actual FastAPI dependency behavior or call the guard explicitly in handlers.

## Риски и проверки

- Route ordering risk: `/api/projects/{project_id}/memory*` must not be shadowed by project dynamic routes. Prefer a dedicated router with the same `/projects/{project_id}` prefix and include order verified by tests.
- Proposal accept risk: accepting malformed `suggested_payload` could create invalid memory. Validate with Pydantic models and explicit field whitelist.
- Canon overwrite risk: editing an existing canon item from a proposal could silently erase user decisions. Require accept-with-edits payload and make status target explicit.
- Read-only risk: frontend-disabled controls are not enough; backend tests must prove blocked mutation endpoints return `READ_ONLY_WITHOUT_AI`.
- AI dependency risk: conflict checks must be mocked in tests and must fail clearly if provider output is invalid after repair.
- UX density risk: memory UI can become a giant form. Keep it as filterable cards plus focused proposal review panel.
- Layout risk: long titles, summaries and JSON-derived text must not overflow at 1366px desktop width.
- Data integrity risk: all writes should keep `updated_at` meaningful for project and memory rows where applicable.

## Verification notes

- `backend`: `uv run pytest tests\test_memory_workspace.py` - 4 passed.
- `backend`: `uv run pytest` - 45 passed.
- `backend`: `uv run ruff check .` - passed.
- `frontend`: `pnpm test` - 8 files / 23 tests passed.
- `frontend`: `pnpm lint` - passed with existing warning in `frontend/src/shared/testing/query-client.tsx` (`react-refresh/only-export-components`).
- `frontend`: `pnpm build` - passed.
- Dev launcher: `scripts/dev.ps1` started backend `http://127.0.0.1:9001` and frontend `http://127.0.0.1:9002`.
- Chrome DevTools: opened `/projects`, opened an existing project workspace, verified `workspace-summary`, `memory`, and `memory-proposals` requests returned 200.
- Chrome DevTools: checked project workspace at 1366px and 1600px; fixed vertical grid stretching in workspace cards.
- Chrome DevTools: verified memory search/filter path, including Cyrillic search for `Артем`; fixed backend SQLite search to avoid Unicode `lower()` mismatch.
- Chrome DevTools: opened memory edit mode from a memory card and verified the form was populated without layout overlap.
- Chrome DevTools: after final reload, console had no errors and current workspace network requests were 200.
- Dev processes were stopped after manual verification; ports `9001` and `9002` had no remaining `Listen` entries.
- Real local AI contradiction generation was not submitted during browser QA to avoid a long-running provider call; `check_contradictions` behavior is covered by backend tests with a mocked adapter.
- Follow-up UI fix after desktop QA: memory card body now renders as wrapping text instead of `pre`, card/header/meta content has explicit shrink constraints, medium-width memory filters reflow to two columns, and the checkbox no longer inherits full input width.
- Follow-up frontend verification: `pnpm test` - 8 files / 23 tests passed; `pnpm lint` - passed with the existing `query-client.tsx` Fast Refresh warning; `pnpm build` - passed.
- Follow-up Chrome DevTools QA: checked the memory workspace at 1366px and 1830px; no workspace overflowers were detected, edit mode opened from a memory card without layout overlap, console stayed clean, and workspace API requests returned 200/204.
- Current local dev server was already running on `http://127.0.0.1:9002`; a duplicate failed backend process from a second launcher attempt was stopped, while the existing project-local dev server was left available for manual clicking.
