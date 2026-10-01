# M4 – Phasen und Abhängigkeiten

**Basis:** `main` nach M3 (`6981662`). **Spec:** `docs/superpowers/specs/2026-09-30-pp-light-design.md`.

## Ergebnis

Projekt-Owner verwalten Phasen und Meilensteine. Aufgaben können einer Phase und anderen Aufgaben als Nachfolger zugeordnet werden. Terminänderungen und neue Abhängigkeiten verschieben verletzende Nachfolger in einer Transaktion nach hinten. Ein Toast zeigt die Zahl der verschobenen Aufgaben und erlaubt ein sicheres Undo.

## Festlegungen

- Eine Abhängigkeit verbindet zwei Aufgaben desselben Projekts. `lag_days` ist eine nichtnegative Zahl zusätzlicher **Arbeitstage**. Für `A → B` gilt: `B.start >= addBusinessDays(A.due, 1 + lag_days)`.
- Terminlose Aufgaben bleiben terminlos. Die Kaskade verschiebt einen Nachfolger nur, wenn der Blocker ein Fälligkeitsdatum und der Nachfolger Start **und** Fälligkeit hat. Die UI zeigt bei fehlenden Terminen einen Hinweis. Fertige Aufgaben bleiben immer stehen.
- Beim Verschieben wird die bisherige Anzahl von Arbeitstagen einschließlich Start und Fälligkeit bewahrt, mindestens ein Arbeitstag. Automatisch gesetzte Termine liegen auf Mo–Fr. Manuell gewählte Wochenendtermine bleiben erlaubt.
- Eine frühere Blocker-Fälligkeit zieht Nachfolger nie nach vorn. Der spätere mögliche Start wird in M5 als Hinweis angezeigt.
- Eine Änderung sperrt die Projektzeile vor dem Lesen des Abhängigkeitsgraphen und vor dem Schreiben von Terminen. So sehen konkurrierende Änderungen eine konsistente Reihenfolge. Zyklen werden innerhalb dieser Sperre geprüft.
- Alle automatisch verschobenen Aufgaben und die auslösende Terminänderung erhalten Aktivitätslog-Einträge mit derselben `group_id`. Undo prüft, dass die aktuellen Termine noch den geloggten neuen Werten entsprechen. Bei einer zwischenzeitlichen Bearbeitung gibt es `CONFLICT`, damit keine fremde Änderung überschrieben wird.
- M4 protokolliert die Verschiebungen. Benachrichtigungen an Zuständige folgen mit dem Worker in M7.

## Reihenfolge

### 1. Datenmodell und Migration

- `phases(id, project_id, name, start_date, end_date, is_milestone, position)` anlegen. Eine Meilenstein-Phase hat genau ein Datum; normale Phasen dürfen eigene Start- und Enddaten haben.
- `tasks.phase_id` als nullable FK mit `ON DELETE SET NULL` ergänzen.
- `task_dependencies(blocker_id, blocked_id, lag_days)` mit PK auf beiden IDs, Self-Edge- und `lag_days >= 0`-Checks sowie Index für `blocked_id` anlegen. Projektgleichheit prüft der Service.
- Drizzle-Migration generieren; auf Test-DB anwenden. Migration darf bestehende Aufgaben nicht verändern.
- Test: Schema-Constraints und Migration gegen die vorhandene Testdatenbank.

### 2. Reine Arbeitstage- und Graphlogik

- `src/lib/business-days.ts`: ISO-Daten ohne lokale Zeitzone parsen; Arbeitstage addieren, inklusive Dauer zählen, neuen Endtermin bei Startverschiebung berechnen.
- `src/lib/dependency-graph.ts`: Zyklusprüfung und stabile topologische Reihenfolge. Keine DB- oder Next-Imports.
- Tests: Freitag → Montag, Wochenende, Jahreswechsel, `lag_days`, Kaskade, Diamantgraph, Zyklus, sehr lange Ketten ohne Rekursionsüberlauf.

