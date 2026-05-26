# Phase 1: Tasks + Adoption Signal — Research

**Researched:** 2026-05-26
**Domain:** Task management UI, Supabase RLS, Supabase Realtime, adoption analytics
**Confidence:** HIGH (everything verified directly against the codebase; no external libraries needed)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | Fechar RLS aberta (`authenticated_all`) em `tarefas` — adicionar policy `is_interno()` em migration 033 | RLS helper `is_interno()` ja existe em migration 021; pattern de policy role-aware ja usado em 029 |
| SEC-02 | Adicionar coluna `notificar boolean DEFAULT true` em `tarefas` — mesma migration 033 | Schema de `tarefas` confirmado em migration 014; `ALTER TABLE ... ADD COLUMN` e padrao sequencial |
| TASK-01 | Criar tarefa por lead com data de vencimento, responsavel e descricao | Hook `useCreateTarefa` ja existe; tipo `Tarefa` centralizado em `types/index.ts`; falta modal de criacao no contexto de `LeadDetailPage` |
| TASK-02 | Criar tarefa interna sem lead associado | Mesmo hook `useCreateTarefa`; `entidade_tipo/entidade_id` sao nullable no schema — tarefa sem lead e suportada nativamente |
| TASK-03 | Inbox de tarefas atribuidas ao usuario, ordenado por vencimento, com filtro status | Hook `useMinhasTarefas(userId)` ja existe; falta pagina `/tarefas` ou secao no `/me` |
| TASK-04 | Concluir, editar, excluir tarefa propria ou atribuida; coordenador+ gerencia qualquer | Hooks `useConcluirTarefa`, `useUpdateTarefa`, `useDeleteTarefa` ja existem; falta gate de permissao por role |
| NOTIF-04 | Badge numerico no sidebar com contagem de tarefas abertas via Supabase Realtime | Supabase JS v2 `supabase.channel()` com Realtime Postgres Changes ja disponivel; `Sidebar.tsx` ja tem acesso ao `useMeuPerfil` |
| ADOPT-01 | Card de adocao no Dashboard: logins dos ultimos 7 dias, leads criados na semana, tarefas criadas — visivel para coordenador+ | `audit_logs` ja registra acoes; `useAllAuditLogs` existe; falta query agregada e card no `DashboardPage` |
| ADOPT-02 | Pagina `/adocao` gated coordenador+: historico por usuario, ultimo login, leads/tarefas registrados no mes, leads atualizados | Dados ja em `audit_logs` + tabela `leads`; falta pagina nova `AdocaoPage` + rota no router |
| ADOPT-03 | Lista "leads esquecidos" (sem atualizacao ha 7+ dias) em DashboardPage e `/adocao` | Query em `leads` por `updated_at < NOW() - interval '7 days'` e status ativo; padrao ja usado em renovacoes |
</phase_requirements>

---

## Summary

Esta fase e principalmente de **wiring de infraestrutura existente + UI nova**. O schema de tarefas, os hooks, a edge function de notificacao e os helpers de RLS ja existem. O trabalho real e: (1) fechar o buraco de seguranca na RLS de tarefas, (2) construir os componentes de UI que o time vai usar no dia a dia, e (3) criar as queries de adocao sobre `audit_logs` + `leads`.

A estrategia e incremental: migration 033 primeiro (bloqueante de seguranca), depois UI de tarefas, depois badge Realtime no sidebar, depois paginas de adocao. Nenhuma nova dependencia npm e necessaria — o projeto ja tem tudo.

O risco principal e na query de adocao para "ultimo login por usuario": `audit_logs` registra acoes do CRM (criar lead, mover pipeline, etc.), mas **nao** registra automaticamente o evento de login do Supabase Auth. Isso precisa ser decidido: ou adicionamos um insert em `audit_logs` no `onAuthStateChange` do `AppLayout`, ou consultamos `auth.users.last_sign_in_at` via RPC `SECURITY DEFINER` (que requer service role — indisponivel no client). A solucao recomendada e gravar o login em `audit_logs` no `AppLayout`.

