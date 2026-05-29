# Phase 8: Individual Performance Reports - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** MVP (vertical slice — ROADMAP `**Mode:** mvp`)

<domain>
## Phase Boundary

Permitir que **consultor exporte próprio relatório de performance** (PDF para 1:1 com coordenador, CSV para análise no Excel) e **coordenador+ exporte relatório consolidado da equipe** para reuniões mensais. Tudo client-side com zero novo backend.

**Páginas novas:**
- `/me/desempenho` — métricas do próprio user (reusa PeriodSelector + ScopeToggle Phase 4)
- `/me/desempenho/:perfilId` — coord+ pode ver desempenho de outro consultor (RLS na query)

**Páginas estendidas:**
- `/adocao` ganha botão "Exportar PDF equipe" (REP-04 — relatório consolidado: capa com totais + 1 página por consultor ativo)
- Drill: tap em row de consultor na `/adocao` → `/me/desempenho/<perfilId>`

**Métricas (8) per consultor + período:**
- leads_criados (count leads WHERE responsavel_id = perfilId AND created_at IN periodo)
- convertidos (count leads WHERE status IN TERMINAL_WON_STAGES)
- perdidos (count leads WHERE status IN TERMINAL_LOST_STAGES)
- ciclo_medio_dias (AVG(updated_at - created_at) WHERE status='ganho')
- win_rate (ganhos / (ganhos + perdidos))
- icp_fit_medio (reusa `calcularIcpDinamico` Phase 1 → média)
- tarefas_concluidas (count tarefas WHERE atribuido_a_id AND status='concluida')
- nps_medio (AVG clientes.nps_score WHERE responsavel_id AND nps_score IS NOT NULL)

**Charts no PDF (4 inline — planner decide visualização exata):**
- Funil de conversão (leads_criados → convertidos → perdidos)
- Timeline mensal de leads criados (LineChart 12 meses)
- Distribuição de tarefas por status (BarChart pequeno)
- ICP fit ao longo do tempo (sparkline ou pequeno LineChart)

**Out of scope:**
- Comparação entre períodos (delta % vs ano anterior) — já em `## Future Goals` PROJECT.md
- Forecast / projeção futura no relatório — Phase 9 (ML)
- Drill-down para lead individual a partir do PDF — PDF é estático
- Múltiplos consultores comparados na mesma view — 1 perfil por página
- KPIs custom configuráveis — fora MVP
- Histórico de relatórios salvos — regenera on-demand
- PDF assinado/hashed — uso interno apenas
- XLSX multi-sheet — escolhemos ZIP + 3 CSVs

</domain>

<decisions>
## Implementation Decisions

### PDF Stack

- **D-01:** **jspdf + html2canvas.** Captura o DOM renderizado on-screen (recharts já desenhado) → PNG → embute em PDF. Bundle ~180KB. UX: click → spinner 2-3s → download. PDF preserva exatamente o que aparece na tela. Pattern compatível mobile.
  - `jspdf@^2.5` para document creation
  - `html2canvas@^1.4` para DOM capture
  - Tela renderizada off-screen (não-visível, position fixed top -9999px) durante geração — evita flash UI
  - PDF orientado portrait, A4, ~3 páginas: capa+kpis (1) + funil/timeline (1) + tarefas+nps (1)

### Routing

- **D-02:** **Sub-route dedicada `/me/desempenho` + opcional `:perfilId`**. Estrutura:
  - `/me/desempenho` (sem param) — mostra dados do `auth.uid()`. Atalho conveniente.
  - `/me/desempenho/:perfilId` — coord+ visualiza outro consultor. RLS na query: query falha se viewer não tem permissão (consultor tentando ver outro consultor recebe vazio).
  - **MeEspacoPage permanece o hub `/me`** com as tabs atuais (Perfil/MeusLeads/Tarefas/Notificações/Visão Geral). Desempenho **não** vira tab — fica como sub-route porque PDF/CSV exigem layout específico que confunde dentro de tabs.
  - Link "Ver desempenho" na tab Visão Geral OU em `/me/perfil` apontando para `/me/desempenho` — discoverable sem poluir nav.

### Aggregation

