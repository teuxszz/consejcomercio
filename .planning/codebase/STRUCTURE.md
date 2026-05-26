# Codebase Structure

**Analysis Date:** 2026-05-26

## Directory Layout

```
consej-crm-v2/
├── index.html                    # SPA shell (root: <div id="root">), aponta para src/main.tsx
├── package.json                  # Manifest npm (scripts: dev, build, lint, test, test:e2e, test:rls)
├── vite.config.ts                # Build config — alias `@` → ./src
├── vitest.config.ts              # Vitest config (jsdom)
├── vitest.setup.ts               # Globals @testing-library/jest-dom
├── playwright.config.ts          # Playwright E2E
├── tsconfig.json                 # Project references (tsconfig.app.json + tsconfig.node.json)
├── tsconfig.app.json             # Config TS para `src/` (browser)
├── tsconfig.node.json            # Config TS para scripts/Vite
├── tailwind.config.js            # TailwindCSS
├── postcss.config.js             # Autoprefixer
├── eslint.config.js              # ESLint flat config
├── vercel.json                   # Config de deploy Vercel
├── CLAUDE.md                     # Instruções de projeto para Claude
├── README.md                     # Doc do projeto
├── RELATORIO-TESTES.md           # Notas de testes manuais / decisões
│
├── public/                       # Assets estáticos servidos na raiz
│   ├── favicon.svg
│   ├── icons.svg
│   └── logo.png                  # Logo CONSEJ usado nos shells
│
├── src/                          # Código da SPA
│   ├── index.html (não)         # (index.html fica na raiz, não aqui)
│   ├── main.tsx                  # Bootstrap (createRoot, providers, router)
│   ├── App.tsx                   # Placeholder vazio (não usado em runtime — exporta {})
│   ├── router.tsx                # createBrowserRouter — todas as rotas
│   ├── App.css                   # CSS legado (provavelmente vazio/template)
│   ├── index.css                 # CSS global + Tailwind directives + design tokens
│   │
│   ├── assets/                   # Imagens importadas pelo bundle
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   │
│   ├── components/               # Componentes
│   │   ├── ErrorBoundary.tsx     # Boundary global de erro de render
│   │   ├── __tests__/            # Testes de componentes
│   │   │   ├── DeleteConfirmDialog.test.tsx
│   │   │   ├── ErrorBoundary.test.tsx
│   │   │   ├── PeriodSelector.test.tsx
│   │   │   └── ResponsavelBadge.test.tsx
│   │   ├── layout/               # Shell do CRM
│   │   │   ├── AppLayout.tsx     # Guarda de sessão + outlet
│   │   │   ├── Sidebar.tsx       # Nav agrupada + dropdown de perfil
│   │   │   └── GlobalSearch.tsx  # Cmd/Ctrl+K cross-entidade
│   │   ├── shared/               # Componentes cross-feature canônicos
│   │   │   ├── ActivityTimeline.tsx
│   │   │   ├── DeleteConfirmDialog.tsx
│   │   │   ├── PeriodSelector.tsx
│   │   │   ├── RequireRole.tsx
│   │   │   ├── ResponsavelBadge.tsx
│   │   │   └── ScopeToggle.tsx
│   │   ├── ui/                   # Primitivos shadcn/ui sobre Radix
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── empty-state.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── search-input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── tooltip.tsx
│   │   ├── leads/                # Kanban + modais de lead
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── KanbanColumn.tsx
│   │   │   ├── LeadCard.tsx
│   │   │   ├── NewLeadModal.tsx
│   │   │   ├── ConfirmSendModal.tsx
│   │   │   ├── ConvertToClientModal.tsx
│   │   │   └── LostReasonModal.tsx
│   │   ├── clientes/
│   │   │   └── NewClienteModal.tsx
│   │   ├── contratos/
│   │   │   └── NewContratoModal.tsx
│   │   ├── dashboard/
│   │   │   └── ProjecaoFechamento.tsx
│   │   ├── demandas/             # (vazio — feature usa primitivos diretos)
│   │   ├── diagnostico/
│   │   │   ├── DiagnosticForm.tsx
│   │   │   ├── DiagnosticPreview.tsx
│   │   │   └── DiagnosticResult.tsx
│   │   ├── indicacoes/           # (vazio)
│   │   ├── me/                   # Painéis do "Meu Espaço"
│   │   │   ├── MeusLeadsPanel.tsx
│   │   │   ├── MinhaAgendaPanel.tsx
│   │   │   ├── PerfilPanel.tsx
│   │   │   ├── TarefasPanel.tsx
│   │   │   └── VisaoGeralPanel.tsx
│   │   ├── mensagens/
│   │   │   └── BlocoEditorModal.tsx
│   │   ├── onboarding/
│   │   │   └── OnboardingWizard.tsx  # Tour mostrado pelo AppLayout
│   │   ├── oportunidades/        # (vazio)
│   │   ├── parceiros/            # (vazio)
│   │   ├── portal-admin/         # Tabs do admin do Portal
│   │   │   ├── CampanhasTab.tsx
│   │   │   ├── CatalogoTab.tsx
│   │   │   └── RegrasTab.tsx
│   │   └── reunioes/
│   │       └── NovaReuniaoModal.tsx
│   │
│   ├── contexts/                 # React Context providers
│   │   └── ThemeContext.tsx      # Toggle dark/light + localStorage
│   │
│   ├── hooks/                    # Hooks de dados (queries + mutations)
│   │   ├── __tests__/
│   │   │   ├── useCurrentRole.test.ts
│   │   │   ├── useLeads.test.tsx
│   │   │   └── useObjecoes.test.tsx
│   │   ├── useAnalyzeDiagnostico.ts
│   │   ├── useAuditLog.ts        # Helper de insert single em audit_logs
│   │   ├── useAuditLogs.ts       # Query de listagem
│   │   ├── useClientes.ts
│   │   ├── useConfiguracoes.ts   # Singleton 'default' + DEFAULT_SERVICOS/METAS
│   │   ├── useContratos.ts
│   │   ├── useCurrentRole.ts     # Hierarquia consultor → diretor
│   │   ├── useDemandas.ts
│   │   ├── useDiagnostico.ts
│   │   ├── useGamification.ts
│   │   ├── useIcpFit.ts          # Hook fino sobre lib/icp-dinamico
│   │   ├── useIndicacoes.ts
│   │   ├── useInteracoes.ts      # Mensagens enviadas a leads
│   │   ├── useLeads.ts           # + useLeadsLixeira / useRestaurarLead
│   │   ├── useObjecoes.ts
│   │   ├── useOportunidades.ts
│   │   ├── useParceiros.ts
│   │   ├── usePerfis.ts          # usePerfis / useMeuPerfil / useSalvarPerfil / useUploadAvatar
│   │   ├── usePortal.ts          # Cliente do Portal de Indicações
│   │   ├── usePortalAdmin.ts     # CRUD de regras/campanhas/catálogo
│   │   ├── usePosJuniors.ts
│   │   ├── useReunioes.ts
│   │   └── useTarefas.ts
│   │
│   ├── lib/                      # Lógica pura + cliente + constantes
│   │   ├── __tests__/
│   │   │   ├── icp-dinamico.test.ts
│   │   │   ├── periods.test.ts
│   │   │   ├── projecao.test.ts
│   │   │   └── utils.test.ts
│   │   ├── blocos-mensagem.ts    # Catálogo de blocos para o gerador de mensagens
│   │   ├── cadencia.ts           # Lógica de cadência D1-D10
│   │   ├── cnpj.ts               # Validador/formatador
│   │   ├── constants.ts          # Stages, segmentos, status, áreas, modelos, estados BR
│   │   ├── diagnostic-questions.ts # SECTIONS do formulário de diagnóstico
│   │   ├── diagnostic-utils.ts   # getClusterRecommendation, urgentServices
│   │   ├── icp-dinamico.ts       # ICP observado + win-rate + IcpFitContext
│   │   ├── mensagens-rules.ts    # Regras de geração de mensagens
│   │   ├── periods.ts            # PeriodValue + getPeriodRange + isInRange
│   │   ├── projecao.ts           # Projeção de fechamento mensal
│   │   ├── query-keys.ts         # QUERY_KEYS central do TanStack Query
│   │   ├── slack.ts              # Helper Slack (client)
│   │   ├── slack-suggestions.ts  # Sugestões de mensagens p/ Slack
│   │   ├── supabase.ts           # Singleton do supabase-js (fail-fast)
│   │   ├── tarefas-derivadas.ts  # Geração automática de tarefas a partir de eventos
│   │   └── utils.ts              # cn, formatCurrency, formatDate, getUFFromPhone, getInitials
│   │
│   ├── pages/                    # Route handlers (1 por arquivo)
│   │   ├── AjudaPage.tsx
│   │   ├── AnalyticsPage.tsx
│   │   ├── AuditoriaPage.tsx
│   │   ├── CadenciaPage.tsx
│   │   ├── ClienteDetailPage.tsx
│   │   ├── ClientesPage.tsx
│   │   ├── ConfiguracoesPage.tsx
│   │   ├── ContratosPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── DemandasPage.tsx
│   │   ├── DiagnosticosPage.tsx
│   │   ├── IcpDinamicoPage.tsx
│   │   ├── ImportarPage.tsx
│   │   ├── IndicacoesPage.tsx
│   │   ├── LeadDetailPage.tsx
│   │   ├── LeadsPage.tsx
│   │   ├── LoginPage.tsx         # Público — seletor CRM/Portal + login + forgot
│   │   ├── MapaPage.tsx
│   │   ├── MeEspacoPage.tsx      # Hub /me com tabs
│   │   ├── MensagensPage.tsx
│   │   ├── ObjecoesPage.tsx
│   │   ├── OportunidadesPage.tsx
│   │   ├── ParceirosPage.tsx
│   │   ├── PerfilPage.tsx        # Legado — rota /perfil redireciona p/ /me?tab=perfil
│   │   ├── PortalAdminPage.tsx   # CRM-side admin do Portal de Indicações
│   │   ├── PosJuniorsPage.tsx
│   │   ├── ProspeccaoPage.tsx
│   │   ├── RankingPage.tsx
│   │   ├── RenovacoesPage.tsx
│   │   ├── ResetPasswordPage.tsx # Público — destino do email de reset
│   │   ├── ReunioesPage.tsx
│   │   ├── SlackPage.tsx
│   │   └── portal/               # Portal de Indicações (cliente + interno opt-in)
│   │       ├── PortalLayout.tsx
│   │       ├── PortalWalletPage.tsx       # /portal — saldo + transações
│   │       ├── PortalIndicarPage.tsx      # /portal/indicar
│   │       ├── PortalCatalogoPage.tsx     # /portal/catalogo
│   │       └── PortalHistoricoPage.tsx    # /portal/historico
│   │
│   ├── test/                     # Helpers de teste compartilhados
│   │   ├── render-utils.tsx      # renderWithProviders (QueryClient + Router)
│   │   ├── supabase-mock.ts      # Mock do supabase-js
│   │   └── vitest-env.d.ts
│   │
│   └── types/
│       └── index.ts              # TODOS os tipos de domínio (Lead, Cliente, Contrato, ...)
│
├── supabase/                     # Backend (Postgres + Auth + Functions)
│   ├── migrations/               # 30 migrações sequenciais (001 → 032)
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_analise_ia.sql
│   │   ├── 003_reunioes.sql
│   │   ├── 004_perfis.sql
│   │   ├── 005_add_estado.sql
│   │   ├── 006_contract_extra_fields.sql
│   │   ├── 007_movement_features.sql
│   │   ├── 008_configuracoes.sql
│   │   ├── 009_storage_avatars.sql
│   │   ├── 010_gamification.sql
│   │   ├── 011_auto_profile_trigger.sql
│   │   ├── 012_mensagens_config.sql
│   │   ├── 013_interacoes_lead.sql
│   │   ├── 014_tarefas.sql
│   │   ├── 015_portal_tokens.sql
│   │   ├── 016_regras_e_campanhas.sql
│   │   ├── 019_notificacoes_indicacao.sql
│   │   ├── 020_portal_rls_fix.sql
│   │   ├── 021_lockdown_rls.sql
│   │   ├── 022_token_rpcs.sql
│   │   ├── 023_internos_no_portal.sql
│   │   ├── 024_objecoes.sql
│   │   ├── 025_clean_delete.sql
│   │   ├── 026_renovacao_notif.sql
│   │   ├── 027_roles_internos.sql
│   │   ├── 028_responsavel_ids.sql
│   │   ├── 029_rls_role_aware.sql
│   │   ├── 030_perfis_slack.sql
│   │   ├── 031_cron_renovacoes.sql
│   │   └── 032_lixeira_leads.sql
│   └── functions/                # Edge Functions (Deno)
│       ├── notify-indicacao/
│       │   ├── index.ts
│       │   ├── slack.ts
│       │   └── types.ts
│       ├── notify-renovacao/     # idem
│       ├── notify-tarefa/        # idem
│       ├── slack-commands/
│       │   └── index.ts
│       └── slack-proxy/
│           └── index.ts
│
├── api/                          # Endpoints serverless Vercel
│   └── slack-proxy.ts            # Espelha supabase/functions/slack-proxy para Vercel
│
├── scripts/                      # Scripts utilitários (Node ESM)
│   ├── data/                     # Dados de seed/import (CSV/JSON)
│   ├── migrate-contratos-pipefy.mjs   # Importador de contratos do Pipefy
│   ├── migrate-pipefy-api.mjs         # Migração via API do Pipefy
│   └── migrate-pipefy.mjs             # Migração via export do Pipefy
│
├── tests/                        # Testes fora do `src/`
│   ├── e2e/                      # Playwright
│   │   ├── global-setup.ts
│   │   ├── smoke.spec.ts
│   │   └── lead-exclusao.spec.ts
│   └── rls/                      # Testes de RLS via supabase-js
│       └── rls-role-aware.test.ts
│
├── docs/                         # Documentação adicional
│   ├── slack-indicacoes.md
│   └── superpowers/
│
├── .planning/                    # Material de planejamento (incluindo este doc)
│   └── codebase/                 # ARCHITECTURE.md, STRUCTURE.md, ...
│
├── dist/                         # Output do Vite build (gitignored)
├── node_modules/                 # (gitignored)
└── test-results/                 # Output Playwright (gitignored)
```

