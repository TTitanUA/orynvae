# Frontend atomic design refactor plan

## Goal

Refactor the frontend toward a consistent atomic design structure so route files become thin page/container layers, shared UI becomes reusable, and future agents have clear placement rules.

The refactor should be incremental. Preserve current behavior while moving UI pieces into atomic layers and adding tests around extracted components when the extraction changes meaningful behavior.

## Current State

- The frontend already has partial atomic structure:
  - `frontend/src/components/atoms`
  - `frontend/src/components/molecules`
  - `frontend/src/components/templates`
- Existing examples include `StatusPill`, `HealthPanel`, `UnsavedChangesDialog`, and `AppShell`.
- There is no `organisms` layer yet.
- Route components under `frontend/src/routes` contain a lot of UI, state coordination, and page-specific layout in the same files.
- CSS is mostly colocated with routes and components, with shared tokens in `frontend/src/styles`.
- There is no frontend-specific `AGENTS.md`.

## Target Structure

Use atomic design as the primary frontend organization model:

```text
frontend/
  AGENTS.md
  src/
    components/
      atoms/
      molecules/
      organisms/
      templates/
    routes/
    styles/
    api/
    types/
    store/
```

Layer responsibilities:

- `atoms`: smallest reusable primitives with minimal domain knowledge, such as buttons, icon buttons, text inputs, text areas, selects, badges, pills, labels, loaders, tabs, field errors, and empty text states.
- `molecules`: small compositions of atoms with one focused purpose, such as form fields, filter bars, model selectors, provider status rows, settings nav items, warning banners, and confirmation dialogs.
- `organisms`: larger domain-aware UI sections, such as provider cards, provider model management panels, project lists, workspace sidebars, chapter editor toolbars, settings sections, and privacy settings panels.
- `templates`: page layout shells and reusable layout frames, such as app shell, settings layout, workspace layout, split editor layout, and list/detail layout.
- `routes`: routing, data fetching orchestration, mutation wiring, page-level state, and composition of templates/organisms. Route files should avoid defining reusable UI primitives inline.

## Stage 1. Inventory and Boundaries

Map current route UI into extraction candidates before moving code:

- `ProviderSettingsRoute.tsx`: identify provider form controls, model list controls, provider cards, status indicators, and action rows.
- `ProjectWorkspaceRoute.tsx`: identify workspace layout, chapter list/sidebar, editor controls, AI action panels, status panels, and save states.
- `ProjectCreateRoute.tsx`: identify wizard/form sections, provider/model selection controls, validation messages, and preview panels.
- `ProjectsRoute.tsx`: identify project list items, empty state, filters, and create actions.
- `SettingsRoute.tsx` and `PrivacySettingsRoute.tsx`: identify settings layout/navigation and reusable settings section patterns.
- Existing molecules/atoms/templates: keep useful pieces, rename only when it improves consistency.

Deliverable:

- A short extraction checklist in the implementation PR or stage notes, grouped by route and atomic layer.

## Stage 2. Add Frontend Agent Rules

Create `frontend/AGENTS.md` early in the refactor so future work follows the same architecture.

Required content:

```markdown
# Frontend Agent Rules

## Architecture

- This frontend uses atomic design.
- Place reusable UI in `src/components` by layer:
  - `atoms`: primitive UI building blocks with minimal domain knowledge.
  - `molecules`: focused combinations of atoms.
  - `organisms`: domain-aware sections made from atoms and molecules.
  - `templates`: reusable page/layout frames.
- Keep route files in `src/routes` focused on routing, data loading, mutations, page state, and composing templates/organisms.
- Prefer extracting repeated route UI into the smallest appropriate atomic layer before adding more inline markup.
- Keep component CSS colocated with the component unless a style belongs in shared tokens or global styles.

## Verification

- Root `AGENTS.md` verification rules still apply.
- For visible frontend changes, run automated checks and manually verify the affected flow in Chrome DevTools.
```

Acceptance criteria:

- `frontend/AGENTS.md` exists.
- The file explicitly states that the frontend uses atomic design.
- It defines the intended responsibilities of atoms, molecules, organisms, templates, and routes.
- It references the root verification requirements instead of duplicating every command.

## Stage 3. Establish Missing Shared Atoms

Extract stable primitives that appear across routes.

Likely candidates:

- `Button` with variants and loading/disabled states.
- `IconButton` using `lucide-react`.
- `TextInput`, `TextArea`, `Select`, and `Checkbox`.
- `FieldLabel`, `FieldError`, and `FormHint`.
- `Badge` or extend existing `StatusPill` only if the concepts are distinct.
- `Spinner` or loading indicator.
- `Tabs` or segmented control if multiple routes use the same pattern.

Guidelines:

- Avoid over-generalizing atoms with route-specific props.
- Keep styling aligned with `styles/tokens.css`.
- Preserve accessible names, focus states, keyboard behavior, and disabled states.
- Use icons from `lucide-react` for icon buttons when available.

Acceptance criteria:

- Atoms have focused props and do not import route, API, or domain types unless unavoidable.
- Replaced route markup does not change visual hierarchy unexpectedly.
- Component-level tests are added for atoms with non-trivial state or accessibility behavior.

## Stage 4. Extract Molecules

Move repeated small UI patterns into molecules after atoms are available.

Likely candidates:

- `FormField`: label, control, hint, and error composition.
- `ProviderSelector` and `ModelSelector`.
- `SettingsSectionHeader`.
- `InlineAlert` or `WarningBanner`.
- `SearchFilterBar`.
- `EmptyState`.
- Existing `HealthPanel` and `UnsavedChangesDialog` should be reviewed for naming and consistency.

