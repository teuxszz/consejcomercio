<!-- refreshed: 2026-05-26 -->
# Architecture

**Analysis Date:** 2026-05-26

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (SPA)                              │
│  Vite + React 19 + React Router 7 — `index.html` → `src/main.tsx`   │
├──────────────────────────────────────────────────────────────────────┤
│                       Providers (top-down)                          │
│  StrictMode → ErrorBoundary → ThemeProvider → QueryClientProvider   │
│              → RouterProvider                                        │
│  `src/main.tsx`                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴────────────────────┐
                ▼                                      ▼
┌────────────────────────────────┐  ┌────────────────────────────────┐
│   CRM Shell (interno)          │  │  Portal Shell (cliente)        │
│   `src/components/layout/      │  │  `src/pages/portal/            │
│    AppLayout.tsx` +            │  │   PortalLayout.tsx`            │
│   `Sidebar.tsx` +              │  │  (NavLinks de Carteira /       │
│   `GlobalSearch.tsx` +         │  │   Indicar / Catálogo /         │
│   `OnboardingWizard.tsx`       │  │   Histórico)                   │
│                                │  │                                │
│   Guard: perfil.tipo !==       │  │  Guard: sessão presente;       │
│   'cliente' (redireciona       │  │  interno pode "Ir para o CRM"  │
│   cliente p/ /portal)          │  │  via dropdown                  │
└────────────────────────────────┘  └────────────────────────────────┘
                │                                      │
                ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Pages (route handlers — `src/pages/*.tsx` + `src/pages/portal/`)   │
│  ex.: `LeadsPage`, `LeadDetailPage`, `IcpDinamicoPage`,             │
│       `ClienteDetailPage`, `ContratosPage`, `PortalWalletPage`      │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Hooks (data + mutations — `src/hooks/use*.ts`)                     │
│  - Query/mutation pairs envolvendo o Supabase client                │
│  - Cache via TanStack Query + chaves em `src/lib/query-keys.ts`     │
│  - Side-effects: audit_logs, toasts, invalidations                  │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Lib (pure logic + supabase client)                                 │
│  `src/lib/supabase.ts` (singleton)                                  │
│  `src/lib/icp-dinamico.ts` (cálculo ICP observado/win-rate)         │
│  `src/lib/diagnostic-utils.ts`, `src/lib/projecao.ts`,              │
│  `src/lib/periods.ts`, `src/lib/constants.ts`                       │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Supabase (BaaS)                                                    │
│  - Postgres (tabelas + RPCs SECURITY DEFINER)                       │
│  - Auth (email/password + reset)                                    │
│  - Storage (`avatars` bucket)                                       │
│  - Edge Functions: `supabase/functions/notify-indicacao`,           │
│    `notify-renovacao`, `notify-tarefa`, `slack-commands`,           │
│    `slack-proxy`                                                    │
│  - RLS por tipo (interno/cliente) e role (consultor → diretor)      │
│  Migrações: `supabase/migrations/001..032_*.sql` (30 arquivos)      │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `main.tsx` | Bootstrap: monta provedores (ErrorBoundary, Theme, QueryClient, Router) | `src/main.tsx` |
| `router.tsx` | Configura `createBrowserRouter` com 3 escopos: público (`/login`, `/reset-password`), CRM (`/` + `AppLayout`), Portal (`/portal` + `PortalLayout`) | `src/router.tsx` |
| `AppLayout` | Shell do CRM: verifica sessão, redireciona cliente p/ `/portal`, monta Sidebar/GlobalSearch/Onboarding/Toaster e renderiza `<Outlet />` | `src/components/layout/AppLayout.tsx` |
| `PortalLayout` | Shell do Portal de Indicações (cliente + interno opt-in): header com saldo de tokens + nível, nav horizontal | `src/pages/portal/PortalLayout.tsx` |
| `Sidebar` | Navegação principal do CRM, agrupada em PIPELINE / CLIENTES / CRESCIMENTO / COMUNICAÇÃO + dropdown de perfil (account switcher CRM ↔ Portal) | `src/components/layout/Sidebar.tsx` |
| `GlobalSearch` | Cmd/Ctrl+K — busca cross-entidade lendo as queries já em cache (leads, clientes, contratos, etc.) | `src/components/layout/GlobalSearch.tsx` |
| `ErrorBoundary` | Captura erros de render e mostra fallback no lugar de tela branca | `src/components/ErrorBoundary.tsx` |
| `ThemeProvider` | Toggle dark/light persistido em `localStorage` (classes `light`/`dark` no `<html>`) | `src/contexts/ThemeContext.tsx` |
| `RequireRole` | Guarda de conteúdo por role (`roles=[...]` ou `atLeast=...`) usando `useCurrentRole` | `src/components/shared/RequireRole.tsx` |
| `ScopeToggle` | Toggle canônico "Minhas / Todas" em listagens com filtro por responsável | `src/components/shared/ScopeToggle.tsx` |
| `PeriodSelector` | Seletor canônico de período (ano + granularidade trim/sem/total) | `src/components/shared/PeriodSelector.tsx` |
| `supabase` client | Singleton do Supabase JS — falha cedo com mensagem clara se faltarem env vars | `src/lib/supabase.ts` |
| `icp-dinamico` | Cálculo de ICP observado, win-rate e contexto `IcpFit` (Set O(1) usado no `LeadCard`) | `src/lib/icp-dinamico.ts` + `src/hooks/useIcpFit.ts` |

