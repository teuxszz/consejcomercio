---
phase: 08-individual-performance-reports
plan: 03
subsystem: desempenho-export
tags: [phase-08, export, lazy-import, csv-injection, pdf-generation, owasp]
requires:
  - Plan 08-01 (slug, types DesempenhoMetricas, pdf-mocks)
  - Plan 08-02 (DesempenhoReport com data-pdf-root + 3 data-pdf-page divs)
provides:
  - gerarRelatorioIndividual (pdf-export.ts) — lazy import jspdf+html2canvas
  - gerarZipCSV + sanitizeCell (csv-export.ts) — lazy import papaparse+jszip
  - ExportarPDFButton + ExportarCSVButton components
  - GlobalSearch STATIC_PAGES support + 'Páginas' category
affects:
  - vite.config.ts — manualChunks function split p/ chunks lazy nomeados
  - src/pages/MeDesempenhoPage.tsx — header com 2 botoes + filtros memo
  - src/components/layout/GlobalSearch.tsx — STATIC_PAGES + LayoutDashboard icon
tech-stack:
  added: []   # libs ja instaladas no Plan 08-01 (jspdf, html2canvas, papaparse, jszip)
  patterns:
    - Lazy import via dynamic import() + Promise.all (RESEARCH §Pattern 11)
    - Theme toggle dark→light com restore em finally (RESEARCH §Pattern 6 + Pitfall 5)
    - PDF metadata strip via setProperties({}) (T-08-01 mitigation)
    - OWASP CSV injection sanitizeCell (T-08-03 mitigation)
    - UTF-8 BOM prefix p/ Excel PT-BR encoding (Pitfall 8)
    - Blob URL revoke pos-download (T-08-08 mitigation)
    - Mount/unmount conditional via state + 1 RAF wait pre-captura
key-files:
  created:
    - src/lib/pdf-export.ts
    - src/lib/csv-export.ts
    - src/components/desempenho/ExportarPDFButton.tsx
    - src/components/desempenho/ExportarCSVButton.tsx
    - src/lib/__tests__/pdf-export.test.ts
  modified:
    - src/lib/__tests__/csv-export.test.ts (stub → 11 tests reais)
    - src/components/desempenho/__tests__/ExportarPDFButton.test.tsx (stub → 3 tests reais)
    - src/pages/MeDesempenhoPage.tsx
    - src/components/layout/GlobalSearch.tsx
    - vite.config.ts
decisions:
  - Manual chunks via funcao (id-based) ao inves de objeto string-array — Vite 8 typing exige assinatura compativel com ManualChunksFunction
  - Stub do ExportarPDFButton.test.tsx mantido como skip durante Task 1; substituido por testes reais na Task 3 (alternativa explicita do PLAN)
  - pdf-export.test.ts criado separado em src/lib/__tests__ ao inves de empurrar logica de PDF para o teste do componente — testar pure-fn isoladamente (sem render) e mais robusto
  - vi.hoisted() para os mocks de fn no ExportarPDFButton.test.tsx — vi.mock e hoisted e nao pode referenciar const top-level
metrics:
  duration: "~55min"
  completed: 2026-05-29
  tasks: 3
  files-created: 5
  files-modified: 5
  tests-added: 18 (3 ExportarPDFButton + 4 pdf-export + 11 csv-export)
  tests-total-phase8: 44 verdes (10 slug + 11 desempenho + 5 DesempenhoReport + 4 pdf-export + 11 csv-export + 3 ExportarPDFButton)
---

# Phase 8 Plan 03: PDF + CSV Export Buttons Summary

Implementacao das duas libs de export individual (`pdf-export.ts` e
`csv-export.ts`) com lazy import + threat mitigations + dois botoes
montados em `/me/desempenho`, completando REP-02 e REP-03. GlobalSearch
agora indexa "Desempenho" como STATIC_PAGE para discovery via Cmd+K (D-09).

## One-liner

Export individual de relatorio de desempenho — PDF 3 paginas (jspdf +
html2canvas lazy + theme toggle + metadata strip) e ZIP com 3 CSVs UTF-8
BOM + sanitizeCell OWASP — disparado por dois botoes em `/me/desempenho`,
com Cmd+K route discovery via GlobalSearch STATIC_PAGES.

## What was built

### Task 1 — `src/lib/pdf-export.ts` (commit c2ab6d1)

- `gerarRelatorioIndividual(rootEl, metrics, geradoEm)` — captura cada
  `[data-pdf-page]` do DesempenhoReport, gera PDF 3 paginas em A4
  portrait, dispara `pdf.save(filename)`
