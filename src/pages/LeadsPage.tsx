import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLeads } from '@/hooks/useLeads'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { KanbanBoard } from '@/components/leads/KanbanBoard'
import { LEAD_SOURCES, SEGMENTS, BUDGET_OPTIONS, TERMINAL_WON_STAGES, TERMINAL_STAGES } from '@/lib/constants'
import { X, History } from 'lucide-react'
import { SearchInput } from '@/components/ui/search-input'
import { ScopeToggle, type Scope } from '@/components/shared/ScopeToggle'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import {
  getCurrentYear,
  getPeriodRange,
  isInRange,
  isCurrentCycle,
  formatPeriodLabel,
  type PeriodValue,
} from '@/lib/periods'

// status especial: 'ganho' = ambos ganho_*; 'terminal' = ganho + perdido + cancelado
function matchesStatus(leadStatus: string, statusFilter: string): boolean {
  if (statusFilter === 'todos') return true
  if (statusFilter === 'ganho')    return (TERMINAL_WON_STAGES as readonly string[]).includes(leadStatus)
  if (statusFilter === 'terminal') return (TERMINAL_STAGES as readonly string[]).includes(leadStatus)
  return leadStatus === statusFilter
}

// servico: lead casa se servicos_interesse inclui o id OU está vazio (atribuível a todos)
function matchesServico(servicosInteresse: string[] | undefined | null, servicoFilter: string): boolean {
  if (servicoFilter === 'todos') return true
  const list = servicosInteresse ?? []
  return list.length === 0 || list.includes(servicoFilter)
}

