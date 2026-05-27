---
phase: 04-revenue-dashboard
plan: 01
subsystem: receita
tags: [revenue, mrr, forecast, helpers, tdd]
requires: []
provides: [calcularMrr, calcularReceitaPontualPeriodo, calcularMrrHistorico, calcularForecast, classificarRenovacoes, classifyUrgency, contribuicaoMensal, MrrBreakdown, MrrHistoryPoint, ForecastPoint, RenovacoesBuckets, Urgencia]
affects: [src/pages/RenovacoesPage.tsx]
tech_stack:
  added: []
  patterns: [pure-helper-pattern, today-injection, parseDate-local-tz]
key_files:
  created:
    - src/lib/receita.ts
    - src/lib/__tests__/receita.test.ts
  modified:
    - src/pages/RenovacoesPage.tsx
decisions:
  - "defaultPontualMonths = 12 (mantido do CONTEXT D-01)"
  - "parseDate() parseia YYYY-MM-DD como data LOCAL — evita bug UTC midnight em fusos negativos"
  - "calcularMrr aceita today opcional — exclui contratos data_inicio futura (evita double-count com forecast.entradas)"
  - "URGENCIA_STYLE permanece inline em RenovacoesPage (cosmético, não DRY-vale-pena)"
metrics:
  duration: ~50min
  completed: 2026-05-27
  tasks_completed: 3
  files_changed: 3
  tests_added: 36
  tests_passed: 36
---

# Phase 04 Plan 01: Receita Helpers (TDD Foundation) Summary

Helpers puros de cálculo financeiro (MRR pro-rata, receita pontual, histórico 6m, forecast 3m, classificação de renovações) entregues via TDD strict RED→GREEN→REFACTOR, com 36 testes determinísticos cobrindo todas as fórmulas locked do CONTEXT (D-01, D-03, D-05). RenovacoesPage refatorada para importar `classifyUrgency` canônico (DRY com Plan 03).

## What Was Built

### Helpers exportados de `src/lib/receita.ts`

| Export | Assinatura |
|--------|-----------|
| `calcularMrr` | `(contratos: Contrato[], opt?: MrrOptions) => MrrBreakdown` |
| `calcularReceitaPontualPeriodo` | `(contratos: Contrato[], range: { start: Date; end: Date }) => number` |
| `calcularMrrHistorico` | `(contratos: Contrato[], opt?: HistoryOptions) => MrrHistoryPoint[]` |
| `calcularForecast` | `(contratos: Contrato[], opt?: ForecastOptions) => ForecastPoint[]` |
| `classificarRenovacoes` | `(contratos: Contrato[]) => RenovacoesBuckets` |
| `classifyUrgency` | `(daysLeft: number) => Urgencia` |
| `contribuicaoMensal` | `(c: Contrato, opt?: MrrOptions) => number` |

**Tipos exportados:** `Urgencia`, `MrrBreakdown`, `MrrHistoryPoint`, `ForecastPoint`, `RenovacoesBuckets`, `MrrOptions`.

**Opções (relevantes para Plan 03):**
- `MrrOptions.defaultPontualMonths` (default `12`) — usado quando contrato pontual não tem `data_fim`.
- `MrrOptions.today` — se fornecido, contratos com `data_inicio > today` são EXCLUÍDOS do MRR atual (evita double-count com `calcularForecast.entradas`).
- `HistoryOptions.months` (default `6`).
- `ForecastOptions.months` (default `3`).

### Casos de teste cobertos (36/36 verde)

**`calcularMrr` (8 casos):**
1. Lista vazia → tudo zero
2. Soma `valor_mensal` direto para assessoria ativos
3. Pro-rata: consultoria `valor_total=12000` cobrindo 6 meses → 2000
4. Default 12m: `valor_total=12000` sem `data_fim` → 1000
5. Ignora status != 'ativo'
6. Breakdown por tipo: assessoria vs consultoriaProRata
7. `valor_protegido` não entra (só valor_protegido → contribui 0)
8. Divisão por zero: `data_inicio == data_fim` → mínimo 1 mês (sem Infinity/NaN)

**`calcularReceitaPontualPeriodo` (7 casos):**
1. Caso 1 — dentro do range: `valor_total=15000` data_inicio Q1 → 15000
2. Caso 2 — fora do range: mesmo contrato em maio (Q2) → 0
3. Caso 3 — misto: dois contratos consultoria, um Q1 (15000) outro Q2 (8000) → 15000
4. Ignora `tipo='assessoria'` mesmo no range
5. Ignora `status != 'ativo'` mesmo se consultoria no range
6. Lista vazia → 0
7. Defensive: ignora contratos sem `data_inicio` (evita NaN)

