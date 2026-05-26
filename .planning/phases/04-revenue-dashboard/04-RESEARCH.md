# Phase 04: Revenue Dashboard — Research

**Researched:** 2026-05-26
**Domain:** Dashboard de receita (cálculo client-side de MRR/ARR/forecast a partir de `contratos` Supabase, render com recharts)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Definição de MRR/ARR (pro-rata unificado):**
   - MRR = `SUM(valor_mensal)` + `SUM(valor_total / duração_em_meses)` para contratos pontuais ativos.
   - ARR projetado = MRR × 12.
   - **Separação por tipo:** breakdown row abaixo dos cards principais — MRR(assessoria) / MRR(consultoria-pro-rata) / Receita pontual no período. NÃO em cards separados no topo.
   - **Duração para pro-rata:**
     - Se `data_fim` definido: `meses = ceil((data_fim - data_inicio) em dias / 30)`
     - Se `data_fim` ausente: trata como recorrente indefinido. Se só `valor_total` sem `data_fim`, assume 12 meses como default (registra warning silencioso).
   - **`valor_protegido`:** NÃO entra no MRR/ARR (provisão de risco, não receita realizável).

2. **Contratos sem `data_fim`:** ativos indefinidamente. Entram no MRR/ARR. Aparecem em seção secundária colapsada "sem renovação agendada".

3. **Método de Forecast (modelo realista, não otimista):**
   ```
   forecast[N] = MRR_atual
               + Σ(valor_mensal dos contratos que iniciam no mês N)
               - Σ(valor_mensal dos contratos com data_fim caindo no mês N que ainda não foram renovados)
   ```
   "Renovado" = contrato existente com `data_fim` futuro estendido (derivar de UPDATE em `data_fim`).

4. **Visualização de churn no gráfico:** Linha sólida (MRR realizado) + área pontilhada/sombreada (faixa "se nada renovar") para os 3 meses do forecast. Recharts `<Area>` com `strokeDasharray="5 5"` + `fillOpacity={0.2}`.

5. **Lista de Renovações Pendentes:** apenas `status='ativo'` com `data_fim` ≤ 90 dias. Excluídos: cancelados, expirados, sem `data_fim`. Agrupamento em 3 buckets: `≤ 30 dias`, `31-60 dias`, `61-90 dias`.

6. **Alerta visual ≤ 30 dias:** Badge `variant="destructive"` (shadcn) + ícone `AlertTriangle` (lucide) + ordenação automática no topo. Linha em si sem background — destaque no badge.

7. **Layout: tela única scroll vertical** (padrão `DashboardPage`):
   ```
   [Header: título + PeriodSelector + RequireRole]
   [Row 1: 4 Cards] MRR | ARR | Forecast 3m | Renovações ≤30d (count)
   [Row 2: Breakdown] MRR(assessoria) | MRR(consultoria pro-rata) | Receita pontual no período
   [Row 3: Gráfico] MRR 6 meses (LineChart) + faixa pontilhada de forecast
   [Row 4: Lista] Renovações pendentes (agrupadas 30/60/90)
   [Row 5 colapsado]: Contratos sem data_fim
   ```

8. **Drill-down dos cards:** click → navega para `/contratos` com filtros via URL (`useSearchParams`).

   | Card | URL alvo |
   |------|----------|
   | MRR | `/contratos?status=ativo` |
   | ARR projetado | `/contratos?status=ativo` |
   | Forecast | `/contratos?status=ativo&vencendo_em_dias=90` |
   | Renovações ≤30d | `/contratos?status=ativo&vencendo_em_dias=30` |

   **Implicação:** `ContratosPage` precisa aceitar o parâmetro `vencendo_em_dias`. Tooltip on-hover NÃO neste milestone.

### Claude's Discretion

- Organização interna do código (1 hook vs múltiplos, helpers em `src/lib/receita.ts` vs inline).
- Texto exato dos labels nos cards/empty states (mantendo PT-BR e tom do projeto).
- Decisões de cor/estilo dentro do design system existente (tokens HSL CSS variables, classes shadcn).
- Estrutura exata de testes unitários (mas devem seguir padrão `src/lib/__tests__/projecao.test.ts`).
- Decisão entre extrair sub-componentes (`MetricsCard`, `RenovacoesList`, `MrrChart`) ou manter tudo em `ReceitaPage.tsx` — preferir extrair se o arquivo passar de ~400 linhas (comparar com `RenovacoesPage` 191 linhas e `DashboardPage` 479 linhas).

### Deferred Ideas (OUT OF SCOPE)

- Tooltip on-hover detalhado nos cards (drill + tooltip combinados).
- Tabs separando histórico / renovações (postergado — tela única basta).
- Drill-down em cliques no gráfico (clicar num mês → ver contratos ativos naquele mês).
- Forecast com tendência extrapolada (linear regression) — só fará sentido com mais dados históricos.
- Lista "Contratos a revisitar" (sem data_fim com >180d de início) — possível phase 5+.
- Exportar dashboard para PDF/Excel.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrição | Suporte da Research |
|----|-----------|---------------------|
| REV-01 | Página `/receita` (coordenador+) com MRR, ARR projetado, forecast 3m, renovações 30/60/90 + separação por tipo de serviço | Hook `useContratos` já existe (`src/hooks/useContratos.ts:8-20`); `RequireRole atLeast="coordenador"` já é padrão (`AdocaoPage.tsx:97-103`); cálculo de MRR sobre `valor_mensal` já em uso (`AnalyticsPage.tsx:105-107`, `DashboardPage.tsx:74-75`); separação por `tipo` ('assessoria' / 'consultoria') já feita em `ContratosPage.tsx:341-342`. |
| REV-02 | Gráfico evolução MRR 6 meses (recharts) + `PeriodSelector` | `recharts ^3.8.0` instalado (`package.json:48`); `PeriodSelector` em `src/components/shared/PeriodSelector.tsx`; padrão de uso em `AnalyticsPage.tsx:279` e `DashboardPage.tsx`. Nota: nenhum uso atual de `<LineChart>` / `<Area>` / `<AreaChart>` — primeiro uso no projeto. |
| REV-03 | Lista renovações pendentes com alerta visual ≤ 30 dias | `getDaysUntilExpiry` já existe (`src/lib/utils.ts:36-39`); padrão completo de classificação por urgência (vencido/crítico/alto/médio) já implementado em `RenovacoesPage.tsx:19-33` — REUTILIZAR/EXTRAIR esses helpers. Cron de notificação `/api/cron-renovacoes` já roda (mencionado em `RenovacoesPage.tsx:185`). |
</phase_requirements>

## Summary

Esta fase é majoritariamente client-side: ler `contratos` via `useContratos` (hook existente), calcular MRR/ARR/forecast em memória (~100 contratos esperados — performance trivial) e renderizar com `recharts` + shadcn cards já em uso pelo projeto. **Nenhum novo pacote npm é necessário.** Nenhuma migration. Nenhuma edge function. Nenhuma RPC.

A maior parte do código existente é reusável: `formatCurrency`, `getDaysUntilExpiry`, `getContractProgress`, `PeriodSelector`, `RequireRole`, `useContratos`, padrões de cards do `DashboardPage`/`AnalyticsPage`, classificação de urgência do `RenovacoesPage`. O único "novo" é (1) o cálculo de MRR pro-rata + forecast realista e (2) o uso de `<LineChart>` / `<Area>` do recharts — primeiro no projeto, mas API estável e documentada.

