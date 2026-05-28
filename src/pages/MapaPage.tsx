import { useState, useMemo } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { useLeads } from '@/hooks/useLeads'
import { useClientes } from '@/hooks/useClientes'
import { ESTADOS_BR, TERMINAL_WON_STAGES, TERMINAL_LOST_STAGES } from '@/lib/constants'
import { MapPin, Users, TrendingUp, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Public Brazil states GeoJSON
const BRAZIL_GEO_URL =
  'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson'

type FilterMode = 'todos' | 'leads' | 'clientes'

const ESTADO_NOME: Record<string, string> = Object.fromEntries(
  ESTADOS_BR.map(s => [s.uf, s.nome])
)

// ─── Color scale ──────────────────────────────────────────────────────────────
function stateColor(count: number, mode: FilterMode): string {
  if (count === 0) return 'var(--alpha-bg-xs)'
  if (mode === 'clientes') {
    if (count >= 5) return 'var(--emerald-mid)'
    if (count >= 3) return 'rgba(52,211,153,0.55)'
    if (count >= 2) return 'rgba(52,211,153,0.38)'
    return 'rgba(52,211,153,0.22)'
  }
  if (mode === 'leads') {
    if (count >= 8) return 'rgba(0,137,172,0.85)'
    if (count >= 5) return 'rgba(0,137,172,0.65)'
    if (count >= 3) return 'rgba(0,137,172,0.45)'
    if (count >= 1) return 'rgba(0,137,172,0.28)'
    return 'var(--alpha-bg-xs)'
  }
  // todos — mix both
  if (count >= 10) return 'var(--cyan-hi)'
  if (count >= 6)  return 'var(--cyan-mid)'
  if (count >= 3)  return 'rgba(107,208,231,0.40)'
  if (count >= 1)  return 'rgba(107,208,231,0.22)'
  return 'var(--alpha-bg-xs)'
}

export function MapaPage() {
  const navigate = useNavigate()
  const { data: leads = [] } = useLeads()
  const { data: clientes = [] } = useClientes()

  const [mode, setMode] = useState<FilterMode>('todos')
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)

  // Aggregate counts per state
  const leadsByState = useMemo(() => {
    const map: Record<string, typeof leads> = {}
    for (const l of leads) {
      if (l.estado) {
        if (!map[l.estado]) map[l.estado] = []
        map[l.estado].push(l)
      }
    }
    return map
  }, [leads])

  const clientesByState = useMemo(() => {
    const map: Record<string, typeof clientes> = {}
    for (const c of clientes) {
      if (c.estado) {
        if (!map[c.estado]) map[c.estado] = []
        map[c.estado].push(c)
      }
    }
    return map
  }, [clientes])

  // Leads ativos (non-terminal)
  const activeLeadsByState = useMemo(() => {
    const terminal = [...TERMINAL_WON_STAGES, ...TERMINAL_LOST_STAGES] as string[]
    const map: Record<string, number> = {}
    for (const [uf, ls] of Object.entries(leadsByState)) {
      map[uf] = ls.filter(l => !terminal.includes(l.status)).length
    }
    return map
  }, [leadsByState])

  // Won clients by state
  const wonClientsByState = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [uf, cs] of Object.entries(clientesByState)) {
      map[uf] = cs.filter(c => c.status !== 'encerrado').length
    }
    return map
  }, [clientesByState])

  function getCount(uf: string): number {
    if (mode === 'leads') return activeLeadsByState[uf] ?? 0
    if (mode === 'clientes') return wonClientsByState[uf] ?? 0
    return (activeLeadsByState[uf] ?? 0) + (wonClientsByState[uf] ?? 0)
  }

  // Top states list
  const topStates = useMemo(() => {
    return ESTADOS_BR
      .map(s => ({
        uf: s.uf,
        nome: s.nome,
        leads: activeLeadsByState[s.uf] ?? 0,
        clientes: wonClientsByState[s.uf] ?? 0,
        total: (activeLeadsByState[s.uf] ?? 0) + (wonClientsByState[s.uf] ?? 0),
      }))
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [activeLeadsByState, wonClientsByState])

  // Selected state items
  const selectedLeads = selected ? (leadsByState[selected] ?? []).filter(l => {
    const terminal = [...TERMINAL_WON_STAGES, ...TERMINAL_LOST_STAGES] as string[]
    return !terminal.includes(l.status)
  }) : []
  const selectedClientes = selected ? (clientesByState[selected] ?? []).filter(c => c.status !== 'encerrado') : []

  const totalLeadsWithEstado = leads.filter(l => l.estado).length
  const totalClientesWithEstado = clientes.filter(c => c.estado).length
  const totalLeads = leads.filter(l => {
    const terminal = [...TERMINAL_WON_STAGES, ...TERMINAL_LOST_STAGES] as string[]
    return !terminal.includes(l.status)
  }).length

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-80px)]">

      {/* ─── Left panel ─── */}
      <div className="w-full md:w-72 shrink-0 flex flex-col gap-3 md:overflow-y-auto pb-4">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Mapa de Alcance</h1>
          <p className="text-xs text-fg4 mt-0.5">Leads e clientes por estado</p>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border)' }}>
          {([['todos', 'Todos'], ['leads', 'Leads'], ['clientes', 'Clientes']] as [FilterMode, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all"
              style={mode === v
                ? { background: 'rgba(0,137,172,0.25)', color: '#6bd0e7', border: '1px solid rgba(0,137,172,0.40)' }
                : { color: 'var(--text-soft-a)', border: '1px solid transparent' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3" style={{ background: 'rgba(0,137,172,0.08)', border: '1px solid rgba(0,137,172,0.18)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: '#6bd0e7' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cyan-mid)' }}>Leads ativos</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#6bd0e7' }}>{totalLeads}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--cyan-lo)' }}>{totalLeadsWithEstado} mapeados</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(52,211,153,0.60)' }}>Clientes</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#34d399' }}>{clientes.length}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(52,211,153,0.50)' }}>{totalClientesWithEstado} mapeados</p>
          </div>
        </div>

        {/* Top states */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--alpha-border)' }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'var(--alpha-bg-xs)', borderBottom: '1px solid var(--alpha-bg-sm)' }}>
            <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--cyan-mid)' }} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estados com presença</span>
          </div>
          {topStates.length === 0 ? (
            <p className="text-xs text-fg4 p-4 text-center">Nenhum lead/cliente com estado cadastrado ainda.</p>
          ) : (
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {topStates.map(s => (
                <button
                  key={s.uf}
                  onClick={() => setSelected(selected === s.uf ? null : s.uf)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: selected === s.uf ? 'rgba(0,137,172,0.12)' : 'transparent',
                    borderBottom: '1px solid var(--alpha-bg-sm)',
                  }}
                  onMouseEnter={e => { if (selected !== s.uf) (e.currentTarget as HTMLElement).style.background = 'var(--alpha-bg-xs)' }}
                  onMouseLeave={e => { if (selected !== s.uf) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: selected === s.uf ? 'rgba(0,137,172,0.25)' : 'var(--alpha-border)', color: selected === s.uf ? '#6bd0e7' : 'var(--text-soft-a)' }}>
                    {s.uf}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-fg2 truncate">{s.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.leads > 0 && <span className="text-[10px]" style={{ color: 'rgba(107,208,231,0.70)' }}>{s.leads} lead{s.leads > 1 ? 's' : ''}</span>}
                      {s.clientes > 0 && <span className="text-[10px]" style={{ color: 'var(--emerald-lo)' }}>{s.clientes} cliente{s.clientes > 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'rgba(100,120,140,0.40)' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected state detail */}
        {selected && (selectedLeads.length > 0 || selectedClientes.length > 0) && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(0,137,172,0.06)', border: '1px solid rgba(0,137,172,0.20)' }}>
            <p className="text-xs font-semibold" style={{ color: '#6bd0e7' }}>{ESTADO_NOME[selected] || selected}</p>
            {selectedLeads.map(l => (
              <button key={l.id} onClick={() => navigate(`/leads/${l.id}`)}
                className="w-full text-left px-2.5 py-2 rounded-lg transition-colors"
                style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,137,172,0.12)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--alpha-bg-xs)'}>
                <p className="text-xs font-medium text-fg2 truncate">{l.nome}</p>
                <p className="text-[10px] text-fg4 truncate">{l.empresa}</p>
              </button>
            ))}
            {selectedClientes.map(c => (
              <button key={c.id} onClick={() => navigate(`/clientes/${c.id}`)}
                className="w-full text-left px-2.5 py-2 rounded-lg transition-colors"
                style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.20)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.14)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.07)'}>
                <p className="text-xs font-medium text-fg2 truncate">{c.nome}</p>
                <p className="text-[10px] truncate" style={{ color: 'rgba(52,211,153,0.60)' }}>{c.empresa} · cliente</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Map panel ─── */}
      <div className="flex-1 rounded-2xl relative overflow-hidden min-h-[60vh] md:min-h-0" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-bg-sm)' }}>

        {/* Legend */}
        <div className="absolute top-3 right-3 z-10 rounded-xl px-3 py-2 text-[10px]"
          style={{ background: 'rgba(10,22,40,0.85)', border: '1px solid var(--alpha-bg-md)', backdropFilter: 'blur(8px)' }}>
          <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Legenda</p>
          <div className="space-y-1">
            {[
              { color: 'var(--alpha-bg-xs)', label: 'Sem dados', border: '1px solid var(--alpha-border-md)' },
              { color: mode === 'clientes' ? 'rgba(52,211,153,0.22)' : 'rgba(0,137,172,0.28)', label: '1–2' },
              { color: mode === 'clientes' ? 'rgba(52,211,153,0.55)' : 'rgba(0,137,172,0.55)', label: '3–5' },
              { color: mode === 'clientes' ? 'var(--emerald-mid)' : 'rgba(0,137,172,0.85)', label: '6+' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: item.color, border: item.border ?? '1px solid var(--alpha-bg-lg)' }} />
                <span className="text-[rgba(130,150,170,0.70)]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hover tooltip */}
        {hovered && tooltip && (
          <div
            className="absolute z-20 pointer-events-none rounded-xl px-3 py-2 text-xs"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 10,
              background: 'rgba(10,22,40,0.95)',
              border: '1px solid rgba(107,208,231,0.25)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              transform: tooltip.x > window.innerWidth * 0.7 ? 'translateX(-110%)' : 'none',
            }}
          >
            <p className="font-semibold text-foreground">{ESTADO_NOME[hovered] || hovered} <span className="text-fg4 font-normal">· {hovered}</span></p>
            <div className="flex gap-3 mt-1">
              <span style={{ color: '#6bd0e7' }}>
                {activeLeadsByState[hovered] ?? 0} lead{(activeLeadsByState[hovered] ?? 0) !== 1 ? 's' : ''}
              </span>
              <span style={{ color: '#34d399' }}>
                {wonClientsByState[hovered] ?? 0} cliente{(wonClientsByState[hovered] ?? 0) !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 750, center: [-54, -15] }}
          style={{ width: '100%', height: '100%' }}
        >
          <ZoomableGroup center={[0, 0]} zoom={1}>
            <Geographies geography={BRAZIL_GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo: any) => {
                  const uf: string = geo.properties.sigla ?? geo.properties.SIGLA ?? geo.properties.abbrev ?? ''
                  const count = getCount(uf)
                  const isHovered = hovered === uf
                  const isSelected = selected === uf

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={(e: React.MouseEvent) => {
                        setHovered(uf)
                        setTooltip({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseMove={(e: React.MouseEvent) => {
                        setTooltip({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseLeave={() => {
                        setHovered(null)
                        setTooltip(null)
                      }}
                      onClick={() => setSelected(selected === uf ? null : uf)}
                      style={{
                        default: {
                          fill: isSelected
                            ? 'rgba(0,137,172,0.65)'
                            : stateColor(count, mode),
                          stroke: isSelected
                            ? 'var(--cyan-hi)'
                            : isHovered
                            ? 'var(--cyan-lo)'
                            : 'var(--alpha-bg-lg)',
                          strokeWidth: isSelected ? 1.5 : isHovered ? 1 : 0.5,
                          outline: 'none',
                          cursor: 'pointer',
                          transition: 'fill 0.15s, stroke 0.15s',
                        },
                        hover: {
                          fill: isSelected
                            ? 'rgba(0,137,172,0.72)'
                            : count > 0
                            ? stateColor(count, mode).replace(')', ', 1.0)').replace('rgba', 'rgba')
                            : 'var(--alpha-bg-md)',
                          stroke: 'var(--cyan-lo)',
                          strokeWidth: 1,
                          outline: 'none',
                          cursor: 'pointer',
                        },
                        pressed: {
                          fill: 'rgba(0,137,172,0.65)',
                          outline: 'none',
                        },
                      }}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Empty state hint */}
        {topStates.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center px-8">
              <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(100,120,140,0.30)' }} />
              <p className="text-sm font-medium text-[rgba(130,150,170,0.50)]">Nenhum lead ou cliente com estado cadastrado</p>
              <p className="text-xs mt-1 text-[rgba(100,120,140,0.35)]">Adicione o campo "Estado (UF)" ao criar ou editar um lead</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
