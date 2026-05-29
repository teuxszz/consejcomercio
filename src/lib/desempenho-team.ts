// Phase 8 Plan 04 (D-07 + RESEARCH §Pattern 4) — Helpers puros de agregacao
// para o relatorio de equipe (REP-04).
//
// Separamos agregacao (puro, testavel aqui) da iteracao de captura
// (em pdf-export.ts, que precisa de DOM + AbortController + html2canvas).
//
// "Consultor ativo" = role='consultor' AND criou >=1 lead no periodo (D-07).
//
// Os totais sao calculados como:
//   - leads_criados / convertidos / perdidos / tarefas_concluidas: SUM
//   - win_rate: round((sum_ganhos / (sum_ganhos + sum_perdidos)) * 100)
//   - ciclo_medio_dias: media ponderada por convertidos (sum(ciclo*conv)/sum(conv))
//     -> null quando sum(conv) == 0
//   - icp_fit_medio: media simples dos consultores com valor nao-null
//     -> null quando todos sao null
//   - nps_medio: media simples dos consultores com valor nao-null
//     -> null quando todos sao null
//
// Determinismo: nenhuma chamada a Date.now() ou random. Funcoes puras.

import type {
  Lead,
  Tarefa,
  Cliente,
  Contrato,
  DesempenhoMetricas,
  DesempenhoConsultorTeam,
} from '@/types'
import type { Perfil } from '@/hooks/usePerfis'
import type { PeriodValue } from './periods'
import { getPeriodRange, isInRange } from './periods'
import { calcularDesempenho } from './desempenho'

export function filtrarConsultoresAtivos(
  perfis: Perfil[],
  leads: Lead[],
  periodo: PeriodValue,
): Perfil[] {
  const range = getPeriodRange(periodo)
  return perfis.filter(
    p =>
      p.role === 'consultor' &&
      leads.some(l => l.responsavel_id === p.id && isInRange(l.created_at, range)),
  )
}

export function rankConsultores(
  consultores: DesempenhoConsultorTeam[],
): DesempenhoConsultorTeam[] {
  return [...consultores].sort((a, b) => b.metricas.convertidos - a.metricas.convertidos)
}

export interface DesempenhoEquipeResult {
  totais: DesempenhoMetricas
  consultores: DesempenhoConsultorTeam[]
}

export interface CalcularDesempenhoEquipeInput {
  perfis: Perfil[]
  leads: Lead[]
  tarefas: Tarefa[]
  clientes: Cliente[]
  contratos: Contrato[]
  periodo: PeriodValue
  servicosConfig: Array<{ id: string; segmentos_icp?: string[]; investimento_icp?: string[] }>
}

export function calcularDesempenhoEquipe(
  input: CalcularDesempenhoEquipeInput,
): DesempenhoEquipeResult {
  const ativos = filtrarConsultoresAtivos(input.perfis, input.leads, input.periodo)

  const consultores: DesempenhoConsultorTeam[] = ativos.map(p => ({
    perfilId: p.id,
    perfilNome: p.nome,
    metricas: calcularDesempenho({
      leads: input.leads,
      tarefas: input.tarefas,
      clientes: input.clientes,
      contratos: input.contratos,
      perfilId: p.id,
      perfilNome: p.nome,
      periodo: input.periodo,
      servicosConfig: input.servicosConfig,
    }),
  }))

  // ─── Totais agregados ────────────────────────────────────────────────────
  const sum = (fn: (m: DesempenhoMetricas) => number): number =>
    consultores.reduce((acc, c) => acc + fn(c.metricas), 0)

  const leads_criados = sum(m => m.leads_criados)
  const convertidos = sum(m => m.convertidos)
  const perdidos = sum(m => m.perdidos)
  const tarefas_concluidas = sum(m => m.tarefas_concluidas)

  const fechados = convertidos + perdidos
  const win_rate = fechados > 0 ? Math.round((convertidos / fechados) * 100) : 0

  // Ciclo medio ponderado por convertidos
  const cicloNumerador = consultores.reduce((acc, c) => {
    const m = c.metricas
    return m.ciclo_medio_dias !== null ? acc + m.ciclo_medio_dias * m.convertidos : acc
  }, 0)
  const cicloDenominador = consultores.reduce(
    (acc, c) => (c.metricas.ciclo_medio_dias !== null ? acc + c.metricas.convertidos : acc),
    0,
  )
  const ciclo_medio_dias = cicloDenominador > 0 ? Math.round(cicloNumerador / cicloDenominador) : null

  // ICP fit medio (simples nos non-null)
  const icpVals = consultores
    .map(c => c.metricas.icp_fit_medio)
    .filter((v): v is number => v !== null)
  const icp_fit_medio =
    icpVals.length > 0 ? Math.round(icpVals.reduce((a, b) => a + b, 0) / icpVals.length) : null

  // NPS medio (simples nos non-null)
  const npsVals = consultores
    .map(c => c.metricas.nps_medio)
    .filter((v): v is number => v !== null)
  const nps_medio =
    npsVals.length > 0
      ? Math.round((npsVals.reduce((a, b) => a + b, 0) / npsVals.length) * 10) / 10
      : null

  const totais: DesempenhoMetricas = {
    perfilId: '_equipe_',
    perfilNome: 'Equipe CONSEJ',
    periodo: input.periodo,
    leads_criados,
    convertidos,
    perdidos,
    ciclo_medio_dias,
    win_rate,
    icp_fit_medio,
    tarefas_concluidas,
    nps_medio,
  }

  return { totais, consultores }
}
