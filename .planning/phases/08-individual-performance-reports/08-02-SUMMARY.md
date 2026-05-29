---
phase: 08-individual-performance-reports
plan: 02
subsystem: ui
tags: [react, recharts, react-router, tanstack-query, react-dom-portal, role-aware]

# Dependency graph
requires:
  - phase: 08-individual-performance-reports
    provides: calcularDesempenho helper, DesempenhoMetricas type, loadPeriod/savePeriod (Plan 01)
provides:
  - MeDesempenhoPage at /me/desempenho [/:perfilId]
  - DesempenhoKpiGrid (4x2 8 KPIs with null-safety)
  - KPICard (null-safe value rendering)
  - 3 chart components (Funil, Timeline, Tarefas) with isAnimationActive=false
  - DesempenhoReport (off-screen portal 3-page A4 renderer)
  - PerfilPanel "Ver meu desempenho" link (D-09 discovery)
  - Conditional RequireRole pattern (Pitfall 4)
affects:
  - Plan 08-03 (pdf-export + csv-export — needs DesempenhoReport portal as capture target)

# Tech tracking
tech-stack:
  added: []  # no new deps — uses existing recharts, react-dom createPortal, react-router-dom
  patterns:
    - "Off-screen portal renderer (createPortal + top:-9999px) for future PDF capture"
    - "isAnimationActive=false on all recharts inside PDF-capturable trees (Pitfall 1)"
    - "Hex color literals (no CSS vars) in PDF-capturable components (Pitfall 2)"
    - "Conditional RequireRole — wrap content only when params.perfilId !== meuPerfil.id (Pitfall 4)"
    - "localStorage hydration via useState lazy init + useEffect persist"

key-files:
  created:
    - src/components/desempenho/KPICard.tsx
    - src/components/desempenho/DesempenhoKpiGrid.tsx
    - src/components/desempenho/DesempenhoFunilChart.tsx
    - src/components/desempenho/DesempenhoTimelineChart.tsx
    - src/components/desempenho/DesempenhoTarefasChart.tsx
    - src/components/desempenho/DesempenhoReport.tsx
    - src/pages/MeDesempenhoPage.tsx
  modified:
    - src/router.tsx (2 new routes)
    - src/components/me/PerfilPanel.tsx (Link "Ver meu desempenho")
    - src/components/desempenho/__tests__/DesempenhoReport.test.tsx (5 tests now active)

key-decisions:
  - "Off-screen DesempenhoReport uses portal + SSR-safe typeof document guard (instead of useState/useEffect mounted gate) to satisfy react-hooks setState-in-effect lint rule while keeping jsdom safe"
  - "DesempenhoReport uses hex colors (#0089ac, #0d1929, #e2e8f0, white) explicitly — CSS vars stripped because html2canvas can't resolve var() reliably (Pitfall 2)"
  - "MeDesempenhoPage mounts DesempenhoKpiGrid + 3 charts inline (visible view) — DesempenhoReport portal is reserved for Plan 03 PDF capture; not mounted in the visible page to avoid duplicate render cost"
  - "useContratos() consumed directly (not derived from clientes.contratos nested) — locks data contract per plan-checker warning #5 and matches Plan 01 calcularDesempenho signature (separate contratos[] param)"

patterns-established:
  - "Portal off-screen renderer pattern — div[data-pdf-root] + 3 div[data-pdf-page=1|2|3] sub-divs at A4 794x1123px ready for html2canvas iteration in Plan 03"
  - "Null-safe KPICard — value===null renders '—' literal; distinguishes from value=0"
  - "Conditional gate pattern — return isViewingOther ? <RequireRole>{content}</RequireRole> : content"

requirements-completed:
  - REP-01

# Metrics
duration: ~25min
completed: 2026-05-29
---

# Phase 8 Plan 02: MeDesempenhoPage + off-screen renderer

**Página /me/desempenho com KpiGrid 4×2 + 3 charts recharts + DesempenhoReport portal off-screen (794px A4) pronto para captura PDF futura; rotas D-02 + RequireRole condicional Pitfall 4 + link discovery D-09 wirados.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-29T14:14Z
- **Completed:** 2026-05-29T14:25Z
- **Tasks:** 3
- **Files created:** 7
- **Files modified:** 3

## Accomplishments

