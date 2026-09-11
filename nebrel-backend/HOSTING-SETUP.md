# Nebrel Server-Hosting – Einrichtung

## Was läuft wo?

Der Minecraft-Java-Server und seine Welt liegen auf dem PC des Nutzers unter dem
Nebrel-Datenverzeichnis in `hosted-servers/<UUID>`. Der Client lädt Java bei Bedarf,
startet den Prozess ohne zusätzliches Fenster und leitet die Konsole weiter.
Beim Beenden des Launchers werden laufende Server mit `stop` beendet (bis zu 30 s).
Lokale Ports werden automatisch gewählt. Der Server bindet nur an 127.0.0.1.

Die Freigabe baut ausgehend eine authentifizierte WSS-Verbindung zu
`api.nebrel.de` auf. Der KVM liest den Minecraft-Handshake und leitet die Verbindung
für `<name>.nebrel.de` an den richtigen Nutzer-PC weiter. Kein Routerzugriff,
UPnP, DNS-Passwort oder KVM-Zugang beim Nutzer nötig. Minecraft bleibt im Online-Modus.
Wer die öffentliche Adresse kennt, kann den Server erreichen; die Freigabe ist
keine automatische Freundes-Whitelist. Eine Minecraft-Whitelist kann über die
Konsole verwaltet werden (`whitelist on`, `whitelist add Spielername`).

## Einmalig auf dem KVM / in FeatherPanel

1. Backend-Dateien aus `nebrel-hosting-backend-update.tar.gz` in den vorhandenen
   Backend-Ordner einspielen. Vorher Dateien und PostgreSQL sichern. `.env` nicht
   überschreiben, PostgreSQL/Redis und ihre Volumes behalten.
2. Dem vorhandenen Node-Backend in FeatherPanel eine zusätzliche TCP-Allokation
   für `62.68.75.171:25570` zuweisen. Port 4000 bleibt die primäre API-Allokation.
   Der vorhandene Minecraft-Server auf 25565 bleibt erhalten. Vorher prüfen,
   dass 25570 auf deinem KVM frei ist. In einer vorhandenen Firewall nur diesen
   zusätzlichen TCP-Port zulassen, keine Regeln pauschal löschen.
3. Folgende Zeilen in die vorhandene `.env` des Backends ergänzen:

   HOSTING_RELAY_PORT=25570
   HOSTING_RELAY_HOST=0.0.0.0
   HOSTING_DOMAIN=nebrel.de
   HOSTING_SRV=false

   Optional: `HOSTING_RESERVED_NAMES=shop,forum,deine-weiteren-subdomains`
   verhindert das Reservieren weiterer bereits verwendeter Namen.
4. Startbefehl bleibt `npm ci --omit=dev && node --env-file=.env src/server.js`.
   Backend in FeatherPanel neu starten. Die neue Datenbanktabelle wird beim Start
   additiv angelegt. Nur eine Backend-Instanz betreiben: die Tunnel laufen im Speicher.
5. Caddy leitet weiterhin `api.nebrel.de` an Port 4000 weiter; WSS nutzt diese
   bestehende HTTPS-Verbindung. Minecraft-TCP auf 25570 läuft direkt, nicht über
   den normalen HTTP-Reverse-Proxy.

## Einmalig DNS bei lima-city

Bestehende Einträge für Website, API und Mail unverändert lassen. Eine schon
vorhandene Wildcard vor Änderungen prüfen; sie kann für andere Dienste benutzt sein.

- A: `relay.nebrel.de` → `62.68.75.171`
- A: `*.nebrel.de` → `62.68.75.171`

Damit funktioniert die vom Backend angezeigte Adresse zunächst mit `:25570`.
Für die gewünschte Adresse OHNE Port benötigt Minecraft einen SRV-Eintrag.

Für beliebige, bisher nicht ausdrücklich im DNS angelegte Namen kann ein Wildcard-
SRV-Record verwendet werden, falls die DNS-Verwaltung diesen Namen zulässt:

- Name: `*.nebrel.de`
- Typ: SRV
- Priorität: 0
- Inhalt bei lima-city: `0 25570 relay.nebrel.de.` (Gewicht, Port, Ziel)
- TTL: 300 oder der kleinste dort erlaubte Wert

Die Wildcard steht ganz links. NICHT `_minecraft._tcp.*.nebrel.de` verwenden:
das wäre keine funktionierende DNS-Wildcard. Existierende konkrete DNS-Namen oder
Zwischenknoten können die Wildcard-Auflösung verhindern. Deshalb werden Namen wie
api/www/mail/relay vom Backend nicht vergeben; weitere bestehende Namen in die
obige Sperrliste eintragen. Ein Wildcard-SRV gilt auch für andere noch nicht
vorhandene SRV-Abfragen unter der Domain, nicht nur Minecraft.

Falls lima-city keinen SRV-Record mit diesem Wildcard-Namen zulässt, zunächst
`:25570` benutzen. Für einen einzelnen Server lässt sich alternativ der übliche
SRV-Name `_minecraft._tcp.pauls-server.nebrel.de` mit demselben Inhalt anlegen.
Für vollständig automatische Namen ohne Port ist dann ein freier zentraler Port
25565 oder eine DNS-API-Integration erforderlich. Die Nutzer-PCs brauchen in
keinem Fall Routerfreigaben.

DNS von außen prüfen (Linux mit dig):

    dig +short A pauls-server.nebrel.de
    dig +short SRV _minecraft._tcp.pauls-server.nebrel.de

Erwartet: 62.68.75.171 und `0 0 25570 relay.nebrel.de.`. Erst nach erfolgreicher
SRV-Prüfung `HOSTING_SRV=true` setzen und Backend neu starten. Das Backend zeigt
dann die Adresse ohne Port an. DNS und einen echten Minecraft-Beitritt testen,
bevor die Funktion öffentlich angekündigt wird.

Offizielle Referenzen:
- https://www.lima-city.de/hilfe/minecraft-server-unter-einer-domain-verfuegbar-machen
- https://www.lima-city.de/hilfe/kann-ich-dns-eintraege-aendern
- https://www.rfc-editor.org/rfc/rfc4592 (Wildcard-Auflösung und SRV)

## Prüfung

    curl --fail https://api.nebrel.de/health
    curl --fail https://api.nebrel.de/api/v1/hosting/config

Hosting-Konfiguration muss `enabled: true` und Port 25570 melden. Dann:

1. Neuer Launcher: Server anlegen, EULA bestätigen, starten, Konsole prüfen.
2. Lokal in Minecraft mit der im Client kopierbaren 127.0.0.1-Adresse verbinden.
3. Bei Nebrel anmelden, „Für Freunde freigeben“ klicken.
4. Von einem ANDEREN Internetanschluss über die angezeigte Adresse verbinden.
5. Freigabe beenden und prüfen, dass die öffentliche Verbindung geschlossen wird.
6. Launcher beenden und prüfen, dass der Server seine Welt sauber gespeichert hat.

Automatische Tests laufen mit `npm test` im Backend. Sie prüfen zusätzlich die
Namensreservierung, unberechtigte Zugriffe, fragmentierte Minecraft-Handshakes und
200 KB echte TCP-Daten durch den WebSocket-Tunnel. Das ersetzt keinen Test mit
Minecraft auf zwei PCs und der echten DNS-/KVM-Konfiguration.

## Umfang und Grenzen

Automatischer Download: Vanilla, Paper, Purpur, Fabric und Folia. Nur Versionen
mit passendem veröffentlichtem Server-Build sind verwendbar. Forge, NeoForge,
Mohist, Spigot/BuildTools und der Import bestehender Server sind noch nicht
implementiert und werden nicht als fertige Optionen angezeigt.

Maximal fünf reservierte Namen pro Account, 100 Verbindungen pro aktivem Server,
512 gleichzeitig am Relay und 20 pro Quell-IP. Das ist eine begrenzte erste
Bereitstellung, kein lastgetesteter Hostingdienst. Datenverkehr läuft über deinen
KVM und verbraucht dort Bandbreite. Der Spiel-PC muss online bleiben.
