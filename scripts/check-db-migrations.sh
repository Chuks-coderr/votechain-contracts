#!/usr/bin/env bash
# Copyright 2024 VoteChain Contributors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Pre-deployment database migration check for the VoteChain indexer. (#275)
#
# Runs `sqlx migrate info` to detect pending migrations before the backend
# (or indexer) starts.  If unapplied migrations exist the script:
#
#   - In interactive mode (TTY): prompts for confirmation before applying.
#   - In non-interactive mode (CI / no TTY): applies automatically unless
#     SKIP_MIGRATION_CONFIRMATION is set to "no", in which case it aborts
#     the deployment so a human can investigate.
#
# Migrations are applied atomically via `sqlx migrate run` inside a single
# transaction.  If any migration fails the script exits non-zero and the
# calling deploy step should not proceed.
#
# Usage:
#   ./scripts/check-db-migrations.sh                         # interactive
#   DATABASE_URL=... ./scripts/check-db-migrations.sh         # non-interactive (CI)
#   SKIP_MIGRATION_CONFIRMATION=no ./scripts/check-db-migrations.sh  # always abort on pending
#
# Environment variables:
#   DATABASE_URL              — PostgreSQL connection string (required)
#   SKIP_MIGRATION_CONFIRMATION — "yes" (default in CI) to auto-apply,
#                                  "no" to abort on pending migrations
#   MIGRATION_SOURCE          — path to migration files (default: indexer/migrations)
set -euo pipefail

MIGRATION_SOURCE="${MIGRATION_SOURCE:-indexer/migrations}"

# ── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo "ℹ️  $*"; }
success() { echo "✅  $*"; }
warn()    { echo "⚠️  $*"; }
error()   { echo "❌  $*" >&2; }

# ── Pre-flight ───────────────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  error "DATABASE_URL is not set. Export it before running this script."
  exit 1
fi

if ! command -v sqlx &>/dev/null; then
  error "sqlx CLI not found. Install with: cargo install sqlx-cli --no-default-features --features postgres"
  exit 1
fi

if [[ ! -d "$MIGRATION_SOURCE" ]]; then
  error "Migration source directory '$MIGRATION_SOURCE' not found."
  exit 1
fi

# ── Check migration status ──────────────────────────────────────────────────
info "Checking database migration status..."
info "  Database: $(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')"
info "  Source:   $MIGRATION_SOURCE"

# `sqlx migrate info` output contains a status column with "Applied" or
# "Pending" for each migration.  We grep for "Pending" to detect unapplied
# migrations.
MIGRATION_OUTPUT=$(sqlx migrate info --database-url "$DATABASE_URL" --source "$MIGRATION_SOURCE" 2>&1)

echo "$MIGRATION_OUTPUT"

PENDING_COUNT=$(echo "$MIGRATION_OUTPUT" | grep -c "Pending" || true)

if [[ "$PENDING_COUNT" -eq 0 ]]; then
  success "No pending migrations. Database schema is up to date."
  exit 0
fi

warn "$PENDING_COUNT pending migration(s) detected."

# ── Confirmation gate ────────────────────────────────────────────────────────
SKIP_CONFIRM="${SKIP_MIGRATION_CONFIRMATION:-yes}"

if [[ "$SKIP_CONFIRM" == "no" ]]; then
  error "Pending migrations detected and SKIP_MIGRATION_CONFIRMATION=no. Aborting deployment."
  error "Apply migrations manually or re-run with SKIP_MIGRATION_CONFIRMATION=yes."
  exit 1
fi

if [[ -t 0 ]]; then
  # Interactive mode — prompt for confirmation
  echo ""
  read -r -p "Apply $PENDING_COUNT pending migration(s) now? This will modify the database. [yes/no]: " answer
  if [[ "$answer" != "yes" ]]; then
    error "Migration aborted by user. Deployment cannot proceed with pending migrations."
    exit 1
  fi
else
  # Non-interactive (CI) mode — auto-apply
  info "Non-interactive mode: auto-applying pending migrations."
fi

# ── Apply migrations atomically ─────────────────────────────────────────────
info "Applying pending migrations..."

if ! sqlx migrate run --database-url "$DATABASE_URL" --source "$MIGRATION_SOURCE"; then
  error "Migration failed! The database may be in a partially-applied state."
  error "If a migration was applied but the deploy failed, use the rollback procedure"
  error "documented in indexer/migrations/README.md to restore the previous schema."
  exit 1
fi

# ── Verify ───────────────────────────────────────────────────────────────────
info "Verifying migration status post-apply..."

POST_MIGRATION_OUTPUT=$(sqlx migrate info --database-url "$DATABASE_URL" --source "$MIGRATION_SOURCE" 2>&1)
POST_PENDING_COUNT=$(echo "$POST_MIGRATION_OUTPUT" | grep -c "Pending" || true)

if [[ "$POST_PENDING_COUNT" -gt 0 ]]; then
  error "Migrations applied but $POST_PENDING_COUNT migration(s) still pending."
  error "This may indicate a partial failure. Check the database state manually."
  exit 1
fi

success "All migrations applied successfully. Database schema is up to date."
