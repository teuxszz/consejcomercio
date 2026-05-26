# Phase 1: Tasks + Adoption Signal — Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 15 (10 novos + 5 modificados)
**Analogs found:** 15 / 15

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/033_rls_tarefas_notificar.sql` | migration | CRUD | `supabase/migrations/021_lockdown_rls.sql` | exact |
| `src/components/tarefas/TarefaModal.tsx` | component | request-response | `src/components/me/TarefasPanel.tsx` (NovaTarefaModal) + `src/components/leads/NewLeadModal.tsx` | exact |
| `src/components/tarefas/TarefaCard.tsx` | component | request-response | `src/components/me/TarefasPanel.tsx` (task row) | exact |
| `src/components/tarefas/TarefaStatusBadge.tsx` | component | transform | `src/components/me/TarefasPanel.tsx` (PRIORIDADE_STYLE badges) | role-match |
| `src/hooks/useTarefasBadgeCount.ts` | hook | event-driven | `src/hooks/useTarefas.ts` (useMinhasTarefas) | role-match |
| `src/hooks/useAdocao.ts` | hook | CRUD | `src/hooks/useAuditLogs.ts` (useAllAuditLogs) | role-match |
| `src/pages/TarefasPage.tsx` | page | request-response | `src/pages/AuditoriaPage.tsx` + `src/components/me/TarefasPanel.tsx` | exact |
| `src/pages/AdocaoPage.tsx` | page | request-response | `src/pages/AuditoriaPage.tsx` | exact |
| `src/components/adocao/AdocaoCard.tsx` | component | request-response | `src/pages/DashboardPage.tsx` (KPI cards) | role-match |
| `src/components/adocao/LeadsEsquecidosTable.tsx` | component | CRUD | `src/pages/AuditoriaPage.tsx` (tabela de lixeira) | role-match |
| `src/types/index.ts` (modify) | model | transform | `src/types/index.ts` (interface Tarefa) | exact |
| `src/lib/query-keys.ts` (modify) | utility | transform | `src/lib/query-keys.ts` | exact |
| `src/components/layout/Sidebar.tsx` (modify) | component | event-driven | `src/components/layout/Sidebar.tsx` (NavItem) | exact |
| `src/components/layout/AppLayout.tsx` (modify) | middleware | event-driven | `src/components/layout/AppLayout.tsx` (onAuthStateChange) | exact |
| `src/pages/DashboardPage.tsx` (modify) | page | request-response | `src/pages/AuditoriaPage.tsx` (card + RequireRole) | role-match |
| `src/router.tsx` (modify) | config | request-response | `src/router.tsx` | exact |
| `supabase/functions/notify-tarefa/index.ts` (modify) | middleware | event-driven | `supabase/functions/notify-tarefa/index.ts` | exact |

---

## Pattern Assignments

### `supabase/migrations/033_rls_tarefas_notificar.sql` (migration, CRUD)

**Analog:** `supabase/migrations/021_lockdown_rls.sql`

**Helper `is_interno()` — ja existe (linhas 14-26 de 021):**
```sql
CREATE OR REPLACE FUNCTION public.is_interno()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis WHERE id = auth.uid() AND tipo = 'interno'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_interno() TO authenticated;
```

**Padrao de policy lockdown (linhas 45-49 de 021):**
```sql
DROP POLICY IF EXISTS "authenticated_all" ON parceiros;
CREATE POLICY "interno_all_parceiros" ON parceiros
  FOR ALL TO authenticated
  USING (public.is_interno()) WITH CHECK (public.is_interno());
```

**Padrao a copiar para 033 — politicas separadas por operacao (nao usar FOR ALL para tarefas pois coordenador+ pode gerenciar qualquer tarefa no future via granularidade de UPDATE/DELETE):**
```sql
-- 033_rls_tarefas_notificar.sql

-- SEC-02: nova coluna
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS notificar boolean NOT NULL DEFAULT true;

-- SEC-01: fechar RLS aberta
ALTER TABLE tarefas DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON tarefas;

CREATE POLICY "interno_select_tarefas" ON tarefas
  FOR SELECT TO authenticated
  USING (public.is_interno());

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

---

### `src/components/tarefas/TarefaModal.tsx` (component, request-response)

