# TLS, Dashboard e QA — Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Keep the six new n8n workflows manual, inactive, and unpublished throughout. Steps use checkbox syntax for tracking.

**Goal:** Enable private PostgreSQL TLS, run controlled live QA without exporting production data, and deliver an internal Ownerinc dashboard with a sanitized read-only API and isolated auto-deploy.

**Architecture:** The dedicated PostgreSQL container remains private and publishes no host port. A CA and PostgreSQL server certificate are generated only on the VPS; n8n and the dashboard API trust the CA through read-only mounts. After the first live QA gate passes, one Node service will serve a React/Vite dashboard and same-origin API over the private Docker network using a dedicated read-only database role.

**Tech Stack:** PostgreSQL 16 Alpine, n8n, Node.js ESM, React, Vite, `pg`, Docker Compose, GitHub Actions over SSH, Node test runner, Playwright smoke checks.

## Global Constraints

- Keep `meta_raw` isolated and do not change `sql/001_initial_schema.sql`.
- Keep the six new workflows manual, inactive, and unpublished; never activate them as schedules during this work.
- Do not alter the pre-existing `OWNERINC - META RAW - ALERTAS EMAIL - V1` workflow without separate authorization.
- PostgreSQL must not publish host port `5432`.
- Generate CA, server keys, passwords, access tokens, and connection strings only in protected runtime locations; never commit them.
- QA data may flow only from Meta to the dedicated PostgreSQL resource.
- Never export Meta payloads, tokens, passwords, certificates, or raw database rows to GitHub, local artifacts, reports, third parties, or chat.
- The dashboard API must never select or serialize `raw_payload`.
- Organic and Paid remain separate in storage, queries, API responses, and interface.
- Do not represent missing data as zero; a numeric zero remains a real value.
- Do not start the executable dashboard before the first live QA execution is validated.

## File Map

- `deploy/docker-compose.yml`: private PostgreSQL service with a read-only TLS mount and PostgreSQL SSL settings.
- `deploy/provision-postgres-tls.sh`: idempotent VPS-only CA/server certificate and `pg_hba.conf` provisioning; prints status only.
- `deploy/verify-postgres-tls.sh`: non-secret TLS and role verification through `psql`; never prints certificate contents or payloads.
- `deploy/README.md`: TLS mount contract, restart order, rollback boundary, and protected paths.
- `docs/qa-live-runbook.md`: manual n8n execution order and sanitized SQL evidence queries.
- `docs/qa-live-report.md`: aggregate-only live QA result template, populated only after remote execution.
- `package.json`: dashboard build/start/test scripts and runtime dependencies after the QA gate.
- `src/db.mjs`: PostgreSQL pool factory with mandatory CA loading and safe shutdown.
- `src/dashboard-api.mjs`: pure request routing, parameter validation, response sanitization, and dashboard handlers.
- `src/dashboard-queries.mjs`: parameterized read-only SQL that omits `raw_payload`.
- `src/server.mjs`: production HTTP server serving API and built static assets.
- `src/dashboard/index.html`, `src/dashboard/main.jsx`, `src/dashboard/styles.css`: Ownerinc dashboard shell and views, created only after live QA approval.
- `src/dashboard/components/*.jsx`: focused metric, status, chart, and table components.
- `tests/dashboard-api.test.mjs`: API contract and secret-exposure tests using an in-memory fake database adapter.
- `tests/dashboard-queries.test.mjs`: query-shape tests proving account/date parameters and no `raw_payload` selection.
- `tests/dashboard-ui.test.mjs`: deterministic component/state tests without production fixtures.
- `Dockerfile`, `.dockerignore`, `deploy/dashboard-compose.yml`, `deploy/dashboard.env.example`: isolated dashboard image and runtime configuration.
- `.github/workflows/deploy-meta-raw-dashboard.yml`: SSH deploy limited to the dashboard Compose project and health check.
- `README.md`, `docs/dashboard-contract.md`, `docs/security-review.md`: operational state, completed gates, and remaining release restrictions.

---

### Task 1: Establish the local execution baseline

