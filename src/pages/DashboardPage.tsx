import { useMemo, useState } from 'react'
import { AdocaoCard } from '@/components/adocao/AdocaoCard'
import { RequireRole } from '@/components/shared/RequireRole'
import { useLeads } from '@/hooks/useLeads'
import { useClientes } from '@/hooks/useClientes'
import { useContratos } from '@/hooks/useContratos'
import { useIndicacoes } from '@/hooks/useIndicacoes'
import { useOportunidades } from '@/hooks/useOportunidades'
import { useReunioesSemanais } from '@/hooks/useReunioes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PIPELINE_STAGES, LEAD_SOURCE_LABELS, STAGE_COLORS, ACTIVE_LEAD_STAGES } from '@/lib/constants'
import { formatCurrency, getDaysUntilExpiry, formatDate } from '@/lib/utils'
import { differenceInDays } from 'date-fns'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Briefcase, TrendingUp, FileText, AlertCircle, Share2, DollarSign, Calendar, Clock, Video, MapPin, Flame, Bell, ArrowRight, Gift, Activity, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import { ProjecaoFechamento } from '@/components/dashboard/ProjecaoFechamento'
import {
  getCurrentYear,
  getPeriodRange,
  getPreviousPeriodRange,
  isInRange,
  isCurrentCycle,
  formatPeriodLabel,
  type PeriodValue,
} from '@/lib/periods'

