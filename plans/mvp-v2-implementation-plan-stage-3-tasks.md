# План реализации MVP v2 - stage 3 Старт истории

Дата: 2026-05-08
Ветка: `v2`
Область: backend Start Story API/service, project creation from AI analysis, initial memory/story lines persistence, frontend Start Story route.
Источник: `plans/mvp-v2-implementation-plan.md`, раздел "Этап 3. Старт истории".

## Цель этапа

Реализовать первый творческий путь пользователя: от свободной идеи без знания финала до созданного проекта со стартовой памятью, мягкими линиями истории, правилами расширения мира и выбранной стартовой точкой для первой интерактивной главы.

Этап должен использовать AI action layer из stage 2 и runtime schema из stage 1. Без доступного AI Start Story не должен создавать проект, черновик проекта, память или линии и должен вести пользователя к настройке AI.

## Текущее состояние

- Репозиторий находится на ветке `v2`, рабочее дерево перед началом этапа чистое.
- Stage 1 уже создал v2-таблицы `projects`, `memory_items`, `story_lines`, `chapters` и базовый `story_runtime_store`.
- Stage 2 уже создал AI action layer с действиями `analyze_synopsis`, `extract_story_memory`, `suggest_story_lines`, `suggest_start_points` и structured output validation/repair.
- Backend пока имеет только общий CRUD `POST /api/projects`, который guard-ится read-only режимом, но не является v2 Start Story flow.
- `POST /api/projects/setup/analyze` и старые setup/workspace endpoints удалены из active scope и должны оставаться неиспользуемыми.
- Frontend route `/projects/create` сейчас показывает skeleton старого создания проекта и не вызывает актуальные v2 endpoints.
- В концептуальной data model нет отдельной canonical сущности `start_points`; выбранную стартовую точку stage 3 сохранит как первую planned-главу, а не как новую таблицу.

## Рабочие решения

- Добавить backend service `start_story`, который запускает четыре AI action: анализ синопсиса, извлечение памяти, предложение линий и предложение стартовых точек.
- Считать результат анализа transient до подтверждения: не сохранять start draft в SQLite на этом этапе.
- Не делать ручной creative fallback. Если AI action не вернул валидный structured output и repair не помог, endpoint возвращает ошибку.
- Подтверждение Start Story создает проект через v2 `project_store`, затем сохраняет выбранные non-rejected memory items и story lines через `story_runtime_store`.
- Статусы `rejected` в форме подтверждения не сохранять как runtime-сущности; это локальное решение пользователя до создания проекта.
- Выбранную стартовую точку сохранять как первую `chapters` запись со статусом `planned`; если пользователь явно пропускает стартовую точку, главу не создавать.
- Правила расширения мира сохранить в `projects.expansion_policy` как строковый режим MVP: `draft`, `ask`, `request`, `mixed`.
- Новые endpoints добавить под API scope: `POST /api/projects/start/analyze` и `POST /api/projects/start/confirm`.
- Старый skeleton `/projects/create` заменить на реальный Start Story экран с локальным draft state, редактируемыми предложениями, выбором expansion policy и выбором/пропуском стартовой точки.
- Workspace на этом этапе показать как минимальный v2 обзор проекта с синопсисом и следующим шагом; полноценные память/канон/линии остаются stage 4/5.

## Задачи

- [x] Добавить backend Pydantic-модели Start Story request/response/confirm payload.
- [x] Реализовать backend service для `analyze`: последовательный запуск `analyze_synopsis`, `extract_story_memory`, `suggest_story_lines`, `suggest_start_points` через existing AI action layer.
- [x] Реализовать backend service для `confirm`: проверка AI availability, создание project, сохранение стартовой памяти, линий и optional planned chapter из выбранной стартовой точки.
- [x] Подключить `POST /api/projects/start/analyze` и `POST /api/projects/start/confirm` перед dynamic `/{project_id}` routes.
- [x] Добавить backend tests для успешного analysis flow, успешного confirm flow и read-only блокировок без AI.
- [x] Обновить frontend project entity types/API/mutations под Start Story endpoints.
- [x] Заменить `/projects/create` skeleton на desktop Start Story UI: ввод идеи, AI-анализ, редактирование memory/line/start-point candidates, expansion policy, confirm.
- [x] Обновить frontend error parsing для object-shaped FastAPI `detail.message`, чтобы read-only/API errors были человеческими.
- [x] Добавить frontend tests для Start Story API helpers/error parsing или smoke-level модели, не раздувая UI тесты.
- [x] Обновить Projects header wording с "Создать проект" на "Начать историю".
- [x] Обновить минимальный Project workspace overview после создания проекта.
- [x] Запустить backend checks: `uv run pytest`, `uv run ruff check .`.
- [x] Запустить frontend checks: `pnpm test`, `pnpm lint`, `pnpm build`.
- [x] Запустить `scripts/dev.ps1`, вручную проверить Start Story UI в Chrome DevTools на 1366px и wide viewport, console/network; read-only блокировка покрыта backend tests, потому что локальный dev использовал уже настроенный LM Studio provider.

