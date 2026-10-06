# Instagram to Presenton Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local pipeline that reads Instagram and promoted-post metrics, produces a weekly or monthly directional briefing, and generates a local PPTX/PDF through a self-hosted Presenton API.

**Architecture:** Add a standalone `projects/instagram-presenton` Node project. Its read-only Meta client produces normalized snapshots; a briefing module turns snapshots into JSON and Markdown; a Presenton HTTP client sends the briefing to a local Presenton instance and copies the returned export into the pipeline output directory. The Meta client is structurally incapable of sending non-GET requests.

**Tech Stack:** Node.js ESM, built-in `fetch`, `node:test`, `node:fs/promises`, `node:path`, Presenton local HTTP API, Meta Graph API.

## Global Constraints

- Meta access is **SOMENTE PARA LEITURA**.
- The Meta HTTP client accepts only `GET`; `POST`, `PUT`, `PATCH`, and `DELETE` fail before network I/O.
- Weekly window is the last 7 calendar days compared with the prior 7 calendar days.
- Monthly window is the last 30 rolling days before execution; it is not the previous calendar month.
- Organic and paid metrics remain separate; uncertain correlations use `paid_unmatched`.
- Missing metrics remain `null`; no missing metric becomes zero silently.
- Presenton runs locally; no presentation data is sent to a hosted presentation service.
- Secrets stay in local environment variables and never enter logs, snapshots, briefings, or generated prompts.
- Do not add a runtime dependency when Node built-ins cover the requirement.

---

## File Map

### New project

- Create: `projects/instagram-presenton/package.json` - workspace scripts and project metadata.
- Create: `projects/instagram-presenton/.env.example` - non-secret configuration names and local Presenton defaults.
- Create: `projects/instagram-presenton/.gitignore` - local env, generated data, and output exclusions.
- Create: `projects/instagram-presenton/README.md` - setup, permissions, local Presenton startup, commands, and the read-only warning.
- Create: `projects/instagram-presenton/src/config.mjs` - environment parsing and validation.
- Create: `projects/instagram-presenton/src/meta-client.mjs` - GET-only Graph API transport and pagination.
- Create: `projects/instagram-presenton/src/windows.mjs` - weekly and monthly date windows.
- Create: `projects/instagram-presenton/src/normalize.mjs` - normalize Meta responses and preserve nulls/warnings.
- Create: `projects/instagram-presenton/src/correlate.mjs` - safe paid-to-media correlation.
- Create: `projects/instagram-presenton/src/briefing.mjs` - briefing JSON and Markdown generation.
- Create: `projects/instagram-presenton/src/presenton-client.mjs` - local Presenton request and export download.
- Create: `projects/instagram-presenton/src/pipeline.mjs` - orchestration and failure-safe persistence.
- Create: `projects/instagram-presenton/scripts/instagram-present.mjs` - CLI argument parsing and process exit behavior.
- Create: `projects/instagram-presenton/tests/windows.test.mjs` - deterministic date-window tests.
- Create: `projects/instagram-presenton/tests/meta-client.test.mjs` - GET-only, pagination, retry, and redaction tests.
- Create: `projects/instagram-presenton/tests/normalize.test.mjs` - normalization and missing-value tests.
- Create: `projects/instagram-presenton/tests/correlate.test.mjs` - safe correlation tests.
- Create: `projects/instagram-presenton/tests/briefing.test.mjs` - briefing content and no-token tests.
- Create: `projects/instagram-presenton/tests/presenton-client.test.mjs` - local API payload and export tests.
- Create: `projects/instagram-presenton/tests/pipeline.test.mjs` - snapshot preservation and failure behavior.

### Existing workspace files

- Modify: `package.json` - add the root convenience script `instagram:present` targeting the new workspace.
- Modify: `scripts/verify.sh` only if the existing aggregate verification does not already include workspace checks; preserve the current script convention.

## Interfaces

The implementation should use these small interfaces so modules can be tested without real Meta or Presenton access:

```js
// src/meta-client.mjs
createMetaClient({ accessToken, graphVersion, fetchImpl, now })
  -> { get, getAll }

get(path, query = {})
  -> Promise<object>

getAll(path, query = {})
  -> Promise<object[]>

// src/windows.mjs
getWindow(kind, now = new Date())
  -> { kind, current: { start, end }, previous: { start, end } | null }

// src/normalize.mjs
normalizeMetaSnapshot({ posts, organicInsights, paidInsights, window, collectedAt })
  -> Snapshot

// src/briefing.mjs
buildBriefing(snapshot)
  -> { json: Briefing, markdown: string }

// src/presenton-client.mjs
createPresentonClient({ baseUrl, apiKey, fetchImpl })
  -> { generate }

generate({ content, slidesMarkdown, instructions, language, template, nSlides, exportAs })
  -> Promise<{ presentationId, fileUrl, editUrl }>
```

## Task 1: Scaffold the standalone workspace

**Files:** `projects/instagram-presenton/package.json`, `.env.example`, `.gitignore`, `README.md`, root `package.json`.

- [ ] Create the project package with ESM and scripts:

```json
{
  "name": "instagram-presenton",
  "private": true,
  "type": "module",
  "scripts": {
    "instagram:present": "node scripts/instagram-present.mjs",
    "test": "node --test tests/*.test.mjs"
  }
}
```

- [ ] Add the configuration names `META_ACCESS_TOKEN`, `META_GRAPH_API_VERSION`, `META_IG_USER_ID`, `META_AD_ACCOUNT_ID`, `PRESENTON_BASE_URL`, `PRESENTON_API_KEY`, `PRESENTON_TEMPLATE`, `OUTPUT_DIR`, and `DATA_DIR` to `.env.example` with no real values.
- [ ] Ignore `.env`, `data/snapshots/`, `data/briefings/`, and `data/output/`; keep fixture files under `tests/fixtures/` trackable.
- [ ] Document that Meta is `SOMENTE PARA LEITURA`, that Presenton must be self-hosted locally, and that an API key is created in Presenton Admin when authentication is enabled.
- [ ] Add the root script:

```json
"instagram:present": "npm run instagram:present --workspace=instagram-presenton"
```

- [ ] Run `npm test --workspace=instagram-presenton`; expect it to fail only because test files are not present yet, then continue with the test tasks.

## Task 2: Add validated configuration and date windows

**Files:** `src/config.mjs`, `src/windows.mjs`, `tests/windows.test.mjs`.

- [ ] Write tests for weekly and monthly windows using a fixed UTC date. Weekly must return a 7-day current period and a distinct prior 7-day period. Monthly must return a 30-day current period and no previous period unless explicitly required by the briefing contract.
- [ ] Implement `getWindow(kind, now)` using UTC date arithmetic and ISO `YYYY-MM-DD` boundaries. Reject unknown kinds instead of defaulting silently.
- [ ] Validate required Meta variables and Presenton URL in `loadConfig(env)`. Require `META_ACCESS_TOKEN`, `META_GRAPH_API_VERSION`, `META_IG_USER_ID`, `META_AD_ACCOUNT_ID`, and `PRESENTON_BASE_URL`; make API key optional for an unauthenticated local instance.
- [ ] Set safe defaults for `PRESENTON_TEMPLATE=general`, `OUTPUT_DIR=data/output`, and `DATA_DIR=data`.
- [ ] Run `node --test tests/windows.test.mjs`; expect all tests to pass.

## Task 3: Implement the GET-only Meta client

**Files:** `src/meta-client.mjs`, `tests/meta-client.test.mjs`.

- [ ] Write a fake `fetchImpl` test that proves `client.get()` sends `GET` and includes the access token only in the request header.
- [ ] Write a test that calls an internal request helper with `POST`, `PUT`, `PATCH`, and `DELETE` and expects rejection before `fetchImpl` is called.
- [ ] Write pagination tests for Graph API responses shaped as `{ data, paging: { next } }` and a transient `429` followed by success. Cap retries at three attempts and do not retry authentication or validation errors.
- [ ] Implement `createMetaClient({ accessToken, graphVersion, fetchImpl = fetch })` with URL construction against `https://graph.facebook.com/${graphVersion}` and `Authorization: Bearer ...` headers. Never put the token in a query string.
- [ ] Implement `getAll()` that follows only returned `paging.next` URLs and returns concatenated `data` items.
- [ ] Redact authorization headers and token-like values from errors before returning or logging them.
- [ ] Run `node --test tests/meta-client.test.mjs`; expect all tests to pass.

## Task 4: Collect and normalize organic and paid data

**Files:** `src/normalize.mjs`, `src/correlate.mjs`, `tests/normalize.test.mjs`, `tests/correlate.test.mjs`.

- [ ] Add fixtures for posts, organic media insights, paid ad insights, missing metrics, and an ad without a reliable media relationship.
- [ ] Implement normalization that preserves `null`, converts only valid numeric metric values to numbers, rejects negative metrics, and records warnings for malformed or unavailable values.
- [ ] Normalize each post with `externalId`, timestamp, permalink, media type, caption metadata, `organic`, `paid`, and `total` fields. Keep paid and organic values in separate objects.
- [ ] Implement `correlatePaidToMedia({ ads, posts })` using explicit Meta identifiers only. Return `paid_unmatched` for ads without a safe match; never match by caption similarity or position.
- [ ] Calculate `total` only for compatible numeric fields from a safe organic/paid pair. Leave it `null` when either side is missing or unmatched.
- [ ] Run `node --test tests/normalize.test.mjs tests/correlate.test.mjs`; expect all tests to pass.

## Task 5: Implement snapshot collection and persistence

**Files:** `src/pipeline.mjs`, `tests/pipeline.test.mjs`.

- [ ] Write tests using fake Meta and Presenton clients that confirm a snapshot is written before Presenton generation is attempted.
- [ ] Write a failure test proving a Presenton error leaves the snapshot and briefing intact and does not delete previous output.
- [ ] Implement collection calls for the configured Instagram account and ad account using only `metaClient.getAll()`/`get()`. Keep endpoint construction in this module and do not add any mutation helper.
- [ ] Persist snapshots under `DATA_DIR/snapshots/<run-id>.json` and write atomically through a temporary file followed by rename.
- [ ] Include `source`, `account`, `collectedAt`, `window`, `posts`, `metrics`, `correlations`, and `warnings` in every snapshot.
- [ ] Ensure generated files contain no access token by testing the serialized output.
- [ ] Run `node --test tests/pipeline.test.mjs`; expect all tests to pass.

