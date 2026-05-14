import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientes, useDeleteCliente, useUpdateCliente } from '@/hooks/useClientes'
import { useIndicacoes } from '@/hooks/useIndicacoes'
import { useCreateOportunidade } from '@/hooks/useOportunidades'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { CLIENT_STATUS_OPTIONS, SEGMENTS } from '@/lib/constants'
import { getDaysUntilExpiry, formatCurrency, formatDate } from '@/lib/utils'
import { Search, Briefcase, AlertCircle, Plus, Trash2, ArrowUpDown, RefreshCw, TrendingUp, CheckCircle2, XCircle, Clock, DollarSign } from 'lucide-react'
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog'
import { cn } from '@/lib/utils'
import type { Cliente, Contrato } from '@/types'
import { NewClienteModal } from '@/components/clientes/NewClienteModal'
import { toast } from 'sonner'

// ─── Health Score ──────────────────────────────────────────────────────────────

type HealthLevel = 'green' | 'yellow' | 'red' | 'gray'

const HEALTH_STYLES: Record<HealthLevel, { dot: string; label: string }> = {
  green:  { dot: 'bg-emerald-500', label: 'text-emerald-400' },
  yellow: { dot: 'bg-amber-400',   label: 'text-amber-400'   },
  red:    { dot: 'bg-red-500',     label: 'text-red-400'     },
  gray:   { dot: 'bg-slate-500',   label: 'text-fg4' },
}

// ─── Nível de Pertencimento ───────────────────────────────────────────────────

type NivelPertencimento = 1 | 2 | 3 | 4 | 5
const NIVEL_LABELS: Record<NivelPertencimento, { label: string; color: string }> = {
  1: { label: 'Curioso',           color: 'text-slate-400'   },
  2: { label: 'Interessado',       color: 'text-sky-400'     },
  3: { label: 'Parceiro Ativo',    color: 'text-blue-400'    },
  4: { label: 'Defensor',          color: 'text-violet-400'  },
  5: { label: 'Construtor',        color: 'text-amber-400'   },
}