**Analog principal:** `src/components/me/TarefasPanel.tsx` (NovaTarefaModal, linhas 291-393)
**Analog secundario:** `src/components/leads/NewLeadModal.tsx` (padrao react-hook-form + zod)

**Imports pattern — combina os dois analogs:**
```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateTarefa, useUpdateTarefa } from '@/hooks/useTarefas'
import { usePerfis, useMeuPerfil } from '@/hooks/usePerfis'
import type { Tarefa, TarefaTipo, TarefaPrioridade } from '@/types'
```

**Zod schema — padrao de NewLeadModal.tsx (linhas 18-30):**
```typescript
// Em NewLeadModal.tsx — modelo canônico de schema zod no projeto
const schema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  // ... campos
})
type FormData = z.infer<typeof schema>
```

**Aplicado ao TarefaModal:**
```typescript
const tarefaSchema = z.object({
  titulo: z.string().min(3, 'Titulo obrigatorio (min. 3 caracteres)'),
  descricao: z.string().optional(),
  tipo: z.enum(['generica', 'followup', 'reuniao_prep', 'renovacao', 'upsell', 'diagnostico', 'proposta', 'cobranca']),
  prioridade: z.enum(['baixa', 'media', 'alta', 'critica']),
  atribuido_a_id: z.string().uuid('Responsavel obrigatorio'),
  data_vencimento: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})
type TarefaFormData = z.infer<typeof tarefaSchema>
```

**Inicializacao do form — NewLeadModal.tsx (linha 46):**
```typescript
const { register, handleSubmit, watch, setValue, reset, formState: { errors } } =
  useForm<FormData>({ resolver: zodResolver(schema) })
```

