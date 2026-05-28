---
phase: 06-pwa-push-notifications
plan: 01
subsystem: pwa-push-foundation
tags: [migration, types, edge-function, smoke-test, vapid, push-subscriptions, r-l1]
requires: []
provides:
  - "Tabela push_subscriptions em produção (multi-device 1:N por perfil_id)"
  - "notificacoes_envios.canal CHECK aceita 'push'"
  - "handle_new_user insere push: false em todos 4 tipos (D-04)"
  - "Backfill aplicado em 5 perfis existentes com push: false"
  - "smoke-push edge function deployed como diagnóstico R-L1 (warning #6 — mantida)"
  - "VAPID secrets (3) em Supabase + VITE_VAPID_PUBLIC_KEY em Vercel (D-07)"
  - "CanalNotif inclui 'push' e PreferenciasNotif tem push: boolean por tipo (D-16)"
  - "PushSubscriptionRow type exportado para Plan 04 consumir"
  - "PreferenciasTipo em _shared/perfis.ts ganha push: boolean (Plan 02 sendPush consome)"
  - "5 test scaffolds RED (vitest + tests/rls) — Plans 02-05 consomem"
  - "Decisão R-L1 resolvida: web-push@3.6.7 via esm.sh funciona — Plan 03 não usa fallback npm:"
affects:
  - "src/components/me/NotificacoesPanel.tsx (fixture DEFAULT_PREFS + prefsEqual incluem push)"
  - "src/components/me/__tests__/NotificacoesPanel.test.tsx (fixture)"
  - "src/hooks/__tests__/usePreferenciasNotif.test.tsx (fixtures + NEW_PREFS)"
tech-stack:
  added: ["web-push@3.6.7 (via esm.sh em Deno edge runtime)"]
  patterns: ["RLS role-aware com is_at_least('coordenador') espelha pattern Phase 5", "Migration estilo 035 (DROP+CREATE policies idempotentes, CREATE OR REPLACE FUNCTION com lookup slack_user_id preservado)", "Edge function diagnostic não-descartável (smoke-push como gate R-L1 redeployable)"]
key-files:
  created:
    - "supabase/migrations/036_push_subscriptions.sql (Task 1.2, hash dddaf87)"
    - "supabase/functions/smoke-push/index.ts (Task 1.4, hash 78246ec)"
    - "src/test/push-mocks.ts (Task 1.1, hash 5bc358e)"
    - "src/lib/__tests__/pwa.test.ts (Task 1.1, hash 5bc358e)"
    - "src/hooks/__tests__/usePushSubscriptions.test.tsx (Task 1.1, hash 5bc358e)"
    - "supabase/functions/_shared/__tests__/push.test.ts (Task 1.1, hash 5bc358e)"
    - "tests/rls/push_subscriptions.test.ts (Task 1.1, hash 5bc358e)"
  modified:
    - "vitest.setup.ts (Task 1.1, hash 5bc358e)"
    - "src/types/index.ts (Task 1.5, hash de39e78 — CanalNotif/PreferenciasNotif/PushSubscriptionRow)"
    - "supabase/functions/_shared/perfis.ts (Task 1.5, hash de39e78 — PreferenciasTipo.push)"
    - "src/components/me/NotificacoesPanel.tsx (Task 1.5, hash de39e78 — DEFAULT_PREFS + prefsEqual)"
    - "src/components/me/__tests__/NotificacoesPanel.test.tsx (Task 1.5, hash de39e78 — fixture)"
    - "src/hooks/__tests__/usePreferenciasNotif.test.tsx (Task 1.5, hash de39e78 — fixtures + NEW_PREFS)"
decisions:
  - "R-L1 resolvido: esm.sh/web-push@3.6.7 carrega em Deno edge runtime e gera VAPID JWT — Plan 03 mantém esm.sh (sem fallback npm:)"
  - "Edge function renomeada smoke-push (sem underscore inicial — Supabase rejeita `^_`). Plano referia-se a `_smoke-push`; nome final divergiu — documentado no header do arquivo"
  - "Test scaffolds Wave 0 ficam RED até Plans 02-05; isso é design intencional (TDD gates)"
