#!/bin/sh
set -eu

# Installs the complete application scheduler while preserving unrelated
# deploy/user cron entries. Run as the deploy user on the production host.
APP_DIR="${APP_DIR:-/opt/apps/storezn}"
SCRIPT="$APP_DIR/scripts/run-cron-endpoints.sh"
MARKER="# storezn application maintenance"

test -x "$SCRIPT" || { echo "Missing executable cron runner: $SCRIPT" >&2; exit 1; }

existing=$(crontab -l 2>/dev/null || true)
printf '%s\n' "$existing" | sed "/$MARKER/d;/run-cron-endpoints.sh/d" > "${TMPDIR:-/tmp}/storezn-crontab.$$"
cat "${TMPDIR:-/tmp}/storezn-crontab.$$"
printf '%s\n' "$MARKER" >> "${TMPDIR:-/tmp}/storezn-crontab.$$"
printf '*/5 * * * * %s fail-stale-transactions\n' "$SCRIPT" >> "${TMPDIR:-/tmp}/storezn-crontab.$$"
printf '*/10 * * * * %s settlement-poll\n' "$SCRIPT" >> "${TMPDIR:-/tmp}/storezn-crontab.$$"
printf '*/10 * * * * %s cleanup-stale-data\n' "$SCRIPT" >> "${TMPDIR:-/tmp}/storezn-crontab.$$"
printf '*/5 * * * * %s invoice-maintenance\n' "$SCRIPT" >> "${TMPDIR:-/tmp}/storezn-crontab.$$"
crontab "${TMPDIR:-/tmp}/storezn-crontab.$$"
rm -f "${TMPDIR:-/tmp}/storezn-crontab.$$"
echo "Storezn cron jobs installed."
