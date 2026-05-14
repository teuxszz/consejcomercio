import { useMemo, useState } from 'react'
import { Target, TrendingUp, History, Info, AlertCircle } from 'lucide-react'
import { useLeads } from '@/hooks/useLeads'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import {
  getCurrentYear,
  isCurrentCycle,
  formatPeriodLabel,
  type PeriodValue,
} from '@/lib/periods'
import { calcularIcpDinamico, type IcpObservadoServico, type Conviccao } from '@/lib/icp-dinamico'
import { SEGMENTS, BUDGET_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const SEGMENT_LABELS = Object.fromEntries(SEGMENTS.map(s => [s.value, s.label]))
const BUDGET_LABELS  = Object.fromEntries(BUDGET_OPTIONS.map(b => [b.value, b.label]))

const CONVICCAO_STYLES: Record<Conviccao, { label: string; className: string }> = {
  alta:         { label: 'Alta convicção',   className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  preliminar:   { label: 'Preliminar',       className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  insuficiente: { label: 'Insuficiente',     className: 'bg-[var(--alpha-bg-md)] text-muted-foreground border-[var(--alpha-border-md)]' },
}

export function IcpDinamicoPage() {
  const { data: leads = [] } = useLeads()
  const { data: config } = useConfiguracoes()
  const servicos = config?.servicos ?? []

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
            Perfil de cliente observado nos ganhos do período, comparado com o ICP configurado por serviço.
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
          {visiveis.map(({ obs, cfg }) => (
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
                  <span className="text-xs font-normal text-muted-foreground">
                    {obs.total} ganho{obs.total === 1 ? '' : 's'} no período
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {obs.conviccao === 'insuficiente' ? (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Menos de 3 ganhos neste período — exibindo apenas o ICP configurado abaixo.
                    </p>
                  </div>
                ) : null}

                {/* Segmentos */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg4 mb-2">Segmentos</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ComparisonBlock
                      label="ICP configurado"
                      kind="config"
                      items={cfg.segmentos_icp ?? []}
                      resolve={SEGMENT_LABELS}
                    />
                    <ComparisonBlock
                      label="ICP observado"
                      kind="observado"
                      items={obs.segmentos.map(s => s.value)}
                      observados={obs.segmentos}
                      resolve={SEGMENT_LABELS}
                      configSet={new Set(cfg.segmentos_icp ?? [])}
                    />
                  </div>
                </div>

                {/* Investimentos */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg4 mb-2">Investimento estimado</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ComparisonBlock
                      label="ICP configurado"
                      kind="config"
                      items={cfg.investimento_icp ?? []}
                      resolve={BUDGET_LABELS}
                    />
                    <ComparisonBlock
                      label="ICP observado"
                      kind="observado"
                      items={obs.investimentos.map(s => s.value)}
                      observados={obs.investimentos}
                      resolve={BUDGET_LABELS}
                      configSet={new Set(cfg.investimento_icp ?? [])}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <p>
          Convicção: <strong>alta</strong> = 10+ ganhos · <strong>preliminar</strong> = 3-9 ganhos · <strong>insuficiente</strong> = &lt; 3 ganhos.
          Para ajustar o ICP configurado, edite os serviços em <span className="text-[#0089ac]">Configurações → Serviços</span>.
        </p>
      </div>
    </div>
  )
}

// ─── Sub-component ────────────────────────────────────────────────────────────

interface ComparisonBlockProps {
  label: string
  kind: 'config' | 'observado'
  items: string[]
  observados?: { value: string; count: number; pct: number }[]
  resolve: Record<string, string>
  configSet?: Set<string>  // só pra kind=observado: highlight quando bate com config
}

function ComparisonBlock({ label, kind, items, observados, resolve, configSet }: ComparisonBlockProps) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg4 mb-2">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">—</p>
      ) : kind === 'config' ? (
        <div className="flex flex-wrap gap-1">
          {items.map(v => (
            <span key={v} className="text-xs px-2 py-0.5 rounded-full bg-[var(--alpha-bg-md)] text-fg2 border border-[var(--alpha-border-md)]">
              {resolve[v] ?? v}
            </span>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {observados!.map(item => {
            const isConfigMatch = configSet?.has(item.value)
            return (
              <div key={item.value} className="flex items-center gap-2 text-xs">
                <span className={cn(
                  'inline-block w-2 h-2 rounded-full shrink-0',
                  isConfigMatch ? 'bg-emerald-400' : 'bg-amber-400',
                )} title={isConfigMatch ? 'Já está no ICP configurado' : 'Não está no ICP configurado'} />
                <span className="flex-1 truncate text-fg2">{resolve[item.value] ?? item.value}</span>
                <span className="text-muted-foreground tabular-nums">{item.count} · {item.pct}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