## Pattern Overview

**Overall:** SPA (Single Page Application) + BaaS (Backend-as-a-Service).

Aplicação 100% client-side servida estaticamente (Vite build) que consome
diretamente o Supabase via `@supabase/supabase-js`. Não há camada de API
própria entre o browser e o banco — autenticação, autorização (RLS) e
lógica de gravação privilegiada (RPCs `SECURITY DEFINER`) vivem no
Postgres. Edge Functions cobrem integrações externas (Slack).

**Key Characteristics:**
- **3 shells em uma SPA:** `/login` (público), `/` (CRM interno com `AppLayout`), `/portal` (Portal de Indicações com `PortalLayout`). Account switcher no dropdown do header alterna entre CRM e Portal para usuários `tipo='interno'`; clientes (`tipo='cliente'`) são forçados ao Portal pelo `AppLayout`.
- **Hooks são a camada de dados:** cada agregado tem um arquivo `src/hooks/use<Recurso>.ts` que expõe queries (`useLeads`, `useCliente(id)`) e mutations (`useCreateLead`, `useUpdateLeadStatus`).
- **Mutations escrevem em múltiplas tabelas:** o pattern padrão é `mutationFn` faz o write principal e o `onSuccess` invalida queries + insere `audit_logs` + cria reflexos (ex.: `useCreateLead` insere `indicacoes` quando origem é referral).
- **Optimistic updates onde DnD importa:** `useUpdateLeadStatus` faz `onMutate` (rollback no `onError`) para o kanban responder instantaneamente.
- **RPCs SECURITY DEFINER substituem mutations diretas em casos sensíveis:** `excluir_lead` / `restaurar_lead` (lixeira), `solicitar_resgate` (portal).
- **Estado server-side via TanStack Query; estado UI local via `useState`/`useSearchParams`.** Sem Redux, sem Zustand.
- **Filtros bookmarkable via URL:** `/leads?status=ganho&segmento=...` para drill-down (ver `LeadsPage`).

## Layers

**Routing Layer (`src/router.tsx`):**
- Purpose: declara todas as rotas em um único `createBrowserRouter`
- Location: `src/router.tsx`
- Contains: rotas públicas (`/login`, `/reset-password`), rotas CRM (filhas de `AppLayout`), rotas Portal (filhas de `PortalLayout`), catch-all `*` → `/dashboard`
- Depends on: páginas em `src/pages/`
- Used by: `RouterProvider` em `src/main.tsx`

