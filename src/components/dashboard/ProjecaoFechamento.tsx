import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Activity, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { calcularProjecaoMensal } from '@/lib/projecao'
import { cn } from '@/lib/utils'

interface LeadLike {
  status: string
  updated_at: string
}

interface Props {
  leads: LeadLike[]
  /** Lookback em meses para a média móvel. Default 3. */
  lookbackMonths?: number
  className?: string
}

const CURRENT_MONTH_LABEL = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

export function ProjecaoFechamento({ leads, lookbackMonths = 3, className }: Props) {
  const proj = useMemo(
    () => calcularProjecaoMensal(leads, { lookbackMonths }),
    [leads, lookbackMonths]
  )

  const insuficiente = proj.mesesUsados === 0

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-400" />
          Projeção de fechamento — {CURRENT_MONTH_LABEL}
          <span className="text-xs font-normal text-fg4 ml-1">
            {insuficiente
              ? '— histórico insuficiente'
              : `— média de ${proj.baseHistorica.toFixed(1)}/mês (últimos ${lookbackMonths} meses)`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {insuficiente ? (
          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Ainda não há ganhos suficientes nos últimos {lookbackMonths} meses para projetar.
              {proj.cenarioAtual > 0 && <span> Mas você já fechou <strong className="text-emerald-400">{proj.cenarioAtual}</strong> {proj.cenarioAtual === 1 ? 'cliente' : 'clientes'} este mês.</span>}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <ScenarioCard
                label="Pessimista"
                value={proj.pessimista}
                tone="lo"
                icon={TrendingDown}
              />
              <ScenarioCard
                label="Realista"
                value={proj.realista}
                tone="mid"
                icon={Activity}
                highlight
              />
              <ScenarioCard
                label="Otimista"
                value={proj.otimista}
                tone="hi"
                icon={TrendingUp}
              />
            </div>

            {proj.cenarioAtual > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                <strong className="text-emerald-400">{proj.cenarioAtual}</strong> {proj.cenarioAtual === 1 ? 'fechamento confirmado' : 'fechamentos confirmados'} no mês corrente —{' '}
                {proj.cenarioAtual >= proj.realista
                  ? <span className="text-emerald-400">acima da média.</span>
                  : <span>{proj.realista - proj.cenarioAtual} para atingir o realista.</span>}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface ScenarioProps {
  label: string
  value: number
  tone: 'lo' | 'mid' | 'hi'
  icon: React.FC<{ className?: string }>
  highlight?: boolean
}

const TONE_STYLES: Record<ScenarioProps['tone'], { bg: string; border: string; text: string; accent: string }> = {
  lo:  { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.25)',  text: '#fca5a5', accent: 'text-red-400' },
  mid: { bg: 'rgba(0,137,172,0.10)',  border: 'rgba(0,137,172,0.30)',  text: '#6bd0e7', accent: 'text-cyan-400' },
  hi:  { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)', text: '#6ee7b7', accent: 'text-emerald-400' },
}

function ScenarioCard({ label, value, tone, icon: Icon, highlight }: ScenarioProps) {
  const s = TONE_STYLES[tone]
  return (
    <div
      className={cn('rounded-xl p-3', highlight && 'ring-1 ring-[rgba(0,137,172,0.40)]')}
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', s.accent)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: s.text }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold" style={{ color: s.text }}>{value}</p>
    </div>
  )
}
