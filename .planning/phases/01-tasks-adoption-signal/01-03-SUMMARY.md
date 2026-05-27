# 01-03 SUMMARY — Sidebar realtime badge via Supabase Realtime

**Plan:** 01-03
**Wave:** 3
**Requirements:** NOTIF-04
**Status:** ✅ Complete (formalizado retroativamente em 2026-05-27)
**Commit:** `be69f0f feat(adopt): Waves 3+4 — Realtime Badge + Adoption Signal (Plans 01-03/04)` (commit conjunto com 01-04)

---

## What was delivered

| File | Lines | Purpose |
|------|-------|---------|
| `src/hooks/useTarefasBadgeCount.ts` | 34 | Hook com Supabase Realtime — conta tarefas abertas do usuário em tempo real |
| `src/components/layout/Sidebar.tsx` | (alterado) | NavItem "Tarefas" recebe `badge={badgeCount}` para exibir contador |
| `src/components/tarefas/__tests__/TarefaBadge.test.tsx` | 74 | Testes do comportamento do badge (count zero → escondido, count>0 → cyan pill) |

## Requirements covered

- **NOTIF-04 — Badge numérico no sidebar:** Item "Tarefas" no grupo PIPELINE do sidebar mostra pill cyan-500 com count de tarefas abertas; zera automaticamente conforme tarefas são concluídas. Subscription Realtime via `supabase.channel('tarefas-badge')`.

## Verificação estática

- `useTarefasBadgeCount` existe e é importado em `Sidebar.tsx:12`
- Uso confirmado em `Sidebar.tsx:113` (`const badgeCount = useTarefasBadgeCount(perfil?.id)`)
- NavItem com `badge={badgeCount}` aplicado ao item Tarefas (Sidebar.tsx:163)
- TarefaBadge.test.tsx existe com 74 linhas de cobertura

## Notas

- Plan tinha `autonomous: true` + dependência de 01-01 e 01-02.
- Commit `be69f0f` bundles Waves 3 e 4 juntas — o split do commit por plan exigiria `git log -p` para mapear exatamente quais hunks pertencem a cada plan. Os arquivos `useTarefasBadgeCount.ts` e `TarefaBadge.test.tsx` são inequivocamente do 01-03; restantes do mesmo commit (`useAdocao.ts`, `AdocaoCard.tsx`, etc.) pertencem a 01-04.
- SUMMARY gerado retroativamente.
