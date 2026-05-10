# План реализации MVP v2 - stage 8 Markdown-редактор и локальные AI-помощники

Дата: 2026-05-10
Ветка: `v2`
Область: frontend markdown editor layer, CodeMirror 6 integration, editor gateway, chapter editor route, local AI assistant preview/accept flow, narrow backend draft assist/editor context extensions.
Источник: `plans/mvp-v2-implementation-plan.md`, раздел "Этап 8. Markdown-редактор и локальные AI-помощники".

## Цель этапа

Дать пользователю рабочий редактор главы после сборки черновика: markdown остается единственным источником правды, текст редактируется через `OrynvaeMarkdownEditor` на CodeMirror 6, а локальные AI-помощники работают с выделением, текущим черновиком и контекстом проекта только через контролируемый editor gateway.

Stage 8 продолжает Stage 7: сессия уже может быть собрана в `draft_versions.markdown`, текущий markdown зеркалится в `chapters.draft_markdown`, есть разбор после главы и прогноз. Теперь нужно заменить простую textarea-поверхность на целевой редакторный слой, убрать legacy/fallback поведение и сделать AI-правки не прямой мутацией текста, а preview/accept flow.

## Текущее состояние

- Репозиторий находится на ветке `v2`; новую ветку для Stage 8 не создаем по запросу пользователя.
- Parent plan определяет результат Stage 8 как: `OrynvaeMarkdownEditor` поверх CodeMirror 6, markdown source of truth, editor gateway для агентных операций, preview/accept flow для AI-помощников и read-only editor без AI.
- `frontend/AGENTS.md` применим к этому этапу: desktop-only MVP, минимальный viewport `1980x1024`, две колонки по умолчанию 50% / 50%, после frontend-изменений обязательна ручная Chrome DevTools проверка.
- `frontend/package.json` пока не содержит CodeMirror 6 packages. Есть `react-markdown`, `lucide-react`, React Query, Zustand, Vite/Vitest/Testing Library.
- Stage 7 добавил:
  - `frontend/src/pages/projects/draft-assembly/DraftAssemblyRoute.tsx`;
  - `frontend/src/entities/draft`;
  - `frontend/src/entities/chapter-review`;
  - `frontend/src/entities/forecast`;
  - backend `backend/app/models/stage7.py` и `backend/app/services/stage7.py`.
- `DraftAssemblyRoute` сейчас использует обычный `<textarea>` для markdown, `ReactMarkdown` preview и ручное поле `selectionMarkdown` для AI-правки фрагмента. Это допустимый Stage 7 bridge, но не целевой Stage 8 editor.
- `frontend/src/features/edit-chapter/ui/ChapterEditorPanel.tsx` является legacy/v1-поверхностью:
  - использует `entities/project` chapter editor contracts, которых нет в v2 flow как source of truth;
  - содержит wording и поведение `Fallback editor`;
  - выбирает provider/model локально вместо проектного `ProjectAgentSettingsCard`;
  - работает с chapters/scenes как с локальным nested editor state, а не с `draft_versions.markdown`;
  - не должен становиться canonical Stage 8 редактором без полной переработки.
- Frontend route map содержит draft/review/forecast routes, но отдельного chapter editor route еще нет.
- Backend уже имеет project AI agent `draft_fragment_editor`; `edit_markdown_fragment` мапится на этот agent через `ACTION_AGENT_KEYS`, preset temperature `0.55`.
- Backend endpoint `POST /api/projects/{project_id}/chapters/{chapter_id}/draft/assist` возвращает preview replacement через `EditMarkdownFragmentOutput`, но текущий request принимает только `selection_markdown` и `instructions`.
- Текущий draft assist backend берет latest persisted draft/chapter markdown из БД. Для настоящего редактора это недостаточно: AI-помощник должен видеть текущий unsaved markdown из CodeMirror, иначе preview может строиться на устаревшей версии.
- `draft_versions` и `chapters.draft_markdown` уже покрывают markdown storage. Нет durable operation log для editor suggestions; если Stage 8 добавляет persistent metadata, она должна быть узкой и не превращаться в debug/AI-request log.
- Product docs требуют, чтобы без доступного AI редактор открывался только для чтения: selection/copy разрешены, любые markdown mutations и agent actions заблокированы.
- Официальные ориентиры CodeMirror подтверждают выбранную модель: CodeMirror 6 модульный, состояние immutable, изменения проходят через transactions/dispatch, DOM редактора не надо менять напрямую; transaction annotations/effects/decorations подходят для gateway metadata and suggestions.

