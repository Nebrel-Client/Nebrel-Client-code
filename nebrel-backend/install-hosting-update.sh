#!/usr/bin/env bash
set -euo pipefail
umask 077
CONTAINER=e2111154-3ff6-4b5d-8812-8abc3994d554
ARCHIVE=/root/nebrel-hosting-backend-update.tar.gz
if [ "$(id -u)" -ne 0 ]; then echo 'Bitte als root ausführen.'; exit 1; fi
DIR=$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/home/container"}}{{.Source}}{{end}}{{end}}')
case "$DIR" in /*) ;; *) echo 'Backend-Verzeichnis nicht gefunden.'; exit 1;; esac
[ "$DIR" != / ] && [ -d "$DIR" ] && [ -f "$DIR/.env" ] && [ -f "$DIR/package.json" ] && [ -f "$ARCHIVE" ]
BINDING=$(docker inspect "$CONTAINER" --format '{{with index .HostConfig.PortBindings "25570/tcp"}}{{range .}}{{println .HostPort}}{{end}}{{end}}')
if ! printf '%s\n' "$BINDING" | grep -qx 25570; then
 echo 'Zuerst im FeatherPanel dem Node-Backend die zusätzliche Allokation 62.68.75.171:25570 zuweisen und den Container über das Panel neu starten.'
 echo 'Port 4000 bleibt primär. Der bestehende Minecraft-Server auf 25565 bleibt unverändert.'
 exit 1
fi
BACKUP="/root/nebrel-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$BACKUP"
docker exec nebrel-postgres pg_dump -U nebrel -d nebrel > "$BACKUP/database.sql"
tar --exclude='./node_modules' --exclude='./.npm' -czf "$BACKUP/backend.tar.gz" -C "$DIR" .
OWNER=$(stat -c '%u:%g' "$DIR/.env")
docker stop "$CONTAINER"
trap 'echo "Update abgebrochen. Sicherung: $BACKUP"; docker start "$CONTAINER" >/dev/null || true' ERR
tar --no-same-owner -xzf "$ARCHIVE" -C "$DIR"
# Preserve all passwords and other settings. Remove only settings managed here.
sed -i '/^HOSTING_RELAY_PORT=/d; /^HOSTING_RELAY_HOST=/d; /^HOSTING_DOMAIN=/d' "$DIR/.env"
printf '\nHOSTING_RELAY_PORT=25570\nHOSTING_RELAY_HOST=0.0.0.0\nHOSTING_DOMAIN=nebrel.de\n' >> "$DIR/.env"
if ! grep -q '^HOSTING_SRV=' "$DIR/.env"; then printf 'HOSTING_SRV=false\n' >> "$DIR/.env"; fi
chown -R "$OWNER" "$DIR/src" "$DIR/data"
chown "$OWNER" "$DIR/.env" "$DIR/package.json" "$DIR/package-lock.json" "$DIR/schema.sql"
chmod 600 "$DIR/.env"
docker start "$CONTAINER"
trap - ERR
printf 'Update installiert. Sicherung: %s\n' "$BACKUP"
echo 'Warte auf das Backend …'
for attempt in $(seq 1 30); do
 if curl --silent --fail --max-time 2 http://62.68.75.171:4000/api/v1/hosting/config | grep -q '"enabled":true'; then
  echo 'Hosting-Relay ist aktiv. Als Nächstes DNS gemäß HOSTING-SETUP.md einrichten.'
  exit 0
 fi
 sleep 2
done
echo 'Hosting-Relay noch nicht bereit. Bitte diese Ausgabe prüfen:'
docker logs --tail 25 "$CONTAINER"
exit 1
