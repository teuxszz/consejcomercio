---
phase: 6
slug: pwa-push-notifications
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Fill in concrete task IDs once PLAN.md exists; this draft establishes infrastructure + sampling cadence.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (unit)** | vitest 3.2.x — jsdom env, globals (matches existing setup) |
| **Framework (E2E)** | Playwright 1.60.x — chromium projects `diretor` / `consultor` |
| **Framework (RLS)** | vitest run --dir tests/rls (existing Phase 5 pattern) |
| **Config files** | `vitest.config.ts`, `playwright.config.ts`, `vitest.setup.ts` |
| **Quick run command** | `npm test -- src/lib/__tests__/pwa.test.ts src/hooks/__tests__/usePushSubscriptions.test.ts` |
| **Per-feature command** | `npm test -- <pattern>` (vitest watch via `test:watch`) |
| **Full suite command** | `npm test && npm run test:rls` |
| **E2E command** | `npm run test:e2e -- tests/e2e/push-flow.spec.ts` (when added) |
| **Estimated runtime (unit)** | ~30s |
| **Estimated runtime (full)** | ~90s (unit + RLS) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <feature pattern>` (≤ 30s)
- **After every plan wave:** Run `npm test && npm run test:rls` (≤ 90s)
- **Before `/gsd-verify-work`:** Full suite green + manual UAT in real iOS Safari + Chrome Android
- **Max feedback latency:** 30s (per-task), 90s (per-wave)
- **No watch-mode flags** in any task command — every test runs to completion

---

## Per-Task Verification Map

> Filled in after PLAN.md exists. Each plan task gets a row. Mapping rules:
> - `unit` for pure helpers (urlBase64ToUint8Array, canSubscribePush, encodeApplicationServerKey, sendPush payload builder)
> - `integration` for hooks with TanStack Query + supabase mock (usePushSubscriptions, useTogglePushPermission)
> - `e2e` for end-to-end browser flows (install banner show/hide, toggle Push triggers permission dialog, deep link click)
> - `manual` for real-device flows (iOS Safari install, real push delivery via FCM/APNS)
> - `rls` for push_subscriptions policies (consultor sees only own; coord+ sees all)
> - `migration` for SQL up-only verification (036 applied, CHECK has 'push', trigger updated, backfill complete)

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (placeholder — filled after PLAN.md) | | | PUSH-01..04 | T-06-* | | | | | ⬜ pending |

---

## Wave 0 Requirements

Before any feature task runs, scaffold these test artifacts:

- [ ] `src/lib/__tests__/pwa.test.ts` — stubs for `canSubscribePush()`, `isStandalone()`, `urlBase64ToUint8Array()`, `encodeKey()` covering PUSH-01, PUSH-02
- [ ] `src/hooks/__tests__/usePushSubscriptions.test.tsx` — stubs for subscribe + unsubscribe mutation, 410 cleanup, optimistic update
- [ ] `supabase/functions/_shared/__tests__/push.test.ts` — stubs for `sendPush` honoring prefs, idempotency via UNIQUE, DELETE on 410, parallel multi-device fanout
- [ ] `tests/rls/push_subscriptions.test.ts` — stubs for RLS: consultor sees own only, coord+ sees all
- [ ] `tests/e2e/push-install-banner.spec.ts` — stubs for banner show on Chrome, hide on standalone, dismiss persistence (localStorage)
- [ ] Mock `Notification`, `navigator.serviceWorker`, `PushManager`, `window.matchMedia` in `vitest.setup.ts` — needed because jsdom lacks Push APIs. Add helpers in `src/test/push-mocks.ts`

*No new test framework needed — vitest + Playwright + RLS pattern from Phase 5 covers everything.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PWA install on Chrome Android | PUSH-01 | Real browser install prompt can't be triggered in headless | 1. Acessar prod URL no Chrome Android; 2. Banner "Instalar app" aparece após 30s engajamento; 3. Tocar Instalar; 4. App aparece no drawer; 5. Abrir do drawer = display-mode standalone |
| PWA install on iOS Safari 16.4+ | PUSH-01 | iOS Safari não suporta `beforeinstallprompt` programático | 1. Acessar prod URL no iPhone Safari ≥16.4; 2. Card em /me/preferencias mostra instrução "Compartilhar → Adicionar à Tela"; 3. Seguir; 4. App ícone aparece na home; 5. Abrir = standalone |
| Push permission request triggered by toggle | PUSH-02, D-12 | Browser permission dialog não automatizável | 1. /me/preferencias; 2. Tocar 1º Switch Push; 3. Dialog nativo do browser aparece; 4. Aceitar → toggle confirma ON; 5. Recusar → toggle volta a OFF + toast erro |
| Real push delivery iOS lockscreen | PUSH-03, PUSH-04 | FCM/APNS delivery exige device real + tempo de entrega não-determinístico | 1. iOS PWA instalado + push ON; 2. Outro usuário atribui tarefa; 3. Em 10-60s push aparece no lockscreen; 4. Tocar push abre PWA direto em /tarefas?highlight=ID; 5. Modal da tarefa abre automático |
| Real push delivery Chrome Android lockscreen | PUSH-03, PUSH-04 | Idem iOS | Idem iOS para Chrome Android |
| iOS gate desabilita toggle quando Safari não-standalone | D-13 | display-mode detection precisa de browser real | 1. iPhone Safari (NÃO instalado); 2. /me/preferencias; 3. 4 switches Push aparecem disabled; 4. Hover/tap mostra tooltip "Instale o app primeiro: Compartilhar → Adicionar à Tela" |
| Subscription DELETE no 410 Gone | D-02 | Requer browser real unsubscribe via DevTools | 1. Subscribe device A; 2. DevTools → Application → SW → Unsubscribe; 3. Trigger push do server; 4. Server retorna 410; 5. push_subscriptions row foi DELETE; 6. notificacoes_envios tem status='failed' |
| Multi-device subscription | D-01 | Mesmo usuário precisa de 2+ devices | 1. Login no Chrome desktop + Chrome Android com mesmo perfil; 2. Subscribe em ambos; 3. push_subscriptions tem 2 rows (UNIQUE perfil_id+endpoint); 4. Trigger push; 5. Ambos devices recebem |

---

## Validation Sign-Off

- [ ] All plan tasks have `<automated>` verify OR are listed in Manual-Only with concrete steps
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify in PLAN.md
- [ ] Wave 0 scaffolds 5 test files + mocks listed above
- [ ] No watch-mode flags (`--watch`, `-w`) in any task command
- [ ] Feedback latency < 30s per task, < 90s per wave
- [ ] Manual UAT verifications scheduled in `/gsd-verify-work` checklist (8 items above)
- [ ] `nyquist_compliant: true` set in frontmatter once PLAN.md tasks mapped

**Approval:** pending (will be approved after planner fills Per-Task Verification Map)

---

## Notes for Planner

- **R-L1 do RESEARCH.md** (esm.sh vs npm: para web-push) deve ser smoke-tested no Wave 1 antes de qualquer task depender de `sendPush`. Se esm.sh falhar em ECDH crypto (Deno issue #18416), fallback `npm:web-push@3.6.7` é aceitável sem nova discuss-phase.
- **Push API mocks** são chatos — invista em helpers reutilizáveis em `src/test/push-mocks.ts`:
  - `mockNotificationPermission('default'|'granted'|'denied')`
  - `mockPushManager({ subscribed: boolean, endpoint: string })`
  - `mockServiceWorkerRegistration()`
  - `mockMatchMediaStandalone(boolean)`
- **Edge function tests** (`_shared/push.ts`) usar mock Deno via `import.meta.url` + mock fetch para POST ao endpoint do push service — não tentar rodar `web-push` real em CI.
- **RLS tests** seguir exato pattern de Phase 5 (`tests/rls/notificacoes_envios.test.ts` se existir) — mesma estrutura de seed + assert por role.
