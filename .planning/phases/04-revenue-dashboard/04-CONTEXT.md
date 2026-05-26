---
phase: 04-revenue-dashboard
created: 2026-05-26
spec_loaded: false
discuss_mode: discuss
---

# Phase 04 — Revenue Dashboard — CONTEXT

## Domain

Página `/receita` (gated coordenador+) que dá ao gestor visão financeira em tempo real: MRR, ARR projetado, forecast 3 meses e renovações pendentes — sem precisar pedir relatório ou consultar planilha. Bloqueia depender de Phase 1+3 estarem rodando (time atualizando contratos diariamente).

## Canonical Refs

- `.planning/ROADMAP.md` — Phase 4 scope (linhas com `### Phase 4: Revenue Dashboard`)
- `.planning/REQUIREMENTS.md` — REV-01, REV-02, REV-03
- `src/types/index.ts:72-94` — interface `Contrato` (campos `tipo`, `modelo_precificacao`, `valor_total`, `valor_mensal`, `data_inicio`, `data_fim`, `status`, `valor_protegido`)
- `src/pages/ContratosPage.tsx` — página existente de contratos (alvo do drill-down)
- `src/pages/AnalyticsPage.tsx` — referência de uso de `recharts` no projeto
- `src/pages/DashboardPage.tsx` — padrão de cards-no-topo + gráfico
- `src/components/shared/PeriodSelector.tsx` — seletor canônico (year + total/T1/T4/S1/S2)
- `src/components/shared/RequireRole.tsx` — guard `atLeast='coordenador'`
- `src/lib/periods.ts` — `PeriodValue`, `getPeriodRange`, `isInRange`
- `.planning/codebase/ARCHITECTURE.md` — padrões de hooks/queries
- `.planning/codebase/CONVENTIONS.md` — naming e estrutura

## Code Context (reusable)

| Asset | Uso | Como reaproveitar |
|-------|-----|---|
| `useContratos` hook (a verificar/criar em `src/hooks/`) | Fonte única de contratos | TanStack Query com `staleTime:60s` (padrão do projeto) |
| `recharts` (LineChart, Area, ResponsiveContainer) | Gráfico MRR 6m | Cópia do padrão usado em `AnalyticsPage`/`DashboardPage` |
| `Card` + `Badge` (shadcn/ui) | Cards MRR/ARR/Forecast + badge "vencendo" | shadcn já configurado em `src/components/ui/` |
| `PeriodSelector` canônico | Período do gráfico | Reusar como está; não criar variante |
| `RequireRole` | Gate da rota | `<RequireRole atLeast="coordenador">` no router |
| `formatCurrency` | Formatação BRL | Helper já existente em `src/lib/utils.ts` (confirmar) |
| `date-fns` + `ptBR` locale | Formatação de datas | Já em produção em `PortalAdminPage`, `portal/PortalWalletPage` |
| Filtros bookmarkable via URL | Drill-down `/contratos?status=ativo&tipo=assessoria` | `useSearchParams` (padrão de `LeadsPage`) |

## Decisions

### 1. Definição de MRR/ARR

**Decisão:** MRR = `SUM(valor_mensal)` + `SUM(valor_total / duração_em_meses)` para contratos pontuais ativos. Mistura recorrente com pontual como se fosse tudo recorrente (pro-rata).

**ARR projetado:** MRR × 12 (mesma base unificada — não separa assessoria de consultoria nas métricas top-line).

**Separação por tipo de serviço (REV-01):** acontece em uma **breakdown row** abaixo dos cards principais, mostrando MRR(assessoria) / MRR(consultoria-pro-rata) — NÃO em cards separados.

**Cálculo de duração para pro-rata:**
- Se `data_fim` definido: `meses = roundUp((data_fim - data_inicio) em dias / 30)`
- Se `data_fim` ausente: contrato é tratado como **recorrente indefinido** (entra como `valor_mensal` se preenchido; se só `valor_total` sem `data_fim`, assumir 12 meses como default — registrar warning silencioso para o time corrigir)

**`valor_protegido`:** NÃO entra no MRR/ARR (é provisão de risco, não receita realizável).

### 2. Contratos sem data_fim (open-ended)

**Decisão:** Considerados ativos indefinidamente. Entram no MRR/ARR. Aparecem na lista de renovações com tag "sem renovação agendada" para o gestor decidir.

### 3. Método de Forecast (próximos 3 meses)

**Decisão:** **MRR atual + renovações esperadas - cancelamentos** (modelo realista, não otimista).