**Layout do form + labels — NovaTarefaModal (linhas 338-383):**
```typescript
// dialog max-w-lg, form space-y-3 py-2
<Dialog open={open} onOpenChange={o => !o && !busy && (onClose(), reset())}>
  <DialogContent className="max-w-lg">
    <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
    <div className="space-y-3 py-2">
      <div>
        <label className="text-xs font-semibold text-fg2 mb-1 block">Título *</label>
        {/* Input autoFocus */}
        <Input ... autoFocus />
      </div>
      {/* grid 3-col para tipo/prioridade/vencimento */}
      <div className="grid grid-cols-3 gap-3">
        {/* ... */}
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" ...>Descartar tarefa</Button>
      <Button ... style={{ backgroundColor: '#0089ac' }}>Criar tarefa</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Exibicao de erro — NewLeadModal.tsx (linha 127):**
```typescript
{errors.nome && <p className="text-xs text-red-500">{errors.nome.message}</p>}
```

**Selecao de responsavel — NewLeadModal.tsx (linhas 207-216):**
```typescript
// Perfis populados via usePerfis()
<Select value={responsavelId} onValueChange={setResponsavelId}>
  <SelectTrigger><SelectValue placeholder="Membro da equipe" /></SelectTrigger>
  <SelectContent>
    {perfis.map(p => (
      <SelectItem key={p.id} value={p.id}>
        {p.nome}{p.cargo ? ` — ${p.cargo}` : ''}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**onSuccess pattern — NovaTarefaModal (linhas 312-334):**
```typescript
// Campos automaticos no submit (nao no formulario):
await onCreate({
  titulo: titulo.trim(),
  descricao: descricao.trim() || null,
  tipo,
  prioridade,
  status: 'aberta',
  data_vencimento: dataVencimento ? new Date(dataVencimento).toISOString() : null,
  data_conclusao: null,
  notas: null,
  atribuido_a_id: userId,
  criado_por_id: userId,
  entidade_tipo: null,
  entidade_id: null,
})
```

**Diferenca para TarefaModal novo:** usar `react-hook-form` (nao useState por campo), adicionar prop `entidadeTipo`/`entidadeId` para vincular ao lead, adicionar campo `responsavel` via `usePerfis()`, campo `notificar: true` fixo no submit.

---

### `src/components/tarefas/TarefaCard.tsx` (component, request-response)

**Analog:** `src/components/me/TarefasPanel.tsx` (linhas 183-268 — cada item do map)

**Estrutura da row (linhas 186-266):**
```typescript
// Container da row
<div
  key={t.id}
  className={cn('px-4 py-3 flex items-start gap-3 hover:bg-[var(--alpha-bg-xs)] transition-colors group')}
>
  {/* Botao concluir */}
  <button
    type="button"
    title="Concluir"
    onClick={() => concluir.mutate(t.id)}
    className="mt-0.5 shrink-0 text-muted-foreground hover:text-[#10b981]"
  >
    <Circle className="w-4 h-4" />
  </button>

  {/* Conteudo principal */}
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2 flex-wrap">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium text-fg2 truncate">{t.titulo}</span>
      {/* badge prioridade inline */}
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border"
        style={{ background: prioStyle.bg, color: prioStyle.color, borderColor: prioStyle.border }}
      >
        {PRIORIDADE_LABEL[t.prioridade]}
      </span>
    </div>
    {/* data vencimento — cor vermelha se vencida */}
    {t.data_vencimento && (
      <p className={cn('text-[11px] mt-1 inline-flex items-center gap-1', vencida ? 'text-[#fca5a5]' : 'text-fg4')}>
        <Calendar className="w-3 h-3" />
        {vencida ? 'Venceu ' : 'Vence '}
        {formatDate(t.data_vencimento)}
      </p>
    )}
  </div>

  {/* Botoes de acao — hover via group */}
  <div className="shrink-0 flex items-center gap-1">
    {link && (
      <button
        type="button"
        onClick={() => navigate(link)}
        title="Abrir"
        className="p-1.5 rounded hover:bg-[var(--alpha-bg-sm)] text-muted-foreground hover:text-fg2 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    )}
    <button
      type="button"
      onClick={() => remover.mutate(t.id)}
      title="Remover"
      className="p-1.5 rounded hover:bg-[rgba(239,68,68,0.10)] text-muted-foreground hover:text-[#fca5a5] transition-colors opacity-0 group-hover:opacity-100"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
</div>
```

**PRIORIDADE_STYLE — copiar de TarefasPanel.tsx (linhas 46-51):**
```typescript
const PRIORIDADE_STYLE: Record<TarefaPrioridade, { bg: string; color: string; border: string }> = {
  critica: { bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5', border: 'rgba(239,68,68,0.30)'  },
  alta:    { bg: 'rgba(249,115,22,0.12)', color: '#fdba74', border: 'rgba(249,115,22,0.30)' },
  media:   { bg: 'rgba(0,137,172,0.12)',  color: '#6bd0e7', border: 'rgba(0,137,172,0.30)'  },
  baixa:   { bg: 'var(--alpha-bg-sm)',    color: 'var(--text-soft-a)', border: 'var(--alpha-border)' },
}
```

**TIPO_ICONS — copiar de TarefasPanel.tsx (linhas 28-37):**
```typescript
const TIPO_ICONS: Record<string, typeof Target> = {
  generica:     Target,
  followup:     MessageCircle,
  reuniao_prep: Calendar,
  renovacao:    FileText,
  upsell:       Briefcase,
  diagnostico:  Users,
  proposta:     Handshake,
  cobranca:     Send,
}
```

**TarefaCard recebe como props:** `tarefa: Tarefa`, `onConcluir`, `onEditar`, `onRemover` — extraido para componente separado em vez de embutido no map do TarefasPanel.

---

### `src/components/tarefas/TarefaStatusBadge.tsx` (component, transform)

**Analog:** `src/components/me/TarefasPanel.tsx` — badges de prioridade (linhas 205-213) + `src/pages/AuditoriaPage.tsx` (ACAO_COLORS, linhas 9-17)

**Padrao de badge inline com style object — AuditoriaPage.tsx (linhas 82-87):**
```typescript
<span
  className="text-xs px-2 py-0.5 rounded-full font-medium"
  style={ACAO_COLORS[log.acao]
    ? { background: ACAO_COLORS[log.acao].bg, color: ACAO_COLORS[log.acao].color }
    : { background: 'var(--alpha-bg-xs)', color: 'var(--text-soft-a)' }}
>
  {log.acao}
</span>
```

**Aplicar ao TarefaStatusBadge — palette da UI-SPEC:**
```typescript
// Copiar estrutura de ACAO_COLORS mas para status de tarefa
// Base: text-[10px] px-1.5 py-0.5 rounded-full font-semibold border

const STATUS_STYLE: Record<TarefaStatus, { bg: string; color: string; border: string; label: string }> = {
  aberta:       { bg: 'rgba(251,191,36,0.12)', color: 'var(--amber-hi)',   border: 'rgba(251,191,36,0.30)',  label: 'Aberta'       },
  em_andamento: { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd',           border: 'rgba(59,130,246,0.30)',  label: 'Em andamento' },
  concluida:    { bg: 'rgba(16,185,129,0.12)', color: 'var(--emerald-hi)', border: 'rgba(16,185,129,0.30)', label: 'Concluida'    },
  cancelada:    { bg: 'var(--alpha-bg-xs)',     color: 'var(--text-soft-a)', border: 'var(--alpha-border)',  label: 'Cancelada'    },
}
```

---

### `src/hooks/useTarefasBadgeCount.ts` (hook, event-driven)

**Analog:** `src/hooks/useTarefas.ts` (useMinhasTarefas, linhas 22-37) para o padrao de query filtrada; o Realtime e padrao novo (sem analog exato no codebase — usar RESEARCH.md Pattern 3).

**Query base a copiar — useTarefas.ts (linhas 22-36):**
```typescript
export function useMinhasTarefas(userId: string | undefined | null) {
  return useQuery({
    queryKey: QUERY_KEYS.tarefas.mine(userId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarefas')
        .select('*')
        .eq('atribuido_a_id', userId)
        .in('status', ['aberta', 'em_andamento'])
        .order('data_vencimento', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as Tarefa[]
    },
    enabled: !!userId,
  })
}
```

**Padrao de import do supabase client:**
```typescript
import { supabase } from '@/lib/supabase'
```

**Estrutura do hook com Realtime (do RESEARCH.md Pattern 3 — sem analog codebase):**
```typescript
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

  // Realtime: filtrar por atribuido_a_id apenas (Supabase nao suporta filtro composto)
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`tarefas-badge-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tarefas',
        filter: `atribuido_a_id=eq.${userId}`,
      }, () => {
        // Re-fetch count completo no callback
        supabase
          .from('tarefas')
          .select('id', { count: 'exact', head: true })
          .eq('atribuido_a_id', userId)
          .in('status', ['aberta', 'em_andamento'])
          .then(({ count: c }) => setCount(c ?? 0))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return count
}
```

**Convencao de named export — obrigatorio (CLAUDE.md):** `export function useTarefasBadgeCount`

---

### `src/hooks/useAdocao.ts` (hook, CRUD)

**Analog:** `src/hooks/useAuditLogs.ts` (linhas 1-37)

**Imports e estrutura base — useAuditLogs.ts (linhas 1-6):**
```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { AuditLog } from '@/types'
```

**Padrao de query com limit e order — useAuditLogs.ts (linhas 24-37):**
```typescript
export function useAllAuditLogs() {
  return useQuery({
    queryKey: QUERY_KEYS.audit_logs.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as AuditLog[]
    },
  })
}
```

**Query de adocao com filtro de data (baseado no padrao acima + RESEARCH.md Pattern 5):**
```typescript
import { subDays } from 'date-fns'

// Query 1: logins na semana
export function useAdocaoLogins() {
  return useQuery({
    queryKey: QUERY_KEYS.adocao.logins,  // nova chave
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString()
      const { data, error } = await supabase
        .from('audit_logs')
        .select('usuario, registro_id, created_at')
        .eq('acao', 'login')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Query 2: leads esquecidos
export function useLeadsEsquecidos() {
  return useQuery({
    queryKey: QUERY_KEYS.adocao.leadsEsquecidos,  // nova chave
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString()
      const { data, error } = await supabase
        .from('leads')
        .select('id, nome, empresa, status, updated_at, responsavel_id, responsavel')
        .in('status', ACTIVE_LEAD_STAGES)
        .lt('updated_at', sevenDaysAgo)
        .order('updated_at', { ascending: true })
        .limit(50)
      if (error) throw error
      return data
    },
  })
}
```

---

### `src/pages/TarefasPage.tsx` (page, request-response)

**Analog:** `src/pages/AuditoriaPage.tsx` (estrutura de pagina) + `src/components/me/TarefasPanel.tsx` (logica de tarefas)

**Estrutura de pagina — AuditoriaPage.tsx (linhas 19-28):**
```typescript
export function AuditoriaPage() {
  const { data: logs, isLoading } = useAllAuditLogs()
  const { isCoordenadorOrAcima } = useCurrentRole()

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-6">Auditoria</h1>
      {/* ... */}
    </div>
  )
}
```

**Card container com divide-y — AuditoriaPage.tsx (linhas 38-45):**
```typescript
<Card className="mb-6">
  <CardHeader>
    <CardTitle className="text-sm flex items-center gap-2">
      <Trash2 className="w-4 h-4" />
      Titulo
    </CardTitle>
  </CardHeader>
  <CardContent className="p-0">
    <div className="divide-y">
      {/* rows */}
    </div>
  </CardContent>
</Card>
```

**Filter bar + botao CTA — TarefasPanel.tsx (linhas 107-159):**
```typescript
<div className="flex items-center gap-3 flex-wrap">
  {/* filtros Select h-8 w-36/w-40 text-xs */}
  <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v)}>
    <SelectTrigger className="h-8 text-xs w-36">
      <SelectValue placeholder="Status" />
    </SelectTrigger>
    {/* ... */}
  </Select>
  {/* ScopeToggle para coordenador+ — ml-auto */}
  <Button size="sm" onClick={() => setNewOpen(true)} style={{ backgroundColor: '#0089ac' }} className="h-8 gap-1.5 text-xs">
    <Plus className="w-3.5 h-3.5" /> Nova tarefa
  </Button>
