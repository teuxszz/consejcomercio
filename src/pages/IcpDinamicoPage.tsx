import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target, TrendingUp, History, Info, AlertCircle, Plus, Check,
  Settings2, Activity, TriangleAlert,
} from 'lucide-react'
import { useLeads } from '@/hooks/useLeads'
import { useConfiguracoes, useUpdateConfiguracoes } from '@/hooks/useConfiguracoes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import {
  getCurrentYear,
  isCurrentCycle,
  formatPeriodLabel,
  type PeriodValue,
} from '@/lib/periods'
import { calcularIcpDinamico, type IcpDistribItem, type Conviccao } from '@/lib/icp-dinamico'
import { SEGMENTS, BUDGET_OPTIONS } from '@/lib/constants'
import type { ServicoConfig } from '@/types'
import { cn } from '@/lib/utils'

const SEGMENT_LABELS = Object.fromEntries(SEGMENTS.map(s => [s.value, s.label]))
const BUDGET_LABELS  = Object.fromEntries(BUDGET_OPTIONS.map(b => [b.value, b.label]))

const CONVICCAO_STYLES: Record<Conviccao, { label: string; className: string }> = {
  alta:         { label: 'Alta convicção',   className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  preliminar:   { label: 'Preliminar',       className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  insuficiente: { label: 'Insuficiente',     className: 'bg-[var(--alpha-bg-md)] text-muted-foreground border-[var(--alpha-border-md)]' },
}

type Dimension = 'segmento' | 'investimento'

export function IcpDinamicoPage() {
  const navigate = useNavigate()
  const { data: leads = [] } = useLeads()
  const { data: config } = useConfiguracoes()
  const updateConfig = useUpdateConfiguracoes()
  const servicos = useMemo<ServicoConfig[]>(() => config?.servicos ?? [], [config])

  const [period, setPeriod] = useState<PeriodValue>({ year: getCurrentYear(), granularity: 'total' })
  const [servicoFilter, setServicoFilter] = useState<string>('todos')

  const servicosAtivos = useMemo(() => servicos.filter(s => s.ativo !== false), [servicos])

  const observados = useMemo(
    () => calcularIcpDinamico(leads, period, servicosAtivos.map(s => s.id)),
    [leads, period, servicosAtivos]
  )

  const visiveis = useMemo(() => {
    return observados
      .map(obs => {
        const cfg = servicosAtivos.find(s => s.id === obs.servicoId)
        return cfg ? { obs, cfg } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .filter(({ obs }) => servicoFilter === 'todos' || obs.servicoId === servicoFilter)
      .sort((a, b) => b.obs.total - a.obs.total)
  }, [observados, servicosAtivos, servicoFilter])

  function drillDownGanhos(servicoId: string) {
    const qs = new URLSearchParams({ status: 'ganho', servico: servicoId })
    navigate(`/leads?${qs.toString()}`)
  }

  function drillDownItem(dim: Dimension, value: string, servicoId: string, kind: 'ganho' | 'terminal') {
    const qs = new URLSearchParams({
      status: kind === 'ganho' ? 'ganho' : 'terminal',
      servico: servicoId,
      [dim]: value,
    })
    navigate(`/leads?${qs.toString()}`)
  }

  async function promoverAoIcp(servicoId: string, dim: Dimension, value: string) {
    const novos = servicos.map<ServicoConfig>(s => {
      if (s.id !== servicoId) return s
      if (dim === 'segmento') {
        const atuais = s.segmentos_icp ?? []
        if (atuais.includes(value)) return s
        return { ...s, segmentos_icp: [...atuais, value] }
      }
      const atuais = s.investimento_icp ?? []
      if (atuais.includes(value)) return s
      return { ...s, investimento_icp: [...atuais, value] }
    })
    await updateConfig.mutateAsync({ servicos: novos })
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">ICP Dinâmico</h1>
            <span className="text-sm text-fg2">— {formatPeriodLabel(period)}</span>
            {!isCurrentCycle(period) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <History className="w-3 h-3" />
                Histórico
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compara o ICP <strong className="text-fg2">teórico</strong> (configurado pela CONSEJ) com o <strong className="text-fg2">observado</strong> (extraído dos ganhos do período). Convicção e distribuição usam apenas leads com <code className="text-[11px] px-1 py-0.5 rounded bg-[var(--alpha-bg-sm)]">servicos_interesse</code> identificado.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={leads ?? []} />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={servicoFilter} onValueChange={setServicoFilter}>
          <SelectTrigger className="h-8 text-xs w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os serviços</SelectItem>
            {servicosAtivos.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visiveis.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-8 h-8 text-fg4 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum serviço configurado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visiveis.map(({ obs, cfg }) => {
            const winRateGlobal = obs.total_funil
              ? Math.round((obs.total / obs.total_funil) * 100)
              : 0
            // Aviso quando há mais ganhos "atribuíveis" (sem tag) do que diretos
            const muitosAtribuiveis = obs.total_atribuivel > 0 && obs.total_atribuivel >= obs.total
            return (
              <Card key={obs.servicoId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#0089ac]" />
                      <span>{cfg.nome}</span>
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border', CONVICCAO_STYLES[obs.conviccao].className)}>
                        {CONVICCAO_STYLES[obs.conviccao].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
                      {obs.total_funil > 0 && (
                        <span title="Win rate global: ganhos diretos / leads diretos que fecharam">
                          <strong className="text-foreground tabular-nums">{winRateGlobal}%</strong> win rate
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); drillDownGanhos(obs.servicoId) }}
                        className="underline-offset-2 hover:underline hover:text-[#0089ac] disabled:no-underline disabled:cursor-default"
                        disabled={obs.total === 0}
                        title={obs.total === 0 ? 'Nenhum ganho com serviço identificado' : `Ver ${obs.total} lead(s) ganho(s)`}
                      >
                        {obs.total} ganho{obs.total === 1 ? '' : 's'} / {obs.total_funil} fechado{obs.total_funil === 1 ? '' : 's'}
                      </button>
                      {obs.total_atribuivel > 0 && (
                        <span
                          className="text-amber-400/90 tabular-nums"
                          title={`${obs.total_atribuivel} ganho(s) sem servicos_interesse — atribuíveis a qualquer serviço, não entram na distribuição`}
                        >
                          + {obs.total_atribuivel} sem tag
                        </span>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {obs.conviccao === 'insuficiente' && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        Menos de 3 ganhos identificados para este serviço — exibindo apenas o ICP teórico.
                      </p>
                    </div>
                  )}

                  {muitosAtribuiveis && (
                    <div className="flex items-start gap-2 text-xs p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)', color: '#fbbf24' }}>
                      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        {obs.total_atribuivel} de {obs.total + obs.total_atribuivel} ganhos não têm <code className="text-[11px] px-1 py-0.5 rounded bg-amber-500/15">servicos_interesse</code> preenchido. A estatística está imprecisa — peça ao time pra taggear os leads no fechamento.
                      </p>
                    </div>
                  )}

                  {/* Segmentos */}
                  <DimensionSection
                    titulo="Segmentos"
                    dim="segmento"
                    servicoId={obs.servicoId}
                    configurados={cfg.segmentos_icp ?? []}
                    observadosTop={obs.segmentos}
                    observadosFull={obs.segmentos_full}
                    resolve={SEGMENT_LABELS}
                    onPromover={promoverAoIcp}
                    onDrillDown={drillDownItem}
                    isPromoting={updateConfig.isPending}
                  />

                  {/* Investimentos */}
                  <DimensionSection
                    titulo="Investimento estimado"
                    dim="investimento"
                    servicoId={obs.servicoId}
                    configurados={cfg.investimento_icp ?? []}
                    observadosTop={obs.investimentos}
                    observadosFull={obs.investimentos_full}
                    resolve={BUDGET_LABELS}
                    onPromover={promoverAoIcp}
                    onDrillDown={drillDownItem}
                    isPromoting={updateConfig.isPending}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <p>
          Convicção: <strong>alta</strong> = 10+ ganhos identificados · <strong>preliminar</strong> = 3-9 · <strong>insuficiente</strong> = &lt; 3.
          Para ajustar manualmente o ICP, edite os serviços em <span className="text-[#0089ac]">Configurações → Serviços</span>.
        </p>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface DimensionSectionProps {
  titulo: string
  dim: Dimension
  servicoId: string
  configurados: string[]
  observadosTop: IcpDistribItem[]
  observadosFull: IcpDistribItem[]
  resolve: Record<string, string>
  onPromover: (servicoId: string, dim: Dimension, value: string) => void
  onDrillDown: (dim: Dimension, value: string, servicoId: string, kind: 'ganho' | 'terminal') => void
  isPromoting: boolean
}

// Estilos contrastantes — esquerda = TEORIA (neutro), direita = PRÁTICA (teal)
const TEORIA_STYLE  = { background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }
const PRATICA_STYLE = { background: 'rgba(0,137,172,0.07)', border: '1px solid rgba(0,137,172,0.30)' }

function DimensionSection({
  titulo, dim, servicoId, configurados,
  observadosTop, observadosFull, resolve,
  onPromover, onDrillDown, isPromoting,
}: DimensionSectionProps) {
  const observadosByValue = useMemo(
    () => new Map(observadosFull.map(o => [o.value, o])),
    [observadosFull],
  )
  const configSet = useMemo(() => new Set(configurados), [configurados])

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg4 mb-2">{titulo}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ─── TEORIA — configurado ─── */}
        <div className="rounded-lg p-3" style={TEORIA_STYLE}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Settings2 className="w-3 h-3 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Teoria · ICP configurado</p>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-fg4">O que esperamos</span>
          </div>
          {configurados.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">—</p>
          ) : (
            <div className="space-y-1">
              {configurados.map(v => {
                const perf = observadosByValue.get(v)
                const status: 'sem_dado' | 'zero' | 'positivo' =
                  !perf ? 'sem_dado' : perf.count === 0 ? 'zero' : 'positivo'
                const tooltip =
                  status === 'sem_dado' ? 'Nenhum lead identificado para este perfil fechou no período'
                  : status === 'zero'   ? `${perf!.total_funil} lead(s) identificado(s) deste perfil, 0 ganhos`
                  : `${perf!.count} ganho(s) de ${perf!.total_funil} fechado(s) — ${perf!.taxa_conversao}% win rate`
                return (
                  <div key={v} className="flex items-center gap-2 text-xs" title={tooltip}>
                    <span className={cn(
                      'inline-block w-2 h-2 rounded-full shrink-0',
                      status === 'positivo' ? 'bg-emerald-400'
                      : status === 'zero'   ? 'bg-rose-400'
                      : 'bg-[var(--alpha-bg-lg)]',
                    )} />
                    <span className="flex-1 truncate text-fg2">{resolve[v] ?? v}</span>
                    {perf ? (
                      <button
                        type="button"
                        onClick={() => onDrillDown(dim, v, servicoId, 'terminal')}
                        className="text-muted-foreground tabular-nums hover:text-[#0089ac] hover:underline underline-offset-2"
                      >
                        {perf.count}/{perf.total_funil} · {perf.taxa_conversao}%
                      </button>
                    ) : (
                      <span className="text-muted-foreground tabular-nums opacity-60">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── PRÁTICA — observado ─── */}
        <div className="rounded-lg p-3" style={PRATICA_STYLE}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-[#6bd0e7]" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6bd0e7]">Prática · ICP observado</p>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-[#6bd0e7]/70">O que fechou</span>
          </div>
          {observadosTop.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">— Nenhum ganho com tag no período</p>
          ) : (
            <div className="space-y-1">
              {observadosTop.map(item => {
                const jaConfigurado = configSet.has(item.value)
                return (
                  <div key={item.value} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      'inline-block w-2 h-2 rounded-full shrink-0',
                      jaConfigurado ? 'bg-emerald-400' : 'bg-amber-400',
                    )} title={jaConfigurado ? 'Já está no ICP teórico' : 'Divergente do ICP teórico — considere promover'} />
                    <span className="flex-1 truncate text-fg2">{resolve[item.value] ?? item.value}</span>
                    <button
                      type="button"
                      onClick={() => onDrillDown(dim, item.value, servicoId, 'ganho')}
                      className="text-muted-foreground tabular-nums hover:text-[#0089ac] hover:underline underline-offset-2"
                      title={`Ver ${item.count} ganho(s) deste perfil`}
                    >
                      {item.count} · {item.pct}%
                    </button>
                    {jaConfigurado ? (
                      <Check className="w-3 h-3 text-emerald-500/60 shrink-0" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPromover(servicoId, dim, item.value)}
                        disabled={isPromoting}
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#0089ac]/40 text-[#0089ac] hover:bg-[#0089ac]/10 disabled:opacity-50"
                        title="Promover este perfil ao ICP teórico"
                      >
                        <Plus className="w-2.5 h-2.5" /> ICP
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