export function LeadsPage() {
  const { data: leads, isLoading } = useLeads()
  const { data: meuPerfil } = useMeuPerfil()
  const { data: config } = useConfiguracoes()
  const [searchParams, setSearchParams] = useSearchParams()
  const [scope, setScope]             = useState<Scope>('all')
  const [search, setSearch]           = useState('')
  const [period, setPeriod]           = useState<PeriodValue>({ year: getCurrentYear(), granularity: 'total' })
  const range = useMemo(() => getPeriodRange(period), [period])
  const isHistorical = !isCurrentCycle(period)

  // URL filters (persistentes / bookmarkable) — usados pra drill-down via /leads?status=ganho&segmento=...
  const origemFilter       = searchParams.get('canal')        ?? 'todos'
  const segmentoFilter     = searchParams.get('segmento')     ?? 'todos'
  const statusFilter       = searchParams.get('status')       ?? 'todos'
  const investimentoFilter = searchParams.get('investimento') ?? 'todos'
  const servicoFilter      = searchParams.get('servico')      ?? 'todos'

  function setFilter(name: string, value: string, defaultValue = 'todos') {
    const next = new URLSearchParams(searchParams)
    if (value === defaultValue) next.delete(name)
    else next.set(name, value)
    setSearchParams(next, { replace: true })
  }

  const mineCount = useMemo(
    () => (meuPerfil?.id ? leads?.filter(l => l.responsavel_id === meuPerfil.id).length ?? 0 : 0),
    [leads, meuPerfil],
  )
  const allCount  = leads?.length ?? 0

  // Para drill-down de "ganho/terminal", o filtro de período passa a usar updated_at
  // (data da conversão), alinhado com a engine do ICP. Para leads ativos seguimos
  // com created_at (data de entrada no funil). Isso evita o caso de clicar em
  // "ganho em Q2" e ver vazio porque o lead foi criado em Q1.
  const periodField: 'created_at' | 'updated_at' =
    statusFilter === 'ganho' || statusFilter === 'terminal' ? 'updated_at' : 'created_at'

  const filteredLeads = useMemo(() => {
    if (!leads) return []
    return leads.filter(l => {
      const matchPeriod       = isInRange(l[periodField], range)
      const matchScope        = scope === 'all' || (meuPerfil?.id && l.responsavel_id === meuPerfil.id)
      const matchSearch       = !search
        || l.nome.toLowerCase().includes(search.toLowerCase())
        || (l.empresa ?? '').toLowerCase().includes(search.toLowerCase())
      const matchOrigem       = origemFilter   === 'todos' || l.origem === origemFilter
      const matchSegmento     = segmentoFilter === 'todos' || l.segmento === segmentoFilter
      const matchStatus       = matchesStatus(l.status, statusFilter)
      const matchInvestimento = investimentoFilter === 'todos' || l.investimento_estimado === investimentoFilter
      const matchServico      = matchesServico(l.servicos_interesse, servicoFilter)
      return matchPeriod && matchScope && matchSearch
        && matchOrigem && matchSegmento && matchStatus && matchInvestimento && matchServico
    })
  }, [leads, range, periodField, scope, meuPerfil, search,
      origemFilter, segmentoFilter, statusFilter, investimentoFilter, servicoFilter])

  const hasUrlFilter = origemFilter !== 'todos' || segmentoFilter !== 'todos'
    || statusFilter !== 'todos' || investimentoFilter !== 'todos' || servicoFilter !== 'todos'
  const hasLocalFilter = !!search || scope !== 'all'
  const hasFilter = hasUrlFilter || hasLocalFilter

  const selectStyle = {
    background: 'var(--alpha-bg-xs)',
    borderColor: 'var(--alpha-border-md)',
    color: 'rgba(150,165,180,0.85)',
  }

  const servicoLabel = useMemo(
    () => config?.servicos?.find(s => s.id === servicoFilter)?.nome ?? servicoFilter,
    [config, servicoFilter],
  )

  function clearAllFilters() {
    setSearch(''); setScope('all')
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando leads...</div>
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] gap-3">

      {/* Header + filtros */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">Pipeline de Leads</h1>
              <span className="text-sm text-fg2">— {formatPeriodLabel(period)}</span>
              {isHistorical && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <History className="w-3 h-3" />
                  Histórico
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Arraste os cards entre as colunas para avançar leads no funil
              {hasFilter && (
                <span className="ml-2 font-medium" style={{ color: '#0089ac' }}>
                  — {filteredLeads.length} de {leads?.length ?? 0} leads
                </span>
              )}
            </p>
          </div>
          <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={leads ?? []} />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope: minhas/todas */}
          <ScopeToggle value={scope} onChange={setScope} mineCount={mineCount} allCount={allCount} />

          {/* Search */}
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar lead…" className="w-48" />

          {/* Origem */}
          <select
            value={origemFilter}
            onChange={e => setFilter('canal', e.target.value)}
            className="h-8 px-2.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[rgba(0,137,172,0.40)]"
            style={selectStyle}
          >
            <option value="todos">Todos os canais</option>
            {LEAD_SOURCES.map(s => {
              const count = leads?.filter(l => l.origem === s.value).length ?? 0
              return <option key={s.value} value={s.value}>{s.label} ({count})</option>
            })}
          </select>

          {/* Segmento */}
          <select
            value={segmentoFilter}
            onChange={e => setFilter('segmento', e.target.value)}
            className="h-8 px-2.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[rgba(0,137,172,0.40)]"
            style={selectStyle}
          >
            <option value="todos">Todos os segmentos</option>
            {SEGMENTS.map(s => {
              const count = leads?.filter(l => l.segmento === s.value).length ?? 0
              return <option key={s.value} value={s.value}>{s.label} ({count})</option>
            })}
          </select>

          {/* Chips pra filtros vindos via URL que não têm select dedicado */}
          {statusFilter !== 'todos' && (
            <FilterChip
              label={
                statusFilter === 'ganho'    ? 'Status: Ganho'
                : statusFilter === 'terminal' ? 'Status: Fechado'
                : `Status: ${statusFilter}`
              }
              onRemove={() => setFilter('status', 'todos')}
            />
          )}
          {investimentoFilter !== 'todos' && (
            <FilterChip
              label={`Investimento: ${BUDGET_OPTIONS.find(b => b.value === investimentoFilter)?.label ?? investimentoFilter}`}
              onRemove={() => setFilter('investimento', 'todos')}
            />
          )}
          {servicoFilter !== 'todos' && (
            <FilterChip
              label={`Serviço: ${servicoLabel}`}
              onRemove={() => setFilter('servico', 'todos')}
            />
          )}

          {/* Clear */}
          {hasFilter && (
            <button
              onClick={clearAllFilters}
              className="h-8 px-2.5 flex items-center gap-1 text-xs rounded-lg border transition-colors text-muted-foreground hover:text-white hover:border-[var(--alpha-bg-lg)]"
              style={{ borderColor: 'var(--alpha-bg-md)' }}
            >
              <X className="w-3 h-3" />Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 min-h-0">
        <KanbanBoard leads={filteredLeads} />
      </div>
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border"
      style={{
        background: 'rgba(0,137,172,0.10)',
        borderColor: 'rgba(0,137,172,0.30)',
        color: '#6bd0e7',
      }}
    >
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 opacity-70 hover:opacity-100"
        aria-label="Remover filtro"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}
