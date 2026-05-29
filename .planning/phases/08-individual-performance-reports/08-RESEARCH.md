# Phase 8: Individual Performance Reports — Research

## RESEARCH COMPLETE

**Researched:** 2026-05-29
**Domain:** Geração client-side de PDF (com captura de DOM/charts) + bundle CSV/ZIP
**Confidence:** HIGH (todas as libs locked em CONTEXT.md já existem e foram verificadas no npm registry; padrões dominantes em 2025-2026 confirmados)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-11 — não pesquisar alternativas)

- **D-01 PDF Stack:** `jspdf@^2.5` + `html2canvas@^1.4`. Captura DOM renderizado on-screen (recharts já desenhado) → PNG → embed em PDF. Bundle ~180KB. Off-screen `position: fixed; top: -9999px`. PDF A4 portrait ~3 páginas (capa+kpis / funil+timeline / tarefas+nps).
- **D-02 Routing:** `/me/desempenho` (próprio user) + `/me/desempenho/:perfilId` (coord+ vê outros). MeEspacoPage permanece hub com tabs atuais — desempenho **não** vira tab.
- **D-03 Aggregation:** Helper puro `src/lib/desempenho.ts::calcularDesempenho({ leads, tarefas, clientes, periodo, perfilId }): DesempenhoMetricas`. Sem migration nova. Testes em `__tests__/desempenho.test.ts`.
- **D-04 CSV Export:** 3 CSVs em ZIP único — `leads.csv` + `tarefas.csv` + `contratos.csv`. `papaparse@^5.4` + `jszip@^3.10`. Filename `desempenho_<perfilNome>_<periodo>.zip`.
- **D-05 Period:** Reusa `PeriodSelector` + `PeriodValue` + `getPeriodRange()` de Phase 4.
- **D-06 Defaults:** PeriodSelector default = ano atual + `total`. Persistir em localStorage `consej_desempenho_period`.
- **D-07 Team Report (REP-04):** Botão "Exportar PDF equipe" na `/adocao` (coord+). Estrutura: capa (totais time + período + data) → 1 página por consultor ativo → sumário ranqueado. "Consultor ativo" = `role='consultor'` AND criou ≥1 lead no período. Progress bar durante geração.
- **D-08 Drill:** Row consultor na `/adocao` → `/me/desempenho/<perfilId>`. RequireRole coord+.
- **D-09 Discovery:** Sem entry nova na Sidebar. Link "Ver desempenho" em `PerfilPanel` (tab Perfil de MeEspacoPage). GlobalSearch indexa nova rota.
- **D-10 Types:** Em `src/types/index.ts` — `DesempenhoMetricas` (8 chaves numéricas + perfil ref + período ref) + `DesempenhoConsultorTeam` (perfilId + perfilNome + DesempenhoMetricas).
- **D-11 PDF Layout:** Página 1 — header (logo CONSEJ + título + nome + período) + grid 4×2 de KPI cards + footer com data. Página 2 — funil de conversão + timeline mensal. Página 3 — distribuição tarefas + ICP fit + NPS. Cores: paleta canônica `--cyan-hi` / `--emerald-mid` / `--amber-mid`.

### Claude's Discretion (pesquisado abaixo)

- Off-screen rendering pattern (portal `createPortal` vs hidden div) — recomendação abaixo
- Loading UX exato (modal central + Cancelar button para team report)
- Filename pattern final (`desempenho_<consultor_kebab>_<periodo>.pdf`)
- Sort default do ranking team report (por `leads_convertidos` desc)
- Fallback NPS undefined: exibir `—` (não 0)
- GlobalSearch indexação `/me/desempenho` (verificar PageIndex)
- Tema dark/light no PDF: forçar light durante captura
- Coord+ acessando `/me/desempenho/:proprio_perfilId`: mesmo render que `/me/desempenho` sem param

### Deferred Ideas (OUT OF SCOPE)

Comparação delta % vs período anterior; forecast; drill em lead no PDF; múltiplos consultores comparados na mesma view; KPIs custom configuráveis; histórico salvo de relatórios; PDF assinado/hash; XLSX multi-sheet; sort por win_rate/NPS no ranking; email automático; PDF no portal cliente; dark mode no PDF; localização não-pt-BR; relatório anual com 12 meses comparativo.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REP-01 | `/me/desempenho` com 8 métricas | Reuso de `useLeads` + `useTarefas` + `useClientes` + helper puro `calcularDesempenho` agregando 8 valores; PeriodSelector canônico para filtro. Padrão de KPI cards 4×2 já existe (`DashboardPage`). |
| REP-02 | Exportar PDF individual via jspdf + html2canvas | Pattern off-screen + html2canvas → addImage → addPage. SVG do recharts **é suportado** por html2canvas 1.4 (recharts renderiza SVG vetorial; a issue conhecida é `isAnimationActive={false}` durante captura). |
| REP-03 | Exportar CSV = 3 CSVs em ZIP (leads/tarefas/contratos) | `papaparse.unparse(rows)` → string → `jszip.file(name, content).generateAsync({type:'blob'})` → URL.createObjectURL → download. UTF-8 BOM para Excel PT-BR. |
| REP-04 | Coord+ exporta PDF consolidado da equipe a partir de `/adocao` | Itera perfis ativos, monta `DesempenhoConsultorTeam[]`, renderiza off-screen por consultor (sequencial para limitar memória), anexa páginas. Progress bar + AbortController para cancelar. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- `package-lock.json` **nunca** lido com `Read` (~92k tokens) — usar Glob/Grep para inspecionar deps; versão via `package.json`.
- Stack mandatório: TypeScript + Vite + TanStack Query v5 + shadcn/ui + Radix + zod + react-hook-form + Supabase. **npm**, não bun.
- PT-BR para UI e mensagens visíveis; código (variáveis, commits) em inglês — mas domínio CONSEJ mantém PT-BR (`responsavel_id`, `desempenho`, etc., alinhado ao schema).
- Hooks via TanStack: `useXxx.ts`; mutations `useCreateXxx`/`useUpdateXxx`.
- Tipos centralizados em `src/types/index.ts` — não duplicar.
- Named exports apenas (`export default` reservado para configs Tailwind/Vite).
- Indentação 2 espaços, single quotes, sem semicolons (exceto primitivos shadcn que mantêm upstream style).
- Componentes shadcn em `src/components/ui/` (kebab-case); features em PascalCase.
- Migrations imutáveis e sequenciais — Phase 8 **não tem migration** (D-03 confirma).
- Forçar `legacy-peer-deps=true` (já em `.npmrc`) — React 19 vs peers React 18.
- Nunca commitar `.env` / chaves de API.
- **Sem hand-roll de problemas resolvidos** — usar libs locked (jspdf, html2canvas, papaparse, jszip).

---

## Summary

Phase 8 adiciona dois fluxos de exportação **100% client-side, zero backend novo**:

1. **PDF individual de desempenho** — Consultor vai a `/me/desempenho`, escolhe período, clica "Exportar PDF" → gera A4 portrait ~3 páginas via captura DOM (html2canvas) → embed em jspdf → download. Coord+ pode ver outros via `/me/desempenho/:perfilId`.
2. **CSV bundle** — 3 CSVs (leads/tarefas/contratos do consultor no período) em ZIP único.
3. **Team PDF (coord+)** — Botão em `/adocao` itera consultores ativos, gera 1 página por consultor + capa + sumário ranqueado. Progress bar com cancelamento.

A complexidade real está em **três landmines técnicos**:
- **html2canvas + SVG (recharts):** Funciona, mas precisa de `isAnimationActive={false}` em todos os charts dentro da área capturada e renderizar em viewport de tamanho fixo (794px = A4 portrait). Animations ativos causam captura parcial/quadros vazios.
- **Memory iOS Safari:** Team report com 10+ consultores em iPhone (limite ~100MB heap) — risco de crash. Mitigação: gerar sequencial (não paralelo), liberar canvas entre páginas (`canvas.width = 0`), fallback message em mobile recomendando desktop.
- **Tema dark durante captura:** O CRM roda em dark mode por default (`html.dark`). PDF deve sair em light para legibilidade impressa. Toggle temporário do classe `dark`/`light` no `<html>` antes de capturar, restaurar no `finally`.