**Recomendacao primaria:** Migration 033 > `TarefaModal` (criacao por lead + interna) > `TarefasInboxPage` ou secao em `/me` > badge Realtime no `Sidebar` > card + pagina de adocao com login tracking via `audit_logs`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| RLS de tarefas (SEC-01) | Database (Supabase Postgres) | — | Seguranca vive no banco; `is_interno()` ja e helper disponivel |
| Coluna `notificar` (SEC-02) | Database (Supabase Postgres) | — | Schema change via migration |
| Criacao de tarefa por lead | Browser/Client (Modal) | Database (RLS) | Insert direto pelo client com anon key, RLS bloqueia cliente |
| Criacao de tarefa interna | Browser/Client (Modal) | Database (RLS) | Mesmo padrao; `entidade_tipo = null` |
| Inbox de tarefas do usuario | Browser/Client (Pagina) | Database (query filtrada) | `useMinhasTarefas` ja filtra por `atribuido_a_id` |
| Badge numerica de tarefas | Browser/Client (Sidebar) | Supabase Realtime | Count derivado de subscription em tempo real |
| Permissao de gerenciar tarefa | Database (RLS) + Browser (UX) | `useCurrentRole` | Backend bloqueia; frontend esconde botoes |
| Tracking de login | Browser/Client (`AppLayout`) | Database (`audit_logs`) | Inserir na tabela de auditoria no `SIGNED_IN` event |
| Painel de adocao (ADOPT-01/02) | Browser/Client (Pagina) | Database (query agregada) | Query sobre `audit_logs` + `leads`; coordenador+ via `RequireRole` |
| Leads esquecidos (ADOPT-03) | Browser/Client (Componente) | Database (query com filtro de data) | `leads.updated_at < 7 dias` e status ativo |

---

## Standard Stack

### Core (ja instalado — nenhuma instalacao necessaria)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@supabase/supabase-js` | 2.99.x | Realtime subscriptions, queries, auth events | Instalado |
| `@tanstack/react-query` | 5.90.x | Cache de queries de tarefas e adocao | Instalado |
| `react-hook-form` | 7.71.x | Formulario de criacao de tarefa | Instalado |
| `zod` | 4.3.x | Schema de validacao do formulario de tarefa | Instalado |
| `date-fns` | 4.1.x | Calculos de data (vencimento, "7+ dias sem atualizacao") | Instalado |
| `lucide-react` | 0.577.x | Icones (badge, inbox, calendario) | Instalado |
| `recharts` | 3.8.x | Graficos opcionais no painel de adocao | Instalado |
| `sonner` | 2.0.x | Toasts de sucesso/erro em mutations | Instalado |

**Instalacao necessaria:** nenhuma. Zero dependencias novas.

---

## Package Legitimacy Audit

Nao aplicavel. Esta fase nao instala nenhum pacote npm novo — usa exclusivamente dependencias ja presentes no `package.json`.

---

## Architecture Patterns

### System Architecture Diagram

```
[Usuario logado no CRM]
         |
         | dispara SIGNED_IN
         v
[AppLayout.onAuthStateChange]
         |
         | insert audit_logs (acao: 'login')
         v
[Supabase Postgres — audit_logs]
         |
         | (ADOPT-01/02: query agregada por usuario)
         v
[AdocaoPage / DashboardCard]


[Consultor abre LeadDetailPage]
         |
         | clica "Nova Tarefa"
         v
[TarefaModal (react-hook-form + zod)]
         |
         | useCreateTarefa.mutate({ entidade_tipo: 'lead', entidade_id: lead.id, ... })
         v
[Supabase Postgres — tarefas (RLS: is_interno())]
         |
         | INSERT dispara Database Webhook
         v
[Edge Function: notify-tarefa] ---> [Slack DM do responsavel]


[Sidebar monta supabase.channel()]
         |
         | subscription: Realtime Postgres Changes em tarefas
         | filtro: atribuido_a_id = auth.uid() AND status IN ('aberta','em_andamento')
         v
[useState(count)] ---> [Badge numerica no Sidebar]


[Coordenador acessa /adocao]
         |
         | RequireRole atLeast="coordenador"
         v
[AdocaoPage]
         |
         | useAdocao() — query audit_logs GROUP BY usuario + leads por updated_at
         v
[Tabela de adocao + lista leads esquecidos]
```

### Recommended Project Structure

Novos arquivos desta fase:

```
src/
  components/
    tarefas/
      TarefaModal.tsx          # Modal de criacao/edicao de tarefa (lead ou interna)
      TarefaCard.tsx           # Card de tarefa no inbox (status, vencimento, acoes)
      TarefaStatusBadge.tsx    # Badge de status (aberta/em_andamento/concluida)
    adocao/
      AdocaoCard.tsx           # Card resumo de adocao para o DashboardPage
      LeadsEsquecidosTable.tsx # Tabela de leads sem atualizacao ha 7+ dias
  hooks/
    useAdocao.ts               # Queries agregadas de adocao (logins, leads criados, esquecidos)
  pages/
    TarefasPage.tsx            # Inbox de tarefas do usuario (/tarefas)
    AdocaoPage.tsx             # Painel de adocao gated coordenador+ (/adocao)

supabase/
  migrations/
    033_rls_tarefas_notificar.sql  # SEC-01 + SEC-02
```

