# pp_light

Schlanker, selbst gehosteter Projektplaner für kleine Teams: Aufgaben im Zentrum, Kanban und Gantt als Sichten darauf.

- Design: [`docs/superpowers/specs/2026-09-30-pp-light-design.md`](docs/superpowers/specs/2026-09-30-pp-light-design.md)
- Roadmap: [`docs/superpowers/plans/2026-10-01-roadmap.md`](docs/superpowers/plans/2026-10-01-roadmap.md)

Stack: Next.js 16 · TypeScript · PostgreSQL 17 + Drizzle · Auth.js · Tailwind/shadcn · Docker Compose

## Betrieb (Produktion)

Gedacht für den Betrieb im lokalen Netz: ein Server mit Docker und Compose, davor Caddy für HTTP und HTTPS. Die App selbst ist nur über Caddy erreichbar, nicht direkt.

### Einrichten

1. **DNS:** Für den Server einen Namen im lokalen DNS anlegen, z. B. `pp.firma.local` (Platzhalter – überall durch euren Namen ersetzen).
2. **Konfiguration:**

   ```bash
   cp .env.example .env
   # AUTH_SECRET setzen (Pflicht, zufällig, mind. 32 Zeichen):
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   # POSTGRES_PASSWORD setzen (nur Buchstaben/Ziffern):
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```

   In `.env` außerdem `PP_DOMAIN=pp.firma.local` und die SMTP-Zugangsdaten eintragen (siehe unten).
3. **Starten:**

   ```bash
   docker compose up -d --build
   docker compose logs app        # zeigt den Einrichtungscode
   ```

4. **Einrichten im Browser:** `https://pp.firma.local` öffnen (oder `http://…`). Solange es kein Konto gibt, öffnet sich die Einrichtung: Einrichtungscode aus dem Log, Name, E-Mail und Passwort eintragen – das wird das erste Admin-Konto. Danach öffnen sich die Server-Einstellungen (siehe „Zugriff“). Der Code entsteht bei jedem Start neu, solange niemand eingerichtet hat; nur wer ins Server-Log schauen kann, wird so Admin.

   Alternativ ohne Browser: `docker compose exec app node scripts/create-admin.mjs --email admin@firma.de --name "Vorname Nachname" --password "<mind. 10 Zeichen>"`

Ports 80 und 443 müssen auf dem Server frei sein.

### Zugriff: HTTP oder nur HTTPS

Caddy nimmt HTTP (Port 80, jeder Hostname) und HTTPS (Port 443, `PP_DOMAIN`) an und leitet selbst nicht um. Ob HTTP erlaubt ist, legt ein Admin in pp_light fest: Zahnrad → Einstellungen → „Server“.

- **HTTP und HTTPS** (Standard): beides funktioniert. Richtig, wenn vor dem Server schon ein Proxy oder Load-Balancer HTTPS übernimmt und per HTTP an Port 80 weitergibt – es entsteht keine Umleitungsschleife.
- **Nur HTTPS:** HTTP wird auf HTTPS umgeleitet. Lässt sich nur einschalten, während man pp_light über HTTPS geöffnet hat. Damit ist bewiesen, dass HTTPS bis zur App durchkommt; hinter einem Proxy, der per HTTP weitergibt, bleibt die Option gesperrt.

Dort steht auch die **Adresse** für Links in E-Mails (Einladungen, Passwort-Reset, Benachrichtigungen). Bei der Einrichtung wird die Adresse übernommen, unter der man sie gerade geöffnet hat.

Notausgang, falls doch einmal niemand mehr hineinkommt:

```bash
docker compose exec app node scripts/access-mode.mjs http    # HTTP wieder erlauben
docker compose exec app node scripts/access-mode.mjs         # aktuellen Stand anzeigen
```

### HTTPS-Zertifikat

`PP_TLS` in `.env` legt fest, woher das Zertifikat kommt:

- **`internal` (Standard):** Caddy betreibt eine eigene kleine Zertifizierungsstelle und stellt das Zertifikat selbst aus und verlängert es. Damit Browser keine Warnung zeigen, muss deren Root-Zertifikat einmalig auf den Clients als vertrauenswürdig installiert werden (Windows: per Gruppenrichtlinie oder `certlm.msc` → „Vertrauenswürdige Stammzertifizierungsstellen“):

  ```bash
  docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./pp-light-root.crt
  ```

  Die CA liegt im Volume `caddy_data` – nicht löschen, sonst entsteht eine neue und alle Clients brauchen das neue Root-Zertifikat.
- **Eigenes Zertifikat** (z. B. von der Firmen-CA): `cert.pem` (inkl. Zwischenzertifikaten) und `key.pem` nach `./certs/` legen und `PP_TLS=/certs/cert.pem /certs/key.pem` setzen. Erneuern: Dateien austauschen, `docker compose restart caddy`.

Caddy setzt Sicherheits-Header und ersetzt `X-Forwarded-For` und `X-Forwarded-Proto` durch das, was es selbst gesehen hat: Die IP-Sperre beim Login greift, und die App weiß, ob eine Anfrage wirklich über HTTPS kam.

### Backups

Der Dienst `backup` sichert täglich um `BACKUP_HOUR` Uhr (Standard 2 Uhr, Zeitzone Europe/Berlin) die Datenbank und alle Anhänge nach `./backups/<Datum_Uhrzeit>/` (`db.dump`, `uploads.tar.gz`) und löscht Sicherungen, die älter als `BACKUP_KEEP_DAYS` Tage sind (Standard 14). Ein anderes Ziel, etwa ein Netzlaufwerk, setzt `BACKUP_DIR`.

Admins starten ein Backup auch in der Weboberfläche: Zahnrad → Einstellungen → „Backups“ → „Jetzt sichern“. Dort stehen auch die letzten Läufe mit Status, Größe und gegebenenfalls Fehlermeldung. Der Backup-Dienst holt solche Aufträge alle 10 Sekunden ab; einen Zugriff der App auf Docker gibt es dafür nicht.

```bash
docker compose exec backup sh /backup.sh now         # sofort sichern (Kommandozeile)
docker compose logs backup                           # letzte Läufe
```

Die Sicherungen enthalten alle Daten im Klartext: `./backups` vor fremdem Zugriff schützen und zusätzlich auf ein anderes Gerät kopieren – eine Sicherung auf demselben Server hilft bei einem Plattendefekt nicht.

**Wiederherstellen** (ersetzt alle aktuellen Daten):

```bash
docker compose stop app worker
docker compose exec backup sh /backup.sh restore 2026-10-02_0200   # Ordnername aus ./backups
docker compose start app worker
```

Die Datenbank wird zuerst vollständig in eine neue Datenbank eingespielt und erst danach gegen die alte getauscht – bricht das Einspielen ab, bleiben die aktuellen Daten unverändert.

### Funktionen