**Files:**
- Modify: `projects/meta-raw-pipeline/package.json`
- Modify: root `package-lock.json` only when dependencies are installed after the live QA gate
- Test: `projects/meta-raw-pipeline/tests/contract.test.mjs`

**Interfaces:**
- Consumes: the existing workspace package and isolated schema contract.
- Produces: a clean baseline test command and a tracked list of unrelated working-tree changes that must not be overwritten.

- [ ] **Step 1: Record the current project-only status**

Run:

```powershell
git status --short -- projects/meta-raw-pipeline
npm test --workspace=meta-raw-pipeline
```

Expected: existing contract tests pass; unrelated root/workspace modifications remain untouched.

- [ ] **Step 2: Confirm the six workflow exports are inactive and unpublished**

Run:

```powershell
node --input-type=module -e "import { readdir, readFile } from 'node:fs/promises'; const dir='projects/meta-raw-pipeline/n8n/workflows'; for (const file of await readdir(dir)) { if (!file.endsWith('.json')) continue; const { workflow: w }=JSON.parse(await readFile(dir + '/' + file,'utf8')); if (w.active !== false || w.activeVersionId !== null) throw new Error(file + ' is not inactive/unpublished'); } console.log('WORKFLOW_STATE_OK')"
```

Expected: `WORKFLOW_STATE_OK`.

- [ ] **Step 3: Preserve the passing baseline**

Do not change production code or create a commit for a passing baseline. If the baseline exposes a project-local defect, stop before TLS work, document the exact failing assertion, and keep the unrelated working-tree changes untouched.

---

### Task 2: Add VPS-only PostgreSQL TLS provisioning

**Files:**
- Modify: `projects/meta-raw-pipeline/deploy/docker-compose.yml`
- Create: `projects/meta-raw-pipeline/deploy/provision-postgres-tls.sh`
- Create: `projects/meta-raw-pipeline/deploy/verify-postgres-tls.sh`
- Modify: `projects/meta-raw-pipeline/deploy/README.md`
- Test: `projects/meta-raw-pipeline/tests/tls-contract.test.mjs`

**Interfaces:**
- Consumes: `/opt/ownerinc/secrets/meta-raw-pipeline/postgres-admin.env` and the fixed service name `meta-raw-postgres`.
- Produces: `/opt/ownerinc/secrets/meta-raw-pipeline/tls/ca.crt`, `server.crt`, `server.key`, and `pg_hba.conf`; Compose mounts them read-only and PostgreSQL requires SSL for TCP clients.

- [ ] **Step 1: Write the TLS contract test**

Create a test that reads the Compose and scripts and asserts:

```js
assert.match(compose, /meta-raw-pipeline\/tls:\/tls:ro/);
assert.match(compose, /ssl=on/);
assert.match(compose, /ssl_cert_file=\/tls\/server\.crt/);
assert.match(compose, /ssl_key_file=\/tls\/server\.key/);
assert.doesNotMatch(compose, /ports:\s*\n\s*-\s*["']?5432/);
assert.match(provisioner, /openssl/);
assert.match(provisioner, /chmod 600/);
assert.match(verifier, /sslmode=require/);
assert.doesNotMatch(provisioner, /cat .*server\.key|echo .*server\.key/);
```

- [ ] **Step 2: Run the contract test and verify it fails for the current Compose**

Run:

```powershell
node --test tests/tls-contract.test.mjs --test-reporter=spec
```

Expected: FAIL because the current Compose has no TLS mount or SSL settings.

- [ ] **Step 3: Add the read-only TLS mount and PostgreSQL SSL command**

Update the PostgreSQL service with the following runtime contract, retaining the existing private networks and no `ports` section:

```yaml
command:
  - postgres
  - -c
  - ssl=on
  - -c
  - ssl_cert_file=/tls/server.crt
  - -c
  - ssl_key_file=/tls/server.key
  - -c
  - hba_file=/tls/pg_hba.conf
volumes:
  - /opt/ownerinc/apps/meta-raw-pipeline/postgres:/var/lib/postgresql/data
  - /opt/ownerinc/secrets/meta-raw-pipeline/tls:/tls:ro
```