</div>
```

**Empty state — TarefasPanel.tsx (linhas 162-169):**
```typescript
<Card>
  <CardContent className="py-12 text-center">
    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ background: 'rgba(16,185,129,0.15)' }}>
      <CheckCircle2 className="w-5 h-5" style={{ color: '#6ee7b7' }} />
    </div>
    <p className="text-sm font-medium text-foreground">Nenhuma tarefa pendente</p>
    <p className="text-xs text-muted-foreground mt-1">Voce esta em dia! Crie uma nova tarefa ou aguarde atribuicoes.</p>
  </CardContent>
</Card>
```

**Filtros via useSearchParams — padrao do projeto (CLAUDE.md Architectural Constraints):** usar `useSearchParams` para `status` e `date` filters, mantendo-os bookmarkable.

---

### `src/pages/AdocaoPage.tsx` (page, request-response)

**Analog:** `src/pages/AuditoriaPage.tsx` (estrutura completa)

**Gating por role — RequireRole.tsx (linhas 17-50):**
```typescript
// Padrao canonico de RequireRole
export function AdocaoPage() {
  return (
    <RequireRole atLeast="coordenador">
      <AdocaoContent />
    </RequireRole>
  )
}
```

**Tabela com thead/tbody — padrão inferido de AuditoriaPage.tsx (divide-y + hover row):**
```typescript
// Pattern de tabela de AuditoriaPage — adaptado para thead/tbody
<Card><CardContent className="p-0">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b text-xs text-muted-foreground">
        <th className="px-4 py-3 text-left font-semibold" scope="col">Usuario</th>
        {/* ... */}
      </tr>
    </thead>
    <tbody className="divide-y">
      <tr className="hover:bg-[var(--alpha-bg-xs)] transition-colors">
        {/* ... */}
      </tr>
    </tbody>
  </table>
