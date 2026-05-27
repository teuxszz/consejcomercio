# Phase 5 — Deferred Items (out-of-scope)

Items found during Plan 05-03 execution that are explicitly **out of scope**
for this plan (pre-existing or unrelated to notifications UI).

## Pre-existing TypeScript build error

- **File:** `src/lib/__tests__/cadencia.test.ts:27`
- **Error:** `TS2352: InteracaoLead` cast missing `stage_msg`, `setor`, `variacao_idx`, `corpo`
- **First detected:** Plan 05-01 SUMMARY (2026-05-27, line 215)
- **Re-confirmed:** Plan 05-02 SUMMARY (line 210), Plan 05-03 build attempt
- **Action:** none here — pre-dates Phase 5. Fix in a dedicated bugfix plan.
- **Impact on Plan 05-03 acceptance:** `npm run build` exits non-zero, but `npm test` (vitest) passes 256/256. Runtime app is fine.

## Magic link / deep-link auth token (D-12)

- **Status:** not implemented in Plan 05-03 (orchestrator instruction).
- **Templates HTML** já incluem placeholder `{{gerenciarPrefsLink}}` (Plan 05-01).
- **Tech-debt:** geração real do JWT/OTP de curta duração para deep-link sem reauth — fica para um plan futuro.

## Deploy de `reenviar-notificacao`

- **Status:** edge function criada e committada nesta plan (Task 4).
- **Deploy:** orchestrator vai disparar `supabase functions deploy reenviar-notificacao` depois junto com cleanup.
- **Smoke E2E manual:** documentado no plan mas postergado para após deploy.

## `src/lib/__tests__/icp-dinamico.test.ts` console errors

- Several tests print "Failed to extract..." console errors but pass — pre-existing noise. Out of scope.