The server certificate must contain `DNS:meta-raw-postgres` and the private key must be readable by the PostgreSQL container user on the VPS. Do not put certificate bytes or key material in Compose.

- [ ] **Step 4: Implement idempotent VPS certificate provisioning**

The script must:

1. use `set -eu` and `umask 077`;
2. create the protected TLS directory with mode `700`;
3. generate a 4096-bit RSA CA key and self-signed CA certificate only when absent;
4. generate the server key and certificate only when absent, with SANs `DNS:meta-raw-postgres` and `DNS:localhost`;
5. write a `pg_hba.conf` containing local socket access and `hostssl` rules, followed by `host ... reject` rules so non-TLS TCP connections are rejected;
6. set certificate modes to `644`, key mode to `600`, and never print file contents;
7. exit before changing PostgreSQL if an existing certificate fails its validity check.

The script may print only paths, file modes, certificate subject/expiry metadata, and the final `TLS_MATERIAL_READY` marker. It must not print private keys, passwords, connection strings, or database rows.

- [ ] **Step 5: Implement non-secret TLS verification**

The verifier must run `docker exec meta-raw-postgres psql` with `sslmode=require` and return only:

```text
POSTGRES_SSL_ON
POSTGRES_HOSTSSL_ENFORCED
APP_ROLE_NON_PRIVILEGED
TLS_VERIFY_OK
```

It must query `pg_settings` for `ssl`, `pg_stat_ssl` for the current connection, and role flags for `meta_raw_app`. It must use a temporary SQL file with a trap that removes it and must not select `raw_payload`, `error_message`, or certificate contents.

- [ ] **Step 6: Run the contract test and static safety checks**

Run:

```powershell
node --test tests/tls-contract.test.mjs --test-reporter=spec
git diff --check -- projects/meta-raw-pipeline
```

Expected: PASS; no `5432` host mapping, secret literals, or private-key output paths are present.

- [ ] **Step 7: Commit the TLS configuration**

```powershell
git add -- projects/meta-raw-pipeline/deploy/docker-compose.yml projects/meta-raw-pipeline/deploy/provision-postgres-tls.sh projects/meta-raw-pipeline/deploy/verify-postgres-tls.sh projects/meta-raw-pipeline/deploy/README.md projects/meta-raw-pipeline/tests/tls-contract.test.mjs
git commit -m "feat: require private postgres TLS for meta raw pipeline"
```

---

### Task 3: Prepare the controlled live QA runbook

**Files:**
- Create: `projects/meta-raw-pipeline/docs/qa-live-runbook.md`
- Create: `projects/meta-raw-pipeline/docs/qa-live-report.md`
- Modify: `projects/meta-raw-pipeline/docs/qa-report.md`
- Modify: `projects/meta-raw-pipeline/docs/security-review.md`
- Test: `projects/meta-raw-pipeline/tests/qa-runbook.test.mjs`

**Interfaces:**
- Consumes: the six workflow IDs and the TLS verifier output.
- Produces: a manual execution order and aggregate-only SQL evidence; no payload export or production fixture.

- [ ] **Step 1: Write the failing runbook contract test**

Assert that the runbook names the six workflow IDs, says manual execution, forbids activation/publication, includes `collection_run_id`, counts and `integration_logs`, and explicitly forbids payload/file/GitHub export. Assert that the report template contains no sample metrics or payload values.

- [ ] **Step 2: Document the restart and credential order**

The runbook must require this order:

1. snapshot current service status without printing environment files;
2. provision TLS material on the VPS;
3. restart only `meta-raw-postgres` and wait for health;
4. mount the public CA into n8n and set the dedicated credential to TLS `require`/certificate validation according to the n8n credential UI;
5. restart only the n8n service;
6. run the non-secret verifier;
7. execute workflows manually, one at a time, from the n8n UI.

No workflow may be published or activated to accomplish QA.

- [ ] **Step 3: Add the six-workflow QA matrix**

Use these rows without adding other accounts or destinations:

| Workflow | ID | Account/input | Evidence |
|---|---|---|---|
| Media Discovery - C1 | `6Lu7bCvKPMMJKkfE` | Instagram `17841449595671459`, bounded 30-day window | run status, media count, `collection_run_id` |
| Stories Discovery - C2 | `F5wU8CN34kHSYfqd` | Instagram `17841449595671459` | run status, story count, `collection_run_id` |
| Stories Insights - C2 | `NJ3gwPPWyUMAQTPM` | Instagram `17841449595671459` | metric status/counts, `integration_logs` |
| Collaborative Media - C2 | `txQorqTsuTEPasfb` | Instagram `17841449595671459` | collaborator count, status |
| Ads Structure Sync - C3 | `RZx96pisAg2i9DaQ` | Ads `act_277127183253232` | campaign/adset/ad/creative counts |
| Ads Insights - C3 | `lOJbgByhiMzdOTNq` | Ads `act_277127183253232`, explicit `date_start`/`date_stop` | metric rows, period, status |

- [ ] **Step 4: Add aggregate-only SQL evidence**

The runbook must use queries shaped like these, with dates and IDs supplied interactively and never written into the repository:

```sql
SELECT workflow_name, source, status, period_start, period_end,
       records_requested, records_received, records_inserted,
       records_updated, error_count
FROM meta_raw.collection_runs
ORDER BY started_at DESC
LIMIT 20;

SELECT collection_run_id, workflow_name, status, count(*) AS log_count,
       count(*) FILTER (WHERE status = 'ERROR') AS error_count
FROM meta_raw.integration_logs
GROUP BY collection_run_id, workflow_name, status
ORDER BY max(started_at) DESC;

SELECT 'instagram_media' AS table_name, count(*) AS row_count
FROM meta_raw.instagram_media
WHERE account_id = $1
UNION ALL
SELECT 'instagram_organic_metrics', count(*)
FROM meta_raw.instagram_organic_metrics
WHERE account_id = $1
UNION ALL
SELECT 'meta_paid_metrics', count(*)
FROM meta_raw.meta_paid_metrics
WHERE ad_account_id = $2 AND date_start >= $3 AND date_stop <= $4;

SELECT count(*) AS suspicious_payload_count
FROM meta_raw.instagram_media
WHERE raw_payload::text ~* '(access_token|password|secret|private_key)';
```

The final query returns a count only; it must never print matching payload text. Equivalent checks cover logs without selecting `error_message`.

- [ ] **Step 5: Add the idempotency check**

Use unique-key comparisons for the rows created by the selected run, for example:

```sql
SELECT count(*) - count(DISTINCT (account_id, instagram_media_id)) AS duplicate_media_keys
FROM meta_raw.instagram_media
WHERE account_id = $1;
```

Repeat for the relevant metrics/entities using their declared unique-key columns. The expected value is `0`.

- [ ] **Step 6: Run the runbook contract test and commit the documentation**

```powershell
node --test tests/qa-runbook.test.mjs --test-reporter=spec
git add -- projects/meta-raw-pipeline/docs/qa-live-runbook.md projects/meta-raw-pipeline/docs/qa-live-report.md projects/meta-raw-pipeline/docs/qa-report.md projects/meta-raw-pipeline/docs/security-review.md projects/meta-raw-pipeline/tests/qa-runbook.test.mjs
git commit -m "docs: prepare controlled meta raw live QA"
```

---

### Task 4: Execute TLS and live QA when VPS/n8n access is available

**Files:**
- Modify remotely: `/opt/ownerinc/apps/meta-raw-pipeline/docker-compose.yml`
- Create remotely: `/opt/ownerinc/secrets/meta-raw-pipeline/tls/`
- Modify remotely: the n8n Compose mount and dedicated PostgreSQL credential only
- Modify: `projects/meta-raw-pipeline/docs/qa-live-report.md`
- Modify: `projects/meta-raw-pipeline/docs/security-review.md`

**Interfaces:**
- Consumes: Task 2 scripts, Task 3 runbook, VPS shell access, n8n access, and the dedicated credentials.
- Produces: validated TLS evidence and an aggregate-only QA report; no production payload artifact.

- [ ] **Step 1: Stop if required external access is unavailable**

Do not simulate the result. If the VPS, n8n, or dedicated credential cannot be reached, leave the runbook and report template in the repository and report the exact missing access. Do not create fake `collection_run_id` values or sample counts.

