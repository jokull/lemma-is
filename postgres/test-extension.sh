#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

(cd "$SCRIPT_DIR" && docker compose -f "$COMPOSE_FILE" up -d --build)

# Wait for database health
for _ in {1..30}; do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$_" -eq 30 ]; then
    echo "Postgres failed to become ready" >&2
    exit 1
  fi
done

# Build and install the extension inside the container

docker compose -f "$COMPOSE_FILE" exec -T db bash -lc "cd /workspace/postgres && make && make install"

# Restart to pick up the updated shared library
docker compose -f "$COMPOSE_FILE" restart db

# Wait for database health again after restart
for _ in {1..30}; do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$_" -eq 30 ]; then
    echo "Postgres failed to become ready after restart" >&2
    exit 1
  fi
done

# Smoke test: create extension and run icelandic_lexize / icelandic_tsvector

docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP EXTENSION IF EXISTS icelandic CASCADE;"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP EXTENSION IF EXISTS icelandic_fts CASCADE;"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP FUNCTION IF EXISTS icelandic_lexize(text) CASCADE;"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP FUNCTION IF EXISTS icelandic_tsvector(text) CASCADE;"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE EXTENSION icelandic_fts;"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT icelandic_lexize('Hestinum');"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT icelandic_fts_lemmas('Börnin fóru í bíó.');"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT icelandic_fts_query('Börnin fóru í bíó.');"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT icelandic_tsvector('Börnin fóru í bíó');"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT icelandic_lexize('börnin');"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT icelandic_lexize('fóru');"

echo "OK: icelandic_fts extension installed and icelandic functions executed"