**Layout/Shell Layer (`src/components/layout/`, `src/pages/portal/PortalLayout.tsx`):**
- Purpose: chrome global da aplicação — sidebar, header, search, onboarding, toaster + guarda de sessão
- Location: `src/components/layout/AppLayout.tsx`, `src/components/layout/Sidebar.tsx`, `src/pages/portal/PortalLayout.tsx`
- Depends on: `supabase` client, `useMeuPerfil`, `useTheme`
- Used by: roteador como `element` das rotas pai

**Page Layer (`src/pages/`):**
- Purpose: composição por rota — orquestra hooks, filtros, layout específico
- Location: `src/pages/*.tsx` (32 páginas CRM + 5 páginas Portal em `src/pages/portal/`)
- Depends on: hooks (`src/hooks/`), componentes feature (`src/components/<feature>/`), primitivos UI (`src/components/ui/`)
- Used by: roteador

**Feature Components Layer (`src/components/<feature>/`):**
- Purpose: componentes ricos por domínio — kanban, modais, formulários, dashboards
- Location: `src/components/leads/`, `src/components/clientes/`, `src/components/diagnostico/`, `src/components/me/`, `src/components/onboarding/`, `src/components/portal-admin/`, etc.
- Depends on: hooks, primitivos UI, libs (`@dnd-kit`, `recharts`)
- Used by: páginas correspondentes (a página `LeadsPage` usa `components/leads/KanbanBoard.tsx`, etc.)

**Shared Components Layer (`src/components/shared/`):**
- Purpose: componentes cross-feature canônicos (toggles, badges, dialogs, role guard)
- Location: `src/components/shared/ScopeToggle.tsx`, `PeriodSelector.tsx`, `RequireRole.tsx`, `DeleteConfirmDialog.tsx`, `ActivityTimeline.tsx`, `ResponsavelBadge.tsx`
- Depends on: primitivos UI, hooks
- Used by: páginas e feature components

**Primitives Layer (`src/components/ui/`):**
- Purpose: design system — wrappers shadcn/ui sobre Radix (Dialog, DropdownMenu, Tabs, Select, Avatar, Button, Input, etc.)
- Location: `src/components/ui/*.tsx` (16 primitivos)
- Depends on: Radix UI, `class-variance-authority`, `clsx`, `tailwind-merge` via `cn()` em `src/lib/utils.ts`
- Used by: praticamente tudo acima

**Hooks Layer (`src/hooks/`):**
- Purpose: contrato entre UI e dados — queries + mutations TanStack Query
- Location: `src/hooks/use<Recurso>.ts` (22 arquivos: `useLeads`, `useClientes`, `useContratos`, `useDemandas`, `useIndicacoes`, `useOportunidades`, `useParceiros`, `useReunioes`, `useTarefas`, `useDiagnostico`, `useAnalyzeDiagnostico`, `usePerfis`, `useCurrentRole`, `useConfiguracoes`, `useGamification`, `useIcpFit`, `useObjecoes`, `useAuditLog`, `useAuditLogs`, `useInteracoes`, `usePortal`, `usePortalAdmin`, `usePosJuniors`)
- Depends on: `@/lib/supabase`, `@/lib/query-keys`, `@/types`
- Used by: pages, layout, components

**Lib/Utils Layer (`src/lib/`):**
- Purpose: lógica pura, configuração, cliente Supabase, constantes
- Location: `src/lib/supabase.ts`, `query-keys.ts`, `constants.ts`, `utils.ts`, `periods.ts`, `icp-dinamico.ts`, `projecao.ts`, `diagnostic-utils.ts`, `diagnostic-questions.ts`, `cadencia.ts`, `mensagens-rules.ts`, `blocos-mensagem.ts`, `slack.ts`, `slack-suggestions.ts`, `cnpj.ts`, `tarefas-derivadas.ts`
- Depends on: bibliotecas npm puras (`date-fns`, `clsx`, `tailwind-merge`, `@supabase/supabase-js`)
- Used by: hooks, components, pages

**Backend Layer (`supabase/`):**
- Purpose: Postgres schema + RLS + RPCs + Edge Functions
- Location: `supabase/migrations/001..032_*.sql`, `supabase/functions/<fn>/index.ts`
- Used by: client via REST/RPC (PostgREST) e auth