## Рабочие решения

- Продолжаем в текущей ветке `v2`; branch creation intentionally skipped.
- Stage 8 includes:
  - CodeMirror 6 dependency installation;
  - new v2 `OrynvaeMarkdownEditor`;
  - typed `OrynvaeEditorGateway`;
  - CodeMirror extensions for markdown, read-only lock, selection snapshots, suggestion decorations and agent transaction metadata;
  - chapter editor route that opens current chapter draft markdown;
  - local AI assistant panel/actions for selection and current draft;
  - preview/accept/reject flow where AI output does not mutate markdown until accepted;
  - save flow that persists accepted/editor changes as markdown only;
  - route links from Stage 7 draft/review surfaces into the editor;
  - automated tests and manual Chrome DevTools QA.
- Stage 8 does not include:
  - WYSIWYG/prose mode;
  - MDXEditor, Milkdown, ProseMirror/Lexical replacement;
  - HTML, rich text JSON or editor state as persisted artistic text;
  - collaborative editing/Y.js;
  - export to `.docx`, `.pdf` or `.md`;
  - semantic search/embeddings;
  - automatic canon/memory/story-line changes from editor AI;
  - manual creative fallback when AI is unavailable.
- Install the baseline CodeMirror packages from `docs/technical-stack-v2.md`:
  - `codemirror`;
  - `@codemirror/state`;
  - `@codemirror/view`;
  - `@codemirror/commands`;
  - `@codemirror/lang-markdown`;
  - `@codemirror/language-data`.
- Add extra CodeMirror packages only when a concrete implementation need appears. For example, `@codemirror/search` is acceptable if the editor adds find/search controls, but it is not required for the first Stage 8 slice.
- Prefer a v2 rewrite of `features/edit-chapter` over adapting the legacy `ChapterEditorPanel` in place. The old component can remain unused during the transition, but no new route should depend on its fallback model.
- Suggested frontend ownership:
  - `frontend/src/features/edit-chapter/ui/OrynvaeMarkdownEditor.tsx`;
  - `frontend/src/features/edit-chapter/model/editor-gateway.ts`;
  - `frontend/src/features/edit-chapter/model/editor-suggestions.ts`;
  - `frontend/src/features/edit-chapter/model/chapter-editor-store.ts` rewritten for v2 editor state;
  - `frontend/src/pages/projects/chapter-editor/ChapterEditorRoute.tsx`;
  - colocated CSS and tests.
- `OrynvaeMarkdownEditor` should be reusable inside the chapter editor route and, if useful, later inside draft assembly. Stage 8 must not force `DraftAssemblyRoute` to become the whole editor; the assembly page can keep its role as source/log + assemble surface.
- Add route:
  - `/projects/:projectId/chapters/:chapterId/editor`.
- Update navigation:
  - draft assembly opens editor after draft exists;
  - chapter review can link back to editor;
  - chapters/workspace next-step cards can surface editor when a draft exists and review is not complete.
- Editor layout should be a working tool, not a landing page:
  - top bar: chapter title, status, last save time, linked session, active model/provider state, save, reassemble/link to draft assembly, go to review;
  - main area: 50% markdown editor / 50% context and assistant panels unless an existing local pattern strongly supports a different split;
  - context panel: key events, related story lines, important memory facts, canon warnings, active suggestions;
  - no UI card nested inside another card.
- Read-only behavior:
  - use both `EditorState.readOnly` and `EditorView.editable` via a CodeMirror compartment;
  - keep selection/copy available;
  - block keyboard/editing commands that change document;
  - disable save and AI actions;
  - show a clear path to AI settings;
  - backend still blocks creative mutations through `runtime_status.require_creative_write`.