</CardContent></Card>
```

**Header da pagina — AuditoriaPage.tsx (linha 27):**
```typescript
<h1 className="text-xl font-bold text-foreground mb-6">Adocao</h1>
```

**CardTitle com icone — AuditoriaPage.tsx (linhas 31-35):**
```typescript
<CardTitle className="text-sm flex items-center gap-2">
  <Activity className="w-4 h-4" />
  Atividade no mes
</CardTitle>
```

---

### `src/components/adocao/AdocaoCard.tsx` (component, request-response)

**Analog:** `src/pages/DashboardPage.tsx` (cards KPI, linhas 1-80) + `src/pages/AuditoriaPage.tsx` (Card + CardHeader + CardTitle)

**Card KPI com metrica numerica — DashboardPage.tsx (padrao dos cards de KPI):**
```typescript
// Card com grid de metricas
<Card className="mb-6">
  <CardHeader>
    <CardTitle className="text-sm flex items-center gap-2">
      <Activity className="w-4 h-4" />
      Adocao do time (ultimos 7 dias)
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-3 gap-4">
      {/* cada coluna: icon + numero grande + label */}
      <div>
        <LogIn className="w-4 h-4" style={{ color: 'var(--cyan-hi)' }} />
        <p className="text-2xl font-bold" style={{ color: 'var(--cyan-hi)' }}>{logins}</p>
        <p className="text-xs text-muted-foreground">Logins unicos</p>
      </div>
      {/* ... */}
    </div>
    {/* secao leads esquecidos separada por border-t */}
    <div className="border-t mt-4 pt-4">
      {/* LeadsEsquecidosTable variant="compact" */}
    </div>
  </CardContent>
