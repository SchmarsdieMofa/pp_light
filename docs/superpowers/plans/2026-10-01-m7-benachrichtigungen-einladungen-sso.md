# M7 – Benachrichtigungen, Einladungen und SSO

**Basis:** M6 in `main` (`6f264ef`). **Spec:** `docs/superpowers/specs/2026-09-30-pp-light-design.md`, Abschnitte Login und Benachrichtigungen.

## Abnahme

1. Zuweisung, Erwähnung, Kommentar, Statuswechsel und automatische Terminverschiebung erzeugen in derselben DB-Transaktion Benachrichtigungen für die betroffenen aktiven Nutzer, nie für den Auslöser. Die Inbox und eine Glocke zeigen ungelesene Einträge; sie aktualisieren sich alle 30 Sekunden. Einträge lassen sich einzeln oder gemeinsam als gelesen markieren.
2. Ein separater pg-boss-Worker verarbeitet E-Mail-Digests und den täglichen Fälligkeitslauf. Er wiederholt fehlgeschlagene Jobs höchstens dreimal und protokolliert dauerhafte Fehler. Ein Nutzer erhält höchstens einen Digest pro zehn Minuten. E-Mail-Typen sind pro Nutzer abschaltbar.
3. Admins können Nutzer per E-Mail einladen und deaktivieren. Einladungs-Tokens werden nur gehasht gespeichert, verfallen nach sieben Tagen und lassen sich einmalig gegen ein Passwort eintauschen. Passwort-Reset nutzt denselben Schutz und verrät nicht, ob die E-Mail existiert.
4. Optionales OIDC-Login verknüpft nur eine vom Provider verifizierte E-Mail mit einem bestehenden Konto. Neue Konten brauchen eine offene Einladung oder eine erlaubte Domain. Provider-ID und Subject werden dauerhaft gespeichert. Ohne OIDC-Konfiguration bleibt der Passwort-Login unverändert.
5. Mailpit deckt Einladung, Reset und Digest im lokalen Docker-/E2E-Setup ab. Bestehende 180 Unit- und 24 E2E-Tests bleiben grün; neue Rechte-, Token- und Inbox-Fälle ergänzen sie.

## Reihenfolge

1. Schema und Migration: Notifications, E-Mail-Präferenzen, Mail-Outbox, Auth-Tokens, OIDC-Accounts.
2. Ereigniszuordnung und Inbox-Service mit Transaktions-Tests.
3. Inbox-Seite, Glocke/Polling und E-Mail-Präferenzen.
4. SMTP-Service und pg-boss-Worker samt Compose-Start, Digest und täglichem Terminlauf.
5. Einladungen, Passwort-Reset und Admin-Oberfläche.
6. OIDC-Kontoverknüpfung, Login-Knopf und Sicherheits-Tests.
7. E2E, Build, Review, Demo-Migration, Merge und Push.

## Sicherheitsgrenzen

- Jedes Inbox-Update filtert nach der angemeldeten Nutzer-ID. Benachrichtigungslinks verweisen nur auf Projekte, auf die der Empfänger weiterhin Zugriff hat.
- Auth-Tokens sind zufällig, einmalig und laufen ab. Reset-Antworten sind für bekannte und unbekannte E-Mails gleich.
- OIDC verlangt `email_verified === true`; die E-Mail allein ohne diese Bestätigung berechtigt nicht zur Verknüpfung.
- Der Worker startet als eigener Prozess; HTTP-Requests starten weder Polling noch SMTP-Versand.

## Verifikation

- 190 Vitest-Tests und 26 Playwright-Tests bestanden; die neuen Einladungs-/Inbox-Tests zusätzlich dreimal hintereinander.
- Typecheck, ESLint, Next.js-Produktions-Build, `build:scripts`, Docker-Build und beide Compose-Konfigurationen bestanden.
- Der lokale Docker-Worker hat in Mailpit einen Digest, eine Einladung und einen Passwort-Reset mit gültigen Links zugestellt. Der Mail-Outbox-Inhalt bleibt in PostgreSQL verschlüsselt.
- Die lokale Demo-Datenbank ist migriert; `demo@pp-light.local` hat Admin-Zugriff sowie Beispiel-Benachrichtigungen. Produktions-Abhängigkeiten: `npm audit --omit=dev` meldet 0 Schwachstellen.