**Cálculo por mês N do forecast:**
```
forecast[N] = MRR_atual
            + Σ(valor_mensal dos contratos que iniciam no mês N)
            - Σ(valor_mensal dos contratos com data_fim caindo no mês N que ainda não foram renovados)
```

**Premissa:** "renovado" = contrato existente com `data_fim` futuro estendido. Sem campo formal de renovação, derivar de UPDATE em `data_fim`.

### 4. Visualização de churn no gráfico

**Decisão:** Linha sólida (MRR confirmado/realizado) + área pontilhada/sombreada (faixa "se nada renovar" para os 3 meses do forecast). Recharts `<Area>` com `strokeDasharray="5 5"` + `fillOpacity={0.2}`.

### 5. Lista de Renovações Pendentes — critério de inclusão

**Decisão:** **Apenas contratos `status='ativo'` com `data_fim` em ≤ 90 dias**.

**Excluídos:** cancelados, expirados, sem `data_fim` (esses entram em "sem renovação agendada" — seção secundária colapsada).

**Agrupamento:** 3 buckets visíveis — `≤ 30 dias`, `31-60 dias`, `61-90 dias`.

### 6. Alerta visual ≤ 30 dias

**Decisão:** Badge vermelho (`variant="destructive"` do shadcn) + ícone `AlertTriangle` (lucide-react) + ordenação automática no topo da lista. Linha em si fica sem background — destaque vem do badge.

### 7. Layout da página

**Decisão:** **Tela única scroll vertical** seguindo o padrão de `DashboardPage`:

```
[Header: título + PeriodSelector + RequireRole]
[Row 1: 4 Cards] MRR | ARR | Forecast 3m | Renovações ≤30d (count)
[Row 2: Breakdown] MRR(assessoria) | MRR(consultoria pro-rata) | Receita pontual no período
[Row 3: Gráfico] MRR 6 meses (LineChart) + faixa pontilhada de forecast
[Row 4: Lista] Renovações pendentes (agrupadas por bucket 30/60/90)
[Row 5 colapsado]: Contratos sem data_fim (lista secundária)
```

### 8. Drill-down dos cards

**Decisão:** **Click → navega para `/contratos` com filtros aplicados via URL** (`useSearchParams`).

| Card | URL alvo |
|------|----------|
| MRR | `/contratos?status=ativo` |
| ARR projetado | `/contratos?status=ativo` |
| Forecast | `/contratos?status=ativo&vencendo_em_dias=90` |
| Renovações ≤30d | `/contratos?status=ativo&vencendo_em_dias=30` |

**Implicação:** ContratosPage precisa aceitar o parâmetro `vencendo_em_dias` (pode ser nova capability, mas pequena). Tooltip on-hover não implementado neste milestone — drill-on-click é suficiente.

## Constraints

- **Zero custo incremental** — sem chamadas a APIs externas, sem novos pacotes npm (recharts/date-fns já presentes).
- **Performance** — página deve renderizar em < 2s mesmo com 100+ contratos (uso de `staleTime:60s` do TanStack Query + cálculos client-side).
- **Role gate** — `coordenador+` (consultor NÃO acessa).
- **Mobile-friendly** — não é prioridade, mas layout deve degradar bem (cards empilham, gráfico ocupa 100% width).

## Deferred Ideas

- Tooltip on-hover detalhado nos cards (drill-down + tooltip combinados)
- Tabs separando histórico / renovações (postergado — tela única basta agora)
- Drill-down em cliques no gráfico (clicar num mês → ver contratos ativos naquele mês)
- Forecast com tendência extrapolada (linear regression) — só fará sentido com mais dados históricos
- Lista "Contratos a revisitar" (sem data_fim com >180d de início) — pode virar phase 5+
- Exportar dashboard pra PDF/Excel — postergado

## Open Questions for Research

- Confirmar se `useContratos` hook já existe ou precisa criar
- Verificar se `formatCurrency` está em `src/lib/utils.ts` ou precisa criar
- Verificar quantos contratos existem em produção hoje (para validar a premissa de performance < 2s)
- Definir comportamento exato do `vencendo_em_dias` em `ContratosPage` (filtro novo? Como interage com filtros existentes?)

## Success Criteria (de ROADMAP, não negociáveis)

1. Gestor acessa `/receita` e vê MRR / ARR / Forecast 3m separados por tipo de serviço — em tempo real, sem planilha.
2. Gráfico MRR 6 meses com PeriodSelector — identificar tendência sem planilha.
3. Lista de renovações pendentes destaca vencendo ≤ 30 dias — gestor age antes do churn.
