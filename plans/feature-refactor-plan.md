# Frontend Feature Refactor Plan

## Context

Current frontend structure is a Vite/React SPA with:

- `src/routes` for page-level route components.
- `src/api` for direct backend request functions.
- `src/types` for shared domain types.
- `src/components/atoms`, `molecules`, `organisms`, and `templates` following atomic design.
- Existing dependencies for `@tanstack/react-query` and `zustand`.

Target architecture:

- Feature/domain-first frontend structure.
- TanStack Query owns server state: backend reads, mutations, cache, invalidation, loading, and error state.
- Zustand owns client state: UI state, drafts, selections, dirty flags, transient flow state, and preferences.
- Avoid duplicating backend snapshots in Zustand.

## Target Structure

```text
src/
  app/
    entrypoint/
    providers/
      app-providers.tsx
      query-client.ts
    routes/
      router.tsx
    styles/
  pages/
    projects/
    project-create/
    project-workspace/
    settings/
  widgets/
    app-shell/
    settings-layout/
  features/
    create-project/
    manage-providers/
    edit-project-workspace/
    edit-chapter/
    run-continuity-check/
  entities/
    project/
    provider/
    health/
    privacy-settings/
    debug-log/
  shared/
    api/
    ui/
    lib/
    config/
    assets/
```

## Phase 1: Update Frontend Agent Rules

Update `frontend/AGENTS.md`.

- Replace the current atomic-design guidance with feature/domain-first guidance.
- Define responsibilities for `app`, `pages`, `widgets`, `features`, `entities`, and `shared`.
- Require public `index.ts` files for exported slice APIs.
- Keep CSS colocated with the component or slice unless the style is global.
- State that TanStack Query is the default for backend requests and mutations.
- State that Zustand is the default for client/UI state.
- Explicitly prohibit storing backend snapshots in Zustand unless there is a documented reason.
- Preserve the existing frontend verification rules.

Note: the existing file is `frontend/AGENTS.md`, not `frontend/AGENT.md`.

## Phase 2: Introduce The App Layer

Move application wiring out of `src/App.tsx` and `src/main.tsx`.

- Create `src/app/providers/query-client.ts`.
- Create `src/app/providers/app-providers.tsx`.
- Wrap the app in `QueryClientProvider`.
- Move router creation to `src/app/routes/router.tsx`.
- Keep the React Router setup, but make `App` a thin composition root.
- Move global style imports to `src/app/styles` if that fits the final naming rule.

Verification:

- `pnpm test`
- `pnpm lint`
- `pnpm build`

## Phase 3: Create Shared API Infrastructure

Consolidate repeated fetch helpers.

Create:

```text
src/shared/api/
  client.ts
  errors.ts
```

Move or recreate:

- `requestJson`
- `requestVoid`
- `ApiError`
- field error parsing currently in `src/api/projects.ts`

Then update existing API modules to use the shared client.

Initial candidates:

- `src/api/projects.ts`
- `src/api/providers.ts`
- `src/api/health.ts`
- `src/api/debugLogs.ts`
- `src/privacySettings.ts`

Verification:

- Existing API tests should still pass.
- Add focused tests for shared error parsing if behavior changes.

## Phase 4: Extract Domain Entities

Move types, API functions, derived labels, and query definitions into entity slices.

Suggested entities:

```text
src/entities/project/
  api/
  model/
  ui/
  index.ts

src/entities/provider/
  api/
  model/
  index.ts

src/entities/health/
  api/
  model/
  index.ts

src/entities/privacy-settings/
  api/
  model/
  index.ts

src/entities/debug-log/
  api/
  model/
  index.ts
```

Rules:

- Domain types move from `src/types/*` into the owning entity `model`.
- Backend request functions move from `src/api/*` into the owning entity `api`.
- Pure domain helpers like `enabledProviders`, `allowedModels`, `defaultModelFor`, and `preferredProvider` move into `entities/provider/model`.
- Project labels and continuity severity labels move into `entities/project/model` or a small `lib` segment.
- Keep public imports through `index.ts`.

## Phase 5: Add TanStack Query Definitions

For each entity, create stable query keys and query options.

Example shape:

```text
src/entities/project/model/
  project-query-keys.ts
  project-queries.ts
  project-mutations.ts
```

Migration targets:

- `fetchProjects` -> `useQuery(projectQueries.list())`
- `fetchProjectWorkspace(projectId)` -> `useQuery(projectQueries.workspace(projectId))`
- `updateProjectWorkspace` -> `useMutation` plus workspace/project invalidation
- `fetchChapterEditor(projectId)` -> `useQuery(projectQueries.chapterEditor(projectId))`
- `updateChapterEditor` -> `useMutation` plus chapter editor invalidation
- `fetchProviders` -> `useQuery(providerQueries.list())`
- `fetchProviderDefaults` -> `useQuery(providerQueries.defaults())`
- Provider create/update/delete/test/refresh/default/preference writes -> mutations with provider invalidation
- `fetchHealth` -> `useQuery(healthQueries.status())`
- `fetchPrivacySettings` -> `useQuery(privacySettingsQueries.detail())`
- `updatePrivacySettings` -> mutation with privacy settings invalidation

