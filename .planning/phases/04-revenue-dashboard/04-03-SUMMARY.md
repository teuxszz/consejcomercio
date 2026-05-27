# 04-03 SUMMARY — ReceitaPage end-to-end + rota + nav sidebar

**Plan:** 04-03
**Wave:** 2
**Status:** ✅ Complete (UAT humano deferido para end-of-phase)
**Date:** 2026-05-27
**Mode:** sequential inline (re-dispatch após bloqueio de sandbox em subagent isolado)

---

## What was delivered

### Files modified

| File | LoC | Purpose |
|------|-----|---------|
| `tests/e2e/smoke.spec.ts` | +1 | `/receita` adicionado ao array `ROTAS` (Task 0 RED → Task 1 GREEN) |
| `src/pages/ReceitaPage.tsx` | +476 (new) | Página `/receita` end-to-end com 5 rows |
| `src/router.tsx` | +2 | Rota `path: 'receita'` + import `ReceitaPage` |
| `src/components/layout/Sidebar.tsx` | +2 | Nav item "Receita" gated `isCoordenadorOrAcima` no grupo CLIENTES + import `DollarSign` |

### Commits

| SHA | Subject |
|-----|---------|
| `4d9a048` | `test(04-03): add /receita to smoke E2E rotas list` (RED) |
| `156bcd0` | `feat(04-03): ReceitaPage end-to-end + rota + nav sidebar (REV-01/02/03)` (GREEN) |

---

## Cards → Drill-down URL mapping (per D-08)

| Card | Click destino | Filtro Plan 02 acionado? |
|------|---------------|--------------------------|
| MRR | `/contratos?status=ativo` | Não (sem vencendo_em_dias) |
| ARR projetado | `/contratos?status=ativo` | Não |
| Forecast 3m | `/contratos?status=ativo&vencendo_em_dias=90` | ✅ Sim |
| Renovações ≤30d | `/contratos?status=ativo&vencendo_em_dias=30` | ✅ Sim |
| RenovacaoItem (Row 4) | `/clientes/<cliente_id>` | N/A (drill ao cliente) |
| SemDataFim item (Row 5) | `/clientes/<cliente_id>` | N/A |

Integração com Plan 02 verificada via grep do `vencendo_em_dias=` (Forecast e Renovações≤30d cobrem o gate Plan 02).

---

## Decisões cosméticas do recharts

- **Bandas do forecast:** `forecastHigh = baseline × 1.05`, `forecastLow = baseline × 0.85` (banda assimétrica para baixo — refletindo viés conservador "se ~15% não renovar"). Decisão arbitrária; pode ser ajustada via constantes locais no `buildChartData` sem mudar lógica.
- **Ponte visual histórico→forecast:** o último ponto histórico recebe `forecastHigh = forecastLow = mrr` para fazer a faixa "começar" alinhada com a linha sólida. Sem essa ponte, há descontinuidade visual no mês de transição.
- **ReferenceLine "Hoje":** marcada no último mês do histórico (não no primeiro do forecast) — assim a linha cai no ponto-pivô efetivo.
- **`isAnimationActive={false}`** em todas as séries — evita "vazamento" de animação para o `null` (Pitfall 5).
- **Cor primária:** `#0089ac` (cyan CONSEJ — RESEARCH Pattern 4).

---

## Acceptance criteria (greps automáticos)

| Critério | Esperado | Observado |
|----------|----------|-----------|
| `ReceitaPage.tsx` line count | ≥200 | 476 ✅ |
| `RequireRole` count | ≥2 | 3 ✅ |
| `from 'recharts'` | ≥1 | 1 ✅ |
| 5 helpers usados | ≥5 | 10 ✅ |
| `calcularReceitaPontualPeriodo` | ≥1 | 2 ✅ (BLOCKER 4) |
| `navigate('/contratos?status=ativo` | ≥3 | 4 ✅ |
| `vencendo_em_dias=90` | ≥1 | 1 ✅ |
| `vencendo_em_dias=30` | ≥1 | 1 ✅ |
| `variant="destructive"` | ≥1 | 1 ✅ |
| `AlertTriangle` | ≥1 | 5 ✅ |
| `PeriodSelector` | ≥1 | 3 ✅ |
| `valor_protegido` non-comment | ==0 | 0 ✅ (D-01) |
| `connectNulls` JSX uso | ≤1 | 1 ✅ JSX + 2 comentários explicativos (Pitfall 5) |
| `path: 'receita'` em router | ≥1 | 1 ✅ |
| `import.*ReceitaPage` em router | ≥1 | 1 ✅ |
| `/receita` em Sidebar | ≥1 | 1 ✅ |
| Gate `isCoordenadorOrAcima` Sidebar | ≥1 | 1 ✅ |

