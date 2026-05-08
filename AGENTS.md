# Orynvae Agent Rules

## Project sources of truth

- Current product concept: `docs/concept-v2.md`.
- Current MVP scope: `docs/mvp-v2.md` and `docs/mvp-v2/*.md`.
- Current technical stack: `docs/technical-stack-v2.md`.
- MVP implementation stages: `plans/mvp-v2-implementation-plan.md`.
- The old v1 concept, MVP and technical spec were removed. Do not recreate `docs/concept.md`, `docs/mvp.md` or `docs/technical-spec.md` unless the user explicitly asks for legacy docs.

## Product invariants

- Orynvae v2 is AI-first. Without an available AI provider, the app works only in read-only mode.
- Do not add manual creative fallback workflows for project creation, story editing, narrator mode, memory updates, story lines, draft assembly or forecasts.
- Markdown is the only persisted format for artistic text: chapters, scenes, drafts, draft versions and exported prose. HTML, rich text JSON and editor-specific state are not canonical storage formats.
- Debug logs, AI request logs, prompt/response dumps and frontend debug entries must never be stored in SQLite.
- When debug is enabled, diagnostic logs go only to `logs/app-<yyyy>-<mm>-<dd>.jsonl`.
- Do not log `GET /api/debug/logs`, `POST /api/debug/logs` or future `/api/debug/logs/*` requests.

## Verification

- After automated tests for frontend-related changes, run the local development environment and manually test the frontend with Chrome DevTools.
- Use the project dev launcher when it exists, for example `scripts/dev.ps1` on Windows or `scripts/dev.sh` on Unix-like systems.
- During manual frontend testing, verify the relevant user flow in the browser, check for visible UI/layout issues, and inspect the console/network panels for errors.
- Do not consider frontend work complete based only on unit tests or build success when the change affects visible UI or browser behavior.

## Local tools

- In Codex sandbox sessions, `uv` and `pnpm` may not be visible in `PATH` by default.
- On Windows, run `Set-ExecutionPolicy -Scope Process Bypass -Force; . .\scripts\tool-env.ps1` before project commands, or use `scripts\dev.cmd`.
- `scripts\tool-env.ps1` resolves the expected local tool paths and exports `ORYNVAE_UV`, `ORYNVAE_NODE`, and `ORYNVAE_PNPM`.
- If sandbox blocks direct execution of these external tools, request escalated execution for the resolved `uv.exe` and `pnpm.cmd` paths.
