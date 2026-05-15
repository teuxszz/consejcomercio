# Relatório de Testes — CONSEJ CRM v2

> Gerado em 2026-05-15. Cobre a montagem da suíte de testes automatizados
> (vitest + Playwright) e a auditoria estática do sistema.

## Resumo executivo

| Métrica | Resultado |
|---|---|
| Testes automatizados criados | **82** (Fases 0–1) — 100% verdes |
| Testes de RLS | 5 prontos, pulados (aguardam usuários QA) |
| Smoke E2E | 30 rotas × 2 roles, pronto, pendente usuários QA |
| Erros de ESLint no código existente | **67 erros + 4 warnings** |
| Build (`tsc -b`) | ❌ **estava quebrado** → ✅ corrigido nesta sessão |
| Achados catalogados | 2 críticos · 4 altos · 5 médios · 3 baixos |
| Já corrigidos nesta sessão | C1, C2, C4, A2, M4 (build compila + Error Boundary + validação de env) |

---

## ACHADOS — Críticos

### C1 — Build estava quebrado e a ferramenta `rtk tsc` mascarou
- **Onde:** `src/pages/AnalyticsPage.tsx` — `const range` declarado duas vezes no mesmo `useMemo` (linhas 71 e 165).
- **Impacto:** `npm run build` (`tsc -b && vite build`) **falhava** no passo de typecheck. Qualquer deploy que rode build estava quebrado.
- **Causa raiz:** durante o desenvolvimento usou-se `rtk tsc`, que reportou `"TypeScript compilation completed"` mesmo com erros reais. **Não confiar no `rtk tsc` para validar build** — usar `npx tsc -b`.
- **Status:** ✅ corrigido nesta sessão (removida a redeclaração).
- **Ação:** trocar o hábito de verificação para `npx tsc -b` ou `npm run build`.

### C2 — Sem Error Boundary global ✅ CORRIGIDO
- **Onde:** `src/main.tsx` — não havia `<ErrorBoundary>`.
- **Impacto:** um erro de render em qualquer componente derrubava a tela inteira (tela branca). Aconteceu nesta sessão com o `BlocoEditorModal` (bug de `null`).
- **Status:** ✅ criado `src/components/ErrorBoundary.tsx` (fallback amigável + botão recarregar) e aplicado no topo da árvore em `main.tsx`. Coberto por teste.

### C4 — `src/lib/supabase.ts` não validava variáveis de ambiente ✅ CORRIGIDO
- **Onde:** `supabaseUrl`/`supabaseAnonKey` com `as string` sem checagem.
- **Impacto:** sem `.env`, o app subia e quebrava silenciosamente na primeira query.
- **Status:** ✅ adicionada validação no boot — falha cedo com mensagem clara listando as variáveis ausentes.

---

## ACHADOS — Altos

### A1 — Vazamento de escopo na RLS: registros órfãos visíveis a todos
- **Onde:** `supabase/migrations/029_rls_role_aware.sql` — função `can_see_responsavel(NULL)` retorna `true`.
- **Impacto:** leads/clientes/contratos **sem `responsavel_id`** ficam visíveis a **todos** os internos, inclusive consultores. Quem deveria ver só os próprios dados vê todos os registros não atribuídos.
- **Ação:** decidir se é intencional. Se não: mudar a policy para que NULL só seja visível a gerentes+/diretor, OU rodar um backfill atribuindo responsável a todos os registros órfãos.
- **Verificação:** os testes em `tests/rls/rls-role-aware.test.ts` documentam esse comportamento (rodar após criar usuários QA).

### A2 — `DeleteConfirmDialog` usava `.finally()` em PromiseLike do Supabase
- **Onde:** `src/components/shared/DeleteConfirmDialog.tsx`.
- **Impacto:** o builder do Supabase é `PromiseLike`, não `Promise` — `.finally` não é garantido. Erro de tipo (parte do C1).
- **Status:** ✅ corrigido nesta sessão (trocado para `async/await`).

