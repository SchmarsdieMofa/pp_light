# M6 Kommentare & Anhänge – Implementation Plan

> Ausführung: superpowers:executing-plans (inline), TDD je Aufgabe, Commit + Push nach jeder Aufgabe.

**Goal:** Aufgaben bekommen eine Unterhaltung und Dateien:
- Kommentare in Markdown mit @Erwähnungen
- Anhänge mit geschütztem Download und Bildvorschau
- Verlauf aus dem Aktivitätslog im Panel
- Die Beschreibung wird ab jetzt als Markdown dargestellt

**Spec:** `docs/superpowers/specs/2026-09-30-pp-light-design.md` (Datenmodell `comments`, `attachments`; Abschnitt „Anhänge“; Rechte: Gast darf kommentieren und eigene Kommentare bearbeiten) · **Basis:** `main` nach M5 (`788c3ef`)

## Global Constraints

- Alle Regeln aus M1–M5 gelten. Insbesondere:
  - Services bekommen `db` als ersten Parameter und kommen ohne `next/*` aus.
  - Server Actions laufen über `requireActor` → `runAction` → `revalidatePath("/", "layout")`.
  - UI-Texte sind auf Deutsch; E2E-Alerts werden über ihren Text gesucht.
- **Rechte:**
  - Kommentieren: `comment.create` (Owner, Mitglied, Gast)
  - Eigenen Kommentar bearbeiten: `comment.editOwn`
  - Kommentar löschen: Autor:in oder `project.update`
  - Hochladen: `attachment.upload` (Owner, Mitglied)
  - Anhang löschen: hochladende Person oder `project.update`
  - Download: jede Person, die das Projekt sehen darf
- **Erwähnung:** Das Format im gespeicherten Text ist `@[Name](user:<uuid>)`.
  - Ein Autocomplete fügt das Token ein, sobald man `@` tippt.
  - Der Server übernimmt nur Erwähnungen von **Projektmitgliedern** in die Tabelle `comment_mentions`; die Benachrichtigungen dazu folgen in M7.
  - Beim Anzeigen wird das Token als hervorgehobener Name gerendert.
- **Markdown:** `react-markdown` + `remark-gfm`.
  - Kein rohes HTML.
  - Links öffnen mit `rel="noopener noreferrer nofollow"`.
  - Nur `http`, `https` und `mailto` sind als Link-Ziele erlaubt.
- **Anhänge:**
  - Speicherort: Verzeichnis aus `UPLOAD_DIR` (Standard `./data/uploads`, im Container `/data/uploads`).
  - Dateiname ist ein zufälliger `storage_key`; der Originalname wird nie als Pfad verwendet.
  - Größenlimit `UPLOAD_MAX_MB`.
  - Upload über den Route Handler `POST /api/tasks/[id]/attachments` (Server Actions sind auf 1 MB begrenzt).
  - Download über `GET /api/attachments/[id]`: immer mit `X-Content-Type-Options: nosniff` und `Content-Disposition: attachment` mit RFC-5987-Dateinamen.
  - Ausnahme: `?inline=1` nur für `image/png`, `image/jpeg`, `image/gif` und `image/webp` (nie SVG). Das ist die Bildvorschau.
  - Löschen entfernt den DB-Eintrag und die Datei.
  - In v1 hängen Anhänge an der Aufgabe; `comment_id` bleibt im Schema für später.
- **Verlauf:** Lesbare deutsche Einträge für alle vorhandenen `ActivityAction`s, die neuesten zuerst. Neue Aktionen dafür: `comment.added`, `attachment.added`, `attachment.removed`.
- **Kommentarzahl:** Sie erscheint auf der Kanban-Karte in der Dichte „Mittel“ und „Ausführlich“, so wie es die Spec verlangt.

## Review Focus

1. **Pfad-Traversal und bösartige Dateinamen:**
   - Beispiele: `../../etc/passwd`, ein Name mit Zeilenumbruch, ein `.svg` mit Script
   - Der Speicherpfad ergibt sich immer aus dem `storage_key`.
   - Der Dateiname im Header wird bereinigt.
   - SVG wird nie inline ausgeliefert.
2. **Download ohne Projektzugriff oder mit kaputter ID** → 404 (kein Hinweis, ob die Datei existiert); ohne Login → 401.
3. **Zu große Datei, leere Datei, fehlende Datei im Formular** → 413 bzw. 400 mit Meldung, ohne Restdatei auf der Platte.
4. **Erwähnung einer Nicht-Mitgliedschaft oder manipuliertes Token** → wird nicht gespeichert, der Text bleibt erhalten.
5. **Markdown mit `<script>`, `javascript:`-Link oder Bild von fremder Domain** → kein ausgeführtes HTML, kein `javascript:`-Link. Fremde Bilder werden nicht geladen, sondern nur als Link gezeigt.

## Aufgaben

1. **Schema:** `comments`, `comment_mentions`, `attachments` (+ Migration); `UPLOAD_DIR` in env/Docker; `.gitignore` `/data`. Tests: Schema- und Env-Tests.
2. **Kommentare-Service:**
   - Funktionen `createComment`, `updateComment`, `deleteComment`, `listComments`
   - Erwähnungen parsen und filtern (`parseMentions` rein und getestet)
   - Aktivität `comment.added` loggen
   - Tests: Rechte (Gast kommentiert, bearbeitet nur eigene), Validierung, Erwähnungen
3. **Anhänge-Service:**
   - Funktionen `saveAttachment`, `getAttachmentForDownload`, `deleteAttachment`, `listAttachments`, `safeFilename`, `contentDisposition`, `isInlineImage`
   - Dateisystem über `UPLOAD_DIR`
   - Tests: Rechte, Limit, Bereinigung, Löschen entfernt die Datei, Traversal
4. **Route Handler** für Upload und Download auf Basis des Service, mit Statuscodes 401, 404, 413 und 400.
5. **Abfragen:**
   - `getTaskDetail` liefert zusätzlich `comments`, `attachments`, `activity` (lesbar aufbereitet) sowie `canComment` und `canUpload`
   - `listProjectTasks` liefert `commentCount`
   - Tests dazu
6. **Server Actions** für Kommentare (anlegen, bearbeiten, löschen) und für das Löschen von Anhängen.
7. **UI:**
   - Markdown-Renderer: Beschreibung mit Umschalter „Bearbeiten“, Kommentare
   - Kommentar-Formular mit @-Autocomplete
   - Anhänge-Liste mit Upload und Bildvorschau
   - Verlauf
   - Kommentarzahl auf der Karte
8. **E2E:**
   - Kommentar mit Erwähnung erscheint mit hervorgehobenem Namen
   - Gast kommentiert, bearbeitet eigenen Kommentar und sieht keine Bearbeiten-Funktion bei fremden
   - Datei hochladen, Download-Header prüfen, Bild inline, löschen
   - Markdown-Sicherheit
   - Verlauf zeigt Statuswechsel
9. **Review + Fixes, Merge nach `main`, Push.**