## Directory Purposes

**`src/main.tsx` + `src/router.tsx`:**
- Purpose: bootstrap da SPA e definição de rotas
- Contains: árvore de providers + `createBrowserRouter`
- Key files: `src/main.tsx`, `src/router.tsx`

**`src/components/layout/`:**
- Purpose: shell do CRM (sidebar, header, search global, guarda de sessão)
- Contains: `AppLayout`, `Sidebar`, `GlobalSearch`
- Key files: `src/components/layout/AppLayout.tsx`

**`src/components/ui/`:**
- Purpose: design system — primitivos shadcn/ui sobre Radix
- Contains: 16 primitivos (`button`, `card`, `dialog`, `dropdown-menu`, etc.)
- Key files: `src/components/ui/dialog.tsx`, `src/components/ui/button.tsx`

**`src/components/shared/`:**
- Purpose: componentes que cruzam features e DEVEM ser reusados
- Contains: `ScopeToggle`, `PeriodSelector`, `RequireRole`, `DeleteConfirmDialog`, `ActivityTimeline`, `ResponsavelBadge`
- Key files: `src/components/shared/ScopeToggle.tsx`, `src/components/shared/RequireRole.tsx`

**`src/components/<feature>/`:**
- Purpose: componentes específicos de uma feature (kanban, formulários grandes, painéis)
- Contains: pastas `leads/`, `clientes/`, `contratos/`, `diagnostico/`, `dashboard/`, `me/`, `mensagens/`, `onboarding/`, `portal-admin/`, `reunioes/`
- Naming: `PascalCase.tsx`, ex.: `KanbanBoard.tsx`, `LeadCard.tsx`