</Card>
```

**Gating RequireRole — RequireRole.tsx:**
```typescript
// No DashboardPage, envolver com:
<RequireRole atLeast="coordenador">
  <AdocaoCard />
</RequireRole>
```

---

### `src/components/adocao/LeadsEsquecidosTable.tsx` (component, CRUD)

**Analog:** `src/pages/AuditoriaPage.tsx` (tabela de lixeira, linhas 38-65)

**Row com acoes — AuditoriaPage.tsx (linhas 40-56):**
```typescript
<div key={item.id} className="flex items-center gap-4 px-5 py-3">
  <div className="flex-1 min-w-0">
    <p className="text-sm text-fg2 font-medium truncate">
      {item.lead_nome ?? '—'}
      {item.lead_empresa && <span className="text-fg4"> · {item.lead_empresa}</span>}
    </p>
    <p className="text-xs text-fg4">
      excluído por {item.excluido_por_nome ?? '—'} · {formatDate(item.excluido_em)}
    </p>
  </div>
  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
    <ExternalLink className="w-3 h-3" /> Ver lead
  </Button>
</div>
```

**Prop `variant: 'compact' | 'full'`** controla numero de colunas exibidas. Em `compact`, mostrar apenas nome+empresa+data; em `full`, mostrar todas as colunas da UI-SPEC.

**`differenceInDays` para "ha N dias" — DashboardPage.tsx (linha 11):**
```typescript
import { differenceInDays } from 'date-fns'
// Uso: differenceInDays(new Date(), new Date(lead.updated_at))
```

---

### `src/types/index.ts` (modify — adicionar campo `notificar`)

**Analog:** propria interface `Tarefa` (linhas 266-282)

**Interface atual — types/index.ts (linhas 266-282):**
```typescript
export interface Tarefa {
  id: string
  titulo: string
  descricao?: string | null
  tipo: TarefaTipo
  entidade_tipo?: TarefaEntidade | null
  entidade_id?: string | null
  atribuido_a_id?: string | null
  criado_por_id?: string | null
  prioridade: TarefaPrioridade
  status: TarefaStatus
  data_vencimento?: string | null
  data_conclusao?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
}
```

**Campo a adicionar (antes de `created_at`):**
```typescript
  notificar?: boolean