Guidelines:

- Query keys must include every variable used by the query function.
- Mutations invalidate the smallest relevant key first.
- Do not mirror query results into Zustand.
- Use route/page components to compose queries, but keep query key definitions near the entity.

## Phase 6: Replace Manual Route Loading State

Remove `useEffect + useState + isCurrent` fetch patterns from routes.

Suggested order:

1. `HomeRoute`: migrate health loading/error state to TanStack Query.
2. `ProjectsRoute`: migrate project list query.
3. `ProviderSettingsRoute`: migrate providers/defaults queries and provider mutations.
4. `PrivacySettingsRoute` and `privacySettings.ts`: migrate settings query/mutation and remove window event sync.
5. `ProjectWorkspaceRoute`: migrate workspace and providers queries, save mutation, continuity mutation.
6. `ChapterEditorPanel`: migrate editor load/save to query/mutation; keep streaming AI request as a controlled mutation or custom feature service.
7. `ProjectCreateRoute`: migrate providers query and create/analyze mutations.

Keep local component state only for data that is truly local and temporary.

## Phase 7: Introduce Zustand Stores For Client State

Use Zustand for UI/client state, not server cache.

Candidate stores:

```text
src/features/create-project/model/create-project-store.ts
src/features/edit-project-workspace/model/workspace-draft-store.ts
src/features/edit-chapter/model/chapter-editor-store.ts
src/features/manage-providers/model/provider-form-store.ts
src/entities/privacy-settings/model/privacy-preferences-store.ts
```

Good Zustand candidates:

- selected provider/model in form flows.
- project setup draft and wizard state.
- workspace draft, selected section, dirty flag.
- chapter editor selected chapter/scene, instructions, persona, selected AI action, streaming text.
- transient notices where a route-level store makes the UX simpler.
- persisted UI preferences.

Avoid:

- project lists.
- provider lists.
- health response.
- persisted copies of backend workspace/editor data.

Use selectors in components:

```ts
const selectedChapterId = useChapterEditorStore((state) => state.selectedChapterId);
```

Persist only intentional preferences with `persist` and `partialize`.

## Phase 8: Move UI By Responsibility

Gradually dissolve atomic design folders.

Likely moves:

- `AppShell` -> `src/widgets/app-shell`
- `SettingsLayout` -> `src/widgets/settings-layout`
- `NoticeBlock` -> `src/shared/ui/notice-block`
- `StatusPill` -> `src/shared/ui/status-pill`
- `LabeledCheckbox` -> `src/shared/ui/labeled-checkbox`
- `UnsavedChangesDialog` -> `src/shared/ui/unsaved-changes-dialog`
- `HealthPanel` -> `src/entities/health/ui` or `src/widgets/health-panel`, depending on reuse.
- `ProjectList`, `ProjectsHeader` -> `src/pages/projects/ui` unless reused elsewhere.
- `PrivacySettingsPanel` -> `src/features/privacy-settings` or `src/pages/settings/privacy`, depending on reuse.
- `SettingsOverviewPanel` -> `src/pages/settings/ui`.

Rule of thumb:

- If used across domains, move to `shared/ui`.
- If it composes several feature/entity pieces and is reused across pages, move to `widgets`.
- If used only by one page, keep it inside that page slice.
- If it represents a user action, move it to `features`.
- If it represents a business object, move it to `entities`.

## Phase 9: Update Tests

Move tests with their modules.

- API tests follow entity API modules.
- Query tests use a fresh `QueryClient` per test.
- Zustand stores should be tested through actions/selectors without React when possible.
- Route/page tests should use a provider wrapper containing `QueryClientProvider`.

Suggested test utilities:

```text
src/shared/testing/
  query-client.tsx
  render-with-providers.tsx
```

## Phase 10: Final Cleanup

After all routes are migrated:

- Remove old `src/api` if empty.
- Remove old `src/types` if empty.
- Remove old `src/components/atoms|molecules|organisms|templates` if empty.
- Check import paths for accidental deep imports across slices.
- Prefer public APIs via `index.ts`.
- Remove now-unused effects and manual loading state.
- Audit Zustand stores for server-state duplication.

## Verification Checklist

After each phase:

- Run `pnpm test`.
- Run `pnpm lint`.
- Run `pnpm build`.

After visible frontend changes:

- Start the local dev environment with `scripts/dev.ps1` or `scripts/dev.cmd`.
- Manually verify affected flows in Chrome DevTools.
- Check visible layout/UI regressions.
- Check Console for errors.
- Check Network for failed or duplicated requests.

Core manual flows:

- Home health panel.
- Projects list.
- Project creation.
- Settings overview.
- Privacy settings.
- Provider settings.
- Project workspace.
- Chapter editor.

## Migration Principle

TanStack Query owns backend data and invalidation. Zustand owns user intent, drafts, selections, and UI state. If the same backend data appears in both places, treat it as a design smell and either derive it from TanStack Query or store only a draft copy with a clear dirty/save lifecycle.
