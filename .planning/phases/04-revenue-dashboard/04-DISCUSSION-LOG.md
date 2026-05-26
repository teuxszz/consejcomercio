---
phase: 04-revenue-dashboard
date: 2026-05-26
mode: discuss (default, batched)
---

# Phase 04 — Discussion Log

> Registro auditável das perguntas, opções apresentadas e respostas do operador.
> Documento humano — não consumido por agentes downstream.

## Área 1 — Definição de MRR/ARR

### Q1.1 — O que entra no MRR (Monthly Recurring Revenue)?

**Opções apresentadas:**
- Só contratos com valor_mensal preenchido — MRR = SUM(valor_mensal); pontuais fora
- **Tudo recorrente + pontual pro-rata — MRR inclui valor_mensal + valor_total/duração_em_meses ✓**
- MRR só assessoria + ARR separa os dois

**Decisão:** MRR pro-rata unificado.

### Q1.2 — Como tratar contratos sem data_fim (open-ended)?

**Opções apresentadas:**
- **Considerar ativos indefinidamente — entram no MRR/ARR ✓**
- Excluir do MRR — dado incompleto

**Decisão:** open-ended são ativos.

## Área 2 — Forecast

### Q2.1 — Método de forecast para os próximos 3 meses?

**Opções apresentadas:**
- **MRR atual + renovações esperadas - cancelamentos ✓**
- MRR atual repetido por 3 meses
- Tendência últimos 3 meses extrapolada

**Decisão:** modelo realista (não otimista, não regressão).

### Q2.2 — Como sinalizar contratos vencendo no forecast?

**Opções apresentadas:**
- **Linha pontilhada + faixa de incerteza ✓**
- Só número textual abaixo do gráfico

**Decisão:** visualização rica via recharts `<Area>` com strokeDasharray.

## Área 3 — Renovações Pendentes

### Q3.1 — Quais contratos aparecem na lista?

**Opções apresentadas:**
- **Ativos com data_fim em ≤ 90 dias ✓**
- Tudo com data_fim em ≤ 90 dias (qualquer status)
- Ativos + ainda sem data_fim com >180d desde início

**Decisão:** só ativos com data_fim ≤ 90d; open-ended em seção secundária colapsada.

### Q3.2 — Como destacar visualmente o alerta de ≤ 30 dias?

**Opções apresentadas:**
- **Badge vermelho + ícone + ordenação no topo ✓**
- Linha inteira em destaque (background tinted)

**Decisão:** badge destrutivo + AlertTriangle + ordenação automática.

## Área 4 — Layout + Drill-down

### Q4.1 — Estrutura da página /receita?

**Opções apresentadas:**
- **Tela única: cards → gráfico → lista (scroll vertical) ✓**
- Tabs: Visão geral / Histórico / Renovações

**Decisão:** padrão DashboardPage.

### Q4.2 — Clicar nos cards (MRR/ARR/Renovações) leva pra onde?

**Opções apresentadas:**
- **ContratosPage com filtro aplicado via URL ✓**
- Tooltip detalhado on-hover
- Ambos: tooltip on-hover + drill on-click

**Decisão:** drill-on-click via useSearchParams (reusa filtros bookmarkable). Tooltip detalhado fica deferred.

## Deferred Ideas

- Tooltip on-hover detalhado nos cards
- Tabs separando histórico/renovações
- Drill-down em cliques no gráfico (clicar num mês → contratos ativos)
- Forecast com tendência extrapolada (linear regression)
- Lista "Contratos a revisitar" (sem data_fim com >180d)
- Exportar dashboard pra PDF/Excel

## Open Questions para Research

- `useContratos` hook já existe?
- `formatCurrency` em `src/lib/utils.ts`?
- Quantos contratos em produção (validar premissa de performance)?
- `vencendo_em_dias` em ContratosPage — filtro novo, como interage com filtros existentes?