### A3 — Colunas duplicadas: `responsavel` (TEXT) vs `responsavel_id` (UUID)
- **Onde:** tabelas `oportunidades` e `demandas` (migração 028 adicionou `_id` sem remover o TEXT legado).
- **Impacto:** risco de dessincronia — a UI atualiza um, o outro fica defasado; queries/filtros antigos por TEXT divergem da RLS (que usa `_id`).
- **Ação:** migrar todos os consumidores para `responsavel_id` e dropar a coluna TEXT numa migração futura.

### A4 — Expressão sem efeito atribuído / código morto potencial
- **Onde:** `src/pages/SlackPage.tsx:61` (`date` atribuído e nunca usado); padrão `react-hooks/preserve-manual-memoization` (3×) e `react-hooks/exhaustive-deps` (5×).
- **Impacto:** `exhaustive-deps` pode causar dados desatualizados na tela (efeito não re-roda quando deveria).
- **Ação:** revisar cada dependência faltante; remover variáveis mortas.

---

## ACHADOS — Médios

### M1 — 67 erros de ESLint nunca pegos (lint fora do build)
- **Onde:** `npm run build` não roda `eslint`. 67 erros acumularam.
- **Distribuição:** 24 `no-unused-vars` · 11 `set-state-in-effect` (ver C3) · 8 `react-refresh/only-export-components` · 5 `exhaustive-deps` · 3 `preserve-manual-memoization` · 3 `no-explicit-any` · 2 `no-empty-object-type` · 1 `purity` · 1 `immutability` · 1 `no-unused-expressions`.
- **Ação:** adicionar `npm run lint` ao CI/pre-commit; zerar incrementalmente.

### M2 — `react-refresh/only-export-components` (8×)
- **Impacto:** arquivos que exportam componentes + não-componentes juntos quebram o Fast Refresh no dev (recarrega a página inteira ao salvar).
- **Ação:** separar constantes/helpers em arquivos próprios.

### M5 — `setState` dentro de `useEffect` (11×) — revisado, NÃO é crítico
- **Onde:** `react-hooks/set-state-in-effect` em GlobalSearch, PerfilPanel, OnboardingWizard, NovaReuniaoModal, ClienteDetailPage, ConfiguracoesPage (×2), LeadDetailPage, PerfilPage, PortalWalletPage.
- **Revisão:** os 11 casos foram inspecionados. Todos são padrões **benignos** — hidratação de formulário a partir de dados de query assíncrona, reset de estado quando um filtro muda, ou efeito one-shot guardado por `localStorage`. **Nenhum causa loop de render em cascata.**
- **Avaliação:** a regra `set-state-in-effect` (nova no plugin React 19) é agressiva e sinaliza padrões legítimos. Foi listado como crítico no rascunho inicial deste relatório por engano — corrigido para médio.
- **Ação:** baixa prioridade. Se quiser zerar o lint, tratar como refactor focado (form hydration → `key`-remount ou derivação), não urgente. Forçar as 11 mudanças agora traria mais risco de regressão do que benefício.

### M3 — Uso amplo de `as any` / non-null assertion `!`
- **Onde:** espalhado (ex.: `DashboardPage` `(c as any).contratos`, `useGamification` `ALL_BADGES.find(...)!`).
- **Impacto:** mascara erros que só aparecem em runtime — exatamente a classe de bug do `BlocoEditorModal`.
- **Ação:** ativar `@typescript-eslint/no-explicit-any` como warning e reduzir aos poucos; tipar relacionamentos do Supabase corretamente.

### M4 — Ranking de indicações dependia de variável não declarada
- **Onde:** `src/pages/AnalyticsPage.tsx` — o bloco `byIndicantePerfil` (P3.2) redeclarava `range`.
- **Status:** ✅ corrigido junto com C1.

---

## ACHADOS — Baixos