**`src/hooks/`:**
- Purpose: contrato entre UI e Supabase via TanStack Query
- Contains: 22 hooks `use<Recurso>.ts` (camelCase com prefixo `use`)
- Key files: `src/hooks/useLeads.ts`, `src/hooks/useClientes.ts`, `src/hooks/usePerfis.ts`

**`src/lib/`:**
- Purpose: lógica pura, constantes, cliente Supabase, helpers — código sem React
- Contains: `supabase.ts` (cliente), `query-keys.ts` (chaves canônicas), `constants.ts` (enums de domínio), `utils.ts` (formatação), `periods.ts`, `icp-dinamico.ts`, etc.
- Naming: `kebab-case.ts`

**`src/contexts/`:**
- Purpose: React Context providers globais
- Contains: `ThemeContext.tsx`
- Padrão: 1 arquivo = 1 context

**`src/pages/`:**
- Purpose: route handlers — 1 arquivo por rota
- Contains: 32 páginas CRM + subdiretório `portal/` com 5 páginas + layout do portal
- Naming: `PascalCase` + sufixo `Page` (`LeadsPage.tsx`)

**`src/pages/portal/`:**
- Purpose: shell e páginas do Portal de Indicações (rota `/portal`)
- Contains: `PortalLayout.tsx` + 4 páginas
- Naming: prefixo `Portal` (`PortalWalletPage.tsx`)

