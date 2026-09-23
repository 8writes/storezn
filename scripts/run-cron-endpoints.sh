#!/bin/sh
set -eu

APP_DIR="/opt/apps/storezn"
BASE_URL="${STOREZN_CRON_BASE_URL:-http://127.0.0.1:3003}"
STATE_DIR="${HOME:-/home/deploy}/.local/state/storezn"
LOG_FILE="$STATE_DIR/cron.log"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/cron.lock"
flock -n 9 || exit 0

job="${1:-}"
case "$job" in
  fail-stale-transactions) endpoint="/api/cron/fail-stale-transactions" ;;
  settlement-poll) endpoint="/api/cron/settlement-poll" ;;
  cleanup-stale-data) endpoint="/api/cron/cleanup-stale-data" ;;
  invoice-maintenance) endpoint="/api/cron/invoice-maintenance" ;;
  *) echo "Unknown Storezn cron job: $job" >&2; exit 2 ;;
esac

cron_secret=$(cd "$APP_DIR" && env -u CRON_SECRET node -e '
  const { loadEnvConfig } = require("@next/env");
  delete process.env.CRON_SECRET;
  loadEnvConfig(process.cwd(), false);
  process.stdout.write(process.env.CRON_SECRET || "");
')
if [ -z "$cron_secret" ]; then
  echo "CRON_SECRET is not configured" >&2
  exit 1
fi

timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
response=$(curl --fail --silent --show-error --max-time 300 \
  -H "Authorization: Bearer $cron_secret" \
  "$BASE_URL$endpoint")
printf '%s %s %s\n' "$timestamp" "$job" "$response" >> "$LOG_FILE"

# Keep the scheduler log bounded without needing root-owned logrotate config.
if [ "$(wc -c < "$LOG_FILE")" -gt 1048576 ]; then
  tail -n 2000 "$LOG_FILE" > "$LOG_FILE.tmp"
  mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