```

---

### `src/lib/query-keys.ts` (modify — adicionar chave `adocao`)

**Analog:** propria estrutura de `QUERY_KEYS` (linhas 1-62)

**Padrao de chaves existente — query-keys.ts (linhas 47-51):**
```typescript
tarefas: {
  all: ['tarefas'] as const,
  mine: (userId: string) => ['tarefas', 'mine', userId] as const,
  byEntidade: (tipo: string, id: string) => ['tarefas', 'entidade', tipo, id] as const,
},
```

**Nova chave `adocao` a adicionar (seguindo mesmo padrao):**
```typescript
adocao: {
  logins: ['adocao', 'logins'] as const,
  atividade: ['adocao', 'atividade'] as const,
  leadsEsquecidos: ['adocao', 'leads-esquecidos'] as const,
},
```

---

### `src/components/layout/Sidebar.tsx` (modify — badge em NavItem)

**Analog:** proprio `Sidebar.tsx` (linhas 79-94)

**NavItem atual — Sidebar.tsx (linhas 79-94):**
```typescript
function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: React.FC<{ className?: string }> }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors', isActive ? 'text-white' : 'hover:text-white')
      }
      style={({ isActive }) => isActive ? { backgroundColor: ACTIVE_BG, color: '#fff' } : { color: '#6bd0e7' }}
      // ... event handlers
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </NavLink>
  )
}
```

**Modificacao: adicionar prop `badge?: number` e renderizar pill:**
```typescript
// Estender a assinatura do NavItem
function NavItem({
  to, label, icon: Icon, badge,
}: {
  to: string
  label: string
  icon: React.FC<{ className?: string }>
  badge?: number
}) {
  return (
    <NavLink ...>
      <Icon className="w-4 h-4 shrink-0" />
      {label}
      {/* Badge — apenas quando count > 0 */}
      {badge != null && badge > 0 && (
        <span
          className="ml-auto text-[10px] font-bold bg-cyan-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center transition-all duration-200"
          aria-label={`${badge} tarefas abertas`}
          title={`${badge} tarefas abertas`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}
```

**NAV_GROUPS — a entrada de Tarefas sera adicionada ao grupo PIPELINE ou raiz. O badge sera passado como prop calculado de `useTarefasBadgeCount(perfil?.id)`:**
```typescript
// No componente Sidebar, adicionar:
const badgeCount = useTarefasBadgeCount(perfil?.id)
// Depois usar no item de Tarefas:
{ to: '/tarefas', label: 'Tarefas', icon: CheckSquare, badge: badgeCount }
```

---

### `src/components/layout/AppLayout.tsx` (modify — login tracking)

**Analog:** proprio `AppLayout.tsx` (linhas 35-44)

**onAuthStateChange existente — AppLayout.tsx (linhas 35-44):**
```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    queryClient.clear()
    navigate('/login', { replace: true })
  }
})
```

**Adicionar login tracking (apos o bloco SIGNED_OUT — RESEARCH.md Pattern 4 + Pitfall 3):**
```typescript
// Adicionar import de useRef no topo
import { useEffect, useState, useRef } from 'react'

// Dentro do componente, antes do useEffect:
const loggedSessionRef = useRef<string | null>(null)

// Dentro do onAuthStateChange, apos o bloco SIGNED_OUT:
if (event === 'SIGNED_IN' && session?.user) {
  // Evitar insert duplicado no React 19 StrictMode (double-invoke)
  if (loggedSessionRef.current !== session.access_token) {
    loggedSessionRef.current = session.access_token
    // fire-and-forget — nao bloquear navegacao
    supabase.from('audit_logs').insert({
      tabela: 'perfis',
      registro_id: session.user.id,
      acao: 'login',
      usuario: session.user.email ?? null,
    }).then(({ error }) => {
      if (error) console.error('audit login:', error)
    })
  }
}
```

---

### `src/pages/DashboardPage.tsx` (modify — adicionar AdocaoCard)

**Analog:** proprio `DashboardPage.tsx` (padrao de imports + RequireRole)

**Imports existentes — DashboardPage.tsx (linhas 1-27):**
```typescript
import { useMemo, useState } from 'react'
import { useLeads } from '@/hooks/useLeads'
// ... outros imports
import { RequireRole } from '@/components/shared/RequireRole'  // adicionar se nao existir
```

**Posicao de insercao:** apos os KPI cards existentes, antes dos graficos. Envolver com `RequireRole atLeast="coordenador"`.

```typescript
// Adicionar ao JSX do DashboardPage, apos os KPI cards:
<RequireRole atLeast="coordenador" fallback={null}>
  <AdocaoCard />
</RequireRole>
```

---

### `src/router.tsx` (modify — adicionar rotas /tarefas e /adocao)

**Analog:** proprio `router.tsx` (linhas 40-78)

**Padrao de adicao de rota — router.tsx (linhas 48-53):**
```typescript
// Copiar o padrao de qualquer rota simples existente:
{ path: 'leads', element: <LeadsPage /> },
{ path: 'auditoria', element: <AuditoriaPage /> },
```

**Adicionar as novas rotas dentro do bloco `children` de AppLayout:**
```typescript
// Importar no topo:
import { TarefasPage } from '@/pages/TarefasPage'
import { AdocaoPage } from '@/pages/AdocaoPage'

// Adicionar no array children:
{ path: 'tarefas', element: <TarefasPage /> },
{ path: 'adocao', element: <AdocaoPage /> },
```

---

### `supabase/functions/notify-tarefa/index.ts` (modify — verificar `notificar=true`)

**Analog:** proprio `notify-tarefa/index.ts` (linhas 162-180)

**Logica de skip existente — notify-tarefa/index.ts (linhas 162-180):**
```typescript
// Padrao de early return com skip explicito
if (payload.table !== 'tarefas') {
  return json({ ok: true, skipped: 'not tarefas' })
}

const tarefa = payload.record
if (!tarefa) return json({ ok: true, skipped: 'no record' })

const novoAtribuido = tarefa.atribuido_a_id
if (!novoAtribuido) {
  return json({ ok: true, skipped: 'sem destinatário' })
}
```

**Adicionar verificacao de `notificar` — apos linha 167 (`if (!tarefa)...`):**
```typescript
// Adicionar campo ao TarefaRow interface:
interface TarefaRow {
  // ... campos existentes
  notificar: boolean | null  // novo campo SEC-02
}

// Adicionar skip apos o check de `tarefa`:
if (tarefa.notificar === false) {
  return json({ ok: true, skipped: 'notificar=false' })
}
```

---

## Shared Patterns

### Toasts de sucesso/erro (pattern universal)
**Source:** `src/hooks/useTarefas.ts` (linhas 64-68)
**Aplicar a:** todos os hooks com mutation, todos os componentes com acoes inline
```typescript
onSuccess: () => {
  qc.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.all })
  toast.success('Tarefa criada')
},
onError: () => toast.error('Erro ao criar tarefa'),
```
Toasts em PT-BR, curtos, com verbo de acao.

### Invalidacao de queries apos mutation
**Source:** `src/hooks/useTarefas.ts` (linhas 64-66, 86, 106)
**Aplicar a:** todos os hooks com mutation de tarefas
```typescript
onSuccess: () => {
  qc.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.all })
  // Se tarefa pertence a entidade:
  if (entidadeTipo && entidadeId) {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.byEntidade(entidadeTipo, entidadeId) })
  }
  // Se o usuario tem inbox ativo:
  qc.invalidateQueries({ queryKey: QUERY_KEYS.tarefas.mine(userId) })
}
```

### Role gating com RequireRole
**Source:** `src/components/shared/RequireRole.tsx` (linhas 17-51)
**Aplicar a:** `AdocaoPage`, `AdocaoCard` no `DashboardPage`, botoes de editar/excluir tarefa de outros consultores
```typescript
<RequireRole atLeast="coordenador">
  {/* conteudo restrito */}
