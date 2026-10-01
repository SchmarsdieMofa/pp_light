# pp_light – Projektplaner Webportal: Design-Spec

Stand: 2026-09-30 · Status: Entwurf zur Prüfung

## Ziel
Schlanker, selbst gehosteter Projektplaner für ein kleines Team (2–15 Personen). Im Kern stehen Aufgaben; Kanban und Gantt sind zwei Sichten auf dieselben Aufgaben. Erfolg heißt: Das Team plant echte Projekte darin, und der Start klappt mit `docker compose up`.

## Umfang v1
- Projekte, Aufgaben, Kanban, Gantt, Listenansicht
- Login per E-Mail/Passwort mit Einladung **und** OIDC-SSO (Microsoft/Google/Keycloak)
- Rollen & Rechte, Kommentare & Anhänge, Benachrichtigungen (In-App + E-Mail)
- Aufgaben: Unteraufgaben, Abhängigkeiten mit Auto-Verschieben, eigene Status-Spalten, Labels, Priorität, Checklisten, Phasen/Meilensteine
- UI auf Deutsch
- **Nicht in v1:** Zeiterfassung, Feiertagskalender, WebSockets/Echtzeit, Mobile-App, öffentliche API

## Stack
- Next.js (App Router, Server Actions), TypeScript
- PostgreSQL + Drizzle ORM und Migrationen
- Auth.js (Credentials + OIDC), Passwort-Hashing mit argon2
- UI: shadcn/ui + Tailwind, dnd-kit (Kanban), Gantt-Bibliothek (SVAR Gantt oder Frappe Gantt; Auswahl im Implementierungsplan per Spike)
- pg-boss für Jobs (Mails, Reminder, Cron), kein Redis
- Docker Compose: `app` (Next.js + Worker-Prozess) und `postgres`; im Dev zusätzlich `mailpit`
- Konfiguration über `.env`: DATABASE_URL, SMTP_*, OIDC_*, APP_URL, UPLOAD_MAX_MB

## Architektur / Ordnerstruktur
```
pp_light/
├─ docker-compose.yml, docker-compose.dev.yml, Dockerfile, .env.example
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login, invite/[token], reset
│  │  ├─ (app)/projects/[id]/{board,gantt,list,settings}
│  │  ├─ (app)/tasks/[id]
│  │  ├─ (app)/inbox, (app)/settings, (app)/admin
│  │  └─ api/attachments/[id]
│  ├─ server/
│  │  ├─ db/ (schema.ts, migrations/)
│  │  ├─ auth/ permissions/
│  │  ├─ projects/ phases/ tasks/ dependencies/ comments/ attachments/ notifications/ activity/
│  │  └─ jobs/ (worker entry, mail, reminders)
│  ├─ components/ (kanban/, gantt/, task/, ui/)
│  └─ lib/ (zod-Schemas, Arbeitstage-Datumslogik, fractional index)
└─ tests/ (unit/ mit vitest, e2e/ mit playwright)
```
**Regeln:**
- UI → Server Action → zod-Prüfung → `permissions.can()` → Service in `server/<modul>`
- `server/` importiert nie aus UI-Code
- Jedes Modul hat Service + Queries und ist einzeln testbar

