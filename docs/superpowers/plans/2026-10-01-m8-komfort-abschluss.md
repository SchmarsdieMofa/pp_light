# M8 Komfort & Abschluss – Implementation Plan

> Ausführung: superpowers:executing-plans (inline), TDD je Aufgabe, Commit + Push nach jeder Aufgabe.

**Goal:** pp_light wird im Alltag schnell bedienbar und ist abgenommen:
- Startseite „Meine Arbeit“
- Befehlspalette Strg+K mit Volltextsuche
- Tastenkürzel
- mobile Ansicht
- vollständiger E2E-Durchlauf laut Spec
- Abnahme mit `docker compose up`

**Spec:** `docs/superpowers/specs/2026-09-30-pp-light-design.md` (UI-Design: Startseite, Extras v1, Daten `tasks.search_vector`; Verifikation) · **Basis:** `main` nach M7 (`986f94b`)

## Global Constraints

- Alle Regeln aus M1–M7 gelten.
  - Services kommen ohne `next/*` aus.
  - Jede Abfrage filtert nach Projektmitgliedschaft; Admins sehen alles.
  - UI-Texte sind auf Deutsch.
  - E2E sucht Alerts über ihren Text.
- **„Meine Arbeit“:**
  - Inhalt: offene Aufgaben, denen ich zugewiesen bin, aus Projekten, die ich (noch) sehen darf.
  - Gruppen: Überfällig, Heute, Diese Woche (bis Sonntag), Später, Ohne Termin.
  - „Heute“ richtet sich nach der Zeitzone `Europe/Berlin` (Konstante `APP_TIME_ZONE`), nicht nach der Server-Zeitzone.
  - Abhaken setzt die Aufgabe auf die erste „erledigt“-Spalte ihres Projekts und hängt sie dort ans Ende (über `moveTask`). Projekte ohne eine solche Spalte → verständliche Meldung.
  - Dazu kommen die letzten 5 ungelesenen Benachrichtigungen mit Link zur Inbox.
- **Suche:**
  - Spalte `tasks.search_vector`, generiert aus Titel und Beschreibung (`german`), mit GIN-Index.
  - Treffer kommen aus Volltext (`websearch_to_tsquery`) ODER Titel-Präfix (`ilike`, Sonderzeichen escaped) ODER Nummer (`KEY-n`/`n`).
  - Projekte werden über Name oder Kürzel gefunden.
  - Höchstens 20 Treffer, sortiert nach Relevanz.
  - Nur sichtbare Projekte.
- **Tastenkürzel** wirken nicht, solange der Fokus in einem Eingabefeld, einem Select, einer Textarea oder einem `contenteditable` liegt:
  - `Strg/⌘+K`: Palette
  - `c`: neue Aufgabe (fokussiert die Schnell-Eingabe des aktuellen Projekts)
  - `1`/`2`/`3`: Board/Gantt/Liste
  - `Esc`: schließt das Panel
  - `?`: Hilfe
- **Mobil:**
  - Unter `md` wird die Seitenleiste zur Schublade mit Menü-Button in einer Kopfzeile.
  - Das Aufgaben-Panel liegt dort als Vollbild-Overlay über dem Inhalt.
  - Board und Liste scrollen horizontal; Gantt bleibt Desktop/Tablet.
- **E2E:**
  - Ein Durchlauf entlang der Spec-Kette (Einladung bis Inbox).
  - Ein Mobile-Profil (`Pixel 7`) für Board und Detail.

## Review Focus

1. **Suche mit Sonderzeichen oder leerem Begriff** (`%`, `_`, `'`, `:*`, `&`, nur Leerzeichen, 500 Zeichen) → kein SQL-Fehler, sinnvolles oder leeres Ergebnis.
2. **Suche oder „Meine Arbeit“ nach Entfernen aus einem Projekt** → keine Treffer oder Aufgaben aus diesem Projekt mehr.
3. **Tagesgrenze:** Eine Aufgabe, die heute fällig ist, steht um 00:30 Berliner Zeit (UTC 22:30 am Vortag) unter „Heute“.
4. **Tastenkürzel beim Tippen** in Titel, Kommentar oder Suche → kein Sprung und keine Palette außer bei Strg+K.
5. **Abhaken einer Aufgabe ohne Bearbeitungsrecht** (Gast) → Fehlermeldung, Aufgabe bleibt in der Liste.

## Aufgaben

1. **Datum:** `todayInZone()`, `weekEnd()`, `groupMyWork()` (rein, getestet inkl. Tagesgrenze).
2. **Daten:**
   - `listMyWork` und `completeTask` (Service, Tests: Rechte, Projektentzug, fehlende Erledigt-Spalte)
   - Startseite mit Gruppen, Abhaken und Benachrichtigungen
3. **Suche:** Migration `search_vector` + GIN-Index; Funktion `searchEverything` (Tests: Volltext, Präfix, Nummer, Sonderzeichen, Sichtbarkeit).
4. **Befehlspalette (Strg+K):** Dialog mit Suchfeld, Treffern, Navigation per Pfeiltasten/Enter und festen Aktionen (Start, Benachrichtigungen, Projekte).
5. **Tastenkürzel + Hilfe-Dialog** (`?`). Die Logik „im Eingabefeld?“ steht in einer reinen Funktion und ist getestet.
6. **Mobile Ansicht:** Schublade, Panel-Overlay, Playwright-Projekt `mobile`.
7. **E2E:**
   - Spec-Durchlauf
   - Startseite mit Abhaken
   - Palette
   - Tastenkürzel
   - Mobile
8. **Abnahme:**
   - `docker compose up -d --build`: Migrationen laufen, App antwortet, Worker läuft
   - `create-admin`, Login
   - README auf Stand bringen
9. **Review + Fixes, Merge nach `main`, Push.** Danach ist die Roadmap abgeschlossen.
