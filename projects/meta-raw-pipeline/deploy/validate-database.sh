#!/usr/bin/env bash
set -eu

ADMIN_ENV=/opt/ownerinc/secrets/meta-raw-pipeline/postgres-admin.env
APP_ENV=/opt/ownerinc/secrets/meta-raw-pipeline/app.env
APP_FILE=/tmp/meta-raw-app.env

set -a
. "$ADMIN_ENV"
. "$APP_ENV"
set +a

echo '--- admin identity and schema ---'
cat > /tmp/meta-raw-admin-check.sql <<'SQL'
SELECT current_database(), current_user;
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'meta_raw';
SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'meta_raw_app';
SELECT has_schema_privilege('meta_raw_app', 'meta_raw', 'USAGE'), has_schema_privilege('meta_raw_app', 'meta_raw', 'CREATE');
SQL
docker exec -i meta-raw-postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -v ON_ERROR_STOP=1 -f -' \
  < /tmp/meta-raw-admin-check.sql
rm -f /tmp/meta-raw-admin-check.sql

trap 'docker exec meta-raw-postgres rm -f "$APP_FILE" >/dev/null 2>&1 || true' EXIT
cat "$APP_ENV" | docker exec -i meta-raw-postgres sh -c "cat > $APP_FILE; chmod 600 $APP_FILE"

echo '--- app role read and transactional write ---'
cat > /tmp/meta-raw-app-check.sql <<'SQL'
SELECT current_database(), current_user, current_schema();
SELECT count(*) FROM meta_raw.collection_runs;
SELECT has_schema_privilege(current_user, 'meta_raw', 'USAGE'), has_schema_privilege(current_user, 'meta_raw', 'CREATE');
BEGIN;
INSERT INTO meta_raw.collection_runs(workflow_name, source, status)
VALUES ('qa-rollback-test', 'qa', 'RUNNING')
RETURNING id;
ROLLBACK;
SQL
cat /tmp/meta-raw-app-check.sql | docker exec -i meta-raw-postgres sh -c \
  'set -a; . /tmp/meta-raw-app.env; set +a; PGPASSWORD="$META_RAW_DB_PASSWORD" psql -h 127.0.0.1 -U "$META_RAW_DB_USER" -d "$META_RAW_DB_NAME" -At -F "|" -v ON_ERROR_STOP=1 -f -'
rm -f /tmp/meta-raw-app-check.sql

echo 'APP_ROLE_ROLLBACK_TEST_OK'