### 3. Phasen-Service

- `src/server/phases/{service,queries}.ts`: Projekt-Owner/Admin dürfen anlegen, bearbeiten, sortieren und löschen. Namen sind pro Projekt ohne Beachtung der Großschreibung eindeutig; Löschen setzt die Phase an Aufgaben auf `null`.
- Meilenstein-Datum und Start/Ende validieren; Sortierung mit fractional index. Projektzeile für konkurrierende Änderungen sperren.
- Phase einer Aufgabe über `updateTask` setzen; fremde Phase ablehnen und im Aktivitätslog erfassen.
- Tests: Rechte, ungültige Daten, andere Projekte, Sortierung und Löschung mit zugeordneten Aufgaben.

### 4. Abhängigkeiten-Service

- `src/server/dependencies/{service,queries}.ts`: Kante mit `lag_days` anlegen/ändern/löschen; Rechte `task.update`; nur Aufgaben desselben Projekts; Selbstbezug und Zyklen mit `VALIDATION` ablehnen.
- Graph und Aufgaben innerhalb des Projekt-Locks lesen. Beim Anlegen einer Kante gegebenenfalls die betroffene Teilmenge nach hinten verschieben.
- Abfragen für Blocker/Nachfolger liefern Nummer, Titel, Termine und `lag_days` für Panel und später Gantt.
- Tests: Duplikate, Projekte, Rechte, direkter und indirekter Zyklus, konkurrierende Kanten, Kaskade beim Anlegen.

### 5. Termin-Kaskade und Undo

- `updateTask` ruft bei einer tatsächlichen Start-/Fälligkeitsänderung den Scheduling-Service in **derselben** Transaktion auf. Der Service traversiert Nachfolger topologisch und berücksichtigt bei mehreren Blockern die späteste Mindest-Startzeit.
- Ein fertiger Nachfolger wird nicht verschoben; bereits zu spät liegende Aufgaben bleiben an ihrem Datum. Das Update der Quelle und jede automatische Verschiebung erscheinen im Aktivitätslog mit alter/neuer Datums-Paarung und `group_id`.
- Die Action gibt `updatedAt`, `movedCount` und `groupId` zurück. Undo setzt alle Daten der Gruppe atomar zurück, wenn sie seitdem unverändert sind; Undo selbst wird protokolliert und darf nicht erneut ausgeführt werden.
- Tests: Werktage, Lag, Kaskade, Diamant, vorwärts-only, fertig, terminlos, Konflikt, Rollback, Undo nach fremder Änderung.

### 6. UI

- Projekteinstellungen: Phasen-/Meilensteinverwaltung mit Datum, Reihenfolge und Löschen.
- Task-Panel und `/tasks/[id]`: Phasen-Auswahl, Blocker/Nachfolger mit Lag hinzufügen und entfernen. Datumsspeicherung zeigt „n Aufgaben verschoben“ mit „Rückgängig“; Fehler als deutscher Toast.
- Listenansicht: Phase anzeigen und filtern. Ausführliche Board-Karte: Phase anzeigen.
- Server Actions validieren Eingaben, prüfen Berechtigungen im Service und revalidieren die betroffenen Routen. Die Next-16.3.8-Dokumentation unter `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` ist vor der UI-Arbeit erneut zu prüfen.

### 7. Abnahme

- Typecheck, Lint, Vitest, Playwright. E2E: Phase und Meilenstein anlegen, Aufgaben zuweisen, Abhängigkeit erstellen, Freitagstermin verschieben → Montag/Kaskade, Undo, Zyklus-Ablehnung und Rechte.
- Ein E2E-Durchlauf muss mit Exitcode 0 enden. Falls der Windows-Dev-Server-Teardown erneut hängt, dessen Prozesskette gesondert beheben und den vollständigen Lauf wiederholen.
- Nach jedem abgeschlossenen Arbeitspaket committen und pushen; M4 nach Review per Fast-Forward in `main` übernehmen.