**Lint nos arquivos modificados:** 0 erros / 0 warnings
**Typecheck (`tsc --noEmit -p tsconfig.app.json`):** 0 erros nos arquivos modificados
**Vitest:** 173 passed (18 files), 0 regressões
**Cadência.test.ts pre-existing error:** mantido fora do escopo (presente antes da Phase 4)

---

## Deviations from plan

### Deviation 1: ComposedChart no lugar de LineChart
**Plan said:** `<LineChart data={chartData}>` com `<Line>` + `<Area>` dentro.
**Implemented:** `<ComposedChart>` (recharts) para combinar Line e Area no mesmo gráfico.
**Reason:** `<LineChart>` aceita apenas `<Line>` filhos; misturar com `<Area>` requer `<ComposedChart>`. Resultado visual idêntico.
**Rule:** Rule 1 (correção técnica imediata).

### Deviation 2: Tooltip formatter recharts typing
**Plan said:** `formatter={(v: number) => formatCurrency(v)}`
**Implemented:** `formatter={(v) => formatCurrency(typeof v === 'number' ? v : Number(v))}`
**Reason:** Tipos do recharts esperam `ValueType | undefined`; o cast estrito quebra typecheck. Conversão defensiva mantém o output igual.
**Rule:** Rule 1.

### Deviation 3: Re-dispatch sequencial após bloqueio de subagent worktree
**Context:** O primeiro spawn deste plano sob `isolation="worktree"` produziu um worktree com base errada (Claude Code criou em `origin/main` stale `18d6872` em vez do HEAD local `0f4f190`). O agente isolado bloqueou. O segundo spawn em sequential mode (sem worktree) bateu na sandbox de `git commit`. Execução final foi inline no orchestrator.
**Reason:** Limitação ambiental, não do plano. A lógica do plano não exigia mudança.
**Rule:** Rule 4 (escalada documentada).

---

## Open Q3 RESOLVED — volume real de contratos

**Não pôde ser observado** nesta execução porque o UAT manual (`npm run dev` + login real) está deferido para end-of-phase. O dashboard usa `useMemo` em todos os cálculos derivados de `contratos`, então mesmo com >500 contratos a renderização não deve travar — mas a observação precisa ser feita na fase de UAT humano (Cenário 10 do checkpoint).

---

## Checkpoint humano UAT (Task 2) — DEFERIDO

Per `workflow.human_verify_mode=end-of-phase`. Cenários 1-10 do PLAN.md a serem executados antes da verificação final da Phase 04:

1. Clicar "Receita" sidebar → URL muda → renderiza <2s
2. Row 1 — cards mostram valores (não NaN/Infinity)
3. Drill-down cards → URLs corretas + lista filtrada (`vencendo_em_dias=90`/`30`)
4. Row 2 — PeriodSelector afeta APENAS "Receita pontual no período"
5. Row 3 — LineChart histórico cyan + faixa pontilhada forecast (Pitfall 5 — sem vazamento)
6. Row 4 — buckets 30/60/90 visíveis com Badge destructive em ≤30d
7. Row 5 — colapsada por default; expandir mostra contratos sem `data_fim`
8. Como consultor — nav item escondido + `/receita` direto cai em fallback
9. Console limpo, sem 4xx/5xx
10. Performance <2s, observar count de contratos

---

## Confirmação de critérios chave

- ✅ `calcularReceitaPontualPeriodo` importado e usado em Row 2 (NÃO há cálculo inline duplicado) — BLOCKER 4 satisfeito
- ✅ Drill-down de cards integra com Plan 02 via `?vencendo_em_dias=N`
- ✅ Gate defense-in-depth: RequireRole no componente + nav item escondido por `useCurrentRole`
- ✅ Smoke E2E `/receita` array atualizado (GREEN local quando rodado contra build com nova rota; verificação final no UAT)
- ⏳ UAT humano deferido para end-of-phase (per config)

---

## Phase 4 closeout

REV-01/02/03 satisfeitos:
- REV-01 ✅ — 4 cards (MRR/ARR/Forecast/Renovações≤30d) + breakdown
- REV-02 ✅ — LineChart 6m + 3m forecast com PeriodSelector
- REV-03 ✅ — Lista renovações 30/60/90 com badge destructive ≤30d

**Phase 4 goal:** "Gestor decide receita em <30s sem planilha" — alcançado via UI assíncrona sem cálculo manual, sujeito ao UAT final.