**Primary recommendation:** Use o **wrapper pattern centralizado** — `src/lib/pdf-export.ts` expõe `gerarRelatorioIndividual(ref, metrics)` / `gerarRelatorioEquipe(refs, totais, onProgress, signal)`; `src/lib/csv-export.ts` expõe `gerarZipCSV(perfil, periodo, leads, tarefas, contratos)`. Componente off-screen `<DesempenhoReportRenderer />` em portal monta as 3 páginas com `data-pdf-page="1|2|3"` para captura individual. Helper puro `calcularDesempenho` testado com fixtures determinísticas. **Lazy import** das libs pesadas via `await import('jspdf')` para manter bundle inicial limpo (~180KB carregados só no primeiro export).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Carregar dados (leads/tarefas/clientes/perfis) | API/Backend (Supabase) | Browser (TanStack cache) | RLS no Postgres + hooks já existem; helper agrega em memória |
| Agregar 8 métricas | Browser (pure helper `src/lib/desempenho.ts`) | — | Determinístico, testável, sem network |
| Renderizar `/me/desempenho` (charts visíveis) | Browser | — | Recharts no DOM |
| Renderizar off-screen para captura PDF | Browser (portal) | — | DOM real renderizado fora do viewport |
| Capturar DOM → canvas → PNG | Browser (html2canvas) | — | Lib pura client-side |
| Construir PDF multi-página | Browser (jspdf) | — | `addImage` + `addPage`; sem servidor |
| Serializar CSV | Browser (papaparse) | — | `unparse` em-memória |
| Empacotar ZIP | Browser (jszip) | — | `generateAsync` em-memória |
| Disparar download | Browser (Blob + `URL.createObjectURL` + `<a download>`) | — | Padrão web |
| RequireRole gate (`:perfilId`) | Browser (RequireRole) | API/Backend (RLS) | Defesa em profundidade — Supabase RLS recusa se consultor tentar ver outro |
| Indexar `/me/desempenho` no Cmd+K | Browser (`GlobalSearch`) | — | Component side-effect / config local |

---

## Standard Stack

### Core (locked em CONTEXT.md — não negociar)

| Library | Version | Latest verified (2026-05-29) | Purpose | Source |
|---------|---------|------------------------------|---------|--------|
| `jspdf` | `^2.5` | `4.2.1` (npm; published 2026-03-17) | PDF document creation (`new jsPDF`, `addImage`, `addPage`, `save`) | [VERIFIED: npm view jspdf version]; [CITED: github.com/parallax/jsPDF] |
| `html2canvas` | `^1.4` | `1.4.1` (npm; published 2025-11-13) | DOM → canvas → PNG dataURL | [VERIFIED: npm view html2canvas version]; [CITED: html2canvas.hertzen.com] |
| `papaparse` | `^5.4` | `5.5.3` (npm; published 2025-05-19) | CSV serialization (`unparse`) com escape robusto | [VERIFIED: npm view papaparse version]; [CITED: papaparse.com] |
| `jszip` | `^3.10` | `3.10.1` (npm; published 2025-03-14) | ZIP archive builder client-side | [VERIFIED: npm view jszip version]; [CITED: stuk.github.io/jszip] |

> **Note on D-01 version range:** CONTEXT.md locked `jspdf@^2.5`. A última versão atual no npm é `4.2.1` (major bumps em 3.x e 4.x adicionaram nativo ESM e mudanças de API). O planner deve confirmar com o usuário antes de fixar: **(a)** seguir literal o `^2.5` (LTS estável, mais documentação online, ~2.5.2 disponível); **(b)** atualizar para `^4.2` (mais novo, ESM-first, melhor árvore-shaking). **Recomendação:** se planner segue D-01 literal → usar `jspdf@^2.5.2` (latest no range 2.x). Se quiser revisitar, registrar como question aberta. [ASSUMED: minor risk]

### Already in the codebase (reutilizar)

| Library | Version | Use in Phase 8 |
|---------|---------|----------------|
| `recharts` | `^3.8.0` | LineChart + BarChart para os 4 gráficos D-11 |
| `@tanstack/react-query` | `^5.90` | `useLeads`/`useTarefas`/`useClientes` já cacheiam — helper roda em cima |
| `date-fns` + `date-fns/locale/ptBR` | `^4.1.0` | Formatação datas no PDF e CSV |
| `react-router-dom` | `^7.13` | 2 rotas novas em `src/router.tsx` |
| `lucide-react` | `^0.577` | Ícones header PDF + buttons |
| `sonner` | `^2.0.7` | Toast erro/sucesso |
| `zod` | `^4.3` | (Opcional) validação de input dos selects |

### Installation

```bash
npm install jspdf@^2.5 html2canvas@^1.4 papaparse@^5.4 jszip@^3.10
npm install -D @types/papaparse
```

> `@types/jszip` **não** necessário — jszip ships types desde 3.10. `jspdf` e `html2canvas` também shipam types embutidos. Apenas papaparse precisa de `@types/papaparse@^5.3` em devDeps. [VERIFIED: npm registry]

### Alternatives Considered (rejeitadas por CONTEXT.md ou tradeoff)

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| `jspdf + html2canvas` | `react-pdf` (`@react-pdf/renderer`) | react-pdf usa React tree própria (Page/Text/View) — recharts não renderiza dentro; teria que reimplementar charts em SVG primitivo. CONTEXT D-01 já decidiu jspdf+html2canvas. |
| `html2canvas@1.4` | `html2canvas-pro@2.0.4` | html2canvas-pro é fork ativo que cobre oklch() colors e funções CSS modernas. **Não usar** porque CONTEXT D-01 fixa `html2canvas` original e o CRM CONSEJ não usa oklch. Manter o que está locked. |
| ZIP com 3 CSVs | XLSX multi-sheet (`xlsx`/`exceljs`) | CONTEXT D-04 escolheu ZIP. xlsx adiciona ~400KB. Excel abre CSV nativamente. Deferred indefinidamente. |
| Helper client-side | Edge Function agregando server-side | CONTEXT D-03 escolheu client-side (zero migration, zero edge function nova). Dados já estão no cache do TanStack. |

---

## Package Legitimacy Audit

> slopcheck rodado 2026-05-29 — todos os 4 pacotes passaram `[OK]`. Verificação cruzada manual abaixo.

| Package | Registry | Latest version | Last publish | Source repo | Postinstall script | slopcheck | Disposition |
|---------|----------|----------------|--------------|-------------|--------------------|-----------|-------------|
| `jspdf` | npm | 4.2.1 | 2026-03-17 | github.com/parallax/jsPDF | none | [OK] | Approved |
| `html2canvas` | npm | 1.4.1 | 2025-11-13 | github.com/niklasvh/html2canvas | none | [OK] | Approved |
| `papaparse` | npm | 5.5.3 | 2025-05-19 | github.com/mholt/PapaParse | none | [OK] | Approved |
| `jszip` | npm | 3.10.1 | 2025-03-14 | github.com/Stuk/jszip | none | [OK] | Approved |
| `@types/papaparse` | npm | latest (devDep) | DefinitelyTyped (community-maintained) | none/community | [OK] (assumed clean — DT) | Approved |

**Pacotes removidos por slopcheck [SLOP]:** nenhum
**Pacotes flagados [SUS]:** nenhum
**Cross-ecosystem confusion check:** todos os 4 nomes são pacotes JavaScript bem estabelecidos (não há colisão Python/Rust). [VERIFIED: npm registry]
**Postinstall:** nenhum dos 4 tem `scripts.postinstall` (confirmado via `npm view <pkg> scripts.postinstall`). Sem vetor de execução remota durante install. [VERIFIED: npm view]