## Task 6: Generate the directional briefing

**Files:** `src/briefing.mjs`, `tests/briefing.test.mjs`.

- [ ] Write tests for the eight-slide outline, weekly comparison language, monthly rolling-30-day language, organic/paid separation, `paid_unmatched` warnings, and missing metric handling.
- [ ] Implement `buildBriefing(snapshot)` to return stable JSON plus Markdown. The JSON must include run ID, mode, periods, source, posts, rankings, patterns, facts, interpretations, recommendations, warnings, and limitations.
- [ ] Generate rankings from available numeric values only. Do not infer zero for null values and do not claim causality from a small sample.
- [ ] Include Presenton instructions that require evidence-backed recommendations, explicit periods, and no invented values.
- [ ] Write the Markdown with the eight slide headings: executive summary, data quality, account evolution, top content, organic versus promoted, editorial patterns, repeat/avoid, and next-cycle direction.
- [ ] Persist the JSON and Markdown under `DATA_DIR/briefings/<run-id>.json` and `.md` before calling Presenton.
- [ ] Run `node --test tests/briefing.test.mjs`; expect all tests to pass.

## Task 7: Integrate with a local Presenton API

**Files:** `src/presenton-client.mjs`, `tests/presenton-client.test.mjs`.

- [ ] Write a fake server test that verifies the request is sent to `/api/v1/ppt/presentation/generate` with `POST`, the configured bearer key, `content`, `slides_markdown`, `instructions`, `n_slides: 8`, the configured template, and `export_as: "pptx"`.
- [ ] Write a test for the response shape `{ presentation_id, path, edit_path }` and a local file copy from the returned path or URL into `OUTPUT_DIR`.
- [ ] Reject non-local Presenton URLs by default. Allow only loopback hosts (`localhost`, `127.0.0.1`, or `::1`) unless an explicit opt-in flag is added in a later design.
- [ ] Implement `createPresentonClient()` with timeout handling and redacted errors. Use the API key only in the authorization header.
- [ ] Save the generated file as `<run-id>-weekly.pptx` or `<run-id>-monthly.pptx`; optionally request a second PDF only when configured.
- [ ] Run `node --test tests/presenton-client.test.mjs`; expect all tests to pass.

## Task 8: Add the CLI and end-to-end simulated run

**Files:** `scripts/instagram-present.mjs`, `src/pipeline.mjs`, `tests/pipeline.test.mjs`, `README.md`.

- [ ] Add strict CLI parsing for exactly `--window weekly` or `--window monthly`; reject missing or unknown values with a non-zero exit code.
- [ ] Orchestrate configuration, window selection, Meta collection, normalization, snapshot persistence, briefing persistence, and local Presenton generation in that order.
- [ ] Print only run ID, selected window, output paths, and sanitized warnings. Never print tokens, authorization headers, or complete API payloads.
- [ ] Add a fully simulated pipeline test that uses fake clients and verifies snapshot, JSON briefing, Markdown briefing, and presentation output paths.
- [ ] Document commands:

```sh
npm run instagram:present --workspace=instagram-presenton -- --window weekly
npm run instagram:present --workspace=instagram-presenton -- --window monthly
```

- [ ] Document that the monthly command uses the preceding 30 rolling days and is initially manual.
- [ ] Run `npm test --workspace=instagram-presenton`; expect all project tests to pass.

## Task 9: Verify the workspace without real Meta calls

**Files:** `projects/instagram-presenton/README.md`, any files needed to fix test findings.

- [ ] Run `npm test --workspace=instagram-presenton` with no Meta credentials and confirm the simulated suite passes.
- [ ] Run `npm run instagram:present --workspace=instagram-presenton -- --window invalid` and confirm it fails before any network call.
- [ ] Run the project lint/build checks if the new project adds them; do not add a framework solely for linting this small CLI.
- [ ] Run root `npm test` and `npm run verify` if the workspace state permits; report unrelated pre-existing failures without reverting user changes.
- [ ] Confirm `git diff --check` is clean for the files created by this feature.

## Self-Review Checklist

- Spec coverage: Meta GET-only access is covered by Tasks 3, 5, and 9; weekly/monthly windows by Task 2; normalization and paid correlation by Task 4; snapshots by Task 5; briefing by Task 6; local Presenton generation by Task 7; local output and failure safety by Tasks 5, 7, and 8.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step is required by the tasks above.
- Interface consistency: `createMetaClient`, `getWindow`, `normalizeMetaSnapshot`, `buildBriefing`, and `createPresentonClient` signatures are defined before their use in later tasks.
- Scope: this plan creates one standalone CLI pipeline; it does not modify `ownerinc-brain`, `interactive_deck`, or the installed Presenton package.
