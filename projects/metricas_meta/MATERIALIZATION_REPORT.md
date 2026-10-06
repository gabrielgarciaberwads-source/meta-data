# Materialization Report

## Destination

`projects/metricas_meta`

## Materialized files

- `.env.example`
- `.gitignore`
- `README.md`
- `package.json`
- `src/briefing.mjs`
- `src/config.mjs`
- `src/correlate.mjs`
- `src/meta-client.mjs`
- `src/normalize.mjs`
- `src/pipeline.mjs`
- `src/presenton-client.mjs`
- `src/redact.mjs`
- `src/windows.mjs`
- `tests/briefing.test.mjs`
- `tests/config.test.mjs`
- `tests/correlate.test.mjs`
- `tests/meta-client.test.mjs`
- `tests/normalize.test.mjs`
- `tests/pipeline.test.mjs`
- `tests/presenton-client.test.mjs`
- `tests/redact.test.mjs`
- `tests/scheduler-config.test.mjs`
- `tests/windows.test.mjs`
- `scripts/install-scheduled-tasks.ps1`
- `scripts/run-scheduled.ps1`
- `scripts/scheduler-common.ps1`
- `scripts/uninstall-scheduled-tasks.ps1`
- `scripts/instagram-present.mjs`

## Verification

- `npm test`: 55 passed, 0 failed.
- PowerShell parser checks: passed for all `scripts/*.ps1` files.

## Exclusions

- No `.env` file or real credentials were materialized. The real access token in the source `.env.example` was replaced with an empty placeholder.
- Excluded generated `data/snapshots/`, `data/briefings/`, `data/output/`, and logs.
- Excluded temporary files and `.superpowers` artifacts.