- Gateway must be the only path for agent/editor operations:
  - UI and assistant code should call gateway methods, not CodeMirror DOM internals;
  - accepted AI suggestions should dispatch one transaction with metadata;
  - direct DOM edits or string replacement outside the editor state are out of bounds.
- Suggested gateway shape:

```ts
interface OrynvaeEditorGateway {
  getMarkdown(): string;
  getSelection(): EditorSelectionSnapshot;
  replaceRange(input: ReplaceRangeInput): void;
  insertAtCursor(input: InsertTextInput): void;
  applyAgentSuggestion(input: AgentSuggestionInput): void;
  showInlineSuggestion(input: InlineSuggestionInput): void;
  clearInlineSuggestion(id: string): void;
  decorateRange(input: RangeDecorationInput): void;
  setReadOnly(input: ReadOnlyInput): void;
}
```

- Selection snapshots should store offsets and markdown text, not DOM nodes:
  - `from`;
  - `to`;
  - `text`;
  - `isEmpty`;
  - optional line/column display data.
- Agent metadata should be modeled explicitly in frontend:
  - `projectId`;
  - `chapterId`;
  - `sessionId`;
  - `draftVersionId`;
  - `agentActionType`;
  - `sourceTurnIds`;
  - `relatedMemoryItemIds`;
  - `relatedStoryLineIds`;
  - `createdAt`.
- Minimum metadata implementation for MVP can be CodeMirror transaction annotations plus request/response payload metadata. Add durable DB storage only if implementation needs to show suggestion history after reload. If durable storage is added, use a narrow editor suggestion/operation table and never store raw prompt/response/debug payloads in SQLite.
- Local AI assistant actions should be fixed, contextual commands rather than one generic chat:
  - selection: rewrite simpler, rewrite more expressive, strengthen conflict, strengthen emotion, improve dialogue, add atmosphere, shorten, explain weakness, suggest 3 variants;
  - document: improve rhythm, shorten, expand, check coherence, suggest title;
  - every action returns a preview, notes/warnings, or variants before user acceptance.
- The first implementation slice can prioritize selection actions plus one document action. Do not build a broad chat box to compensate.
- `DraftAssistRequest` likely needs extension:
  - `scope: "selection" | "document"`;
  - `action_key`;
  - `selection_range`;
  - `selection_markdown`;
  - `draft_markdown` for current unsaved editor text;
  - `source_draft_version_id`;
  - optional related ids from the side panel.
- The backend should validate current markdown length and selection bounds when ranges are provided. If `draft_markdown` is passed, it is context for AI only and must not be persisted unless the user saves.
- AI preview flow:
  1. User selects text or chooses a document action.
  2. Frontend captures gateway selection/current markdown.
  3. Backend runs `edit_markdown_fragment` through `project_ai_settings.execute_project_action`.
  4. Frontend shows replacement/variants in a preview panel or inline decoration.
  5. User accepts one suggestion, edits the preview, or rejects it.
  6. Only accept dispatches a CodeMirror transaction.
  7. Save persists the resulting markdown through the draft save endpoint.
- Avoid streaming directly into markdown in Stage 8. If streaming is added, collect into a provisional buffer or preview panel and apply a single accepted transaction after completion.
- Markdown preview may render via `react-markdown`, but HTML remains render output only and never storage.
- Saving should create/update markdown through existing draft flow:
  - preserve `draft_versions.markdown`;
  - update `chapters.draft_markdown`;
  - mark status as `edited` unless user explicitly accepts/finishes;
  - keep relation to source session/draft version when available.
- Do not silently mark editor changes as review/canon changes. New facts still go through Stage 7 review/memory proposal decisions.
- Error handling:
  - AI action failure must not lose text;
  - failed save leaves dirty state visible;
  - stale draft/version conflicts can be handled conservatively by keeping local text and asking user to save as a new version, not by overwriting invisibly.

## Задачи

- [ ] Install CodeMirror 6 packages in `frontend/package.json` and update `frontend/pnpm-lock.yaml`:
  - [ ] `codemirror`;
  - [ ] `@codemirror/state`;
  - [ ] `@codemirror/view`;
  - [ ] `@codemirror/commands`;
  - [ ] `@codemirror/lang-markdown`;
  - [ ] `@codemirror/language-data`.
