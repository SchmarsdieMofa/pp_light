# Ausstehende Fixes (2026-10-09)

Reihenfolge = ein Commit pro Fix, nach jedem Commit push.

1. **Shortcut `4` → Fragen.** `src/lib/shortcuts.ts` (VIEWS, SHORTCUT_HELP), Unit-Test in `tests/unit/shortcuts.test.ts`.
2. **E-Mail-Defaults.** `assigned` und `status` sind ohne eigene Wahl für E-Mail aus. Konstante in `notification-types.ts`,
   Spalten-Default per Migration 0018, `getNotificationPreferences` und Digest nutzen sie, wenn keine Zeile existiert.
3. **E-Mail-Benachrichtigungen als Reiter in den Einstellungen.** Neuer Tab „Benachrichtigungen“ im Settings-Overlay
   (Schalter = E-Mail senden), Block aus der Inbox entfernt.
4. **Aufgaben löschen.** Service `deleteTask` (Owner/Member, Cascade auf Unteraufgaben, Anhang-Dateien entfernen,
   Aktivität im Projekt), Server-Action, Button + Bestätigung im Overlay, Unit- und E2E-Test.
5. **Projekte per Drag and Drop in Ordner.** Sidebar: Projektzeilen ziehbar, Ordner-Abschnitte und „Projekte“ als Ziel
   (nativ HTML5-DnD, bestehendes `moveProjectToFolderAction`), E2E-Test.
6. **Kanban-DnD auf Ultrawide.** Zuerst Repro (Playwright, 3440×1440, leere Spalte), dann Ursache, dann Fix + Regressionstest.