### Pattern 1: RLS com `is_interno()` (SEC-01)

**O que e:** Substituir a policy `authenticated_all` (que permite cliente ler tarefas internas) por uma policy que exige `is_interno()`.

**Quando usar:** Toda tabela de dados internos do CRM que ainda tem `authenticated_all` aberta.

```sql
-- Migration 033 — SEC-01
-- Source: supabase/migrations/021_lockdown_rls.sql (padrao estabelecido)

ALTER TABLE tarefas DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON tarefas;

-- Leitura: apenas internos
CREATE POLICY "interno_select_tarefas" ON tarefas
  FOR SELECT TO authenticated
  USING (public.is_interno());

-- Escrita: apenas internos, com restricoes adicionais por role se necessario
CREATE POLICY "interno_insert_tarefas" ON tarefas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_interno());

CREATE POLICY "interno_update_tarefas" ON tarefas
  FOR UPDATE TO authenticated
  USING (public.is_interno())
  WITH CHECK (public.is_interno());

CREATE POLICY "interno_delete_tarefas" ON tarefas
  FOR DELETE TO authenticated
  USING (public.is_interno());

ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;
```

**Nota de design para UPDATE/DELETE:** Coordenador+ pode gerenciar qualquer tarefa (TASK-04). Consultor so pode editar/excluir tarefa propria ou atribuida a ele. Essa logica pode ser implementada na RLS ou no hook. Recomendacao: implementar no hook (verificar `criado_por_id = auth.uid() OR atribuido_a_id = auth.uid()`) para consultor; aceitar qualquer update de coordenador+ no mesmo hook via `useCurrentRole`. A RLS so precisa garantir `is_interno()` — granularidade de role fica no frontend (pattern ja estabelecido no projeto com `RequireRole`/`useCurrentRole`).

### Pattern 2: Coluna `notificar` (SEC-02)

```sql
-- Migration 033 — SEC-02
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS notificar boolean NOT NULL DEFAULT true;
```

**Impacto na edge function `notify-tarefa`:** A funcao ja deployada dispara DM para qualquer INSERT/UPDATE com `atribuido_a_id != null`. Apos SEC-02, a funcao deve checar `record.notificar = true` antes de postar. Isso requer um update na edge function — o planner deve incluir essa tarefa.

**Impacto no tipo `Tarefa` em `types/index.ts`:** Adicionar campo `notificar?: boolean` para refletir a nova coluna.

### Pattern 3: Realtime subscription para badge (NOTIF-04)

**O que e:** Supabase Realtime Postgres Changes para manter o count de tarefas abertas sem polling.

**Onde montar:** No `Sidebar.tsx` (ja tem acesso a `useMeuPerfil` que fornece o `userId`). Alternativa: montar em `AppLayout` e passar o count via prop/context. Recomendacao: Context simples (`TarefaBadgeContext`) criado em `AppLayout`, consumido pelo `Sidebar` — evita prop drilling se o badge precisar aparecer em mais lugares no futuro.