</RequireRole>
// ou com fallback silencioso:
<RequireRole atLeast="coordenador" fallback={null}>
  {/* conteudo omitido para roles inferiores */}
</RequireRole>
```

### Named exports (obrigatorio)
**Source:** CLAUDE.md — "Named exports only — no `export default` in `src/`"
**Aplicar a:** todos os arquivos novos em `src/`
```typescript
// Correto:
export function TarefaModal({ ... }: Props) { ... }
export function useTarefasBadgeCount(...) { ... }
export function TarefasPage() { ... }

// Errado:
export default function TarefaModal() { ... }
```

### Hover e interatividade de rows
**Source:** `src/components/me/TarefasPanel.tsx` (linha 186) e `src/pages/AuditoriaPage.tsx` (linha 309 da UI-SPEC)
**Aplicar a:** `TarefaCard`, `LeadsEsquecidosTable` rows, tabela de adocao
```typescript
className={cn('px-4 py-3 flex items-start gap-3 hover:bg-[var(--alpha-bg-xs)] transition-colors group')}
// ou para tabela:
<tr className="hover:bg-[var(--alpha-bg-xs)] transition-colors">
```

### `cn()` utility
**Source:** `src/lib/utils.ts` — `import { cn } from '@/lib/utils'`
**Aplicar a:** qualquer componente com classes condicionais

---

## No Analog Found

Nenhum arquivo desta fase ficou sem analog. Todos os 15 arquivos tem pelo menos um analog de role-match ou exact no codebase.

---

## Metadata

**Analog search scope:** `src/components/`, `src/hooks/`, `src/pages/`, `src/lib/`, `src/types/`, `supabase/migrations/`, `supabase/functions/`
**Files scanned:** 17 arquivos lidos diretamente
**Pattern extraction date:** 2026-05-26
