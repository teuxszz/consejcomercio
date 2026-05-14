import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLeads } from '@/hooks/useLeads'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { KanbanBoard } from '@/components/leads/KanbanBoard'
import { LEAD_SOURCES, SEGMENTS } from '@/lib/constants'
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

export function LeadsPage() {
  const { data: leads, isLoading } = useLeads()
  const { data: meuPerfil } = useMeuPerfil()
  const [searchParams, setSearchParams] = useSearchParams()
  const [scope, setScope]             = useState<Scope>('all')
  const [search, setSearch]           = useState('')
  const [period, setPeriod]           = useState<PeriodValue>({ year: getCurrentYear(), granularity: 'total' })
  const range = useMemo(() => getPeriodRange(period), [period])
  const isHistorical = !isCurrentCycle(period)
  const origemFilter = searchParams.get('canal') ?? 'todos'
  const setOrigemFilter = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'todos') next.delete('canal')
    else next.set('canal', value)
    setSearchParams(next, { replace: true })
  }
  const [segmentoFilter, setSegmentoFilter] = useState('todos')

  const mineCount = useMemo(() => (meuPerfil?.id ? leads?.filter(l => l.responsavel_id === meuPerfil.id).length ?? 0 : 0), [leads, meuPerfil])
  const allCount  = leads?.length ?? 0

  const filteredLeads = useMemo(() => {
    if (!leads) return []
    return leads.filter(l => {
      const matchPeriod    = isInRange(l.created_at, range)
      const matchScope     = scope === 'all' || (meuPerfil?.id && l.responsavel_id === meuPerfil.id)
      const matchSearch    = !search || l.nome.toLowerCase().includes(search.toLowerCase()) || (l.empresa ?? '').toLowerCase().includes(search.toLowerCase())
      const matchOrigem    = origemFilter === 'todos' || l.origem === origemFilter
      const matchSegmento  = segmentoFilter === 'todos' || l.segmento === segmentoFilter
      return matchPeriod && matchScope && matchSearch && matchOrigem && matchSegmento
    })
  }, [leads, range, scope, meuPerfil, search, origemFilter, segmentoFilter])

  const hasFilter = search || origemFilter !== 'todos' || segmentoFilter !== 'todos' || scope !== 'all'

  const selectStyle = {
    background: 'var(--alpha-bg-xs)',
    borderColor: 'var(--alpha-border-md)',
    color: 'rgba(150,165,180,0.85)',
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
            onChange={e => setOrigemFilter(e.target.value)}
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
            onChange={e => setSegmentoFilter(e.target.value)}
            className="h-8 px-2.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[rgba(0,137,172,0.40)]"
            style={selectStyle}
          >
            <option value="todos">Todos os segmentos</option>
            {SEGMENTS.map(s => {
              const count = leads?.filter(l => l.segmento === s.value).length ?? 0
              return <option key={s.value} value={s.value}>{s.label} ({count})</option>
            })}
          </select>

          {/* Clear */}
          {hasFilter && (
            <button
              onClick={() => { setSearch(''); setOrigemFilter('todos'); setSegmentoFilter('todos'); setScope('all') }}
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