```typescript
// Source: Supabase JS v2 docs — Realtime Postgres Changes
// [VERIFIED: fonte interna — useGamification.ts e outros hooks ja usam o padrao]

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useTarefasBadgeCount(userId: string | undefined) {
  const [count, setCount] = useState(0)

  // Carga inicial
  useEffect(() => {
    if (!userId) return
    supabase
      .from('tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('atribuido_a_id', userId)
      .in('status', ['aberta', 'em_andamento'])
      .then(({ count: c }) => setCount(c ?? 0))
  }, [userId])

  // Realtime: ouve INSERT, UPDATE, DELETE em tarefas
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`tarefas-badge-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tarefas',
          filter: `atribuido_a_id=eq.${userId}`,
        },
        () => {
          // Re-busca o count ao receber qualquer mudanca
          supabase
            .from('tarefas')
            .select('id', { count: 'exact', head: true })
            .eq('atribuido_a_id', userId)
            .in('status', ['aberta', 'em_andamento'])
            .then(({ count: c }) => setCount(c ?? 0))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return count
}
```

**Pitfall de filtro Realtime:** O Supabase Realtime nao suporta filtros compostos (ex.: `atribuido_a_id=eq.X AND status=in.(aberta,em_andamento)`) — apenas um filtro simples por canal. Por isso o pattern acima filtra por `atribuido_a_id` no canal e re-executa a query completa (com filtro de status) no callback. Isso esta correto.

**Pitfall de RLS + Realtime:** Com a nova RLS `is_interno()`, o Realtime vai respeitar a RLS automaticamente. Usuarios do tipo `cliente` nao receberao eventos de tarefas.

### Pattern 4: Login tracking via `audit_logs` (pre-requisito de ADOPT-01/02)

**Problema:** `audit_logs` nao registra eventos de login automaticamente. O `onAuthStateChange` do `AppLayout` recebe o evento `SIGNED_IN` mas nao grava nada.

**Solucao:** Inserir em `audit_logs` no evento `SIGNED_IN` dentro do `AppLayout.useEffect`. Usar o mesmo padrao fire-and-forget que ja existe no codebase para outros inserts de audit (com o caveat de que o CONCERNS.md aponta isso como tech debt — idealmente com `try/catch`).

```typescript
// Adicionar dentro do useEffect de onAuthStateChange em AppLayout.tsx
if (event === 'SIGNED_IN' && session?.user) {
  // nao bloquear a navegacao — fire-and-forget com log de erro
  supabase.from('audit_logs').insert({
    tabela: 'perfis',
    registro_id: session.user.id,
    acao: 'login',
    usuario: session.user.email,
  }).then(({ error }) => { if (error) console.error('audit login:', error) })
}
```

**Alternativa descartada:** Consultar `auth.users.last_sign_in_at` direto — requer service role key, que nao esta disponivel no client. Descartada.

### Pattern 5: Query de leads esquecidos (ADOPT-03)

```typescript
// Leads ativos sem atualizacao ha 7+ dias
// Pattern baseado em: src/hooks/useReunioes.ts e periodos de renovacao

const sevenDaysAgo = new Date()
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

const { data } = await supabase
  .from('leads')
  .select('id, nome, empresa, status, updated_at, responsavel_id')
  .in('status', ACTIVE_LEAD_STAGES) // importar de src/lib/constants.ts
  .lt('updated_at', sevenDaysAgo.toISOString())
  .order('updated_at', { ascending: true })
  .limit(50)
```

`ACTIVE_LEAD_STAGES` ja esta definida em `src/lib/constants.ts`.

### Pattern 6: Formulario de criacao de tarefa (TASK-01/02)

O `TarefaModal` deve usar `react-hook-form` + `zod` seguindo o padrao de `NewLeadModal.tsx` (unico formulario com zod no projeto — e o modelo a seguir).

```typescript
// Zod schema para TarefaModal — seguir padrao de NewLeadModal.tsx
import { z } from 'zod'

const tarefaSchema = z.object({
  titulo: z.string().min(3, 'Titulo obrigatorio (min 3 chars)'),
  descricao: z.string().optional(),
  tipo: z.enum(['generica', 'followup', 'reuniao_prep', 'renovacao', 'upsell', 'diagnostico', 'proposta', 'cobranca']),
  prioridade: z.enum(['baixa', 'media', 'alta', 'critica']),
  atribuido_a_id: z.string().uuid('Responsavel obrigatorio').min(1),
  data_vencimento: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})
