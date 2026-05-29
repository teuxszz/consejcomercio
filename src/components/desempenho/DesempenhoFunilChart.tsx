// Phase 8 (Plan 02) — Funil de conversao: leads criados / convertidos / perdidos.
// BarChart horizontal recharts. Cores fixas hex (paleta CONSEJ) — html2canvas
// nao resolve CSS vars confiavelmente (Pitfall 2 RESEARCH).
// CRITICAL: isAnimationActive={false} (Pitfall 1 RESEARCH) — sem isso a captura
// PDF pega frame intermediario da animacao e renderiza area vazia.

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DesempenhoMetricas } from '@/types'

interface Props {
  metrics: DesempenhoMetricas
}

const COLOR_BAR = '#0089ac'           // cyan-hi (paleta CONSEJ)
const COLOR_TEXT = '#0d1929'          // cinza-azulado dark (legivel em light bg)

export function DesempenhoFunilChart({ metrics }: Props) {
  const data = [
    { name: 'Criados',     value: metrics.leads_criados },
    { name: 'Convertidos', value: metrics.convertidos },
    { name: 'Perdidos',    value: metrics.perdidos },
  ]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <XAxis type="number" tick={{ fontSize: 11, fill: COLOR_TEXT }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: COLOR_TEXT }} width={90} />
        <Tooltip
          contentStyle={{ background: 'white', border: '1px solid #e2e8f0', color: COLOR_TEXT, borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="value" isAnimationActive={false} fill={COLOR_BAR} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
