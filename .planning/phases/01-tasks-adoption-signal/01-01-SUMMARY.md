# 01-01 SUMMARY — Security migration 033 + login tracking + edge function update

**Plan:** 01-01
**Wave:** 1
**Requirements:** SEC-01, SEC-02
**Status:** ✅ Complete (formalizado retroativamente em 2026-05-27)
**Commit:** `dbf6039 feat(sec): migration 033 — fecha RLS tarefas + coluna notificar + login tracking`

---

## What was delivered

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/migrations/033_rls_tarefas_notificar.sql` | 38 | Migration: policy `is_interno()` em `tarefas` + coluna `notificar boolean DEFAULT true` |
| `supabase/functions/notify-tarefa/index.ts` | 227 | Edge function atualizada para respeitar coluna `notificar` (não notifica quando `false`) |
| `src/types/index.ts` | (alterado) | Tipo `Tarefa` com campo `notificar` |
| `src/lib/query-keys.ts` | (alterado) | Chave para invalidação de tarefas |
| `src/components/layout/AppLayout.tsx` | (alterado) | Login tracking — registra `ultimo_login_em` em `perfis` |

## Requirements covered

- **SEC-01 — RLS de `tarefas` restrita a internos:** policy `is_interno()` aplicada via migration 033. Clientes do tipo `cliente` não conseguem ler/escrever tarefas internas.
- **SEC-02 — Login tracking para painel de adoção:** AppLayout grava timestamp do login em `perfis.ultimo_login_em` (usado depois pelo `useAdocao` em 01-04).

## Verificação estática

- Arquivos existem no working tree (verificado em 2026-05-27)
- Coluna `notificar` referenciada em consultas downstream (01-03 badge filtra por `notificar=true`)
- Migration sequência preservada (033 entre 032 lixeira e 034 cron resumo diário)

## Notas

- Plan original tinha `autonomous: false` + `user_setup: supabase` (operador precisava aplicar migration no projeto cloud). Status produção confirmado via fato de que features dependentes (01-02..01-04) estão funcionais e Phase 03 (Pull-back Notifications) que consome `notify-tarefa` está em produção.
- SUMMARY gerado retroativamente — sem registro de divergências do plan original na época da execução.
