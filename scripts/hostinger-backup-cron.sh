#!/bin/sh

set -eu
umask 077

usage() {
  printf '%s\n' 'Usage: hostinger-backup-cron.sh staging|production' >&2
  exit 64
}

[ "$#" -eq 1 ] || usage

case "${HOME:-}" in
  /*) ;;
  *)
    printf '%s\n' 'HOME must be an absolute Hostinger account path.' >&2
    exit 78
    ;;
esac

case "$1" in
  staging)
    app_root="$HOME/domains/crm-staging.globalapps.world/nodejs"
    token_file="$HOME/northwind-crm-private/staging/secrets/backup-trigger.token"
    backup_url='https://crm-staging.globalapps.world'
    ;;
  production)
    app_root="$HOME/domains/crm.globalapps.world/nodejs"
    token_file="$HOME/northwind-crm-private/production/secrets/backup-trigger.token"
    backup_url='https://crm.globalapps.world'
    ;;
  *) usage ;;
esac

if [ ! -d "$app_root" ]; then
  printf '%s\n' "Northwind Node application root is missing: $app_root" >&2
  exit 72
fi

if [ ! -f "$token_file" ] || [ -L "$token_file" ]; then
  printf '%s\n' "Northwind backup token file is missing or unsafe: $token_file" >&2
  exit 78
fi

CRM_BACKUP_URL="$backup_url"
CRM_BACKUP_TRIGGER_TOKEN_FILE="$token_file"
export CRM_BACKUP_URL CRM_BACKUP_TRIGGER_TOKEN_FILE

CDPATH= cd "$app_root"
exec npm run backup:hostinger:run