## Acceptance

- Пользователь может открыть `/projects/create`, ввести короткую идею, необязательное название/тон/ограничения/роль и запустить AI-анализ.
- Без доступного AI экран блокирует Start Story action и ведет к настройкам провайдера; backend endpoints также возвращают read-only ошибку.
- AI-анализ возвращает понятный пересказ, вопросы/предупреждения, стартовые memory candidates, story line candidates и start point candidates.
- Пользователь может отредактировать предложения, отклонить лишние элементы, выбрать режим expansion policy и выбрать стартовую точку или явно пропустить ее.
- Confirm создает v2 project, сохраняет synopsis, active provider/model, expansion policy, стартовую память и стартовые линии.
- Если выбрана стартовая точка, confirm создает первую planned-главу на основе этой точки.
- После создания пользователь попадает в project workspace и видит понятный следующий шаг к первой интерактивной главе.
- Старые v1 setup endpoints не возвращаются.
- Художественный текст не сохраняется как HTML/rich text/editor state; debug/AI request logs не пишутся в SQLite.

## Критический анализ

- Stage 3 зависит от качества generic prompts stage 2. Если structured output слишком пустой, нельзя заполнять story data вручную; допустимо показать пустые секции и дать пользователю отредактировать после успешного AI-анализа.
- Start points отсутствуют в conceptual data model. Новая таблица сейчас была бы scope creep; planned chapter лучше соответствует будущему переходу к подготовке первой главы.
- Frontend может легко вырасти в полноценный multi-page wizard. Для stage 3 лучше сделать один рабочий desktop route с шагами внутри, оставив отдельные Memory/Lines screens будущим этапам.
- Confirm не должен перепроверять анализ повторным AI-запросом: пользователь уже подтверждает отредактированный structured result. Но он обязан проверить, что AI provider/model все еще доступны.
- Добавление ручного custom start point возможно только после AI-анализа и при доступном AI как часть подтверждения, не как fallback без модели.
- Manual browser verification может быть ограничена отсутствием реального локального AI. Нужно минимум проверить read-only блокировку, layout, console/network и backend contract tests с mocked adapter.

## Риски и проверки

- Риск provider drift между analyze и confirm: confirm должен принимать provider/model reference из analysis и проверять их доступность.
- Риск route shadowing: `/api/projects/start/*` нужно зарегистрировать до `/{project_id}`.
- Риск утечки старого setup flow: frontend `/projects/create` не должен вызывать `/api/projects/setup/*`.
- Риск сохранения rejected candidates: confirm должен пропускать rejected элементы.
- Риск нечитабельной UI формы: проверить на 1366px и wider desktop, особенно длинные названия/summary в карточках.
- Риск тестовой нестабильности от реального AI: backend tests должны monkeypatch provider adapter и не ходить в сеть.

## Verification notes

- `backend`: `uv run pytest tests\test_start_story.py` - 3 passed.
- `backend`: `uv run pytest` - 39 passed.
- `backend`: `uv run ruff check .` - passed.
- `frontend`: `pnpm test` - 6 files / 17 tests passed.
- `frontend`: `pnpm lint` - passed with existing warning in `frontend/src/shared/testing/query-client.tsx` (`react-refresh/only-export-components`).
- `frontend`: `pnpm build` - passed.
- Dev launcher: `scripts/dev.ps1` started backend `http://127.0.0.1:9001` and frontend `http://127.0.0.1:9002`.
- Chrome DevTools: opened `/projects/create`, checked Start Story layout at 1366px and 1600px, fixed a 1366px horizontal-scroll issue and missing form field names, then reloaded and confirmed console had no errors.
- Chrome DevTools: opened `/projects`, verified the CTA text is `Начать историю` and `/api/projects` + `/api/runtime/status` returned 200.
- Chrome DevTools: submitted a real `/api/projects/start/analyze` request against the locally configured LM Studio provider; the provider request did not complete within the manual QA window, so successful AI output handling is covered by mocked backend tests instead of a real local model run.
- Dev processes were stopped after manual verification; ports `9001` and `9002` had no remaining `Listen` entries.
