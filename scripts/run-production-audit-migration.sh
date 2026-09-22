#!/bin/sh
set -eu

cd /opt/apps/storezn
DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | head -n 1)
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -e "s/^['\"]//" -e "s/['\"]$//")

backup="/opt/apps/storezn-db-backups/cart-items-before-atomicity-$(date +%Y%m%d%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=cart_items --file="$backup"
echo "Backup created: $backup"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/CART-ATOMICITY-AND-SEARCH-MIGRATION.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f RATE-LIMIT-MIGRATION.sql
echo "Migration applied"

psql "$DATABASE_URL" -Atc "SELECT indexname FROM pg_indexes WHERE tablename IN ('cart_items','products') AND indexname IN ('uq_cart_items_cart_product_base','uq_cart_items_cart_variant','idx_products_store_name_trgm') ORDER BY indexname;"