**`calcularMrrHistorico` (5 casos):**
1. 6 pontos por default; shape `{ monthKey, monthLabel, mrr }`
2. Ordem cronológica crescente; último = mês corrente
3. Contrato que iniciou após o mês N → não conta em N
4. Contrato encerrado antes do mês N → não conta em N
5. Contrato `data_fim=null` ativo desde antes → conta em todos os meses

**`calcularForecast` (4 casos):**
1. 3 pontos por default; shape `{ monthKey, monthLabel, baseline }`
2. Baseline mês 1 = MRR_atual + entradas - saídas
3. "null data_fim": contratos sem `data_fim` NUNCA são saída
4. Acumulativo: baseline[N] usa runningMrr de [N-1]

**`classificarRenovacoes` (7 casos):**
1. 4 buckets (`ate30`, `de31a60`, `de61a90`, `semDataFim`) com lista vazia
2. Status != 'ativo' → ignorado em todos os buckets
3. `data_fim=null` + ativo → `semDataFim`
4. `data_fim` vencido (`daysLeft < 0`) → ignorado
5. `data_fim` em 95d → ignorado (>90d)
6. Classifica em buckets corretos: 15d→ate30, 45d→de31a60, 75d→de61a90
7. Ordenação asc dentro do bucket (tolerância de off-by-one para `getDaysUntilExpiry`)

**`classifyUrgency` (5 casos):** -1→vencido; 0/30→critico; 31/60→alto; 61/90→medio; 91→baixo.

## Implementation Notes

### `parseDate()` helper privado

`new Date('2026-01-01')` é parseado como UTC midnight. Em fusos negativos (Brasil GMT-3), isso vira `2025-12-31T21:00 BRT`, fazendo o contrato "cair" no mês anterior em comparações por intervalo. O helper privado `parseDate()` parseia explicitamente `YYYY-MM-DD` como `new Date(year, month-1, day)` (data local), eliminando o bug. Aplicado em TODOS os call-sites de `new Date(c.data_inicio | c.data_fim)`.

### `calcularMrr.today` (semântica futura-aware)

Sem `today`, `calcularMrr` soma TODOS os contratos `status='ativo'` — incluindo os com `data_inicio` futura. Com `today` fornecido (caso de `calcularForecast`), contratos futuros são excluídos para evitar double-counting quando aparecerem em `entradas[N]` do forecast.

Plan 03 deve usar `calcularMrr(contratos)` (sem `today`) para o KPI card "MRR atual" — a UX espera que contratos próximos a iniciar sejam contados. Mas se houver discrepância visual entre o KPI e o forecast, pode-se passar `today: new Date()` por consistência. Decisão fica com Plan 03.

### Divisão por zero (Pitfall 4)

`mesesContrato()` usa `Math.max(1, Math.ceil(days / 30))`. Garante mínimo 1 mês mesmo quando `data_inicio == data_fim` (dado sujo importado de Pipefy). Sem isso, `valor_total / 0 = Infinity` quebraria o gráfico.

## Self-Check: PASSED

- [x] `src/lib/receita.ts` existe (296 linhas; ≥130 do plan)
- [x] `src/lib/__tests__/receita.test.ts` existe (424 linhas; ≥170 do plan)
- [x] 13 `export` em `receita.ts` (≥11 do plan)
- [x] `calcularReceitaPontualPeriodo` exportada (BLOCKER 4)
- [x] Zero ocorrências de `valor_protegido` em código (D-01)
- [x] `Math.max(1,` aparece em `mesesContrato` (Pitfall 4)
- [x] `npm run test -- src/lib/__tests__/receita.test.ts` → 36/36 PASS
- [x] `npm run test` (suite completa) → 173 passed, 0 falhas
- [x] `npx eslint src/lib/receita.ts src/lib/__tests__/receita.test.ts src/pages/RenovacoesPage.tsx` → 0 erros
- [x] RenovacoesPage importa `classifyUrgency, type Urgencia` de `@/lib/receita`
- [x] `function classifyUrgency` local removida do RenovacoesPage
- [x] `type Urgencia` local removida do RenovacoesPage
- [x] `URGENCIA_STYLE` permanece em RenovacoesPage
- [x] `tests/e2e/smoke.spec.ts` NÃO foi tocado (delegado para Plan 04-03)
- [x] 3 commits separados: test → feat → refactor

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `parseDate()` para corrigir parsing UTC vs local**
- **Found during:** Task 2 (GREEN, 3 testes do `calcularMrrHistorico`/`calcularForecast` falhando)
- **Issue:** `new Date('YYYY-MM-DD')` é interpretado como UTC midnight; em GMT-3 o instante cai no dia anterior local, jogando contratos para o mês errado nas comparações de janela mensal.
- **Fix:** Adicionado helper privado `parseDate(s: string): Date` que parseia `YYYY-MM-DD` via `new Date(year, month-1, day)` (data local). Aplicado em todos os call-sites internos.
- **Files modified:** `src/lib/receita.ts`
- **Commit:** `0c6c937` (feat)