function getNivelPertencimento(cliente: Cliente, referralsCount: number): NivelPertencimento {
  const contratos = cliente.contratos || []
  const hasActive = contratos.some(c => c.status === 'ativo')
  const hasAny    = contratos.length > 0
  if (!hasAny) return 1
  if (!hasActive) return 2
  if (referralsCount === 0) return 3
  // level 5: active 12+ months + referrals + NPS ≥ 9
  const oldest = contratos.filter(c => c.data_inicio).sort((a, b) => new Date(a.data_inicio!).getTime() - new Date(b.data_inicio!).getTime())[0]
  const monthsActive = oldest ? Math.floor((Date.now() - new Date(oldest.data_inicio!).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0
  if (monthsActive >= 12 && referralsCount >= 1 && (cliente.nps_score ?? 0) >= 9) return 5
  return 4
}

function getClientHealth(cliente: Cliente): { level: HealthLevel; text: string } {
  const active = cliente.contratos?.filter(c => c.status === 'ativo') || []
  if (active.length === 0) return { level: 'gray', text: 'Sem contrato ativo' }

  const assessoria = active.filter(c => c.tipo === 'assessoria')
  if (assessoria.length === 0) return { level: 'yellow', text: 'Só consultoria' }

  const minDays = Math.min(...assessoria.map(c => getDaysUntilExpiry(c.data_fim) ?? 999))
  if (minDays < 0)   return { level: 'red',    text: 'Contrato vencido' }
  if (minDays <= 30) return { level: 'red',    text: `${minDays}d restantes` }
  if (minDays <= 90) return { level: 'yellow', text: `${minDays}d restantes` }
  return { level: 'green', text: 'Assessoria ativa' }
}

// ─── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-[rgba(99,102,241,0.20)] text-[#a5b4fc]',
  'bg-[rgba(16,185,129,0.20)] text-[#6ee7b7]',
  'bg-[rgba(139,92,246,0.20)] text-[#c4b5fd]',
  'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]',
  'bg-[rgba(6,182,212,0.20)] text-[#67e8f9]',
  'bg-[rgba(244,63,94,0.20)] text-[#fda4af]',
  'bg-[rgba(59,130,246,0.20)] text-[#93c5fd]',
  'bg-[rgba(249,115,22,0.20)] text-[#fdba74]',
]

function getAvatarClass(name: string) {
  const sum = Array.from(name).reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length]
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusColor(status: string) {
  return CLIENT_STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-[var(--alpha-bg-xs)] text-muted-foreground'
}

function getSegmentLabel(value: string) {
  return SEGMENTS.find(s => s.value === value)?.label || value
}

function getNextExpiry(contratos: Contrato[] | undefined): string | null {
  if (!contratos?.length) return null
  const active = contratos.filter(c => c.status === 'ativo' && c.data_fim)
  if (!active.length) return null
  return active.sort((a, b) => new Date(a.data_fim!).getTime() - new Date(b.data_fim!).getTime())[0].data_fim!
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ClienteCardSkeleton() {
  return (
    <div className="bg-card rounded-xl p-4 animate-pulse" style={{ border: '1px solid var(--alpha-border)' }}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[var(--alpha-border)] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[var(--alpha-border)] rounded w-36" />
          <div className="h-3 bg-[var(--alpha-bg-xs)] rounded w-52" />
        </div>
        <div className="space-y-1.5 text-right">
          <div className="h-3 bg-[var(--alpha-bg-xs)] rounded w-20 ml-auto" />
          <div className="h-3 bg-[var(--alpha-bg-xs)] rounded w-16 ml-auto" />
        </div>
      </div>
    </div>
  )
}

// ─── Status filter tabs ────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: 'todos',        label: 'Todos' },
  { value: 'ativo',        label: 'Ativos' },
  { value: 'em_renovacao', label: 'Em Renovação' },
  { value: 'encerrado',   label: 'Encerrados' },
]

// ─── Health filter ────────────────────────────────────────────────────────────

type HealthFilter = 'todos' | 'green' | 'yellow' | 'red' | 'gray'

const HEALTH_FILTER_TABS: { value: HealthFilter; label: string; dot: string; text: string }[] = [
  { value: 'todos',  label: 'Todos',           dot: '',               text: 'var(--text-soft-a)' },
  { value: 'green',  label: 'Saudável',         dot: '#10b981',        text: '#34d399' },
  { value: 'yellow', label: 'Atenção',          dot: '#f59e0b',        text: '#fbbf24' },
  { value: 'red',    label: 'Crítico',          dot: '#ef4444',        text: '#f87171' },
  { value: 'gray',   label: 'Sem contrato',     dot: '#64748b',        text: 'var(--text-soft-a)' },
]

// ─── Sort options ─────────────────────────────────────────────────────────────

type ClienteSort = 'padrao' | 'vencimento' | 'nps' | 'nivel' | 'contratos'

const SORT_OPTIONS: { value: ClienteSort; label: string }[] = [
  { value: 'padrao',     label: 'Padrão (mais recente)' },
  { value: 'vencimento', label: 'Vencimento (mais urgente)' },
  { value: 'nps',        label: 'NPS (maior → menor)' },
  { value: 'nivel',      label: 'Nível de Pertencimento ↓' },
  { value: 'contratos',  label: 'Qtd. de contratos ↓' },
]

// ─── Tipo de serviço filter ───────────────────────────────────────────────────

type TipoServico = 'todos' | 'assessoria' | 'consultoria' | 'ambos' | 'sem_contrato'

const TIPO_TABS: { value: TipoServico; label: string }[] = [
  { value: 'todos',         label: 'Todos' },
  { value: 'assessoria',    label: 'Assessoria' },
  { value: 'consultoria',   label: 'Consultoria' },
  { value: 'ambos',         label: 'Assessoria + Consultoria' },
  { value: 'sem_contrato',  label: 'Sem contrato ativo' },
]

function getTipoServico(cliente: Cliente): TipoServico {
  const ativos = cliente.contratos?.filter(c => c.status === 'ativo') || []
  if (ativos.length === 0) return 'sem_contrato'
  const hasAss  = ativos.some(c => c.tipo === 'assessoria')
  const hasCons = ativos.some(c => c.tipo === 'consultoria')
  if (hasAss && hasCons) return 'ambos'
  if (hasAss)  return 'assessoria'
  if (hasCons) return 'consultoria'
  return 'sem_contrato'
}

// ─── Renovação helpers ────────────────────────────────────────────────────────

function getUrgencyLevel(daysLeft: number | null): 'critico' | 'atencao' | 'ok' {
  if (daysLeft === null) return 'ok'
  if (daysLeft < 0 || daysLeft <= 30) return 'critico'
  if (daysLeft <= 60) return 'atencao'
  return 'ok'
}

const URGENCY_CONFIG = {
  critico: { label: 'Crítico',    bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.30)',  text: '#f87171' },
  atencao: { label: 'Atenção',    bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.30)', text: '#fbbf24' },
  ok:      { label: 'Em tempo',   bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', text: '#34d399' },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ClientesPage() {
  const navigate   = useNavigate()
  const { data: clientes, isLoading } = useClientes()
  const { data: indicacoes = [] }     = useIndicacoes()
  const deleteCliente      = useDeleteCliente()
  const updateCliente      = useUpdateCliente()
  const createOportunidade = useCreateOportunidade()

  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('todos')
  const [tipoFilter, setTipoFilter]       = useState<TipoServico>('todos')
  const [healthFilter, setHealthFilter]   = useState<HealthFilter>('todos')
  const [segmentoFilter, setSegmentoFilter] = useState('todos')
  const [sortBy, setSortBy]               = useState<ClienteSort>('padrao')
  const [showNew, setShowNew]             = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = clientes ?? []
    if (search)
      list = list.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()) || c.empresa.toLowerCase().includes(search.toLowerCase()))
    if (statusFilter !== 'todos')
      list = list.filter(c => c.status === statusFilter)
    if (tipoFilter !== 'todos')
      list = list.filter(c => getTipoServico(c) === tipoFilter)
    if (healthFilter !== 'todos')
      list = list.filter(c => getClientHealth(c).level === healthFilter)
    if (segmentoFilter !== 'todos')
      list = list.filter(c => c.segmento === segmentoFilter)

    // Sort
    list = [...list]
    if (sortBy === 'vencimento') {
      list.sort((a, b) => {
        const da = getDaysUntilExpiry(getNextExpiry(a.contratos)) ?? 9999
        const db = getDaysUntilExpiry(getNextExpiry(b.contratos)) ?? 9999
        return da - db
      })
    } else if (sortBy === 'nps') {
      list.sort((a, b) => (b.nps_score ?? -1) - (a.nps_score ?? -1))
    } else if (sortBy === 'nivel') {
      list.sort((a, b) => {
        const ra = indicacoes.filter(i => i.indicante_cliente_id === a.id).length
        const rb = indicacoes.filter(i => i.indicante_cliente_id === b.id).length
        return getNivelPertencimento(b, rb) - getNivelPertencimento(a, ra)
      })
    } else if (sortBy === 'contratos') {
      list.sort((a, b) => (b.contratos?.length ?? 0) - (a.contratos?.length ?? 0))
    }
    return list
  }, [clientes, search, statusFilter, tipoFilter, healthFilter, segmentoFilter, sortBy, indicacoes])

  const clienteToDelete = deleteConfirm ? (clientes ?? []).find(c => c.id === deleteConfirm) ?? null : null

  async function handleConfirmDelete() {
    if (!deleteConfirm) return
    await deleteCliente.mutateAsync(deleteConfirm)
    setDeleteConfirm(null)
  }

  function handleStatusTabClick(value: string) {
    setStatusFilter(value)
    if (value === 'em_renovacao') setSortBy('vencimento')
    if (value === 'encerrado') setSortBy('padrao')
  }

  async function handleCriarProposta(e: React.MouseEvent, cliente: Cliente) {
    e.stopPropagation()
    const contrato = cliente.contratos?.filter(c => c.status === 'ativo').sort((a, b) =>
      new Date(a.data_fim ?? '9999').getTime() - new Date(b.data_fim ?? '9999').getTime()
    )[0]
    await createOportunidade.mutateAsync({
      cliente_id: cliente.id,
      titulo: `Renovação — ${cliente.empresa}`,
      descricao: `Proposta de renovação de contrato de ${contrato?.tipo ?? 'assessoria'}.`,
      tipo: 'renovacao',
      status: 'identificada',
      valor_estimado: contrato?.valor_total ?? null,
    } as never)
    toast.success('Proposta de renovação criada em Oportunidades!')
  }

  async function handleMarcarRenovado(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await updateCliente.mutateAsync({ id, status: 'ativo' })
    toast.success('Cliente marcado como renovado!')
  }

  async function handleNaoRenovou(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await updateCliente.mutateAsync({ id, status: 'encerrado' })
    toast.success('Cliente movido para Encerrados.')
  }

  async function handleWinBack(e: React.MouseEvent, cliente: Cliente) {
    e.stopPropagation()
    const totalValor = cliente.contratos?.reduce((sum, c) => sum + (c.valor_total ?? 0), 0) ?? 0
    await createOportunidade.mutateAsync({
      cliente_id: cliente.id,
      titulo: `Win-back — ${cliente.empresa}`,
      descricao: `Reengajamento de ex-cliente. Relacionamento anterior: ${cliente.contratos?.length ?? 0} contrato(s).`,
      tipo: 'upsell',
      status: 'identificada',
      valor_estimado: totalValor > 0 ? totalValor : null,
    } as never)
    toast.success('Oportunidade de win-back criada!')
  }

  async function handleReativar(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await updateCliente.mutateAsync({ id, status: 'ativo' })
    toast.success('Cliente reativado!')
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie sua carteira de clientes ativos e histórico de contratos</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowNew(true)}
          className="shrink-0 text-white"
          style={{ backgroundColor: '#0089ac' }}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Novo Cliente
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-fg4" />
            <Input
              placeholder="Buscar por nome ou empresa…"
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Status pill tabs */}
          <div className="flex items-center gap-1 bg-[var(--alpha-bg-xs)] p-1 rounded-lg flex-wrap">
            {STATUS_TABS.map(tab => {
              const count = tab.value === 'todos'
                ? (clientes?.length ?? 0)
                : (clientes?.filter(c => c.status === tab.value).length ?? 0)
              const isActive = statusFilter === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => handleStatusTabClick(tab.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
                    isActive ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-fg2'
                  )}
                >
                  {tab.label}
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums',
                    isActive ? 'text-white' : 'bg-[var(--alpha-border)] text-muted-foreground'
                  )} style={isActive ? { backgroundColor: '#0089ac' } : {}}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tipo de serviço filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4">Tipo:</span>
          {TIPO_TABS.map(tab => {
            const count = tab.value === 'todos'
              ? (clientes?.length ?? 0)
              : (clientes?.filter(c => getTipoServico(c) === tab.value).length ?? 0)
            const isActive = tipoFilter === tab.value
            const accentColor = tab.value === 'assessoria' ? '#06b6d4' : tab.value === 'consultoria' ? '#8b5cf6' : tab.value === 'ambos' ? '#10b981' : tab.value === 'sem_contrato' ? '#6b7280' : '#0089ac'
            return (
              <button
                key={tab.value}
                onClick={() => setTipoFilter(tab.value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border"
                style={isActive
                  ? { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55`, color: accentColor }
                  : { backgroundColor: 'transparent', borderColor: 'var(--alpha-bg-md)', color: 'var(--text-soft-a)' }
                }
              >
                {tab.label}
                <span className="tabular-nums text-[10px]">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Health filter + Segmento + Sort */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Health */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4">Saúde:</span>
            {HEALTH_FILTER_TABS.map(tab => {
              const count = tab.value === 'todos'
                ? (clientes?.length ?? 0)
                : (clientes?.filter(c => getClientHealth(c).level === tab.value).length ?? 0)
              const isActive = healthFilter === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setHealthFilter(tab.value)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border"
                  style={isActive
                    ? { backgroundColor: `${tab.dot}22`, borderColor: `${tab.dot}55`, color: tab.text }
                    : { backgroundColor: 'transparent', borderColor: 'var(--alpha-bg-md)', color: 'var(--text-soft-a)' }
                  }
                >
                  {tab.value !== 'todos' && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tab.dot }} />
                  )}
                  {tab.label}
                  <span className="tabular-nums text-[10px]">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Segmento select */}
          <select
            value={segmentoFilter}
            onChange={e => setSegmentoFilter(e.target.value)}
            className="h-7 px-2.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[rgba(0,137,172,0.40)]"
            style={{ background: 'var(--alpha-bg-xs)', borderColor: 'var(--alpha-border-md)', color: 'var(--text-soft-a)' }}
          >
            <option value="todos">Todos os segmentos</option>
            {SEGMENTS.map(s => {
              const count = clientes?.filter(c => c.segmento === s.value).length ?? 0
              return <option key={s.value} value={s.value}>{s.label} ({count})</option>
            })}
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-fg4" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as ClienteSort)}
              className="h-7 px-2.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[rgba(0,137,172,0.40)]"
              style={{ background: 'var(--alpha-bg-xs)', borderColor: 'var(--alpha-border-md)', color: 'var(--text-soft-a)' }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Em Renovação banner ── */}
      {statusFilter === 'em_renovacao' && !isLoading && filtered.length > 0 && (() => {
        const criticos = filtered.filter(c => getUrgencyLevel(getDaysUntilExpiry(getNextExpiry(c.contratos))) === 'critico').length
        const atencao  = filtered.filter(c => getUrgencyLevel(getDaysUntilExpiry(getNextExpiry(c.contratos))) === 'atencao').length
        const mrrTotal = filtered.reduce((sum, c) => sum + (c.contratos?.filter(x => x.status === 'ativo').reduce((s, x) => s + (x.valor_mensal ?? 0), 0) ?? 0), 0)
        return (
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">Janela de Renovação</span>
              </div>
              {mrrTotal > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400/70">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span className="font-semibold text-amber-300">{formatCurrency(mrrTotal)}/mês</span>
                  <span>em MRR sob risco</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 flex-wrap text-xs">
              {criticos > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {criticos} crítico{criticos !== 1 ? 's' : ''} — vence em &lt;30 dias
                </span>
              )}
              {atencao > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {atencao} atenção — 30–60 dias
                </span>
              )}
              {filtered.length - criticos - atencao > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(16,185,129,0.10)', color: '#34d399' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {filtered.length - criticos - atencao} em tempo — +60 dias
                </span>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Encerrados banner ── */}
      {statusFilter === 'encerrado' && !isLoading && filtered.length > 0 && (() => {
        const recent90 = filtered.filter(c => {
          const last = getNextExpiry(c.contratos) // use last contract date as proxy
          if (!last) return false
          return (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24) <= 90
        }).length
        const totalHistorico = filtered.reduce((sum, c) =>
          sum + (c.contratos?.reduce((s, x) => s + (x.valor_total ?? 0), 0) ?? 0), 0)
        return (
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.20)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-300">Ex-clientes — Oportunidades de Win-back</span>
              </div>
              {totalHistorico > 0 && (
                <span className="text-xs text-slate-400">
                  {formatCurrency(totalHistorico)} em valor histórico
                </span>
              )}
            </div>
            <div className="flex gap-3 flex-wrap text-xs">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(239,68,68,0.10)', color: '#fca5a5' }}>
                {recent90} encerrado{recent90 !== 1 ? 's' : ''} nos últimos 90 dias
              </span>
              <span className="text-slate-500 flex items-center">
                Use "Win-back" para criar uma oportunidade de reengajamento
              </span>
            </div>
          </div>
        )
      })()}

      {/* ── List ── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <ClienteCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={search ? 'Nenhum resultado encontrado' : 'Nenhum cliente cadastrado ainda'}
          description={
            search
              ? `Não encontramos clientes para "${search}". Tente outros termos ou limpe a busca.`
              : 'Adicione seu primeiro cliente e comece a gerenciar contratos e oportunidades.'
          }
          action={!search ? { label: '+ Novo Cliente', onClick: () => setShowNew(true) } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(cliente => {
            const nextExpiry     = getNextExpiry(cliente.contratos)
            const daysLeft       = nextExpiry ? getDaysUntilExpiry(nextExpiry) : null
            const isExpiringSoon = daysLeft !== null && daysLeft <= 60 && daysLeft >= 0
            const isConfirming   = false  // Inline confirm removed — DeleteConfirmDialog handles it
            const health         = getClientHealth(cliente)
            const hs             = HEALTH_STYLES[health.level]
            const refCount       = indicacoes.filter(i => i.indicante_cliente_id === cliente.id).length
            const nivel          = getNivelPertencimento(cliente, refCount)
            const nivelInfo      = NIVEL_LABELS[nivel]

            const urgency        = getUrgencyLevel(daysLeft)
            const urgencyCfg     = URGENCY_CONFIG[urgency]
            const mrrAtivo       = cliente.contratos?.filter(c => c.status === 'ativo').reduce((s, c) => s + (c.valor_mensal ?? 0), 0) ?? 0
            const totalHistorico = cliente.contratos?.reduce((s, c) => s + (c.valor_total ?? 0), 0) ?? 0
            const lastContrato   = cliente.contratos?.filter(c => c.data_fim).sort((a, b) => new Date(b.data_fim!).getTime() - new Date(a.data_fim!).getTime())[0]
            const daysSinceEnd   = lastContrato?.data_fim ? Math.floor((Date.now() - new Date(lastContrato.data_fim).getTime()) / 86400000) : null

            return (
              <div
                key={cliente.id}
                className="bg-card rounded-xl p-4 cursor-pointer transition-all group"
                style={isConfirming
                  ? { border: '1px solid rgba(239,68,68,0.30)', background: 'rgba(239,68,68,0.05)' }
                  : cliente.status === 'em_renovacao'
                  ? { border: `1px solid ${urgencyCfg.border}`, background: urgencyCfg.bg }
                  : { border: '1px solid var(--alpha-border)' }}
                onClick={() => { if (!isConfirming) navigate(`/clientes/${cliente.id}`) }}
              >
                <div className="flex items-center gap-4">

                  {/* Initials avatar */}
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold select-none',
                    getAvatarClass(cliente.nome)
                  )}>
                    {getInitials(cliente.nome)}
                  </div>

                  {/* Name + company */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{cliente.nome}</p>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', getStatusColor(cliente.status))}>
                        {CLIENT_STATUS_OPTIONS.find(s => s.value === cliente.status)?.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {cliente.empresa} · {getSegmentLabel(cliente.segmento)}
                    </p>
                  </div>

                  {/* Right side */}
                  {(
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Health Score indicator */}
                      <div className="flex items-center gap-1.5" title={health.text}>
                        <span className={cn('w-2 h-2 rounded-full shrink-0 animate-pulse', hs.dot, health.level !== 'green' && 'animate-none')} style={health.level === 'green' ? { animation: 'none' } : {}} />
                        <span className={cn('text-xs font-medium hidden sm:block', hs.label)}>{health.text}</span>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-2 mb-0.5">
                          <span className={cn('text-[10px] font-medium', nivelInfo.color)}>Nv.{nivel} {nivelInfo.label}</span>
                          {cliente.nps_score !== null && cliente.nps_score !== undefined && (
                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', cliente.nps_score >= 9 ? 'bg-emerald-500/15 text-emerald-400' : cliente.nps_score >= 7 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400')}>
                              NPS {cliente.nps_score}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {cliente.contratos?.length || 0} contrato{(cliente.contratos?.length || 0) !== 1 ? 's' : ''}
                        </p>
                        {nextExpiry && (
                          <div className={cn(
                            'flex items-center justify-end gap-1 text-xs mt-0.5',
                            isExpiringSoon ? 'text-orange-600 font-medium' : 'text-fg4'
                          )}>
                            {isExpiringSoon && <AlertCircle className="w-3 h-3" />}
                            {daysLeft === 0
                              ? 'Vence hoje'
                              : daysLeft && daysLeft < 0
                              ? 'Vencido'
                              : `Vence em ${daysLeft}d`}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(cliente.id) }}
                        className="p-1.5 rounded-lg text-fg4 hover:bg-[rgba(239,68,68,0.12)] hover:text-[#f87171] transition-colors opacity-0 group-hover:opacity-100"
                        title="Excluir cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Em Renovação actions ── */}
                {cliente.status === 'em_renovacao' && !isConfirming && (
                  <div className="mt-3 pt-3 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid var(--alpha-bg-sm)' }} onClick={e => e.stopPropagation()}>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium mr-1" style={{ background: urgencyCfg.bg, color: urgencyCfg.text, border: `1px solid ${urgencyCfg.border}` }}>
                      {urgencyCfg.label} {daysLeft !== null && daysLeft >= 0 ? `— ${daysLeft}d restantes` : daysLeft !== null && daysLeft < 0 ? '— vencido' : ''}
                    </span>
                    {mrrAtivo > 0 && <span className="text-xs text-muted-foreground">{formatCurrency(mrrAtivo)}/mês em risco</span>}
                    <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                      <button
                        onClick={e => handleCriarProposta(e, cliente)}
                        disabled={createOportunidade.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors text-white"
                        style={{ backgroundColor: '#0089ac' }}
                      >
                        <TrendingUp className="w-3 h-3" />Proposta de Renovação
                      </button>
                      <button
                        onClick={e => handleMarcarRenovado(e, cliente.id)}
                        disabled={updateCliente.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border"
                        style={{ borderColor: 'rgba(16,185,129,0.40)', color: '#34d399', background: 'rgba(16,185,129,0.08)' }}
                      >
                        <CheckCircle2 className="w-3 h-3" />Renovado
                      </button>
                      <button
                        onClick={e => handleNaoRenovou(e, cliente.id)}
                        disabled={updateCliente.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border"
                        style={{ borderColor: 'rgba(239,68,68,0.30)', color: '#f87171', background: 'rgba(239,68,68,0.06)' }}
                      >
                        <XCircle className="w-3 h-3" />Não Renovou
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Encerrado actions ── */}
                {cliente.status === 'encerrado' && !isConfirming && (
                  <div className="mt-3 pt-3 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--alpha-bg-sm)' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      {daysSinceEnd !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Encerrado há {daysSinceEnd < 30 ? `${daysSinceEnd}d` : daysSinceEnd < 365 ? `${Math.floor(daysSinceEnd / 30)}m` : `${Math.floor(daysSinceEnd / 365)}a`}
                        </span>
                      )}
                      {totalHistorico > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {formatCurrency(totalHistorico)} histórico
                        </span>
                      )}
                      <span>{cliente.contratos?.length ?? 0} contrato{(cliente.contratos?.length ?? 0) !== 1 ? 's' : ''} no total</span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        onClick={e => handleWinBack(e, cliente)}
                        disabled={createOportunidade.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors text-white"
                        style={{ backgroundColor: '#7c3aed' }}
                      >
                        <TrendingUp className="w-3 h-3" />Win-back
                      </button>
                      <button
                        onClick={e => handleReativar(e, cliente.id)}
                        disabled={updateCliente.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border"
                        style={{ borderColor: 'rgba(16,185,129,0.40)', color: '#34d399', background: 'rgba(16,185,129,0.08)' }}
                      >
                        <RefreshCw className="w-3 h-3" />Reativar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <NewClienteModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => navigate(`/clientes/${id}`)}
      />

      <DeleteConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        entidadeTipo="cliente"
        entidadeId={deleteConfirm}
        entidadeLabel={clienteToDelete ? `${clienteToDelete.nome} (${clienteToDelete.empresa})` : ''}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