## Datenmodell
```
users(id, email uniq, name, password_hash null, role[admin|member], active, created_at)
accounts(user_id, provider, provider_account_id)
invitations(id, email, token_hash, role, invited_by, expires_at, accepted_at)

projects(id, name, description, key, archived_at, created_by, task_counter)
project_members(project_id, user_id, role[owner|member|guest])
statuses(id, project_id, name, color, position, is_done)
labels(id, project_id, name, color)
phases(id, project_id, name, start_date, end_date, is_milestone, position)

tasks(id, project_id, phase_id null, parent_id null, number, title, description(md),
      status_id, priority[none|low|med|high|urgent], start_date, due_date,
      position, created_by, created_at, updated_at, completed_at)
task_assignees(task_id, user_id)
task_labels(task_id, label_id)
task_dependencies(blocker_id, blocked_id, lag_days default 0)
checklist_items(id, task_id, text, done, position)

comments(id, task_id, author_id, body(md), created_at, edited_at)
attachments(id, task_id, comment_id null, filename, mime, size, storage_key, uploaded_by, created_at)

notifications(id, user_id, type, task_id, actor_id, payload jsonb, read_at, created_at)
notification_prefs(user_id, type, email, in_app)
activity_log(id, project_id, task_id, actor_id, action, diff jsonb, group_id null, created_at)
```
**Entscheidungen:**
- Aufgabennummer `KEY-n` pro Projekt, vergeben über `projects.task_counter` in derselben Transaktion
- Unteraufgaben: nur 1 Ebene (Service prüft das; das Schema erlaubt später mehr). Am Parent wird der Fortschritt „2/5“ angezeigt
- Parent wird nicht automatisch „Fertig“, nur ein Hinweis erscheint, wenn alle Kinder fertig sind
- Checklisten = leichte Häkchen ohne Status oder Zuständige
- Phasen: Gruppierung im Projekt. Im Gantt erscheinen Sammelbalken, deren Zeitraum sich aus den Aufgaben ergibt (falls keine Aufgaben: eigene Daten). Meilensteine werden als Raute dargestellt
- Sortierung per fractional index in `position`
- Neues Projekt bekommt die Standard-Status Offen / In Arbeit / Review / Fertig (`is_done`)

## UI-Design
- **Layout:** Seitenleiste links (Start, Inbox mit Zähler, Projektliste, „+ Neu“, unten Admin/Einstellungen). Kopfzeile mit Projektname, Sicht-Tabs Board | Gantt | Liste | ⚙, Glocke, Avatar. Die Aufgabe öffnet als **Panel rechts**; das Board bleibt sichtbar. Die URL `/tasks/[id]` funktioniert auch als eigene Seite (teilbarer Link)
- **Stil:** ruhig und minimal (Richtung Linear/Notion). Neutrale Grautöne, eine Akzentfarbe, Farbe nur für Status, Labels und Priorität. Schrift Inter. Hell- und Dunkelmodus (System/manuell), Farben als CSS-Tokens (shadcn-Theme)
- **Kanban-Karte:** Dichte pro Nutzer umschaltbar
  - Kompakt: Titel, Termin, Avatar
  - Mittel: + Nummer, Labels, Prio-Symbol, Fortschritt Unteraufgaben/Checkliste, Kommentaranzahl
  - Ausführlich: + Beschreibungsanfang, Phase
  - Überfällig: roter Termin
- **Gantt:** links eine Tabelle nach Phasen gruppiert (einklappbar), rechts die Zeitachse. Zoom Tag/Woche/Monat, Heute-Linie, Wochenenden grau, Abhängigkeitspfeile. Balken ziehen/verlängern ändert den Termin (löst Auto-Verschieben aus). Meilensteine als Raute, Phasen als Sammelbalken. Hinweis-Symbol bei „könnte früher starten“
- **Liste:** Tabelle mit sortier- und filterbaren Spalten (Status, Zuständige, Label, Prio, Phase, Termin)
- **Startseite „Meine Arbeit“:** eigene Aufgaben projektübergreifend, gruppiert nach Überfällig / Heute / Diese Woche / Später / Ohne Termin. Direkt abhakbar, dazu die ungelesenen Benachrichtigungen
- **Extras v1:**
  - Befehlspalette Strg+K (Suche über Aufgaben und Projekte mit Postgres-Volltext, Aktionen)
  - Tastenkürzel: C neue Aufgabe, 1/2/3 Sicht, Esc Panel zu, ? Hilfe
  - Schnell-Anlegen per „+“ in jeder Spalte/Phase (Titel + Enter)
  - Responsiv: auf dem Handy Liste, Board, Detail und Kommentieren; Gantt nur ab Tablet/Desktop
- **Daten dazu:** `user_preferences(user_id, theme[system|light|dark], card_density[compact|medium|full])`, `tasks.search_vector tsvector` + GIN-Index
- **E2E-Ergänzung:** Strg+K findet eine Aufgabe; mobiles Viewport-Profil in Playwright für Board/Detail

