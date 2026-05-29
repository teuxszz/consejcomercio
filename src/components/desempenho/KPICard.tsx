// Phase 8 (Plan 02) — KPI card para relatorios de desempenho (REP-01).
// Espelha o KpiCard inline de src/pages/ReceitaPage.tsx:80-106, removendo
// onClick (PDF estatico) e adicionando null-safety:
//   - value === null → renderiza "—" (fallback NPS undefined per Claude's
//     Discretion / Pitfall 6)
//   - Sempre tabular-nums para alinhamento decimal no PDF
//   - Cores fixas hex via tone (paleta CONSEJ D-11) para html2canvas
//     conseguir resolver (CSS vars sao perigosas — Pitfall 2 RESEARCH).

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Tone = 'cyan' | 'emerald' | 'amber' | 'destructive'

interface Props {
  title: string
  value: string | number | null
  icon: React.FC<{ className?: string }>
  tone?: Tone
}

const TONE_CLASS: Record<Tone, string> = {
  cyan:        'text-cyan-500',
  emerald:     'text-emerald-500',
  amber:       'text-amber-500',
  destructive: 'text-destructive',
}

export function KPICard({ title, value, icon: Icon, tone = 'cyan' }: Props) {
  const display = value === null ? '—' : value
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</span>
          <Icon className={cn('w-4 h-4', TONE_CLASS[tone])} />
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{display}</p>
      </CardContent>
    </Card>
  )
}
