# Plan: Ersteinrichtung und Zugriffsart

Spec: `docs/superpowers/specs/2026-10-03-setup-und-zugriff-design.md`. Commit + Push nach jedem Schritt.

1. **Schema + Services** – `app_settings` in `schema.ts`, Migration `0009`. `src/server/settings/service.ts`
   (`getAppSettings`, `getBaseUrl`, `setHttpsOnly`, `setBaseUrl`, `requestProto`). `src/server/setup/service.ts`
   (`hasUsers`, `issueSetupCode`, `completeSetup`). Unit-Tests zuerst.
2. **Basis-Adresse nutzen** – `invitations.ts` und `digest.ts` auf `getBaseUrl(db)`.
3. **Proxy** – `src/lib/access-redirect.ts` (reine Entscheidung, Unit-Test), `src/proxy.ts` mit Cache.
4. **Setup-Seite** – `src/app/(auth)/setup/{page,actions,setup-form}.tsx`, Anmeldung + Weiterleitung.
5. **Server-Tab** – `server-panel.tsx`, Actions, Overlay-Tab, E2E-Test.
6. **Ops** – Caddyfile (http + https, keine Umleitung), Compose (`APP_URL`/`AUTH_URL` raus),
   `scripts/setup-code.ts`, `scripts/access-mode.ts`, `build:scripts`, Entrypoint, README, `.env.example`.
7. **Verifikation** – lint, typecheck, unit, e2e; frischer Prod-Stack lokal durchspielen; Merge in main.