---

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────────────────────────────────────────────┐
                │ Browser SPA (React 19 + Vite + TanStack Query)   │
                │                                                  │
   user click   │  ┌────────────────────┐                          │
   "Exportar"   │  │ DesempenhoPage     │  PeriodSelector value    │
   ───────────▶ │  │ /me/desempenho     │  ─────────────▶          │
                │  │ (+/:perfilId)      │                          │
                │  └────────┬───────────┘                          │
                │           │ chama                                │
                │           ▼                                      │
                │  ┌────────────────────┐  pure agg                │
                │  │ calcularDesempenho │ ◀─── leads/tarefas/      │
                │  │ (src/lib/...)      │      clientes (cache)    │
                │  └────────┬───────────┘                          │
                │           │ DesempenhoMetricas                   │
                │           ▼                                      │
                │  ┌────────────────────┐  REP-01 view             │
                │  │ KPI grid + charts  │  (visible to user)       │
                │  │ (4×2 + recharts)   │                          │
                │  └────────┬───────────┘                          │
                │           │ "Exportar PDF" / "CSV"               │
                │           ▼                                      │
                │  ┌────────────────────────────────────────────┐  │
                │  │  Lazy import (dynamic): jspdf + html2canvas │  │
                │  │  OR papaparse + jszip                       │  │
                │  └────────────┬───────────────────────────────┘  │
                │               │                                  │
                │   ┌───────────┴────────────┐                     │
                │   ▼                        ▼                     │
                │  PDF flow:                CSV flow:              │
                │  ┌──────────────────┐   ┌──────────────────┐    │
                │  │ Portal off-      │   │ papaparse.       │    │
                │  │ screen mount:    │   │ unparse() ×3     │    │
                │  │ <DesempenhoReport│   │ → strings        │    │
                │  │  Renderer/>      │   └────────┬─────────┘    │
                │  │ (3 pages, 794px) │            ▼              │
                │  └────────┬─────────┘   ┌──────────────────┐    │
                │           ▼             │ jszip.file()×3 + │    │
                │  ┌──────────────────┐   │ generateAsync()  │    │
                │  │ Force light theme│   │ → Blob           │    │
                │  │ (toggle .dark)   │   └────────┬─────────┘    │
                │  └────────┬─────────┘            │              │
                │           ▼                      │              │
                │  ┌──────────────────┐            │              │
                │  │ html2canvas(el)  │            │              │
                │  │ →  Promise<canvas│            │              │
                │  └────────┬─────────┘            │              │
                │           ▼                      │              │
                │  ┌──────────────────┐            │              │
                │  │ canvas.toDataURL │            │              │
                │  │ ("image/png")    │            │              │
                │  └────────┬─────────┘            │              │
                │           ▼                      │              │
                │  ┌──────────────────┐            │              │
                │  │ jsPDF: addImage  │            │              │
                │  │ + addPage ×N     │            │              │
                │  └────────┬─────────┘            │              │
                │           ▼                      ▼              │
                │  ┌──────────────────────────────────────┐       │
                │  │  Blob → URL.createObjectURL          │       │
                │  │  → <a download> click → revokeURL    │       │
                │  └──────────────────────────────────────┘       │
                │           ▼                                     │
                │   File saved (PDF or ZIP)                       │
                └─────────────────────────────────────────────────┘
                                ▲
                                │ Supabase REST (RLS)
                                │
                  ┌─────────────┴──────────────┐
                  │ Supabase PostgreSQL        │
                  │ leads / tarefas / clientes │
                  │ / perfis (RLS gates)       │
                  └────────────────────────────┘
```

### Recommended Project Structure (delta only)

```
src/
├── lib/
│   ├── desempenho.ts             # NEW — pure helper calcularDesempenho
│   ├── desempenho-period.ts      # NEW (small) — load/save period in localStorage
│   ├── pdf-export.ts             # NEW — gerarRelatorioIndividual / gerarRelatorioEquipe
│   ├── csv-export.ts             # NEW — gerarZipCSV(leads, tarefas, contratos, ...)
│   ├── slug.ts                   # NEW (tiny) — slugify PT-BR (extract from BlocoEditorModal)
│   └── __tests__/
│       ├── desempenho.test.ts    # NEW — unit tests com fixtures
│       └── slug.test.ts          # NEW
├── components/
│   └── desempenho/               # NEW folder
│       ├── DesempenhoReportRenderer.tsx   # off-screen 3-page A4 render
│       ├── DesempenhoKpiGrid.tsx          # 4×2 KPI cards (visível e no PDF)
│       ├── DesempenhoFunilChart.tsx       # recharts BarChart
│       ├── DesempenhoTimelineChart.tsx    # recharts LineChart 12 meses
│       ├── DesempenhoTarefasChart.tsx     # recharts BarChart por status
│       ├── ProgressTeamReportModal.tsx    # Dialog com progress bar + Cancelar
│       └── ExportButtons.tsx              # botão PDF + botão CSV
├── pages/
│   ├── DesempenhoPage.tsx        # NEW — /me/desempenho [/:perfilId]
│   ├── AdocaoPage.tsx            # EDIT — adiciona "Exportar PDF equipe" + drill
│   └── MeEspacoPage.tsx          # EDIT — link "Ver desempenho" no PerfilPanel
└── components/me/
    └── PerfilPanel.tsx           # EDIT — link "Ver desempenho"
```

### Pattern 1: Helper puro determinístico (`calcularDesempenho`)

**What:** Função pura sem side-effects que recebe dados já filtrados/disponíveis (via TanStack cache) e retorna `DesempenhoMetricas`. Filtragem por período e perfilId acontece **dentro** do helper para testabilidade.

**When to use:** Sempre — D-03 locked.

**Signature recomendada:**

```typescript
// src/lib/desempenho.ts
import type { Lead, Tarefa, Cliente } from '@/types'
import type { PeriodValue } from './periods'
import { getPeriodRange, isInRange } from './periods'
import { TERMINAL_WON_STAGES, TERMINAL_LOST_STAGES } from './constants'
import { calcularIcpDinamico, buildIcpFitContext, isLeadIcpFit } from './icp-dinamico'

export interface DesempenhoMetricas {
  perfilId: string
  perfilNome: string
  periodo: PeriodValue
  leads_criados: number
  convertidos: number
  perdidos: number
  ciclo_medio_dias: number | null  // null se nenhum ganho
  win_rate: number                  // 0-100
  icp_fit_medio: number | null      // % leads com ICP fit; null se sem leads
  tarefas_concluidas: number
  nps_medio: number | null          // 0-10; null se nenhum cliente com NPS
}

export interface CalcularDesempenhoInput {
  leads: Lead[]
  tarefas: Tarefa[]
  clientes: Cliente[]
  perfilId: string
  perfilNome: string
  periodo: PeriodValue
  // contexto ICP pré-computado (servicosConfig vem de useConfiguracoes)
  servicosConfig: Array<{ id: string; segmentos_icp?: string[]; investimento_icp?: string[] }>
}