- **D-03:** **Client-side em `src/lib/desempenho.ts`** (helper puro determinístico).
  - Signature: `calcularDesempenho({ leads, tarefas, clientes, periodo, perfilId }): DesempenhoMetricas`
  - `DesempenhoMetricas` interface com as 8 chaves (D-CONTEXT.md domain section)
  - Reusa hooks existentes (`useLeads`, `useTarefas`, `useClientes`) — TanStack cache evita refetch
  - Para vista coord+ da equipe (REP-04): iterar `perfis ativos` e re-aplicar mesmo helper per consultor
  - Função pura testável (`__tests__/desempenho.test.ts` com fixtures determinísticas)
  - **Sem migration nova** — vantagem clave; Phase 8 zero-cost backend

### CSV Export

- **D-04:** **3 CSVs em ZIP único** (leads.csv + tarefas.csv + contratos.csv).
  - `papaparse@^5.4` para serialização CSV (quoting + escaping robusto)
  - `jszip@^3.10` para criar ZIP client-side
  - Bundle ~95KB extra
  - Botão "Exportar CSV" gera `desempenho_<perfilNome>_<periodo>.zip` (e.g. `desempenho_gabriel_2026-T2.zip`)
  - 3 CSVs limpos: leads.csv tem todas colunas relevantes (nome, empresa, segmento, status, valor_estimado, created_at, updated_at, motivo_perda); tarefas.csv (titulo, status, data_vencimento, criado_em, concluida_em); contratos.csv (cliente_nome, modelo, valor, ativo, created_at)
  - Apenas dados do perfilId no período (consultor responsavel/atribuido)

### Period Semantics

- **D-05:** Reusa **PeriodSelector** + `PeriodValue` (`{ year, granularity: 'total' | 'T1'-'T4' | 'S1' | 'S2' }`) do Phase 4. `getPeriodRange()` da Phase 4 calcula start/end dates.
- **D-06:** PeriodSelector default = ano atual + total (12 meses do ano). Persistir escolha em localStorage `consej_desempenho_period`.

### Team Report (REP-04)

- **D-07:** Botão "Exportar PDF equipe" na `/adocao` (visível coord+ via RequireRole).
  - Estrutura PDF: **Capa** (totais do time + período + data) → **1 página por consultor ativo** (nome + 8 métricas + 4 charts) → **Sumário comparativo** (tabela ranqueada por leads convertidos)
  - "Consultor ativo" = perfil com `role='consultor'` AND criou pelo menos 1 lead no período
  - Geração: itera consultores, renderiza tela off-screen per consultor, captura via html2canvas, anexa página
  - Loading state com progress bar (`5 / 12 consultores...`) durante geração — pode levar 30-60s em equipe de 10+

### AdocaoPage Drill

- **D-08:** Tap/click em row de consultor na tabela `/adocao` → navega para `/me/desempenho/<perfilId>`. RequireRole coord+ na rota (consultor não vê outros).

### Discovery / Navigation

- **D-09:** Sem entry nova na Sidebar (não poluir nav com sub-rota).
  - Link "Ver desempenho" no `PerfilPanel` (tab Perfil de MeEspacoPage) → `/me/desempenho`
  - Atalho `Cmd+K` (GlobalSearch) deve achar "Desempenho" via fuzzy match (Phase 1 pattern já indexa rotas — verificar/estender se necessário)

### Type System Extensions

- **D-10:** `src/types/index.ts`:
  - Novo `DesempenhoMetricas` interface (8 chaves numéricas + perfil ref + período ref)
  - Novo `DesempenhoConsultorTeam` para REP-04 (perfilId + perfilNome + DesempenhoMetricas)
  - Sem mudanças em tipos existentes — Phase 8 só adiciona

### PDF Content Layout (planner discretion mas committed shape)

- **D-11:** PDF de relatório individual ~3 páginas A4 portrait:
  - **Página 1:** Header (logo CONSEJ + título "Relatório de Desempenho" + nome consultor + período) + grid 4×2 de KPI cards com as 8 métricas + footer com data de geração
  - **Página 2:** Funil de conversão (BarChart horizontal — leads_criados / convertidos / perdidos) + Timeline mensal de leads criados (LineChart)
  - **Página 3:** Distribuição de tarefas (BarChart por status) + ICP fit médio + NPS médio (KPI cards grandes)
- Cores: paleta canônica do tema CONSEJ (`--cyan-hi`, `--emerald-mid`, `--amber-mid`) — recharts já configurado em Phase 4

### Claude's Discretion

