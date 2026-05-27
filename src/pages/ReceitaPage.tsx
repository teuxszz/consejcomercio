import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, TrendingUp, AlertTriangle, ChevronRight, ChevronDown, BarChart3,
} from 'lucide-react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useContratos } from '@/hooks/useContratos'
import { RequireRole } from '@/components/shared/RequireRole'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import { ResponsavelBadge } from '@/components/shared/ResponsavelBadge'
import {
  getPeriodRange,
  type PeriodValue,
} from '@/lib/periods'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import {
  calcularMrr,
  calcularReceitaPontualPeriodo,
  calcularMrrHistorico,
  calcularForecast,
  classificarRenovacoes,
  contribuicaoMensal,
} from '@/lib/receita'
import type { Contrato } from '@/types'

// ─── ChartPoint: histórico + forecast num único array para o ComposedChart ───
interface ChartPoint {
  month: string
  mrr: number | null
  forecastHigh: number | null
  forecastLow: number | null
  divider?: boolean
}

function buildChartData(
  historico: { monthLabel: string; mrr: number }[],
  forecast: { monthLabel: string; baseline: number }[],
): ChartPoint[] {
  const points: ChartPoint[] = historico.map(h => ({
    month: h.monthLabel,
    mrr: h.mrr,
    forecastHigh: null,
    forecastLow: null,
  }))
  // Marca o último ponto histórico também como base do forecast (visual smooth)
  if (points.length > 0 && forecast.length > 0) {
    const last = points[points.length - 1]
    if (last.mrr !== null) {
      last.forecastHigh = last.mrr
      last.forecastLow = last.mrr
      last.divider = true
    }
  }
  for (const f of forecast) {
    // Decisão cosmética: faixa = ±15% como banda de "se ~15% renovar/cair"
    points.push({
      month: f.monthLabel,
      mrr: null,
      forecastHigh: f.baseline * 1.05,
      forecastLow: f.baseline * 0.85,
    })
  }
  return points
}

// ─── Card clicável (a11y: role=button + onKeyDown) ───────────────────────────
interface KpiCardProps {
  title: string
  value: string
  icon: React.FC<{ className?: string }>
  onClick: () => void
  emphasis?: 'destructive' | 'default'
}

