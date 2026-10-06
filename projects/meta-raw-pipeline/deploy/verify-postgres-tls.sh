#!/usr/bin/env bash
set -eu

ADMIN_ENV=${ADMIN_ENV:-/opt/ownerinc/secrets/meta-raw-pipeline/postgres-admin.env}
APP_ENV=${APP_ENV:-/opt/ownerinc/secrets/meta-raw-pipeline/app.env}
APP_FILE=/tmp/meta-raw-app.env
CONTAINER=${POSTGRES_CONTAINER:-meta-raw-postgres}

set -a
. "$ADMIN_ENV"
. "$APP_ENV"
set +a

trap 'docker exec "$CONTAINER" rm -f "$APP_FILE" >/dev/null 2>&1 || true' EXIT
cat "$APP_ENV" | docker exec -i "$CONTAINER" sh -c "cat > $APP_FILE; chmod 600 $APP_FILE"

ADMIN_SQL=$(cat <<'SQL'
SELECT CASE WHEN setting = 'on' THEN 'POSTGRES_SSL_ON' ELSE 'POSTGRES_SSL_OFF' END
FROM pg_settings WHERE name = 'ssl';
SELECT CASE WHEN count(*) FILTER (WHERE type = 'hostssl' AND error IS NULL) > 0
  THEN 'POSTGRES_HOSTSSL_ENFORCED' ELSE 'POSTGRES_HOSTSSL_MISSING' END
FROM pg_hba_file_rules;
SQL
)

APP_SQL=$(cat <<'SQL'
SELECT CASE WHEN ssl THEN 'TLS_CONNECTION_ACTIVE' ELSE 'TLS_CONNECTION_MISSING' END
FROM pg_stat_ssl WHERE pid = pg_backend_pid();
SELECT CASE WHEN rolsuper = false AND rolcreatedb = false AND rolcreaterole = false
  THEN 'APP_ROLE_NON_PRIVILEGED' ELSE 'APP_ROLE_PRIVILEGED' END
FROM pg_roles WHERE rolname = current_user;
SQL
)

ADMIN_OUTPUT=$(printf '%s\n' "$ADMIN_SQL" | docker exec -i "$CONTAINER" sh -c \
  "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -X \"host=127.0.0.1 user=\$POSTGRES_USER dbname=\$POSTGRES_DB sslmode=require\" -At -v ON_ERROR_STOP=1 -f -")

APP_OUTPUT=$(printf '%s\n' "$APP_SQL" | docker exec -i "$CONTAINER" sh -c \
  "set -a; . $APP_FILE; set +a; PGPASSWORD=\"\$META_RAW_DB_PASSWORD\" psql -X \"host=127.0.0.1 user=\$META_RAW_DB_USER dbname=\$META_RAW_DB_NAME sslmode=require\" -At -v ON_ERROR_STOP=1 -f -")

case "$ADMIN_OUTPUT|$APP_OUTPUT" in
  *POSTGRES_SSL_ON*POSTGRES_HOSTSSL_ENFORCED*TLS_CONNECTION_ACTIVE*APP_ROLE_NON_PRIVILEGED*)
    echo 'POSTGRES_SSL_ON'
    echo 'POSTGRES_HOSTSSL_ENFORCED'
    echo 'APP_ROLE_NON_PRIVILEGED'
    echo 'TLS_VERIFY_OK'
    ;;
  *)
    echo 'TLS_VERIFY_FAILED' >&2
    exit 1
    ;;
esac