Nach der ersten Anmeldung führt eine kurze Einführung durch die wichtigsten Funktionen; sie lässt sich über `?` oder Einstellungen → Mein Konto wieder öffnen. Die Startseite „Meine Arbeit“ zeigt zugewiesene Aufgaben nach Fälligkeit, lässt sie mit einem Klick abschließen (mit „Rückgängig“), direkt auf heute oder morgen verschieben und neue Aufgaben für dich selbst schnell erfassen. Die Projektübersicht unter `/projects` zeigt alle aktiven Projekte, auf die du Zugriff hast (auch Admins sehen nur Projekte, in denen sie Mitglied sind), mit Suche sowie offenen und überfälligen Aufgaben. Der Kalender unter `/calendar` zeigt die Fälligkeiten aller deiner Projekte als Monat, Woche oder Liste – filterbar nach Projekt, eigenen und erledigten Aufgaben; per Drag & Drop verschiebst du einen Termin auf einen anderen Tag. Datumsfelder nehmen getippte Daten wie `15.1.` an oder öffnen einen Kalender mit Schnellwahl. Unteraufgaben lassen sich bis zu fünf Ebenen tief verschachteln und tragen hierarchische Nummern (`WB-1`, `WB-1.1`, `WB-1.1.1`); sie erscheinen auch in Board und Liste (mit Verweis auf die Elternaufgabe), und die Suche findet sie über ihre Nummer. Beim Hinzufügen von Mitgliedern schlägt das Feld Personen erst beim Tippen vor; der Knopf daneben öffnet eine größere Suche. Admins stellen unter Einstellungen → „Gruppen“ Teams zusammen; wer ein Projekt verwaltet, fügt eine ganze Gruppe mit einer Rolle auf einmal hinzu (die Mitglieder werden dabei kopiert, spätere Änderungen an der Gruppe betreffen das Projekt nicht). Eine neue Abhängigkeit zeigt vorher an, welche Aufgaben sich dadurch verschieben würden. In den Projekteinstellungen speichern sich Änderungen beim Verlassen eines Feldes; dort schließt du ein Projekt über ein Abschluss-Review ab (Kennzahlen, offene Aufgaben, Abschlussnotiz), archivierst es ohne Bericht oder löschst es endgültig (Bestätigung per Kürzel). Archivierte und abgeschlossene Projekte sind schreibgeschützt, stehen unter „Archiv“ (`/projects/archive`) und lassen sich von Owners wiederherstellen. `Strg+K` (Mac: `⌘+K`) öffnet die Suche nach Aufgaben und Projekten. `?` zeigt alle Tastenkürzel; `C` fokussiert die Schnell-Eingabe und `1`/`2`/`3` wechseln im Projekt zwischen Board, Gantt und Liste. Die Liste gruppiert Aufgaben nach Status (Erledigtes eingeklappt), hakt sie per Checkbox ab oder öffnet sie wieder und sucht schon beim Tippen. Ein Klick auf eine Aufgabe öffnet sie als Overlay über der aktuellen Ansicht; `Esc`, ein Klick daneben oder „Schließen“ führen zurück. Auf dem Handy öffnet der Menü-Button die Navigation; Board und Aufgaben-Overlay sind ebenfalls mobil bedienbar. Die Inbox ist unter `/inbox`. Das Zahnrad unten in der Seitenleiste öffnet die Einstellungen (Profil, Passwort, Darstellung) und für Admins die Nutzerverwaltung.

### Mail, SSO und Anmeldeschutz

Der separate `worker`-Container versendet Einladungen, Passwort-Reset-Links und Benachrichtigungs-Digests über den SMTP-Server aus `.env`. Eine Mail, die fünfmal nicht zugestellt werden kann, wird aufgegeben (`mail_outbox.failed_at`, Fehler in `last_error`), ohne andere Mails aufzuhalten.

SMTP-Zugang in `.env` setzen: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` und bei Bedarf `SMTP_USER`, `SMTP_PASSWORD`. Mailpit gehört nur in die Entwicklung (`docker-compose.dev.yml`): Es zeigt Reset- und Einladungslinks ohne Anmeldung an und darf nie öffentlich erreichbar sein. Optionales SSO benötigt `OIDC_ISSUER`, `OIDC_CLIENT_ID` und `OIDC_CLIENT_SECRET`. Die Redirect-URI beim Provider lautet `<Adresse>/api/auth/callback/oidc`, mit der Adresse, unter der Nutzer pp_light öffnen (z. B. `https://pp.firma.local`). Mit `OIDC_ALLOWED_DOMAINS=firma.de,partner.de` dürfen verifizierte Adressen dieser Domains ein neues Konto erhalten; sonst braucht ein neues Konto eine Einladung. Konten werden nur über eine vom Provider bestätigte E-Mail-Adresse verknüpft (`email_verified`). Microsoft Entra ID sendet dieses Feld nicht; dort `OIDC_TRUST_EMAIL=true` setzen, aber nur für einen eigenen Tenant als Issuer (nicht `common`), denn dann vertraut pp_light jeder Adresse, die dieser Issuer meldet.

