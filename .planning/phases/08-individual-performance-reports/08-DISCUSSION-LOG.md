# Phase 8: Individual Performance Reports - Discussion Log

> **Audit trail only.** Decisões em CONTEXT.md.

**Date:** 2026-05-28
**Phase:** 08-individual-performance-reports
**Areas discussed:** PDF library + chart strategy, Routing, Aggregation, CSV structure

---

## PDF library + chart strategy

| Option | Description | Selected |
|---|---|---|
| jspdf + html2canvas (Recomendado) | Captura DOM com recharts já desenhado → PNG → PDF. ~180KB bundle | ✓ |
| react-pdf | JSX puro pra PDF. ~80KB, mas charts precisam redo via primitives | |
| Híbrido react-pdf + SVG inline | SVG do recharts via ref → embed PDF como Image. ~120KB | |

**Notes:** jspdf+html2canvas reusa charts existentes sem redo. Pattern testado mobile.

---

## Routing

| Option | Description | Selected |
|---|---|---|
| Sub-route /me/desempenho dedicada + /me/desempenho/:perfilId (Recomendado) | Bookmarkable, share URL com coord+, MeEspacoPage permanece hub | ✓ |
| Tab "Desempenho" no MeEspacoPage | 6ª tab, coord+ via /me?perfil_id=X. Mais consistente mas URL feia | |
| /users/:id/desempenho separada | Mais polido mas convenção nova, mais router work | |

**Notes:** Sub-route limpo. Coord+ visualiza outro via :perfilId param. MeEspacoPage não muda.

---

## Aggregation

| Option | Description | Selected |
|---|---|---|
| Client-side em src/lib/desempenho.ts (Recomendado) | Helper puro, reusa hooks cached, sem migration | ✓ |
| Server RPC Postgres | desempenho_consultor(perfil_id, start, end) — migration 040 | |
| Híbrido | Client default + RPC só para team report grande | |

**Notes:** Sem migration nova. Pure helper testável. Coord+ team view itera perfis + mesmo helper.

---

## CSV structure

| Option | Description | Selected |
|---|---|---|
| 3 CSVs em ZIP único (Recomendado) | jszip + papaparse. ~95KB extra. 1 download, 3 arquivos limpos | ✓ |
| 3 botões separados (sem ZIP lib) | Sem jszip mas UX desbalanceada | |
| 1 CSV consolidado tipo + entidade_id | Analítico mas estrutura inusual | |
| 1 XLSX multi-sheet | Polido mas sheetjs ~200KB | |

**Notes:** ZIP é UX limpa. Cada CSV abre direto em Excel/Sheets.

---

## Claude's Discretion

- Off-screen rendering pattern (portal vs position fixed top -9999px)
- Loading UX durante geração PDF (modal vs progress bar inline) — recomendado modal
- Filename pattern (`desempenho_<consultor>_<periodo>.pdf`)
- Ranking sort no team report (default: leads_convertidos desc)
- Fallback NPS null = "—" no PDF
- GlobalSearch indexação `/me/desempenho`
- Forçar tema claro no PDF para legibilidade impressa
- Coord+ acessando próprio `/me/desempenho/<proprio_id>` = comportamento igual sem param

## Deferred Ideas

- Delta % vs período anterior (PROJECT.md Future Goals)
- Forecast / projeção (Phase 9)
- Drill em lead individual no PDF (estático)
- Múltiplos consultores comparativos
- KPIs custom configuráveis
- Histórico salvo de relatórios
- PDF assinado / hash integridade
- XLSX multi-sheet
- Ordenações alternativas de ranking
- Email automático
- PDF embed no portal cliente
- Dark mode no PDF
- Localização não-PT
- Comparativo anual de 12 meses