- REP-01 view entregue end-to-end — consultor visita `/me/desempenho` e vê 8 KPIs + 3 charts no período selecionado
- Coordenador+ pode visitar `/me/desempenho/:perfilId` para ver outro consultor; consultor regular bloqueado via RequireRole condicional (Pitfall 4 — wrap só quando perfilId !== self)
- PeriodSelector wired com loadPeriod/savePeriod (D-06 — localStorage `consej_desempenho_period` persistido)
- DesempenhoReport portal off-screen criado (Pattern 2 RESEARCH) — 3 sub-divs `data-pdf-page="1|2|3"` em A4 794×1123px com cores hex fixas, prontas para html2canvas iterar em Plan 03
- Todos os 3 charts recebem `isAnimationActive={false}` (Pitfall 1) — Plan 03 não precisará tocar componentes
- PerfilPanel ganha link "Ver meu desempenho →" (D-09 discovery sem nav pollution)

## Task Commits

1. **Task 1: KPICard + DesempenhoKpiGrid + 3 chart components** — `ba9e88b` (feat)
2. **Task 2: DesempenhoReport portal off-screen 794px 3 páginas** — `dec76d2` (feat)
3. **Task 3: MeDesempenhoPage + routing + PerfilPanel link** — `ee22259` (feat)

## Files Created

- `src/components/desempenho/KPICard.tsx` — null-safe KPI card; value===null → "—"
- `src/components/desempenho/DesempenhoKpiGrid.tsx` — grid `grid-cols-2 lg:grid-cols-4` com 8 KPIs D-11
- `src/components/desempenho/DesempenhoFunilChart.tsx` — BarChart horizontal (Criados/Convertidos/Perdidos)
- `src/components/desempenho/DesempenhoTimelineChart.tsx` — LineChart 12 meses (Jan-Dez) filtrado por ano do período + perfilId
- `src/components/desempenho/DesempenhoTarefasChart.tsx` — BarChart vertical 3 status (Aberta/Em andamento/Concluída)
- `src/components/desempenho/DesempenhoReport.tsx` — createPortal off-screen, 3 sub-divs `data-pdf-page` A4
- `src/pages/MeDesempenhoPage.tsx` — orchestrator: useMeuPerfil + useLeads + useTarefas + useClientes + useContratos + useConfiguracoes + calcularDesempenho

## Files Modified

- `src/router.tsx` — import + 2 rotas (`me/desempenho` e `me/desempenho/:perfilId`)
- `src/components/me/PerfilPanel.tsx` — import `Link` + `BarChart3`, novo bloco `<Link to="/me/desempenho">` (D-09)
- `src/components/desempenho/__tests__/DesempenhoReport.test.tsx` — 5 tests ativos (era describe.skip do Plan 01)

## Decisions Made

1. **Off-screen guard via `typeof document`** em vez de `useState/useEffect` mounted gate — react-hooks lint rule `set-state-in-effect` reclamava do padrão mounted. Trocar por `if (typeof document === 'undefined') return null` é equivalente para SSR-safety + lint-clean.

2. **Hex colors, no CSS vars dentro de DesempenhoReport/charts** — html2canvas (Plan 03) não resolve `var(--cyan-hi)` confiavelmente (Pitfall 2 RESEARCH). Cores fixas: `#0089ac` (CONSEJ cyan), `#0d1929` (dark text), `#e2e8f0` (light border), `white` (bg). Charts inline na page visível ficam idênticos — mais simples que dois caminhos de cor.

