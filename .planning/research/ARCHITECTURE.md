# Architecture Research
**Date:** 2026-05-26
**Project:** CONSEJ CRM v2 — Milestone 2
**Focus:** Task system, notifications, revenue dashboard, migration strategy, WhatsApp links

---

## Task System Schema

### Current State (already exists — migration 014)

The `tarefas` table is already deployed and functional:

```sql
-- Migration 014 — already applied, DO NOT recreate
CREATE TABLE tarefas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo            TEXT NOT NULL,
  descricao         TEXT,
  tipo              TEXT NOT NULL DEFAULT 'generica',
  entidade_tipo     TEXT,    -- lead | cliente | contrato | oportunidade | reuniao | indicacao
  entidade_id       UUID,    -- generic FK (no FK constraint — intentional, covers multiple tables)
  atribuido_a_id    UUID REFERENCES perfis(id) ON DELETE SET NULL,
  criado_por_id     UUID REFERENCES perfis(id) ON DELETE SET NULL,
  prioridade        TEXT NOT NULL DEFAULT 'media',
  status            TEXT NOT NULL DEFAULT 'aberta',
  data_vencimento   TIMESTAMPTZ,
  data_conclusao    TIMESTAMPTZ,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes already exist:
-- idx_tarefas_atribuido     ON tarefas(atribuido_a_id)
-- idx_tarefas_status        ON tarefas(status)
-- idx_tarefas_vencimento    ON tarefas(data_vencimento)
-- idx_tarefas_entidade      ON tarefas(entidade_tipo, entidade_id)
```

### What Milestone 2 Needs to ADD

The current schema handles both lead-linked tasks (`entidade_tipo='lead'`) and standalone team tasks (`entidade_tipo=NULL`). The design is already correct — no schema change needed for the core task model.

**Gaps that need a new migration (033):**

```sql
-- Migration 033: task system enhancements for Milestone 2

-- 1. Cadencia tracking column on leads (to surface D1/D3/D5/D7/D10 state)
--    cadencia_iniciada_em tracks when the follow-up sequence started for this lead.
--    NULL = never started. Set on first interacao or manually.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadencia_iniciada_em TIMESTAMPTZ;

-- Index for cadencia queries (find leads at a given day in sequence today)
CREATE INDEX IF NOT EXISTS idx_leads_cadencia ON leads(cadencia_iniciada_em)
  WHERE cadencia_iniciada_em IS NOT NULL
    AND status NOT IN ('ganho_assessoria','ganho_consultoria','perdido','cancelado');

-- 2. Notification tracking (in-app badge count, prevent re-alerting)
--    Lightweight — avoids a full notificacoes table.
--    notificacoes_lidas tracks which tarefas the user has acknowledged.
CREATE TABLE IF NOT EXISTS tarefas_notificacoes_lidas (
  perfil_id   UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  tarefa_id   UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  lida_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (perfil_id, tarefa_id)
);

-- RLS: user sees only their own read receipts
ALTER TABLE tarefas_notificacoes_lidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notif_reads" ON tarefas_notificacoes_lidas
  FOR ALL TO authenticated
  USING (perfil_id = auth.uid())
  WITH CHECK (perfil_id = auth.uid());
```

### Design Rationale

- **Polymorphic FK via (entidade_tipo, entidade_id)** — already implemented and correct. Adding typed FK columns per entity would require schema changes on every new entity. The current design is the right call for a small-team CRM.
- **Standalone team tasks** — `entidade_tipo = NULL`, `entidade_id = NULL`. Already supported by schema + hooks.
- **No separate "team_tasks" table** — one unified table with optional entity link covers both use cases. The `useMinhasTarefas(userId)` hook already scopes to the current user.

---

## Notification Architecture

### Context

The project already has a working Slack DM notification system for tasks via the `notify-tarefa` Edge Function. It fires on INSERT/UPDATE via Supabase Database Webhook. This covers the "Slack alert when task assigned" path.

