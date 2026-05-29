// Phase 8 (Plan 02) — Distribuicao de tarefas do consultor por status (aberta /
// em_andamento / concluida) filtradas por atribuido_a_id + periodo.
// Filtro de periodo aplicado em data_vencimento via isInRange (Phase 4).
// CRITICAL: isAnimationActive={false} (Pitfall 1) e cores hex (Pitfall 2).

import { useMemo } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Tarefa } from '@/types'
import type { PeriodValue } from '@/lib/periods'
import { getPeriodRange, isInRange } from '@/lib/periods'

interface Props {
  tarefas: Tarefa[]
  periodo: PeriodValue
  perfilId: string
}

const COLOR_BAR = '#0089ac'
const COLOR_TEXT = '#0d1929'

export function DesempenhoTarefasChart({ tarefas, periodo, perfilId }: Props) {
  const data = useMemo(() => {
    const range = getPeriodRange(periodo)
    const buckets = { aberta: 0, em_andamento: 0, concluida: 0 }
    for (const t of tarefas) {
      if (t.atribuido_a_id !== perfilId) continue
      if (!t.data_vencimento) continue
      if (!isInRange(t.data_vencimento, range)) continue
      if (t.status === 'aberta')        buckets.aberta += 1
      else if (t.status === 'em_andamento') buckets.em_andamento += 1
      else if (t.status === 'concluida')    buckets.concluida += 1
    }
    return [
      { name: 'Aberta',      value: buckets.aberta },
      { name: 'Em andamento', value: buckets.em_andamento },
      { name: 'Concluída',   value: buckets.concluida },
    ]
  }, [tarefas, periodo, perfilId])

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: COLOR_TEXT }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: COLOR_TEXT }} width={110} />
        <Tooltip
          contentStyle={{ background: 'white', border: '1px solid #e2e8f0', color: COLOR_TEXT, borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="value" isAnimationActive={false} fill={COLOR_BAR} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
