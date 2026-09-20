#!/bin/sh
set -eu

cd /opt/apps/storezn
DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | head -n 1)
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed "s/^[\"']//;s/[\"']$//")

case "${1:-}" in
  snapshot)
    exec psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/winners-child-stock-snapshot.sql
    ;;
  migrate)
    backup="/opt/apps/storezn-db-backups/product_branch_stock-before-eliozu-$(date +%Y%m%d%H%M%S).sql"
    pg_dump "$DATABASE_URL" --data-only --table=product_branch_stock --file="$backup"
    echo "Backup created: $backup"
    exec psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/WINNERS-CHILD-ELIOZU-STOCK-MIGRATION.sql
    ;;
  zero-default)
    backup="/opt/apps/storezn-db-backups/product_branch_stock-before-default-zero-$(date +%Y%m%d%H%M%S).sql"
    pg_dump "$DATABASE_URL" --data-only --table=product_branch_stock --file="$backup"
    echo "Backup created: $backup"
    exec psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/WINNERS-CHILD-DEFAULT-OUT-OF-STOCK.sql
    ;;
  *)
    echo "Usage: $0 snapshot|migrate|zero-default" >&2
    exit 2
    ;;
esac