**`src/types/`:**
- Purpose: tipos de domínio centralizados — fonte única
- Contains: `index.ts` (Lead, Cliente, Contrato, Diagnostico, Tarefa, Indicacao, Oportunidade, Parceiro, PosJunior, AuditLog, LeadLixeira, TokenTransacao, Resgate, etc.)
- Padrão: 1 arquivo, todas as interfaces/types públicas

**`src/test/`:**
- Purpose: utilitários compartilhados entre testes
- Contains: `render-utils.tsx` (renderWithProviders), `supabase-mock.ts`, `vitest-env.d.ts`

**`src/assets/`:**
- Purpose: imagens importadas via `import x from '@/assets/...'` (passam pelo bundler)
- Contains: `hero.png`, `react.svg`, `vite.svg`
- Diferente de `public/` (servido como estático)

**`public/`:**
- Purpose: estáticos servidos na raiz (`/logo.png`, `/favicon.svg`)
- Padrão: não importar daqui no código — referenciar via path absoluto em `<img src="/logo.png">`

**`supabase/migrations/`:**
- Purpose: schema DB versionado, sequencial, imutável
- Naming: `NNN_descricao_curta.sql` (ex.: `032_lixeira_leads.sql`)
- Padrão: cada migração é additiva; correções viram nova migração

