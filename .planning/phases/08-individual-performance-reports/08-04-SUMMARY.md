---
phase: 08-individual-performance-reports
plan: 04
subsystem: individual-performance-reports
tags: [phase-08, team-report, abort-controller, mobile-fallback, uat, drill]
requires: [08-01, 08-02, 08-03]
provides:
  - calcularDesempenhoEquipe / filtrarConsultoresAtivos / rankConsultores (D-07)
  - DesempenhoTeamReport multi-variant (capa | consultor | ranking)
  - ProgressTeamReportModal (Dialog + Progress + Cancelar)
  - gerarRelatorioEquipe (lazy + AbortController + theme-safe + metadata strip)
  - ExportarPDFEquipeButton (coord+ com mobile warn ≥5 consultores)
  - AdocaoPage header com botão equipe + rows clickable drill (D-08)
affects:
  - src/pages/AdocaoPage.tsx (header + tabela rows)
  - src/lib/pdf-export.ts (gerarRelatorioEquipe foi adicionada no Plan 03 já lazy)
tech-stack:
  added: []
  patterns:
    - AbortController + DOMException("Aborted", "AbortError") em loop sequencial (Pattern 4 RESEARCH)
    - try/finally restaura theme dark mesmo em AbortError (Pitfall 5)
    - mountAndCapture callback indireção (state -> 2x RAF -> querySelector)
    - isMobile detector (UA + iPad masquerading via maxTouchPoints + Mac)
    - toast.warning com action "Tentar mesmo assim" (Sonner)
    - Defesa em camadas role-gate: AdocaoPage wrap + botão duplica RequireRole
key-files:
  created:
    - src/lib/desempenho-team.ts
    - src/lib/__tests__/desempenho-team.test.ts
    - src/components/desempenho/DesempenhoTeamReport.tsx
    - src/components/desempenho/ProgressTeamReportModal.tsx
    - src/components/desempenho/ExportarPDFEquipeButton.tsx
  modified:
    - src/pages/AdocaoPage.tsx (header + cursor-pointer + onClick drill)
    - src/pages/__tests__/AdocaoPage.test.tsx (mocks adicionais para hooks novos)
decisions:
  - "D-07 'consultor ativo' = role='consultor' AND ≥1 lead criado no período (exclui coordenador+ mesmo com leads)"
  - "D-08 drill da AdocaoPage row → /me/desempenho/<perfilId> (consume Plan 02 rota dinâmica)"
  - "Pattern 4 sequencial (não paralelo) — iOS heap permanece sob controle"
  - "Pattern 10 mobile warn em ≥5 consultores (limiar D-07) com botão override 'Tentar mesmo assim'"
  - "REP-04 ranking ordenado por leads_convertidos desc (helper rankConsultores)"
  - "Defesa em camadas T-08-04: AdocaoPage RequireRole + botão duplica + MeDesempenhoPage RequireRole + RLS migration 029"
metrics:
  duration: ~25min (artefatos já existiam de runs prévios; trabalho desta sessão = Task 3 commit + test mock fix + run/build/SUMMARY)
  completed_date: 2026-05-29
  commits:
    - 695eed9 feat(08-04-1): desempenho-team helpers (filtrar/rank/calcular) + 8 tests
    - 1bc49bd feat(08-04-2): gerarRelatorioEquipe + DesempenhoTeamReport + ProgressModal
    - 62d065e feat(08-04-3): ExportarPDFEquipeButton + AdocaoPage drill + mobile warn
---

# Phase 8 Plan 04: Team Report + UAT Close-Out Summary

REP-04 entregue end-to-end — coordenador+ exporta relatório consolidado da equipe (capa + 1 página por consultor ativo + ranking final) com AbortController + iOS warn ≥5 consultores + drill nas rows da AdocaoPage. Phase 8 fechável após UAT manual.

## Tasks completas

