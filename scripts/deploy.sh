#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${STOREZN_APP_DIR:-/opt/apps/storezn}"
cd "$APP_DIR"

echo "==> Deploying storezn (branch master)"
git fetch origin master
git reset --hard origin/master
# The lockfile contains platform-specific optional Next/Tailwind packages.
# npm ci rejects a lock generated on a different OS, while npm install safely
# reconciles those optional entries on the Linux deployment host.
npm install --no-audit --no-fund --no-package-lock
npm run build
pm2 restart storezn --update-env
echo "==> storezn is now $(git rev-parse --short HEAD)"
