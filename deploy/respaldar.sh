#!/bin/sh
# Copia de seguridad diaria de PostgreSQL; conserva 14 días. Ejemplo de cron: 0 3 * * * /ruta/deploy/respaldar.sh
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
DESTINO="${VMS_RESPALDOS:-$DIR/respaldos}"
mkdir -p "$DESTINO"
. "$DIR/.env.prod"
ARCHIVO="$DESTINO/vms-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f "$DIR/docker-compose.prod.yml" --env-file "$DIR/.env.prod" exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$ARCHIVO"
find "$DESTINO" -name 'vms-*.sql.gz' -mtime +14 -delete
echo "$ARCHIVO"