| Task | Nome | Commit | Notas |
|------|------|--------|-------|
| 1 | desempenho-team helpers + 8 tests | `695eed9` | filtrarConsultoresAtivos/rankConsultores/calcularDesempenhoEquipe puros; cobertura D-07 |
| 2 | DesempenhoTeamReport + ProgressModal + gerarRelatorioEquipe | `1bc49bd` | TeamReport multi-variant; gerarRelatorioEquipe lazy + AbortController + theme-safe + setProperties({}) |
| 3 | ExportarPDFEquipeButton + AdocaoPage drill + mobile warn | `62d065e` | Botão coord+ com isMobile detector + toast.warning action; rows clickable D-08; test mock fix |
| 4 | UAT 7-item manual checkpoint | **DEFERRED-MANUAL** | Validação visual em browser real + iPhone Safari + Excel desktop. Não automatável. Ver "UAT Sign-Off" abaixo |

## Verification

- `npm test -- src/lib/__tests__/desempenho-team.test.ts --run` → 8/8 verdes
- `npm test -- src/pages/__tests__/AdocaoPage.test.tsx --run` → 2/2 verdes (após fix do mock)
- `npx tsc -b --noEmit` → clean
- `npm run build` → clean; chunks lazy esperados confirmados:
  - `jspdf-DEMxnAN4.js` 343 kB
  - `html2canvas-DpiFM73O.js` 199.6 kB
  - `papaparse--uIQqvaH.js` 19.2 kB
  - `jszip-DzxwhUkF.js` 95.9 kB
- Suite completa: 398 passed / 11 failed / 26 skipped / 21 todo. **As 11 falhas são pré-existentes** em `supabase/functions/notify-tarefa` + `notify-renovacao` (testes em Deno edge functions com import `https://...` que vitest Node não resolve — out of scope per Plan 08-04, registrado como deferred-issue).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] AdocaoPage.test.tsx mock incompleto após Plan 08-04 Task 3**
- **Found during:** Task 3 verification (npm test full suite)
- **Issue:** `AdocaoPage` agora renderiza `ExportarPDFEquipeButton` (via RequireRole coord+) que consome `usePerfis`, `useLeads`, `useTarefas`, `useClientes`, `useContratos`, `useConfiguracoes`. O mock existente só cobria `useMeuPerfil` (de `@/hooks/usePerfis`), `useAdocaoAtividade`/`useLeadsEsquecidos`, e `useQuotaResend`. Teste "coordenador vê a página" quebrava com `No "usePerfis" export is defined on the "@/hooks/usePerfis" mock`.
- **Fix:** Adicionar `usePerfis` ao mock existente de `@/hooks/usePerfis` (retornando `{ data: [], isLoading: false }`); adicionar `vi.mock` para `@/hooks/useLeads`, `useTarefas`, `useClientes`, `useContratos`, `useConfiguracoes` — todos com data vazia. Componente monta sem booting supabase client.
- **Files modified:** `src/pages/__tests__/AdocaoPage.test.tsx`
- **Commit:** `62d065e` (incluído junto com Task 3)

Sem outras deviações. Plan executado conforme escrito (artefatos das Tasks 1+2 já existiam em runs prévios — esta sessão fechou Task 3 + test fix + verification).

## Threats Mitigated

| Threat ID | Como mitigado neste plan |
|-----------|--------------------------|
| T-08-04 (EoP — drill + botão equipe) | Defesa em camadas: (a) AdocaoPage wraps em `RequireRole atLeast="coordenador"` (linha 119); (b) ExportarPDFEquipeButton também wrapped em RequireRole dentro do header (linha 23); (c) MeDesempenhoPage usa RequireRole condicional (Plan 02); (d) RLS backend migration 029 filtra por role |
| T-08-05 (DoS — iOS heap em team ≥10) | Sequencial (`for` loop, não Promise.all); `canvas.width = 0` entre páginas; AbortController + Cancel UI; `isMobile() && ≥5` → toast.warning com botão override |
| T-08-FX (Theme stuck após cancel) | `try { … } finally { restore theme dark }` em `gerarRelatorioEquipe`; UAT item #8 (bonus) valida visualmente |
| T-08-01 (PDF metadata leak) | `pdf.setProperties({ title: '', author: '', creator: '', subject: '', keywords: '' })` aplicado em `gerarRelatorioEquipe` |