- Lazy imports: `await Promise.all([import('jspdf'), import('html2canvas')])`
  → chunks separados verificaveis no build (343 KB jspdf + 200 KB html2canvas
  ficam fora do main bundle)
- **T-08-01 mitigation:** `pdf.setProperties({ title: '', author: '',
  creator: '', subject: '', keywords: '' })` — strip de metadata default
  (sem leak de `creator='jsPDF'` no PDF gerado)
- **Pitfall 5 mitigation:** theme dark forcado a light em try, restaurado
  em finally — falha de `html2canvas` nao deixa user com tema quebrado
- **Pitfall 7 mitigation:** `canvas.width = 0; canvas.height = 0` apos
  cada `addImage` — release de memoria em iOS Safari (heap limitado)
- **T-08-02 mitigation:** filename via `slugify(perfilNome)` — elimina
  path-traversal / chars especiais
- `ProgressInfo` interface exportada para uso futuro pela Plan 04 (team
  report com barra de progresso)

### Task 2 — `src/lib/csv-export.ts` (commit 17b3426)

- `gerarZipCSV(input)` — gera ZIP com `leads.csv`, `tarefas.csv`,
  `contratos.csv`, dispara download via Blob URL
- `sanitizeCell(value)` — exportado, **T-08-03 OWASP mitigation**: prefixa
  `=` `+` `-` `@` `\t` `\r` com apostrofo
- Lazy imports: `await Promise.all([import('papaparse'), import('jszip')])`
  → chunks separados (19 KB papaparse + 96 KB jszip fora do main bundle)
- **UTF-8 BOM (`﻿`)** prepended em cada CSV — Excel PT-BR le acentos
  corretamente
- `Papa.unparse(rows, { quotes: true })` — todos os campos quoted
  (defesa-em-profundidade contra escape de separador)
- **T-08-08 mitigation:** `URL.revokeObjectURL(url)` apos `anchor.click()`
  — sem leak de memoria do Blob
- 8 colunas em leads.csv, 6 em tarefas.csv, 7 em contratos.csv (per
  §Pattern 9 RESEARCH)

### Task 3 — Componentes UI + integracao (commit 15f652f)

- `ExportarPDFButton`:
  - Estado: `exportando` (spinner) + `mountReport` (monta DesempenhoReport
    inline com renderizacao condicional)
  - Handler: `setMountReport(true)` → 1 RAF wait → `querySelector('[data-pdf-root]')`
    → `gerarRelatorioIndividual(rootEl, metrics, new Date())` → toast →
    `setMountReport(false)` em finally
  - Error handling padrao CLAUDE.md: `toast.error(e instanceof Error ? e.message : 'Erro ao gerar PDF')`
- `ExportarCSVButton`:
  - Mais simples (CSV nao depende de DOM) — handler direto chama
    `gerarZipCSV` e dispara toast
- `MeDesempenhoPage`:
  - Imports adicionados; header agora contem `PeriodSelector + ExportarPDFButton + ExportarCSVButton` em flex-wrap (mobile-friendly)
  - 3 memos: `leadsDoPerfil`, `tarefasDoPerfil`, `contratosDoPerfil`
    pre-filtrados por (perfilId + periodo) — evita enviar dataset completo
    aos botoes
  - `contratosDoPerfil.map(c => ({ ...c, cliente_nome: c.cliente?.nome ?? '' }))`
    para o CSV exportar nome do cliente sem precisar lookup separado
- `GlobalSearch`:
  - Import `LayoutDashboard` adicionado a `lucide-react`
  - Nova categoria `'Páginas'` em CATEGORY_META (icon LayoutDashboard, cor cyan)
  - `STATIC_PAGES: ResultItem[]` array com entry `page-desempenho` (`/me/desempenho`)
  - Filter prepended no compose de `results` — match em label OU sublabel
- `vite.config.ts`:
  - `build.rollupOptions.output.manualChunks(id)` — funcao id-based que
    detecta `node_modules/{jspdf,html2canvas,papaparse,jszip}` e os roteia
    para chunks nomeados — A8 RESEARCH (chunks lazy verificaveis ao
    inspecionar `dist/assets/`)

## Verification results

| Check | Status | Detail |
|-------|--------|--------|
| `npx tsc --noEmit` | OK | 0 erros |
| `npm test` (Phase 8 isolado) | OK | 44 tests verdes em 6 arquivos |
| `npm run build` | OK | 4 chunks lazy nomeados em dist/assets/ |
| `dist/assets/jspdf-*.js` | OK | 343 KB |
| `dist/assets/html2canvas-*.js` | OK | 200 KB |
| `dist/assets/papaparse-*.js` | OK | 19 KB |
| `dist/assets/jszip-*.js` | OK | 96 KB |

