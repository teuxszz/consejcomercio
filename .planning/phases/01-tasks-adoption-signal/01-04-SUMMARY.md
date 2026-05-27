# 01-04 SUMMARY — Adoption dashboard: AdocaoCard, AdocaoPage, leads esquecidos

**Plan:** 01-04
**Wave:** 4
**Requirements:** ADOPT-01, ADOPT-02, ADOPT-03
**Status:** ✅ Complete (formalizado retroativamente em 2026-05-27)
**Commit:** `be69f0f feat(adopt): Waves 3+4 — Realtime Badge + Adoption Signal (Plans 01-03/04)` (commit conjunto com 01-03)

---

## What was delivered

| File | Lines | Purpose |
|------|-------|---------|
| `src/hooks/useAdocao.ts` | 91 | Hook que agrega atividade por consultor (último login, leads criados, tarefas criadas, leads atualizados) |
| `src/components/adocao/AdocaoCard.tsx` | 94 | Card-resumo de adoção (versão compacta para Dashboard) |
| `src/components/adocao/LeadsEsquecidosTable.tsx` | 101 | Tabela de leads sem atualização há 7+ dias |
| `src/pages/AdocaoPage.tsx` | 103 | Página `/adocao` — painel completo de adoção (gated `RequireRole atLeast="coordenador"`) |
| `src/pages/DashboardPage.tsx` | +6 | Embed do AdocaoCard no dashboard principal |
| `src/router.tsx` | +2 | Rota `path: 'adocao'` registrada |
| `src/components/layout/Sidebar.tsx` | (alterado) | NavItem "Adoção" no grupo CRESCIMENTO, gated `isCoordenadorOrAcima` |
| `src/hooks/__tests__/useAdocao.test.tsx` | 87 | Cobertura unitária do agregador `useAdocao` |
| `src/pages/__tests__/AdocaoPage.test.tsx` | 54 | Smoke test do render da página |

## Requirements covered

- **ADOPT-01 — Coordenador vê quem logou na última semana:** `useAdocaoAtividade` retorna lista de perfis com coluna `ultimoLogin` (formatada via `formatDistanceToNow` em pt-BR). Render destacando consultores com >5 dias sem login em vermelho.
- **ADOPT-02 — Coordenador vê quantos leads cada um criou:** Coluna "Leads criados" no AdocaoPage; agregação no mês corrente.
- **ADOPT-03 — Coordenador vê leads esquecidos (7+ dias sem update):** `LeadsEsquecidosTable` filtra leads onde `updated_at < now() - 7 days` e exibe ranking por antiguidade.

## Verificação estática

- Todos os arquivos do plan existem no working tree
- Rota `/adocao` registrada no router
- Nav item "Adoção" gated `isCoordenadorOrAcima` em `Sidebar.tsx:164`
- AdocaoPage usa `RequireRole atLeast="coordenador"` (defense-in-depth)
- Test suite presente: useAdocao.test.tsx (87 linhas) + AdocaoPage.test.tsx (54 linhas)
- AdocaoCard embed no DashboardPage confirmado (+6 linhas naquele arquivo)

## Notas

- Plan tinha `autonomous: true` + dependência de 01-01, 01-02, 01-03.
- Commit `be69f0f` bundles Waves 3 e 4 — split por plan documentado no SUMMARY do 01-03.
- SUMMARY gerado retroativamente em 2026-05-27 para fechar a Milestone 2.