## Data Flow

### Primary Request Path (CRM — listar leads no Kanban)

1. Browser carrega `index.html` (`index.html:11`) → executa `src/main.tsx`.
2. `main.tsx:19-29` monta provedores: `StrictMode` → `ErrorBoundary` → `ThemeProvider` → `QueryClientProvider` → `RouterProvider`.
3. Router (`src/router.tsx:43-79`) casa `/leads` → renderiza `AppLayout` → guard checa sessão (`AppLayout.tsx:17-33`) → renderiza `<Outlet />` com `LeadsPage`.
4. `LeadsPage` (`src/pages/LeadsPage.tsx`) chama `useLeads()` (`src/hooks/useLeads.ts:7-19`).
5. `useLeads` dispara `supabase.from('leads').select('*, diagnostico:diagnosticos(*)')` e cacheia sob `QUERY_KEYS.leads.all = ['leads']` (`src/lib/query-keys.ts:3`).
6. Resposta tipada como `Lead[]` (`src/types/index.ts:1-24`) flui de volta; `KanbanBoard` (`src/components/leads/KanbanBoard.tsx`) agrupa por `status` e renderiza colunas.

### Auth Flow

1. Usuário acessa `/` (qualquer rota protegida) → `AppLayout` chama `supabase.auth.getSession()` (`AppLayout.tsx:17`).
2. Sem sessão → `navigate('/login')`. Com sessão → busca `perfis.tipo`; se `cliente` → `/portal`, senão libera CRM.
3. Login (`src/pages/LoginPage.tsx:44-55`): `supabase.auth.signInWithPassword` → `destinoParaPerfil` decide rota (cliente → `/portal`; interno respeita seletor "Equipe CONSEJ" vs "Portal de Indicações").
4. `onAuthStateChange` (`AppLayout.tsx:35-42`) escuta `SIGNED_OUT` → `queryClient.clear()` (limpa cache do usuário anterior) → `/login`.
5. Reset de senha: `/login` (modo `forgot`) → `supabase.auth.resetPasswordForEmail` com redirect para `/reset-password` (`src/pages/ResetPasswordPage.tsx`).

### Lead Pipeline / Drag-and-Drop

1. `LeadsPage` filtra `leads` por período/escopo/origem/etc. (`LeadsPage.tsx:74+`) e injeta `filteredLeads` em `KanbanBoard`.
2. `KanbanBoard` (`src/components/leads/KanbanBoard.tsx:32`) configura `DndContext` com `PointerSensor` (distance 5).
3. `handleDragEnd` (`KanbanBoard.tsx:45-71`) resolve stage destino. Se for `perdido`/`cancelado` → abre `LostReasonModal`; se `ganho_*` → abre `ConvertToClientModal`; senão chama `updateStatus.mutate({ id, status })`.
4. `useUpdateLeadStatus` (`src/hooks/useLeads.ts:70-116`) faz update otimista (`onMutate` patcha cache, `onError` faz rollback), invalida `leads.all` + `dashboard` no `onSettled`, e registra em `audit_logs` com nome do usuário atual.

### Diagnostic Flow

1. `LeadDetailPage` → `DiagnosticForm` (`src/components/diagnostico/DiagnosticForm.tsx`) avança por `SECTIONS` (em `src/lib/diagnostic-questions.ts`).
2. Submit: `useSaveDiagnostico` (`src/hooks/useDiagnostico.ts:24-53`) calcula `getClusterRecommendation` (`src/lib/diagnostic-utils.ts`) e faz `upsert` em `diagnosticos` por `lead_id`; o mesmo mutation avança o lead para `status='educar_lead'`.
3. `useAnalyzeDiagnostico` (`src/hooks/useAnalyzeDiagnostico.ts`) roda uma engine de regras pura (sem API externa) que devolve `AnaliseIA` com `servicos_recomendados` mapeados para `ServicoConfig.id` via `DIAGNOSTICO_SERVICE_MAP`.

