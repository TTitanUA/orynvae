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