type TarefaFormData = z.infer<typeof tarefaSchema>
```

**Campos automaticos no submit (nao no formulario):**
- `criado_por_id`: `perfil.id` do usuario logado (de `useMeuPerfil()`)
- `entidade_tipo`: passado como prop ao modal (`'lead' | null`)
- `entidade_id`: passado como prop ao modal (UUID do lead | `null`)
- `status`: sempre `'aberta'` na criacao
- `notificar`: sempre `true` na criacao via modal de usuario

### Anti-Patterns a Evitar

- **Nao usar `authenticated_all` em tarefas novamente.** A migration 033 fecha isso permanentemente.
- **Nao fazer polling para o badge.** Usar Realtime subscription — evita N requests por minuto.
- **Nao definir query key de tarefas inline.** Usar `QUERY_KEYS.tarefas.*` de `src/lib/query-keys.ts`. A chave `tarefas.mine(userId)` ja existe.
- **Nao duplicar o tipo `Tarefa`.** Adicionar campos novos (ex.: `notificar`) em `src/types/index.ts`.
- **Nao usar `select('*')` na query de adocao.** As queries de adocao devem selecionar so as colunas necessarias para evitar trafego desnecessario.
- **Nao chamar `auth.users` direto do client.** Tabela `auth.users` nao e acessivel pelo anon key — usar `audit_logs` para login tracking.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Contagem em tempo real de tarefas | Polling com `setInterval` | `supabase.channel()` Realtime Postgres Changes | Ja disponivel; zero custo; sem polling |
| Validacao do formulario de tarefa | Validacao manual com `if` | `react-hook-form` + `zod` | Padrao ja estabelecido em `NewLeadModal.tsx` |
| Gate de role no painel de adocao | Verificacao manual de `perfil.tipo` | `<RequireRole atLeast="coordenador">` | Componente canonico ja existe |
| Calculo de "7 dias sem atualizacao" | Logica custom de diff de datas | `date-fns` `differenceInDays` | Ja instalado; evita bugs de timezone |
| Seletor de usuario (responsavel) | Lista manual de perfis | `usePerfis()` + `<Select>` de shadcn | Hook ja existe; evita query duplicada |
| Persistencia de filtros do inbox | `localStorage` manual | `useSearchParams` | Padrao bookmarkable ja estabelecido no projeto |

---

## Common Pitfalls

### Pitfall 1: Realtime subscription com filtro composto

**O que vai errado:** Tentar filtrar por `atribuido_a_id=eq.X AND status=in.(...)` no `.on()` do canal — o Supabase Realtime nao suporta filtros compostos em Postgres Changes.

**Por que acontece:** A documentacao do Supabase suporta um unico filtro simples por canal de Postgres Changes.

**Como evitar:** Filtrar por `atribuido_a_id` apenas no canal, e executar a query completa (com filtro de status) no callback do evento para recalcular o count.

**Sinal de alerta:** Canal que "nao dispara" ou dispara para todos os usuarios.

### Pitfall 2: RLS bloqueia a subscription Realtime

**O que vai errado:** Apos ativar `is_interno()`, o Realtime pode silenciosamente nao entregar eventos para usuarios cujo perfil nao foi carregado ainda (race na inicializacao).

**Por que acontece:** O Supabase Realtime avalia RLS com as permissoes da sessao JWT atual. Se o JWT nao carregou ainda, nao ha sessao valida.

**Como evitar:** Montar a subscription somente apos `userId` estar disponivel (o hook ja usa `enabled: !!userId`). O `Sidebar` ja consome `useMeuPerfil()` — garantir que a subscription so e criada no `useEffect` quando `perfil?.id` e truthy.

### Pitfall 3: Login tracking duplicado no StrictMode do React 19

**O que vai errado:** Em desenvolvimento, React StrictMode monta componentes duas vezes. O `useEffect` do `AppLayout` para `onAuthStateChange` pode disparar o insert de `audit_logs { acao: 'login' }` duas vezes.

**Por que acontece:** React 19 StrictMode double-invoca effects em dev para detectar side effects impuros.

**Como evitar:** Usar `useRef` para rastrear se o login ja foi registrado na sessao atual. Comparar `session.access_token` com o ref — so inserir se mudou.

```typescript
const loggedSessionRef = useRef<string | null>(null)

if (event === 'SIGNED_IN' && session?.user) {
  if (loggedSessionRef.current !== session.access_token) {
    loggedSessionRef.current = session.access_token
    // ... insert em audit_logs
  }
}
```

### Pitfall 4: `useMinhasTarefas` usa campo errado (`atribuido_a_id` vs `responsavel_id`)

**O que vai errado:** Confundir os campos. O schema de `tarefas` usa `atribuido_a_id` (para quem a tarefa foi atribuida). `responsavel_id` e um campo de `leads`, nao de `tarefas`.

**Por que acontece:** O projeto tem `responsavel_id` em varias tabelas (leads, contratos, oportunidades). O hook `useMinhasTarefas` ja usa `atribuido_a_id` corretamente — nao alterar.

**Sinal de alerta:** Inbox vazio mesmo havendo tarefas.

### Pitfall 5: Migracoes sequenciais — nao pular o numero 033

**O que vai errado:** Criar a migration com numero diferente (ex.: 034 achando que 033 existe).

**Por que acontece:** `supabase/migrations/` vai de 032 para o proximo. A ausencia de 017 e 018 (citada no CONCERNS.md) mostra que o banco pode ter gaps.

**Como evitar:** Verificar que o ultimo arquivo e `032_lixeira_leads.sql` antes de criar `033_rls_tarefas_notificar.sql`.

### Pitfall 6: Painel de adocao sem dados de "ultimo login" ate o tracking ser deployado

**O que vai errado:** `ADOPT-01` mostra "0 logins" para todos os usuarios porque `audit_logs` ainda nao tem registros com `acao = 'login'`.

**Por que acontece:** O insert de login em `audit_logs` so comeca a funcionar apos o deploy do codigo do `AppLayout` + migration 033 em producao.

**Como evitar:** O planner deve criar uma task de comunicacao: "Apos deploy, aguardar 1-2 logins do time para validar que o tracking esta funcionando antes de validar ADOPT-01/02." O painel pode mostrar um empty state explicativo enquanto nao ha dados.

---

## Code Examples

### Invalidacao correta de queries apos mutation de tarefa

```typescript
// Pattern de invalidacao — seguir useLeads.ts como modelo
// Source: src/hooks/useLeads.ts (onSuccess de useCreateLead)

