import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('postgres compose requires private TLS without a public database port', async () => {
  const compose = await readProjectFile('deploy/docker-compose.yml');

  assert.match(compose, /\/opt\/ownerinc\/secrets\/meta-raw-pipeline\/tls\/server:\/tls:ro/);
  assert.match(compose, /- ssl=on/);
  assert.match(compose, /- ssl_cert_file=\/tls\/server\.crt/);
  assert.match(compose, /- ssl_key_file=\/tls\/server\.key/);
  assert.match(compose, /- hba_file=\/tls\/pg_hba\.conf/);
  assert.doesNotMatch(compose, /ports:\s*[\s\S]*5432/);
});

test('tls scripts generate and verify material without printing private data', async () => {
  const provisioner = await readProjectFile('deploy/provision-postgres-tls.sh');
  const verifier = await readProjectFile('deploy/verify-postgres-tls.sh');

  assert.match(provisioner, /openssl genrsa/);
  assert.match(provisioner, /subjectAltName=DNS:meta-raw-postgres/);
  assert.match(provisioner, /chmod 600/);
  assert.match(provisioner, /hostssl/);
  assert.match(provisioner, /host .*reject/);
  assert.doesNotMatch(provisioner, /cat\s+.*server\.key/);
  assert.doesNotMatch(provisioner, /echo\s+.*server\.key/);
  assert.match(verifier, /sslmode=require/);
  assert.match(verifier, /pg_stat_ssl/);
  assert.match(verifier, /APP_ROLE_NON_PRIVILEGED/);
  assert.doesNotMatch(verifier, /raw_payload/);
  assert.doesNotMatch(verifier, /error_message/);
});