export function calcularDesempenho(input: CalcularDesempenhoInput): DesempenhoMetricas {
  const { leads, tarefas, clientes, perfilId, perfilNome, periodo, servicosConfig } = input
  const range = getPeriodRange(periodo)

  // Filtros básicos
  const leadsPerfil = leads.filter(
    l => l.responsavel_id === perfilId && isInRange(l.created_at, range),
  )
  const ganhos    = leadsPerfil.filter(l => (TERMINAL_WON_STAGES as readonly string[]).includes(l.status))
  const perdas    = leadsPerfil.filter(l => (TERMINAL_LOST_STAGES as readonly string[]).includes(l.status))
  const tarefasPerfil = tarefas.filter(
    t => t.atribuido_a_id === perfilId
      && t.status === 'concluida'
      && t.data_conclusao
      && isInRange(t.data_conclusao, range),
  )
  const clientesPerfil = clientes.filter(
    // NOTE: schema cliente não tem responsavel_id direto — verificar se via contratos.responsavel_id ou outro campo
    // Plan-checker deve validar: pode requerer JOIN no SQL ou mudança de modelo.
    c => typeof c.nps_score === 'number',
  )

  // Ciclo médio (apenas ganhos com >= 1d)
  const ciclos = ganhos
    .map(l => Math.floor((new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 86400000))
    .filter(d => d >= 1)
  const ciclo_medio_dias = ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null

  // Win rate
  const fechados = ganhos.length + perdas.length
  const win_rate = fechados > 0 ? Math.round((ganhos.length / fechados) * 100) : 0

  // ICP fit médio — % dos leads do perfil que batem fit
  const servicoIds = servicosConfig.map(s => s.id)
  const observados = calcularIcpDinamico(leads, periodo, servicoIds)
  const ctx = buildIcpFitContext(observados, servicosConfig)
  const fitCount = leadsPerfil.filter(l => isLeadIcpFit(l, ctx)).length
  const icp_fit_medio = leadsPerfil.length > 0 ? Math.round((fitCount / leadsPerfil.length) * 100) : null

  // NPS médio
  const nps_medio = clientesPerfil.length > 0
    ? Math.round((clientesPerfil.reduce((s, c) => s + (c.nps_score as number), 0) / clientesPerfil.length) * 10) / 10
    : null

  return {
    perfilId,
    perfilNome,
    periodo,
    leads_criados: leadsPerfil.length,
    convertidos: ganhos.length,
    perdidos: perdas.length,
    ciclo_medio_dias,
    win_rate,
    icp_fit_medio,
    tarefas_concluidas: tarefasPerfil.length,
    nps_medio,
  }
}
```

> **Source:** Pattern derivado de `src/lib/icp-dinamico.ts` (helper puro) + `AnalyticsPage.tsx::metrics` (cálculos agregados em memória). [VERIFIED: codebase grep]

> **Open question for planner:** Como obter "clientes do perfil"? O tipo `Cliente` em `src/types/index.ts:52-70` **não tem** `responsavel_id`. As opções: (a) via `contratos.responsavel_id` → cliente_id → cliente; (b) via `lead_id` → lead.responsavel_id (mas cliente pode existir sem lead); (c) acrescentar campo no schema. **Decisão**: deferir ao discuss-phase ou usar (a) — o `Contrato.responsavel_id` existe (`src/types/index.ts:87`). [ASSUMED: planner deve confirmar com user]

### Pattern 2: Off-screen render via React Portal (recomendação para D-01)

**What:** Componente `<DesempenhoReportRenderer>` montado num portal `createPortal(node, document.body)` com `position: fixed; top: -9999px; left: -9999px; width: 794px; pointer-events: none`. Recharts renderiza com SVG visível dentro deste container fora do viewport. html2canvas captura, depois desmonta.

**When to use:** Sempre para PDF — D-01 + Claude's Discretion locked.

**Por que portal e não hidden div:**
- `display: none` ou `visibility: hidden` quebra recharts (não calcula tamanhos)
- `opacity: 0` + position absolute funciona, mas pode causar repaint flicker se algo causa re-layout
- Portal fora do tree de layout impede que CSS pai (transforms, overflow) influencie renderização
- Mais limpo para AbortController desmontar com `setVisible(false)` reverte estado

**Skeleton recomendado:**

```typescript
// src/components/desempenho/DesempenhoReportRenderer.tsx
import { createPortal } from 'react-dom'
import type { DesempenhoMetricas } from '@/lib/desempenho'

const A4_PT_WIDTH = 794  // 210mm @ 96dpi
const A4_PT_HEIGHT = 1123 // 297mm @ 96dpi

interface Props {
  metrics: DesempenhoMetricas
  // ... outros dados (timeline mensal, distribuição tarefas, etc.)
}

export function DesempenhoReportRenderer({ metrics }: Props) {
  return createPortal(
    <div
      // identificadores para html2canvas localizar
      data-pdf-root
      style={{
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: `${A4_PT_WIDTH}px`,
        pointerEvents: 'none',
        background: 'white',
        color: '#0d1929',
      }}
    >
      <div data-pdf-page="1" style={{ width: A4_PT_WIDTH, height: A4_PT_HEIGHT, padding: 40 }}>
        {/* Header + KPI grid 4×2 */}
      </div>
      <div data-pdf-page="2" style={{ width: A4_PT_WIDTH, height: A4_PT_HEIGHT, padding: 40 }}>
        {/* Funil + Timeline — recharts com isAnimationActive={false} */}
      </div>
      <div data-pdf-page="3" style={{ width: A4_PT_WIDTH, height: A4_PT_HEIGHT, padding: 40 }}>
        {/* Tarefas + ICP fit + NPS */}
      </div>
    </div>,
    document.body,
  )
}
```

> **CRITICAL:** Charts recharts dentro do portal **precisam** receber `isAnimationActive={false}` em LineChart/BarChart/Pie. Caso contrário html2canvas captura frame intermediário da animação ou frame vazio. [CITED: github.com/niklasvh/html2canvas#1757]

### Pattern 3: Multi-page A4 portrait PDF skeleton

**What:** Itera os 3 `data-pdf-page` containers, captura cada um com html2canvas, embute como PNG full-page no jsPDF.

**Why:** Mais previsível que `jspdf.html()` autopaging (que sofre com elementos grandes e tem performance pior para 3 pages discretas). Permite controle exato de margins per página.

```typescript
// src/lib/pdf-export.ts
import type { DesempenhoMetricas } from './desempenho'
import { slugify } from './slug'
import { formatPeriodLabel } from './periods'

const A4_MM_W = 210
const A4_MM_H = 297

export async function gerarRelatorioIndividual(
  rootEl: HTMLElement,
  metrics: DesempenhoMetricas,
): Promise<void> {
  // Lazy import — não impactar bundle inicial
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  // Force light theme para captura
  const html = document.documentElement
  const wasDark = html.classList.contains('dark')
  if (wasDark) { html.classList.remove('dark'); html.classList.add('light') }

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pages = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-pdf-page]'))

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,             // retina; PNG fica nítido
        backgroundColor: '#ffffff',
        useCORS: true,        // logos remotos
        logging: false,
        // imageTimeout: 0,   // só se houver imgs lentas
      })
      const imgData = canvas.toDataURL('image/png')
      if (i > 0) pdf.addPage('a4', 'portrait')
      pdf.addImage(imgData, 'PNG', 0, 0, A4_MM_W, A4_MM_H, undefined, 'FAST')

      // Liberar memória entre páginas (importante para iOS team report)
      canvas.width = 0
      canvas.height = 0
    }

    const periodo = formatPeriodLabel(metrics.periodo).replace(/\s+/g, '')
    const filename = `desempenho_${slugify(metrics.perfilNome)}_${periodo}.pdf`
    pdf.save(filename)
  } finally {
    if (wasDark) { html.classList.remove('light'); html.classList.add('dark') }
  }
}
```

> **Source:** Pattern multi-page jsPDF manual derivado de [PHPpot — Converting HTML into Multi-page PDF](https://phppot.com/javascript/jspdf-html-example/). React 19 não muda nada — é DOM puro durante a captura. [CITED: phppot.com]

### Pattern 4: Team PDF com progress + AbortController (D-07)

```typescript
// src/lib/pdf-export.ts (continued)
export interface ProgressInfo { current: number; total: number; consultorNome: string }

export async function gerarRelatorioEquipe(
  consultoresAtivos: Array<{ perfilId: string; perfilNome: string; metrics: DesempenhoMetricas }>,
  totaisEquipe: DesempenhoMetricas, // agregado do time todo
  renderEm: (metrics: DesempenhoMetricas) => Promise<HTMLElement>, // monta off-screen, espera render, retorna rootEl
  onProgress: (info: ProgressInfo) => void,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  const html = document.documentElement
  const wasDark = html.classList.contains('dark')
  if (wasDark) { html.classList.remove('dark'); html.classList.add('light') }

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // 1) Capa com totais
    const capaEl = await renderEm(totaisEquipe)
    await capturarPagina(html2canvas, pdf, capaEl, /* addPage = */ false)

    // 2) 1 página per consultor (sequencial)
    for (let i = 0; i < consultoresAtivos.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const c = consultoresAtivos[i]
      onProgress({ current: i + 1, total: consultoresAtivos.length, consultorNome: c.perfilNome })
      const el = await renderEm(c.metrics)
      // Para cada consultor capturamos só a página 1 (resumo) — ajustar conforme D-11
      await capturarPagina(html2canvas, pdf, el, /* addPage = */ true)
    }

    // 3) Sumário ranqueado (já calculado)
    // ... append a final page

    pdf.save(`desempenho_equipe_${formatPeriodLabel(totaisEquipe.periodo)}.pdf`)
  } finally {
    if (wasDark) { html.classList.remove('light'); html.classList.add('dark') }
  }
}

async function capturarPagina(
  html2canvas: any,
  pdf: any,
  rootEl: HTMLElement,
  addPage: boolean,
) {
  const canvas = await html2canvas(rootEl, { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false })
  if (addPage) pdf.addPage('a4', 'portrait')
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  canvas.width = 0; canvas.height = 0
}
```

**UI side (component):**

```tsx
// src/components/desempenho/ProgressTeamReportModal.tsx
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

export function ProgressTeamReportModal({ open, current, total, consultorNome, onCancel }: Props) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle>Gerando relatório da equipe</DialogTitle>
        <Progress value={(current / total) * 100} />
        <p className="text-sm text-muted-foreground">
          {current} / {total} consultores · {consultorNome}
        </p>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </DialogContent>
    </Dialog>
  )
}
```

Page consumer:

```typescript
const controllerRef = useRef<AbortController | null>(null)
async function handleExportTeam() {
  const controller = new AbortController()
  controllerRef.current = controller
  try {
    await gerarRelatorioEquipe(consultoresAtivos, totaisEquipe, renderEm, setProgress, controller.signal)
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') toast('Geração cancelada')
    else toast.error('Erro ao gerar PDF da equipe')
  }
}
function handleCancel() { controllerRef.current?.abort() }
```

### Pattern 5: CSV + ZIP skeleton (D-04)

```typescript
// src/lib/csv-export.ts
import type { Lead, Tarefa, Contrato, Cliente } from '@/types'
import { format } from 'date-fns'

const UTF8_BOM = '﻿'  // Excel PT-BR abre corretamente com BOM

interface ZipInput {
  perfilNome: string
  periodo: { label: string }  // formatado para filename
  leads: Lead[]
  tarefas: Tarefa[]
  contratos: Array<Contrato & { cliente_nome?: string }>
}