- [ ] Remove or isolate legacy Stage 0/v1 editor assumptions:
  - [ ] audit `frontend/src/features/edit-chapter`;
  - [ ] stop using `ChapterEditorPanel` for v2 routes;
  - [ ] remove `Fallback editor` wording from any v2-visible path;
  - [ ] keep old code only if it is unreachable and does not affect build/tests, or replace it with the v2 public API.
- [ ] Add `OrynvaeMarkdownEditor` component:
  - [ ] create/destroy `EditorView` safely in React lifecycle;
  - [ ] initialize from markdown string;
  - [ ] emit `onChange(markdown)` from CodeMirror update listener;
  - [ ] reinitialize or dispatch controlled updates when loading a different draft/chapter;
  - [ ] use `basicSetup` plus `markdown()` language support;
  - [ ] use line wrapping and editor theme consistent with existing app tokens;
  - [ ] expose gateway through `onGatewayReady`;
  - [ ] clean up `EditorView.destroy()` on unmount.
- [ ] Implement typed editor gateway:
  - [ ] `getMarkdown`;
  - [ ] `getSelection`;
  - [ ] `replaceRange`;
  - [ ] `insertAtCursor`;
  - [ ] `applyAgentSuggestion`;
  - [ ] `showInlineSuggestion`;
  - [ ] `clearInlineSuggestion`;
  - [ ] `decorateRange`;
  - [ ] `setReadOnly`.
- [ ] Implement gateway data types:
  - [ ] `EditorSelectionSnapshot`;
  - [ ] `ReplaceRangeInput`;
  - [ ] `InsertTextInput`;
  - [ ] `AgentSuggestionInput`;
  - [ ] `InlineSuggestionInput`;
  - [ ] `RangeDecorationInput`;
  - [ ] `ReadOnlyInput`;
  - [ ] `EditorAgentMetadata`.
- [ ] Add CodeMirror transaction metadata support:
  - [ ] transaction annotation for accepted agent operations;
  - [ ] user-event annotation or equivalent grouping for normal typing/save-related changes;
  - [ ] tests proving accepted suggestion applies one transaction and preserves undo behavior as far as jsdom allows.
- [ ] Add suggestion/decorations extension:
  - [ ] state field or view plugin for active preview ranges;
  - [ ] highlighted replacement range;
  - [ ] ghost/inline suggestion where practical;
  - [ ] clear decorations on reject, accept, document reload or read-only switch.
- [ ] Add read-only extension/config:
  - [ ] compartment for `EditorState.readOnly`;
  - [ ] compartment for `EditorView.editable`;
  - [ ] commands/buttons disabled from route state;
  - [ ] tests proving typing/change dispatch does not mutate markdown in read-only mode.
- [ ] Build v2 editor store in `features/edit-chapter`:
  - [ ] current markdown;
  - [ ] dirty flag;
  - [ ] selected draft version;
  - [ ] active selection snapshot;
  - [ ] active assistant action;
  - [ ] active suggestion/preview;
  - [ ] save/error/loading state;
  - [ ] reset on project/chapter change.
- [ ] Add backend models for Stage 8 editor assist or extend `backend/app/models/stage7.py` carefully:
  - [ ] assistant action key;
  - [ ] scope `selection`/`document`;
  - [ ] current `draft_markdown`;
  - [ ] selection range;
  - [ ] source draft version id;
  - [ ] source turn ids;
  - [ ] related memory item ids;
  - [ ] related story line ids;
  - [ ] response variants/notes/warnings where needed.
- [ ] Update backend draft assist service:
  - [ ] use passed current markdown as AI context without persisting it;
  - [ ] validate selection belongs to current markdown when range is provided;
  - [ ] include chapter, session, turns, key events, memory and story lines in AI context;
  - [ ] map fixed assistant action keys to clear instructions;
  - [ ] return preview data only, never apply text server-side;
  - [ ] keep `runtime_status.require_creative_write(project_id)`.