### Client / Contract Flow

1. Conversão lead → cliente: `ConvertToClientModal` (`src/components/leads/ConvertToClientModal.tsx`) cria registro em `clientes` + atualiza lead para stage `ganho_*`.
2. `useCreateContrato` (`src/hooks/useContratos.ts:38+`): após inserir contrato, lê o catálogo (`configuracoes.servicos`) e, para áreas do Direito não cobertas, gera linhas em `oportunidades` (cross-sell automático).
3. `ClienteDetailPage` (`src/pages/ClienteDetailPage.tsx`) usa `useCliente(id)` que faz join com `contratos(*)` e `indicado_por_cliente`.

### ICP Dinâmico Flow

1. `IcpDinamicoPage` (`src/pages/IcpDinamicoPage.tsx`) consome `useLeads()` + `useConfiguracoes()` e chama `calcularIcpDinamico(leads, period, servicoIds)` (`src/lib/icp-dinamico.ts:126-166`).
2. Para cada serviço: separa leads diretos (com `servicos_interesse` explícito) vs atribuíveis (sem tag); produz convicção (`alta` ≥10, `preliminar` ≥3, `insuficiente` <3), distribuição por segmento/investimento e win-rate.
3. `useIcpFit` (`src/hooks/useIcpFit.ts:21-31`) usa o mesmo cálculo no ano corrente para montar um `Set<string>` "segmento|investimento" — checagem O(1) por lead no `LeadCard` que exibe badge "ICP-fit".

### Lead Trash / Lixeira Flow

1. `useDeleteLead` (`src/hooks/useLeads.ts:118-134`) chama RPC `excluir_lead(p_id)` (`supabase/migrations/032_lixeira_leads.sql:44-95`).
2. A RPC (SECURITY DEFINER, restrita a `is_interno()`) bloqueia exclusão se o lead já virou cliente, serializa lead + diagnóstico + interações + tarefas + IDs de reuniões/indicações/objeções num JSONB, insere em `leads_lixeira` e DELETE no lead (cascata limpa filhos).
3. `useLeadsLixeira` lista pendentes (`restaurado_em IS NULL`); `useRestaurarLead` chama RPC `restaurar_lead` (apenas `is_coordenador_ou_acima()`), que reidrata via `jsonb_populate_record` preservando IDs originais.

### Portal de Indicações (Tokens)

1. `PortalLayout` carrega `usePortalPerfil` (`src/hooks/usePortal.ts:8-23`) — busca `tokens_saldo`/`tokens_historico_total` em `perfis`.
2. `PortalCatalogoPage` consome `useCatalogoRecompensas`; usuário pede `useSolicitarResgate` → RPC SECURITY DEFINER faz débito atômico em `token_transacoes` + cria `resgates` com `status='pendente'`.
3. `PortalAdminPage` (interno apenas, abas `RegrasTab` / `CampanhasTab` / `CatalogoTab`) gerencia regras e tabela de recompensas.
4. Account switcher: dropdown do `PortalLayout` mostra "Ir para o CRM" só se `perfil.tipo === 'interno'`; dropdown do `Sidebar` do CRM mostra "Portal de Indicações" para qualquer interno (`Sidebar.tsx:194-197`).

**State Management:**
- **Server state:** TanStack Query (`QueryClient` em `src/main.tsx:10-17`, defaults `staleTime=60s`, `retry=1`). Chaves centralizadas em `src/lib/query-keys.ts`. `useMeuPerfil` usa `staleTime:0` + `gcTime:0` para evitar bleed entre sessões.
- **UI local:** `useState`/`useReducer` por componente. Sem store global.
- **URL state:** filtros bookmarkable via `useSearchParams` em `LeadsPage` e `IcpDinamicoPage`.
- **Theme:** Context (`src/contexts/ThemeContext.tsx`) com persistência em `localStorage`.

## Key Abstractions

**`AppLayout` (CRM Shell):**
- Purpose: shell autenticado do CRM com guarda de sessão e redirecionamento de cliente
- Examples: `src/components/layout/AppLayout.tsx`
- Pattern: route layout (`<Outlet />`) + guarda imperativa no `useEffect`