onSuccess: () => {
  qc.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.all })
  qc.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.mine(userId) })
  // Se tarefa foi criada para um lead especifico:
  if (entidadeTipo && entidadeId) {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.byEntidade(entidadeTipo, entidadeId) })
  }
  toast.success('Tarefa criada')
}
```

### Badge numerica no Sidebar (ponto de integracao)

```typescript
// No Sidebar.tsx — adicionar apos a linha do useMeuPerfil
// O count vem do hook useTarefasBadgeCount (novo)
const badgeCount = useTarefasBadgeCount(perfil?.id)

// No NavLink de "Tarefas":
{ to: '/tarefas', label: 'Tarefas', icon: CheckSquare, badge: badgeCount }

// No NavItem, renderizar badge se > 0:
{badge > 0 && (
  <span className="ml-auto text-[10px] font-bold bg-cyan-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
    {badge > 99 ? '99+' : badge}
  </span>
)}
```

### Query de adocao — logins por usuario na semana

```typescript
// Source: padrao de useAllAuditLogs (src/hooks/useAuditLogs.ts) + date-fns
import { subDays } from 'date-fns'

const sevenDaysAgo = subDays(new Date(), 7).toISOString()

const { data: logins } = await supabase
  .from('audit_logs')
  .select('usuario, registro_id, created_at')
  .eq('acao', 'login')
  .gte('created_at', sevenDaysAgo)
  .order('created_at', { ascending: false })
```

### Gating do painel de adocao

```typescript
// src/pages/AdocaoPage.tsx — seguir padrao de RequireRole
import { RequireRole } from '@/components/shared/RequireRole'