- [ ] Decide whether persistent editor operation metadata is required for Stage 8:
  - [ ] if no durable history is needed, keep metadata in transaction annotations/request context and record this decision in verification notes;
  - [ ] if durable history is needed, add a narrow migration such as `editor_suggestions` or `draft_editor_operations`;
  - [ ] ensure any durable table stores only operation metadata and accepted/rejected suggestion text needed for product behavior, not raw prompts/responses/debug logs.
- [ ] Add or extend frontend draft API helpers:
  - [ ] request current markdown in assist payload;
  - [ ] selection/document action keys;
  - [ ] response variants/notes;
  - [ ] tests for request URLs and payload shape.
- [ ] Add `ChapterEditorRoute`:
  - [ ] route component wrapper in `frontend/src/app/routes/route-components.tsx`;
  - [ ] router entry `/projects/:projectId/chapters/:chapterId/editor`;
  - [ ] load workspace summary/runtime status;
  - [ ] load chapter and latest draft versions;
  - [ ] load linked session/log/key events when `chapter.session_id` exists;
  - [ ] load memory/story line context needed for the side panel;
  - [ ] render top bar with chapter title, status, last saved, linked session and active model/provider state;
  - [ ] render `OrynvaeMarkdownEditor` and context/assistant panel.
- [ ] Build editor side/context panel:
  - [ ] key events with status labels `in text`, `missing`, `changed`, `excluded` where data allows;
  - [ ] active/related story lines;
  - [ ] important memory facts;
  - [ ] canon warnings/review notes when available;
  - [ ] active AI suggestion preview;
  - [ ] no automatic canon changes.
- [ ] Build local AI assistant controls:
  - [ ] selection action menu enabled only when selection exists;
  - [ ] document action menu for whole-draft actions;
  - [ ] `ProjectAgentSettingsCard` for `draft_fragment_editor`;
  - [ ] preview panel with original/replacement/notes/warnings;
  - [ ] accept, edit preview, reject;
  - [ ] variant chooser for "suggest 3 variants";
  - [ ] all actions disabled/read-only when AI unavailable.
- [ ] Implement save flow:
  - [ ] save current gateway markdown via draft update endpoint;
  - [ ] create/update draft version as Stage 7 service currently does;
  - [ ] update dirty state after successful save;
  - [ ] keep unsaved text on failure;
  - [ ] warn before navigation with unsaved changes.
- [ ] Implement review navigation flow:
  - [ ] editor top bar links to draft assembly/reassemble route;
  - [ ] editor top bar links to chapter review route;
  - [ ] draft assembly links to editor after draft exists;
  - [ ] review route links back to editor;
  - [ ] workspace/chapters cards surface editor when chapter has draft markdown and is not completed.
- [ ] Ensure markdown-only storage:
  - [ ] no HTML/rich text/editor state persisted;
  - [ ] markdown preview uses render output only;
  - [ ] AI request/response raw payloads are not persisted in SQLite;
  - [ ] debug details remain sanitized JSONL-only when debug is enabled.
- [ ] Add frontend tests:
  - [ ] `OrynvaeMarkdownEditor` renders initial markdown;
  - [ ] editor emits markdown changes when editable;
  - [ ] read-only mode blocks edits and disables toolbar/actions;
  - [ ] gateway `getSelection` returns markdown offsets/text;
  - [ ] gateway `replaceRange` applies exact markdown range;
  - [ ] `showInlineSuggestion`/`clearInlineSuggestion` update decorations;
  - [ ] `applyAgentSuggestion` applies one accepted replacement and clears preview;
  - [ ] chapter editor route loads existing draft markdown;
  - [ ] unsaved local markdown is sent to assist request;
  - [ ] assist preview does not apply automatically;
  - [ ] accept preview changes local editor only until save;
  - [ ] save calls draft update endpoint and clears dirty flag;
  - [ ] read-only route renders existing draft and blocks save/assist.
- [ ] Add backend tests:
  - [ ] extended draft assist uses request `draft_markdown` context when provided;
  - [ ] selection range validation rejects mismatched ranges;
  - [ ] assist remains blocked without AI;
  - [ ] assist does not persist markdown before accept/save;
  - [ ] draft save remains blocked without AI;
  - [ ] no debug/AI request logs or raw prompts/responses are stored in SQLite;
  - [ ] optional persistent editor metadata migration, if added, is idempotent and project-scoped.
