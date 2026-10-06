import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const workspaceRoot = new URL('../../../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), 'utf8');
}

async function readWorkspaceFile(path) {
  return readFile(new URL(path, workspaceRoot), 'utf8');
}

test('dashboard deployment stays private and isolated from n8n/postgres restarts', async () => {
  const compose = await readProjectFile('deploy/dashboard-compose.yml');
  const script = await readProjectFile('deploy/deploy-dashboard.sh');
  const provisioner = await readProjectFile('deploy/provision-dashboard-readonly.sh');
  const envExample = await readProjectFile('deploy/dashboard.env.example');
  const dockerfile = await readProjectFile('Dockerfile');

  assert.match(compose, /meta_raw_internal/);
  assert.match(compose, /ownerinc_proxy/);
  assert.match(compose, /ca\.crt:\/run\/secrets\/meta-raw\/ca\.crt:ro/);
  assert.match(compose, /expose:/);
  assert.doesNotMatch(compose, /ports:/);
  assert.doesNotMatch(compose, /5432:\s*5432/);
  assert.match(script, /up -d --no-deps dashboard/);
  assert.doesNotMatch(script, /postgres|n8n/i);
  assert.match(provisioner, /meta_raw_dashboard/);
  assert.match(provisioner, /GRANT SELECT ON ALL TABLES/);
  assert.match(provisioner, /DASHBOARD_ROLE_READ_ONLY/);
  assert.doesNotMatch(provisioner, /GRANT SELECT, INSERT|GRANT .*UPDATE.*meta_raw_dashboard|GRANT .*DELETE.*meta_raw_dashboard/);
  assert.match(envExample, /META_RAW_DB_USER=meta_raw_dashboard/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.doesNotMatch(dockerfile, /COPY\s+\.env|DATABASE_URL/);
});

test('GitHub deployment requires explicit transport secrets and project paths', async () => {
  const workflow = await readWorkspaceFile('.github/workflows/meta-raw-dashboard.yml');

  assert.match(workflow, /projects\/meta-raw-pipeline/);
  assert.match(workflow, /OWNERINC_VPS_SSH_KEY/);
  assert.match(workflow, /OWNERINC_VPS_KNOWN_HOSTS/);
  assert.match(workflow, /OWNERINC_GHCR_READ_TOKEN/);
  assert.match(workflow, /DASHBOARD_IMAGE/);
  assert.match(workflow, /deploy-dashboard\.sh/);
  assert.doesNotMatch(workflow, /POSTGRES_PASSWORD|META_GRAPH|N8N_API_KEY/);
});