**`PortalLayout` (Portal Shell):**
- Purpose: shell do Portal de Indicações com header de saldo/nível e dropdown que permite ao interno voltar para o CRM
- Examples: `src/pages/portal/PortalLayout.tsx`
- Pattern: idem `AppLayout`, mas com guarda mais permissiva (qualquer sessão válida)

**Account Switcher (CRM ↔ Portal):**
- Purpose: permitir ao mesmo usuário interno acessar tanto o CRM quanto o Portal sem deslogar; impedir cliente de ver o CRM
- Examples: dropdown do `Sidebar.tsx:161-204` (Meu Espaço / Portal / Sair) e header do `PortalLayout.tsx:97-143` (Ir para o CRM / Sair); seletor de portal no `LoginPage.tsx:131-162`
- Pattern: leitura de `perfis.tipo` (`interno`/`cliente`) decide destino; `destinoParaPerfil()` em `LoginPage.tsx:14-24`

**ICP Scoring (Dinâmico + Estático):**
- Purpose: avaliar se um lead bate com o perfil ideal — observado dos ganhos do ano OU configurado em `DEFAULT_SERVICOS`
- Examples: `src/lib/icp-dinamico.ts`, `src/hooks/useIcpFit.ts`, badge no `src/components/leads/LeadCard.tsx`, página dedicada `src/pages/IcpDinamicoPage.tsx`
- Pattern: função pura testável (`calcularIcpDinamico`, `buildIcpFitContext`, `isLeadIcpFit`) + hook fino que memoiza com base em `useLeads`+`useConfiguracoes`

**Lead Trash Bin:**
- Purpose: deletar lead sem perda — snapshot completo + restauração por coordenador+
- Examples: `useDeleteLead` / `useLeadsLixeira` / `useRestaurarLead` em `src/hooks/useLeads.ts`; RPCs em `supabase/migrations/032_lixeira_leads.sql`; UI na `AuditoriaPage` / `ConfiguracoesPage`
- Pattern: RPC `SECURITY DEFINER` no Postgres serializa em JSONB; tabela `leads_lixeira` sem FK pro `leads.id` (o lead já foi apagado)

**Role-based Authorization:**
- Purpose: hierarquia `consultor` < `coordenador` < `gerente` < `diretor`
- Examples: `src/hooks/useCurrentRole.ts` (expõe `isDiretor`, `isGerenteOrAcima`, `atLeast(min)`), `src/components/shared/RequireRole.tsx` (wrapper de UI)
- Pattern: ranking numérico (`ROLE_RANK`); RLS no Postgres replica a mesma hierarquia (ver `supabase/migrations/029_rls_role_aware.sql`)

**ErrorBoundary global:**
- Purpose: capturar erros de render para evitar tela branca
- Examples: `src/components/ErrorBoundary.tsx`
- Pattern: classe React clássica (`getDerivedStateFromError` + `componentDidCatch`), montada no topo da árvore em `main.tsx:21`

**Query Keys centralizadas:**
- Purpose: única fonte de verdade para chaves do TanStack Query (evita typos e invalidações que erram)
- Examples: `src/lib/query-keys.ts`
- Pattern: objeto `QUERY_KEYS` com chaves `as const` (tipos literais preservados)

**ScopeToggle "Minhas/Todas":**
- Purpose: padronizar filtro por responsável nas listagens
- Examples: `src/components/shared/ScopeToggle.tsx`; usado em `LeadsPage`, `ClientesPage`, `ContratosPage`, `MeEspacoPage`
- Pattern: `value: 'mine' | 'all'` + contadores opcionais

**PeriodSelector + `periods.ts`:**
- Purpose: filtro de período canônico (ano + total/T1-T4/S1-S2)
- Examples: `src/components/shared/PeriodSelector.tsx`, lógica em `src/lib/periods.ts`
- Pattern: `PeriodValue = { year, granularity }` + helpers `getPeriodRange`, `isInRange`, `isCurrentCycle`