- [ ] **Step 2: Capture pre-change service state without secrets**

Record only container names, health states, image names, network names, and whether host port `5432` is published. Never print `docker inspect` environment arrays or mounted secret contents.

- [ ] **Step 3: Provision and verify PostgreSQL TLS**

Run the provisioner, update the remote Compose mount, recreate only the dedicated PostgreSQL container, and run the verifier. A failed TLS check blocks all workflow execution.

- [ ] **Step 4: Update n8n trust and the dedicated PostgreSQL credential**

Mount only the public CA read-only into n8n. Update only credential ID `Og0fnARJo2ylLGWW` and keep host `meta-raw-postgres`, database/user unchanged, and SSL enabled. Do not print or copy the password.

- [ ] **Step 5: Execute the six workflows manually in the documented order**

Use the n8n UI with explicit dates for Ads Insights. Capture only the execution status and sanitized metadata. Do not download execution data, export workflow runs, or attach payloads to GitHub.

- [ ] **Step 6: Run aggregate-only database checks**

Verify status, counts, periods, logs, suspicious-secret counts, and idempotency. If a workflow fails, record a normalized error code and stop before changing workflow logic or activating it.

- [ ] **Step 7: Populate and review the live QA report**

Write only aggregate results and authorized run identifiers. Mark the first live QA gate as `PASS`, `PARTIAL`, or `BLOCKED`; never infer success from a missing row. Update the security review to reflect actual TLS evidence while keeping release authorization separate.

- [ ] **Step 8: Commit only sanitized QA evidence**

```powershell
git add -- projects/meta-raw-pipeline/docs/qa-live-report.md projects/meta-raw-pipeline/docs/security-review.md
git commit -m "docs: record sanitized meta raw live QA"
```

---

### Task 5: Implement the sanitized read-only dashboard API after QA approval

**Files:**
- Modify: `projects/meta-raw-pipeline/package.json`
- Modify: root `package-lock.json` through `npm install --workspace=meta-raw-pipeline`
- Create: `projects/meta-raw-pipeline/src/db.mjs`
- Create: `projects/meta-raw-pipeline/src/dashboard-queries.mjs`
- Create: `projects/meta-raw-pipeline/src/dashboard-api.mjs`
- Create: `projects/meta-raw-pipeline/src/server.mjs`
- Test: `projects/meta-raw-pipeline/tests/dashboard-queries.test.mjs`
- Test: `projects/meta-raw-pipeline/tests/dashboard-api.test.mjs`

**Interfaces:**
- Consumes: validated live QA schema and environment variables `META_RAW_DB_HOST`, `META_RAW_DB_PORT`, `META_RAW_DB_NAME`, `META_RAW_DB_USER`, `META_RAW_DB_PASSWORD`, `META_RAW_DB_CA_FILE`, `META_RAW_ORGANIC_ACCOUNT_ID`, and `META_RAW_AD_ACCOUNT_ID`.
- Produces: `createDbPool()`, `createDashboardApi({ db, staticDir })`, and sanitized JSON responses at the five approved `/api` routes.

- [ ] **Step 1: Install the smallest required runtime dependencies after the QA gate**

Add React, React DOM, Vite, the Vite React plugin, and `pg` to the workspace package. Add scripts:

```json
{
  "dev": "vite",
  "build": "vite build",
  "start": "node src/server.mjs",
  "test": "node --test tests/*.test.mjs",
  "verify": "npm test && npm run build"
}
```

Use the existing root workspace lockfile; do not create a second lockfile inside the project.

- [ ] **Step 2: Write database pool tests first**

Assert that `createDbPool()` reads the CA from `META_RAW_DB_CA_FILE`, passes `ssl: { ca, rejectUnauthorized: true }`, sets `max`, and throws a clear configuration error when the CA file is missing. The test must use a temporary CA file containing a test marker and never a production certificate.

- [ ] **Step 3: Implement `src/db.mjs`**

Export:

```js
export function createDbPool({ env = process.env, fs = readFile } = {})
```