export async function gerarZipCSV(input: ZipInput): Promise<void> {
  // Lazy
  const [{ default: Papa }, { default: JSZip }] = await Promise.all([
    import('papaparse'),
    import('jszip'),
  ])

  const zip = new JSZip()

  const leadsCsv = UTF8_BOM + Papa.unparse(
    input.leads.map(l => ({
      nome: l.nome,
      empresa: l.empresa,
      segmento: l.segmento,
      status: l.status,
      investimento_estimado: l.investimento_estimado ?? '',
      created_at: l.created_at,
      updated_at: l.updated_at,
      motivo_perda: l.motivo_perda ?? '',
    })),
    { quotes: true },  // força aspas — previne CSV injection parcial
  )
  zip.file('leads.csv', leadsCsv)

  const tarefasCsv = UTF8_BOM + Papa.unparse(
    input.tarefas.map(t => ({
      titulo: sanitizeCell(t.titulo),
      status: t.status,
      data_vencimento: t.data_vencimento ?? '',
      criado_em: t.created_at,
      concluida_em: t.data_conclusao ?? '',
    })),
    { quotes: true },
  )
  zip.file('tarefas.csv', tarefasCsv)

  const contratosCsv = UTF8_BOM + Papa.unparse(
    input.contratos.map(c => ({
      cliente_nome: sanitizeCell(c.cliente_nome ?? ''),
      modelo_precificacao: c.modelo_precificacao,
      valor_total: c.valor_total ?? '',
      valor_mensal: c.valor_mensal ?? '',
      status: c.status,
      created_at: c.created_at,
    })),
    { quotes: true },
  )
  zip.file('contratos.csv', contratosCsv)

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `desempenho_${slugify(input.perfilNome)}_${input.periodo.label}.zip`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// CSV injection mitigation — prefix dangerous leading chars
function sanitizeCell(value: string): string {
  if (value.length === 0) return value
  const first = value[0]
  if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r') {
    return `'${value}`
  }
  return value
}
```

### Pattern 6: Force light theme during capture

Already shown in Pattern 3 (the `wasDark` toggle in `finally`). Critical for the CRM CONSEJ which runs dark mode by default (see `src/contexts/ThemeContext.tsx`). The theme provider uses CSS classes on `<html>` — toggling externally is safe (provider doesn't observe DOM mutations). Toast/sonner during PDF generation will briefly flash light — acceptable.

### Pattern 7: Filename slugification

The codebase **already has** a slugify helper in `src/components/mensagens/BlocoEditorModal.tsx:32-40` but it's **private** to that file. Extract to `src/lib/slug.ts`:

```typescript
// src/lib/slug.ts
export function slugify(input: string, maxLen = 48): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics — fixed from BlocoEditorModal's broken range
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
}
```

> **CRITICAL fix:** O regex em `BlocoEditorModal.tsx:35` é `/[̀-ͯ]/g` — mas isso é os chars literais de combining marks; no source code aparece como `̀-ͯ`. Quando o helper for extraído, escrever o range em escape hex para legibilidade e portabilidade entre editors. [VERIFIED: codebase grep]

### Pattern 8: Period defaults + localStorage hydration

```typescript
// src/lib/desempenho-period.ts
import { getCurrentYear, type PeriodValue } from './periods'

const KEY = 'consej_desempenho_period'

export function loadPeriod(): PeriodValue {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { year: getCurrentYear(), granularity: 'total' }
    const parsed = JSON.parse(raw) as PeriodValue
    if (typeof parsed.year === 'number' && typeof parsed.granularity === 'string') return parsed
  } catch { /* fall through */ }
  return { year: getCurrentYear(), granularity: 'total' }
}

export function savePeriod(v: PeriodValue): void {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore quota */ }
}
```

Use in page:

```tsx
const [period, setPeriod] = useState<PeriodValue>(() => loadPeriod())
useEffect(() => { savePeriod(period) }, [period])
```

> **Hydration safety:** Vite SPA não tem SSR, então `localStorage` em `useState` initializer é seguro. Não precisa pattern de `useEffect` to defer initial read.

### Pattern 9: CSV column choices (PT-BR headers + ISO dates)

Headers em português (acessível para coord+ em Excel). Dates em ISO 8601 — Excel reconhece e permite reformat. Boolean fields como "sim"/"não".

| File | Columns (em ordem) | Source |
|------|--------------------|--------|
| `leads.csv` | `nome, empresa, segmento, status, investimento_estimado, created_at, updated_at, motivo_perda, icp_fit` | `Lead` |
| `tarefas.csv` | `titulo, status, prioridade, data_vencimento, criado_em, concluida_em` | `Tarefa` |
| `contratos.csv` | `cliente_nome, modelo_precificacao, valor_total, valor_mensal, status, data_inicio, data_fim` | `Contrato` |

> **icp_fit no leads.csv:** booleano calculado on-the-fly via `isLeadIcpFit(l, ctx)`. Útil para coord+ filtrar no Excel.

### Pattern 10: Mobile graceful degradation

iOS Safari tem **hard memory limit** ~100-200MB para tab; team report com 10 consultores × 3 páginas × scale 2 = canvas grande. Estratégia:

```typescript
// Detect iOS (rough)
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