- [ ] Run backend checks:
  - [ ] targeted Stage 8 backend tests;
  - [ ] `uv run pytest`;
  - [ ] `uv run ruff check .`.
- [ ] Run frontend checks:
  - [ ] targeted editor/gateway tests;
  - [ ] `pnpm run test`;
  - [ ] `pnpm run lint`;
  - [ ] `pnpm run build`.
- [x] Run local dev launcher (`scripts/dev.ps1`) and manually verify in Chrome DevTools:
  - [x] open a project with an existing Stage 7 draft;
  - [x] open `/projects/:projectId/chapters/:chapterId/editor`;
  - [x] verify CodeMirror editor renders markdown and preserves line breaks;
  - [x] select a fragment and run an AI assistant action;
  - [x] verify network payload includes current markdown and selection;
  - [x] verify preview appears without mutating markdown;
  - [x] accept suggestion and save;
  - [x] reject a suggestion and confirm text does not change;
  - [x] run a document action and verify preview/accept behavior;
  - [x] check layout at `1980x1024` and wider desktop;
  - [x] inspect console and network for errors.
  - [x] verify read-only behavior with AI unavailable through automated route/backend tests;
  - [x] verify persisted save behavior through automated frontend/backend tests;
  - [x] verify editor/review navigation links render and point to the correct routes.
- [ ] Update this task file during implementation with completed checklist items, verification notes, deviations and intentionally deferred post-MVP editor work.

## Статус выполнения

- [x] CodeMirror 6 packages installed in `frontend/package.json` and `frontend/pnpm-lock.yaml`: `codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/language-data`.
- [x] Legacy `ChapterEditorPanel` is not used by the v2 editor route; the new route uses draft/chapter markdown and project-level assistant settings instead of local provider/model fallback.
- [x] Added `OrynvaeMarkdownEditor` based on CodeMirror 6 with markdown mode, line wrapping, app-token styling, lifecycle cleanup and `onGatewayReady`.
- [x] Added typed editor gateway with markdown reads, selection snapshots, range replacement, cursor insert, suggestion apply, inline/decorated ranges and read-only controls.
- [x] Added CodeMirror transaction metadata annotation and a suggestion decoration state field.
- [x] Added v2 editor Zustand store for current markdown, dirty state, selection and active preview.
- [x] Extended draft assist models/API types with scope, action key, current editor markdown, selection range, source draft version and related context ids.
- [x] Backend draft assist now uses passed current editor markdown as AI context, validates selection ranges and never persists the unsaved markdown during preview.
- [x] Persistent editor operation history was intentionally not added. Stage 8 keeps metadata in frontend transaction/request context; durable history can be revisited when the UI needs reloadable suggestion history.
- [x] Added `/projects/:projectId/chapters/:chapterId/editor` route and router wrapper.
- [x] Chapter editor route loads workspace runtime, chapter, draft versions, linked session/key events, memory and story lines.
- [x] Editor route renders top bar, CodeMirror markdown surface, context panel, `draft_fragment_editor` settings and local AI assistant controls.
- [x] AI assistant flow sends current markdown and selection/document range, shows preview, supports editing preview text, and applies only after explicit accept.
- [x] Save flow persists markdown through the existing draft update endpoint and keeps dirty state if save fails.
- [x] Navigation added from draft assembly, chapter review and chapter cards into the editor.
- [x] Markdown-only invariant preserved: no HTML/rich text/editor state/debug payloads are persisted.
- [x] Frontend tests added for `OrynvaeMarkdownEditor` gateway/read-only/decorations and `ChapterEditorRoute` assist/read-only behavior.
- [x] Backend tests added for current editor markdown context, selection range validation and non-persistence before save.
- [x] Frontend lint also required small cleanup in project AI settings and narrator session draft state to satisfy current React hooks rules.
- [x] Manual Chrome DevTools QA completed with the local dev launcher and Chrome DevTools.
- [x] Dev server processes opened for QA were stopped after verification; ports `9001` and `9002` were clear afterward.

## Отклонения от исходной декомпозиции

