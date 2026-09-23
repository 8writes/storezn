#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${STOREZN_APP_DIR:-/opt/apps/storezn}"
cd "$APP_DIR"

echo "==> Deploying storezn (branch master)"
git fetch origin master
git reset --hard origin/master
npm ci
npm run build
pm2 restart storezn --update-env
echo "==> storezn is now $(git rev-parse --short HEAD)"
