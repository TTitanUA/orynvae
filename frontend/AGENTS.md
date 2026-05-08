# Frontend Agent Rules

## Project fit

- These rules apply to the Orynvae v2 frontend.
- If frontend implementation details conflict with product docs, use `docs/technical-stack-v2.md`, `docs/mvp-v2.md` and the relevant `docs/mvp-v2/*.md` file as the source of truth.
- Root `AGENTS.md` product invariants apply here: AI-first, read-only without AI, markdown-only artistic text, and JSONL-only debug logging.

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
- `src/store` is legacy compatibility surface. Do not add new canonical app state there unless the change is explicitly about migrating or removing that legacy layer.

## MVP v2 frontend constraints

- The application is desktop-only for MVP v2. The minimum supported viewport is 1980px by 1024px.
- Do not add mobile/tablet breakpoints, hamburger navigation, phone-style full-width controls, or single-column mobile layouts unless the product requirement explicitly changes.
- Markdown editor work should use the `OrynvaeMarkdownEditor` direction from `docs/technical-stack-v2.md`: CodeMirror 6 core, Orynvae editor layer, markdown as source of truth.
- When active AI is unavailable, mutating creative UI must be disabled or route to provider setup; existing content remains readable.
- Frontend debug interceptors must exclude `/api/debug/logs` and future `/api/debug/logs/*`.

## Verification

- Root `AGENTS.md` verification rules still apply.
- For visible frontend changes, run automated checks and manually verify the affected flow in Chrome DevTools.
- For visible frontend changes, verify at 1980px by 1024px and at wider desktop sizes.
- If support below 1980px by 1024px is requested, ask for explicit confirmation before implementing it.
