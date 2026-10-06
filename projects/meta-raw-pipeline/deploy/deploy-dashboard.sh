#!/usr/bin/env bash
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-/opt/ownerinc/apps/meta-raw-pipeline/dashboard-compose.yml}
ENV_FILE=${ENV_FILE:-/opt/ownerinc/secrets/meta-raw-pipeline/dashboard.env}
DASHBOARD_IMAGE=${DASHBOARD_IMAGE:-}

if [ -z "$DASHBOARD_IMAGE" ]; then
  echo 'DASHBOARD_IMAGE is required.' >&2
  exit 1
fi
if [ ! -s "$COMPOSE_FILE" ]; then
  echo 'Dashboard Compose file is missing.' >&2
  exit 1
fi
if [ ! -s "$ENV_FILE" ]; then
  echo 'Dashboard environment file is missing.' >&2
  exit 1
fi

PROJECT=meta-raw-dashboard
COMPOSE=(docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")

"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" pull dashboard
"${COMPOSE[@]}" up -d --no-deps dashboard

for attempt in $(seq 1 20); do
  status=$(docker inspect --format '{{.State.Health.Status}}' meta-raw-dashboard 2>/dev/null || true)
  case "$status" in
    healthy)
      echo 'DASHBOARD_DEPLOYED'
      exit 0
      ;;
    unhealthy)
      echo 'Dashboard healthcheck failed.' >&2
      exit 1
      ;;
  esac
  sleep 3
done

echo 'Dashboard healthcheck did not become healthy in time.' >&2
exit 1
