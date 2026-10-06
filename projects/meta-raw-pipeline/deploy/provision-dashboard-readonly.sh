#!/usr/bin/env bash
set -eu

ADMIN_ENV=${ADMIN_ENV:-/opt/ownerinc/secrets/meta-raw-pipeline/postgres-admin.env}
DASHBOARD_ENV=${DASHBOARD_ENV:-/opt/ownerinc/secrets/meta-raw-pipeline/dashboard.env}
CONTAINER=${CONTAINER:-meta-raw-postgres}

if [ ! -s "$ADMIN_ENV" ] || [ ! -s "$DASHBOARD_ENV" ]; then
  echo 'Required protected database environment file is missing.' >&2
  exit 1
fi

set -a
. "$ADMIN_ENV"
. "$DASHBOARD_ENV"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${META_RAW_DB_PASSWORD:?META_RAW_DB_PASSWORD is required}"

case "$META_RAW_DB_PASSWORD" in
  *[!A-Za-z0-9._~+-]*)
    echo 'META_RAW_DB_PASSWORD must contain only shell-safe password characters.' >&2
    exit 1
    ;;
esac

umask 077
SQL_FILE=$(mktemp /tmp/meta-raw-dashboard.XXXXXX.sql)
DASHBOARD_FILE=/tmp/meta-raw-dashboard.env
trap 'rm -f "$SQL_FILE"; docker exec "$CONTAINER" rm -f "$DASHBOARD_FILE" >/dev/null 2>&1 || true' EXIT

cat > "$SQL_FILE" <<'SQL'
SELECT format(
  'CREATE ROLE meta_raw_dashboard LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
  :'dashboard_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meta_raw_dashboard')\gexec

ALTER ROLE meta_raw_dashboard LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'dashboard_password';
SELECT format('GRANT CONNECT ON DATABASE %I TO meta_raw_dashboard', :'database_name')\gexec
REVOKE ALL PRIVILEGES ON SCHEMA meta_raw FROM meta_raw_dashboard;
GRANT USAGE ON SCHEMA meta_raw TO meta_raw_dashboard;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA meta_raw FROM meta_raw_dashboard;
GRANT SELECT ON ALL TABLES IN SCHEMA meta_raw TO meta_raw_dashboard;
ALTER DEFAULT PRIVILEGES FOR ROLE meta_raw_admin IN SCHEMA meta_raw REVOKE ALL ON TABLES FROM meta_raw_dashboard;
ALTER DEFAULT PRIVILEGES FOR ROLE meta_raw_admin IN SCHEMA meta_raw GRANT SELECT ON TABLES TO meta_raw_dashboard;
SELECT format('ALTER ROLE meta_raw_dashboard IN DATABASE %I SET search_path TO meta_raw, public', :'database_name')\gexec

SELECT CASE
  WHEN rolsuper = false AND rolcreatedb = false AND rolcreaterole = false
  THEN 'DASHBOARD_ROLE_NON_PRIVILEGED'
  ELSE 'DASHBOARD_ROLE_PRIVILEGED'
END
FROM pg_roles
WHERE rolname = 'meta_raw_dashboard';
SELECT CASE
  WHEN has_schema_privilege('meta_raw_dashboard', 'meta_raw', 'USAGE')
   AND has_schema_privilege('meta_raw_dashboard', 'meta_raw', 'CREATE') = false
   AND has_table_privilege('meta_raw_dashboard', 'meta_raw.collection_runs', 'SELECT')
   AND has_table_privilege('meta_raw_dashboard', 'meta_raw.collection_runs', 'INSERT') = false
   AND has_table_privilege('meta_raw_dashboard', 'meta_raw.collection_runs', 'UPDATE') = false
   AND has_table_privilege('meta_raw_dashboard', 'meta_raw.collection_runs', 'DELETE') = false
  THEN 'DASHBOARD_ROLE_READ_ONLY'
  ELSE 'DASHBOARD_ROLE_WRITE_CAPABLE'
END;
SQL

printf '%s\n' "META_RAW_DB_PASSWORD=$META_RAW_DB_PASSWORD" | docker exec -i "$CONTAINER" sh -c \
  "cat > $DASHBOARD_FILE; chmod 600 $DASHBOARD_FILE"

docker exec -i "$CONTAINER" sh -c \
  "set -a; . $DASHBOARD_FILE; set +a; PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -h 127.0.0.1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -v dashboard_password=\"\$META_RAW_DB_PASSWORD\" -v database_name=\"\$POSTGRES_DB\" -f -" \
  < "$SQL_FILE"

echo 'DASHBOARD_READONLY_READY'