For Milestone 2, the goal is **pull-back notifications** (bring the team back to the CRM) and **in-app badge/inbox** — not a full push notification system.

### Options Evaluated

**Option A: Supabase Realtime (Postgres Changes)**
- Subscribe to `tarefas` table with filter `atribuido_a_id=eq.{userId}`
- Delivers new task assignments to the browser in real-time
- Cost: zero (included in Free tier)
- Limitation: Realtime channel filter on a column requires the column to be in the `REPLICA IDENTITY` of the table; Supabase Free tier allows Realtime but with connection limits (200 concurrent on Free, 500 on Pro)

**Option B: Polling via TanStack Query `refetchInterval`**
- `useMinhasTarefas` already fetches open tasks for the current user
- Add `refetchInterval: 60_000` (60 seconds) to poll for new assignments
- Cost: zero. Simple. No WebSocket setup. Negligible DB load at 2-5 users.
- Limitation: 60-second delay before user sees new task; no "badge pulse" effect

**Option C: Supabase Realtime + TanStack Query invalidation**
- Open a Realtime channel filtered to `atribuido_a_id=eq.{userId}` on `tarefas`
- On INSERT event: call `queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.mine(userId) })`
- Shows new tasks instantly; no polling overhead

### Recommendation: Option C (Realtime + Query invalidation)

For a 2-5 user team, Realtime is the right call — it's free, already available in the Supabase client, and the pattern fits perfectly with TanStack Query's invalidation model. Polling at 60s is acceptable as a fallback if Realtime proves unreliable.

### Implementation Pattern

```typescript
// src/hooks/useTarefasRealtime.ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'

export function useTarefasRealtime(userId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`tarefas-user-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tarefas',
          filter: `atribuido_a_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.mine(userId) })
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.all })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tarefas',
          filter: `atribuido_a_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.mine(userId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}
```

**Where to call it:** inside `AppLayout.tsx` after session is confirmed, passing `perfil.id`. This ensures a single Realtime subscription per session, shared across all pages.

```typescript
// In AppLayout.tsx — after perfil is loaded
useTarefasRealtime(perfil?.id)
```

### In-App Badge (Unread Count)

The simplest correct approach: count tasks assigned to the user with `status IN ('aberta', 'em_andamento')` AND `created_at > last_seen`. Store `last_seen` in `localStorage` keyed by `perfil_id`. No extra table required.

```typescript
// Badge count = useMinhasTarefas data filtered by created_at > localStorage['tasks_seen_at']
// Clicking the "tasks" nav item → update localStorage['tasks_seen_at'] = now()
```

Alternative (if "per-task read tracking" is needed later): use the `tarefas_notificacoes_lidas` table from migration 033.

**Decision for Milestone 2:** use `localStorage` approach (zero DB cost, sufficient for 2-5 users). The `tarefas_notificacoes_lidas` table in migration 033 is scaffolded but used only if per-task granularity is required in a later phase.

---

## Scheduled Reminders

### Constraint Analysis

Zero incremental cost means no new paid infrastructure. Current paid resources:
- Supabase cloud plan (the cron at migration 031 already uses `pg_cron` and `pg_net`, confirming this project is on a plan where these extensions are available)
- Vercel (frontend — free tier has 2 cron jobs/day max, runs as serverless functions)

### pg_cron Availability Confirmation

Migration 031 (`031_cron_renovacoes.sql`) already executes:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule('disparar-renovacoes', '0 12 * * *', ...);
```

This means `pg_cron` **is already enabled** on this Supabase project. No plan upgrade needed.

**Important:** `pg_cron` on Supabase Free tier is available but requires enabling via the Supabase dashboard (Extensions page). The fact that migration 031 is already applied and working confirms the extension is active.

### Approach: pg_cron (extend the existing pattern)