## UAT Sign-Off — DEFERRED MANUAL (Phase 6/7 precedent)

Conforme `08-VALIDATION.md §Manual-Only Verifications` — 7 itens visuais/funcionais que requerem ambiente real:

1. **PDF individual visual** (REP-02): Login consultor → /me/desempenho → "Exportar PDF" → 3 páginas A4 com KPIs + charts + dados batem com tela.
2. **PDF team report** (REP-04): Login coord+ → /adocao → "Exportar PDF equipe" → modal X/N consultores → download `desempenho_equipe_2026-total.pdf` com capa + N páginas + ranking sorted.
3. **CSV opens in Excel PT-BR** (REP-03): /me/desempenho → "Exportar CSV" → unzip → abrir leads.csv/tarefas.csv/contratos.csv no Excel desktop Windows com acentos PT-BR preservados.
4. **CSV injection mitigation** (T-08-03): Lead com nome contendo `=cmd|...` → célula CSV prefixada com `'` no Excel; fórmula NÃO executa.
5. **Light theme forçado durante capture** (D-11): Dark mode → click PDF → flash light ~2s → dark restaurado; PDF gerado em light theme legível.
6. **iOS Safari graceful fallback** (Pattern 10): iPhone Safari → /adocao com ≥5 consultores ativos → toast.warning "Relatório da equipe é pesado em mobile…" com botão "Tentar mesmo assim".
7. **AdocaoPage drill + role gate** (D-08, T-08-04): Coord+ /adocao → click row → /me/desempenho/<perfilId>; consultor regular → URL manual → RequireRole bloqueia.

**Bonus item #8 (Cancel mid-export):** Team report desktop → click Cancelar → modal fecha + toast "Geração cancelada" → tema permanece consistente (não preso em light).

**Responsável pela UAT:** Gabriel (próxima sessão, ambiente real Chrome desktop + iPhone Safari + Excel desktop Windows).

**Outcome esperado para fechar Phase 8:**
- Todos 7 itens (+ bonus #8) passam → registrar "aprovado" em STATE.md ; ROADMAP marca Phase 8 ✅
- Gaps abertos → `/gsd-plan-phase 8 --gaps`

## Deferred Issues (out of scope Plan 08-04)

**1. 11 testes Deno edge functions falham na suite Node Vitest** (pré-existente desde Plan 05+)
- Arquivos: `supabase/functions/notify-tarefa/__tests__/parallel.test.ts`, `self-loop.test.ts`, `notify-renovacao/__tests__/handoff.test.ts`
- Causa: `import` de `https://deno.land/std@...` e `https://esm.sh/...` — vitest default ESM loader não suporta URLs HTTP.
- Tracking: documentado em `deferred-items.md`. Fix correto = mover esses testes para suite Deno separada OU vitest-deno-resolver plugin. Fora do escopo Phase 8.

## Known Stubs

Nenhum stub identificado. Todos os componentes Phase 8 estão wired a dados reais via hooks TanStack Query.

## Self-Check: PASSED

Arquivos verificados existem:
- src/lib/desempenho-team.ts ✓
- src/lib/__tests__/desempenho-team.test.ts ✓
- src/components/desempenho/DesempenhoTeamReport.tsx ✓
- src/components/desempenho/ProgressTeamReportModal.tsx ✓
- src/components/desempenho/ExportarPDFEquipeButton.tsx ✓
- src/pages/AdocaoPage.tsx (modified) ✓
- src/pages/__tests__/AdocaoPage.test.tsx (modified) ✓

Commits verificados:
- `695eed9` ✓ feat(08-04-1)
- `1bc49bd` ✓ feat(08-04-2)
- `62d065e` ✓ feat(08-04-3)