// Em AdocaoPage handler de "Exportar PDF equipe":
if (isIOS() && consultoresAtivos.length > 5) {
  toast.warning('Relatório da equipe é pesado em iPhone. Recomendamos usar desktop.', {
    duration: 6000,
    action: { label: 'Tentar mesmo assim', onClick: () => prosseguir() },
  })
  return
}
prosseguir()
```

PDF individual (3 páginas) **funciona bem em iOS** — testar uma vez no UAT mas baixo risco.

### Pattern 11: Lazy import strategy (Vite tree-shaking)

Todas as 4 libs (jspdf ~155KB, html2canvas ~140KB, papaparse ~45KB, jszip ~45KB) **devem ser dynamic imports** dentro dos handlers de export. Vite gera chunks separados automaticamente — bundle inicial fica limpo. Pattern já usado em `src/lib/pdf-export.ts:gerarRelatorioIndividual` acima:

```typescript
const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
  import('jspdf'),
  import('html2canvas'),
])
```

Vite cria chunks `jspdf-<hash>.js` e `html2canvas-<hash>.js` lazy-loaded. Verificar com `npm run build` e observar tamanho do output. [CITED: vitejs.dev/guide/features#dynamic-import]

### Anti-Patterns to Avoid

- **Render PDF dentro do componente visível** — flash UI durante captura; user vê tela mexer. Use portal off-screen.
- **`isAnimationActive={true}` em charts capturados** — html2canvas pega frame intermediário ou vazio. Sempre off em renderer.
- **Captura paralela em team report** — 10 canvas simultâneos esgotam memória em mobile. Sequencial + liberar canvas entre cada.
- **`autoPaging: true` em jsPDF.html()** — autopaging é frágil para layouts complexos com SVG. Use captura per-page manual.
- **CSV sem UTF-8 BOM** — Excel PT-BR abre como ANSI e quebra acentos. Sempre prefixar `﻿`.
- **CSV sem `quotes: true` em papaparse** — campos com vírgula viram colunas extra. Forçar aspas.
- **Filename direto do nome do user** — pode conter `/` `\` `:` que quebram Windows. Sempre slugify.
- **Esquecer de revogar `URL.createObjectURL`** — memory leak. Sempre `URL.revokeObjectURL(url)` após `<a>.click()`.
- **Não forçar light theme** — PDF em dark fica ilegível impresso.
- **Bundle estático** dos 4 packs — bundle inicial salta ~380KB para feature usada raramente. Sempre lazy.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Canvas API + manual layout | `jspdf` | Multi-page + image embed + fonts é massivo de implementar |
| DOM → image | Manual `getBoundingClientRect` + foreignObject SVG | `html2canvas` | SVG/CSS handling tem 5+ anos de edge cases |
| CSV serialization | `arr.map(r => r.join(',')).join('\n')` | `papaparse.unparse` | Escape de vírgula, quote, newline, BOM, dialects |
| ZIP archive | DEFLATE manual ou `CompressionStream` | `jszip` | Cross-browser + manifest ZIP correto |
| Brazilian slugify | Manual lowercase | Reuse `BlocoEditorModal::slugify` extraído | Diacritic removal é sutil; já testado em prod |

**Key insight:** Esta phase tem **zero código original de baixo nível**. Tudo é orquestração de libs e composição de componentes existentes. O "smart" está no helper `calcularDesempenho` e na escolha de off-screen rendering.

---

## Runtime State Inventory

Phase 8 é **adição pura, não rename/refactor**. Não há string a substituir nem migração de dados. Nenhuma das 5 categorias se aplica:

| Category | Items Found |
|----------|-------------|
| Stored data | None — sem migration, sem renames |
| Live service config | None — sem n8n/Datadog/Cloudflare envolvidos |
| OS-registered state | None — sem tasks/cron novos |
| Secrets/env vars | None — feature é 100% client-side, sem API key nova |
| Build artifacts | New chunks lazy `jspdf-*.js`, `html2canvas-*.js`, `papaparse-*.js`, `jszip-*.js` em `dist/assets/` — gerados pelo Vite automaticamente, não requerem ação manual |

---

## Common Pitfalls

### Pitfall 1: html2canvas captura SVG vazio quando charts ainda animam
**What goes wrong:** Recharts renderiza com fade-in / draw-line animation por default. html2canvas dispara síncrono e pega o frame em t=0.
**Why it happens:** `isAnimationActive` defaults to `true` em todos os componentes recharts.
**How to avoid:** No `<DesempenhoReportRenderer>`, passar `isAnimationActive={false}` em CADA chart (LineChart, BarChart, Pie). Optional: `await new Promise(r => requestAnimationFrame(r))` antes da captura para garantir paint.
**Warning signs:** PDF com áreas vazias onde deveriam ter gráficos.

### Pitfall 2: oklch/CSS modernos quebram html2canvas
**What goes wrong:** html2canvas 1.4.1 não suporta `color: oklch(...)` (parse falha → cor preta ou erro).
**Why it happens:** html2canvas tem seu próprio CSS parser, atrasado vs spec.
**How to avoid:** O CRM CONSEJ usa HSL CSS vars (`--cyan-hi`, etc.) — não há oklch. Mas se for adicionar tema novo, manter HSL/RGB. Alternativa: migrar para `html2canvas-pro@2.0.4` (suporta oklch) — **não locked**, registrar como deferred.
**Warning signs:** Cores chapadas pretas/brancas no PDF onde deveriam ter cor.

### Pitfall 3: Tela do user fica dark mid-export → light flash
**What goes wrong:** Ao forçar light, a UI visível muda. User vê flicker.
**Why it happens:** ThemeProvider escuta CSS classes — visible re-render.
**How to avoid:** Mostrar modal de loading central durante export — o modal está em primeiro plano. Off-screen renderer + modal sobreposto. Ou: criar shadow root para isolar (overkill). **Simpler:** modal de loading cobre 100% da tela visualmente.
**Warning signs:** Reports de usuário "vi a tela piscar".

### Pitfall 4: Coord+ acessando `/me/desempenho/:seuPróprioId` duplica logic
**What goes wrong:** Coord+ vê seu próprio ID na URL e a página implementa 2 caminhos (com/sem param).
**Why it happens:** Naïve implementação de 2 routes diferentes.
**How to avoid:** Página única lê `useParams<{ perfilId?: string }>()`, faz `const targetId = params.perfilId ?? currentUserId`. Idêntico render em ambos. RequireRole coord+ só fica wrappando `/me/desempenho/:perfilId` quando `params.perfilId !== currentUserId`.
**Warning signs:** Bug onde algumas métricas diferem entre `/me/desempenho` e `/me/desempenho/<próprio_id>`.

### Pitfall 5: Cancel do team report deixa estado inconsistente
**What goes wrong:** User cancela mid-export, modal fecha, mas pdf parcial fica em memória (não baixado, OK) e theme dark/light fica trocado.
**Why it happens:** `try/finally` no `gerarRelatorioEquipe` restaura, MAS se a Promise é rejeitada por abort no meio do loop, o `finally` precisa rodar.
**How to avoid:** `try { ... } catch (e) { if (e.name === 'AbortError') ...; throw } finally { restoreTheme() }` — finally sempre roda mesmo com rejection.
**Warning signs:** Após cancelar, app fica em light mode permanente.

### Pitfall 6: Cliente sem `responsavel_id` direto torna NPS por consultor ambíguo
**What goes wrong:** `Cliente` não tem `responsavel_id` no schema. Helper precisa decidir via contratos OU via lead origem.
**Why it happens:** Schema foi modelado antes de Phase 8.
**How to avoid:** Decidir EXPLICITAMENTE no planning. Recomendação: via `contratos.responsavel_id` — agrupa NPS dos clientes que têm contrato ativo com aquele consultor. Documentar no helper.
**Warning signs:** "Meu NPS médio mostra X mas eu tenho cliente Y com nota Z."

### Pitfall 7: PDF em iPhone trava por out-of-memory no team report
**What goes wrong:** 10 consultores × scale 2 × 3 pages = 60 canvas grandes em ~5s.
**Why it happens:** WebKit memory limits em iOS.
**How to avoid:** Pattern 10 acima — warn iOS users + nudge para desktop. PDF individual em iOS funciona.
**Warning signs:** Crash silent da tab no iPhone.

### Pitfall 8: CSV abre quebrado no Excel PT-BR (acentos viram lixo)
**What goes wrong:** Excel default encoding é Windows-1252; papaparse outputs UTF-8.
**Why it happens:** Sem BOM Excel não detecta encoding.
**How to avoid:** Prefixar `﻿` antes de cada CSV string (Pattern 5).
**Warning signs:** "Consej" vira "Consej" no Excel.

### Pitfall 9: CSV injection — fórmula maliciosa em campo `notas`
**What goes wrong:** User digita `=cmd|'/c calc'!A0` em `notas` do lead; CSV exportado abre Excel → execute formula.
**Why it happens:** CSV não tem distinção entre dado e formula.
**How to avoid:** Sanitizar cells que começam com `=` `+` `-` `@` `\t` `\r` prefixando com apóstrofo. Helper `sanitizeCell` no Pattern 5.
**Warning signs:** OWASP CSV injection (T-08-03).

---

## Code Examples

### Page skeleton `/me/desempenho` + `:perfilId`

```tsx
// src/pages/DesempenhoPage.tsx
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useLeads } from '@/hooks/useLeads'
import { useTarefas } from '@/hooks/useTarefas'
import { useClientes } from '@/hooks/useClientes'
import { usePerfis, useMeuPerfil } from '@/hooks/usePerfis'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { calcularDesempenho } from '@/lib/desempenho'
import { loadPeriod, savePeriod } from '@/lib/desempenho-period'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import { RequireRole } from '@/components/shared/RequireRole'
import { DesempenhoKpiGrid } from '@/components/desempenho/DesempenhoKpiGrid'
import { ExportButtons } from '@/components/desempenho/ExportButtons'

export function DesempenhoPage() {
  const params = useParams<{ perfilId?: string }>()
  const { data: meuPerfil } = useMeuPerfil()
  const targetId = params.perfilId ?? meuPerfil?.id
  const isViewingOther = params.perfilId && params.perfilId !== meuPerfil?.id

  const { data: perfis = [] } = usePerfis()
  const { data: leads = [] } = useLeads()
  const { data: tarefas = [] } = useTarefas()
  const { data: clientes = [] } = useClientes()
  const { data: config } = useConfiguracoes()

  const [period, setPeriod] = useState(loadPeriod)
  useEffect(() => { savePeriod(period) }, [period])

  if (!targetId || !meuPerfil) return null

  const targetPerfil = perfis.find(p => p.id === targetId) ?? meuPerfil

  const metrics = useMemo(() => calcularDesempenho({
    leads, tarefas, clientes,
    perfilId: targetId,
    perfilNome: targetPerfil.nome,
    periodo: period,
    servicosConfig: config?.servicos ?? [],
  }), [leads, tarefas, clientes, targetId, targetPerfil.nome, period, config])

  const content = (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold">Desempenho — {targetPerfil.nome}</h1>
          {isViewingOther && <p className="text-xs text-muted-foreground">Visualização: coord+</p>}
        </div>
        <div className="flex gap-2 items-center">
          <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={leads} />
          <ExportButtons metrics={metrics} leads={leads} tarefas={tarefas} clientes={clientes} />
        </div>
      </header>
      <DesempenhoKpiGrid metrics={metrics} />
      {/* charts ... */}
    </div>
  )

  return isViewingOther ? <RequireRole atLeast="coordenador">{content}</RequireRole> : content
}
```

### Router additions

```typescript
// src/router.tsx (add inside children of AppLayout)
{ path: 'me/desempenho', element: <DesempenhoPage /> },
{ path: 'me/desempenho/:perfilId', element: <DesempenhoPage /> },
```

### AdocaoPage drill + team button

```tsx
// src/pages/AdocaoPage.tsx — diff in spirit
import { useNavigate } from 'react-router-dom'
const navigate = useNavigate()

// In header row (above table):
<div className="flex justify-between">
  <h2 className="text-base font-semibold">Atividade no mês</h2>
  <Button onClick={handleExportTeam}>Exportar PDF equipe</Button>
</div>

// In each row <tr> for consultor:
<tr
  key={p.id}
  className="hover:bg-[var(--alpha-bg-xs)] cursor-pointer transition-colors"
  onClick={() => navigate(`/me/desempenho/${p.id}`)}
>
  ...
</tr>
```

### GlobalSearch indexing

`GlobalSearch.tsx` currently indexes entities (leads/clientes/contratos), **not static routes**. To make "desempenho" findable via Cmd+K, add a static entries array:

```typescript
// In GlobalSearch.tsx, alongside category meta:
const STATIC_PAGES: ResultItem[] = [
  { id: 'page-desempenho', label: 'Desempenho', sublabel: 'Meu relatório de performance', path: '/me/desempenho', category: 'Páginas' },
  // ... outras páginas se for o caso
]

