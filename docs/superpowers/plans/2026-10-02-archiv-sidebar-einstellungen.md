# Archiv, einklappbare Sidebar, Einstellungen

Ziel: abgeschlossene/archivierte Projekte bekommen eine eigene Ansicht, die Projektliste in der Sidebar lässt sich einklappen, und es gibt eine zentrale Einstellungsseite (Profil, Darstellung, Nutzerverwaltung).

Abschließen archiviert bereits (`completeProject` setzt `archivedAt` + `completedAt`) – daran ändert sich nichts.

## 1. Archiv-Ansicht
- `src/server/projects/lifecycle.ts`: `listArchivedProjects` liefert zusätzlich Aufgaben-Zähler (gesamt/erledigt) und ob der Actor steuern (wiederherstellen) darf.
- `src/app/(app)/projects/archive/page.tsx`: Suche (`q`), Filter `art=alle|abgeschlossen|archiviert`, Karten mit Kürzel, Name, Datum, Fortschritt, Abschlussnotiz (gekürzt), Aktionen „Bericht“, „Wiederherstellen“.
- `/projects`: `<details>`-Block ersetzt durch Link „Archiv (n)“.
- Sidebar: Link „Archiv“.
- Tests: Unit für erweiterte Liste, E2E `project-lifecycle.spec.ts` angepasst.

## 2. Sidebar einklappbar
- Abschnitt „Projekte“ mit Toggle-Button (`aria-expanded`), Zustand in `localStorage` (`useSyncExternalStore`, SSR = ausgeklappt).
- Aktives Projekt bleibt auch eingeklappt sichtbar.

## 3. Einstellungen
- `src/server/users/account.ts`: `updateOwnName`, `changeOwnPassword` (aktuelles Passwort prüfen, ≥12 Zeichen, `sessionVersion`++ → Neuanmeldung), `setUserRole` (Admin, nicht sich selbst, letzter Admin bleibt).
- `src/app/(app)/settings/page.tsx` (Profil, Darstellung) und `src/app/(app)/settings/users/page.tsx` (Admin) mit gemeinsamem Layout + Tabs.
- `/admin` leitet auf `/settings/users` um; Sidebar: „Einstellungen“ statt „Nutzerverwaltung“.
- Tests: Unit für Account-Service, E2E für Profil/Passwort und Nutzerverwaltungs-Navigation.