Use the same pattern as `031_cron_renovacoes.sql`:
1. Write a PL/pgSQL function that scans `tarefas` for overdue/due-today tasks
2. For each overdue task with a `atribuido_a_id` that has `slack_user_id` set → call `notify-tarefa` via `net.http_post`
3. Schedule with `cron.schedule` at a daily cadence

**Do NOT use Vercel Cron** for this:
- Vercel free tier allows only 2 cron jobs/day and they require a deployed serverless function
- The task reminder is best run at DB level where the data lives
- `pg_cron` + `pg_net` + Edge Function is already the established pattern in this project

```sql
-- Migration 034: daily task reminder cron
CREATE OR REPLACE FUNCTION public.cron_lembrar_tarefas_vencidas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_url    TEXT := 'https://<project>.supabase.co/functions/v1/notify-tarefa';
  t        RECORD;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'webhook_tarefa_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cron_lembrar_tarefas: secret ausente';
    RETURN;
  END IF;

  -- Tasks due today or overdue, still open, assigned to someone
  FOR t IN
    SELECT id, titulo, atribuido_a_id, prioridade, data_vencimento
      FROM tarefas
     WHERE status IN ('aberta', 'em_andamento')
       AND atribuido_a_id IS NOT NULL
       AND data_vencimento::date <= CURRENT_DATE
  LOOP
    -- Re-use notify-tarefa edge function (UPDATE event simulation)
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
        'type', 'REMINDER',
        'table', 'tarefas',
        'record', jsonb_build_object(
          'id', t.id,
          'titulo', t.titulo,
          'atribuido_a_id', t.atribuido_a_id,
          'prioridade', t.prioridade,
          'data_vencimento', t.data_vencimento
        ),
        'old_record', NULL
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      )
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'lembrar-tarefas-vencidas',
  '0 13 * * *',  -- 13:00 UTC = 10:00 BRT (after the renovacoes job at 12:00)
  'SELECT public.cron_lembrar_tarefas_vencidas()'
);
```

**Idempotence consideration:** The `notify-tarefa` edge function currently fires on INSERT/UPDATE events. To handle REMINDER as a new event type, add a guard in the edge function:
```typescript
// In notify-tarefa/index.ts: handle type === 'REMINDER' same as INSERT
// but suppress if task was already reminded today (use a lightweight guard table or just accept daily re-alerts)
```

For Milestone 2, daily re-alerting is acceptable (no idempotence table needed). Add one if spam becomes an issue.

---

## Revenue Dashboard Queries

### Current State

`DashboardPage.tsx` already does client-side computation:
- Fetches all contratos via `useContratos()` (join with `clientes`)
- Computes MRR, forecast, and renewal alerts client-side with `date-fns` and array reduces

This is fine for 2-5 users with a small dataset (< 100 contratos). No RPC is strictly required.

### When to Use RPCs

Use a Supabase RPC (`SECURITY DEFINER`) when:
1. The computation requires data the client cannot see due to RLS (e.g., aggregates across all users for a director-only view)
2. The query would be too slow client-side (> 500 rows to aggregate)
3. The query needs DB-level atomicity

For the revenue dashboard at current scale: **client-side computation from cached data is correct**. The RPC pattern is future-proofing.

### Recommended RPC Pattern (for Revenue Dashboard)