### B1 — `availableYears` e datas só-data viram ano errado perto da virada
- **Onde:** `src/lib/periods.ts` — `new Date('YYYY-MM-DD')` parseia como UTC; no fuso BRT (-3h) `2025-01-01` vira `2024-12-31`.
- **Impacto:** quase nulo — o Supabase retorna `timestamptz` completo (com hora), não data-só. Só afetaria entradas manuais data-só.
- **Ação:** opcional — normalizar parsing se algum dia entrarem datas só-data.

### B2 — Ternário usado como statement
- **Onde:** `src/pages/portal/PortalCatalogoPage.tsx:117` — `next.has(t) ? next.delete(t) : next.add(t)`.
- **Impacto:** nenhum (funciona); só estilo. ESLint reclama (`no-unused-expressions`).
- **Ação:** trocar por `if/else`.

### B3 — Imports não usados
- **Onde:** ex.: `PortalHistoricoPage.tsx` (`ChevronRight`), entre os 24 `no-unused-vars`.
- **Ação:** limpeza trivial — `eslint --fix` resolve a maioria.

---

## O que foi montado (infraestrutura de teste)

### Arquivos novos
```
vitest.config.ts                          config do Vitest (separada do Vite)
vitest.setup.ts                            registra matchers jest-dom
playwright.config.ts                       config E2E (2 projetos: diretor/consultor)
.env.test.example                          template de credenciais QA
src/test/render-utils.tsx                  renderWithProviders (QueryClient + Router)
src/test/supabase-mock.ts                  mock encadeável do cliente Supabase
src/test/vitest-env.d.ts                   tipos dos matchers jest-dom
src/lib/__tests__/periods.test.ts          20 testes
src/lib/__tests__/projecao.test.ts          7 testes
src/lib/__tests__/icp-dinamico.test.ts      9 testes
src/lib/__tests__/utils.test.ts            20 testes
src/hooks/__tests__/useCurrentRole.test.ts  7 testes
src/hooks/__tests__/useObjecoes.test.tsx    3 testes
src/components/__tests__/ResponsavelBadge.test.tsx     7 testes
src/components/__tests__/DeleteConfirmDialog.test.tsx  5 testes
src/components/__tests__/PeriodSelector.test.tsx       3 testes
tests/e2e/global-setup.ts                  login + storageState por role
tests/e2e/smoke.spec.ts                    smoke read-only das 30 rotas
tests/rls/rls-role-aware.test.ts           5 testes de RLS (JWT real)
```

### Scripts
```
npm run test        # 82 testes unit/componente — verdes
npm run test:watch  # modo watch
npm run test:cov    # com cobertura
npm run test:e2e    # Playwright (precisa de .env.test)
npm run test:rls    # RLS (precisa de .env.test)
```

---

## Pendências para destravar Fases 2 e 3

1. Criar usuários QA no Supabase Auth: `qa-diretor@consej.com` e `qa-consultor@consej.com`.
   - O `qa-consultor` precisa ter alguns leads/clientes atribuídos (`responsavel_id`) para os testes de RLS terem o que verificar.
2. Copiar `.env.test.example` → `.env.test` e preencher credenciais.
3. Rodar `npm run test:e2e` e `npm run test:rls` — eles vão gerar achados adicionais (rotas que quebram, vazamentos de RLS reais).

---

## Backlog de correção sugerido (ordem)

1. **A1** — decidir/corrigir o escopo de RLS para registros órfãos (decisão de produto).
2. **A3** — unificar `responsavel`/`responsavel_id` (migração + ajuste de consumidores).
3. **M1** — adicionar `npm run lint` ao CI/pre-commit; zerar os 67 erros incrementalmente.
4. **M5** — `setState` em efeito: refactor focado, baixa prioridade (não é loop).
5. **A4 / M2 / M3** — `exhaustive-deps`, Fast Refresh, redução de `as any`.
6. Baixos — limpeza trivial (imports mortos, ternário-statement).

> Já corrigidos nesta sessão: **C1** (build), **C2** (Error Boundary), **C4** (validação de env), **A2** (DeleteConfirmDialog), **M4** (range duplicado).
