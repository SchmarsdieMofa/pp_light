# Projektordner (flach, vererbte Rechte)

Entscheidungen (2026-10-07, mit Lars): flach (ein Level) · jede Person darf Ordner anlegen (wird Ordner-Owner) ·
Ordner-Owner ist Owner in allen Projekten darin · rein additiv: der Ordner nimmt nie Rechte, Projekte können eigene
Mitglieder haben. Wer weder im Ordner noch direkt im Projekt ist, sieht das Projekt nicht.

## Modell
- `project_folders`, `folder_members` (owner|member|guest), `folder_groups` (member|guest – Gruppen sind nie Owner), `projects.folder_id`.
- View `folder_access` (Mitglieder + Gruppen, höchste Rolle gewinnt); `project_access` bekommt eine dritte Quelle:
  Ordnerzugriff über `projects.folder_id`. Alle Leseprüfungen laufen schon über die View → Vererbung ist live.
- Ordner-Rollen: owner verwaltet Ordner (Name, Mitglieder, löschen), owner+member legen Projekte im Ordner an
  und verschieben Projekte hinein (zusätzlich Projekt-Owner); Projekt-Owner dürfen Projekte wieder herausnehmen.
- Ordner löschen / Projekt herausnehmen: Projekte bleiben, Zugriff nur über den Ordner entfällt, `pruneAssignees`.
- Ordner sichtbar (Sidebar/Übersicht) nur für Ordner-Mitglieder; andere sehen ihre Projekte darin ungruppiert.

## Schritte (je Commit + Push)
1. Schema, Migration (View ersetzen), Service `server/folders`, Unit-Tests.
2. Actions + Ordner-Dialog (anlegen, umbenennen, Mitglieder, löschen); MemberPicker entkoppeln.
3. Sidebar + Projektübersicht gruppieren; Projekt anlegen/verschieben mit Ordnerwahl; „über Ordner“ in Mitgliederliste.
4. E2E.