metrics:
  duration: "~12 min (Tasks 1.4 + 1.5 + SUMMARY)"
  duration_full_plan: "~3 dias (Wave 0 — incluindo checkpoint humano de aplicação de migration + Supabase Secrets + Vercel env)"
  completed: "2026-05-28"
  tasks_completed: 5
  commits: 4
---

# Phase 6 Plan 01: PWA + Push Foundation Summary

**One-liner:** Fundação Phase 6 — migration 036 (push_subscriptions + canal 'push' + handle_new_user + backfill), types estendidos (CanalNotif/PreferenciasNotif/PushSubscriptionRow), VAPID secrets configurados, e R-L1 derrubado via smoke-push edge function (esm.sh/web-push@3.6.7 confirmado).

## O que foi construído

### Task 1.1 — Wave 0 test scaffolds (commit `5bc358e`)
Cinco arquivos de teste em RED + browser API mocks:
- `src/test/push-mocks.ts` — factories `mockNotificationPermission`, `mockPushManager`, `mockServiceWorkerRegistration`, `mockMatchMediaStandalone`
- `src/lib/__tests__/pwa.test.ts` — 6 casos PUSH-01 (canSubscribePush/isStandalone/isIOS/base64url)
- `src/hooks/__tests__/usePushSubscriptions.test.tsx` — 4 casos PUSH-02 (subscribe/unsubscribe/optimistic)
- `supabase/functions/_shared/__tests__/push.test.ts` — 6 casos PUSH-03 (sendPush helper)
- `tests/rls/push_subscriptions.test.ts` — 5 casos D-15 (RLS por role)
- `vitest.setup.ts` estendido com `installPushMocks(opts)` opt-in (não polui setup global)

E2E `tests/e2e/push-install-banner.spec.ts` foi PULADO (decisão da VALIDATION.md): exige PWA real instalado → cai pra Manual UAT do Plan 05.

### Task 1.2 — Migration 036 (commit `dddaf87`)
`supabase/migrations/036_push_subscriptions.sql` com 5 seções:
1. CREATE TABLE `push_subscriptions` (id PK, perfil_id FK ON DELETE CASCADE, endpoint, p256dh, auth, user_agent, last_seen_at, created_at + UNIQUE(perfil_id, endpoint) + INDEX em perfil_id)
2. 4 RLS policies role-aware (`is_at_least('coordenador')` para SELECT all; próprio perfil para INSERT/UPDATE/DELETE)
3. ALTER TABLE notificacoes_envios DROP+ADD CHECK canal IN ('email','slack','push')
4. CREATE OR REPLACE handle_new_user — corpo de 035 PRESERVADO (lookup `SELECT slack_user_id IS NOT NULL INTO has_slack` intacto, anti-regressão D-04), + 'push', false em cada jsonb_build_object dos 4 tipos
5. Backfill idempotente com `jsonb_set` em 4 tipos, WHERE NOT (… push) IS NOT NULL

### Task 1.3 — Apply migration + secrets (manual, executado pelo Gabriel)
- Migration 036 aplicada em prod via Supabase Studio SQL editor
- Verificações pós-apply (relatadas pelo Gabriel):
  - `push_subscriptions` table exists ✓
  - CHECK `notificacoes_envios.canal` contém 'push' ✓
  - 5 perfis backfilled com `push: false` em todos 4 tipos ✓
- VAPID secrets em Supabase (3): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (`mailto:comunicacao.consej@gmail.com`)
- Vercel env `VITE_VAPID_PUBLIC_KEY` setado (production + preview) com o mesmo valor do Supabase (R-L2 mismatch evitado)

### Task 1.4 — smoke-push edge function (commit `78246ec`)
Edge function deployed para validar R-L1 (web-push@3.6.7 em Deno via esm.sh). Endpoint `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/smoke-push` retornou:

