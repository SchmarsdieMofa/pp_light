# pp_light

Schlanker, selbst gehosteter Projektplaner für kleine Teams: Aufgaben im Zentrum, Kanban und Gantt als Sichten darauf.

- Design: [`docs/superpowers/specs/2026-09-30-pp-light-design.md`](docs/superpowers/specs/2026-09-30-pp-light-design.md)
- Roadmap: [`docs/superpowers/plans/2026-10-01-roadmap.md`](docs/superpowers/plans/2026-10-01-roadmap.md)

Stack: Next.js 16 · TypeScript · PostgreSQL 17 + Drizzle · Auth.js · Tailwind/shadcn · Docker Compose

## Betrieb (Produktion)

Voraussetzung: Docker mit Compose.

```bash
cp .env.example .env
# AUTH_SECRET setzen (Pflicht, zufällig, mind. 32 Zeichen):
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# POSTGRES_PASSWORD setzen (nur Buchstaben/Ziffern):
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

docker compose up -d --build

# Ersten Admin anlegen:
docker compose exec app node scripts/create-admin.mjs --email admin@firma.de --name "Vorname Nachname" --password "<mind. 10 Zeichen>"
```

Danach läuft die App auf <http://localhost:3000>. Die Startseite „Meine Arbeit“ zeigt zugewiesene Aufgaben nach Fälligkeit und lässt sie mit einem Klick abschließen. `Strg+K` (Mac: `⌘+K`) öffnet die Suche nach Aufgaben und Projekten. `?` zeigt alle Tastenkürzel; `C` fokussiert die Schnell-Eingabe und `1`/`2`/`3` wechseln im Projekt zwischen Board, Gantt und Liste. Auf dem Handy öffnet der Menü-Button die Navigation; Board und Aufgaben-Panel sind ebenfalls mobil bedienbar. Die Inbox ist unter `/inbox`, die Nutzerverwaltung für Admins unter `/admin`.

Der separate `worker`-Container versendet Einladungen, Passwort-Reset-Links und Benachrichtigungs-Digests über den SMTP-Server aus `.env`. Eine Mail, die fünfmal nicht zugestellt werden kann, wird aufgegeben (`mail_outbox.failed_at`, Fehler in `last_error`), ohne andere Mails aufzuhalten.

SMTP-Zugang in `.env` setzen: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` und bei Bedarf `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`. Mailpit gehört nur in die Entwicklung (`docker-compose.dev.yml`): Es zeigt Reset- und Einladungslinks ohne Anmeldung an und darf nie öffentlich erreichbar sein. Optionales SSO benötigt `OIDC_ISSUER`, `OIDC_CLIENT_ID` und `OIDC_CLIENT_SECRET`. Die Redirect-URI beim Provider lautet `<APP_URL>/api/auth/callback/oidc`. Mit `OIDC_ALLOWED_DOMAINS=firma.de,partner.de` dürfen verifizierte Adressen dieser Domains ein neues Konto erhalten; sonst braucht ein neues Konto eine Einladung. Konten werden nur über eine vom Provider bestätigte E-Mail-Adresse verknüpft (`email_verified`). Microsoft Entra ID sendet dieses Feld nicht; dort `OIDC_TRUST_EMAIL=true` setzen, aber nur für einen eigenen Tenant als Issuer (nicht `common`), denn dann vertraut pp_light jeder Adresse, die dieser Issuer meldet.

Anmeldeschutz: Nach fünf falschen Passwörtern ist ein Konto 15 Minuten gesperrt, nach 20 Fehlversuchen von derselben IP diese IP. Ein Passwort-Reset beendet alle bestehenden Sitzungen; deaktivierte Konten verlieren offene Einladungs- und Reset-Links.

- Migrationen laufen bei jedem Start automatisch.
- Bei ungültiger Konfiguration, etwa einem fehlenden oder Platzhalter-`AUTH_SECRET`, bricht der Container ab und nennt die Variable: `docker compose logs app`.
- Daten liegen in den Volumes `pgdata` (Datenbank) und `uploads` (Anhänge). `docker compose down` lässt sie stehen.

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
