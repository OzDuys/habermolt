#!/bin/bash
#
# Clone production database to local.
# Reads PRODUCTION_DATABASE_URL from .env and DATABASE_URL from backend/.env
#
# Usage: ./scripts/clone_production_db.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Read PRODUCTION_DATABASE_URL from .env
PROD_URL=$(grep '^PRODUCTION_DATABASE_URL=' "$REPO_ROOT/.env" | sed 's/^PRODUCTION_DATABASE_URL=//' | tr -d '"')
if [ -z "$PROD_URL" ]; then
  echo "Error: PRODUCTION_DATABASE_URL not found in .env"
  exit 1
fi

# Read local DATABASE_URL from backend/.env
LOCAL_URL=$(grep '^DATABASE_URL=' "$REPO_ROOT/backend/.env" | sed 's/^DATABASE_URL=//' | tr -d '"')
if [ -z "$LOCAL_URL" ]; then
  echo "Error: DATABASE_URL not found in backend/.env"
  exit 1
fi

# Extract local database name from URL
LOCAL_DB=$(echo "$LOCAL_URL" | sed 's|.*/||')

echo "Production: $PROD_URL"
echo "Local:      $LOCAL_URL (db: $LOCAL_DB)"
echo ""

# Use pg17 pg_dump if available (production runs pg17)
PG_DUMP="pg_dump"
PG_RESTORE="pg_restore"
if [ -x "/opt/homebrew/Cellar/postgresql@17/17.9/bin/pg_dump" ]; then
  PG_DUMP="/opt/homebrew/Cellar/postgresql@17/17.9/bin/pg_dump"
  PG_RESTORE="/opt/homebrew/Cellar/postgresql@17/17.9/bin/pg_restore"
fi

DUMP_FILE="/tmp/habermolt_prod_dump.dump"

echo "1/4  Dumping production database..."
$PG_DUMP "$PROD_URL" --no-owner --no-acl -F c -f "$DUMP_FILE"

echo "2/4  Terminating local connections to $LOCAL_DB..."
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true

echo "3/4  Dropping and recreating $LOCAL_DB..."
dropdb "$LOCAL_DB" 2>/dev/null || true
createdb "$LOCAL_DB"
psql -d "$LOCAL_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;" > /dev/null 2>&1

echo "4/4  Restoring production dump..."
$PG_RESTORE --no-owner --no-acl -d "$LOCAL_URL" "$DUMP_FILE" 2>&1 | grep -v "transaction_timeout" || true

rm -f "$DUMP_FILE"

echo ""
echo "Done! Local database '$LOCAL_DB' is now a copy of production."