// In results compose:
const allResults = [...staticPagesMatching, ...leadsMatching, ...]
```

Add `Páginas` to `CATEGORY_META` with appropriate icon (e.g., `LayoutDashboard`).

---

## State of the Art

| Old Approach | Current Approach (2025-2026) | When Changed | Impact |
|--------------|------------------------------|--------------|--------|
| `jspdf.html()` autopaging | Manual per-page `addImage` + `addPage` | jspdf 2.x | Mais controle sobre quebras; melhor para SVG-heavy |
| Server-side PDF render (puppeteer/playwright) | Client-side jspdf+html2canvas | 2020s | Zero servidor; OK para reports leves |
| `xlsx` lib for tabular export | CSV+ZIP bundle | — | XLSX é 4-5× maior; CSV abre em qualquer planilha |
| Static bundle of pdf libs | Vite dynamic `import()` chunks | Vite 4+ | Bundle inicial limpo |
| html2canvas para tudo | `html2canvas-pro` para oklch CSS | 2024 | Opcional — só se app usa color() modernos |

**Deprecated / outdated:**
- jspdf 1.x — abandonado, sem TypeScript types embutidos. Sempre 2.x+.
- `jszip-utils` — não necessário hoje; `jszip` standalone basta.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Cliente` não tem `responsavel_id` — NPS por consultor virá via `contratos.responsavel_id` | calcularDesempenho signature | Recomendação errada de schema; pode requerer migration; user pode preferir derivar via lead → cliente |
| A2 | `jspdf@^2.5` (CONTEXT locked) — usar `^2.5.2` (latest 2.x). Não atualizar para 4.x. | Standard Stack note | Se planner quiser 4.x, há breaking changes (ESM-only, alguns helpers renomeados) |
| A3 | html2canvas funciona com recharts SVG desde que `isAnimationActive={false}` | Pitfall 1 | Se test em UAT mostrar áreas vazias, fallback é `html2canvas-pro` |
| A4 | iOS Safari aguenta PDF individual (3 páginas) sem crash | Pattern 10 | UAT em iPhone real é necessário; baixo risco |
| A5 | localStorage `consej_desempenho_period` é seguro em SPA Vite | Pattern 8 | Sem SSR — não há hydration mismatch |
| A6 | UTF-8 BOM é suficiente para Excel PT-BR abrir CSV correto | Pattern 5 | Validar em UAT com Excel 2016+ no Windows do user |
| A7 | Slugify private em BlocoEditorModal é seguro extrair sem regressão | Pattern 7 | Extrair + adicionar tests cobre |
| A8 | Vite gera lazy chunks automaticamente para `import('jspdf')` | Pattern 11 | Verificar em `npm run build` output |
| A9 | "Consultor ativo" para D-07 = role consultor AND ≥1 lead criado no período | TeamReport | Recharts não inclui consultores que apenas concluíram tarefas — alinhar com user em discuss |
| A10 | `html2canvas-pro@2.0.4` é fork legítimo (não slop) | Alternatives Considered | npm view confirma upstream; deferred |

---

## Open Questions

1. **Como derivar "clientes do consultor"?** (A1)
   - What we know: `Cliente.responsavel_id` não existe; `Contrato.responsavel_id` sim
   - What's unclear: deve incluir clientes sem contrato? Como ponderar quando cliente tem múltiplos contratos com responsáveis diferentes?
   - Recommendation: Discuss-phase confirma — recomendação default é "clientes cujo último contrato ativo tem `responsavel_id === perfilId`". Documentar limitação no helper.

2. **Versão final do jspdf** (A2)
   - What we know: CONTEXT locked `^2.5`; latest em 2.x é 2.5.2
   - What's unclear: planner pode querer 4.x para ESM/tree-shaking
   - Recommendation: usar `jspdf@^2.5.2`. Se houver tempo no UAT, testar 4.x lado a lado.

3. **Charts no PDF: 4 charts (D-11) — exato visual de cada um?**
   - What we know: funil + timeline 12 meses + distribuição tarefas + ICP fit/sparkline
   - What's unclear: ICP fit ao longo do tempo (sparkline) ou KPI grande? D-11 diz "KPI cards grandes" para tarefas+NPS na página 3
   - Recommendation: Página 3 = 2 colunas — tarefas (BarChart por status pequeno) | ICP fit big card + NPS big card. Planner finaliza com mockup.