## Entry Points

**`index.html`:**
- Location: `index.html`
- Triggers: requisição inicial do browser; Vite injeta o script de dev/build
- Responsibilities: declara `<div id="root">` e carrega `/src/main.tsx`

**`src/main.tsx`:**
- Location: `src/main.tsx`
- Triggers: importado por `index.html`
- Responsibilities: instancia `QueryClient`, monta `StrictMode → ErrorBoundary → ThemeProvider → QueryClientProvider → RouterProvider` em `document.getElementById('root')`

**`src/router.tsx`:**
- Location: `src/router.tsx`
- Triggers: passado ao `<RouterProvider>` em `main.tsx`
- Responsibilities: define toda a árvore de rotas (público, CRM, Portal, catch-all)

**`src/App.tsx`:**
- Location: `src/App.tsx`
- Triggers: nenhum no momento (arquivo só exporta `{}` — `main.tsx` usa diretamente o router); mantido como placeholder
- Responsibilities: nenhuma — não importar deste arquivo

**Supabase Edge Functions (entry points fora do SPA):**
- `supabase/functions/notify-indicacao/index.ts` — webhook chamado por triggers/cron para notificar Slack sobre nova indicação
- `supabase/functions/notify-renovacao/index.ts` — alerta de renovação (cron em `supabase/migrations/031_cron_renovacoes.sql`)
- `supabase/functions/notify-tarefa/index.ts` — notificação de tarefa
- `supabase/functions/slack-commands/index.ts` — handler de slash commands do Slack
- `supabase/functions/slack-proxy/index.ts` — proxy CORS-safe pro Slack (espelhado em `api/slack-proxy.ts` para Vercel)

## Architectural Constraints

- **Threading:** browser single-threaded (event loop). Sem workers.
- **Global state:** singleton do `supabase` client em `src/lib/supabase.ts:19`; `QueryClient` único em `src/main.tsx:10`; `localStorage` para tema, dica do kanban (`consej_kanban_hint`).
- **Sem camada de API própria:** browser fala direto com Supabase. Toda autorização vive em RLS + RPCs `SECURITY DEFINER`. Mutações privilegiadas (excluir lead, restaurar lead, solicitar resgate) DEVEM ser RPCs, não inserts/updates diretos.
- **Configurações em linha única:** registro `configuracoes` único (`id='default'`) hospeda catálogo de serviços (`servicos`), metas, configs de mensagens — ler/escrever sempre via `useConfiguracoes`.
- **Tipos centralizados:** todos os tipos de domínio vivem em `src/types/index.ts`. Não duplicar interfaces de domínio em outros arquivos.
- **Migrações sequenciais e imutáveis:** arquivos `supabase/migrations/NNN_*.sql` (001 → 032). Migrações antigas não são editadas; corrigir = nova migração.
- **Env vars obrigatórias:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — ausência lança erro no boot (`src/lib/supabase.ts:8-17`). Falha cedo, não silenciosa.
- **Circular imports:** nenhuma detectada. `hooks` importam `lib`; `lib` não importa `hooks`.

## Anti-Patterns

### Mutation direta para operações com cascata/auditoria

**What happens:** chamar `supabase.from('leads').delete()` direto no componente em vez de `useDeleteLead`/RPC `excluir_lead`.
**Why it's wrong:** perde a serialização da lixeira, perde o registro em `audit_logs`, e quebra a checagem `is_interno()` (cliente conseguiria deletar com a anon key se a RLS permitir).
**Do this instead:** usar o hook (`src/hooks/useLeads.ts:118-134`) que chama a RPC `excluir_lead`. Mesma regra para resgate de tokens (RPC `solicitar_resgate`, não `insert` direto em `resgates`).

### Definir query key inline

**What happens:** `useQuery({ queryKey: ['leads'], ... })` em arquivo novo.
**Why it's wrong:** typo causa cache miss; invalidações em outros lugares (`invalidateQueries({ queryKey: QUERY_KEYS.leads.all })`) não atingem o cache.
**Do this instead:** importar de `src/lib/query-keys.ts` ou adicionar a chave lá se for novo recurso.