**Cuidado principal:** já existe uma `RenovacoesPage` no sidebar (CLIENTES → Renovações). A `/receita` (Phase 4) NÃO é redundante: `RenovacoesPage` é uma agenda visual por mês, enquanto `/receita` foca em **valor financeiro agregado**. As duas devem coexistir, mas o planner precisa decidir explicitamente como diferenciar no sidebar (sugestão: nova entrada "Receita" em CLIENTES, acima ou abaixo de "Renovações").

**Primary recommendation:** criar `src/pages/ReceitaPage.tsx` + helpers puros em `src/lib/receita.ts` (testáveis isoladamente), gate com `RequireRole atLeast="coordenador"`, adicionar rota `/receita` em `router.tsx`, adicionar nav item gated no `Sidebar.tsx` (mesmo padrão de `/adocao`), estender `ContratosPage.tsx` para aceitar `?vencendo_em_dias=N` via `useSearchParams` (padrão LeadsPage).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Cálculo de MRR/ARR/forecast | Browser (cliente) | — | Volume baixo (~100 contratos); padrão do projeto é cálculo client-side (ver `AnalyticsPage`, `DashboardPage`). Evita complexidade de RPC/view. |
| Leitura de contratos | Browser via Supabase JS (PostgREST) | RLS no Postgres | Hook `useContratos` já existe; RLS role-aware da migration 029 já gate o acesso. Nada novo no backend. |
| Renderização de cards/gráfico/lista | Browser (React + recharts) | — | Sem SSR; padrão Vite SPA. |
| Gate de acesso `coordenador+` | Browser (`RequireRole`) | RLS (defense-in-depth) | UI guard via `RequireRole` (UX); proteção real continua sendo RLS — coordenador+ já lê tudo no schema atual. |
| Drill-down via URL | Browser (`useSearchParams`) | — | Padrão `LeadsPage.tsx:40` já adotado. Bookmarkable. |
| Notificação de renovação | Edge function / cron | Slack | **Já existe** (`/api/cron-renovacoes` mencionado em `RenovacoesPage.tsx:185`; migration `031_cron_renovacoes.sql`). Phase 4 NÃO toca aqui. |

## Standard Stack

### Core (todas já presentes)

| Lib | Version | Purpose | Evidência de uso |
|-----|---------|---------|-------------------|
| react | ^19.2.4 | UI | `package.json:43` |
| recharts | ^3.8.0 | Gráfico de linha + faixa de forecast | `package.json:48`, importado em `AnalyticsPage.tsx:11-14` e `DashboardPage.tsx:14` |
| @tanstack/react-query | ^5.90.21 | Cache do `useContratos` | `package.json:37`; `useContratos` já é `useQuery` (`src/hooks/useContratos.ts:9`) |
| react-router-dom | ^7.13.1 | Rota `/receita`, `useNavigate`, `useSearchParams` | `package.json:46`; padrão em `LeadsPage.tsx:2,40` |
| date-fns | ^4.1.0 | `differenceInDays`, `differenceInCalendarMonths`, `startOfMonth`, `addMonths` para forecast | Usado em `useContratos.ts:5,103`, `projecao.ts:9` |
| lucide-react | ^0.577.0 | Ícones: `DollarSign`, `TrendingUp`, `TrendingDown`, `Calendar`, `AlertTriangle`, `BarChart3` | Já em uso |
| sonner | ^2.0.7 | Toasts (não esperado nesta fase, mas disponível) | `package.json:49` |

### Supporting (já presentes)

| Asset | Onde está | Como reusar |
|-------|-----------|-------------|
| `formatCurrency(value)` | `src/lib/utils.ts:10-13` | BRL com `Intl.NumberFormat('pt-BR')` — usar como está |
| `getDaysUntilExpiry(dataFim)` | `src/lib/utils.ts:36-39` | Retorna `number \| null`; usar para classificar bucket |
| `getContractProgress(start, end)` | `src/lib/utils.ts:25-34` | Não estritamente necessário aqui (já temos só a lista), mas disponível |
| `PeriodSelector` + `getPeriodRange`, `isInRange`, `availableYears` | `src/components/shared/PeriodSelector.tsx`, `src/lib/periods.ts` | API estável; usar `derivedYearsFrom={contratos}` igual `AnalyticsPage.tsx:279` |
| `RequireRole atLeast="coordenador"` | `src/components/shared/RequireRole.tsx:17-31` | Wrap igual `AdocaoPage.tsx:97-103` |
| `useContratos()` | `src/hooks/useContratos.ts:8-20` | Já faz `select('*, cliente:clientes(...)')`; cache `QUERY_KEYS.contratos.all` |
| `Card`/`CardContent`/`CardHeader`/`CardTitle` (shadcn) | `src/components/ui/card.tsx` | Padrão em todas as páginas |
| `Badge variant="destructive"` (shadcn) | `src/components/ui/badge.tsx` | Para alerta ≤30d |
| `EmptyState` (shadcn-style) | `src/components/ui/empty-state.tsx` | Usado quando lista vazia (`RenovacoesPage.tsx:122-127`) |
| `ResponsavelBadge` | `src/components/shared/ResponsavelBadge.tsx` | Para exibir consultor responsável na lista |
| `URGENCIA_STYLE` map | Inline em `RenovacoesPage.tsx:19-25` | **CONSIDERAR EXTRAIR** para `src/lib/renovacoes.ts` ou similar — duas páginas vão usar a mesma classificação |
| `classifyUrgency(daysLeft)` | Inline em `RenovacoesPage.tsx:27-33` | **CONSIDERAR EXTRAIR** pelo mesmo motivo |

### Alternatives Considered

| Em vez de | Poderia usar | Tradeoff |
|-----------|--------------|----------|
| Cálculo client-side em memória | View SQL ou RPC `calcular_mrr()` | View seria mais cara em complexidade vs ganho. Volume baixo (~100 contratos) torna client-side trivial. Mantém consistência com `AnalyticsPage`. |
| `<LineChart>` + `<Area>` | `<AreaChart>` puro com 2 séries (passada/futura) | `<LineChart>` com `<Area>` sobreposto permite combinar linha sólida (MRR realizado) + faixa pontilhada (forecast). É exatamente o pedido da decisão 4. |
| Adicionar rota `/receita` paralela a `/renovacoes` | Renomear `/renovacoes` → `/receita` (consolidar) | Diferenciação proposital — `/renovacoes` é agenda visual mensal, `/receita` é financeiro agregado. Não consolidar sem aprovação explícita. |

**Instalação:** nada a instalar. `npm install` não é necessário.

**Verificação de versões** (2026-05-26):
- `recharts ^3.8.0` em `package.json:48` — última major estável; API `LineChart`/`Area` estável desde 2.x. Verificado.
- `react-router-dom ^7.13.1` — `useSearchParams` API estável.
- `@tanstack/react-query ^5.90.21` — `useQuery` API estável.

## Package Legitimacy Audit

**Não aplicável.** Esta fase **não instala pacotes novos**. Todos os imports vêm de dependências já presentes em `package.json` e em produção. Auditoria de slopcheck é pulada por ausência de novos packages.

## Architecture Patterns

### System Architecture Diagram

