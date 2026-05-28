---
phase: 07-client-portal-expansion
plan: 01b
subsystem: testing
tags: [typescript, vitest, supabase-storage, file-validation, react-query, deno]

# Dependency graph
requires:
  - phase: 06-pwa-push
    provides: PreferenciasNotif com canal 'push', helpers _shared/{email,push,perfis}.ts, push-mocks.ts pattern
  - phase: 05-multi-channel-notifications
    provides: TipoNotif union base, notificacoes_envios idempotência UNIQUE partial index
provides:
  - TipoNotif estendido com 'documentos' (src/types/index.ts + 3 _shared helpers Deno)
  - PreferenciasNotif.documentos (matriz 5×3 slack/email/push)
  - ClienteDoc + AutorDoc + TagDoc + StatusDoc tipos canônicos (D-16)
  - MetasConfig.dias_para_aprovacao_pendente?: number (D-13 RESEARCH Open Q1 RESOLVED)
  - src/lib/file-validation.ts puro com validateDoc/validateDocOrThrow + whitelist
  - QUERY_KEYS.{clienteDocs, aprovacoesPendentes, bucketUsage}
  - src/test/storage-mocks.ts: 3 factories (Upload, SignedUrl, FileBuilder)
  - 10 stub tests Wave 0 cobrindo D-02/D-05/D-08/D-13 + 4 componentes aprovação