const COLORS = ['#0089ac', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: leads } = useLeads()
  const { data: clientes } = useClientes()
  const { data: contratos } = useContratos()
  const { data: indicacoes } = useIndicacoes()
  const { data: oportunidades } = useOportunidades()
  const { data: reunioesSemana = [] } = useReunioesSemanais()

  const [period, setPeriod] = useState<PeriodValue>({ year: getCurrentYear(), granularity: 'total' })
  const range = useMemo(() => getPeriodRange(period), [period])
  const prevRange = useMemo(() => getPreviousPeriodRange(period), [period])

  // Leads criados no período / período anterior (para deltas)
  const leadsPeriod = useMemo(
    () => leads?.filter(l => isInRange(l.created_at, range)) ?? [],
    [leads, range]
  )
  const leadsPrevPeriod = useMemo(
    () => leads?.filter(l => isInRange(l.created_at, prevRange)) ?? [],
    [leads, prevRange]
  )

  function delta(curr: number, prev: number): { pct: number; label: string } | null {
    if (prev === 0) return null
    const pct = Math.round(((curr - prev) / prev) * 100)
    return { pct, label: `${pct >= 0 ? '+' : ''}${pct}% vs ${period.year - 1}` }
  }

  // KPIs (filtrados pelo período)
  const activeLeads = leadsPeriod.filter(l => ACTIVE_LEAD_STAGES.includes(l.status)).length
  const wonInPeriod = leadsPeriod.filter(l => l.status === 'ganho_assessoria' || l.status === 'ganho_consultoria').length
  const wonPrevPeriod = leadsPrevPeriod.filter(l => l.status === 'ganho_assessoria' || l.status === 'ganho_consultoria').length
  const wonDelta = delta(wonInPeriod, wonPrevPeriod)

  const activeClientes = clientes?.filter(c => c.status === 'ativo').length || 0
  const totalConversions = wonInPeriod  // conversões dentro do período
  const totalLeads = leadsPeriod.length
  const convRate = totalLeads ? Math.round((totalConversions / totalLeads) * 100) : 0

  const mrrContratos = contratos?.filter(c => c.status === 'ativo' && c.valor_mensal) || []
  const mrr = mrrContratos.reduce((sum, c) => sum + (c.valor_mensal || 0), 0)

  const renewalsSoon = contratos?.filter(c => {
    const d = getDaysUntilExpiry(c.data_fim)
    return d !== null && d <= 60 && d >= 0 && c.status === 'ativo'
  }) || []

  // ── Contratos por janela de vencimento ────────────────────────────────────
  const expiring30 = contratos?.filter(c => { const d = getDaysUntilExpiry(c.data_fim); return d !== null && d <= 30 && d >= 0 && c.status === 'ativo' }) || []
  const expiring60 = contratos?.filter(c => { const d = getDaysUntilExpiry(c.data_fim); return d !== null && d > 30 && d <= 60 && c.status === 'ativo' }) || []
  const expiring90 = contratos?.filter(c => { const d = getDaysUntilExpiry(c.data_fim); return d !== null && d > 60 && d <= 90 && c.status === 'ativo' }) || []

  // ── North Star: leads ganhos no período selecionado ──────────────────────

  // ── Pós-consultoria: clientes sem assessoria e contrato encerrado há >45d ─
  const postConsultoriaUpsell = clientes?.filter(c => {
    const contratos_cliente = (c as any).contratos as typeof contratos
    if (!contratos_cliente?.length) return false
    const hasAssessoria = contratos_cliente.some(ct => ct.tipo === 'assessoria' && ct.status === 'ativo')
    if (hasAssessoria) return false
    const lastConsultoria = contratos_cliente
      .filter(ct => ct.tipo === 'consultoria' && ct.status === 'encerrado' && ct.data_fim)
      .sort((a, b) => new Date(b.data_fim!).getTime() - new Date(a.data_fim!).getTime())[0]
    if (!lastConsultoria) return false
    const daysSince = differenceInDays(new Date(), new Date(lastConsultoria.data_fim!))
    return daysSince >= 45 && daysSince <= 180
  }) || []

  const recompensasPendentes = indicacoes?.filter(i => i.status === 'convertido' && !i.recompensa_entregue).length || 0

  // Stagnant leads (no status change in 7+ days, still active)
  const STAGNANT_THRESHOLDS: Record<string, number> = {
    classificacao: 3, levantamento_oportunidade: 5, educar_lead: 7, proposta_comercial: 7, negociacao: 10, stand_by: 14,
  }
  const stagnantLeads = leadsPeriod.filter(l => {
    if (['ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado'].includes(l.status)) return false
    const days = differenceInDays(new Date(), new Date(l.updated_at))
    return days >= (STAGNANT_THRESHOLDS[l.status] ?? 7)
  }).sort((a, b) => differenceInDays(new Date(), new Date(b.updated_at)) - differenceInDays(new Date(), new Date(a.updated_at)))

  const renewalsUrgent = contratos?.filter(c => {
    const d = getDaysUntilExpiry(c.data_fim)
    return d !== null && d <= 15 && d >= 0 && c.status === 'ativo'
  }) || []

  const hasActionItems = stagnantLeads.length > 0 || renewalsUrgent.length > 0 || recompensasPendentes > 0 || postConsultoriaUpsell.length > 0

  // Pipeline funnel data (filtrado por período)
  const funnelData = PIPELINE_STAGES.map(s => ({
    name: s.label.replace('Diagnóstico', 'Diag.'),
    value: leadsPeriod.filter(l => l.status === s.id).length,
  }))

  // Canais de prospecção (filtrado por período)
  const sourceData = Object.entries(
    leadsPeriod.reduce((acc, l) => { acc[l.origem] = (acc[l.origem] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: LEAD_SOURCE_LABELS[name] || name, value }))

  // Contratos por status
  const contratoStatusData = [
    { name: 'Ativo', value: contratos?.filter(c => c.status === 'ativo').length || 0 },
    { name: 'Em Renovação', value: contratos?.filter(c => c.status === 'em_renovacao').length || 0 },
    { name: 'Encerrado', value: contratos?.filter(c => c.status === 'encerrado').length || 0 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatPeriodLabel(period)}
            {!isCurrentCycle(period) && (
              <span className="ml-2 text-amber-400">— ciclo histórico</span>
            )}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={leads ?? []} />
      </div>

      {/* ── Para hoje ── */}
      {hasActionItems && (
        <div className="rounded-2xl px-5 py-4" style={{ background: 'rgba(240,90,30,0.08)', border: '1px solid rgba(240,90,30,0.25)' }}>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'rgba(255,180,100,0.90)' }}>
            <Bell className="w-4 h-4" /> Para hoje
          </h2>
          <div className="flex flex-wrap gap-2">
            {stagnantLeads.length > 0 && (
              <button
                onClick={() => navigate('/leads')}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)', color: 'var(--text-strong-a)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--alpha-bg-md)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--alpha-bg-xs)')}
              >
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="font-medium">{stagnantLeads.length} lead{stagnantLeads.length > 1 ? 's' : ''} parado{stagnantLeads.length > 1 ? 's' : ''}</span>
                <ArrowRight className="w-3 h-3 opacity-50" />
              </button>
            )}
            {renewalsUrgent.length > 0 && (
              <button
                onClick={() => navigate('/contratos')}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)', color: 'var(--text-strong-a)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--alpha-bg-md)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--alpha-bg-xs)')}
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="font-medium">{renewalsUrgent.length} contrato{renewalsUrgent.length > 1 ? 's' : ''} vence{renewalsUrgent.length > 1 ? 'm' : ''} em 15d</span>
                <ArrowRight className="w-3 h-3 opacity-50" />
              </button>
            )}
            {recompensasPendentes > 0 && (
              <button
                onClick={() => navigate('/indicacoes')}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)', color: 'var(--text-strong-a)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--alpha-bg-md)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--alpha-bg-xs)')}
              >
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium">{recompensasPendentes} recompensa{recompensasPendentes > 1 ? 's' : ''} pendente{recompensasPendentes > 1 ? 's' : ''}</span>
                <ArrowRight className="w-3 h-3 opacity-50" />
              </button>
            )}
            {postConsultoriaUpsell.length > 0 && (
              <button
                onClick={() => navigate('/clientes')}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)', color: 'var(--text-strong-a)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--alpha-bg-md)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--alpha-bg-xs)')}
              >
                <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-medium">{postConsultoriaUpsell.length} cliente{postConsultoriaUpsell.length > 1 ? 's' : ''} pós-consultoria para upsell</span>
                <ArrowRight className="w-3 h-3 opacity-50" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── North Star ── */}
      <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ background: 'linear-gradient(135deg, rgba(0,137,172,0.12) 0%, rgba(107,208,231,0.06) 100%)', border: '1px solid rgba(0,137,172,0.25)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--cyan-mid)' }}>
            North Star · {formatPeriodLabel(period)}
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'rgba(107,208,231,0.95)' }}>{wonInPeriod}</p>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(150,175,195,0.70)' }}>
            {wonInPeriod === 0
              ? 'Nenhum novo cliente fechado no período'
              : `novo${wonInPeriod > 1 ? 's' : ''} cliente${wonInPeriod > 1 ? 's' : ''} conquistado${wonInPeriod > 1 ? 's' : ''}`}
          </p>
          {wonDelta && (
            <p className="text-xs mt-1" style={{ color: wonDelta.pct >= 0 ? 'rgba(110,231,183,0.75)' : 'rgba(252,165,165,0.75)' }}>
              {wonDelta.label}
            </p>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-[var(--cyan-lo)] mb-0.5">MRR ativo</p>
            <p className="text-lg font-bold" style={{ color: 'var(--cyan-hi)' }}>{formatCurrency(mrr)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--cyan-lo)] mb-0.5">Tx. Conversão</p>
            <p className="text-lg font-bold" style={{ color: 'var(--cyan-hi)' }}>{convRate}%</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Leads Ativos',     value: activeLeads,        icon: Users,     iconBg: 'rgba(99,102,241,0.15)',   iconColor: '#a5b4fc' },
          { label: 'Clientes Ativos',  value: activeClientes,     icon: Briefcase, iconBg: 'rgba(16,185,129,0.15)',  iconColor: '#6ee7b7' },
          { label: 'Taxa de Conversão',value: `${convRate}%`,     icon: TrendingUp,iconBg: 'rgba(245,158,11,0.15)',  iconColor: '#fbbf24' },
          { label: 'MRR',              value: formatCurrency(mrr),icon: DollarSign,iconBg: 'rgba(139,92,246,0.15)',  iconColor: '#c4b5fd' },
        ].map(({ label, value, icon: Icon, iconBg, iconColor }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm" style={{ color: 'var(--text-soft-a)' }}>{label}</p>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: iconBg }}>
                  <Icon className="w-4 h-4" style={{ color: iconColor }} />
                </div>
              </div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-strong-a)' }}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <RequireRole atLeast="coordenador" fallback={null}>
        <AdocaoCard />
      </RequireRole>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Share2 className="w-4 h-4 text-indigo-500" />
              <p className="text-sm text-muted-foreground">Indicações totais</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{indicacoes?.length || 0}</p>
          </CardContent>
        </Card>
        <Card style={recompensasPendentes > 0 ? { borderColor: 'rgba(245,158,11,0.35)' } : {}}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              {recompensasPendentes > 0 && <AlertCircle className="w-4 h-4 text-amber-500" />}
              <p className="text-sm text-muted-foreground">Recompensas pendentes</p>
            </div>
            <p className={cn('text-2xl font-bold', recompensasPendentes > 0 ? 'text-amber-600' : 'text-foreground')}>{recompensasPendentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-500" />
              <p className="text-sm text-muted-foreground">Upsell pós-consultoria</p>
            </div>
            <p className={cn('text-2xl font-bold', postConsultoriaUpsell.length > 0 ? 'text-violet-400' : 'text-foreground')}>{postConsultoriaUpsell.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Fila de Renovação — 3 janelas ── */}
      {(expiring30.length > 0 || expiring60.length > 0 || expiring90.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              Fila de Renovação
              <span className="text-xs font-normal text-fg4 ml-1">— ação requerida por janela</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '≤ 30 dias', sublabel: 'Conversa de renovação AGORA', list: expiring30, color: 'text-red-500', border: 'border-red-500/30', bg: 'bg-red-500/05' },
                { label: '31–60 dias', sublabel: 'Enviar Relatório de Valor', list: expiring60, color: 'text-orange-500', border: 'border-orange-500/25', bg: '' },
                { label: '61–90 dias', sublabel: 'Revisar health score', list: expiring90, color: 'text-amber-400', border: 'border-amber-400/20', bg: '' },
              ].map(({ label, sublabel, list, color, border }) => (
                <div key={label} className={cn('rounded-xl p-3 border', border, list.length === 0 && 'opacity-40')}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn('text-xs font-bold', color)}>{label}</span>
                    <span className={cn('text-lg font-bold', color)}>{list.length}</span>
                  </div>
                  <p className="text-[10px] text-fg4 mb-2">{sublabel}</p>
                  {list.slice(0, 3).map(c => (
                    <p key={c.id} className="text-xs text-[rgba(180,195,210,0.70)] truncate">{c.cliente?.nome ?? '—'}</p>
                  ))}
                  {list.length > 3 && <p className="text-[10px] text-fg4 mt-1">+{list.length - 3} mais</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projeção de fechamento — mês corrente */}
      <ProjecaoFechamento leads={leads ?? []} />

      {/* Reuniões da semana — destaque */}
      <Card className="border-2" style={{ borderColor: '#0089ac' }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: '#0089ac' }} />
              Reuniões desta semana
            </CardTitle>
            <button
              onClick={() => navigate('/reunioes')}
              className="text-xs px-3 py-1 rounded-lg text-white font-medium"
              style={{ backgroundColor: '#0089ac' }}
            >
              Ver todas
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {reunioesSemana.length === 0 ? (
            <p className="text-sm text-fg4 text-center py-4">Nenhuma reunião esta semana.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {reunioesSemana.map(r => {
                const dt = new Date(r.data_hora)
                const statusColors = { agendada: '#0089ac', realizada: '#10b981', cancelada: '#ef4444' }
                return (
                  <div key={r.id} className="rounded-xl border p-3 space-y-1.5" style={{ borderLeftWidth: 3, borderLeftColor: statusColors[r.status] }}>
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-semibold text-foreground leading-tight">{r.titulo}</p>
                      <span className="text-xs shrink-0 font-medium" style={{ color: statusColors[r.status] }}>
                        {DIAS_SEMANA[dt.getDay()]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {r.local && <div className="flex items-center gap-1 text-xs text-fg4"><MapPin className="w-3 h-3" />{r.local}</div>}
                    {r.link_video && (
                      <a href={r.link_video} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-white px-2 py-1 rounded-md w-fit" style={{ backgroundColor: '#0089ac' }}>
                        <Video className="w-3 h-3" />Entrar
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Funil de Pipeline</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }} width={90} />
                <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid var(--alpha-border-md)', color: 'rgba(220,230,240,0.90)', borderRadius: 8 }} />
                <Bar dataKey="value" fill="#0089ac" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Canais de Prospecção</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {sourceData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid var(--alpha-border-md)', color: 'rgba(220,230,240,0.90)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Stagnant leads alert */}
      {stagnantLeads.length > 0 && (
        <Card style={{ borderColor: 'rgba(249,115,22,0.35)' }}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              Leads parados ({stagnantLeads.length})
              <span className="text-xs font-normal text-fg4 ml-1">
                {stagnantLeads.length > activeLeads * 0.4
                  ? '— inclui leads importados ainda não trabalhados'
                  : '— precisam de atenção'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stagnantLeads.slice(0, 6).map(l => {
                const days = differenceInDays(new Date(), new Date(l.updated_at))
                const stageLabel = PIPELINE_STAGES.find(s => s.id === l.status)?.label ?? l.status
                const stageCss = STAGE_COLORS[l.status] ?? 'bg-[var(--alpha-bg-xs)] text-muted-foreground'
                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-background rounded px-1 -mx-1 transition-colors"
                    onClick={() => navigate(`/leads/${l.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{l.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{l.empresa}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border', stageCss)}>
                        {stageLabel}
                      </span>
                      <span className="text-xs font-semibold text-orange-600 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />{days}d
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            {stagnantLeads.length > 6 && (
              <button onClick={() => navigate('/leads')} className="mt-3 text-xs text-fg4 hover:text-muted-foreground underline w-full text-center">
                Ver todos os {stagnantLeads.length} leads parados →
              </button>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
