---
phase: 7
slug: client-portal-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (unit)** | vitest 3.2.x (existing) |
| **Framework (E2E)** | Playwright 1.60.x (existing, projects diretor/consultor) |
| **Framework (RLS)** | vitest tests/rls/ pattern (Phase 5/6) |
| **Quick run** | `npm test -- src/lib/__tests__/file-validation src/hooks/__tests__/useClienteDocs` |
| **Full unit suite** | `npm test` |
| **RLS suite** | `npm run test:rls` |
| **E2E** | `npm run test:e2e -- tests/e2e/cliente-docs.spec.ts` |
| **Estimated runtime (unit)** | ~35s |
| **Estimated runtime (full)** | ~100s |

---

## Sampling Rate

- After every task commit: `npm test -- <feature pattern>` ≤ 30s
- After every plan wave: `npm test && npm run test:rls` ≤ 100s
- Before `/gsd-verify-work`: full suite green + manual UAT (real cliente login + drag-drop upload + aprovar + dashboard)
- Max feedback latency: 30s/task, 100s/wave

---

## Per-Task Verification Map

> Filled after PLAN.md exists. Mapping rules per task type:
> - `unit` for pure helpers (file-validation: extension whitelist, size, MIME)
> - `integration` for hooks (useClienteDocs query, useUploadClienteDoc mutation with supabase mock)
> - `e2e` for end-to-end (cliente sobe doc → consultor recebe notif → aprova → consultor recebe outra notif)
> - `manual` for OS-level drag-drop, real Storage upload, real signed URL download
> - `rls` for cliente_docs policies + storage.objects policies
> - `migration` for 037 (CHECK constraints applied, RLS policy count, JSONB shape)

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------|-------------------|--------|
| (filled after PLAN) | | | PORTAL-01..04 | T-07-* | | | ⬜ |

---

## Wave 0 Requirements

Before any feature task runs, scaffold:

- [ ] `src/lib/__tests__/file-validation.test.ts` — stubs for extension whitelist + size + MIME check (D-05)
- [ ] `src/hooks/__tests__/useClienteDocs.test.tsx` — stubs for query + upload mutation + signed URL + aprovar + revisão mutations
- [ ] `supabase/functions/_shared/__tests__/aprovacoes.test.ts` — stubs for sendNotificacaoAprovacao honoring prefs + idempotency + Promise.allSettled fanout
- [ ] `tests/rls/cliente_docs.test.ts` — stubs for: cliente vê só own, consultor vê só responsavel_id, coord+ vê tudo, DELETE only via service_role
- [ ] `tests/rls/cliente_docs_storage.test.ts` — stubs for storage.objects RLS (path-based via storage.foldername)
- [ ] `tests/e2e/cliente-docs-flow.spec.ts` — stubs for cliente login → upload → consultor see → aprovar → notif → dashboard
- [ ] Mock helpers in `src/test/storage-mocks.ts` — supabase.storage.from().upload/createSignedUrl/download (jsdom doesn't ship them)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop from OS desktop | PORTAL-01 | jsdom doesn't fire native dragover events with real File objects | 1. `/portal/documentos` no Chrome; 2. arrastar PDF do desktop → drop na zona; 3. upload progress (ou spinner); 4. row em cliente_docs com mime_type=application/pdf + tamanho correto |
| Drag-and-drop iPhone Safari (touch) | PORTAL-01 | Touch events não traduzem 1:1 para drag-drop em todos os browsers mobile | 1. Safari iOS 16.4+; 2. tentar drag-drop (geralmente cai pra picker); 3. file picker `<input>` fallback funciona; 4. upload completa |
| Signed URL download | PORTAL-01 | Browser-level URL behavior (Content-Disposition, MIME sniffing) | 1. Lista de docs; 2. clicar "Baixar"; 3. signed URL gerada (verificar Network tab, expiry 60min); 4. download inicia OU abre em nova aba conforme browser default |
| Bucket usage banner para coord+ | D-06 | Threshold cross 80% precisa cron rodar + observação visual | 1. Logar como coordenador; 2. /portal-admin/aprovacoes-pendentes; 3. card mostra X MB / 1024 MB; 4. simular passar 80% (cron + insert massivo de fixtures) → banner aparece |
| Reenviar lembrete dispara email + push pro cliente | D-12 | Real email delivery + push delivery exige cliente real PWA instalado | 1. Coord+ no dashboard; 2. clicar Reenviar; 3. timeline atualizada com timestamp + perfil_id do coordenador; 4. cliente (em outra sessão/device) recebe email; 5. push se cliente assinou notif |
| 5-day stale cron disparo | D-07 (d), D-10 | Cron `notify-aprovacoes-stale` exige passar tempo real ou ajustar cron schedule pra test | 1. Ajustar pg_cron `0 9 * * *` temporariamente pra `* * * * *`; 2. INSERT cliente_docs com `created_at = now() - interval '6 days'` e `status='pending'`; 3. aguardar 1 min; 4. notificacoes_envios tem row tipo='documentos' canal=conforme prefs |
| MIME spoofing protection (file.type vs real magic bytes) | T-07-04 | file.type é browser-reported (untrustworthy); precisa OS real file | 1. Renomear `malware.exe` para `proposta.pdf`; 2. drag-drop; 3. Frontend `file.type` aceita (vai como application/pdf); 4. backend não tem MIME sniffing nesta MVP → aceita. **Esperado**: tech-debt documentado, não bloqueador. |
| ClienteDetailPage tab Documentos | PORTAL-02 | Tab navigation + URL state | 1. `/clientes/<id>?tab=documentos`; 2. tab Documentos selecionada; 3. lista docs do cliente; 4. upload UI presente |

---

## Validation Sign-Off

- [ ] All plan tasks have `<automated>` verify OR are explicitly in Manual-Only above
- [ ] Sampling continuity: no 3 consecutive tasks without automation in PLAN.md
- [ ] Wave 0 scaffolds 6 test files + storage-mocks listed
- [ ] No watch-mode flags
- [ ] Manual UAT items mapped (8 above)
- [ ] `nyquist_compliant: true` after planner fills map

**Approval:** pending (will be approved after planner maps tasks)

---

## Notes for Planner

- **MIME sniffing real é tech-debt** (T-07-04 in RESEARCH) — não bloquear MVP por isso. Aceitar limitation no SECURITY phase via "accept" disposition.
- **`file.type` testing** — vitest mocks devem incluir `new File([], 'name.pdf', { type: 'application/pdf' })` ou similar
- **Storage upload mock** — `src/test/storage-mocks.ts` exporta `mockStorageFromUpload({ data: { path }, error: null })` reusable. Já usado em Phase 6 (push-mocks pattern)
- **RLS tests** — seguir pattern `tests/rls/notificacoes_envios.test.ts` (se existir do Phase 5). Mesma estrutura seed + assert por role
- **Migration 037 verification** — após apply: `SELECT count(*) FROM pg_policies WHERE tablename = 'cliente_docs'` = 4 (SELECT/INSERT/UPDATE/DELETE) + `SELECT preferencias_notif->'documentos' FROM perfis LIMIT 5` retorna JSONB com 3 chaves (slack/email/push)
- **Bucket creation + storage.objects policies** — fora da migration. Wave 1 (foundation) deve ter checkpoint manual igual Phase 6 Plan 01 Task 1.3 (migration apply) pra Gabriel rodar `supabase storage buckets create ...` + colar Storage RLS no Dashboard SQL Editor
