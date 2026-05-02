# Lorithm Agent Rules

## Verification

- After automated tests for frontend-related changes, run the local development environment and manually test the frontend with Chrome DevTools.
- Use the project dev launcher when it exists, for example `scripts/dev.ps1` on Windows or `scripts/dev.sh` on Unix-like systems.
- During manual frontend testing, verify the relevant user flow in the browser, check for visible UI/layout issues, and inspect the console/network panels for errors.
- Do not consider frontend work complete based only on unit tests or build success when the change affects visible UI or browser behavior.