```json
{
  "ok": true,
  "library_loaded": true,
  "set_vapid_details_ok": true,
  "generated_keys_ok": true,
  "public_key_length": 87,
  "private_key_length": 43,
  "errors": [],
  "variant": "esm.sh",
  "checked_at": "2026-05-28T13:40:20.586Z"
}
```

**R-L1 RESOLVED → esm.sh funciona.** Os três gates passaram:
- A) `library_loaded`: import resolveu (esm.sh polyfill node:crypto OK)
- B) `set_vapid_details_ok`: setVapidDetails com VAPID env vars não lançou
- C) `generated_keys_ok`: generateVAPIDKeys retornou par P-256 base64url no range esperado (pub=87, priv=43)

**Decisão:** Plan 03 mantém `https://esm.sh/web-push@3.6.7` em `_shared/push.ts`. Sem fallback `npm:` necessário.

**Função mantida deployed** como ferramenta de diagnóstico R-L1 (warning #6 do iter 2 — redeploy on-demand se update do Deno runtime ou do web-push quebrar).

### Task 1.5 — Type extensions (commit `de39e78`)
- `src/types/index.ts`:
  - `CanalNotif = 'email' | 'slack' | 'push'`
  - `PreferenciasNotif` ganha `push: boolean` em cada um dos 4 tipos (ordem `slack | email | push` alinhada com matriz UI Plan 04)
  - Novo `PushSubscriptionRow` (sufixo Row para não colidir com DOM `PushSubscription`)
- `supabase/functions/_shared/perfis.ts`: `PreferenciasTipo.push: boolean`
- Fixtures Phase 5 atualizadas com `push: false` (NotificacoesPanel + 2 test files; `prefsEqual` compara push também)
- `npx tsc -b --noEmit` retorna 0 erros

## Verification Outcomes

| Verificação | Esperado | Resultado |
|-------------|----------|-----------|
| `to_regclass('public.push_subscriptions') IS NOT NULL` | true | ✓ (relatado Task 1.3) |
| CHECK `notificacoes_envios.canal` contém 'push' | sim | ✓ (relatado Task 1.3) |
| 5 perfis com `preferencias_notif #> '{tarefa,push}'` = false | nenhum null | ✓ (relatado Task 1.3) |
| `supabase secrets list \| grep VAPID` | 3 chaves | ✓ (relatado Task 1.3) |
| `vercel env ls production` mostra VITE_VAPID_PUBLIC_KEY | sim | ✓ (relatado Task 1.3) |
| smoke-push curl retorna 3 booleans = true | esm.sh OK | ✓ (Task 1.4) |
| `npx tsc -b --noEmit` | 0 erros | ✓ (Task 1.5) |
| Anti-regressão D-04: `grep -c "slack_user_id IS NOT NULL INTO has_slack" 036` | 1 | ✓ (1 ocorrência preservada de 035) |
| Test scaffolds em RED não-vazio (5 arquivos) | ≥5 suites pending/fail | ✓ (Task 1.1) |

## Deviations from Plan

### Auto-fixed (Rule 1 — bug / Rule 3 — blocker)

**1. [Rule 3 — Blocker] Edge function nome `_smoke-push` rejeitado pelo Supabase**
- **Found during:** Task 1.4 (`supabase functions deploy _smoke-push`)
- **Issue:** Supabase CLI valida nome contra regex `^[A-Za-z][A-Za-z0-9_-]*$` — underscore inicial proibido. Mensagem: "Invalid Function name. Must start with at least one letter, and only include alphanumeric characters, underscores, and hyphens."
- **Fix:** Renomeado de `supabase/functions/_smoke-push/` → `supabase/functions/smoke-push/`. Header da função e comentários internos atualizados refletindo o nome final + uma NOTA explicativa para futuros leitores do plano. Endpoint final: `/functions/v1/smoke-push`.
- **Files modified:** `supabase/functions/smoke-push/index.ts`
- **Commit:** `78246ec`
- **Impacto downstream:** plano original mencionava `_smoke-push` em vários lugares (06-01-PLAN.md, 06-RESEARCH.md). Não é necessário corrigir os planos retroativamente — o registro está aqui no SUMMARY e no header da função. Plan 03 não referencia esse nome (consome só `_shared/push.ts`).

**2. [Rule 1 — bug em fixture] `NEW_PREFS` em `usePreferenciasNotif.test.tsx:139` quebrou após extensão de PreferenciasTipo**
- **Found during:** Task 1.5 (`npx tsc -b --noEmit` reportou TS2741)
- **Issue:** Spread `...DEFAULT_PREFS` herdou push: false, mas o override `tarefa: { slack: false, email: false }` não incluía `push` — type-error porque PreferenciasTipo agora exige 3 campos.
- **Fix:** Adicionado `push: false` ao override.
- **Files modified:** `src/hooks/__tests__/usePreferenciasNotif.test.tsx:139`
- **Commit:** `de39e78`

### None — nenhuma deviation arquitetural (Rule 4 não acionada)

## Threat Model — Mitigations Verified

| Threat | Mitigation Plan | Status |
|--------|-----------------|--------|
| T-06-01 (VAPID private key disclosure) | Secrets Supabase, nunca em código/commit | ✓ Task 1.3 manual setup |
| T-06-02 (RLS enumeration push_subscriptions) | RLS USING `perfil_id = auth.uid() OR is_at_least('coordenador')` | ✓ Task 1.2 policies criadas; teste RED em `tests/rls/push_subscriptions.test.ts` (Plan 03 transiciona p/ GREEN) |
| T-06-03 (Migration backfill tampering) | WHERE NOT (… push) IS NOT NULL idempotente | ✓ Task 1.2 backfill verificado por Gabriel (5 perfis OK) |
| T-06-04 (Spoofing INSERT perfil alheio) | RLS WITH CHECK `perfil_id = auth.uid()` | ✓ Task 1.2 policy `push_subs_insert` |
| T-06-05 (smoke-push pública sem JWT) | accept — só lê env vars + retorna lengths (não vaza key) | ✓ documentado no header da função; deploy `--no-verify-jwt` intencional |
| T-06-SC (web-push supply chain) | esm.sh@3.6.7 pinned + slopcheck OK + R-L1 smoke valida cedo | ✓ Task 1.4 — esm.sh confirmado em prod |

## Success Criteria

| Wave 1 critério | Status |
|-----------------|--------|
| Migration 036 em produção (table + CHECK + handle_new_user + backfill) | ✓ |
| VAPID secrets (3 Supabase + 1 Vercel) | ✓ |
| Decisão R-L1 documentada (esm.sh OK) — Plan 03 consome | ✓ |
| Types estendidos sem regressão TypeScript | ✓ |
| 5 test scaffolds + push-mocks shipped | ✓ |
| Nenhum task subsequente bloqueado | ✓ |

## Próximos Passos (Plans 02-05)

- **Plan 02 (Wave 1)** — PWA shell (manifest, SW, ícones, install banner)
- **Plan 03 (Wave 2)** — `_shared/push.ts` (helper sendPush usando esm.sh confirmado) + integração nas 4 funções notify-*
- **Plan 04 (Wave 2)** — `src/lib/pwa.ts` + `usePushSubscriptions` + extensão `NotificacoesPanel` matriz 4×3 + iOS gate
- **Plan 05 (Wave 3)** — UAT manual + UI audit + SECURITY

## Self-Check: PASSED

Files referenced in this SUMMARY verified to exist:
- `supabase/migrations/036_push_subscriptions.sql` ✓
- `supabase/functions/smoke-push/index.ts` ✓
- `src/types/index.ts` (modified) ✓
- `supabase/functions/_shared/perfis.ts` (modified) ✓
- 5 test scaffolds + push-mocks ✓

Commits verified in `git log --oneline`:
- `5bc358e` Task 1.1 ✓
- `dddaf87` Task 1.2 ✓
- `78246ec` Task 1.4 ✓
- `de39e78` Task 1.5 ✓

(Task 1.3 was manual — no commit, verified by Gabriel reporting "applied")
