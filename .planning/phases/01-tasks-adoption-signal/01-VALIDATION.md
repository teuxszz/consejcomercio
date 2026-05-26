---
phase: 1
slug: tasks-adoption-signal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:cov` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run test:cov`
- **Before `/gsd-verify-work`:** `npm test && npm run test:rls` must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-SEC-01 | migration | 1 | SEC-01 | T-1-01 | Cliente não pode SELECT em tarefas | RLS integration | `npm run test:rls` | ❌ W0 | ⬜ pending |
| 01-SEC-02 | migration | 1 | SEC-02 | — | Coluna `notificar` DEFAULT true existe | Migration smoke | `supabase db push` (manual) | N/A | ⬜ pending |
| 01-TASK-01 | tarefas-ui | 2 | TASK-01 | — | `useCreateTarefa` persiste tarefa com entidade_tipo=lead | Unit | `npm test -- useTarefas` | ❌ W0 | ⬜ pending |
| 01-TASK-02 | tarefas-ui | 2 | TASK-02 | — | `useCreateTarefa` aceita entidade_id=null | Unit | `npm test -- useTarefas` | ❌ W0 | ⬜ pending |
| 01-TASK-03 | tarefas-ui | 2 | TASK-03 | — | `useMinhasTarefas` filtra por userId + status | Unit | `npm test -- useTarefas` | ❌ W0 | ⬜ pending |
| 01-TASK-04 | tarefas-ui | 2 | TASK-04 | T-1-02 | `useConcluirTarefa` seta status=concluida; consultor sem acesso a tarefa alheia | Unit | `npm test -- useTarefas` | ❌ W0 | ⬜ pending |
| 01-NOTIF-04 | sidebar-badge | 3 | NOTIF-04 | — | Badge renderiza count > 0; zera após concluir tarefa | Component | `npm test -- TarefaBadge` | ❌ W0 | ⬜ pending |
| 01-ADOPT-01 | adocao | 4 | ADOPT-01 | T-1-03 | AdocaoCard só visível para coordenador+; renderiza com audit_logs mockados | Component | `npm test -- AdocaoCard` | ❌ W0 | ⬜ pending |
| 01-ADOPT-02 | adocao | 4 | ADOPT-02 | T-1-03 | AdocaoPage bloqueia consultor via RequireRole | Component | `npm test -- AdocaoPage` | ❌ W0 | ⬜ pending |
| 01-ADOPT-03 | adocao | 4 | ADOPT-03 | — | `useAdocao` filtra leads por `updated_at < 7 dias` | Unit | `npm test -- useAdocao` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/hooks/__tests__/useTarefas.test.ts` — stubs para TASK-01, 02, 03, 04
- [ ] `src/hooks/__tests__/useAdocao.test.ts` — stubs para ADOPT-01, 03
- [ ] `src/components/tarefas/__tests__/TarefaBadge.test.tsx` — stub para NOTIF-04
- [ ] `src/pages/__tests__/AdocaoPage.test.tsx` — stub para ADOPT-02
- [ ] `tests/rls/tarefas.test.ts` — SEC-01 (requer QA users provisionados — ver CONCERNS.md)

*Infraestrutura Vitest já existe no projeto — apenas criar os arquivos de test stub.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coluna `notificar` DEFAULT true existe no banco cloud | SEC-02 | Schema push requer CLI ou dashboard | Após `supabase db push`, verificar `\d tarefas` ou inspecionar no Supabase Dashboard |
| Badge Realtime atualiza sem refresh de página | NOTIF-04 | Requer dois tabs simultâneos abertos | Abrir CRM em 2 tabs; criar tarefa atribuída ao usuário em uma tab; verificar badge atualiza na outra |
| Login registrado em `audit_logs` após sign-in | ADOPT-01 pre-req | Requer evento real de auth | Fazer logout e login; verificar `audit_logs` onde `acao='login'` tem registro do usuário |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