Require all connection fields and the CA file. Configure `pg.Pool` with TLS verification, `application_name: 'meta-raw-dashboard'`, bounded pool size, and statement timeout. Export `closeDbPool(pool)` for graceful shutdown.

- [ ] **Step 4: Write query-shape tests before query implementation**

Use a fake database adapter that records `(text, values)` and returns aggregate rows. Assert every query:

1. uses parameter placeholders for dates and account IDs;
2. references only approved `meta_raw` columns;
3. never contains `SELECT *`;
4. never selects or returns `raw_payload`;
5. keeps Organic and Paid queries separate;
6. returns explicit empty/`NOT_VALIDATED` state when no validated rows exist.

- [ ] **Step 5: Implement `src/dashboard-queries.mjs`**

Export functions with these signatures:

```js
getSummary(db, { periodStart, periodEnd, organicAccountId, adAccountId })
getTimeseries(db, { channel, periodStart, periodEnd, organicAccountId, adAccountId })
getDefinitions(db, { channel })
getQuality(db, { periodStart, periodEnd })
```

Use separate parameterized queries for:

- Organic media/story/collaborator counts and metric observations;
- Paid campaign/adset/ad/creative counts and `meta_paid_metrics` observations;
- metric definitions;
- collection runs and integration-log aggregate counts.

Only additive metrics may be summed directly. For CTR, CPC, CPM, frequency, and reach, return component aggregates or explicit unavailable states rather than summing ratio/reach values.

- [ ] **Step 6: Write API routing and sanitization tests**

Cover:

```js
assert.equal(response.statusCode, 400); // reversed dates or missing account for a channel
assert.equal(response.body.organic.status, 'NOT_VALIDATED'); // no QA rows
assert.equal(response.body.organic.metrics[0].value, 0); // real zero
assert.equal(response.body.paid.metrics[0].value, null); // unavailable, not zero
assert.equal(JSON.stringify(response.body).includes('raw_payload'), false);
assert.equal(JSON.stringify(response.body).includes('password'), false);
```

- [ ] **Step 7: Implement `src/dashboard-api.mjs`**

Export:

```js
function createDashboardApi({ db, staticDir, clock = () => new Date() })
```

Validate `YYYY-MM-DD` with a calendar check, require Organic account IDs for Organic requests and Paid account IDs for Paid requests, reject reversed ranges, and return `application/json` with `Cache-Control: no-store`. Normalize errors to `{ error: { code, message } }` without database messages, SQL, connection strings, or upstream payloads.

- [ ] **Step 8: Implement `src/server.mjs`**

Create a Node `http` server that routes `/api/*` to the dashboard API and serves only files under the built static directory. Add strict path traversal protection, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a same-origin Content Security Policy that permits no external scripts or connections. Handle SIGTERM by closing the HTTP server and pool.

- [ ] **Step 9: Run API tests and commit**

```powershell
npm test --workspace=meta-raw-pipeline
git diff --check -- projects/meta-raw-pipeline
git add -- package-lock.json projects/meta-raw-pipeline/package.json projects/meta-raw-pipeline/src projects/meta-raw-pipeline/tests
git commit -m "feat: add sanitized meta raw dashboard API"
```

---

### Task 6: Build the Ownerinc dashboard interface after the API contract passes

**Files:**
- Create: `projects/meta-raw-pipeline/src/dashboard/index.html`
- Create: `projects/meta-raw-pipeline/src/dashboard/main.jsx`
- Create: `projects/meta-raw-pipeline/src/dashboard/styles.css`
- Create: `projects/meta-raw-pipeline/src/dashboard/components/MetricCard.jsx`
- Create: `projects/meta-raw-pipeline/src/dashboard/components/StatusBadge.jsx`
- Create: `projects/meta-raw-pipeline/src/dashboard/components/TimeSeries.jsx`
- Create: `projects/meta-raw-pipeline/src/dashboard/components/DataTable.jsx`
- Test: `projects/meta-raw-pipeline/tests/dashboard-ui.test.mjs`

**Interfaces:**
- Consumes: the five `/api` routes and response states from Task 5.
- Produces: accessible Overview, Organic, Paid, and Quality views with no production fixtures and no direct database access.

- [ ] **Step 1: Write UI state tests without production data**

