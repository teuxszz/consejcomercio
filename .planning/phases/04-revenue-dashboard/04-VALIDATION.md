---
phase: 04
phase-slug: revenue-dashboard
date: 2026-05-26
---

# 04 — Validation Strategy

## Source

Extracted from `04-RESEARCH.md` "Validation Architecture" section (linhas 737-777). Mantém o conteúdo original; este documento é a fonte canônica de teste/cobertura para a Phase 4.

## Validation Levels

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 (unit/integration) + Playwright 1.60 (E2E) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npm run test -- src/lib/__tests__/receita.test.ts` |
| Full suite command | `npm run test` |
| E2E command | `npm run test:e2e` |
| Lint | `npm run lint` |
| Type check | `npx tsc --noEmit -p tsconfig.app.json` |

### Test Levels

| Level | Quando aplica | Comando |
|-------|---------------|---------|
| Unit | Helpers puros em `src/lib/receita.ts` | `npm run test -- src/lib/__tests__/receita.test.ts` |
| Component (opcional) | Render isolado de `ReceitaPage` (somente se valor extra justificar) | `npm run test -- src/pages/__tests__/ReceitaPage.test.tsx` |
| Integration (opcional) | Filtro `vencendo_em_dias` em `ContratosPage` | `npm run test -- src/pages/__tests__/ContratosPage.test.tsx` |
| Smoke E2E | Rota `/receita` acessível como diretor; bloqueada como consultor | `npm run test:e2e -- --grep "receita"` |
| Phase gate | Lint + types + unit + E2E juntos antes do merge final da phase | `npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm run test && npm run test:e2e` |

## Sampling Continuity

- **Per task commit:** `npm run test -- src/lib/__tests__/receita.test.ts` (helpers — runs em <1s)
- **Per wave merge:** `npm run test && npm run lint` (suite completa + lint; sem coverage gate hoje)
- **Phase gate:** `npm run test && npm run lint && npm run test:e2e` (smoke E2E confirma rota acessível como diretor e bloqueada como consultor)

### Wave 0 Gaps (test scaffolding obrigatório antes do GREEN)

- [ ] `src/lib/__tests__/receita.test.ts` — cobre todos os REV-XX (helpers puros). Modelo: copiar estrutura de `src/lib/__tests__/projecao.test.ts` (TODAY fixo, fixtures inline).
- [ ] `src/pages/__tests__/ReceitaPage.test.tsx` (OPCIONAL — só se tempo permitir; smoke E2E cobre o caminho feliz). Modelo: padrão de `src/components/__tests__/DeleteConfirmDialog.test.tsx`.
- [ ] `src/pages/__tests__/ContratosPage.test.tsx` (OPCIONAL — testa o filtro `vencendo_em_dias` em isolamento). Hoje ContratosPage não tem teste; adicionar smoke seria valor extra.
- [ ] Estender `tests/e2e/smoke.spec.ts` para incluir `/receita` na lista de rotas walked. **IMPORTANTE:** essa edição vive no Plan 04-03 (Wave 2), NÃO no Plan 04-01 — para evitar deixar smoke E2E vermelho durante toda a Wave 1.
- Sem instalação de framework — Vitest e Playwright já configurados.

## Coverage Matrix

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Owner (Plan) |
|--------|----------|-----------|--------------------|--------------|
| REV-01 (MRR) | `calcularMrr` retorna 0 para lista vazia; soma `valor_mensal` direto; pro-rata `valor_total` quando só `valor_total` + `data_fim`; default 12m quando sem `data_fim` | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "calcularMrr"` | 04-01 |
| REV-01 (separação por tipo) | `calcularMrr` separa `assessoria` vs `consultoriaProRata` corretamente | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "breakdown por tipo"` | 04-01 |
| REV-01 (receita pontual no período) | `calcularReceitaPontualPeriodo` soma `valor_total` de contratos `tipo='consultoria'` com `data_inicio` dentro do range; ignora fora do range | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "calcularReceitaPontualPeriodo"` | 04-01 |
| REV-01 (`valor_protegido` excluído) | Contrato com só `valor_protegido` não contribui ao MRR | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "valor_protegido nao entra"` | 04-01 |
| REV-01 (forecast) | `calcularForecast` retorna 3 pontos com baseline = MRR + entradas - saídas | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "calcularForecast"` | 04-01 |
| REV-01 (forecast com null data_fim) | Contratos sem `data_fim` não entram em "saídas previstas" | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "null data_fim"` | 04-01 |
| REV-02 (gráfico) | Renderização — `calcularMrrHistorico` retorna 6 pontos cronológicos crescentes | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "calcularMrrHistorico"` | 04-01 |
| REV-02 (gráfico visual) | Página renderiza `<LineChart>` com data corretos | smoke E2E (visita /receita como diretor, espera `svg` existir) | `npm run test:e2e -- --grep "receita"` | 04-03 |
| REV-03 (classificação) | `classificarRenovacoes` divide em 4 buckets corretamente; bucket vazio = `[]` | unit | `npm run test -- src/lib/__tests__/receita.test.ts -t "classificarRenovacoes"` | 04-01 |
| REV-03 (alerta visual) | Lista mostra `<Badge variant="destructive">` para itens em `ate30` | manual (UAT checkpoint humano) | — | 04-03 (Task checkpoint) |
| Gate de role | `coordenador` acessa /receita; `consultor` vê `<RequireRole>` fallback | smoke E2E (já existe pattern em `tests/e2e/smoke.spec.ts`) | `npm run test:e2e` | 04-03 |
| Drill-down (cards) | Click em card → URL muda para `/contratos?status=ativo&vencendo_em_dias=30` | UAT manual (cobertura unitária seria over-engineering) | — | 04-03 (Task checkpoint) |
| `vencendo_em_dias` em ContratosPage | Filtro composto preserva filtros existentes; ausência do param = comportamento prévio | unit (testa `useMemo` filtered) | `npm run test -- src/pages/__tests__/ContratosPage.test.tsx` | 04-02 |

### Gate vermelho-verde por Wave

| Wave | Plans incluídos | Estado esperado dos testes |
|------|------------------|-----------------------------|
| 1 | 04-01 (helpers/TDD), 04-02 (URL filter) | Unit `receita.test.ts` RED → GREEN dentro do próprio plan. Smoke E2E **NÃO** é tocado em Wave 1 (preserva CI signal). |
| 2 | 04-03 (UI end-to-end) | Smoke E2E RED → GREEN no mesmo plano (Task 0 adiciona `/receita`, Task 1 implementa rota). Suíte unitária permanece GREEN. |

## Notes

- Cobertura de `calcularReceitaPontualPeriodo` é obrigatória — é a 3ª faceta do D-01 (Row 2 breakdown). Sem teste, a Row 2 fica metade testada.
- Drill-down unitário NÃO é exigido: a integração entre `useNavigate` e `ContratosPage` é mais barata de verificar via UAT manual + smoke E2E do que via mock de `useNavigate`.
- Não há CI gate hoje (`.planning/codebase/TESTING.md:287-291`). Os comandos acima são contratos manuais — quando o CI for adicionado, esta matriz é o ponto de partida.