**`supabase/functions/`:**
- Purpose: Edge Functions (Deno) para integrações fora do client
- Contains: `notify-indicacao/`, `notify-renovacao/`, `notify-tarefa/`, `slack-commands/`, `slack-proxy/`
- Naming: pasta `kebab-case/` com `index.ts`

**`api/`:**
- Purpose: serverless functions Vercel (espelham algumas Edge Functions quando precisam rodar no domínio do app)
- Contains: `slack-proxy.ts`
- Padrão: 1 arquivo = 1 endpoint

**`scripts/`:**
- Purpose: scripts one-off (ESM `.mjs`) — importação de dados, migrações pontuais
- Contains: importadores do Pipefy (CRM legado) + pasta `data/`
- Padrão: rodam com `node scripts/<arquivo>.mjs`

**`tests/`:**
- Purpose: testes que não são unit (E2E + RLS)
- Contains: `e2e/` (Playwright) e `rls/` (vitest contra Supabase real ou mock)

**`docs/`:**
- Purpose: documentação narrativa
- Contains: `slack-indicacoes.md`, `superpowers/` (subpasta)

**`.planning/codebase/`:**
- Purpose: codebase maps gerados pelo `/gsd-map-codebase` (este documento)
- Generated: Yes (parcialmente)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `index.html`: shell HTML; injeta `src/main.tsx`
- `src/main.tsx`: bootstrap React + providers + router
- `src/router.tsx`: definição de rotas
- `vite.config.ts`: build/dev server config (alias `@` → `./src`)

**Configuration:**
- `package.json`: dependências + scripts (`dev`, `build`, `lint`, `test`, `test:watch`, `test:cov`, `test:e2e`, `test:rls`)
- `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json`: TS configs
- `tailwind.config.js`, `postcss.config.js`: Tailwind
- `eslint.config.js`: ESLint flat config
- `vitest.config.ts` + `vitest.setup.ts`: unit tests
- `playwright.config.ts`: E2E
- `vercel.json`: deploy
- `.env` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (obrigatórias, ver `src/lib/supabase.ts:8-17`)

**Core Logic:**
- `src/lib/supabase.ts`: cliente Supabase singleton
- `src/lib/query-keys.ts`: chaves canônicas do TanStack Query
- `src/lib/constants.ts`: enums de domínio (stages, segmentos, status, áreas)
- `src/lib/icp-dinamico.ts`: cálculo ICP observado / win-rate / fit
- `src/lib/periods.ts`: filtros de período
- `src/lib/utils.ts`: `cn`, `formatCurrency`, `formatDate`, `getUFFromPhone`, `getInitials`
- `src/types/index.ts`: tipos de domínio