Anmeldeschutz: Nach fünf falschen Passwörtern ist ein Konto 15 Minuten gesperrt, nach 20 Fehlversuchen von derselben IP diese IP. Ein Passwort-Reset beendet alle bestehenden Sitzungen; deaktivierte Konten verlieren offene Einladungs- und Reset-Links.

### SMTP-Verschlüsselung und Diagnose

Alle Optionen werden zur Laufzeit gelesen. Nach Änderungen an `.env` die Container mit `docker compose up -d --force-recreate app worker` neu erstellen; ein Rebuild ist für spätere Konfigurationsänderungen nicht nötig. `restart` allein übernimmt keine geänderten Compose-Umgebungsvariablen.

| Variable | Bedeutung / Standard |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` | Mailserver und Port; Port bleibt aus Kompatibilitätsgründen `1025` (Mailpit), in Produktion meist `25`, `587` oder `465` explizit setzen. |
| `SMTP_FROM` | Absender, Standard `pp_light <no-reply@localhost>`. |
| `SMTP_USER`, `SMTP_PASSWORD` | Optionale Anmeldung; ohne Benutzer keine Anmeldung. `SMTP_PASS` ist ein Alias für das Passwort; `SMTP_PASSWORD` hat Vorrang. |
| `SMTP_TLS_MODE` | `auto` (Standard): STARTTLS, wenn angeboten; ohne Angebot Klartext. `starttls` und `required`: STARTTLS erzwingen, bei fehlendem Angebot oder fehlerhaftem Handshake abbrechen. `ssl`: TLS direkt beim Verbindungsaufbau. `none`: STARTTLS auch bei Angebot abschalten. |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` (Standard): Zertifikat und Hostname prüfen. `false` akzeptiert ungültige Zertifikate und schwächt die Authentizität. |
| `SMTP_TLS_CA_FILE` | Zusätzliche CA-Datei (PEM), im Container lesbarer Pfad; leer = normaler Truststore. |
| `SMTP_TLS_MIN_VERSION` | `TLSv1.2` (Standard); außerdem `TLSv1.3`, `TLSv1.1`, `TLSv1`. Alte Protokolle nur als bewusster Notbehelf. |
| `SMTP_TLS_CIPHERS` | OpenSSL-Cipher-String; leer = Node-Defaults. `DEFAULT@SECLEVEL=0` erlaubt schwache Altsysteme, einschließlich DHE-1024. |
| `SMTP_SECURE` | Kompatibilität mit bestehenden Installationen: `true` entspricht `ssl`, solange `SMTP_TLS_MODE` nicht gesetzt ist. Ein expliziter neuer Modus hat Vorrang. |

`none`, deaktivierte Zertifikatsprüfung und schwache Ciphers nur bewusst in vertrauenswürdigen internen Netzen einsetzen; vorzugsweise den Mailserver korrigieren. Der Worker warnt beim Start bei `none` und deaktivierter Zertifikatsprüfung. Ungültige TLS-Modi, Versions-, Boolean- oder Port-Werte sowie nicht lesbare CA-Dateien führen zum Startabbruch. Die TLS-Einstellungen gelten nur für SMTP, ohne prozessweite TLS-Abschwächung über `NODE_OPTIONS`.

Interne CA bevorzugen: z. B. `./certs/smtp-ca.pem` ablegen und mit einer `docker-compose.override.yml` in App und Worker einbinden (der Benutzer im Container muss die Datei lesen können):

```yaml
services:
  app:
    volumes:
      - ./certs/smtp-ca.pem:/certs/smtp-ca.pem:ro
  worker:
    volumes:
      - ./certs/smtp-ca.pem:/certs/smtp-ca.pem:ro
```