```sql
-- Migration 033 addendum: Revenue dashboard RPC (SECURITY DEFINER for cross-RLS aggregates)
CREATE OR REPLACE FUNCTION public.get_revenue_dashboard(
  p_data_inicio DATE DEFAULT date_trunc('year', CURRENT_DATE)::DATE,
  p_data_fim    DATE DEFAULT (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year - 1 day')::DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Only directors see the full cross-RLS aggregate
  -- Others get their own scope (same as what RLS would give them anyway)
  SELECT jsonb_build_object(
    'mrr_atual',        COALESCE(SUM(c.valor_mensal) FILTER (WHERE c.status = 'ativo'), 0),
    'arr_atual',        COALESCE(SUM(c.valor_mensal) FILTER (WHERE c.status = 'ativo') * 12, 0),
    'contratos_ativos', COUNT(*) FILTER (WHERE c.status = 'ativo'),
    'renovacoes_30d',   jsonb_agg(
                          jsonb_build_object(
                            'contrato_id', c.id,
                            'cliente_nome', cl.nome,
                            'data_fim', c.data_fim,
                            'valor_mensal', c.valor_mensal,
                            'responsavel_id', c.responsavel_id
                          )
                        ) FILTER (
                          WHERE c.status = 'ativo'
                            AND c.data_fim IS NOT NULL
                            AND c.data_fim::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
                        ),
    'receita_periodo',  COALESCE(SUM(c.valor_total)
                          FILTER (WHERE c.data_inicio::date BETWEEN p_data_inicio AND p_data_fim),
                          0)
  ) INTO v_result
  FROM contratos c
  JOIN clientes cl ON cl.id = c.cliente_id
  WHERE (
    public.is_diretor()
    OR public.can_see_responsavel(c.responsavel_id)
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_dashboard(DATE, DATE) TO authenticated;
```

```typescript
// src/hooks/useRevenueDashboard.ts
export function useRevenueDashboard(dataInicio?: string, dataFim?: string) {
  return useQuery({
    queryKey: ['revenue_dashboard', dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_revenue_dashboard', {
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
      })
      if (error) throw error
      return data as RevenueDashboardResult
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — revenue data doesn't need real-time freshness
  })
}
```

**Decision for Milestone 2:** Start with client-side computation using `useContratos()` data already in cache (same as current `DashboardPage` pattern). Add the RPC only if a director-view requirement emerges that RLS prevents.

### MRR Computation Pattern (client-side)

```typescript
// In the revenue dashboard component or a useRevenueDashboard hook
const mrr = contratos
  ?.filter(c => c.status === 'ativo' && c.valor_mensal)
  .reduce((sum, c) => sum + (c.valor_mensal ?? 0), 0) ?? 0

const renovacoes30d = contratos
  ?.filter(c =>
    c.status === 'ativo' &&
    c.data_fim &&
    differenceInDays(new Date(c.data_fim), new Date()) <= 30 &&
    differenceInDays(new Date(c.data_fim), new Date()) >= 0
  )
  .sort((a, b) => new Date(a.data_fim!).getTime() - new Date(b.data_fim!).getTime()) ?? []
```

---

## Migration Strategy

### Rule: Additive, Sequential, Immutable

Established by the existing pattern (migrations 001–032). The next migration is **033**.

### How to Add Tables Without Breaking Existing RLS

The established pattern from `029_rls_role_aware.sql` and `032_lixeira_leads.sql`:

1. **Create the table** with `IF NOT EXISTS`
2. **Enable RLS immediately** (`ALTER TABLE <table> ENABLE ROW LEVEL SECURITY`)
3. **Create policy in the same migration** — never leave a table without a policy
4. **Use existing helper functions** (`is_interno()`, `is_diretor()`, `can_see_responsavel()`, `can_see_perfil()`) — do not redefine them
5. **Index strategy**: always index foreign keys and filter columns

```sql
-- Template for a new table in Migration 033+
CREATE TABLE IF NOT EXISTS nova_tabela (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id   UUID REFERENCES perfis(id) ON DELETE CASCADE,
  -- ... columns ...
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nova_tabela_perfil ON nova_tabela(perfil_id);

ALTER TABLE nova_tabela ENABLE ROW LEVEL SECURITY;

-- Use the established role helpers:
CREATE POLICY "interno_role_aware_nova_tabela" ON nova_tabela
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(perfil_id))
  WITH CHECK (public.is_interno() AND public.can_see_responsavel(perfil_id));
```

### Checklist Before Writing a Migration