```
[Browser]
   |
   v
+-----------------------------------+
| /receita route (router.tsx)       |
| element=<ReceitaPage>             |
+-----------------------------------+
   |
   v
+-----------------------------------+
| <RequireRole atLeast="coordenador">
|   <ReceitaPageContent />          |
| </RequireRole>                    |
+-----------------------------------+
   |
   v
+-----------------------------------+      +--------------------------+
| useContratos()  (TanStack Query)  | ---> | Supabase PostgREST       |
| QUERY_KEYS.contratos.all          |      | SELECT * FROM contratos  |
| staleTime:60s (global default)    |      | (RLS role-aware migration|
+-----------------------------------+      |  029 aplicada)           |
   |                                       +--------------------------+
   v
+-----------------------------------+
| src/lib/receita.ts (helpers puros)|
|  - calcularMrr(contratos): {      |
|      total, assessoria,           |
|      consultoria, pontual         |
|    }                              |
|  - calcularMrrHistorico(          |
|      contratos, months=6          |
|    ): {month, mrr}[]              |
|  - calcularForecast(              |
|      contratos, mrrAtual, 3       |
|    ): {month, baseline, low}[]    |
|  - classificarRenovacoes(         |
|      contratos                    |
|    ): {ate30, de31a60, de61a90,   |
|        semDataFim}                |
+-----------------------------------+
   |
   v
+-----------------------------------+
| ReceitaPage render                |
|  Row1: 4 KPI Cards (onClick →     |
|        useNavigate /contratos?... |
|  Row2: Breakdown row              |
|  Row3: <LineChart> 6 meses + 3m   |
|        forecast (Area dashed)     |
|  Row4: Lista renovações (3 buckets|
|  Row5: Sem data_fim (colapsada)   |
+-----------------------------------+
   |
   v (drill-down)
+-----------------------------------+
| /contratos?status=ativo&          |
|   vencendo_em_dias=30             |
| ContratosPage lê via              |
| useSearchParams, filtra lista     |
+-----------------------------------+
```

### Recommended Project Structure

```
src/
├── pages/
│   └── ReceitaPage.tsx          # NEW — orquestra hooks + helpers + render
├── lib/
│   ├── receita.ts               # NEW — calcularMrr / calcularForecast / classificarRenovacoes (puros)
│   └── __tests__/
│       └── receita.test.ts      # NEW — segue padrão de projecao.test.ts
├── components/
│   └── receita/                 # OPCIONAL — se ReceitaPage passar de ~400 linhas
│       ├── MrrChart.tsx
│       ├── RenovacoesBucket.tsx
│       └── MetricsCardLink.tsx
└── pages/
    └── ContratosPage.tsx        # EDIT — aceitar ?vencendo_em_dias=N
```

### Pattern 1: Helper puro testável (segue `projecao.ts`)

**O que:** lógica de cálculo (MRR, forecast, classificação) extraída como funções puras que aceitam `Contrato[]` e opcional `{ today: Date }`.

**Quando usar:** sempre que houver cálculo determinístico testável — segue exatamente o padrão de `src/lib/projecao.ts:35-76` (testes em `src/lib/__tests__/projecao.test.ts` injetam `TODAY`).

**Exemplo (referência: `src/lib/projecao.ts`):**

```typescript
// src/lib/receita.ts
import { differenceInDays, startOfMonth, addMonths } from 'date-fns'
import type { Contrato } from '@/types'

export interface MrrBreakdown {
  total: number
  assessoria: number
  consultoriaProRata: number
}

interface Options {
  today?: Date
  defaultPontualMonths?: number  // default 12 — usado quando valor_total sem data_fim
}

const ACTIVE = 'ativo'

function mensesDoContrato(c: Contrato, defaultPontualMonths: number): number {
  if (c.data_inicio && c.data_fim) {
    const days = differenceInDays(new Date(c.data_fim), new Date(c.data_inicio))
    return Math.max(1, Math.ceil(days / 30))
  }
  return defaultPontualMonths
}

function contribuicaoMensal(c: Contrato, defaultPontualMonths: number): number {
  if (c.valor_mensal && c.valor_mensal > 0) return c.valor_mensal
  if (c.valor_total && c.valor_total > 0) {
    return c.valor_total / mensesDoContrato(c, defaultPontualMonths)
  }
  return 0
}

export function calcularMrr(contratos: Contrato[], opt: Options = {}): MrrBreakdown {
  const defaultPontual = opt.defaultPontualMonths ?? 12
  const ativos = contratos.filter(c => c.status === ACTIVE)
  let assessoria = 0
  let consultoria = 0
  for (const c of ativos) {
    const v = contribuicaoMensal(c, defaultPontual)
    if (c.tipo === 'assessoria') assessoria += v
    else consultoria += v
  }
  return { total: assessoria + consultoria, assessoria, consultoriaProRata: consultoria }
}
```

### Pattern 2: Drill-down via URL (segue `LeadsPage.tsx`)

**O que:** cards "navegam" para `/contratos` com query params; `ContratosPage` lê via `useSearchParams` e aplica filtros.

**Quando usar:** drill-down bookmarkable / compartilhável.

**Exemplo (de `LeadsPage.tsx:40-59`):**
```typescript
const [searchParams, setSearchParams] = useSearchParams()
const statusFilter = searchParams.get('status') ?? 'todos'

function setFilter(name: string, value: string, defaultValue = 'todos') {
  const next = new URLSearchParams(searchParams)
  if (value === defaultValue) next.delete(name)
  else next.set(name, value)
  setSearchParams(next, { replace: true })
}
```

**Para `/contratos?vencendo_em_dias=N`:**
- `ContratosPage` lê `searchParams.get('vencendo_em_dias')` (string).
- Se presente e numérico, aplica filtro adicional: `getDaysUntilExpiry(c.data_fim) !== null && getDaysUntilExpiry(c.data_fim) <= N && getDaysUntilExpiry(c.data_fim) >= 0`.
- Se ausente, comportamento atual permanece intocado.
- **CRÍTICO:** o filtro `vencendo_em_dias` precisa coexistir com `statusFilter` / `tipoFilter` / `rmFilter` atuais (composição AND); apenas adicione um novo predicate no `useMemo` filtered, não substitua os existentes.

### Pattern 3: Gate de role (segue `AdocaoPage`)

```typescript
// src/pages/ReceitaPage.tsx
import { RequireRole } from '@/components/shared/RequireRole'

function ReceitaPageContent() { /* ...todo o conteúdo... */ }

export function ReceitaPage() {
  return (
    <RequireRole atLeast="coordenador">
      <ReceitaPageContent />
    </RequireRole>
  )
}
```

### Pattern 4: Recharts LineChart + Area sobreposta

**Primeira aparição de `LineChart`/`AreaChart` no projeto.** API padrão recharts 3.x:

```typescript
import { LineChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

// data: [{month: 'Dez/25', mrr: 12000, forecastLow: null, forecastHigh: null}, ..., {month: 'Jul/26', mrr: null, forecastLow: 14000, forecastHigh: 18000}]

<ResponsiveContainer width="100%" height={280}>
  <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }} />
    <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }} />
    <Tooltip
      formatter={(v: number) => formatCurrency(v)}
      contentStyle={{ background: '#0d1929', border: '1px solid var(--alpha-border-md)', color: 'rgba(220,230,240,0.90)', borderRadius: 8 }}
    />
    <ReferenceLine x="Hoje" stroke="var(--alpha-border-md)" strokeDasharray="3 3" />
    {/* Linha sólida: MRR realizado/atual */}
    <Line type="monotone" dataKey="mrr" stroke="#0089ac" strokeWidth={2} dot={{ r: 3 }} connectNulls />
    {/* Faixa pontilhada: forecast (entre low e high) */}
    <Area type="monotone" dataKey="forecastHigh" stroke="#0089ac" strokeDasharray="5 5" fill="#0089ac" fillOpacity={0.15} />
    <Area type="monotone" dataKey="forecastLow" stroke="#0089ac" strokeDasharray="5 5" fill="#0a1929" fillOpacity={1} />
  </LineChart>
</ResponsiveContainer>
```