Dazu `SMTP_TLS_CA_FILE=/certs/smtp-ca.pem` in `.env` setzen. Die zusätzliche CA ergänzt den normalen Truststore; sie behebt keine abgelaufenen Zertifikate.

```bash
docker compose run --rm --no-deps worker smtp:check
# Lokal: lädt .env und, falls vorhanden, .env.local (hat Vorrang); Prozess-Env hat Vorrang vor beiden
npm run smtp:check
```

Der Check zeigt DNS, Erreichbarkeit, EHLO/STARTTLS-Angebot, TLS-Protokoll, Cipher, ephemeren Schlüssel samt DH-Bitlänge und Zertifikat (Subject, Issuer, Ablauf, Ketten-/Hostnamenprüfung). Zur Zertifikatsinspektion akzeptiert eine separate Verbindung ungültige Zertifikate, ohne Anmeldung oder Versand. Das abschließende `transporter.verify()` verwendet die tatsächlichen TLS- und Zugangseinstellungen; es prüft Verbindung und Anmeldung, aber nicht die Annahme einer Mail durch den Server. Fehler liefern Exitcode 1. Es wird keine Mail gesendet. Bei einem nicht verhandelbaren TLS-Handshake sind Cipher und Zertifikat nicht verfügbar; für eine erneute Diagnose ggf. bewusst die SMTP-spezifischen Optionen anpassen. Ein externes `openssl` im App-Image ist dafür nicht nötig.

| Fehler | Mögliche Ursache | Abhilfe |
|---|---|---|
| `dh key too small` | DH-Parameter des Servers zu klein, z. B. 1024 Bit | Server korrigieren; Notbehelf `SMTP_TLS_CIPHERS=DEFAULT@SECLEVEL=0`. |
| `handshake failure` (Alert 40) | Keine gemeinsame Cipher/TLS-Version | Server korrigieren; gezielt `SMTP_TLS_MIN_VERSION` / `SMTP_TLS_CIPHERS` anpassen. |
| `certificate has expired` | Abgelaufenes Zertifikat | Zertifikat erneuern; Notbehelf `SMTP_TLS_REJECT_UNAUTHORIZED=false`. |
| `self-signed certificate in chain` | Interne CA unbekannt | Root-CA über `SMTP_TLS_CA_FILE` einbinden. |
| `ETIMEDOUT` bei internen HTTP-Zielen | Proxy-Ausnahme fehlt oder Netzwerk blockiert | `NO_PROXY_EXTRA` ergänzen, DNS/Firewall prüfen. SMTP/Postgres verwenden direkte TCP-Verbindungen. |

### Betrieb hinter einem ausgehenden Proxy

`HTTP_PROXY` und `HTTPS_PROXY` in `.env` setzen (z. B. `http://proxy.example.org:3128`), sonst leer lassen. App und Worker erhalten Groß- und Kleinschreibung identisch; Node 24 nutzt diese Werte für HTTP(S) und `fetch` über `NODE_USE_ENV_PROXY=1`. `NO_PROXY_EXTRA` ergänzt kommaseparierte Ausnahmen für Hosts, Domains oder IPs. Loopback und `postgres`, `app`, `worker`, `caddy`, `backup` sind immer ausgenommen. CIDR-Ausnahmen werden nicht von jedem Client unterstützt; bei Node einzelne IPs oder unterstützte IP-Bereiche verwenden. SMTP und PostgreSQL verbinden sich direkt per TCP; ein HTTP-Proxy aus diesen Variablen tunnelt sie nicht automatisch.