affects:
  - 07-02-PLAN (migrations + aprovacoes helper consome types e helpers Deno)
  - 07-03-PLAN (useClienteDocs consome QUERY_KEYS + validateDoc + storage-mocks)
  - 07-04a-PLAN (componentes consomem PreferenciasNotif.documentos + status types)
  - 07-04b-PLAN (E2E ativa specs do tests/e2e/cliente-docs-flow.spec.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 Nyquist scaffold: it.todo + describe.skipIf + test.skip permite npm test verde antes da implementação"
    - "storage-mocks factory pattern espelhando src/test/push-mocks.ts (Phase 6) — sem efeitos colaterais até helper ser chamado"
    - "TipoNotif duplicado em 4 arquivos (src/types + 3 _shared Deno) com comentário Phase 7 D-16 — runtime Deno separado do build TS browser"
    - "file-validation pura sem deps externas — Pitfall §2 (file.type vazio tolerado) coberto por teste dedicado"

key-files:
  created:
    - src/lib/file-validation.ts
    - src/test/storage-mocks.ts
    - src/lib/__tests__/file-validation.test.ts
    - src/hooks/__tests__/useClienteDocs.test.tsx
    - src/components/clientes/__tests__/UploadDropzone.test.tsx
    - src/components/clientes/__tests__/AprovacaoButtons.test.tsx
    - src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx
    - src/components/clientes/__tests__/DocVersionTimeline.test.tsx
    - src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx
    - supabase/functions/_shared/__tests__/aprovacoes.test.ts
    - tests/rls/cliente_docs.test.ts
    - tests/rls/cliente_docs_storage.test.ts
    - tests/e2e/cliente-docs-flow.spec.ts
  modified:
    - src/types/index.ts
    - src/lib/query-keys.ts
    - supabase/functions/_shared/email.ts
    - supabase/functions/_shared/push.ts
    - supabase/functions/_shared/perfis.ts
    - src/components/me/NotificacoesPanel.tsx (Rule 3 auto-fix)
    - src/pages/NotificacoesHistoricoPage.tsx (Rule 3 auto-fix)
    - src/components/me/__tests__/NotificacoesPanel.test.tsx (Rule 3 auto-fix)
    - src/hooks/__tests__/usePreferenciasNotif.test.tsx (Rule 1 + Rule 3 auto-fix)

key-decisions:
  - "Whitelist file-validation: pdf, docx, doc, odt, jpg, jpeg, png, webp + 10 MB max (RESEARCH §4)"
  - "file.type vazio TOLERADO (não bloqueia upload) — Pitfall §2; cruzamos extensão como sinal primário"
  - "TipoNotif estendido em 4 arquivos separados (Deno runtime vs TS browser) — comentário Phase 7 D-16 documenta"
  - "UI do canal 'documentos' no NotificacoesPanel vem no Plan 04a — esta plan só garante type-level + DEFAULT_PREFS"

patterns-established:
  - "Wave 0 Nyquist: stubs it.todo passam npm test verde, viram implementação real nos Plans 02/03/04a"
  - "storage-mocks factories: { uploadFn, fromFn, restore } — vi.mock no teste decide se usa o fromFn"
  - "RLS test bootstrap copiado de tests/rls/push_subscriptions.test.ts: .env.test + describe.skipIf(!configurado)"

requirements-completed: [PORTAL-01, PORTAL-02, PORTAL-03, PORTAL-04]

# Metrics
duration: 18min
completed: 2026-05-28
---

# Phase 07 Plan 01b: Foundation types + file-validation + Wave 0 scaffolds Summary

**TipoNotif estendido com 'documentos' em 4 arquivos, ClienteDoc/Autor/Tag/Status tipos canônicos, file-validation.ts puro (whitelist + size 10MB + Pitfall §2 tolerância file.type vazio), 9 testes passando, 36 stubs Wave 0 it.todo + storage-mocks factories.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-28T16:44Z
- **Completed:** 2026-05-28T17:03Z
- **Tasks:** 5 (1b-1 a 1b-5) + 1 follow-up fix
- **Files criados:** 13
- **Files modificados:** 9

## Accomplishments

- **Types estendidos** (D-16 + D-13): TipoNotif += 'documentos' (5 arquivos), PreferenciasNotif.documentos, ClienteDoc/AutorDoc/TagDoc/StatusDoc, MetasConfig.dias_para_aprovacao_pendente
- **file-validation.ts puro** com 9 testes passando — whitelist pdf/docx/doc/odt/jpg/jpeg/png/webp + 10MB + tolerância a file.type vazio (Pitfall §2)
- **storage-mocks factories** (3): mockSupabaseStorageUpload, mockSupabaseStorageSignedUrl, mockFileBuilder — pattern role-match espelhando push-mocks.ts da Phase 6
- **Query keys**: clienteDocs.{all,byCliente,byId} + aprovacoesPendentes.all + bucketUsage.byBucket
- **10 stub tests Wave 0** (36 it.todo + describe.skipIf + test.skip): file-validation, useClienteDocs, UploadDropzone, AprovacaoButtons, SolicitarRevisaoModal, DocVersionTimeline, SubirNovaVersaoButton, sendNotificacaoAprovacao, RLS cliente_docs, RLS storage.objects, E2E cliente-docs-flow
- **3 helpers Deno** estendidos (_shared/email.ts + push.ts + perfis.ts) preparando Plan 02 (aprovacoes.ts) para chamar sendEmail/sendPush({ tipo: 'documentos' })

## Task Commits

1. **Task 1b-1: Wave 0 stubs + storage-mocks** — `9e863c2` (test)
2. **Task 1b-2: Estender types index.ts (D-16 + D-13)** — `e933207` (feat)
3. **Task 1b-3: _shared helpers Deno** — `48d9da7` (feat)
4. **Task 1b-4: Query keys clienteDocs/aprovacoesPendentes/bucketUsage** — `ee1d4d7` (feat)
5. **Task 1b-5: file-validation.ts + 9 testes passing** — `9d894df` (feat)
6. **Follow-up fix: atomicidade test inclui 'documentos'** — `4181ac9` (fix)

## Files Created/Modified

### Criados (13)
- `src/lib/file-validation.ts` — validateDoc/validateDocOrThrow + constantes whitelist
- `src/test/storage-mocks.ts` — 3 factories (Upload, SignedUrl, FileBuilder)
- `src/lib/__tests__/file-validation.test.ts` — 9 testes implementados
- `src/hooks/__tests__/useClienteDocs.test.tsx` — 8 it.todo (Plan 03/04a popula)
- `src/components/clientes/__tests__/UploadDropzone.test.tsx` — 3 it.todo
- `src/components/clientes/__tests__/AprovacaoButtons.test.tsx` — 4 it.todo (BLOCKER #5 + WARNING #3)
- `src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx` — 3 it.todo (BLOCKER #5 + WARNING #3)
- `src/components/clientes/__tests__/DocVersionTimeline.test.tsx` — 3 it.todo (BLOCKER #5 + WARNING #3)
- `src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx` — 3 it.todo (BLOCKER #2 D-02 + WARNING #3)
- `supabase/functions/_shared/__tests__/aprovacoes.test.ts` — 4 it.todo (Plan 02 popula)
- `tests/rls/cliente_docs.test.ts` — 7 it.todo dentro de describe.skipIf
- `tests/rls/cliente_docs_storage.test.ts` — 4 it.todo dentro de describe.skipIf
- `tests/e2e/cliente-docs-flow.spec.ts` — 2 test.skip (Plan 04b ativa)

### Modificados (9)
- `src/types/index.ts` — TipoNotif += documentos, PreferenciasNotif.documentos, ClienteDoc + AutorDoc + TagDoc + StatusDoc, MetasConfig.dias_para_aprovacao_pendente
- `src/lib/query-keys.ts` — 3 namespaces novos
- `supabase/functions/_shared/email.ts` — TipoNotif += documentos
- `supabase/functions/_shared/push.ts` — TipoNotif += documentos
- `supabase/functions/_shared/perfis.ts` — PreferenciasNotif.documentos
- `src/components/me/NotificacoesPanel.tsx` — DEFAULT_PREFS.documentos (Rule 3)
- `src/pages/NotificacoesHistoricoPage.tsx` — tipoLabel.documentos (Rule 3)
- `src/components/me/__tests__/NotificacoesPanel.test.tsx` — DEFAULT_PREFS fixture (Rule 3)
- `src/hooks/__tests__/usePreferenciasNotif.test.tsx` — DEFAULT_PREFS fixture + atomicity assertion (Rule 3 + Rule 1)

## Decisions Made

- **Whitelist conservadora** (RESEARCH §4): apenas formatos de documento jurídico/textual + imagens comuns
- **Pitfall §2 — file.type vazio tolerado**: alguns browsers/extensões enviam `file.type=''`; cruzamos com extensão como sinal primário e MIME só quando presente
- **TipoNotif duplicado em 4 arquivos** (1 TS browser + 3 Deno helpers): runtime Deno não compartilha bundle com o browser; comentário "Phase 7 D-16" documenta a sincronia
- **UI 'documentos' linha** no NotificacoesPanel fica para Plan 04a: aqui só garantimos type-level + DEFAULT_PREFS para não quebrar tsc

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adicionar 'documentos' a DEFAULT_PREFS em NotificacoesPanel.tsx**
- **Found during:** Task 1b-2 (tsc errors após extensão de PreferenciasNotif)
- **Issue:** PreferenciasNotif agora exige 5 propriedades, mas DEFAULT_PREFS no NotificacoesPanel só tinha 4 → TS2741 "Property 'documentos' is missing"
- **Fix:** Adicionei `documentos: { slack: false, email: true, push: false }` ao DEFAULT_PREFS (default OFF para slack/push, ON só para email, alinhado ao padrão Phase 6 D-04)
- **Files modified:** src/components/me/NotificacoesPanel.tsx
- **Verification:** `npx tsc -b` verde após edit
- **Committed in:** `e933207` (junto com Task 1b-2)

**2. [Rule 3 - Blocking] Adicionar 'documentos' ao mapa tipoLabel em NotificacoesHistoricoPage.tsx**
- **Found during:** Task 1b-2 (tsc errors)
- **Issue:** `tipoLabel(tipo)` indexava objeto literal com 4 chaves; com `TipoNotif += 'documentos'` o lookup retornava `undefined` (TS2322 + TS2339)
- **Fix:** Adicionei entry `documentos: 'Documentos'`
- **Files modified:** src/pages/NotificacoesHistoricoPage.tsx
- **Verification:** tsc verde
- **Committed in:** `e933207`

**3. [Rule 3 - Blocking] Atualizar fixture DEFAULT_PREFS em 2 testes existentes**
- **Found during:** Task 1b-2 (tsc errors)
- **Issue:** Fixtures de teste construíam PreferenciasNotif manualmente com 4 chaves; após extensão, TS2741
- **Fix:** Adicionei `documentos: { slack: false, email: true, push: false }` em ambos
- **Files modified:** src/components/me/__tests__/NotificacoesPanel.test.tsx + src/hooks/__tests__/usePreferenciasNotif.test.tsx
- **Verification:** tsc verde
- **Committed in:** `e933207`

**4. [Rule 1 - Bug] Atomicity assertion em usePreferenciasNotif.test.tsx esperava só 4 chaves**
- **Found during:** Smoke test final (npm test --run no diff)
- **Issue:** Teste `'envia upsert atômico das prefs'` asserta `Object.keys(payload.preferencias_notif).sort()` ser igual a `['cadencia','indicacao','renovacao','tarefa']` — mas DEFAULT_PREFS agora tem 5 chaves, então sort() retorna 5 elementos. Assertion falhou.
- **Fix:** Adicionei `'documentos'` (na posição alfabética 2) à lista esperada
- **Files modified:** src/hooks/__tests__/usePreferenciasNotif.test.tsx
- **Verification:** 4 testes passam após o fix (`npm test -- --run src/hooks/__tests__/usePreferenciasNotif.test.tsx`)
- **Committed in:** `4181ac9` (commit separado para rastreabilidade)

---

**Total deviations:** 4 auto-fixed (3 Rule 3 blocking + 1 Rule 1 bug)
**Impact on plan:** Auto-fixes necessários para o tsc/tests passarem após a extensão obrigatória de PreferenciasNotif. Nenhum scope creep — apenas propagação local do novo campo `documentos` para fixtures que já construíam o tipo manualmente. UI dedicada do canal documentos fica para Plan 04a conforme planejado.

## Issues Encountered

Nenhum. Smoke test final: 21 test files passed, 8 skipped (RLS pula sem .env.test), 236 tests passed, 43 todo (Wave 0 stubs).

## Threat Flags

Nada novo. Threat register do plan (T-07-01 mitigate + T-07-04 accept) está coberto a nível de type/constante:
- T-07-01 (Path tampering): pattern `{cliente_id}/{doc_id}.{ext}` será enforçado em storage-helpers do Plan 02 — aqui só fixamos os types ClienteDoc.storage_path + nome_arquivo separados
- T-07-04 (MIME spoof): whitelist em ALLOWED_MIME_TYPES + cliente CONSEJ não é hostil (RESEARCH Open Q7 RESOLVED)

## User Setup Required

Nenhum. Esta plan é puramente de código + tipos — sem novas variáveis de ambiente, sem novas credenciais, sem dashboards externos.

## Verification

- [x] `npx tsc -b` verde (TypeScript compilation completed)
- [x] `npm run lint -- src/lib/file-validation.ts src/types/index.ts src/lib/query-keys.ts src/test/storage-mocks.ts` exit 0
- [x] `npm test -- --run src/lib src/hooks src/components/clientes supabase/functions/_shared`: 21 passed, 8 skipped, 236 tests passed, 43 todo
- [x] 9 testes de file-validation passando (size, extensão, MIME, file.type vazio, empty, validateDocOrThrow)
- [x] Todos os success_criteria do PLAN atendidos

## Self-Check: PASSED

Arquivos verificados existentes:
- FOUND: src/lib/file-validation.ts
- FOUND: src/test/storage-mocks.ts
- FOUND: src/lib/__tests__/file-validation.test.ts (9 testes implementados)
- FOUND: 10 stub test files (it.todo / describe.skipIf / test.skip)
- FOUND: supabase/functions/_shared/{email,push,perfis}.ts atualizados

Commits verificados:
- FOUND: 9e863c2 (Task 1b-1)
- FOUND: e933207 (Task 1b-2)
- FOUND: 48d9da7 (Task 1b-3)
- FOUND: ee1d4d7 (Task 1b-4)
- FOUND: 9d894df (Task 1b-5)
- FOUND: 4181ac9 (follow-up fix)

## Next Phase Readiness

- **Plan 02 ready:** helper aprovacoes.ts pode chamar `sendEmail({ tipo: 'documentos' })` / `sendPush({ tipo: 'documentos' })` — types prontos
- **Plan 03 ready:** useClienteDocs pode importar `QUERY_KEYS.clienteDocs.byCliente(id)`, `validateDoc(file)`, e tipos `ClienteDoc` / `StatusDoc`
- **Plan 04a ready:** componentes têm stub tests escritos (todo); só popular implementação
- **Plan 04b ready:** E2E spec esqueleto criado

---
*Phase: 07-client-portal-expansion*
*Plan: 01b*
*Completed: 2026-05-28*
