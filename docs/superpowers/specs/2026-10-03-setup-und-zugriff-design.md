# Ersteinrichtung und Zugriffsart (HTTP/HTTPS)

## Ziel

Eine frische Installation wird im Browser fertig eingerichtet: Admin anlegen ohne Kommandozeile. HTTP oder HTTPS
ist keine starre `.env`-Entscheidung mehr, sondern wird nach der Einrichtung in der App festgelegt – so, dass ein
Firmen-Proxy, der HTTPS beendet und per HTTP weiterreicht, nie in eine Umleitungsschleife läuft.

Nur interne Netze. Kein Let's Encrypt, kein Trusted-Proxy-Modus.

## Ersteinrichtung

- Solange es keinen Nutzer gibt, leitet `src/proxy.ts` jede Seite auf `/setup` um (API-Routen und `/_next` nicht).
- `/setup` verlangt **Einrichtungscode**, Name, E-Mail, Passwort (mind. 12 Zeichen, wie beim Passwort-Setzen).
- Der Code (8 Zeichen, Format `ABCD-EFGH`, ohne verwechselbare Zeichen) wird beim Start des App-Containers
  (`docker/entrypoint.sh` → `scripts/setup-code.mjs`) neu erzeugt und groß ins Log geschrieben, solange es keinen
  Nutzer gibt. In der DB liegt nur sein SHA-256-Hash. Fehlt ein Code (Entwicklung ohne Entrypoint), erzeugt die
  Setup-Seite einen und schreibt ihn ins Server-Log.
- Abschluss in einer Transaktion mit `pg_advisory_xact_lock`: Nutzerzahl = 0 prüfen, Code prüfen (zeitkonstant),
  Admin anlegen, Basis-Adresse aus der Anfrage (`x-forwarded-proto`/`host`) speichern, Code löschen. Zwei
  gleichzeitige Versuche: der zweite scheitert mit „bereits eingerichtet“.
- Danach automatisch angemeldet, Weiterleitung auf `/?settings=server`.
- Gibt es Nutzer, leitet `/setup` auf `/login`. `create-admin` bleibt als Alternative.

## Zugriffsart und Adresse

Tabelle `app_settings` (genau eine Zeile, `id = 1`): `https_only boolean default false`, `base_url text null`,
`setup_code_hash text null`.

- **Caddy** bedient `http://` (jeder Host, Port 80) und `https://{$PP_DOMAIN}` (Port 443) mit
  `auto_https disable_redirects` – keine eigene Umleitung mehr. Caddy setzt `X-Forwarded-Proto` nach dem
  tatsächlichen Schema (eingehende Header von Clients werden verworfen).
- **Umleitung in der App:** `proxy.ts` leitet mit 308 auf `https://<host><pfad>` um, wenn `https_only` gesetzt ist und
  `x-forwarded-proto` gleich `http` ist. Anfragen ohne den Header (Healthcheck, `next dev`) werden nie umgeleitet.
  Der Zustand wird im Proxy 5 Sekunden zwischengespeichert.
- **Schutz gegen die Schleife:** „Nur HTTPS“ lässt sich nur aus einer Anfrage einschalten, deren
  `x-forwarded-proto` `https` ist (ohne Header: das Protokoll der URL). Sonst `VALIDATION`-Fehler mit Erklärung. Hinter
  einem Firmen-Proxy, der per HTTP weiterreicht, sieht die App immer `http` – die Option bleibt gesperrt.
- **Notausgang:** `docker compose exec app node scripts/access-mode.mjs http|https`.
- **Adresse für Links in Mails:** `base_url` (beim Setup aus der Anfrage, in den Einstellungen änderbar, nur
  `http(s)://host[:port]`, ohne Pfad). Fallback `APP_URL`, dann `http://localhost:3000`. Einladungen und Digest nutzen
  `getBaseUrl(db)`.
- **Auth.js:** Compose setzt `APP_URL`/`AUTH_URL` nicht mehr. Mit `trustHost` nimmt Auth.js Schema und Host aus den
  Forwarded-Headern: sichere Cookies bei HTTPS, normale bei HTTP.

## Oberfläche

Neuer Einstellungs-Tab **„Server“** (nur Admins), Muster wie „Backups“:
- Adresse: Eingabefeld, speichert beim Verlassen.
- Zugriff: zwei Optionen „HTTP und HTTPS“ / „Nur HTTPS“. Ist die aktuelle Verbindung HTTP, ist „Nur HTTPS“
  deaktiviert mit Hinweis und Link auf dieselbe Seite über `https://`.

## Tests

- Unit: Setup (Code falsch/richtig, zweiter Versuch, Code-Format), Einstellungen (https nur aus https, Adresse
  validiert, Members verboten), Umleitungsentscheidung als reine Funktion.
- E2E: Server-Tab bei bestehender DB (E2E-DB hat immer Nutzer).
- Manuell: frischer Produktions-Stack lokal (eigenes Compose-Projekt) – Setup über HTTPS, Zugriff „Nur HTTPS“,
  HTTP leitet um; Notausgang.
