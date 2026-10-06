#!/usr/bin/env bash
set -eu

ADMIN_ENV=/opt/ownerinc/secrets/meta-raw-pipeline/postgres-admin.env
APP_ENV=/opt/ownerinc/secrets/meta-raw-pipeline/app.env
SCHEMA_FILE=/opt/ownerinc/apps/meta-raw-pipeline/001_initial_schema.sql

set -a
. "$ADMIN_ENV"
. "$APP_ENV"
set +a

umask 077
BOOTSTRAP_SQL=/tmp/meta-raw-bootstrap.sql

cat > "$BOOTSTRAP_SQL" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meta_raw_app') THEN
    CREATE ROLE meta_raw_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$META_RAW_DB_PASSWORD';
  ELSE
    ALTER ROLE meta_raw_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$META_RAW_DB_PASSWORD';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO meta_raw_app;
SQL

docker exec -i meta-raw-postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < "$BOOTSTRAP_SQL"

cat "$SCHEMA_FILE" | docker exec -i meta-raw-postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'

docker exec meta-raw-postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA meta_raw TO meta_raw_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA meta_raw TO meta_raw_app; GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA meta_raw TO meta_raw_app; ALTER DEFAULT PRIVILEGES FOR ROLE meta_raw_admin IN SCHEMA meta_raw GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO meta_raw_app; ALTER DEFAULT PRIVILEGES FOR ROLE meta_raw_admin IN SCHEMA meta_raw GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO meta_raw_app; ALTER ROLE meta_raw_app IN DATABASE meta_raw_pipeline SET search_path TO meta_raw, public;"'

rm -f "$BOOTSTRAP_SQL"