**Auth + Shell:**
- `src/components/layout/AppLayout.tsx`: shell do CRM + guarda de sessão
- `src/pages/portal/PortalLayout.tsx`: shell do Portal
- `src/pages/LoginPage.tsx`: login com seletor de portal CRM/Portal
- `src/pages/ResetPasswordPage.tsx`: destino do email de reset
- `src/contexts/ThemeContext.tsx`: tema dark/light
- `src/hooks/useCurrentRole.ts`: helpers de hierarquia (`atLeast('coordenador')`)
- `src/components/shared/RequireRole.tsx`: guard de UI por role

**Testing:**
- `src/test/render-utils.tsx`: helper para renderizar componentes com providers
- `src/test/supabase-mock.ts`: mock do supabase-js
- `src/components/__tests__/`: testes de componentes
- `src/hooks/__tests__/`: testes de hooks
- `src/lib/__tests__/`: testes de funções puras
- `tests/e2e/`: Playwright (`smoke.spec.ts`, `lead-exclusao.spec.ts`)
- `tests/rls/`: testes de RLS (`rls-role-aware.test.ts`)

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (ex.: `LeadCard.tsx`, `KanbanBoard.tsx`)
- shadcn/ui primitives in `src/components/ui/`: `kebab-case.tsx` em minúsculas (ex.: `dropdown-menu.tsx`)
- Hooks: `useCamelCase.ts` (ex.: `useLeads.ts`, `usePerfis.ts`)
- Lib utilities: `kebab-case.ts` (ex.: `icp-dinamico.ts`, `query-keys.ts`)
- Pages: `PascalCase` + sufixo `Page` (ex.: `LeadsPage.tsx`, `ClienteDetailPage.tsx`, `PortalWalletPage.tsx`)
- Tests: `<arquivo>.test.ts` ou `.test.tsx` em pasta `__tests__/` adjacente
- Migrações SQL: `NNN_descricao_em_snake.sql` (ex.: `032_lixeira_leads.sql`)
- Edge Functions: pasta `kebab-case/` com `index.ts` dentro
- Scripts: `nome-em-kebab.mjs` (ESM)

**Directories:**
- `kebab-case` para features e libs (`portal-admin/`, `slack-commands/`)
- `lowercase` simples para coleções (`leads/`, `clientes/`, `hooks/`, `pages/`)
- `__tests__/` (com underscores) para colocar testes ao lado do código testado
- `<feature>/` dentro de `src/components/` espelha o nome do recurso (`leads/`, `clientes/`, `contratos/`, `diagnostico/`)

**Code:**
- Funções/variáveis: `camelCase` (ex.: `getUFFromPhone`, `filteredLeads`)
- Componentes/Tipos/Interfaces: `PascalCase` (ex.: `Lead`, `KanbanBoard`, `IcpFitContext`)
- Constantes top-level: `SCREAMING_SNAKE_CASE` (ex.: `PIPELINE_STAGES`, `TERMINAL_WON_STAGES`, `QUERY_KEYS`)
- Português em strings de UI / labels de domínio; inglês em nomes de código

## Where to Add New Code

**Nova página/rota:**
- Criar `src/pages/MinhaNovaPage.tsx` (PascalCase + sufixo `Page`)
- Registrar no `src/router.tsx` dentro do `AppLayout` (rota CRM) ou `PortalLayout` (rota Portal)
- Adicionar entrada de nav em `src/components/layout/Sidebar.tsx` (`NAV_GROUPS`) se for navegável pela sidebar do CRM, ou `NAV` em `src/pages/portal/PortalLayout.tsx` para o Portal
- Se a página precisa de role específico, envolver com `<RequireRole atLeast="coordenador">`

**Novo componente de feature:**
- Pasta existente: `src/components/<feature>/NovoComponente.tsx`
- Pasta nova (feature inédita): criar `src/components/<feature>/` em snake-free lowercase (ex.: `renovacoes/`); manter primitivos UI fora dela
- Compartilhado entre 2+ features: `src/components/shared/<Nome>.tsx` (revisar se realmente é cross-feature)