- [ ] Number is sequential (next = 033 for Milestone 2 start)
- [ ] `IF NOT EXISTS` on CREATE TABLE and indexes
- [ ] RLS enabled in the same migration
- [ ] Policy uses existing role helpers (never raw `auth.uid()` comparisons that bypass role hierarchy)
- [ ] Trigger for `updated_at` if table has that column (reuse `update_updated_at()` function already defined)
- [ ] No edits to previous migrations

### Types Must Stay in Sync

Whenever a new table or column is added:
1. Add the TypeScript interface to `src/types/index.ts`
2. Add the query key to `src/lib/query-keys.ts`
3. Create the hook in `src/hooks/use<Recurso>.ts`

This triad is the established pattern — break any leg and the feature will be incomplete.

---

## Component Placement

### New Pages (Milestone 2)

| Page | File | Route | Sidebar Group |
|------|------|-------|---------------|
| Revenue Dashboard | `src/pages/ReceitaPage.tsx` | `/receita` | CRESCIMENTO |
| Task Inbox | `src/pages/TarefasPage.tsx` | `/tarefas` | PIPELINE (or as tab in /me) |
| Cadencia Tracking | `src/pages/CadenciaPage.tsx` | `/cadencia` | PIPELINE (already exists) |
| Adoption Dashboard | `src/pages/AdocaoPage.tsx` | `/adocao` | CRESCIMENTO |

Note: `CadenciaPage.tsx` already exists in `src/pages/`. Milestone 2 enhances it rather than replacing it.

### New Feature Components

```
src/components/
  tarefas/
    TarefaCard.tsx          -- single task display (priority badge, due date, entity link)
    TarefaModal.tsx         -- create/edit modal (replaces inline forms)
    TarefaInbox.tsx         -- full inbox list with filters (mine/all, status, priority)
    TarefasBadge.tsx        -- unread badge for Sidebar nav item
  receita/
    MrrCard.tsx             -- MRR + delta vs previous period
    RenovacoesTimeline.tsx  -- list of contracts expiring in next 30/60/90 days
    ReceitaChart.tsx        -- monthly revenue bar chart (recharts, matches DashboardPage style)
  cadencia/
    CadenciaInbox.tsx       -- leads at each D-point today with quick-action buttons
  shared/
    WhatsAppButton.tsx      -- reusable wa.me deep link button (see below)
```

### Reuse Existing Shared Components

- `ScopeToggle` — "Minhas / Todas" for task inbox filtering
- `PeriodSelector` — period filter for revenue dashboard
- `RequireRole` — gate adoption dashboard to `coordenador+`
- `ActivityTimeline` — reuse in task history view
- `ResponsavelBadge` — show assignee in task cards

### WhatsApp Button Component

**Placement:** `src/components/shared/WhatsAppButton.tsx`

It belongs in `shared/` (not `tarefas/` or `leads/`) because it is used from:
- Lead cards (Kanban)
- Task quick-action in the cadencia inbox
- Lead detail page

**Interface:**

```typescript
// src/components/shared/WhatsAppButton.tsx
interface WhatsAppButtonProps {
  telefone: string          // raw phone: "84912345678" or "+5584912345678"
  mensagem?: string         // pre-filled message text (URL-encoded internally)
  label?: string            // button label, default "WhatsApp"
  variant?: 'button' | 'icon'
  className?: string
}

function buildWaUrl(telefone: string, mensagem?: string): string {
  // Strip non-digits, ensure country code 55 for BR numbers
  const digits = telefone.replace(/\D/g, '')
  const number = digits.startsWith('55') ? digits : `55${digits}`
  const base = `https://wa.me/${number}`
  if (!mensagem) return base
  return `${base}?text=${encodeURIComponent(mensagem)}`
}