Suite completa (`npm test` sem filtro) ainda tem 10 falhas pre-existentes
em `supabase/functions/notify-{tarefa,renovacao}/__tests__/` (Deno https
imports incompativeis com Node ESM loader) — **out of scope**, ja
documentado em `deferred-items.md` desde Plan 08-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock hoisting + top-level const reference**
- **Found during:** Task 3 — primeiro run do ExportarPDFButton.test.tsx
- **Issue:** `vi.mock(...)` e hoisted para o topo do arquivo, e o factory
  referenciava `toastSuccessMock`/`toastErrorMock` declarados com `const`
  abaixo. Vitest lancou `ReferenceError: Cannot access 'toastSuccessMock'
  before initialization` durante module load.
- **Fix:** Usar `vi.hoisted(() => ({ ... }))` para declarar os mocks no
  mesmo nivel de hoisting de `vi.mock`. Pattern padrao de Vitest moderno.
- **Files modified:** `src/components/desempenho/__tests__/ExportarPDFButton.test.tsx`
- **Commit:** 15f652f

**2. [Rule 3 - Blocker] Vite 8 manualChunks typing**
- **Found during:** Task 3 — primeiro run de `npm run build`
- **Issue:** `manualChunks: { jspdf: ['jspdf'], ... }` rejeitado por
  `tsc` com erro `Object literal may only specify known properties, and
  'jspdf' does not exist in type 'ManualChunksFunction'`. Rolldown
  (Vite 8) tipa `manualChunks` apenas como function, nao como objeto
  string-array.
- **Fix:** Reescrever como funcao id-based:
  ```ts
  manualChunks(id: string) {
    if (id.includes('node_modules/jspdf')) return 'jspdf'
    ...
  }
  ```
  Bonus: mais flexivel (consegue rotear por path arbitrario, nao so
  package root).
- **Files modified:** `vite.config.ts`
- **Commit:** 15f652f

## Decisoes-chave

- **Manual chunks function (nao objeto):** Vite 8 + Rollup tipam
  manualChunks apenas como `ManualChunksFunction`. Solucao: passar uma
  funcao que inspeciona `id` e retorna o nome do chunk. Bonus: mais
  granular que objeto.
- **pdf-export.test.ts dedicado (nao no componente):** A logica de PDF
  generation (lazy import, theme toggle, setProperties, addImage 3x,
  addPage 2x) e mais robusta de testar isoladamente em `src/lib/__tests__/`
  com vi.mock direto de `jspdf` + `html2canvas`. O teste do
  ExportarPDFButton fica focado em UX (render, click, toast).
- **vi.hoisted para mocks de fn:** Necessario quando `vi.mock(...)`
  factory referencia variaveis declaradas no escopo do arquivo. Pattern
  padrao de Vitest moderno.
- **Mount conditional via state no ExportarPDFButton:** Alternativa
  ao caller passar `rootEl` como prop. Centraliza lifecycle do
  DesempenhoReport no proprio botao, mantendo o componente desmontado
  fora do export (zero custo de render no DOM principal).
- **`requestAnimationFrame` wait apos setMountReport(true):** Garante
  que o portal foi commitado no DOM antes do `querySelector('[data-pdf-root]')`
  — React render + browser paint sao async.

## Stubs / TODO restantes

Nenhum stub remanescente para Phase 8 Plan 03. Restante da Phase 8:

- **Plan 04 (Wave 4):** Team report (`/desempenho/equipe`) que gera um
  PDF por consultor + barra de progresso usando `ProgressInfo` ja
  exportada de `pdf-export.ts`. Reaproveita 100% das libs criadas aqui.

## Threat Flags

Nenhuma surface nova nao prevista no `<threat_model>` do PLAN. Todas as
mitigations explicitas foram implementadas (T-08-01, T-08-02, T-08-03,
T-08-08).

## Self-Check: PASSED

- `src/lib/pdf-export.ts` exists: FOUND
- `src/lib/csv-export.ts` exists: FOUND
- `src/components/desempenho/ExportarPDFButton.tsx` exists: FOUND
- `src/components/desempenho/ExportarCSVButton.tsx` exists: FOUND
- `src/lib/__tests__/pdf-export.test.ts` exists: FOUND
- Commit c2ab6d1 (Task 1): FOUND
- Commit 17b3426 (Task 2): FOUND
- Commit 15f652f (Task 3): FOUND
- `dist/assets/jspdf-*.js` exists: FOUND
- `dist/assets/html2canvas-*.js` exists: FOUND
- `dist/assets/papaparse-*.js` exists: FOUND
- `dist/assets/jszip-*.js` exists: FOUND
