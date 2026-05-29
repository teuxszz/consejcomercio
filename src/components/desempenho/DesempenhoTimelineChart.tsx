// Phase 8 (Plan 02) — Timeline mensal de leads criados pelo consultor no ano
// do periodo selecionado. LineChart recharts com 12 buckets (jan-dez).
// CRITICAL: isAnimationActive={false} (Pitfall 1) e cores hex (Pitfall 2).

import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Lead } from '@/types'
import type { PeriodValue } from '@/lib/periods'

interface Props {
  leads: Lead[]
  periodo: PeriodValue
  perfilId: string
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const COLOR_LINE = '#0089ac'
const COLOR_TEXT = '#0d1929'

export function DesempenhoTimelineChart({ leads, periodo, perfilId }: Props) {
  const data = useMemo(() => {
    const buckets = MONTHS_PT.map((label) => ({ month: label, count: 0 }))
    for (const l of leads) {
      if (l.responsavel_id !== perfilId) continue
      if (!l.created_at) continue
      const d = new Date(l.created_at)
      if (d.getFullYear() !== periodo.year) continue
      const m = d.getMonth()
      if (m >= 0 && m < 12) buckets[m].count += 1
    }
    return buckets
  }, [leads, periodo.year, perfilId])

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: COLOR_TEXT }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLOR_TEXT }} />
        <Tooltip
          contentStyle={{ background: 'white', border: '1px solid #e2e8f0', color: COLOR_TEXT, borderRadius: 8, fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke={COLOR_LINE}
          strokeWidth={2}
          dot={{ r: 3, fill: COLOR_LINE }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
