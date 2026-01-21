#!/usr/bin/env bash
set -euo pipefail

# Export current environment to /etc/environment so cron jobs see it.
# This keeps secrets in env vars, not hardcoded in crontab.
# Note: this simple transformation is fine for typical AWS/Mongo vars.
printenv | sed 's/^\([^=]*\)=\(.*\)$/\1="\2"/' > /etc/environment

# Ensure log file exists and is writable
mkdir -p /var/log
touch /var/log/mongo-backup.log
chmod 664 /var/log/mongo-backup.log

exec cron -f