**Estilo do tooltip** (palette do projeto — visto em `AnalyticsPage.tsx:417`):
```typescript
contentStyle={{ background: '#0d1929', border: '1px solid var(--alpha-border-md)', color: 'rgba(220,230,240,0.90)', borderRadius: 8 }}
```

**Cor de série padrão:** `#0089ac` (cyan CONSEJ, ver `COLORS` em `AnalyticsPage.tsx:27`).

### Anti-Patterns to Avoid

- **Criar nova migration ou RPC para MRR.** Volume baixo + lógica em evolução = client-side. Se um dia precisar mover para Postgres, helpers em `src/lib/receita.ts` são portáveis para uma view.
- **Duplicar `URGENCIA_STYLE`/`classifyUrgency` de `RenovacoesPage`.** Extrair para `src/lib/receita.ts` (ou novo `src/lib/renovacoes.ts`) e importar em ambas. Senão divergem.
- **Substituir filtros existentes do `ContratosPage` ao adicionar `vencendo_em_dias`.** É composição AND, não substituição.
- **Renderizar lista pesada (>100 contratos) sem virtualização.** ~100 está OK. Se passar de 500, considerar — mas não nesta fase.
- **Hard-codear o número de meses do histórico (6).** Aceitar prop `historicoMeses = 6` no helper para reuso futuro.
- **Usar `<Tabs>` para separar histórico/renovações.** Explicitamente fora do escopo (CONTEXT.md decisão 7 + Deferred).
- **Adicionar tooltip on-hover nos cards do topo.** Explicitamente fora do escopo (CONTEXT.md decisão 8 + Deferred).
- **Ler/escrever `localStorage` para state da página.** Use `useSearchParams` (bookmarkable) ou `useState` local.

## Don't Hand-Roll

| Problema | Não construir | Use | Por quê |
|----------|---------------|-----|---------|
| Formatação BRL | `'R$ ' + v.toFixed(2)` | `formatCurrency` (`src/lib/utils.ts:10`) | Já usa `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, com tratamento de null/undefined |
| Dias até vencer | Cálculo inline com `new Date()` | `getDaysUntilExpiry(dataFim)` (`src/lib/utils.ts:36`) | Trata null + usa `differenceInDays` do `date-fns` |
| Range de período / filtragem | Lógica custom de `>=` / `<=` | `getPeriodRange(period)` + `isInRange(date, range)` (`src/lib/periods.ts:59-83`) | Padrão canônico do projeto |
| Lista de anos no selector | Hardcoded `[2025, 2024]` | `availableYears(contratos)` (`src/lib/periods.ts:87`) ou `derivedYearsFrom={contratos}` | Auto-detecta anos com dados |
| Classificação por urgência (vencido/30d/60d/90d) | Reimplementar | Extrair `classifyUrgency` de `RenovacoesPage.tsx:27-33` | DRY + consistência visual |
| Gráfico de linha | SVG manual | recharts `<LineChart>` + `<Area>` | Já instalado; cobre tooltip, eixos, responsive |
| Empty state | Markup ad-hoc | `<EmptyState icon={DollarSign} title="..." description="..." />` (`src/components/ui/empty-state.tsx`) | Padrão visual unificado |
| Card layout | `<div>` raw | `<Card><CardContent>...</CardContent></Card>` (shadcn) | Estilo de borda/padding padronizado |
| Badge "vencendo" | `<span>` raw | `<Badge variant="destructive">...</Badge>` | Token de cor consistente |
| Navegação programática | `window.location.href = '/contratos?...'` | `const navigate = useNavigate(); navigate('/contratos?status=ativo&vencendo_em_dias=30')` | SPA; preserva router state |

**Key insight:** ~80% dos building blocks dessa página já existem no codebase. O trabalho real é (a) escrever os helpers puros de cálculo de MRR/forecast em `src/lib/receita.ts`, (b) compor a página seguindo padrão `DashboardPage`/`AnalyticsPage`, (c) extender `ContratosPage` para aceitar `?vencendo_em_dias`, e (d) registrar rota + nav item. Estimativa: ~400 linhas líquidas de código novo + ~150 linhas de teste.

## Runtime State Inventory

**Não aplicável** — Phase 4 é uma feature greenfield (nova página, nova rota, novos helpers). Não há rename, refactor, migração de dados, nem renomeação de strings com presença em runtime state externo.

Confirmação por categoria:
- **Stored data:** N/A — não há cache externo ou bucket que precise de migração para renderizar a página.
- **Live service config:** N/A — não há novo webhook, edge function ou serviço externo nesta fase.
- **OS-registered state:** N/A — sem jobs novos. O cron `/api/cron-renovacoes` que já roda permanece intocado.
- **Secrets/env vars:** N/A — nenhuma nova env var.
- **Build artifacts:** N/A — sem novos pacotes.

## Common Pitfalls

### Pitfall 1: Confundir `valor_protegido` com receita realizável
**O que acontece:** somar `valor_protegido` no MRR/ARR — inflando métricas falsamente.
**Por que acontece:** o campo está na mesma interface `Contrato` (`src/types/index.ts:90`) e parece "valor financeiro".
**Como evitar:** `valor_protegido` representa provisão de risco (exposição em caso de inadimplência/litígio), NÃO receita. Excluído do MRR por decisão explícita (CONTEXT.md §1). **Não referenciar `valor_protegido` em nenhum helper de `src/lib/receita.ts`.**
**Sinais de alerta:** ARR/MRR notavelmente maior do que faturamento real do mês anterior.

### Pitfall 2: `staleTime` global de 60s + drill-down levam a dado desatualizado
**O que acontece:** usuário cria contrato em `/contratos`, navega para `/receita`, vê valor antigo por até 60s.
**Por que acontece:** `QueryClient` global está com `staleTime: 60_000` (`src/main.tsx:10-17`), e `useContratos` não invalida queries de `receita` (nem precisaria, são a mesma key).
**Como evitar:** mesma `QUERY_KEYS.contratos.all` já é invalidada por `useCreateContrato`/`useUpdateContrato`/`useDeleteContrato` (`src/hooks/useContratos.ts:47,137,153`). A página `/receita` deve reagir corretamente. **Verificar manualmente no smoke test:** criar contrato → ir para `/receita` → MRR atualizado.
**Sinais de alerta:** valor "estável" mesmo após mutações; em dev, abrir React Query devtools (não está instalado por padrão, mas confirmar via console).

### Pitfall 3: Forecast quebrar quando `data_fim` é null
**O que acontece:** `forecast[N]` tenta subtrair contratos sem `data_fim` e quebra (`null` em comparação de datas → `NaN`).
**Por que acontece:** muitos contratos legados podem ter `data_fim` null (e a decisão CONTEXT.md §2 explicitamente trata isso como "indefinido").
**Como evitar:** no helper `calcularForecast`, filtrar `data_fim != null` ANTES de incluir em "saídas previstas". Contratos sem `data_fim` só contribuem para o `MRR_atual` (entrada permanente).
**Sinais de alerta:** valores `NaN` ou `Infinity` no gráfico; eixo Y com escala estranha.

### Pitfall 4: Pro-rata divide por zero quando `data_inicio == data_fim`
**O que acontece:** contrato com mesma data de início e fim → `differenceInDays = 0` → `meses = 0` → `valor_total / 0 = Infinity`.
**Por que acontece:** dados sujos em produção (importação Pipefy, contratos cancelados na mesma data).
**Como evitar:** `Math.max(1, Math.ceil(days / 30))` no cálculo de meses — garante mínimo de 1 mês. Padrão idêntico ao usado em `getContractProgress` (que retorna 100% se `total <= 0`).
**Sinais de alerta:** Cards mostrando `R$ Infinity` ou `R$ NaN`.

### Pitfall 5: `<Area>` com `connectNulls={true}` "vazar" no histórico
**O que acontece:** desenha a faixa de forecast em cima dos meses passados (poluição visual).
**Por que acontece:** se a série `forecastHigh`/`forecastLow` for `null` no histórico mas `connectNulls={true}`, recharts interpola.
**Como evitar:** **NÃO usar `connectNulls`** na série de forecast. Usar APENAS em `<Line dataKey="mrr">` para conectar o último ponto realizado ao primeiro de forecast (suavidade da transição). Validar visualmente.
**Sinais de alerta:** sombreado/faixa aparecendo em meses passados que deveriam ter só a linha sólida.

### Pitfall 6: Filtro `vencendo_em_dias` em `ContratosPage` quebrar filtros existentes
**O que acontece:** ao adicionar o predicate novo no `useMemo` filtered (`ContratosPage.tsx:335-361`), substituir ou conflitar com `statusFilter`/`tipoFilter` existentes.
**Por que acontece:** o `useMemo` atual já é composição AND complexa; adicionar sem cuidado pode introduzir bug.
**Como evitar:**
1. Ler `const vencendoEmDias = searchParams.get('vencendo_em_dias')` → `Number(...)` ou `null`.
2. Adicionar APENAS um predicate extra ao chain do filter existente: `if (vencendoEmDias !== null) { const d = getDaysUntilExpiry(c.data_fim); if (d === null || d < 0 || d > vencendoEmDias) return false }`.
3. **Não tocar nos filtros UI existentes** (`tipoFilter`, `statusFilter`, `rmFilter`, `scope`, `search`).
4. Adicionar teste de regressão simples ou smoke manual: visitar `/contratos` sem param → comportamento idêntico ao atual.
**Sinais de alerta:** lista de `/contratos` (sem param) mudou após o deploy.

### Pitfall 7: Confusão `ContratosPage` `status === 'ativo'` vs `'encerrado'` vs `'suspenso'`
**O que acontece:** o schema (`001_initial_schema.sql:142`) define `ativo | encerrado | suspenso`. `RenovacoesPage` filtra só `ativo`. Decisão CONTEXT.md §5 também só `ativo`. Mas `STATUS_CONTRACT_TABS` em `ContratosPage.tsx:309-313` só mostra "Ativos / Encerrados" (não "Suspensos") — então `?status=ativo` cobre exatamente o caso esperado.
**Como evitar:** ao testar drill-down, confirmar que `?status=ativo` filtra somente `c.status === 'ativo'` (não inclui suspensos). Padrão atual já está correto.

### Pitfall 8: PeriodSelector aplicado mas não usado no gráfico
**O que acontece:** colocar `<PeriodSelector>` no header por hábito visual, mas o gráfico MRR é "últimos 6 meses retroativos a HOJE" — independente do ano selecionado.
**Por que acontece:** Decisão 7 do CONTEXT.md mostra `[Header: título + PeriodSelector + RequireRole]`, mas o resto do layout não explicita onde o `PeriodSelector` afeta.
**Como evitar:** **Esclarecer no plano:** o `PeriodSelector` no header serve para filtrar o que aparece na seção "Receita pontual no período" (Row 2) e potencialmente reposicionar a janela de 6 meses do gráfico. O forecast 3m permanece sempre a partir de "hoje". Se ambiguidade persistir, sugerir descartar o PeriodSelector nesta fase (gráfico fixo "últimos 6 meses + próximos 3") e deferir filtro de período para fase futura.

## Code Examples

### Cálculo de MRR (helper puro)

```typescript
// src/lib/receita.ts
import { differenceInDays } from 'date-fns'
import type { Contrato } from '@/types'

