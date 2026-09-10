# Nebrel: Backend aktualisieren und Windows-Installer bauen

Die API ist im Launcher auf https://api.nebrel.de/api/v1 eingestellt.
Experimenteller Modus muss ausgeschaltet bleiben, solange kein Staging eingerichtet ist.

## 1. Backend auf deinem vorhandenen FeatherPanel-Server aktualisieren

Postgres, Redis, Docker-Volumes und Passwörter NICHT neu erstellen.

1. Den Node.js-Server im FeatherPanel stoppen.
2. Die vorhandenen Backend-Dateien und die Datei `.env` sichern. Für ein Datenbank-Backup im Debian-Root-Terminal:

   ```bash
   umask 077
   docker exec nebrel-postgres pg_dump -U nebrel -d nebrel > "/root/nebrel-setup/nebrel-backup-$(date +%Y%m%d-%H%M%S).sql"
   ```

3. `nebrel-backend-update.zip` im Dateimanager dieses Node.js-Servers nach `/home/container` hochladen und dort entpacken. Vorhandene Programmdateien ersetzen. `package.json`, `schema.sql` und `src` müssen direkt in `/home/container` liegen. Die vorhandene `.env` behalten; das ZIP enthält keine Passwörter und keine `.env`.
4. Im Panel folgenden Startup-Befehl einstellen:

   ```bash
   npm ci --omit=dev && node --env-file=.env src/server.js
   ```

5. Server starten. Beim Start werden die neuen Tabellen automatisch angelegt. Bei einem Fehler die Panel-Konsole prüfen; keine Volumes löschen.

## 2. Caddy für die gesamte API öffnen

Im Debian-Root-Terminal:

```bash
cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup-$(date +%Y%m%d-%H%M%S)"
nano /etc/caddy/Caddyfile
```

NUR den bisherigen Block `api.nebrel.de { ... }` inklusive der bisherigen `handle`-Blöcke ersetzen durch:

```caddyfile
api.nebrel.de {
    reverse_proxy 62.68.75.171:4000
}
```

Alle anderen Seiten und den bestehenden `:80`-Block behalten. Speichern mit Strg+O, Enter; schließen mit Strg+X.

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
curl --fail --max-time 20 https://api.nebrel.de/health
curl -i --max-time 20 https://api.nebrel.de/api/v1/friends/user
```

Erwartet: erst `{"ok":true}`, dann HTTP 401 mit Hinweis auf einen erforderlichen Nebrel-Login. 401 ist hier richtig: Ohne Anmeldung sollen keine Freundesdaten herausgegeben werden. 503 bedeutet, dass noch der alte Wartungsblock aktiv ist oder der Backend-Dienst nicht bereit ist.
Caddy reicht WebSockets automatisch durch.

## 3. Windows-EXE bauen

Auf deinem Windows-PC in PowerShell (nicht im Debian-Terminal):

```powershell
cd C:\Users\paulr\IdeaProjects\noriskclient-launcher
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

Benötigt Node.js, Rust mit MSVC-Toolchain und Visual Studio C++ Build Tools / Windows SDK. Das Skript installiert die Frontend-Abhängigkeiten und baut den Installer.
Die fertige Setup-EXE liegt in `src-tauri\target\release\bundle\nsis\`.
Dieser Build ist für manuelle Installation. Er benötigt keinen Updater-Schlüssel; automatische Update-Artefakte werden nur für diesen Build deaktiviert. Die EXE erhält dadurch keine Windows-Code-Signatur.

## 4. Freunde und Chat testen

1. Die neue EXE auf beiden PCs installieren, Launcher öffnen und mit jeweils einem eigenen Microsoft-/Minecraft-Java-Konto anmelden. Bei alten gespeicherten Zugangsdaten ggf. neu anmelden.
2. Beide Spieler müssen mindestens einmal bei dieser Nebrel-API angemeldet gewesen sein, damit ihre Benutzer existieren.
3. Spieler A öffnet Freunde und sendet Spieler B anhand seines Minecraft-Namens eine Anfrage.
4. B nimmt an. Beide sehen die Freundschaft und bei geöffnetem Launcher den Online-Status.
5. Nachricht senden, Antwort senden, Chat schließen und neu öffnen. Nachrichten sollen erhalten bleiben.
6. Unsichtbar einstellen und einen Launcher beenden; die Gegenseite soll den Spieler als offline sehen.

Implementiert: Konto-Verifikation über Mojang, Anfragen/Annahme/Ablehnung/Entfernen, Privatsphäre, Online-Status, private Chats mit Speicherung, Bearbeiten/Löschen/Reaktionen als API, WebSocket-Ereignisse und automatische Neuverbindung.
Aktueller Spielserver, direktes Beitreten und Einladungen aus dem laufenden Minecraft-Spiel benötigen noch eine Spiel-Mod-Anbindung. Eigene Capes, CDN und Modpack-Katalog sind separate Dienste bzw. Inhalte.
Der Backend-Prozess wird einmal betrieben; die Online-Verbindungen werden im Arbeitsspeicher dieses Prozesses verwaltet.

## Lokale Prüfungen

Backend: `cd nebrel-backend`, `npm ci`, `npm test`.
Die Tests verwenden isoliertes PostgreSQL über PGlite und testen die Mojang-Anmeldung mit einem simulierten Sessionserver. Sie ersetzen den abschließenden Test mit zwei echten Konten nicht.