export function WhatsAppButton({ telefone, mensagem, label = 'WhatsApp', variant = 'button', className }: WhatsAppButtonProps) {
  const url = buildWaUrl(telefone, mensagem)
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {variant === 'button' ? (
        <Button variant="outline" size="sm">
          {/* phone icon from lucide-react */}
          {label}
        </Button>
      ) : (
        <span title={label}>{/* icon only */}</span>
      )}
    </a>
  )
}
```

**Cadencia integration:** the pre-text comes from `src/lib/cadencia.ts` which already has `CADENCIA_DIAS` with `stage` and `descricao` per day. The `mensagens-rules.ts` + `blocos-mensagem.ts` system generates the full message. Wire: `WhatsAppButton` receives the output of the message generator for the current D-point.

**No server needed.** The `wa.me` scheme opens WhatsApp on the device. This is confirmed as the established approach in PROJECT.md Key Decisions.

---

## Build Order

Dependencies drive order. Each step below can only start after the previous is complete.

1. **Migration 033** — DB schema additions (`cadencia_iniciada_em` on leads, `tarefas_notificacoes_lidas` table). All subsequent steps depend on the schema being in place.

2. **Types + Query Keys** — extend `src/types/index.ts` with any new interfaces; add keys to `src/lib/query-keys.ts`. Hooks cannot be written without types.

3. **`WhatsAppButton` shared component** (`src/components/shared/WhatsAppButton.tsx`) — pure UI, no data deps. Can be built in parallel with step 4.

4. **`useTarefasRealtime` hook** (`src/hooks/useTarefasRealtime.ts`) + mount in `AppLayout.tsx` — adds live task assignment notifications. Depends on existing `useTarefas` hooks (already done) and the Supabase Realtime channel pattern.

5. **Task Inbox page + components** (`src/pages/TarefasPage.tsx` + `src/components/tarefas/`) — unified view of persistent tasks + derived tasks (already in `tarefas-derivadas.ts`). Depends on step 4 (realtime) and step 3 (WhatsApp button for quick actions).

6. **Cadencia enhancements** (`CadenciaPage.tsx` already exists — enhance it with `cadencia_iniciada_em` tracking and D-point inbox). Depends on migration 033 column and WhatsAppButton.

7. **Revenue Dashboard** (`src/pages/ReceitaPage.tsx` + `src/components/receita/`) — purely additive, reads from `useContratos()` already in cache. No new DB changes. Can start after step 2.

8. **Migration 034** — `pg_cron` job for daily task reminders. Depends on migration 033 being stable and the `notify-tarefa` edge function handling REMINDER type (may need a small update to `supabase/functions/notify-tarefa/index.ts`).

9. **Adoption Dashboard** (`src/pages/AdocaoPage.tsx`) — reads `audit_logs` (already populated) to show login frequency, task completion rate, lead registration timing. No new DB changes. Gate with `<RequireRole atLeast="coordenador">`.

---

## Key Architectural Constraints to Respect

1. **No new API layer** — everything goes through Supabase directly (RLS + RPCs for privileged ops)
2. **No new external services** — WhatsApp via `wa.me` only; notifications via existing Slack edge function
3. **pg_cron is already active** — confirmed by migration 031; use it for scheduled reminders (do not use Vercel cron)
4. **Realtime filter requires column in replica identity** — if the `tarefas` table uses `REPLICA IDENTITY DEFAULT` (primary key only), column-filtered Realtime subscriptions may fall back to full-table. Mitigation: if filtered subscription doesn't work, use `event: '*'` and filter client-side in the callback, or `ALTER TABLE tarefas REPLICA IDENTITY FULL` in migration 033
5. **Types stay in `src/types/index.ts`** — never create parallel type files
6. **Query keys stay in `src/lib/query-keys.ts`** — add new keys there, not inline
7. **Mutations write audit_logs in onSuccess** — maintain this discipline for new mutations that create/update tarefas, receita data, and cadencia state

---

*Research: 2026-05-26 | Confidence: HIGH (based on existing codebase — no external sources needed for this architecture dimension)*