## Abhängigkeiten & Auto-Verschieben
- Nur finish-to-start: `B.start ≥ A.due + 1 Arbeitstag + lag_days`
- Zyklen werden beim Anlegen per Graphprüfung abgelehnt
- Ändert sich der Termin einer Aufgabe, durchläuft der Service die Nachfolger in topologischer Reihenfolge. Jeder Nachfolger, der die Regel verletzt, wird **nach hinten** verschoben, die Dauer in Arbeitstagen bleibt gleich
- Nie nach vorne ziehen: Endet A früher, zeigt das Gantt nur den Hinweis „könnte früher starten“
- Fertige Aufgaben werden nie verschoben
- Arbeitstage Mo–Fr (Feiertage nicht in v1)
- Alles läuft in einer Transaktion. Das `activity_log` bekommt pro Aufgabe den Eintrag „verschoben durch KEY-n“, und die Zuständigen werden benachrichtigt
- Die UI zeigt den Toast „n Aufgaben verschoben“ mit Rückgängig (setzt alle betroffenen Termine per Gruppen-ID im Log zurück)

## Rechte
| Rolle | Darf |
|---|---|
| Admin (global) | alles, Nutzer einladen/deaktivieren, SSO-Konfiguration einsehen |
| Owner (Projekt) | Projekt, Status, Labels, Phasen, Mitglieder verwalten |
| Mitglied | Aufgaben anlegen/bearbeiten/verschieben, kommentieren, hochladen |
| Gast | lesen, kommentieren, eigene Kommentare bearbeiten |

Projekte sind nur für ihre Mitglieder sichtbar. Jede Abfrage filtert serverseitig nach Mitgliedschaft. Die Matrix liegt zentral in `server/permissions`.

## Login
- Admin lädt per E-Mail ein. Das Token wird gehasht gespeichert und läuft nach 7 Tagen ab. Der Nutzer setzt dann sein Passwort
- Passwort-Reset per E-Mail
- OIDC: Existiert bereits ein User mit derselben verifizierten E-Mail, wird das Konto verknüpft. Unbekannte E-Mails werden nur mit Einladung oder erlaubter Domain (`OIDC_ALLOWED_DOMAINS`) angenommen
- Beim ersten Start wird ein Admin per CLI-Seed angelegt

## Benachrichtigungen
- Auslöser: zugewiesen, @erwähnt, Kommentar auf eigener/zugewiesener Aufgabe, Status geändert, durch Abhängigkeit verschoben, fällig morgen, überfällig
- In-App: Inbox und Glocke mit Zähler, Polling alle 30 s
- E-Mail: pg-boss-Job, Digest mit max. 1 Mail pro 10 min pro Nutzer, pro Typ abschaltbar
- Täglicher Cron-Job für Fälligkeits- und Überfällig-Reminder

## Anhänge
- Volume `/data/uploads`, zufälliger `storage_key`, Standard-Limit 25 MB
- Download nur über `/api/attachments/[id]` mit Rechte-Prüfung und `Content-Disposition: attachment`. Bilder mit Vorschau

## Fehlerbehandlung
- Server Actions liefern `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }`
- Optimistisches Drag & Drop, bei Fehler Rollback und Toast
- Konflikte bei gleichzeitiger Bearbeitung per `updated_at`-Vergleich, bei Abweichung erscheint „wurde zwischenzeitlich geändert“
- Worker: 3 Wiederholungen, danach Log

## Verifikation / Tests
- **Vitest** gegen eine echte Postgres-Testdatenbank (Docker): Rechte-Matrix, Auto-Verschieben (Kaskade, Arbeitstage, lag, Zyklus, fertige Aufgaben, Undo), Aufgabennummer, fractional index, Einladungs-Token, Unteraufgaben-Tiefe
- **Playwright E2E:** einladen → Mail in Mailpit → Passwort setzen → Projekt anlegen → Aufgabe + Unteraufgabe → Kanban-Drag → Gantt-Termin verschieben (Nachfolger rückt nach) → Kommentar mit @Erwähnung → Benachrichtigung in der Inbox
- Abnahme: `docker compose up` auf frischem System → Seed-Admin-Login funktioniert, Migrationen laufen automatisch