- `@codemirror/language-data` is installed as planned, but the editor does not load the full language-data bundle at runtime. Loading all code languages created a much larger Vite output for little MVP value.
- `editor-suggestions.ts` was not split into a separate file; suggestion state lives with the gateway because the first MVP decoration layer is small.
- No durable `editor_suggestions`/`draft_editor_operations` migration was added. Current product behavior does not require suggestion history after reload, and avoiding a new table reduces risk of accidentally storing raw AI/debug payloads.
- `DraftAssemblyRoute` still uses its Stage 7 textarea for assembly. The new CodeMirror editor is the canonical chapter editing route after a draft exists.
- Whole-document AI actions are implemented as bounded preview/accept actions using the same draft assist endpoint, not as a broad chat/copilot.

## Acceptance

- `OrynvaeMarkdownEditor` is built on CodeMirror 6 and is used by the v2 chapter editor flow.
- Markdown remains the only persisted artistic text format.
- The editor opens the latest chapter draft markdown and preserves paragraphs/line breaks.
- User can edit markdown and save it when AI is available.
- Save persists through existing chapter/draft markdown storage and survives refresh/restart.
- Without available AI, the editor opens existing markdown read-only; selection/copy remain available, but text changes, save and assistant actions are blocked.
- AI assistant actions are contextual buttons/panels, not a generic all-purpose chat.
- Selection assistant uses the actual CodeMirror selection, not a manually copied text field.
- Assistant requests include current editor markdown, so unsaved text is not ignored during preview generation.
- AI output is shown through preview/accept/reject; it does not mutate markdown automatically.
- Accepting an AI suggestion applies a controlled editor transaction through the gateway.
- Rejecting/clearing a suggestion leaves markdown unchanged.
- Gateway methods are typed and covered by focused tests.
- Agent/editor metadata is represented explicitly in transactions/request context, or persisted through a narrow product table if durable history is implemented.
- No AI suggestion changes memory, story lines or canon without the existing review/decision flows.
- No manual creative fallback workflow is introduced.
- No HTML, rich text JSON, editor-specific state, raw prompts, raw provider responses, AI request logs or frontend debug entries are stored in SQLite.
- Stage 7 draft assembly/review/forecast routes continue to work after editor route is added.
- Frontend work is verified by automated checks plus Chrome DevTools manual QA.

## Критический анализ

- The current Stage 7 textarea was intentionally a bridge. Keeping it as the final editor would violate the technical stack decision to build `OrynvaeMarkdownEditor -> CodeMirror 6 -> Orynvae editor extensions -> agent integration layer`.
- The legacy `ChapterEditorPanel` is actively risky: it contains fallback wording and local provider/model selection, while v2 says creative editing is read-only without AI and model settings are project/agent based.
- Existing draft assist does not receive unsaved markdown. This will become a correctness bug as soon as the editor has dirty local text. Stage 8 must fix this before assistant preview can be trusted.
- CodeMirror must be treated as immutable state + transactions. Direct DOM operations, uncontrolled contenteditable hacks or external string replacement outside gateway would undermine undo/selection/decorations and make agent operations hard to test.
- Agent metadata can be overbuilt. The MVP needs metadata enough to control and test editor transactions. Durable operation history should be added only if the UI actually displays it or if product acceptance requires reloadable suggestion history.
- Whole-chapter assistant actions are tempting to expand into a chat/editor copilot. Keep Stage 8 local and bounded: fixed actions, clear input, preview output, explicit accept.
- Streaming editor insertions are attractive but risky for undo and canon. Use provisional preview buffers first; direct streaming into markdown can wait.
- Read-only mode is a product invariant, not just a disabled button style. Backend mutation tests remain mandatory.
- The editor route can easily become visually crowded. Keep it as a dense desktop tool with stable 50% / 50% layout and restrained panels.
- Browser QA may need seeded Stage 7 data and a real/available provider. If a live provider is unavailable, mocked backend tests must cover successful AI paths and manual QA should at least cover saved-data rendering, read-only mode, preview UI with mocked/seeded responses where possible.

## Риски и проверки