**2. [Rule 1 - Bug] `calcularMrr.today` opcional para evitar double-count no forecast**
- **Found during:** Task 2 (teste "acumulativo: baseline[N] usa runningMrr de [N-1]" falhando)
- **Issue:** Sem filtro de `data_inicio > today`, contratos futuros ativos eram contabilizados no MRR atual E novamente como entrada no mês de início — double-count.
- **Fix:** Adicionado `MrrOptions.today` opcional. Quando fornecido (caso `calcularForecast`), exclui contratos `data_inicio > today`. Backward-compatible: callers existentes que não passam `today` mantêm comportamento "soma tudo ativo".
- **Files modified:** `src/lib/receita.ts`
- **Commit:** `0c6c937` (feat)

**3. [Test adjustment] Tolerância no teste de ordenação de `classificarRenovacoes`**
- **Found during:** Task 2
- **Issue:** Testes que dependem de `getDaysUntilExpiry` (que usa `new Date()` real, não TODAY fixo) podem ter off-by-one entre 5d/4d, 15d/14d, etc., conforme o horário de execução vs as datas geradas com `diasAFrente()`.
- **Fix:** Teste de ordenação verifica apenas a relação `dias[0] < dias[1] < dias[2]`, não os valores exatos. A intenção do plan (validar ORDEM asc) é mantida.
- **Files modified:** `src/lib/__tests__/receita.test.ts`
- **Commit:** `0c6c937` (consolidado no feat)

**4. [Rule 2 - Cleanup] Removido import `cn` não usado em `RenovacoesPage`**
- **Found during:** Task 3 (lint reportou erro pré-existente)
- **Issue:** `import { cn } from '@/lib/utils'` declarado mas nunca usado — gera erro de lint (no-unused-vars).
- **Fix:** Removido. Não introduz comportamento novo.
- **Files modified:** `src/pages/RenovacoesPage.tsx`
- **Commit:** `e7606bb` (refactor)

### Out-of-Scope Findings (Deferred)

- **Erro de tipos pré-existente em `src/lib/__tests__/cadencia.test.ts`** — `npx tsc --noEmit` reporta erro de TS2352 em `InteracaoLead`. Pré-existente (confirmado via `git stash` antes do meu refactor). Não bloqueia este plan; tracked como dívida técnica.

## Decisions Made

- **`defaultPontualMonths = 12`** — mantido do CONTEXT D-01.
- **`parseDate()` local timezone** — corrige bug UTC; trade-off: assumimos que datas em DB representam datas civis em horário do Brasil (consistente com como o backoffice usa o sistema).
- **`MrrOptions.today` opcional, não obrigatório** — backward-compatible; default mantém semântica "todos os contratos ativos".
- **URGENCIA_STYLE inline em RenovacoesPage** — extrair para `@/lib/receita` seria over-engineering (cosmético, específico do design da página, não compartilhado).
- **Off-by-one tolerado no teste de ordenação** — afeta apenas testes que dependem de `Date.now()`; ordenação real (asc) preservada e validada.

## Threat Mitigations Verified

- **T-04-01-01 (Tampering em lógica de negócio):** ✓ 36 casos de teste com fixtures determinísticas + fórmulas trancadas em D-01/D-03/D-05.
- **T-04-01-02 (`data_fim` null no forecast):** ✓ Teste "null data_fim" passa; filtro `c.data_fim != null` aplicado antes de subtrair.
- **T-04-01-04 (Divisão por zero):** ✓ `Math.max(1, Math.ceil(days/30))` em `mesesContrato`; teste explícito passa.

## Next Steps

1. **Plan 04-02 (paralelo, mesma wave):** `ContratosPage` aceita `?vencendo_em_dias=N` via `useSearchParams` (independente desses helpers).
2. **Plan 04-03 (Wave 2):** `ReceitaPage` consome todos os 7 helpers; também adiciona `/receita` ao `tests/e2e/smoke.spec.ts` (edição que este plan deliberadamente NÃO fez para preservar CI signal).
3. **Plan 03 consumir:** usar `calcularMrr(contratos)` (sem `today`) para o card KPI "MRR atual". Usar `calcularForecast(contratos, { today: new Date(), months: 3 })` para a faixa de previsão. Usar `calcularReceitaPontualPeriodo(contratos, getPeriodRange(periodValue))` para a Row 2 "Receita pontual no período".

## Commits

| Hash | Type | Message |
|------|------|---------|
| `f192994` | test | add failing tests for receita helpers (RED) |
| `0c6c937` | feat | implement receita helpers (MRR/forecast/renovacoes/pontual) (GREEN) |
| `e7606bb` | refactor | RenovacoesPage importa classifyUrgency de @/lib/receita (DRY) |