export function AdocaoPage() {
  return (
    <RequireRole atLeast="coordenador">
      <AdocaoContent />
    </RequireRole>
  )
}
```

---

## Runtime State Inventory

Esta fase nao e de rename/refactor/migration de dados — e de adicao de feature. Nenhum estado de runtime precisa ser migrado. Omitido conforme instrucao.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `authenticated_all` policy em `tarefas` | Policy `is_interno()` via migration 033 | Fecha brecha de cliente lendo tarefas internas |
| Polling manual para badge de notificacao | Supabase Realtime Postgres Changes | Badge reativo, zero polling, zero custo adicional |
| Nenhum tracking de login | Insert em `audit_logs` no `SIGNED_IN` event | Habilita metricas de adocao (ADOPT-01/02) |

**Nao existe nada deprecated nesta fase.** O modelo de dados, os hooks e a edge function ja estao na versao correta.

---

## Assumptions Log

| # | Claim | Section | Risk se errado |
|---|-------|---------|----------------|
| A1 | `audit_logs` nao tem registros com `acao='login'` ainda — o tracking e novo | Patterns 4, Pitfall 6 | Se ja existe outro mecanismo de tracking de login, a query de adocao poderia usar esse dado; sem impacto critico, so redundancia |
| A2 | O Realtime esta habilitado no projeto Supabase cloud (nao so local) | NOTIF-04 | Se Realtime estiver desabilitado no plano, badge nao funcionara; verificar no Supabase Dashboard antes de deployar |
| A3 | A edge function `notify-tarefa` precisa checar `notificar=true` antes de postar DM | SEC-02, Pattern 2 | Se nao atualizar a edge function, tarefas de cadencia (futuras) ainda enviarao DM mesmo com `notificar=false` |

---

## Open Questions

1. **Inbox de tarefas: pagina nova `/tarefas` ou aba em `/me`?**
   - O que sabemos: `/me` e `MeEspacoPage` ja existe com abas; adicionar aba de tarefas e mais rapido. Pagina nova `/tarefas` e mais expansivel para o futuro (CAD-02 vai precisar de inbox de cadencia).
   - Recomendacao: pagina nova `/tarefas` — evita engordamento do `/me` e facilita linking direto do badge no sidebar.

2. **Permissao granular de UPDATE/DELETE em tarefas: RLS ou hook?**
   - O que sabemos: Coordenador+ gerencia qualquer tarefa; consultor so as suas. A RLS atual ira aceitar qualquer `is_interno()` para UPDATE/DELETE.
   - Recomendacao: Deixar RLS aceitando qualquer `is_interno()` para UPDATE/DELETE (consistente com outros recursos); enforcar a granularidade no hook via `useCurrentRole` (mostrar/esconder botoes de editar/excluir). Isso e o padrao do projeto (CONCERNS.md § Anti-Patterns: "Ler perfis.tipo direto na pagina").

3. **QUERY_KEYS para adocao: nova chave ou reutilizar `audit_logs.all`?**
   - Recomendacao: Criar nova chave `QUERY_KEYS.adocao` em `src/lib/query-keys.ts` para as queries agregadas — evita invalidacoes desnecessarias de `audit_logs.all` quando a pagina de adocao recarrega.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Realtime | NOTIF-04 (badge) | [ASSUMED] Sim — projeto ja usa em producao | Supabase JS 2.99.x | Polling a cada 30s se Realtime desabilitado |
| Supabase Edge Function `notify-tarefa` | SEC-02 (update da funcao) | Sim — confirmado em INTEGRATIONS.md | Deployada | — |
| `is_interno()` SQL function | SEC-01 | Sim — confirmado em migration 021 | — | — |
| `ACTIVE_LEAD_STAGES` constant | ADOPT-03 | Sim — confirmado em `src/lib/constants.ts` | — | — |
| `RequireRole` component | ADOPT-01/02 | Sim — confirmado em `src/components/shared/RequireRole.tsx` | — | — |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** Supabase Realtime no cloud (A2 acima) — fallback e polling a 30s.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm run test:cov` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | Cliente nao pode ler tarefas via RLS | RLS (integration) | `npm run test:rls` | Nao — Wave 0 |
| SEC-02 | Coluna `notificar` existe com DEFAULT true | Migration smoke | Manual (supabase db push) | N/A |
| TASK-01 | `useCreateTarefa` persiste tarefa com entidade_tipo=lead | Unit | `npm test -- useTarefas` | Nao — Wave 0 |
| TASK-02 | `useCreateTarefa` persiste tarefa com entidade_id=null | Unit | `npm test -- useTarefas` | Nao — Wave 0 |
| TASK-03 | `useMinhasTarefas` retorna so tarefas do userId filtradas por status | Unit | `npm test -- useTarefas` | Nao — Wave 0 |
| TASK-04 | `useConcluirTarefa` seta status=concluida e data_conclusao | Unit | `npm test -- useTarefas` | Nao — Wave 0 |
| NOTIF-04 | Badge renderiza com count > 0; zera apos concluir | Component | `npm test -- TarefaBadge` | Nao — Wave 0 |
| ADOPT-01 | Card de adocao renderiza com dados de audit_logs mockados | Component | `npm test -- AdocaoCard` | Nao — Wave 0 |
| ADOPT-02 | AdocaoPage exibe RequireRole e bloqueia consultor | Component | `npm test -- AdocaoPage` | Nao — Wave 0 |
| ADOPT-03 | Query de leads esquecidos filtra por updated_at < 7 dias | Unit | `npm test -- useAdocao` | Nao — Wave 0 |

### Sampling Rate