- Dependency risk: CodeMirror package versions must work with current Vite/React/TypeScript setup. Run install, typecheck/build and editor tests immediately after adding packages.
- State sync risk: controlled React props can fight CodeMirror internal state. Reinitialize only on document identity changes and use gateway dispatch for local changes.
- Selection risk: offsets are UTF-16 positions. Backend validation and frontend tests should use exact markdown ranges, including Cyrillic text and line breaks.
- Undo risk: accepted AI suggestions should be one transaction, not many incremental replacements.
- Dirty-state risk: accept preview changes local markdown but should not imply saved state. Save failure must keep local text.
- Context risk: assistant prompts need chapter/session/memory/line context, but should not persist prompt/response details. Tests must prove no SQLite log tables/rows are added.
- Canon risk: editor AI may surface facts, but adding them to memory remains a review decision.
- Read-only risk: frontend controls can be bypassed. Backend tests must prove save/assist are blocked without AI.
- Layout risk: CodeMirror, preview and side panels can overflow at `1980x1024`. Manual QA must check long Russian labels, long markdown lines and tall assistant previews.
- Regression risk: Stage 7 draft assembly/review routes already pass checks; update their links without changing their core behavior unless the editor component is intentionally reused there.

## Verification notes

- Plan was written after reading `AGENTS.md`, `frontend/AGENTS.md`, `plans/mvp-v2-implementation-plan.md`, Stage 7 task plan, `docs/mvp-v2/16-chapter-editor.md`, `docs/mvp-v2/10-ai-assistants.md`, `docs/technical-stack-v2.md`, API/acceptance docs, current Stage 7 frontend/backend implementation, and current editor-related files.
- Current branch during planning: `v2`.
- Working tree was clean before creating this Stage 8 task plan.
- Implementation completed in the existing `v2` branch per user request; no branch was created.
- Context7 documentation lookup for CodeMirror failed because the local token was expired. Official CodeMirror docs were checked directly instead: `https://codemirror.net/docs/guide/` and `https://codemirror.net/docs/ref/`.
- Backend verification:
  - `uv run pytest tests/test_stage7.py` passed: 6 tests.
  - Full backend run from backend root passed: `61 passed in 32.84s`.
  - Full backend ruff from backend root passed.
- Frontend verification:
  - `pnpm --dir frontend test` passed: 22 files, 59 tests.
  - `pnpm --dir frontend lint` passed with one existing warning in `frontend/src/shared/testing/query-client.tsx`.
  - `pnpm --dir frontend build` passed with the existing Vite chunk-size warning.
- Manual Chrome DevTools QA:
  - Started the local development environment through `scripts/dev.ps1`.
  - Opened `http://127.0.0.1:9002/projects`, selected seeded project `Код Бездны`, opened chapter `Синтаксис невозможного`, then opened `/projects/daf4e4d4-046c-4f73-9223-b891811f03f0/chapters/3a6031b9-6fa0-4bbd-a3b6-d144a4e41b08/editor`.
  - Verified CodeMirror renders the existing markdown draft and preserves paragraph breaks.
  - Verified the visible editor layout at `1980x1024` and `2200x1100`; the editor and side panel keep the intended desktop two-column tool layout.
  - Browser-mocked `draft/assist` and `draft` update fetch calls during QA to avoid live provider cost and avoid mutating local seed data. Backend successful assist/save behavior is covered by automated tests.
  - Ran a whole-document `Ритм` assistant action and verified the outgoing payload includes `scope: "document"`, `action_key: "improve_rhythm"`, full `draft_markdown`, full `selection_range`, `source_draft_version_id` and related story line ids.
  - Verified whole-document preview appears without mutating markdown, then accepted it, saved it, and confirmed the mocked save payload contains the accepted markdown and dirty state clears.
  - Selected text in CodeMirror with `Control+A`, verified selection assistant buttons enable, ran `Проще`, and confirmed the outgoing payload includes `scope: "selection"`, `action_key: "rewrite_simpler"`, current `draft_markdown`, exact selection markdown and `{ from: 0, to: 59 }`.
  - Rejected the selection preview and confirmed the editor text stayed unchanged.
  - Inspected console/network: no runtime console errors and no failed app requests were observed; Chrome reported a non-blocking browser autofill issue for transient form fields.
