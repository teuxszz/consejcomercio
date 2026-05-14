import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, AlertCircle, ChevronRight } from 'lucide-react'
import { useContratos } from '@/hooks/useContratos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsavelBadge } from '@/components/shared/ResponsavelBadge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, getDaysUntilExpiry, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Contrato } from '@/types'

type Urgencia = 'critico' | 'alto' | 'medio' | 'baixo' | 'vencido'

interface ContratoBucket extends Contrato {
  daysLeft: number
  urgencia: Urgencia
}

const URGENCIA_STYLE: Record<Urgencia, { label: string; bg: string; border: string; text: string }> = {
  vencido: { label: 'Vencido',     bg: 'rgba(127,29,29,0.10)',   border: 'rgba(127,29,29,0.40)',  text: '#fca5a5' },
  critico: { label: '≤ 30 dias',   bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.35)',  text: '#fca5a5' },
  alto:    { label: '31–60 dias',  bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.35)', text: '#fb923c' },
  medio:   { label: '61–90 dias',  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.30)', text: '#fbbf24' },
  baixo:   { label: '> 90 dias',   bg: 'var(--alpha-bg-xs)',     border: 'var(--alpha-border-md)', text: 'rgba(180,195,210,0.80)' },
}

function classifyUrgency(daysLeft: number): Urgencia {
  if (daysLeft < 0)   return 'vencido'
  if (daysLeft <= 30) return 'critico'
  if (daysLeft <= 60) return 'alto'
  if (daysLeft <= 90) return 'medio'
  return 'baixo'
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function RenovacoesPage() {
  const navigate = useNavigate()
  const { data: contratos, isLoading } = useContratos()

  const buckets = useMemo<ContratoBucket[]>(() => {
    if (!contratos) return []
    return contratos
      .filter(c => c.status === 'ativo' && c.data_fim)
      .map(c => {
        const daysLeft = getDaysUntilExpiry(c.data_fim) ?? 0
        return { ...c, daysLeft, urgencia: classifyUrgency(daysLeft) }
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [contratos])

  const grouped = useMemo(() => {
    const map = new Map<string, ContratoBucket[]>()
    for (const c of buckets) {
      if (!c.data_fim) continue
      const key = monthKey(c.data_fim)
      const list = map.get(key) ?? []
      list.push(c)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [buckets])

  const totals = useMemo(() => ({
    vencido:  buckets.filter(c => c.urgencia === 'vencido').length,
    critico:  buckets.filter(c => c.urgencia === 'critico').length,
    alto:     buckets.filter(c => c.urgencia === 'alto').length,
    medio:    buckets.filter(c => c.urgencia === 'medio').length,
    total:    buckets.length,
  }), [buckets])

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando renovações...</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#0089ac]" />
          Calendário de Renovações
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Contratos ativos agrupados por mês de vencimento. Notificações automáticas no Slack 30 dias antes do fim.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(['vencido', 'critico', 'alto', 'medio'] as const).map(u => {
          const s = URGENCIA_STYLE[u]
          return (
            <Card key={u} style={{ borderColor: s.border, background: s.bg }}>
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: s.text }}>
                  {s.label}
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: s.text }}>
                  {totals[u]}
                </p>
              </CardContent>
            </Card>
          )
        })}
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total ativos</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{totals.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Agenda */}
      {grouped.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma renovação no horizonte"
          description="Não há contratos ativos com data_fim cadastrada."
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, items]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="capitalize">{monthLabel(key)}</span>
                  <span className="text-xs font-normal text-muted-foreground">{items.length} contrato{items.length === 1 ? '' : 's'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map(c => {
                  const s = URGENCIA_STYLE[c.urgencia]
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate('/contratos')}
                      className="w-full text-left rounded-xl p-3 transition-colors hover:opacity-90"
                      style={{ background: s.bg, border: `1px solid ${s.border}` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {c.cliente?.nome ?? '—'}
                            </p>
                            {c.cliente?.empresa && (
                              <span className="text-xs text-muted-foreground truncate">— {c.cliente.empresa}</span>
                            )}
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ml-auto" style={{ color: s.text, borderColor: s.border }}>
                              {c.urgencia === 'vencido'
                                ? `vencido há ${Math.abs(c.daysLeft)}d`
                                : `${c.daysLeft}d`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{formatDate(c.data_fim)}</span>
                            {c.valor_mensal != null && c.valor_mensal > 0 && (
                              <span>{formatCurrency(c.valor_mensal)}/mês</span>
                            )}
                            <ResponsavelBadge perfilId={c.responsavel_id ?? null} size={16} />
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-fg4 shrink-0" />
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <p>
          O cron Vercel <code className="text-[10px]">/api/cron-renovacoes</code> roda diariamente às 12h UTC e dispara
          notificação no Slack em <strong>30, 14 e 7 dias</strong> antes do vencimento. Cada janela é notificada uma única vez por contrato.
        </p>
      </div>
    </div>
  )
}
