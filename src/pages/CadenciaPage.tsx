import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Clock, Calendar, Filter } from 'lucide-react'
import { useLeads } from '@/hooks/useLeads'
import { useInteracoes } from '@/hooks/useInteracoes'
import { usePerfis } from '@/hooks/usePerfis'
import { getCadenciaDueToday, CADENCIA_DIAS, daysSinceLastTouch, type CadenciaPoint } from '@/lib/cadencia'
import { PIPELINE_STAGES, TERMINAL_STAGES } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Lead, InteracaoLead } from '@/types'

type DueRow = {
  lead: Lead
  point: CadenciaPoint
  lastInteracao: InteracaoLead | null
  daysSince: number
}

function stageLabel(id: string): string {
  return PIPELINE_STAGES.find(s => s.id === id)?.label ?? id
}

export function CadenciaPage() {
  const navigate = useNavigate()
  const { data: leads = [], isLoading: loadingLeads } = useLeads()
  const { data: interacoes = [], isLoading: loadingInter } = useInteracoes()
  const { data: perfis = [] } = usePerfis()

  const [responsavelFilter, setResponsavelFilter] = useState<string>('all')
  const [diaFilter, setDiaFilter] = useState<string>('all')

  const dueRows: DueRow[] = useMemo(() => {
    const rows: DueRow[] = []
    for (const lead of leads) {
      if ((TERMINAL_STAGES as readonly string[]).includes(lead.status)) continue
      const leadInter = interacoes.filter(i => i.lead_id === lead.id)
      const point = getCadenciaDueToday(lead, leadInter)
      if (!point) continue
      rows.push({
        lead,
        point,
        lastInteracao: leadInter[0] ?? null,
        daysSince: daysSinceLastTouch(lead, leadInter),
      })
    }
    return rows
  }, [leads, interacoes])

  const filtered = useMemo(() => {
    return dueRows.filter(r => {
      if (responsavelFilter !== 'all' && r.lead.responsavel_id !== responsavelFilter) return false
      if (diaFilter !== 'all' && String(r.point.dia) !== diaFilter) return false
      return true
    })
  }, [dueRows, responsavelFilter, diaFilter])

  // Agrupar por dia
  const grouped = useMemo(() => {
    const map = new Map<number, DueRow[]>()
    for (const r of filtered) {
      const arr = map.get(r.point.dia) ?? []
      arr.push(r)
      map.set(r.point.dia, arr)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [filtered])

  function abordar(row: DueRow) {
    const params = new URLSearchParams({
      nome: row.lead.nome,
      empresa: row.lead.empresa ?? '',
      stage: row.point.stage,
      leadId: row.lead.id,
    })
    params.set('telefone', row.lead.telefone ?? '')
    navigate(`/mensagens?${params.toString()}`)
  }

  const isLoading = loadingLeads || loadingInter

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#25D366' }}>
          <Send className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Cadência</h1>
          <p className="text-sm text-muted-foreground">
            Leads com mensagem devida hoje — cadência CONSEJ (Dias 1, 3, 5, 7, 10).
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold" style={{ color: '#25D366' }}>{filtered.length}</p>
          <p className="text-xs text-muted-foreground">leads devidos</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-fg4">
            <Filter className="w-4 h-4" />
            Filtros:
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Dia</span>
            <Select value={diaFilter} onValueChange={setDiaFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {CADENCIA_DIAS.map(p => (
                  <SelectItem key={p.dia} value={String(p.dia)}>
                    {p.label} — {p.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Responsável</span>
            <Select value={responsavelFilter} onValueChange={setResponsavelFilter}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {perfis.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading — skeleton de 3 rows animados (CAD-02) */}
      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-14 rounded-lg animate-pulse"
              style={{ background: 'var(--alpha-bg-sm)' }}
            />
          ))}
        </div>
      )}

      {/* Empty — estado descritivo com CTA para /leads (CAD-02, D-05) */}
      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-14 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ background: 'rgba(37,211,102,0.15)' }}>
              <Send className="w-5 h-5" style={{ color: '#4ade80' }} />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum lead devido hoje</p>
            <p className="text-xs text-muted-foreground mt-1">
              Todos os leads ativos estão dentro da janela da cadência. Volte amanhã ou use o kanban para ver os próximos D-points.
            </p>
            <button
              onClick={() => navigate('/leads')}
              className="mt-3 text-xs hover:underline"
              style={{ color: '#0089ac' }}
            >
              Ver kanban de leads
            </button>
          </CardContent>
        </Card>
      )}

      {/* Grupos por dia */}
      {grouped.map(([dia, rows]) => {
        const point = CADENCIA_DIAS.find(p => p.dia === dia)!
        return (
          <div key={dia} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
                style={{ background: 'rgba(37,211,102,0.15)', color: '#4ade80' }}
              >
                <Calendar className="w-3 h-3" />
                {point.label}
              </span>
              <span className="text-sm font-medium text-fg2">{point.descricao}</span>
              <span className="text-xs text-muted-foreground">· {rows.length} lead{rows.length > 1 ? 's' : ''}</span>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-[var(--alpha-border)]">
                  {rows.map(row => (
                    <div
                      key={row.lead.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--alpha-bg-xs)] transition-colors"
                    >
                      <button
                        onClick={() => navigate(`/leads/${row.lead.id}`)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="text-sm font-semibold text-foreground truncate">{row.lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.lead.empresa}</p>
                      </button>

                      <div className="shrink-0 text-right hidden sm:block">
                        <p className="text-xs text-fg4">Status</p>
                        <p className="text-xs font-medium text-fg2">{stageLabel(row.lead.status)}</p>
                      </div>

                      <div className="shrink-0 text-right hidden md:block">
                        <p className="text-xs text-fg4 flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          Último contato
                        </p>
                        <p className="text-xs font-medium text-fg2">
                          {row.lastInteracao
                            ? `há ${row.daysSince}d`
                            : `criado há ${row.daysSince}d`}
                        </p>
                      </div>

                      {row.lead.responsavel && (
                        <div className="shrink-0 text-right hidden lg:block">
                          <p className="text-xs text-fg4">Responsável</p>
                          <p className="text-xs font-medium text-fg2 truncate max-w-[120px]">{row.lead.responsavel}</p>
                        </div>
                      )}

                      <Button
                        size="sm"
                        onClick={() => abordar(row)}
                        className={cn('h-8 gap-1.5 text-xs shrink-0')}
                        style={{ backgroundColor: '#25D366' }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Abordar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
