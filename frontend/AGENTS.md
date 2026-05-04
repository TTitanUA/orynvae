# Frontend Agent Rules

## Architecture

- This frontend uses feature/domain-first structure.
- `src/app` owns application wiring: entrypoint composition, providers, router setup, and global styles.
- `src/pages` owns route-level page slices and page-only UI.
- `src/widgets` owns reusable layout/composition blocks that combine multiple entities or features.
- `src/features` owns user actions and flows, including local draft/form stores and flow-specific services.
- `src/entities` owns business domains: domain types, backend request functions, query keys/options, mutations, labels, and entity UI.
- `src/shared` owns cross-domain infrastructure, generic UI, utilities, config, assets, and test helpers.
- Each slice that exports code outside itself must expose that API through a public `index.ts`.
- Prefer public slice imports over deep imports from another slice's internal folders.
- Keep CSS colocated with the component or slice unless the style is global.
- TanStack Query is the default owner for backend reads, mutations, cache, invalidation, loading, and error state.
- Zustand is the default owner for client/UI state, drafts, selections, dirty flags, transient flow state, and preferences.
- Do not store backend snapshots in Zustand unless the copy is an intentional draft with a clear dirty/save lifecycle and the reason is visible in the slice design.

## Verification

- Root `AGENTS.md` verification rules still apply.
- For visible frontend changes, run automated checks and manually verify the affected flow in Chrome DevTools.
- The application is desktop-only. The minimum supported viewport width is 1366px.
- Do not add mobile/tablet breakpoints, hamburger navigation, phone-style full-width controls, or single-column mobile layouts unless the product requirement explicitly changes.
- For visible frontend changes, verify at 1366px width and at wider desktop sizes.
- If support below 1366px is requested, ask for explicit confirmation before implementing it.