- **Por task commit:** `npm test`
- **Por wave merge:** `npm run test:cov`
- **Phase gate:** `npm test && npm run test:rls` green antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/hooks/__tests__/useTarefas.test.ts` — cobre TASK-01, 02, 03, 04
- [ ] `src/hooks/__tests__/useAdocao.test.ts` — cobre ADOPT-01, 03
- [ ] `src/components/tarefas/__tests__/TarefaBadge.test.tsx` — cobre NOTIF-04
- [ ] `src/pages/__tests__/AdocaoPage.test.tsx` — cobre ADOPT-02
- [ ] `tests/rls/tarefas.test.ts` — cobre SEC-01 (requer QA users provisionados — ver CONCERNS.md)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Nao (auth ja existe) | Supabase Auth existente |
| V3 Session Management | Nao (sem mudanca) | — |
| V4 Access Control | Sim — SEC-01, TASK-04, ADOPT-01/02 | RLS `is_interno()` + `RequireRole atLeast="coordenador"` |
| V5 Input Validation | Sim — formulario de tarefa | `zod` schema no `TarefaModal` |
| V6 Cryptography | Nao | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cliente lendo tarefas internas via anon key | Information Disclosure | SEC-01: policy `is_interno()` em migration 033 |
| Consultor editando tarefa de outro consultor | Elevation of Privilege | Hook verifica `criado_por_id` ou `atribuido_a_id`; UI esconde botao via `useCurrentRole` |
| Acesso direto a `/adocao` por consultor | Elevation of Privilege | `RequireRole atLeast="coordenador"` + RLS bloqueia query anonima |
| DM Slack para tarefa com `notificar=false` | Tampering (comportamento incorreto) | Edge function verifica `record.notificar` antes de postar |

---

## Project Constraints (from CLAUDE.md)

Diretivas obrigatorias extraidas do `CLAUDE.md` do projeto:

| Diretiva | Impacto nesta fase |
|----------|-------------------|
| Tipos centralizados em `src/types/index.ts` | Campo `notificar` deve ser adicionado em `Tarefa` la, nao inline |
| QUERY_KEYS centralizados em `src/lib/query-keys.ts` | Chave `adocao` nova deve ser adicionada la |
| Named exports only — sem `export default` em `src/` | `TarefaModal`, `TarefasPage`, `AdocaoPage` etc. devem usar named export |
| Nenhuma mutation direta para operacoes com cascata/auditoria | `useCreateTarefa` ja usa o hook correto; manter padrao |
| Sem Redux, sem Zustand — estado UI local via `useState` | Badge count via hook proprio com `useState` interno |
| Migrações sequenciais e imutaveis | Migration 033 e o proximo numero valido |
| RLS + RPCs SECURITY DEFINER para operacoes privilegiadas | UPDATE/DELETE de tarefa por coordenador nao precisa de RPC — RLS `is_interno()` e suficiente para esta fase |
| `.env` nao commitar; credenciais nao em codigo | Edge function update usa variaveis de ambiente ja configuradas |
| Nunca ler `package-lock.json` | N/A |
| Nunca sugerir emojis em pecas juridicas | N/A (UI, nao peça juridica) |

---

## Sources

### Primary (HIGH confidence)

- Codebase direto: `supabase/migrations/014_tarefas.sql` — schema completo da tabela tarefas
- Codebase direto: `src/hooks/useTarefas.ts` — todos os hooks existentes verificados
- Codebase direto: `supabase/migrations/021_lockdown_rls.sql` — helper `is_interno()` confirmado
- Codebase direto: `supabase/migrations/029_rls_role_aware.sql` — padrao de policies role-aware
- Codebase direto: `supabase/functions/notify-tarefa/index.ts` — edge function verificada linha a linha
- Codebase direto: `src/components/layout/Sidebar.tsx` — ponto de integracao do badge
- Codebase direto: `src/lib/query-keys.ts` — chaves existentes de tarefas
- Codebase direto: `src/types/index.ts` — tipo `Tarefa` centralizado
- Codebase direto: `src/hooks/useCurrentRole.ts` — hierarquia de roles
- Codebase direto: `src/router.tsx` — rotas existentes
- Codebase direto: `.planning/REQUIREMENTS.md` — requisitos canonicos
- Codebase direto: `.planning/codebase/CONCERNS.md` — tech debt relevante

### Secondary (MEDIUM confidence)

- [ASSUMED] Supabase Realtime suporta apenas um filtro simples por canal de Postgres Changes — baseado em conhecimento de treinamento; verificar na documentacao oficial antes de implementar se comportamento diferente for observado.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — tudo ja instalado, verificado no `package.json`
- Architecture: HIGH — schema, hooks, edge function e RLS helpers verificados diretamente no codigo
- Pitfalls: HIGH (RLS/Realtime) / MEDIUM (login tracking StrictMode) — baseados em analise do codigo existente e patterns documentados no CONCERNS.md
- Queries de adocao: HIGH — `audit_logs` existe e tem os campos necessarios; pattern de query derivado de `useAllAuditLogs` existente

**Research date:** 2026-05-26
**Valid until:** 2026-06-26 (stack e estavel; Supabase JS 2.x nao tem breaking changes previstos)