Caddy erhält ausdrücklich leere Proxy-Variablen und verbindet sich direkt mit der App. Für `PP_TLS=internal` und eigene Zertifikate benötigt er keinen ausgehenden Proxy. Eine individuell eingerichtete öffentliche ACME-Zertifikatsausstellung benötigt dagegen Internetzugriff: In einem Netz mit Proxy-Pflicht die Proxy-Variablen für Caddy über eine lokale Compose-Override setzen und seine `NO_PROXY`-Ausnahmen behalten. Proxy-Einstellungen für Docker-Image-Pulls und Build-Downloads sind separat in Docker Desktop bzw. im Docker-Daemon/Build zu konfigurieren; die Runtime-Variablen der Dienste steuern diese nicht.

### Hinweise

- Migrationen laufen bei jedem Start automatisch.
- Bei ungültiger Konfiguration, etwa einem fehlenden oder Platzhalter-`AUTH_SECRET`, bricht der Container ab und nennt die Variable: `docker compose logs app`.
- Daten liegen in den Volumes `pgdata` (Datenbank), `uploads` (Anhänge) und `caddy_data` (Zertifikate). `docker compose down` lässt sie stehen; `down -v` löscht sie.

## Entwicklung

Voraussetzung: Node 24, Docker.

```bash
npm install
docker compose -f docker-compose.dev.yml up -d postgres mailpit  # Postgres (inkl. Test-DBs) + Mailpit (http://localhost:8025)
cp .env.example .env.local                        # AUTH_SECRET wie oben setzen
npm run db:migrate
npm run seed:admin -- --email admin@example.com --name "Ada Admin" --password admin-passwort-123
npm run dev                                       # http://localhost:3000
docker compose -f docker-compose.dev.yml up -d --build worker  # Mail- und Reminder-Worker
```

Für eine lokale Vorschau mit vier Beispielaufgaben:

```bash
npm run seed:demo -- --password '<eigenes Demo-Passwort mit mindestens 10 Zeichen>'
```

Dann unter <http://localhost:3000> als `demo@pp-light.local` anmelden. Das Demo-Konto hat Admin-Rechte. Die Startseite zeigt zugewiesene Aufgaben; über die Navigation erreichst du „Demo-Projekt“, „Benachrichtigungen“ und „Nutzerverwaltung“. Der Seed ergänzt fehlende Beispieldaten, ohne vorhandene Aufgaben zu löschen. Er akzeptiert nur die lokale Datenbank `pp_light`.

| Befehl | Zweck |
|---|---|
| `npm test` | Unit- und Integrationstests (Vitest, gegen DB `pp_light_test`) |
| `npm run test:e2e` | Browser-Tests (Playwright, Port 3100, DB `pp_light_e2e`, Mailpit auf Port 8025). Die Vorschau auf Port 3000 kann weiterlaufen. |
| `npm run typecheck` / `npm run lint` | Statische Prüfung |
| `npm run test:smtp` | SMTP-Modi, TLS und Diagnose gegen lokale Testserver, ohne Datenbank |
| `npm run db:generate` | Migration aus `src/server/db/schema.ts` erzeugen |

Bei jedem Push und Pull Request führt [GitHub Actions](.github/workflows/checks.yml) Typecheck, Lint, Unit- und Browser-Tests sowie den Produktions-Build mit frischem Postgres und Mailpit aus.

Aufbau: UI (`src/app`, `src/components`) → Server Actions → Prüfung (zod) → Rechte (`src/server/permissions`) → Services (`src/server/<modul>`).

Falls Playwright unter Windows nach dem Test beim Beenden seines Dev-Servers hängt, kann der Testserver separat laufen. In PowerShell:

```powershell
# Terminal 1
$env:PP_LIGHT_E2E = '1'
$env:DATABASE_URL = 'postgres://pp:pp@localhost:5432/pp_light_e2e'
$env:AUTH_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e'
$env:AUTH_TRUST_HOST = 'true'
$env:APP_URL = 'http://localhost:3100'
node node_modules/next/dist/bin/next dev --port 3100

# Terminal 2
$env:PP_LIGHT_REUSE_E2E_SERVER = '1'
npm run test:e2e
```