Use only explicit state objects such as:

```js
{ status: 'NOT_VALIDATED', metrics: [] }
{ status: 'AVAILABLE', metrics: [{ name: 'reach', value: 0, status: 'AVAILABLE' }] }
{ status: 'UNAVAILABLE', metrics: [{ name: 'reach', value: null, status: 'UNAVAILABLE' }] }
```

Assert that zero renders as `0`, null renders as `Unavailable`, Organic and Paid have separate headings, and no component receives a database URL or payload field.

- [ ] **Step 2: Implement the shell and navigation**

Use local static assets only, a skip link, keyboard-visible focus, semantic navigation, and responsive route-like state. Use the approved Ownerinc palette: `#f3f0e8`, `#fffdf7`, `#172027`, `#667179`, `#d3d0c7`, `#071018`, `#37bdd2`, and `#d6574d`. Do not add gradients.

- [ ] **Step 3: Implement the four views**

Overview calls summary; Organic calls Organic summary/timeseries; Paid calls Paid summary/timeseries; Quality calls quality/definitions. All requests use same-origin `fetch('/api/...')`, and errors show normalized status without raw server text.

- [ ] **Step 4: Implement focused components**

`MetricCard` renders label, value, status and `observed_at`; `StatusBadge` maps known states to text and tone; `TimeSeries` renders a CSS/SVG-free accessible table fallback with an optional inline SVG line; `DataTable` renders sanitized rows and an explicit empty state. No chart library or external font request is required.

- [ ] **Step 5: Run the UI tests and local build**

```powershell
npm test --workspace=meta-raw-pipeline
npm run build --workspace=meta-raw-pipeline
```

Expected: all API/UI tests pass and `dist/` contains only static build assets without `.env`, certificates, payloads, or source maps containing runtime secrets.

- [ ] **Step 6: Commit the UI**

```powershell
git add -- projects/meta-raw-pipeline/src/dashboard projects/meta-raw-pipeline/tests/dashboard-ui.test.mjs
git commit -m "feat: add Ownerinc meta raw dashboard views"
```

---

### Task 7: Add isolated container and GitHub auto-deploy

**Files:**
- Create: `projects/meta-raw-pipeline/Dockerfile`
- Create: `projects/meta-raw-pipeline/.dockerignore`
- Create: `projects/meta-raw-pipeline/deploy/dashboard-compose.yml`
- Create: `projects/meta-raw-pipeline/deploy/dashboard.env.example`
- Create: `projects/meta-raw-pipeline/.github/workflows/deploy-meta-raw-dashboard.yml`
- Modify: `projects/meta-raw-pipeline/deploy/README.md`
- Test: `projects/meta-raw-pipeline/tests/deploy-contract.test.mjs`

**Interfaces:**
- Consumes: the built server and `/opt/ownerinc/secrets/meta-raw-pipeline/tls/ca.crt` on the VPS.
- Produces: a dashboard-only Compose project attached to `n8n_internal`, with health-checked SSH deployment.

- [ ] **Step 1: Write deployment contract tests**

Assert that Docker/Compose/Actions:

1. expose only the dashboard HTTP port intended for the internal reverse proxy;
2. mount only `ca.crt` read-only, never `server.key`;
3. contain no literal secret values;
4. attach to external `n8n_internal` and do not define PostgreSQL;
5. run `docker compose up -d --build dashboard` only in the dashboard directory;
6. run a health check before reporting success;
7. do not execute workflow activation, database migration, or broad `docker compose down`.

- [ ] **Step 2: Implement the production image**

Use a multi-stage Node image: install production dependencies, build Vite assets, copy only production files and `dist`, run as a non-root user, set `NODE_ENV=production`, and expose the health endpoint. `.dockerignore` must exclude `.env*`, `*.key`, `*.crt`, `node_modules`, test output, and local reports.

- [ ] **Step 3: Implement dashboard Compose**

Define one `dashboard` service with `restart: unless-stopped`, `read_only: true` where compatible, a temporary writable directory, a healthcheck against `/api/health`, the external `n8n_internal` network, and environment variables loaded from `/opt/ownerinc/secrets/meta-raw-pipeline/dashboard.env`. Mount `/opt/ownerinc/secrets/meta-raw-pipeline/tls/ca.crt:/run/secrets/meta-raw-ca/ca.crt:ro`.