3. **useContratos() direto em MeDesempenhoPage** — locks data contract (plan-checker warn #5). `calcularDesempenho` espera `contratos: Contrato[]` separado de `clientes: Cliente[]`. Derivar via `clientes.flatMap(c => c.contratos)` daria contratos sem `responsavel_id` populado (o select de useClientes embute apenas `contratos(*)`, não join com perfis).

4. **DesempenhoReport não é montado na page visível** — Plan 03 monta o portal só durante a exportação PDF (mount → captura → unmount). Mantendo o componente isolado evita render cost duplicado quando o usuário só está navegando.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lint rule `react-hooks/set-state-in-effect` rejeitou o pattern `useState + useEffect setMounted(true)` em DesempenhoReport**
- **Found during:** Task 3 (rodando `npm run lint` antes do commit)
- **Issue:** Pattern recomendado pelo RESEARCH (RESEARCH §Pattern 2 line 414+) usa montagem condicional via `setState` em `useEffect` para evitar SSR/jsdom edge cases. Lint flagou como "cascading renders".
- **Fix:** Trocar por guard SSR-safe `if (typeof document === 'undefined') return null` — semanticamente equivalente (Vite SPA roda sempre no browser, document existe). Mantém portal funcional + lint-clean.
- **Files modified:** `src/components/desempenho/DesempenhoReport.tsx`
- **Verification:** `npx eslint src/components/desempenho/ src/pages/MeDesempenhoPage.tsx` clean; 5 tests continuam verdes; `npm run build` sucesso.
- **Committed in:** ee22259 (Task 3 commit — fix incluído na refatoração final)

---

**Total deviations:** 1 auto-fixed (1 blocking — lint)
**Impact on plan:** Auto-fix preserva o objetivo (portal off-screen para Plan 03) com pattern equivalente que satisfaz o lint config do projeto. Sem scope creep.

## Issues Encountered

- **Pre-existing test failures (10) em `supabase/functions/notify-*`**: Erro `Only URLs with a scheme in: file and data are supported by the default ESM loader. Received protocol 'https:'` ao tentar carregar imports `https://deno.land/...` no Vitest Node runtime. **Pré-existente — não introduzido por Plan 02.** Plan 02 contribui com 5 tests verdes (KPICard 3 + KpiGrid 2). Total da suite: 369 passed / 10 failed (pré-existentes) / 34 skipped.

- **Pre-existing lint errors (352)**: Todos em `supabase/functions/**`, `tests/rls/**`, ou worktrees `.claude/worktrees/**`. Arquivos novos/modificados de Plan 02 passam lint individualmente (`npx eslint src/components/desempenho/ src/pages/MeDesempenhoPage.tsx` clean).

## User Setup Required

None — Plan 02 não requer config externa. Routes + components são puro client-side React.

## Next Phase Readiness

**Plan 08-03 (PDF/CSV export) está desbloqueado.** Tudo que Plan 03 precisa adicionar:

1. `src/lib/pdf-export.ts` — orquestração `gerarRelatorioIndividual(rootEl, metrics)`:
   - Lazy import `jspdf` + `html2canvas`
   - Toggle dark→light, iterar `[data-pdf-page]`, captura via html2canvas
   - Embed em jsPDF, save com filename `desempenho_<slug>_<periodo>.pdf`
   - Pattern já documentado em RESEARCH §Pattern 3 (lines 451-503)

2. `src/lib/csv-export.ts` — orquestração `gerarZipCSV(...)`:
   - Lazy import `papaparse` + `jszip`
   - UTF-8 BOM + `Papa.unparse({ quotes: true })` + `sanitizeCell`
   - Pattern em RESEARCH §Pattern 5 (lines 614-694)

3. `src/components/desempenho/ExportarPDFButton.tsx` + `ExportarCSVButton.tsx` — botões em MeDesempenhoPage:
   - Montar `<DesempenhoReport />` (portal off-screen já existente)
   - Aguardar 1 RAF para garantir paint
   - Chamar `gerarRelatorioIndividual(rootEl, metrics)`
   - Pattern em PATTERNS §9 (linhas 316-340)

4. Reativar `src/components/desempenho/__tests__/ExportarPDFButton.test.tsx` (Wave 0 stub) — 4 tests usando `src/test/pdf-mocks.ts` (criado em Plan 01).

Nenhum blocker. DesempenhoReport portal está pronto para captura.

## Self-Check: PASSED

### Files exist verification

- `src/components/desempenho/KPICard.tsx` — FOUND
- `src/components/desempenho/DesempenhoKpiGrid.tsx` — FOUND
- `src/components/desempenho/DesempenhoFunilChart.tsx` — FOUND
- `src/components/desempenho/DesempenhoTimelineChart.tsx` — FOUND
- `src/components/desempenho/DesempenhoTarefasChart.tsx` — FOUND
- `src/components/desempenho/DesempenhoReport.tsx` — FOUND
- `src/pages/MeDesempenhoPage.tsx` — FOUND

### Commit hashes verification

- `ba9e88b` (Task 1) — FOUND
- `dec76d2` (Task 2) — FOUND
- `ee22259` (Task 3) — FOUND

### Acceptance criteria checks

- 3 `data-pdf-page=` em DesempenhoReport.tsx — VERIFIED (3 ocorrências)
- 1 `top: '-9999px'` em DesempenhoReport.tsx — VERIFIED
- 3 `isAnimationActive={false}` (1 por chart) — VERIFIED nos 3 chart files
- `grid-cols-2 lg:grid-cols-4` em DesempenhoKpiGrid — VERIFIED
- `value === null` em KPICard — VERIFIED
- 3 ocorrências `MeDesempenhoPage` em router.tsx (import + 2 routes) — VERIFIED
- 2 `path: 'me/desempenho` em router.tsx — VERIFIED
- `RequireRole atLeast="coordenador"` em MeDesempenhoPage — VERIFIED
- `to="/me/desempenho"` em PerfilPanel — VERIFIED
- `loadPeriod` em MeDesempenhoPage — VERIFIED
- `npx tsc -b --noEmit` exit 0 — VERIFIED
- `npm run build` clean — VERIFIED (built in 6.25s)
- 5 tests verdes (KPICard 3 + KpiGrid 2) — VERIFIED

---
*Phase: 08-individual-performance-reports*
*Completed: 2026-05-29*