- **Off-screen rendering pattern para html2canvas** — `position: fixed; top: -9999px; left: -9999px; width: 794px (A4); pointer-events: none` ou portal via createPortal. Planner decide trade-off (portal é mais limpo mas pode ter z-index issues).
- **Loading UX exato durante geração PDF** — modal com spinner + texto "Gerando PDF..." vs progress bar inline. Recomendação: modal central + cancelar button (especialmente para team report longo).
- **Filename pattern** — `desempenho_<consultor_kebab>_<periodo>.pdf`. Planner finaliza.
- **Tabela de ranking no team report (D-07)** — sort por leads_convertidos (descending) por default; outras opções (win_rate, nps) deixar para v2.
- **Fallback NPS undefined** — quando `nps_medio` é `null` (sem clientes com NPS), mostrar "—" no PDF. Não confundir com 0.
- **GlobalSearch indexação D-09** — verificar se PageIndex já tem entry para `/me/desempenho`. Se não, adicionar.
- **Tema dark/light no PDF** — PDF sempre em tema claro (legibilidade impressa). Forçar via `document.documentElement.classList.add('light')` temporário durante html2canvas se app estiver em dark.
- **Coord+ visualização de própria página** — quando coord+ acessa `/me/desempenho/:proprio_perfilId` deve mostrar mesmo que `/me/desempenho` (não duplicar logic).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 8 entry (goal, mode=mvp, 4 success criteria, REP-01..04)
- `.planning/REQUIREMENTS.md` §REP-01..04 — requirements completos
- `.planning/STATE.md` — pré-requisitos (nenhum manual para Phase 8 — sem secrets, sem bucket); tech-debt list

### Phase 1, 4, 7 Context (decisões herdadas/reusadas)
- `.planning/phases/01-tasks-and-adoption/01-CONTEXT.md` — `calcularIcpDinamico` definido (Phase 1); reusar para `icp_fit_medio`
- `.planning/phases/04-revenue-dashboard/04-CONTEXT.md` — PeriodSelector + `getPeriodRange()` + recharts pattern + tema cores
- `.planning/phases/07-client-portal-expansion/07-CONTEXT.md` — `RequireRole atLeast="coordenador"` pattern (mesmo gate para REP-04 e D-08)

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — layered architecture (hooks → lib → components)
- `.planning/codebase/STACK.md` — React 19 / Vite / TanStack v5 / Tailwind / recharts / shadcn

### Existing patterns to mirror
- `src/components/shared/PeriodSelector.tsx` — período canônico (year + granularity)
- `src/components/shared/ScopeToggle.tsx` — Minhas/Todas (não necessariamente Phase 8, mas pattern similar)
- `src/components/shared/RequireRole.tsx` — role gate
- `src/lib/icp-dinamico.ts` — pattern de lib pure helper com testes (mirror para `desempenho.ts`)
- `src/lib/periods.ts` — `getPeriodRange()` (essencial para Phase 8 filtros)
- `src/lib/constants.ts` — `TERMINAL_WON_STAGES`, `TERMINAL_LOST_STAGES`, `PIPELINE_STAGES`
- `src/pages/AnalyticsPage.tsx` — referência de como renderizar charts recharts numa página
- `src/pages/DashboardPage.tsx` — KPI cards grid pattern (4×2 grid)
- `src/pages/ReceitaPage.tsx` — LineChart com período + tooltips PT-BR
- `src/pages/AdocaoPage.tsx` — coord+ dashboard com tabela; vai ganhar botão "Exportar PDF equipe"

### Frontend reuse
- `src/hooks/useLeads.ts` — todos leads (filter no helper)
- `src/hooks/useTarefas.ts` (ou hook equivalente) — todas tarefas
- `src/hooks/useClientes.ts` — clientes com `responsavel_id` e `nps_score`
- `src/hooks/usePerfis.ts` + `useCurrentRole.ts` — auth context + role gate
- `src/router.tsx` — adicionar 2 rotas (`/me/desempenho`, `/me/desempenho/:perfilId`)
- `src/lib/query-keys.ts` — adicionar `desempenho` keys se necessário (provavelmente não — helper roda em cima de hooks existentes)
- `src/types/index.ts` — `DesempenhoMetricas` + `DesempenhoConsultorTeam` (D-10)
- `src/components/layout/GlobalSearch.tsx` — adicionar entry "Desempenho" (D-09)