interface MrrOptions {
  defaultPontualMonths?: number
}

function mesesContrato(c: Contrato, defaultPontual: number): number {
  if (c.data_inicio && c.data_fim) {
    const days = differenceInDays(new Date(c.data_fim), new Date(c.data_inicio))
    return Math.max(1, Math.ceil(days / 30))
  }
  return defaultPontual
}

export function contribuicaoMensal(c: Contrato, opt: MrrOptions = {}): number {
  const defaultPontual = opt.defaultPontualMonths ?? 12
  if (c.valor_mensal && c.valor_mensal > 0) return c.valor_mensal
  if (c.valor_total && c.valor_total > 0) {
    return c.valor_total / mesesContrato(c, defaultPontual)
  }
  return 0
}

export interface MrrBreakdown {
  total: number
  assessoria: number
  consultoriaProRata: number
}

export function calcularMrr(contratos: Contrato[], opt: MrrOptions = {}): MrrBreakdown {
  const ativos = contratos.filter(c => c.status === 'ativo')
  let assessoria = 0
  let consultoria = 0
  for (const c of ativos) {
    const v = contribuicaoMensal(c, opt)
    if (c.tipo === 'assessoria') assessoria += v
    else consultoria += v
  }
  return { total: assessoria + consultoria, assessoria, consultoriaProRata: consultoria }
}
```

### Forecast 3 meses (helper puro)

```typescript
// src/lib/receita.ts (continuação)
import { startOfMonth, addMonths, isWithinInterval, endOfMonth } from 'date-fns'

interface ForecastOptions extends MrrOptions {
  today?: Date
  months?: number   // default 3
}

export interface ForecastPoint {
  monthKey: string         // 'YYYY-MM'
  monthLabel: string       // 'jul/26'
  baseline: number         // MRR atual + entradas - saídas
}

export function calcularForecast(
  contratos: Contrato[],
  opt: ForecastOptions = {}
): ForecastPoint[] {
  const today = opt.today ?? new Date()
  const months = opt.months ?? 3
  const mrrAtual = calcularMrr(contratos, opt).total
  const points: ForecastPoint[] = []
  let runningMrr = mrrAtual

  for (let i = 1; i <= months; i++) {
    const target = addMonths(startOfMonth(today), i)
    const targetStart = target
    const targetEnd = endOfMonth(target)

    // Entradas: contratos com data_inicio caindo neste mês
    const entradas = contratos
      .filter(c => c.status === 'ativo' && c.data_inicio)
      .filter(c => isWithinInterval(new Date(c.data_inicio!), { start: targetStart, end: targetEnd }))
      .reduce((s, c) => s + contribuicaoMensal(c, opt), 0)

    // Saídas: contratos com data_fim caindo neste mês (ignora null)
    const saidas = contratos
      .filter(c => c.status === 'ativo' && c.data_fim)
      .filter(c => isWithinInterval(new Date(c.data_fim!), { start: targetStart, end: targetEnd }))
      .reduce((s, c) => s + contribuicaoMensal(c, opt), 0)

    runningMrr = runningMrr + entradas - saidas
    points.push({
      monthKey: `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: target.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      baseline: runningMrr,
    })
  }
  return points
}
```

### Histórico de MRR 6 meses (helper puro)

```typescript
// src/lib/receita.ts (continuação)
import { subMonths } from 'date-fns'

export interface MrrHistoryPoint {
  monthKey: string
  monthLabel: string
  mrr: number
}

/**
 * Reconstrói o MRR retroativo: para cada mês N do histórico, soma contribuição mensal
 * dos contratos cujo {data_inicio <= fim_do_mes_N} && {data_fim == null || data_fim >= inicio_do_mes_N}.
 */
export function calcularMrrHistorico(
  contratos: Contrato[],
  opt: { today?: Date; months?: number } & MrrOptions = {}
): MrrHistoryPoint[] {
  const today = opt.today ?? new Date()
  const months = opt.months ?? 6
  const points: MrrHistoryPoint[] = []
  for (let i = months - 1; i >= 0; i--) {
    const target = subMonths(startOfMonth(today), i)
    const targetStart = target
    const targetEnd = endOfMonth(target)
    const ativosNoMes = contratos.filter(c => {
      if (!c.data_inicio) return false
      const inicio = new Date(c.data_inicio)
      const fim = c.data_fim ? new Date(c.data_fim) : null
      // ativo no mes alvo se começou antes/durante e (não tem fim OU termina depois/durante)
      return inicio <= targetEnd && (fim === null || fim >= targetStart)
    })
    const mrr = ativosNoMes.reduce((s, c) => s + contribuicaoMensal(c, opt), 0)
    points.push({
      monthKey: `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: target.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      mrr,
    })
  }
  return points
}
```

### Classificação de renovações (DRY com RenovacoesPage)

```typescript
// src/lib/receita.ts (continuação) — OU src/lib/renovacoes.ts (novo)
import { getDaysUntilExpiry } from '@/lib/utils'