**Novo primitivo UI (shadcn-style):**
- Adicionar em `src/components/ui/nome-em-kebab.tsx` em lowercase
- Seguir o padrão dos existentes: wrapper sobre Radix + `class-variance-authority` quando há variants

**Novo hook de dados:**
- Criar `src/hooks/useNovoRecurso.ts`
- Importar `supabase`, `QUERY_KEYS`, tipos de `@/types`
- Exportar pares `useNovoRecurso()` (query) + `useCreateNovoRecurso()`, `useUpdateNovoRecurso()`, `useDeleteNovoRecurso()` (mutations) — espelhar padrão de `src/hooks/useLeads.ts`
- Adicionar a chave em `src/lib/query-keys.ts` ANTES de usar
- Side-effects (audit, toast) no `onSuccess`/`onError` — não no `mutationFn`

**Novo tipo de domínio:**
- Adicionar interface em `src/types/index.ts` (NUNCA criar arquivo paralelo de tipos)
- Se for um literal enum de UI/domínio (ex.: lista de status), também adicionar a array de opções em `src/lib/constants.ts`

**Nova lógica pura (cálculo, parser, validador):**
- `src/lib/<nome-kebab>.ts` — sem imports React, sem Supabase
- Adicionar testes em `src/lib/__tests__/<nome>.test.ts`

**Nova constante de domínio:**
- `src/lib/constants.ts` — agrupar pelo conceito (status, tipos, segmentos)
- Exportar `as const` para preservar literais

**Nova migração de DB:**
- Criar `supabase/migrations/0NN_descricao_curta.sql` (próximo número sequencial — atualmente 033 será o próximo)
- Migrações são imutáveis: para corrigir uma migração antiga, escreva uma nova
- Para operações sensíveis (delete em cascata, alteração de saldo de tokens), criar RPC `SECURITY DEFINER` com checagem de role e GRANT EXECUTE TO authenticated; chamar via `supabase.rpc(...)` num hook
- Aplicar policies de RLS na mesma migração; nunca deixar tabela nova sem RLS

**Nova Edge Function:**
- `supabase/functions/<nome-kebab>/index.ts` (Deno)
- Helpers em arquivos vizinhos (ver `supabase/functions/notify-indicacao/slack.ts`, `types.ts`)
- Deploy: `supabase functions deploy <nome>`

**Nova serverless Vercel (se a Edge Function precisa rodar no mesmo domínio do front):**
- `api/<nome>.ts` espelhando a Edge Function (ver `api/slack-proxy.ts`)

**Novo teste:**
- Unit (lib pura): `src/lib/__tests__/<nome>.test.ts`
- Hook: `src/hooks/__tests__/<nome>.test.tsx` (com `renderHook`)
- Componente: `src/components/__tests__/<Nome>.test.tsx`
- E2E: `tests/e2e/<feature>.spec.ts` (Playwright)
- RLS: `tests/rls/<policy>.test.ts`

## Special Directories

**`dist/`:**
- Purpose: output do `vite build`
- Generated: Yes
- Committed: No (gitignored)

**`node_modules/`:**
- Purpose: dependências npm
- Generated: Yes
- Committed: No (gitignored)

**`test-results/`:**
- Purpose: relatórios e screenshots do Playwright
- Generated: Yes
- Committed: No (gitignored)

**`public/`:**
- Purpose: estáticos servidos na raiz pelo Vite (referenciar via `/logo.png`)
- Generated: No
- Committed: Yes

**`src/assets/`:**
- Purpose: imagens importadas pelo bundler (`import logo from '@/assets/x.png'`)
- Generated: No
- Committed: Yes

**`scripts/data/`:**
- Purpose: dumps CSV/JSON usados pelos importadores em `scripts/migrate-*.mjs`
- Generated: parcialmente
- Committed: depende do dump (sem dados sensíveis)

**`supabase/.temp/`:**
- Purpose: cache da CLI do Supabase (`cli-latest`)
- Generated: Yes
- Committed: parcialmente (apenas marker file `cli-latest` — ver gitignore)

**`.planning/`:**
- Purpose: planos do GSD + maps do codebase (este doc vive aqui)
- Generated: parcialmente (gerados pelos comandos GSD)
- Committed: Yes

---

*Structure analysis: 2026-05-26*