Guidelines:

- Molecules may know about local UI concepts, but should avoid owning API calls.
- Keep validation display logic near the component if it only affects rendering.
- Keep mutation side effects in routes or organisms.

Acceptance criteria:

- Duplicate label/control/error markup is reduced.
- Molecules are reusable across at least one current or near-term route, or are extracted because they clarify a large route.
- Tests cover rendering branches where behavior is not purely visual.

## Stage 5. Introduce Organisms

Create `frontend/src/components/organisms` and move domain-aware sections out of route files.

Likely candidates:

- `ProviderCard`
- `ProviderSettingsList`
- `ProviderModelPanel`
- `ProjectList`
- `ProjectSummaryPanel`
- `WorkspaceSidebar`
- `WorkspaceHeader`
- `ChapterList`
- `ChapterEditorToolbar`
- `ChapterAssistantPanel`
- `PrivacySettingsPanel`

Guidelines:

- Organisms can receive domain data and callbacks from routes.
- Prefer props for data and events over direct API calls unless an existing local pattern says otherwise.
- Keep route-specific navigation decisions in routes.
- Keep large organisms internally decomposed into molecules when sections become hard to scan.

Acceptance criteria:

- Major route files shrink because they compose named sections instead of owning all markup.
- Organisms have clear public props and no accidental global state coupling.
- Route behavior remains unchanged.

## Stage 6. Normalize Templates and Page Composition

Keep reusable layout in templates and make routes compose those layouts.

Work items:

- Review existing `AppShell` as the top-level template.
- Add templates only when multiple pages share the same structure, such as settings pages or workspace pages.
- Consider:
  - `SettingsLayout`
  - `WorkspaceLayout`
  - `ListDetailLayout`
  - `EditorLayout`
- Keep page-specific content in organisms or routes, not templates.

Acceptance criteria:

- Templates describe layout, not domain workflows.
- Shared page layout classes stop being duplicated across route CSS files.
- Mobile and desktop layout behavior remains stable.

## Stage 7. CSS and Design Token Cleanup

Refactor CSS alongside component extraction.

Guidelines:

- Keep component CSS next to the component.
- Move only true global primitives to `styles/global.css`.
- Move reusable values to `styles/tokens.css` when they are intentionally shared.
- Avoid one-off utility class sprawl.
- Keep class names scoped by component where possible.
- Remove unused route CSS after extraction.

Acceptance criteria:

- No obvious duplicate route-level styles remain for extracted shared components.
- Tokens cover repeated colors, spacing, borders, shadows, and typography decisions that are truly shared.
- Visual regression is checked manually in the affected flows.

## Stage 8. Route-by-Route Migration Order

Use this order to keep risk manageable:

1. `SettingsRoute.tsx` and `PrivacySettingsRoute.tsx`: smaller surfaces, good place to prove settings sections and layout.
2. `ProjectsRoute.tsx`: extract list, empty state, and project card/list item patterns.
3. `ProjectCreateRoute.tsx`: extract form fields, provider/model selectors, validation blocks, and step/section layout.
4. `ProviderSettingsRoute.tsx`: extract provider cards, provider form sections, model controls, and health/status UI.
5. `ProjectWorkspaceRoute.tsx`: extract workspace template, sidebar, header, chapter editor toolbar, assistant panels, and save/status surfaces.
6. `ChapterEditorPanel.tsx`: split editor-specific controls and assistant interaction pieces after workspace boundaries are clearer.

Acceptance criteria:

- Each route can be reviewed independently.
- Each migration stage keeps tests passing before the next route starts.
- Large route files are reduced gradually instead of rewritten all at once.

## Stage 9. Testing Strategy

Automated checks:

- Run frontend lint, tests, and build after each meaningful migration stage.
- Add or update tests for extracted components when they include:
  - conditional rendering;
  - form state;
  - accessibility behavior;
  - user interactions;
  - data transformation before callbacks.

Suggested commands on Windows:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; . .\scripts\tool-env.ps1
cd frontend
& $env:ORYNVAE_PNPM lint
& $env:ORYNVAE_PNPM test
& $env:ORYNVAE_PNPM build
```

Manual verification:

- Use the project dev launcher when frontend-visible behavior changes.
- Open the affected routes in Chrome DevTools.
- Check console errors, failed network requests, layout regressions, keyboard focus, disabled/loading states, and responsive behavior.

Suggested launcher:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; . .\scripts\tool-env.ps1
.\scripts\dev.cmd
```

## Stage 10. Completion Criteria

The refactor is complete when:

- `frontend/AGENTS.md` documents atomic design rules for future agents.
- `frontend/src/components/organisms` exists and owns large domain-aware sections.
- Route files primarily compose templates and organisms.
- Shared atoms and molecules cover common controls and small repeated patterns.
- Extracted components have colocated CSS and focused tests where behavior warrants it.
- The affected browser flows have been manually verified with Chrome DevTools.
- The frontend passes lint, tests, and build.

## Open Decisions

- Whether to use barrel exports per atomic layer. Default recommendation: avoid barrels until import paths become noisy.
- Whether to introduce Storybook or another component explorer. Default recommendation: defer until the component library stabilizes.
- Whether route CSS should be fully eliminated. Default recommendation: keep small page-only CSS in routes, move shared styles with extracted components.
- Whether organisms should call API hooks directly. Default recommendation: keep API orchestration in routes unless a reusable hook pattern emerges.