export type Urgencia = 'vencido' | 'critico' | 'alto' | 'medio' | 'baixo'

export function classifyUrgency(daysLeft: number): Urgencia {
  if (daysLeft < 0)   return 'vencido'
  if (daysLeft <= 30) return 'critico'
  if (daysLeft <= 60) return 'alto'
  if (daysLeft <= 90) return 'medio'
  return 'baixo'
}

export interface RenovacoesBuckets {
  ate30: (Contrato & { daysLeft: number })[]
  de31a60: (Contrato & { daysLeft: number })[]
  de61a90: (Contrato & { daysLeft: number })[]
  semDataFim: Contrato[]
}

export function classificarRenovacoes(contratos: Contrato[]): RenovacoesBuckets {
  const result: RenovacoesBuckets = { ate30: [], de31a60: [], de61a90: [], semDataFim: [] }
  for (const c of contratos) {
    if (c.status !== 'ativo') continue
    if (!c.data_fim) { result.semDataFim.push(c); continue }
    const d = getDaysUntilExpiry(c.data_fim)
    if (d === null) continue
    if (d < 0 || d > 90) continue
    const item = { ...c, daysLeft: d }
    if (d <= 30) result.ate30.push(item)
    else if (d <= 60) result.de31a60.push(item)
    else result.de61a90.push(item)
  }
  // Ordenar por daysLeft crescente dentro de cada bucket (mais urgente primeiro)
  result.ate30.sort((a, b) => a.daysLeft - b.daysLeft)
  result.de31a60.sort((a, b) => a.daysLeft - b.daysLeft)
  result.de61a90.sort((a, b) => a.daysLeft - b.daysLeft)
  return result
}
```

**Após extrair:** atualizar `RenovacoesPage.tsx:19-33` para importar `classifyUrgency` em vez de redeclarar. (Refactor opcional mas recomendado.)

### Rota + Sidebar (padrão exato AdocaoPage)

```typescript
// src/router.tsx — adicionar
import { ReceitaPage } from '@/pages/ReceitaPage'
// dentro do array de children do AppLayout:
{ path: 'receita', element: <ReceitaPage /> },
```

```typescript
// src/components/layout/Sidebar.tsx — dentro do map de NAV_GROUPS, após linha 164
{group.label === 'CLIENTES' && isCoordenadorOrAcima && <NavItem to="/receita" label="Receita" icon={DollarSign} />}
// + import { DollarSign } from 'lucide-react' (já está importado em DashboardPage; conferir Sidebar imports)
```

(Sidebar usa `Coins` para "Portal Tokens" — `DollarSign` ou `TrendingUp` são opções para "Receita". Conferir o que melhor encaixa no design no momento do PR.)

## State of the Art

| Abordagem antiga | Abordagem atual | Quando mudou | Impacto |
|------------------|-----------------|--------------|---------|
| MRR só sobre `valor_mensal` (`DashboardPage.tsx:74-75`, `AnalyticsPage.tsx:105-107`) | MRR pro-rata unificado (valor_mensal + valor_total/duração) | Phase 4 (decisão CONTEXT.md §1) | Vai diferir do que aparece no Dashboard atual. **Considerar atualizar `DashboardPage`/`AnalyticsPage` para usar `calcularMrr` do helper, ou deixar divergir e documentar.** (Recomendação: planner decidir; provavelmente deferir consolidação para evitar escopo creep.) |
| Sem forecast | Forecast 3m baseline = MRR + entradas - saídas | Phase 4 | Nova capability — não substitui nada. |
| Classificação de urgência inline em `RenovacoesPage` | Extrair para `src/lib/receita.ts` (ou `renovacoes.ts`) | Phase 4 (recomendação) | DRY. Reduz risco de divergência. |

**Deprecated/outdated nesta fase:** nada. Phase 4 é incremento.

## Assumptions Log

| # | Claim | Section | Risk se errado |
|---|-------|---------|----------------|
| A1 | Volume de contratos em produção é ~100 ou menos | Summary, Pitfall 5 | Se for muito maior (>1k), cálculo client-side em cada render fica lento. **Mitigação:** wrap helpers em `useMemo`. **Verificar antes do plano:** rodar query em prod (`SELECT COUNT(*) FROM contratos WHERE status='ativo'`) ou estimar via histórico. Sem acesso direto à prod nesta pesquisa. |
| A2 | `recharts <Line>` + `<Area>` no mesmo `<LineChart>` funciona como descrito | Pattern 4 | API testada via documentação oficial recharts, mas primeira aparição no projeto. Risco de cosmético (linha + área desalinhadas). **Mitigação:** prototipar em wave inicial; ajustar visual antes de polir. |
| A3 | "Renovado" pode ser derivado de UPDATE em `data_fim` sem campo formal | CONTEXT.md §3 (locked) | Locked. Se não houver UPDATEs (contratos sempre criados novos), forecast vai considerar todos como saída. Verificar com o time CONSEJ: como eles processam renovação hoje? **Esta é uma assumption do user, não da research.** |
| A4 | `vencendo_em_dias` é a única adição que `ContratosPage` precisa para o drill-down | Pitfall 6 | Se a UX desejar destacar visualmente os filtros vindos por URL (badge "filtrado por receita"), seria adicional. CONTEXT.md não pede isso explicitamente. **Recomendação:** começar minimal; user testa; iterar. |
| A5 | Não há cron job ou webhook que dependa de uma view/RPC chamada "mrr_*" | Runtime State Inventory | Verificado por grep — `Grep "mrr\|receita" supabase/migrations` retornou apenas a string `mrr` em código TS. Sem migrations relacionadas. Baixo risco. |
| A6 | `RequireRole atLeast="coordenador"` continua sendo o gate correto para "ver receita" | Locked (CONTEXT.md) | Locked. Implementação trivial. |
| A7 | Nenhum teste novo é obrigatório por gate de CI (`workflow.nyquist_validation` ativo mas projeto não tem CI gate hoje) | Validation Architecture | Verificado em `.planning/codebase/TESTING.md` (linha 287-291): "No CI gate today". Testes recomendados mas não bloqueantes. |

## Open Questions

1. **Como o time CONSEJ processa renovação na prática?**
   - O que sabemos: schema tem `status='em_renovacao'` em `clientes` (`migration 001:77`), mas em `contratos` só `ativo|encerrado|suspenso`. Migration `026_renovacao_notif.sql` cria tabela `notificacoes_renovacao` (cron envia DM Slack 30/14/7d antes). Mas não há campo `renovado_de` ou `contrato_renovacao_id`.
   - O que não está claro: quando renovam, criam novo contrato + encerram o velho? Ou apenas atualizam `data_fim` no contrato existente? A decisão CONTEXT.md §3 assume o segundo ("UPDATE em `data_fim`").
   - Recomendação: planner adicionar uma checkpoint humana antes da Wave 2 para confirmar com o usuário. Se forem novos contratos, a fórmula de forecast precisa ajustar (procurar contratos novos do mesmo cliente, não só estender data_fim).

2. **`PeriodSelector` no header — afeta o quê?**
   - O que sabemos: layout pede `PeriodSelector` no header (CONTEXT.md §7), mas o gráfico é "últimos 6 meses" e o forecast é "próximos 3 meses" — ambos relativos a HOJE.
   - O que não está claro: o `PeriodSelector` filtra "Receita pontual no período" (Row 2)? Ou filtra o histórico do gráfico?
   - Recomendação: planner especificar no PLAN. Default sugerido: `PeriodSelector` filtra apenas "Receita pontual no período" (cálculo de valor_total de contratos `tipo='consultoria'` com `data_inicio` no range). Gráfico de MRR sempre últimos 6m. Forecast sempre próximos 3m a partir de hoje. Documentar no help text.

3. **Quantos contratos hoje em produção?**
   - O que sabemos: zero `INSERT INTO contratos` em migrations (não vem por seed). Vem de uso real + importação Pipefy (`scripts/migrate-contratos-pipefy.mjs`).
   - O que não está claro: 50? 200? 500?
   - Recomendação: planner adicionar tarefa "smoke check de produção" que pede ao operador rodar `SELECT count(*) FROM contratos WHERE status='ativo'` antes de o entregar. Se >500, considerar otimização (memoização agressiva, ou paginação no histórico).

4. **Atualizar `DashboardPage`/`AnalyticsPage` para usar `calcularMrr`?**
   - O que sabemos: ambos calculam MRR só sobre `valor_mensal` (`DashboardPage.tsx:74-75`, `AnalyticsPage.tsx:105-107`). Diferente da nova fórmula pro-rata.
   - O que não está claro: se mantém divergência (decisão do user CONTEXT.md §1 só fala da nova página) ou consolida.
   - Recomendação: **deixar como está nesta fase** (escopo creep) e abrir issue/checkpoint para fase futura de consolidação. Documentar a divergência no help text de `/receita`.

## Environment Availability

**Não aplicável.** Phase 4 é code-only sobre stack já em produção:

| Dependência | Requerida por | Disponível | Versão | Fallback |
|-------------|---------------|------------|--------|----------|
| Node.js 20+ | Build local | ✓ (CLAUDE.md exige) | — | — |
| recharts 3.x | Gráfico MRR | ✓ | ^3.8.0 (`package.json:48`) | — |
| react-router-dom 7.x | Rota + drill-down | ✓ | ^7.13.1 | — |
| @tanstack/react-query 5.x | useContratos | ✓ | ^5.90.21 | — |
| date-fns 4.x | Cálculos de data | ✓ | ^4.1.0 | — |
| Supabase project | DB read | ✓ (produção ativa) | — | — |
| `pg_cron` extension | Não usado nesta fase | — | — | — |

Sem dependências faltando.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 (unit/integration) + Playwright 1.60 (E2E) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npm run test -- src/lib/__tests__/receita.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| REV-01 (MRR) | `calcularMrr` retorna 0 para lista vazia; soma `valor_mensal` direto; pro-rata `valor_total` quando só `valor_total` + `data_fim`; default 12m quando sem `data_fim` | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "calcularMrr"` | Wave 0 |
| REV-01 (separação por tipo) | `calcularMrr` separa `assessoria` vs `consultoriaProRata` corretamente | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "breakdown por tipo"` | Wave 0 |
| REV-01 (`valor_protegido` excluído) | Contrato com só `valor_protegido` não contribui ao MRR | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "valor_protegido nao entra"` | Wave 0 |
| REV-01 (forecast) | `calcularForecast` retorna 3 pontos com baseline = MRR + entradas - saídas | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "calcularForecast"` | Wave 0 |
| REV-01 (forecast com null data_fim) | Contratos sem `data_fim` não entram em "saídas previstas" | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "null data_fim"` | Wave 0 |
| REV-02 (gráfico) | Renderização — `calcularMrrHistorico` retorna 6 pontos cronológicos crescentes | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "calcularMrrHistorico"` | Wave 0 |
| REV-02 (gráfico visual) | Página renderiza `<LineChart>` com data corretos | smoke E2E (visita /receita como diretor, espera `svg` existir) | `npm run test:e2e -- --grep "receita"` | Wave 0 (estender `tests/e2e/smoke.spec.ts`) |
| REV-03 (classificação) | `classificarRenovacoes` divide em 4 buckets corretamente; bucket vazio = `[]` | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "classificarRenovacoes"` | Wave 0 |
| REV-03 (alerta visual) | Lista mostra `<Badge variant="destructive">` para itens em `ate30` | component (`ReceitaPage` ou subcomponente) — manual-only se feature secundária | — | Manual via QA visual no PR |
| Gate de role | `coordenador` acessa /receita; `consultor` vê `<RequireRole>` fallback | smoke E2E (já existe pattern em `tests/e2e/smoke.spec.ts`) | `npm run test:e2e` | Wave 0 (estender smoke) |
| Drill-down | Click em card → URL muda para `/contratos?status=ativo&vencendo_em_dias=30` | unit (testa que `onClick` chama `navigate(...)` correto) | `npm run test -- src/pages/__tests__/ReceitaPage.test.tsx` | Wave 0 |
| `vencendo_em_dias` em ContratosPage | Filtro composto preserva filtros existentes; ausência do param = comportamento prévio | unit (testa `useMemo` filtered) | `npm run test -- src/pages/__tests__/ContratosPage.test.tsx` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -- src/lib/__tests__/receita.test.ts` (helpers — runs em <1s)
- **Per wave merge:** `npm run test && npm run lint` (suite completa + lint; sem coverage gate hoje)
- **Phase gate:** `npm run test && npm run lint && npm run test:e2e` (smoke E2E confirma rota acessível como diretor e bloqueada como consultor)

### Wave 0 Gaps

- [ ] `src/lib/__tests__/receita.test.ts` — cobre todos os REV-XX (helpers puros). Modelo: copiar estrutura de `src/lib/__tests__/projecao.test.ts` (TODAY fixo, fixtures inline).
- [ ] `src/pages/__tests__/ReceitaPage.test.tsx` (OPCIONAL — só se tempo permitir; smoke E2E cobre o caminho feliz). Modelo: padrão de `src/components/__tests__/DeleteConfirmDialog.test.tsx`.
- [ ] `src/pages/__tests__/ContratosPage.test.tsx` (OPCIONAL — testa o filtro `vencendo_em_dias` em isolamento). Hoje ContratosPage não tem teste; adicionar smoke seria valor extra.
- [ ] Estender `tests/e2e/smoke.spec.ts` para incluir `/receita` na lista de rotas walked (já há padrão de "27 routes walked como diretor/consultor").
- Sem instalação de framework — Vitest e Playwright já configurados.

## Security Domain

### Applicable ASVS Categories (Level 1, `security_block_on: high`)

| ASVS Category | Aplica | Controle Padrão |
|---------------|--------|-----------------|
| V1 Architecture | sim | Página greenfield sobre stack RLS-protected existente. Sem mudanças arquiteturais. |
| V2 Authentication | sim (passthrough) | Sessão Supabase Auth já existente — `RequireRole` lê `useMeuPerfil` que depende de sessão válida. Sem login custom nesta fase. |
| V3 Session Management | sim (passthrough) | Idem V2. `useMeuPerfil` força `staleTime:0, gcTime:0` para evitar session bleed (já no codebase). |
| V4 Access Control | sim | **`RequireRole atLeast="coordenador"`** no componente (UX). **RLS role-aware da migration 029** no DB (defense-in-depth). Consultor que escapasse o `RequireRole` AINDA não conseguiria ver contratos de outros responsáveis se RLS estiver ativa. **Verificar:** RLS de `contratos` permite coordenador+ ler tudo? (Provavelmente sim — confirmar em migration 029.) |
| V5 Input Validation | sim (mínimo) | Único input: `?vencendo_em_dias=N` na URL. Deve ser parseado como `Number(...)` e validado (`isNaN(n) || n < 0 || n > 365` → ignorar). Evita injeção via NaN/string que poderia quebrar predicate de filtro. |
| V6 Cryptography | não | Sem manipulação de secrets nesta fase. |
| V7 Error Handling | sim | Sem novos pontos de erro além de query Supabase, já tratada pelo TanStack Query (`isError`, `error`). Não vazar `error.message` raw para UI — mostrar PT-BR genérico. |
| V8 Data Protection | sim | Página exibe receita (sensível). **Garantir:** valores monetários não aparecem em logs/console (`console.log` proibido pela convenção do projeto). RequireRole + RLS já protegem da exibição não autorizada. |
| V9 Communications | sim | HTTPS via Vercel — herdado. Sem novos endpoints HTTP. |
| V11 Business Logic | sim | Lógica de pro-rata + forecast é determinística — testar com fixtures cobre o risco principal (cálculo errado → decisão de negócio errada). |
| V13 API & Web Service | sim (passthrough) | Chamada via supabase-js PostgREST com JWT do usuário — RLS aplica. Sem novos endpoints. |
| V14 Configuration | sim | Sem novos env vars. |

### Known Threat Patterns para React + Supabase SPA

| Padrão | STRIDE | Mitigação Padrão no Projeto |
|--------|--------|-----------------------------|
| Bypass de `RequireRole` no client (DOM inspect) | Elevation of Privilege | Defense-in-depth: RLS role-aware em `contratos` (migration 029_rls_role_aware.sql) é a barreira real. UI só esconde — não autoriza. |
| URL tampering em `?vencendo_em_dias` | Tampering | Parse defensivo: `const n = Number(searchParams.get('vencendo_em_dias')); if (!Number.isFinite(n) || n < 0 || n > 365) return baseList`. |
| XSS via `cliente.nome` injection em label de card | Cross-site Scripting | React escapa automaticamente em `{contrato.cliente?.nome}`. **Nunca usar `dangerouslySetInnerHTML`.** |
| Data leak via console (dev tools) | Information Disclosure | Não adicionar `console.log(contrato)` mesmo em dev. Convenção do projeto. |
| RLS bypass via service-role no client | Elevation of Privilege | `src/lib/supabase.ts` usa **apenas ANON_KEY** — service-role NUNCA chega ao browser. Já garantido pela arquitetura. |
| Drill-down vazar dados privados via URL compartilhável | Information Disclosure | URLs `/contratos?vencendo_em_dias=30` não vazam IDs nem PII — só filtros agregados. Risco baixo. Mesmo padrão de `/leads?status=ganho`. |

**Conclusão de segurança:** zero novos vetores de risco. Phase é cliente-puro sobre infra de auth+RLS já validada (E2E smoke + RLS suite `tests/rls/rls-role-aware.test.ts` cobrem o gate). Pequeno cuidado de input validation no parse de `vencendo_em_dias`.

## Sources

### Primary (HIGH confidence)

- `src/hooks/useContratos.ts:8-20` — confirmação que `useContratos` existe; já retorna `Contrato[]` com `cliente` joined
- `src/lib/utils.ts:10-13, 25-39` — `formatCurrency`, `getContractProgress`, `getDaysUntilExpiry` já implementados
- `src/components/shared/PeriodSelector.tsx` + `src/lib/periods.ts` — API canônica do projeto
- `src/components/shared/RequireRole.tsx:17-31` — padrão de gate
- `src/pages/AdocaoPage.tsx:97-103` — exemplo exato de wrap `RequireRole atLeast="coordenador"`
- `src/pages/LeadsPage.tsx:1-112` — padrão `useSearchParams` + filtro bookmarkable
- `src/pages/RenovacoesPage.tsx:19-58, 122-180` — padrão completo de classificação por urgência + lista agrupada
- `src/pages/AnalyticsPage.tsx:11-14, 105-107, 196-199, 279, 403-432` — uso de recharts (BarChart/PieChart) + cálculo MRR atual + `<Tooltip>` styling + `PeriodSelector`
- `src/pages/DashboardPage.tsx:14, 74-86` — uso de recharts no Dashboard + MRR atual + janelas 30/60/90
- `src/pages/ContratosPage.tsx:298-361` — estrutura atual de filtros (alvo do drill-down) + onde adicionar `vencendo_em_dias`
- `src/lib/projecao.ts` + `src/lib/__tests__/projecao.test.ts` — padrão de helper puro + teste com `TODAY` fixo
- `src/router.tsx:42-95` — padrão de registro de rotas
- `src/components/layout/Sidebar.tsx:42-50, 154-166` — onde encaixar nav item de "/receita"
- `package.json:43-50` — versões confirmadas: react 19.2, recharts 3.8, react-router-dom 7.13, date-fns 4.1
- `supabase/migrations/001_initial_schema.sql:132-149` — schema confirmado de `contratos` (`status: ativo|encerrado|suspenso`)
- `src/types/index.ts:72-94` — interface `Contrato` confirmada
- `.planning/codebase/TESTING.md` — padrões de teste; confirma "no CI gate today"
- `.planning/REQUIREMENTS.md` — REV-01/02/03 definitions

### Secondary (MEDIUM confidence)

- Padrão de `<LineChart>` + `<Area>` no recharts 3.x — baseado em conhecimento de API + verificação que `recharts ^3.8.0` está em package.json. **Não verificado in-tree** porque é primeiro uso no projeto. Recomendação: smoke test visual antes de aceitar a wave.

### Tertiary (LOW confidence)

- Volume estimado de ~100 contratos em produção — não verificado direto no DB (sem acesso direto a prod nesta pesquisa). Tratar como assumption A1. Mitigar com smoke check no plano.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 100% das libs já presentes e em uso ativo, versões verificadas
- Architecture: HIGH — padrões idênticos a 5+ páginas existentes; sem inovação arquitetural
- Pitfalls: HIGH para os derivados de código existente (1-4, 6-8); MEDIUM para o do recharts (5 — depende de comportamento empírico)
- Validation: HIGH — framework e padrões totalmente cobertos por TESTING.md
- Security: HIGH — sem novos vetores; defense-in-depth já existe (RLS migration 029)
- Pro-rata + forecast formulas: HIGH (CONTEXT.md locked) com 1 caveat = como o time CONSEJ marca renovação (Open Question 1)

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (~30 dias — stack estável; sem ETA de major release de recharts/react-router)