### External docs
- jspdf: https://github.com/parallax/jsPDF
- html2canvas: https://html2canvas.hertzen.com/
- papaparse: https://www.papaparse.com/docs
- jszip: https://stuk.github.io/jszip/

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/components/shared/PeriodSelector.tsx`** — período canônico; Phase 8 reusa sem mudança
- **`src/lib/periods.ts::getPeriodRange()`** — calcula start/end dates a partir de `PeriodValue`; essencial para filtros temporais
- **`src/lib/icp-dinamico.ts`** — `calcularIcpDinamico` Phase 1; Phase 8 chama para cada lead → tira média
- **`src/lib/constants.ts`** — TERMINAL_WON_STAGES / TERMINAL_LOST_STAGES (count convertidos/perdidos)
- **`src/hooks/useLeads.ts` / `useTarefas.ts` / `useClientes.ts`** — TanStack queries com cache, sem refetch desnecessário
- **`src/components/shared/RequireRole.tsx`** — role gate para `/me/desempenho/:perfilId` (coord+ only)
- **recharts** (já em `package.json`): LineChart + BarChart + Cell + Tooltip para os 4 charts D-11
- **`src/pages/DashboardPage.tsx`** — referência de KPI grid

### Established Patterns
- **PeriodSelector + localStorage** persistir escolha — pattern Phase 4 (ReceitaPage)
- **TanStack Query cache** — hooks já carregam todos os dados; helper agrega em memória
- **Pure helpers em `src/lib/*.ts`** com tests em `__tests__/*.test.ts`
- **`RequireRole atLeast="coordenador"`** para gates
- **Page hooks via `useSearchParams`** para query state (não aplicável em Phase 8, pois período fica em localStorage)
- **Off-screen rendering** — pattern novo desta phase (helper component em `src/components/desempenho/`)
- **PDF generation** — pattern novo desta phase; `src/lib/pdf-export.ts` centraliza chamadas a jspdf+html2canvas
- **CSV/ZIP generation** — pattern novo; `src/lib/csv-export.ts` centraliza papaparse+jszip

### Integration Points
- **MeEspacoPage** (`src/pages/MeEspacoPage.tsx`): adicionar link "Ver desempenho" em PerfilPanel ou Visão Geral (não tab nova)
- **AdocaoPage** (`src/pages/AdocaoPage.tsx`): adicionar botão "Exportar PDF equipe" no header + drill nas rows
- **Router** (`src/router.tsx`): 2 rotas novas — `/me/desempenho` e `/me/desempenho/:perfilId`
- **GlobalSearch**: indexar nova rota
- **Sidebar** (`src/components/layout/Sidebar.tsx`): **sem mudança** (D-09)

</code_context>

<specifics>
## Specific Ideas

- **Off-screen rendering crítico para PDF** — recharts precisa estar visualmente renderizado para html2canvas capturar. Componente `<DesempenhoReportHidden ref>` renderizado em portal off-screen durante geração
- **Sub-route ao invés de tab** — share URL com coord+ + drill da AdocaoPage funcionam limpos
- **Helper puro `calcularDesempenho`** — fácil testar com fixtures determinísticas; deterministic = testable
- **3 CSVs em ZIP** — UX limpa (1 click) + 3 arquivos manipuláveis em Excel/Sheets
- **Filename PT-BR + período codificado** — `desempenho_gabriel_2026-T2.pdf` para fácil arquivamento
- **Modal de progresso para team report** — 10+ consultores pode levar 30s+; UX precisa explicar
- **Charts sempre em tema claro no PDF** — força light durante captura (legibilidade impressa)

</specifics>

<deferred>
## Deferred Ideas

Capturadas mas fora desta phase:

- **Comparação delta % vs período anterior** — já em PROJECT.md Future Goals (post-v3.0)
- **Forecast / projeção** no relatório — Phase 9 (ML)
- **Drill em lead individual no PDF** — PDF é estático; drill via app
- **Múltiplos consultores na mesma view comparativa** — fora MVP
- **KPIs custom configuráveis pelo coord+** — fora MVP
- **Histórico salvo de relatórios passados** — regenera on-demand; sem persistência
- **PDF assinado / hash de integridade** — uso interno, não exposto
- **XLSX multi-sheet** — escolhemos ZIP + 3 CSVs (bundle menor)
- **Ranking de equipe sorted by win_rate / NPS** — default é leads_convertidos; outras ordenações em v2
- **Email automático do relatório** — só download; envio é Phase futura
- **PDF embedded no portal cliente** — relatório é interno (consultor + coord+)
- **Dark mode no PDF** — sempre claro (legibilidade impressa)
- **Localização não-pt-BR** — fora MVP
- **Relatório agregado anual com 12 meses de comparativo** — fora MVP (período = T/S/total dentro do ano)

</deferred>

---

*Phase: 08-individual-performance-reports*
*Context gathered: 2026-05-28 via /gsd-discuss-phase 8*
