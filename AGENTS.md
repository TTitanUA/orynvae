# Lorithm Agent Rules

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