4. **Fallback NPS undefined em PDF** (locked Claude's Discretion)
   - Recommendation: Sempre mostrar `—` (não 0). KPI card com value=`—` e legend "Sem dados de NPS no período".

5. **Team report sumário ranqueado: layout exato?**
   - What we know: tabela ranqueada por `leads_convertidos` desc
   - What's unclear: incluir todas as 8 métricas? Apenas top 5? Quebra de linha em consultores com nome longo?
   - Recommendation: Tabela compacta — Nome | Leads | Convertidos | Win Rate | NPS. Outras métricas ficam nas páginas individuais. Plan-checker valida.

6. **Mobile UX para team report**
   - What we know: Pattern 10 sugere warn iOS
   - What's unclear: Android Chrome (~150MB heap) — tem risco também?
   - Recommendation: Aplicar warn para qualquer mobile + team report ≥ 5 consultores. Aceitar "tentar mesmo assim".

---

## Environment Availability

Phase 8 é puramente client-side com libs npm. Não há dependências externas a verificar.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | dev + build local | ✓ | 20+ (devDeps `@types/node@^24`) | — |
| npm | install | ✓ | — | — |
| Modern browser (ES2023, Blob, URL.createObjectURL) | runtime | ✓ | Chrome/Edge/Safari/Firefox latest 2 majors | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

---

## Validation Architecture

> `workflow.nyquist_validation` não está set como false em `.planning/config.json` (key absent → assumido enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x + jsdom 25 + @testing-library/react 16 |
| Config file | `vitest.config.ts` (jsdom env, globals, include `src/**/*.test.{ts,tsx}` + `tests/rls/**`) |
| Quick run command | `npm run test -- src/lib/__tests__/desempenho.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REP-01 (helper) | `calcularDesempenho` retorna 8 métricas corretas dado fixture | unit | `vitest run src/lib/__tests__/desempenho.test.ts` | Wave 0 cria |
| REP-01 (helper edge) | Período sem leads → `icp_fit_medio` e `ciclo_medio_dias` = null | unit | idem | Wave 0 |
| REP-01 (helper edge) | Sem clientes com NPS → `nps_medio` = null | unit | idem | Wave 0 |
| REP-01 (page) | Renderiza KPIs com mock data + PeriodSelector | component | `vitest run src/pages/__tests__/DesempenhoPage.test.tsx` | Wave 0 |
| REP-02 (PDF) | Geração de PDF — **manual UAT only** (html2canvas+jsPDF não tem testabilidade headless prática; jsdom não suporta canvas) | manual | n/a | n/a |
| REP-03 (CSV) | `gerarZipCSV` produz Blob com 3 entries; CSV content parseable | unit | `vitest run src/lib/__tests__/csv-export.test.ts` | Wave 0 |
| REP-03 (CSV) | Cell com `=fórmula` → prefixado com `'` | unit | idem | Wave 0 |
| REP-03 (CSV) | UTF-8 BOM presente | unit | idem | Wave 0 |
| REP-04 (team agg) | "Consultor ativo" filtro = role consultor + criou ≥1 lead | unit | `vitest run src/lib/__tests__/desempenho-team.test.ts` | Wave 0 |
| REP-04 (route guard) | Consultor tenta `/me/desempenho/:outroId` → bloqueado por RequireRole | component | `vitest run src/pages/__tests__/DesempenhoPage.guard.test.tsx` | Wave 0 |
| slug (utility) | Normaliza diacritics + lowercase + max 48 chars | unit | `vitest run src/lib/__tests__/slug.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- src/lib/__tests__/desempenho.test.ts` (< 2s)
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green + manual UAT roteiro abaixo

### Manual UAT Checklist (PDF flow — não-automatizável)

- [ ] PDF individual gerado em Chrome desktop — 3 páginas, charts renderizados, light theme
- [ ] PDF individual em iPhone Safari — funciona ou falha graceful (não trava tab)
- [ ] Team PDF em Chrome desktop — 5 consultores teste, progress bar, cancelar funciona
- [ ] Team PDF abortado mid-export — theme restaurado, nada corrompido
- [ ] CSV bundle aberto no Excel PT-BR — acentos OK, fórmulas escapadas
- [ ] Filename PT-BR com acentos → slugified corretamente
- [ ] Coord+ acessa `/me/desempenho/:seuPróprioId` → render idêntico a `/me/desempenho`
- [ ] Consultor acessa `/me/desempenho/:outroId` → RequireRole bloqueia

### Wave 0 Gaps

- [ ] `src/lib/__tests__/desempenho.test.ts` — Wave 0 (sem arquivo hoje)
- [ ] `src/lib/__tests__/desempenho-team.test.ts` — Wave 0
- [ ] `src/lib/__tests__/csv-export.test.ts` — Wave 0
- [ ] `src/lib/__tests__/slug.test.ts` — Wave 0
- [ ] `src/pages/__tests__/DesempenhoPage.test.tsx` — Wave 0
- [ ] `src/pages/__tests__/DesempenhoPage.guard.test.tsx` — Wave 0
- [ ] Fixtures determinísticas em `src/lib/__tests__/fixtures/desempenho.ts` — Wave 0 (leads/tarefas/clientes/perfis sintéticos)
- [ ] Framework: instalado e configurado já (vitest 3.2). Sem instalação nova.

---

## Security Domain

> `security_enforcement` não setado false em config — incluído.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (uses) | Supabase Auth (já implementado) — sessão existe |
| V3 Session Management | yes (uses) | Supabase JWT — sem mudança |
| V4 Access Control | **yes (CRITICAL)** | RLS Supabase em `leads`/`tarefas`/`clientes`/`perfis` (já existe — Phase 6 `029_rls_role_aware.sql`); RequireRole component no front; gating na rota `/me/desempenho/:perfilId` |
| V5 Input Validation | yes (low) | `perfilId` da URL é UUID — validar formato antes da query |
| V6 Cryptography | no | Phase 8 não manipula secrets |
| V7 Error Handling | yes | Toast error em falhas; não vazar stack trace em mensagem |
| V8 Data Protection | yes (low) | PDF/CSV contém dados pessoais (nome consultor, NPS) — só baixados pelo próprio user/coord+. Sem persistência server-side. |
| V14 Configuration | yes | Lazy chunks de libs não introduzem CSP issues novos |

### Known Threat Patterns for stack (REP-XX → STRIDE → mitigation)

| Threat ID | Pattern | STRIDE | Standard Mitigation |
|-----------|---------|--------|---------------------|
| T-08-01 | Data leak via PDF metadata (filename revelar info interna) | Information Disclosure | Filename slugificado sem dados sensíveis; sem campos custom em PDF metadata |
| T-08-02 | XSS em filename construído de input não sanitizado | Tampering | `slugify` strip de tudo exceto `[a-z0-9-]` antes de virar filename |
| T-08-03 | CSV injection (`=cmd|'/c calc'!A0` em campo `notas`) | Tampering / RCE no Excel | `sanitizeCell` prefixar com apóstrofo cells iniciando `=` `+` `-` `@` `\t` `\r` (Pattern 5) — OWASP CSV Injection Prevention |
| T-08-04 | Consultor acessa `/me/desempenho/:outroId` e vê dados de outro | Elevation of Privilege | (a) RequireRole no front (UX); (b) RLS no Supabase recusa SELECT — defesa em camadas. Já existe RLS role-aware em Phase 6. |
| T-08-05 | Memory exhaustion DoS (team report com 100+ consultores trava browser) | Denial of Service (self-inflicted) | Sequencial + cap em 50 consultores (warn se ≥50); cancel via AbortController; iOS warn |
| T-08-06 | Race: dados mudam mid-export → PDF inconsistente | Tampering (race) | TanStack cache snapshot no momento de calcular; aceitar (read-only export, baixo risco) |
| T-08-07 | localStorage tampering (period inválido) → crash | Tampering | `loadPeriod` valida `typeof` e fallback (Pattern 8) |
| T-08-08 | Blob URL não revogado → memory leak | Resource exhaustion | `URL.revokeObjectURL(url)` após click (Pattern 5) |

**Decisões de risco:**
- T-08-04 é **CRITICAL** — RLS já existe mas plan-checker DEVE verificar que queries `useLeads`/`useTarefas`/`useClientes` quando consumidas em coord+ context efetivamente filtram por perfil alvo (não vazar lista completa).
- T-08-05 mitigado por design (sequencial + cancel). Cap em 50 é nice-to-have.
- T-08-06 ACCEPT — relatório é snapshot in time; documentar timestamp no header do PDF.

---

## Risks & Landmines (consolidated)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Recharts charts vazios no PDF (animation) | High | High | `isAnimationActive={false}` obrigatório no renderer |
| iOS team report crash | Medium | Medium | Warn + nudge desktop (Pattern 10) |
| `Cliente.responsavel_id` ausente → NPS por consultor mal-calculado | High | Medium | Discussão com user antes de Plan 1; escolher via contratos |
| Slugify regex de BlocoEditorModal quebrado em outro editor | Low | Low | Reescrever range em `\uXXXX` notation ao extrair |
| jspdf 2.x vs 4.x version drift | Medium | Low | Pin `^2.5.2`; documentar em planlist se quiser revisitar |
| html2canvas-pro vs html2canvas (oklch) | Low (CRM CONSEJ usa HSL) | Low | Não migrar; deferred |
| Light theme flash visible to user | Medium | Low | Modal loading cobre tela; aceitável |
| CSV abre quebrado no Excel PT-BR | Medium | Medium | UTF-8 BOM (Pattern 5); UAT manual confirma |
| CSV injection RCE em planilha do user | Low | High | `sanitizeCell` (Pattern 5) |
| Lazy chunks aumentam tempo do primeiro export | Medium | Low | Aceitável — feature ocasional, libs ~180KB total |
| Coord+ vê NPS de cliente de outro consultor (RLS gap) | Low (RLS existe) | High | Plan-checker valida RLS em queries para outro perfilId |

---

## Sources

### Primary (HIGH confidence)
- Codebase grep + Read — `src/lib/periods.ts`, `src/lib/icp-dinamico.ts`, `src/lib/constants.ts`, `src/components/shared/PeriodSelector.tsx`, `src/components/shared/RequireRole.tsx`, `src/hooks/useLeads.ts`, `src/hooks/useTarefas.ts`, `src/hooks/useClientes.ts`, `src/types/index.ts`, `src/pages/AnalyticsPage.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/AdocaoPage.tsx`, `src/pages/MeEspacoPage.tsx`, `src/router.tsx`, `src/components/layout/GlobalSearch.tsx`, `src/components/mensagens/BlocoEditorModal.tsx`, `package.json`
- `npm view <pkg>` para versões + downloads + deps + postinstall — verificados em 2026-05-29
- slopcheck OK em jspdf/html2canvas/papaparse/jszip — 2026-05-29
- `.planning/phases/08-individual-performance-reports/08-CONTEXT.md` — D-01..D-11 locked
- `.planning/REQUIREMENTS.md` — REP-01..04
- `.planning/STATE.md` — phase status + tech debt

### Secondary (MEDIUM confidence)
- [jsPDF GitHub](https://github.com/parallax/jsPDF) — official repo, multi-page pattern
- [html2canvas docs](https://html2canvas.hertzen.com/) — official, options reference
- [papaparse docs](https://www.papaparse.com/docs) — official, `unparse` API
- [jszip docs](https://stuk.github.io/jszip/) — official, `generateAsync` blob output
- [GitHub Issue #1757 — html2canvas charts partially captured](https://github.com/niklasvh/html2canvas/issues/1757) — animation issue
- [GitHub Issue #1846 — SVG capture status](https://github.com/niklasvh/html2canvas/issues/1846) — SVG handling
- [PHPpot — Converting HTML into Multi-page PDF](https://phppot.com/javascript/jspdf-html-example/) — multi-page pattern
- [Medium — Generating PDFs from HTML in a React Application](https://medium.com/@saidularefin8/generating-pdfs-from-html-in-a-react-application-with-html2canvas-and-jspdf-d46c5785eff2) — React integration
- [OWASP CSV Injection Prevention Cheat Sheet](https://owasp.org/www-community/attacks/CSV_Injection) — `sanitizeCell` pattern

### Tertiary (LOW confidence — flagged)
- [portalZINE — Best HTML to Canvas Solutions in 2025](https://portalzine.de/best-html-to-canvas-solutions-in-2025/) — comparison, used to confirm html2canvas remains dominant
- iOS Safari memory limits — observational; varies per device generation, no official Apple doc

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — todas libs locked + verificadas no registry + slopcheck OK
- Architecture (off-screen + portal + lazy import): **HIGH** — pattern dominante, alinhado com codebase patterns existentes (pure helpers + portals)
- `calcularDesempenho` signature: **MEDIUM** — depende da resolução de Open Question 1 (clientes do consultor)
- Pitfalls: **HIGH** — issues conhecidas do html2canvas/recharts validadas em GitHub
- Security: **HIGH** — ASVS V4 já tratado por RLS existente; CSV injection é mitigação standard
- Validation: **HIGH** — vitest infra já existe; manual UAT para PDF é convenção do domínio

**Research date:** 2026-05-29
**Valid until:** 2026-06-29 (libs estáveis; revalidar se phase ficar deferred > 30d)