### Duplicar tipos de domínio

**What happens:** redeclarar `interface Lead { ... }` dentro de um componente ou hook.
**Why it's wrong:** divergência inevitável quando o schema muda; um lugar continuará usando o tipo antigo.
**Do this instead:** importar de `@/types` (`src/types/index.ts`). Se faltar campo, adicionar lá.

### Ler `perfis.tipo` direto na página em vez de usar guards de layout

**What happens:** página decide se renderiza algo baseado em `tipo` lida em um `useEffect` próprio.
**Why it's wrong:** duplica a lógica de `AppLayout`/`PortalLayout` e cria flashes de conteúdo errado.
**Do this instead:** confiar nos guards dos layouts; para gating por role usar `<RequireRole atLeast="...">` (`src/components/shared/RequireRole.tsx`) ou `useCurrentRole()`.

### Filtros de listagem só em `useState`

**What happens:** filtros que o usuário gostaria de compartilhar (drill-down do Analytics) ficam só em estado local.
**Why it's wrong:** URL não reflete o filtro → não há link compartilhável nem deep-link do dashboard pra listagem filtrada.
**Do this instead:** usar `useSearchParams` para filtros importantes (ver `LeadsPage.tsx:40-59`).

## Error Handling

**Strategy:** falhar cedo em boot (env vars); capturar runtime errors no `ErrorBoundary` global; converter erros de mutation em toast (`sonner`).

**Patterns:**
- Boot: `src/lib/supabase.ts:8-17` lança `Error` claro se faltar env var.
- Render: `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) renderiza fallback com botão "Recarregar".
- Mutations: padrão é `onError: () => toast.error('...')` e `onSuccess: () => toast.success('...')` (ver qualquer hook em `src/hooks/`).
- RPCs com mensagens: quando o erro vem da RPC com `RAISE EXCEPTION`, repassar a mensagem original — `onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro...')` (ver `useDeleteLead`, `useRestaurarLead`).
- Optimistic updates: `onError` faz rollback do cache via `context.previous` (ver `useUpdateLeadStatus` em `src/hooks/useLeads.ts:85-96`).

## Cross-Cutting Concerns

**Logging:** `console.error` localizado. Sem serviço de telemetria (ver comentário em `ErrorBoundary.tsx:22`).
**Validation:** `zod` disponível (em `package.json`) + `react-hook-form` com `@hookform/resolvers` — usar em formulários complexos.
**Authentication:** Supabase Auth (`supabase.auth.*`). Sessão monitorada em `AppLayout`/`PortalLayout` via `onAuthStateChange`.
**Authorization:** RLS + RPCs `SECURITY DEFINER` no Postgres (verdade); `useCurrentRole`/`RequireRole` no front (UX — esconde o que o backend bloquearia).
**Audit:** tabela `audit_logs` populada pelo client (`supabase.from('audit_logs').insert(...)`) em mutations relevantes (ver `useCreateLead`, `useUpdateLeadStatus`, `useCreateCliente`) e pelas RPCs sensíveis (`excluir_lead`, `restaurar_lead`).
**Toasts:** `sonner` — `<Toaster />` montado em `AppLayout` e `PortalLayout`; `toast.success/error` chamado dos hooks.
**Date/i18n:** `date-fns` + locale `ptBR` (`src/lib/utils.ts:3-4`); moeda em `pt-BR` via `Intl.NumberFormat` (`utils.ts:11-13`).
**Styling:** TailwindCSS + design tokens (CSS vars `--cyan-hi`, `--alpha-bg-*`); helper `cn()` (`src/lib/utils.ts:6-8`) combina `clsx` + `tailwind-merge`.
**Slack integrations:** `src/lib/slack.ts`, `src/lib/slack-suggestions.ts` (client); Edge Functions `supabase/functions/notify-*` + `slack-commands` + `slack-proxy` (server).

---

*Architecture analysis: 2026-05-26*