function KpiCard({ title, value, icon: Icon, onClick, emphasis = 'default' }: KpiCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'cursor-pointer transition-all hover:border-cyan-600/60 hover:shadow-md',
        emphasis === 'destructive' && 'border-destructive/40',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</span>
          <Icon className={cn('w-4 h-4', emphasis === 'destructive' ? 'text-destructive' : 'text-cyan-500')} />
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Sub-card de breakdown (Row 2) ───────────────────────────────────────────
function BreakdownCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
        <p className="text-lg font-semibold text-foreground tabular-nums mt-1">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Linha de renovação ──────────────────────────────────────────────────────
function RenovacaoItem({
  contrato,
  daysLeft,
  destructive,
  onClick,
}: {
  contrato: Contrato
  daysLeft: number
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg cursor-pointer hover:bg-[var(--alpha-bg-xs)] transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {destructive && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {contrato.cliente?.nome ?? 'Cliente sem nome'}
            {contrato.cliente?.empresa && (
              <span className="text-muted-foreground font-normal"> — {contrato.cliente.empresa}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(contribuicaoMensal(contrato))}/mês · vence {formatDate(contrato.data_fim)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ResponsavelBadge perfilId={contrato.responsavel_id} showName={false} size={20} />
        {destructive
          ? <Badge variant="destructive">{daysLeft} dias</Badge>
          : <Badge variant="secondary">{daysLeft} dias</Badge>
        }
      </div>
    </div>
  )
}

// ─── Conteúdo ─────────────────────────────────────────────────────────────────
function ReceitaPageContent() {
  const { data: contratos = [], isLoading } = useContratos()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PeriodValue>({
    year: new Date().getFullYear(),
    granularity: 'total',
  })
  const [showSemDataFim, setShowSemDataFim] = useState(false)

  const mrr = useMemo(() => calcularMrr(contratos), [contratos])
  const historico = useMemo(() => calcularMrrHistorico(contratos, { months: 6 }), [contratos])
  const forecast = useMemo(() => calcularForecast(contratos, { months: 3 }), [contratos])
  const buckets = useMemo(() => classificarRenovacoes(contratos), [contratos])

  // per D-01 Row 2 + Open Q2 RESOLVED — PeriodSelector afeta APENAS este número
  const receitaPontualPeriodo = useMemo(() => {
    const range = getPeriodRange(period)
    return calcularReceitaPontualPeriodo(contratos, { start: range.from, end: range.to })
  }, [contratos, period])

  const chartData = useMemo(() => buildChartData(historico, forecast), [historico, forecast])
  const lastHistoricLabel = historico.length > 0 ? historico[historico.length - 1].monthLabel : null

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>
  }

  if (contratos.length === 0) {
    return (
      <EmptyState
        icon={DollarSign}
        title="Sem contratos para calcular receita"
        description="Cadastre contratos em /contratos para popular este dashboard."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Receita</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Período filtra apenas “Receita pontual no período” abaixo. Gráfico mostra sempre últimos 6m + próximos 3m.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={contratos} />
      </div>

      {/* ── Row 1: 4 cards drilláveis ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="MRR"
          value={formatCurrency(mrr.total)}
          icon={DollarSign}
          onClick={() => navigate('/contratos?status=ativo')}
        />
        <KpiCard
          title="ARR projetado"
          value={formatCurrency(mrr.total * 12)}
          icon={TrendingUp}
          onClick={() => navigate('/contratos?status=ativo')}
        />
        <KpiCard
          title="Forecast 3m"
          value={formatCurrency(forecast[forecast.length - 1]?.baseline ?? mrr.total)}
          icon={BarChart3}
          onClick={() => navigate('/contratos?status=ativo&vencendo_em_dias=90')}
        />
        <KpiCard
          title="Renovações ≤30d"
          value={String(buckets.ate30.length)}
          icon={AlertTriangle}
          emphasis={buckets.ate30.length > 0 ? 'destructive' : 'default'}
          onClick={() => navigate('/contratos?status=ativo&vencendo_em_dias=30')}
        />
      </div>

      {/* ── Row 2: Breakdown por tipo ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BreakdownCard
          title="MRR Assessoria"
          value={formatCurrency(mrr.assessoria)}
          hint="Contratos com valor_mensal recorrente"
        />
        <BreakdownCard
          title="MRR Consultoria (pro-rata)"
          value={formatCurrency(mrr.consultoriaProRata)}
          hint="valor_total ÷ duração em meses"
        />
        <BreakdownCard
          title="Receita pontual no período"
          value={formatCurrency(receitaPontualPeriodo)}
          hint="Consultorias com data_inicio no período selecionado"
        />
      </div>

      {/* ── Row 3: Gráfico evolução MRR ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Evolução MRR — 6 meses + 3m forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }}
                />
                <YAxis
                  tickFormatter={(v) => 'R$' + (v / 1000).toFixed(0) + 'k'}
                  tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(typeof v === 'number' ? v : Number(v))}
                  contentStyle={{
                    background: '#0d1929',
                    border: '1px solid var(--alpha-border-md)',
                    color: 'rgba(220,230,240,0.90)',
                    borderRadius: 8,
                  }}
                />
                {lastHistoricLabel && (
                  <ReferenceLine
                    x={lastHistoricLabel}
                    stroke="rgba(0,137,172,0.35)"
                    strokeDasharray="3 3"
                    label={{ value: 'Hoje', fontSize: 9, fill: 'rgba(150,165,180,0.70)', position: 'top' }}
                  />
                )}
                {/* Faixa pontilhada do forecast (NÃO usar connectNulls — per Pitfall 5) */}
                <Area
                  type="monotone"
                  dataKey="forecastHigh"
                  stroke="#0089ac"
                  strokeDasharray="5 5"
                  fill="#0089ac"
                  fillOpacity={0.15}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="forecastLow"
                  stroke="transparent"
                  fill="#0089ac"
                  fillOpacity={0.05}
                  isAnimationActive={false}
                />
                {/* Linha sólida do histórico (connectNulls APENAS aqui — per Pitfall 5) */}
                <Line
                  type="monotone"
                  dataKey="mrr"
                  stroke="#0089ac"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0089ac' }}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ── Row 4: Renovações pendentes agrupadas ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Renovações pendentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          {/* ≤30d */}
          <section>
            <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              Próximos 30 dias ({buckets.ate30.length})
            </h3>
            {buckets.ate30.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Nenhuma renovação neste intervalo"
                description="Nenhum contrato com data_fim nos próximos 30 dias."
                className="py-6"
              />
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
                {buckets.ate30.map(c => (
                  <RenovacaoItem
                    key={c.id}
                    contrato={c}
                    daysLeft={c.daysLeft}
                    destructive
                    onClick={() => navigate(`/clientes/${c.cliente_id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 31-60d */}
          <section>
            <h3 className="text-xs font-semibold text-foreground mb-2">31-60 dias ({buckets.de31a60.length})</h3>
            {buckets.de31a60.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhum contrato neste intervalo.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
                {buckets.de31a60.map(c => (
                  <RenovacaoItem
                    key={c.id}
                    contrato={c}
                    daysLeft={c.daysLeft}
                    onClick={() => navigate(`/clientes/${c.cliente_id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 61-90d */}
          <section>
            <h3 className="text-xs font-semibold text-foreground mb-2">61-90 dias ({buckets.de61a90.length})</h3>
            {buckets.de61a90.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhum contrato neste intervalo.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
                {buckets.de61a90.map(c => (
                  <RenovacaoItem
                    key={c.id}
                    contrato={c}
                    daysLeft={c.daysLeft}
                    onClick={() => navigate(`/clientes/${c.cliente_id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      {/* ── Row 5: Sem data_fim (colapsada) ────────────────────────────────── */}
      {buckets.semDataFim.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <button
              type="button"
              onClick={() => setShowSemDataFim(s => !s)}
              className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-cyan-500 transition-colors w-full text-left"
              aria-expanded={showSemDataFim}
            >
              {showSemDataFim
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />
              }
              Contratos ativos sem renovação agendada ({buckets.semDataFim.length})
            </button>
          </CardHeader>
          {showSemDataFim && (
            <CardContent>
              <div className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
                {buckets.semDataFim.map(c => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/clientes/${c.cliente_id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/clientes/${c.cliente_id}`)
                      }
                    }}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--alpha-bg-xs)] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {c.cliente?.nome ?? 'Cliente sem nome'}
                        {c.cliente?.empresa && (
                          <span className="text-muted-foreground font-normal"> — {c.cliente.empresa}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.tipo}</p>
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums shrink-0">
                      {formatCurrency(contribuicaoMensal(c))}/mês
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function ReceitaPage() {
  return (
    <RequireRole atLeast="coordenador">
      <ReceitaPageContent />
    </RequireRole>
  )
}
