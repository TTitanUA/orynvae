# Refactor Plan: Remove Mobile Responsive Layouts

## Goal

The frontend is a desktop-only application. Remove partial mobile/tablet responsive behavior and support layouts down to a minimum desktop width of 1366px.

## Scope

- Remove mobile-oriented CSS breakpoints and one-column phone/tablet layouts.
- Keep the application usable and visually stable at 1366px and wider.
- Update frontend agent instructions so future work does not reintroduce mobile-specific responsive behavior.

## Stage 1: Establish Desktop-Only Layout Contract

- Replace the current global `min-width: 320px` with a desktop minimum, preferably `1366px`.
- Define a shared CSS token such as `--app-min-width: 1366px` if it fits the existing token structure.
- Apply the minimum width at the root layout level (`html`, `body`, `#root`, or app shell as appropriate).
- Allow horizontal overflow below 1366px instead of optimizing for phone/tablet widths.

## Stage 2: Remove Mobile Breakpoints

Remove or rewrite mobile/tablet `@media` rules in:

- `frontend/src/app/styles/global.css`
- `frontend/src/widgets/app-shell/AppShell.css`
- `frontend/src/pages/home/HomeRoute.css`
- `frontend/src/features/edit-chapter/ui/ChapterEditorPanel.css`
- `frontend/src/entities/health/ui/HealthPanel.css`
- `frontend/src/shared/ui/labeled-checkbox/LabeledCheckbox.css`
- `frontend/src/shared/ui/unsaved-changes-dialog/UnsavedChangesDialog.css`
- `frontend/src/pages/settings/ui/SettingsOverviewPanel.css`
- `frontend/src/pages/settings/providers/ProviderSettingsRoute.css`
- `frontend/src/pages/projects/project-create/ProjectCreateRoute.css`
- `frontend/src/pages/projects/project-workspace/ProjectWorkspaceRoute.css`
- `frontend/src/pages/projects/ui/ProjectList.css`
- `frontend/src/pages/projects/ui/ProjectsHeader.css`

The main patterns to remove:

- Sidebar collapsing into a top navigation.
- Desktop grids collapsing into one-column mobile layouts.
- Buttons and links becoming full-width mobile controls.
- Headers/actions switching to vertical phone stacks.
- Dialogs/forms switching to single-column phone layouts only for narrow screens.

## Stage 3: Preserve Desktop Usability at 1366px

- Check each removed breakpoint for desktop impact.
- Where a layout becomes cramped at 1366px, solve it with desktop-oriented adjustments:
  - tighter spacing;
  - better `minmax()` column sizing;
  - internal scroll for dense panels;
  - sensible max widths;
  - stable fixed-size controls.
- Do not replace removed mobile behavior with new breakpoints below 1366px.

## Stage 4: Update `frontend/AGENTS.md`

Add frontend-specific rules:

- The application is desktop-only.
- The minimum supported viewport width is 1366px.
- Do not add mobile/tablet breakpoints, hamburger navigation, phone-style full-width controls, or single-column mobile layouts unless the product requirement explicitly changes.
- For visible frontend changes, verify at 1366px width and at wider desktop sizes.
- If support below 1366px is requested, ask for explicit confirmation before implementing it.

## Stage 5: Verification

- Run frontend automated checks:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- Start the local frontend dev environment using the project launcher when available.
- Manually verify affected flows in Chrome DevTools at desktop widths, especially 1366px:
  - app shell/navigation;
  - home/projects pages;
  - project creation;
  - project workspace;
  - chapter editor;
  - provider settings;
  - settings overview;
  - dialogs and shared UI components.
- Inspect browser console and network panels for errors.

## Acceptance Criteria

- No mobile/tablet-specific responsive rules remain in frontend CSS.
- Layouts remain stable and usable at 1366px and wider.
- `frontend/AGENTS.md` documents the desktop-only rule.
- Automated checks pass.
- Manual Chrome DevTools verification is completed for the affected flows.