- [ ] **Step 4: Implement GitHub Actions deploy**

Use SSH host/user/key secrets and a repository ref. The remote script must `git fetch`/checkout the requested commit in the dashboard deployment directory, validate the Compose file, build and start only the dashboard service, wait for its health endpoint, and print only service status. It must not receive database passwords or CA private keys as workflow variables.

- [ ] **Step 5: Run deployment contract tests and commit**

```powershell
node --test tests/deploy-contract.test.mjs --test-reporter=spec
git diff --check -- projects/meta-raw-pipeline
git add -- projects/meta-raw-pipeline/Dockerfile projects/meta-raw-pipeline/.dockerignore projects/meta-raw-pipeline/deploy/dashboard-compose.yml projects/meta-raw-pipeline/deploy/dashboard.env.example projects/meta-raw-pipeline/.github/workflows/deploy-meta-raw-dashboard.yml projects/meta-raw-pipeline/deploy/README.md projects/meta-raw-pipeline/tests/deploy-contract.test.mjs
git commit -m "chore: add isolated meta raw dashboard deployment"
```

---

### Task 8: Validate the completed local delivery and release gate

**Files:**
- Modify: `projects/meta-raw-pipeline/README.md`
- Modify: `projects/meta-raw-pipeline/docs/dashboard-contract.md`
- Modify: `projects/meta-raw-pipeline/docs/security-review.md`
- Modify: `projects/meta-raw-pipeline/docs/qa-live-report.md`

**Interfaces:**
- Consumes: all prior tests, sanitized QA evidence, and remote deployment health output.
- Produces: a truthful operational status; release activation remains blocked until explicit authorization.

- [ ] **Step 1: Run the project checks**

```powershell
npm test --workspace=meta-raw-pipeline
npm run verify --workspace=meta-raw-pipeline
npm run build --workspace=meta-raw-pipeline
git diff --check
```

- [ ] **Step 2: Run root verification**

```powershell
npm run verify
```

Preserve unrelated existing skips or environment failures; do not suppress a new dashboard failure.

- [ ] **Step 3: Run browser smoke checks when a local server is available**

Check desktop and mobile layouts for navigation, explicit unavailable states, Organic/Paid separation, keyboard focus, no horizontal overflow, and `/api/health`. Do not attach production response bodies to artifacts.

- [ ] **Step 4: Recheck workflow and network gates**

Confirm all six exports and live n8n records remain `active=false`/unpublished, PostgreSQL has no host `5432` mapping, dashboard API responses contain no secret-shaped fields, and the pre-existing alert workflow was not changed.

- [ ] **Step 5: Update the docs truthfully**

Change `docs/dashboard-contract.md` from pre-QA gate wording only after live QA has passed. If the remote gate remains unavailable, leave the dashboard implementation blocked and record `BLOCKED_EXTERNAL` rather than claiming validation.

- [ ] **Step 6: Commit only the final sanitized documentation**

```powershell
git add -- projects/meta-raw-pipeline/README.md projects/meta-raw-pipeline/docs/dashboard-contract.md projects/meta-raw-pipeline/docs/security-review.md projects/meta-raw-pipeline/docs/qa-live-report.md
git commit -m "docs: finalize meta raw dashboard verification"
```

## Plan Self-Review

- TLS coverage: Tasks 2 and 4 configure, verify, and document private PostgreSQL TLS without exposing keys.
- QA coverage: Tasks 3 and 4 define the six workflows, aggregate-only evidence, idempotency, secret scans, and the external-access stop condition.
- Dashboard coverage: Tasks 5 and 6 implement the API and four views only after the live QA gate.
- Deploy coverage: Task 7 isolates the dashboard, mounts only the public CA, and limits GitHub Actions to one service.
- Release safety: Tasks 1, 4, and 8 preserve inactive/unpublished workflows and keep authorization separate.
- No step uses production fixtures, selects `raw_payload` in API queries, or requires a secret in Git.
