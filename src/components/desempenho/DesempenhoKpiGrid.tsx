// Phase 8 (Plan 02) — Grid 4x2 de KPI cards com as 8 metricas DesempenhoMetricas (D-11).
// Ordem (per D-11):
//   Linha 1: Leads criados | Convertidos | Perdidos | Win Rate
//   Linha 2: Ciclo medio | ICP fit medio | Tarefas concluidas | NPS medio
// Null-safe: ciclo/icp/nps renderizam "—" quando null (KPICard cuida).

import { CheckCircle2, CheckSquare, Clock, Star, Target, Trophy, Users, XCircle } from 'lucide-react'
import { KPICard } from './KPICard'
import type { DesempenhoMetricas } from '@/types'

interface Props {
  metrics: DesempenhoMetricas
}

export function DesempenhoKpiGrid({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard title="Leads criados"        value={metrics.leads_criados}                                            icon={Users}        tone="cyan" />
      <KPICard title="Convertidos"          value={metrics.convertidos}                                              icon={CheckCircle2} tone="emerald" />
      <KPICard title="Perdidos"             value={metrics.perdidos}                                                 icon={XCircle}      tone="destructive" />
      <KPICard title="Win Rate"             value={`${metrics.win_rate}%`}                                           icon={Trophy}       tone="amber" />
      <KPICard title="Ciclo médio"          value={metrics.ciclo_medio_dias === null ? null : `${metrics.ciclo_medio_dias}d`} icon={Clock} tone="cyan" />
      <KPICard title="ICP fit médio"        value={metrics.icp_fit_medio === null ? null : `${metrics.icp_fit_medio}%`}       icon={Target} tone="emerald" />
      <KPICard title="Tarefas concluídas"   value={metrics.tarefas_concluidas}                                       icon={CheckSquare}  tone="cyan" />
      <KPICard title="NPS médio"            value={metrics.nps_medio === null ? null : metrics.nps_medio.toFixed(1)} icon={Star}         tone="amber" />
    </div>
  )
}
