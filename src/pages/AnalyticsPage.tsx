import { useMemo, useState } from 'react'
import { useLeads } from '@/hooks/useLeads'
import { useContratos } from '@/hooks/useContratos'
import { useIndicacoes } from '@/hooks/useIndicacoes'
import { useClientes } from '@/hooks/useClientes'
import { usePerfis } from '@/hooks/usePerfis'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PIPELINE_STAGES, LEAD_SOURCE_LABELS, SEGMENTS } from '@/lib/constants'
import { formatCurrency, getDaysUntilExpiry } from '@/lib/utils'
import { differenceInDays } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, Target, Clock, DollarSign, AlertCircle, Zap, Trophy, Users, Activity, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import {
  getCurrentYear,
  getPeriodRange,
  isInRange,
  isCurrentCycle,
  formatPeriodLabel,
  type PeriodValue,
} from '@/lib/periods'

const COLORS = ['#0089ac', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4']
const STAGE_ORDER = PIPELINE_STAGES.map(s => s.id)

// ─── helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

function StatCard({
  label, value, sub, icon: Icon, accent, alert,
}: {
  label: string; value: string | number; sub?: string
  icon: React.FC<{ className?: string }>; accent: string; alert?: boolean
}) {
  return (
    <Card style={alert ? { borderColor: 'rgba(239,68,68,0.35)' } : {}}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', accent)}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-bold" style={{ color: alert ? 'rgba(248,113,113,0.90)' : 'var(--text-strong-a)' }}>{value}</p>
        {sub && <p className="text-xs text-fg4 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { data: leads = [] }      = useLeads()
  const { data: contratos = [] }  = useContratos()
  const { data: indicacoes = [] } = useIndicacoes()
  const { data: clientes = [] }   = useClientes()
  const { data: perfis = [] }     = usePerfis()
  const [period, setPeriod] = useState<PeriodValue>({ year: getCurrentYear(), granularity: 'total' })

  const metrics = useMemo(() => {
    // ── Period filter (ano civil — jan→dez) ───────────────────────────────
    const range = getPeriodRange(period)
    const filteredLeads = leads.filter(l => isInRange(l.created_at, range))

    // ── Funil ──────────────────────────────────────────────────────────────
    const funnelCounts = PIPELINE_STAGES.map(s => ({
      id: s.id,
      label: s.label,
      count: filteredLeads.filter(l => l.status === s.id).length,
    }))

    // ── Win / Loss ─────────────────────────────────────────────────────────
    const won  = filteredLeads.filter(l => l.status === 'ganho_assessoria' || l.status === 'ganho_consultoria')
    const lost = filteredLeads.filter(l => l.status === 'perdido' || l.status === 'cancelado')
    const closed = won.length + lost.length
    const winRate = pct(won.length, closed)
    const lossRate = pct(lost.length, closed)

    // ── Tempo médio de fechamento ──────────────────────────────────────────
    // Filter out 0-day closes: bulk-imported leads have created_at ≈ updated_at,
    // producing a spurious "0d" average. Only count leads with ≥ 1 day difference.
    const closeTimes = won
      .filter(l => l.created_at && l.updated_at)
      .map(l => differenceInDays(new Date(l.updated_at), new Date(l.created_at)))
      .filter(d => d >= 1)
    const avgCloseDays = closeTimes.length
      ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
      : null

    // ── Ticket médio ───────────────────────────────────────────────────────
    const contratoAtivos = contratos.filter(c => c.valor_total && c.status === 'ativo')
    const avgTicket = contratoAtivos.length
      ? contratoAtivos.reduce((s, c) => s + (c.valor_total ?? 0), 0) / contratoAtivos.length
      : null

    const mrr = contratos
      .filter(c => c.status === 'ativo' && c.valor_mensal)
      .reduce((s, c) => s + (c.valor_mensal ?? 0), 0)

    // ── Lead velocity (last 30 days vs prior 30 days) ─────────────────────
    const now = new Date()
    const leadsLast30 = leads.filter(l => differenceInDays(now, new Date(l.created_at)) <= 30).length
    const leadsPrior30 = leads.filter(l => {
      const d = differenceInDays(now, new Date(l.created_at))
      return d > 30 && d <= 60
    }).length
    const velocityDelta = leadsPrior30 ? pct(leadsLast30 - leadsPrior30, leadsPrior30) : null

    // ── Performance por fonte ─────────────────────────────────────────────
    const sourceMap: Record<string, { total: number; won: number }> = {}
    for (const l of filteredLeads) {
      if (!sourceMap[l.origem]) sourceMap[l.origem] = { total: 0, won: 0 }
      sourceMap[l.origem].total++
      if (l.status === 'ganho_assessoria' || l.status === 'ganho_consultoria') sourceMap[l.origem].won++
    }
    const bySource = Object.entries(sourceMap)
      .map(([key, v]) => ({
        name: LEAD_SOURCE_LABELS[key] ?? key,
        total: v.total,
        won: v.won,
        taxa: pct(v.won, v.total + (filteredLeads.filter(l => l.origem === key && (l.status === 'perdido' || l.status === 'cancelado')).length)),
      }))
      .sort((a, b) => b.taxa - a.taxa)

    // ── Performance por segmento ──────────────────────────────────────────
    const segMap: Record<string, { total: number; won: number }> = {}
    for (const l of filteredLeads) {
      if (!segMap[l.segmento]) segMap[l.segmento] = { total: 0, won: 0 }
      segMap[l.segmento].total++
      if (l.status === 'ganho_assessoria' || l.status === 'ganho_consultoria') segMap[l.segmento].won++
    }
    const bySegment = Object.entries(segMap)
      .map(([key, v]) => ({
        name: SEGMENTS.find(s => s.value === key)?.label ?? key,
        total: v.total,
        won: v.won,
        taxa: pct(v.won, v.total + (filteredLeads.filter(l => l.segmento === key && (l.status === 'perdido' || l.status === 'cancelado')).length)),
      }))
      .sort((a, b) => b.won - a.won)

    // ── Performance por responsável ───────────────────────────────────────
    const respMap: Record<string, { total: number; won: number }> = {}
    for (const l of filteredLeads) {
      const resp = l.responsavel ?? 'Sem responsável'
      if (!respMap[resp]) respMap[resp] = { total: 0, won: 0 }
      respMap[resp].total++
      if (l.status === 'ganho_assessoria' || l.status === 'ganho_consultoria') respMap[resp].won++
    }
    const byResponsavel = Object.entries(respMap)
      .map(([name, v]) => ({ name, ...v, taxa: pct(v.won, v.total) }))
      .sort((a, b) => b.won - a.won)

    // ── Ranking de indicações por membro CONSEJ ───────────────────────────
    // Considera indicações no período (created_at) cujo indicante é um perfil
    // interno (indicante_perfil_id). Conta total + convertidas.
    const range = getPeriodRange(period)
    const filteredIndicacoes = indicacoes.filter(i => isInRange(i.created_at, range))
    const indicMap: Record<string, { total: number; convertidas: number }> = {}
    for (const i of filteredIndicacoes) {
      if (!i.indicante_perfil_id) continue
      if (!indicMap[i.indicante_perfil_id]) indicMap[i.indicante_perfil_id] = { total: 0, convertidas: 0 }
      indicMap[i.indicante_perfil_id].total++
      if (i.status === 'convertido') indicMap[i.indicante_perfil_id].convertidas++
    }
    const byIndicantePerfil = Object.entries(indicMap)
      .map(([perfilId, v]) => {
        const p = perfis.find(x => x.id === perfilId)
        return {
          perfilId,
          name: p?.nome ?? 'Membro desconhecido',
          ...v,
          taxa: pct(v.convertidas, v.total),
        }
      })
      .sort((a, b) => b.convertidas - a.convertidas || b.total - a.total)

    // ── Stagnant leads ────────────────────────────────────────────────────
    const STAGNANT: Record<string, number> = {
      classificacao: 3, levantamento_oportunidade: 5, educar_lead: 7, proposta_comercial: 7, negociacao: 10, stand_by: 14,
    }
    const stagnant = filteredLeads.filter(l => {
      if (['ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado'].includes(l.status)) return false
      return differenceInDays(new Date(), new Date(l.updated_at)) >= (STAGNANT[l.status] ?? 7)
    })

    // ── Contratos vencendo ────────────────────────────────────────────────
    const expiring60 = contratos.filter(c => {
      const d = getDaysUntilExpiry(c.data_fim)
      return d !== null && d <= 60 && d >= 0 && c.status === 'ativo'
    })

    // ── Motivos de perda ──────────────────────────────────────────────────
    const lossReasonMap: Record<string, number> = {}
    for (const l of filteredLeads) {
      if ((l.status === 'perdido' || l.status === 'cancelado') && l.motivo_perda) {
        lossReasonMap[l.motivo_perda] = (lossReasonMap[l.motivo_perda] ?? 0) + 1
      }
    }
    const byLossReason = Object.entries(lossReasonMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)

    // ── Piedata Win/Loss ──────────────────────────────────────────────────
    const winLossPie = [
      { name: 'Ganhos', value: won.length },
      { name: 'Perdidos/Cancelados', value: lost.length },
      { name: 'Em andamento', value: filteredLeads.length - won.length - lost.length },
    ].filter(d => d.value > 0)

    // ── IVM — Índice de Vitalidade do Movimento ──────────────────────────
    const activeContratosAll = contratos.filter(c => c.status === 'ativo')
    const totalActive = activeContratosAll.length
    const encerrados6m = contratos.filter(c => {
      if (c.status !== 'encerrado' || !c.data_fim) return false
      return differenceInDays(new Date(), new Date(c.data_fim)) <= 180
    }).length
    const retencao = totalActive + encerrados6m > 0 ? totalActive / (totalActive + encerrados6m) : 0.9

    // NPS real: média dos clientes que já têm nps_score registrado
    const clientesComNps = clientes.filter(c => typeof c.nps_score === 'number')
    const npsMedia = clientesComNps.length > 0
      ? clientesComNps.reduce((sum, c) => sum + (c.nps_score as number), 0) / clientesComNps.length
      : null  // null = sem dados coletados ainda
    const npsNormalizado = npsMedia !== null ? npsMedia / 10 : 0.6  // fallback neutro enquanto sem dados

    const indicacoesConvertidas = filteredLeads.filter(l => l.origem === 'indicacao_cliente' || l.origem === 'indicacao_parceiro').length
    const pctIndicacao = filteredLeads.length > 0 ? indicacoesConvertidas / filteredLeads.length : 0
    const comResponsavel = filteredLeads.filter(l => l.responsavel).length
    const engajamento = filteredLeads.length > 0 ? comResponsavel / filteredLeads.length : 0.7
    const ivmPct = Math.round((retencao * 0.30 + npsNormalizado * 0.25 + pctIndicacao * 0.25 + engajamento * 0.20) * 100)
    const npsLabel = npsMedia !== null
      ? `NPS Médio (${npsMedia.toFixed(1)} / 10 — ${clientesComNps.length} resp.)`
      : 'NPS Médio (sem dados ainda)'
    const ivmComponents = [
      { label: 'Retenção de Contratos', value: Math.round(retencao * 100),         weight: 30 },
      { label: npsLabel,                value: Math.round(npsNormalizado * 100),   weight: 25 },
      { label: '% Leads por Indicação', value: Math.round(pctIndicacao * 100),     weight: 25 },
      { label: 'Leads com Responsável', value: Math.round(engajamento * 100),      weight: 20 },
    ]

    return {
      funnelCounts, won, lost, closed, winRate, lossRate,
      avgCloseDays, avgTicket, mrr,
      leadsLast30, velocityDelta,
      bySource, bySegment, byResponsavel, byIndicantePerfil,
      stagnant, expiring60, winLossPie, byLossReason,
      ivm: ivmPct, ivmComponents,
      npsMedia, clientesComNpsCount: clientesComNps.length,
    }
  }, [leads, contratos, indicacoes, clientes, perfis, period])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">Analytics Comercial</h1>
            <span className="text-sm text-fg2">— {formatPeriodLabel(period)}</span>
            {!isCurrentCycle(period) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <History className="w-3 h-3" />
                Histórico
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Métricas de conversão, tempo de funil e performance por canal</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={leads ?? []} />
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Win Rate"
          value={`${metrics.winRate}%`}
          sub={`${metrics.won.length} fechados / ${metrics.closed} qualificados`}
          icon={Target}
          accent="bg-[rgba(16,185,129,0.12)] text-emerald-400"
          alert={metrics.closed > 5 && metrics.winRate < 30}
        />
        <StatCard
          label="Tempo médio de fechamento"
          value={metrics.avgCloseDays !== null ? `${metrics.avgCloseDays}d` : '—'}
          sub={metrics.avgCloseDays !== null ? 'Criação → Contrato assinado' : 'Dados insuficientes (leads importados em bloco)'}
          icon={Clock}
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Ticket médio"
          value={metrics.avgTicket !== null ? formatCurrency(metrics.avgTicket) : '—'}
          sub="Contratos ativos com valor"
          icon={DollarSign}
          accent="bg-[rgba(245,158,11,0.12)] text-amber-400"
        />
        <StatCard
          label="Leads (últimos 30d)"
          value={metrics.leadsLast30}
          sub={metrics.velocityDelta !== null
            ? `${metrics.velocityDelta >= 0 ? '+' : ''}${metrics.velocityDelta}% vs mês anterior`
            : undefined}
          icon={Zap}
          accent="bg-violet-50 text-violet-600"
          alert={metrics.velocityDelta !== null && metrics.velocityDelta < -20}
        />
      </div>

      {/* ── Risk KPIs ── */}
      {(metrics.stagnant.length > 0 || metrics.expiring60.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {metrics.stagnant.length > 0 && (
            <Card style={{ borderColor: 'rgba(249,115,22,0.30)', background: 'rgba(249,115,22,0.04)' }}>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: '#fb923c' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--amber-hi)' }}>{metrics.stagnant.length} lead{metrics.stagnant.length > 1 ? 's' : ''} parado{metrics.stagnant.length > 1 ? 's' : ''}</p>
                  <p className="text-xs" style={{ color: 'var(--amber-lo)' }}>
                    {metrics.stagnant.length > leads.filter(l => !['ganho_assessoria','ganho_consultoria','perdido','cancelado'].includes(l.status)).length * 0.4
                      ? 'Inclui leads importados em bloco ainda não trabalhados no CRM'
                      : 'Requerem follow-up imediato'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {metrics.expiring60.length > 0 && (
            <Card style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: '#f87171' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--red-hi)' }}>{metrics.expiring60.length} contrato{metrics.expiring60.length > 1 ? 's' : ''} vencendo em 60d</p>
                  <p className="text-xs" style={{ color: 'rgba(248,113,113,0.65)' }}>Inicie conversas de renovação agora</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Funil + Win/Loss ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">

        {/* Funnel bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribuição do Funil</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(() => {
                const STAGE_COLOR_MAP: Record<string, string> = {
                  classificacao:             '#64748b',
                  levantamento_oportunidade: '#8b5cf6',
                  educar_lead:               '#3b82f6',
                  proposta_comercial:        '#f59e0b',
                  negociacao:                '#f97316',
                  stand_by:                  '#10b981',
                  ganho_assessoria:          '#ef4444',
                  ganho_consultoria:         '#06b6d4',
                  perdido:                   '#6b7280',
                  cancelado:                 '#9ca3af',
                }
                const max = Math.max(...metrics.funnelCounts.map(s => s.count), 1)
                return metrics.funnelCounts.map(stage => {
                  const widthPct = Math.round((stage.count / max) * 100)
                  const pctTotal = pct(stage.count, leads.length)
                  const barColor = STAGE_COLOR_MAP[stage.id] ?? '#4b5563'
                  return (
                    <div key={stage.id} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-36 shrink-0 truncate">{stage.label}</span>
                      <div className="flex-1 bg-[var(--alpha-bg-xs)] rounded-full h-5 relative overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                        />
                      </div>
                      <span className="text-sm font-bold text-fg2 w-6 text-right">{stage.count}</span>
                      <span className="text-xs text-fg4 w-8 text-right">{pctTotal}%</span>
                    </div>
                  )
                })
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Win/Loss Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status do Portfólio</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={metrics.winLossPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  outerRadius={70}
                  innerRadius={42}
                >
                  {metrics.winLossPie.map((_, idx) => (
                    <Cell key={idx} fill={['#10b981', '#ef4444', '#94a3b8'][idx]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0d1929", border: "1px solid var(--alpha-border-md)", color: "rgba(220,230,240,0.90)", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 mt-3 px-1">
              {metrics.winLossPie.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ['#10b981', '#ef4444', '#94a3b8'][i] }} />
                    <span className="truncate">{d.name}</span>
                  </div>
                  <span className="font-medium text-fg2 shrink-0">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Performance por Canal ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#6bd0e7]" />
            Performance por Canal de Prospecção
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.bySource.length === 0 ? (
            <p className="text-sm text-fg4 py-4 text-center">Nenhum lead com fonte definida.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-fg4 border-b border-slate-100">
                    <th className="text-left py-2 font-medium">Canal</th>
                    <th className="text-right py-2 font-medium">Total Leads</th>
                    <th className="text-right py-2 font-medium">Fechados</th>
                    <th className="text-right py-2 font-medium">Win Rate</th>
                    <th className="py-2 pl-4">Desempenho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {metrics.bySource.map((row, i) => (
                    <tr key={row.name} className="hover:bg-background">
                      <td className="py-2.5 font-medium text-fg2 flex items-center gap-2">
                        {i === 0 && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                        {row.name}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground tabular-nums">{row.total}</td>
                      <td className="py-2.5 text-right text-muted-foreground tabular-nums">{row.won}</td>
                      <td className="py-2.5 text-right">
                        <span className={cn(
                          'font-bold tabular-nums',
                          row.taxa >= 50 ? 'text-emerald-600' : row.taxa >= 25 ? 'text-amber-600' : 'text-red-500'
                        )}>
                          {row.taxa}%
                        </span>
                      </td>
                      <td className="py-2.5 pl-4">
                        <div className="w-24 bg-[var(--alpha-bg-xs)] rounded-full h-1.5">
                          <div
                            className={cn('h-full rounded-full', row.taxa >= 50 ? 'bg-emerald-500' : row.taxa >= 25 ? 'bg-amber-500' : 'bg-red-400')}
                            style={{ width: `${row.taxa}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Performance por Segmento + Responsável ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* By segment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              Performance por Segmento de Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.bySegment.slice(0, 7)} layout="vertical" margin={{ left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(150,165,180,0.60)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "rgba(150,165,180,0.60)" }} width={110} />
                <Tooltip
                  formatter={(value, name) => [
                    name === 'won' ? `${value} fechados` : `${value} total`,
                    name === 'won' ? 'Ganhos' : 'Total'
                  ]}
                />
                <Bar dataKey="total" fill="#e2e8f0" radius={[0, 3, 3, 0]} />
                <Bar dataKey="won" fill="#0089ac" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By responsavel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Ranking por Responsável
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.byResponsavel.filter(r => r.name !== 'Sem responsável').length === 0 ? (
              <p className="text-sm text-fg4 py-4 text-center">Nenhum lead com responsável atribuído.</p>
            ) : (
              <div className="space-y-3">
                {metrics.byResponsavel
                  .filter(r => r.name !== 'Sem responsável')
                  .slice(0, 6)
                  .map((r, i) => (
                    <div key={r.name} className="flex items-center gap-3">
                      <span className={cn(
                        'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                        i === 0 ? 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]' : 'bg-[var(--alpha-bg-xs)] text-muted-foreground'
                      )}>{i + 1}</span>
                      <span className="text-sm text-fg2 flex-1 truncate">{r.name}</span>
                      <span className="text-xs text-fg4">{r.won}/{r.total}</span>
                      <span className={cn(
                        'text-xs font-bold w-10 text-right',
                        r.taxa >= 50 ? 'text-emerald-600' : r.taxa >= 25 ? 'text-amber-600' : 'text-fg4'
                      )}>{r.taxa}%</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Ranking de Indicações por Membro CONSEJ ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-indigo-400" />
            Ranking de Indicações por Membro
            <span className="text-xs font-normal text-fg4 ml-1">— quem mais trouxe leads no período</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.byIndicantePerfil.length === 0 ? (
            <p className="text-sm text-fg4 py-4 text-center">
              Nenhuma indicação por membro CONSEJ no período. Preencha <code className="text-[10px]">indicante_perfil_id</code> ao criar indicações para popular este ranking.
            </p>
          ) : (
            <div className="space-y-2">
              {metrics.byIndicantePerfil.slice(0, 10).map((r, i) => (
                <div
                  key={r.perfilId}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-[var(--alpha-bg-xs)] transition-colors"
                >
                  <span className={cn(
                    'w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                    i === 0 ? 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]'
                    : i === 1 ? 'bg-[rgba(150,165,180,0.15)] text-fg2'
                    : i === 2 ? 'bg-[rgba(180,83,9,0.15)] text-amber-700'
                    : 'bg-[var(--alpha-bg-xs)] text-muted-foreground'
                  )}>{i + 1}</span>
                  <span className="text-sm text-fg2 flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {r.convertidas} convertida{r.convertidas === 1 ? '' : 's'} / {r.total}
                  </span>
                  <span className={cn(
                    'text-xs font-bold w-12 text-right tabular-nums',
                    r.taxa >= 50 ? 'text-emerald-400' : r.taxa >= 25 ? 'text-amber-400' : 'text-fg4'
                  )}>{r.taxa}%</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── IVM — Índice de Vitalidade do Movimento ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#6bd0e7]" />
            IVM — Índice de Vitalidade do Movimento
            <span className="text-xs font-normal text-fg4 ml-1">— saúde do movimento em 1 número</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
            {/* Big score */}
            <div className="flex flex-col items-center justify-center w-32">
              <div className={cn(
                'w-28 h-28 rounded-full flex items-center justify-center border-4',
                metrics.ivm >= 75 ? 'border-emerald-500 text-emerald-400' : metrics.ivm >= 50 ? 'border-amber-400 text-amber-400' : 'border-red-500 text-red-400'
              )}>
                <span className="text-3xl font-bold">{metrics.ivm}</span>
              </div>
              <p className={cn('text-xs font-semibold mt-2', metrics.ivm >= 75 ? 'text-emerald-400' : metrics.ivm >= 50 ? 'text-amber-400' : 'text-red-400')}>
                {metrics.ivm >= 75 ? '✅ Saudável' : metrics.ivm >= 50 ? '⚠️ Alerta Amarelo' : '🔴 Crise'}
              </p>
              <p className="text-[10px] text-fg4 mt-0.5">meta: 75+</p>
            </div>
            {/* Components */}
            <div className="space-y-3">
              {metrics.ivmComponents.map(c => (
                <div key={c.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-fg4">peso {c.weight}%</span>
                      <span className="text-sm font-bold text-fg2">{c.value}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-[var(--alpha-bg-xs)] rounded-full">
                    <div
                      className={cn('h-full rounded-full', c.value >= 75 ? 'bg-emerald-500' : c.value >= 50 ? 'bg-amber-400' : 'bg-red-500')}
                      style={{ width: `${Math.min(c.value, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Win/Loss Analysis ── */}
      {metrics.byLossReason.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              Análise Win/Loss — Principais Motivos de Perda
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* header row */}
            <div className="grid gap-x-3 mb-1 px-2" style={{ gridTemplateColumns: '24px 1fr 80px 40px' }}>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4">#</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4">Motivo</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4 text-right">Ocorr.</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4 text-right">%</span>
            </div>
            <div className="space-y-1">
              {metrics.byLossReason.slice(0, 8).map((r, i) => {
                const barColors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22d3ee', '#a78bfa', '#f472b6', '#38bdf8']
                const color = barColors[i] ?? '#6b7280'
                const maxCount = metrics.byLossReason[0]?.count ?? 1
                const barPct = Math.round((r.count / maxCount) * 100)
                return (
                  <div key={r.reason} title={r.reason}
                    className="grid gap-x-3 items-center rounded-lg px-2 py-2 transition-colors hover:bg-white/5 cursor-default"
                    style={{ gridTemplateColumns: '24px 1fr 80px 40px' }}
                  >
                    {/* rank */}
                    <span className="text-xs font-bold tabular-nums" style={{ color: 'rgba(100,120,140,0.45)' }}>{i + 1}</span>

                    {/* reason + bar */}
                    <div className="min-w-0">
                      <p className="text-xs text-fg2 truncate leading-snug">{r.reason}</p>
                      <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--alpha-bg-sm)' }}>
                        <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: color, opacity: 0.7 }} />
                      </div>
                    </div>

                    {/* count */}
                    <div className="text-right">
                      <span className="text-xs font-bold tabular-nums" style={{ color }}>{r.count}</span>
                      <span className="text-[10px] text-fg4 ml-0.5">
                        {r.count === 1 ? 'lead' : 'leads'}
                      </span>
                    </div>

                    {/* pct */}
                    <span className="text-xs text-muted-foreground tabular-nums text-right">{pct(r.count, metrics.lost.length)}%</span>
                  </div>
                )
              })}
            </div>
            {metrics.byLossReason.length > 8 && (
              <p className="text-[10px] text-fg4 mt-3 px-2">
                +{metrics.byLossReason.length - 8} outros motivos não exibidos
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Insight box ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-3 bg-slate-900 rounded-2xl p-6 text-white">
          <h3 className="text-sm font-semibold text-fg4 uppercase tracking-wider mb-4">💡 Insights de Processo Comercial</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-xs text-fg4 mb-1">O que o Win Rate diz</p>
              <p className="text-sm text-white leading-relaxed">
                {metrics.winRate >= 50
                  ? 'Excelente qualificação de leads. Mantenha os critérios atuais e foque em aumentar o volume.'
                  : metrics.winRate >= 25
                  ? 'Win rate aceitável. Revisar o pitch na etapa de proposta pode aumentar o fechamento.'
                  : 'Win rate abaixo do ideal. Revisar critérios de qualificação ou o processo de diagnóstico.'}
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-xs text-fg4 mb-1">Melhor canal de prospecção</p>
              <p className="text-sm text-white leading-relaxed">
                {metrics.bySource[0]
                  ? `"${metrics.bySource[0].name}" tem o maior win rate (${metrics.bySource[0].taxa}%). Invista mais esforço e indicações nesse canal.`
                  : 'Atribua canal de prospecção aos leads para descobrir qual mais converte.'}
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-xs text-fg4 mb-1">Próxima alavanca</p>
              <p className="text-sm text-white leading-relaxed">
                {metrics.stagnant.length > 0
                  ? `${metrics.stagnant.length} leads sem atividade recente. Trabalhar esses leads no CRM é a alavanca de conversão mais rápida disponível.`
                  : metrics.expiring60.length > 0
                  ? `${metrics.expiring60.length} contratos vencem em 60 dias. Inicie conversas de renovação antes do prazo — não depois.`
                  : 'Pipeline saudável. Foque em aumentar o volume de novos leads e indicações.'}
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
