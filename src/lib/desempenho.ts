// Phase 8 (D-03) — Helper puro `calcularDesempenho` que agrega as 8 metricas
// de performance individual de um consultor num periodo (REP-01).
//
// Regras de negocio:
//   - leads_criados   = leads filtrados por responsavel_id === perfilId
//                       AND created_at IN periodo
//   - convertidos     = subset de leads_criados em TERMINAL_WON_STAGES
//   - perdidos        = subset de leads_criados em TERMINAL_LOST_STAGES
//   - ciclo_medio_dias = AVG(updated_at - created_at) em dias, apenas para
//                        ganhos com diff >= 1 dia. `null` quando sem ganhos.
//   - win_rate        = round((ganhos / (ganhos + perdidos)) * 100). 0 quando
//                        denominador zero (sem fechamentos terminais).
//   - icp_fit_medio   = round((# leads do perfil com ICP fit / leads_criados)
//                        * 100). `null` quando perfil nao tem leads no
//                        periodo. Reusa calcularIcpDinamico + buildIcpFitContext
//                        + isLeadIcpFit (Phase 1).
//   - tarefas_concluidas = tarefas atribuido_a_id === perfilId AND
//                          status === 'concluida' AND data_conclusao IN periodo
//   - nps_medio       = AVG clientes.nps_score. Clientes do perfil sao
//                       derivados via contratos.responsavel_id === perfilId
//                       (per OQ-1 resolved — Cliente nao tem responsavel_id
//                       direto, somente Contrato tem). `null` quando nenhum
//                       cliente do perfil tem nps_score.
//
// Determinismo: nenhuma chamada a Date.now() ou random. Todas as datas vem
// dos dados de entrada. Mesmo input -> mesmo output. Testavel sem mocks de
// tempo.

import type { Lead, Tarefa, Cliente, Contrato, DesempenhoMetricas } from '@/types'
import type { PeriodValue } from './periods'
import { getPeriodRange, isInRange } from './periods'
import { TERMINAL_WON_STAGES, TERMINAL_LOST_STAGES } from './constants'
import { calcularIcpDinamico, buildIcpFitContext, isLeadIcpFit } from './icp-dinamico'

export interface CalcularDesempenhoInput {
  leads: Lead[]
  tarefas: Tarefa[]
  clientes: Cliente[]
  contratos: Contrato[]
  perfilId: string
  perfilNome: string
  periodo: PeriodValue
  servicosConfig: Array<{ id: string; segmentos_icp?: string[]; investimento_icp?: string[] }>
}

const MS_PER_DAY = 86400000

export function calcularDesempenho(input: CalcularDesempenhoInput): DesempenhoMetricas {
  const { leads, tarefas, clientes, contratos, perfilId, perfilNome, periodo, servicosConfig } = input
  const range = getPeriodRange(periodo)

  // Filtragem basica por responsavel_id + periodo
  const leadsPerfil = leads.filter(
    l => l.responsavel_id === perfilId && isInRange(l.created_at, range),
  )
  const ganhos = leadsPerfil.filter(
    l => (TERMINAL_WON_STAGES as readonly string[]).includes(l.status),
  )
  const perdas = leadsPerfil.filter(
    l => (TERMINAL_LOST_STAGES as readonly string[]).includes(l.status),
  )

  // Ciclo medio (apenas ganhos com diff >= 1 dia)
  const ciclos = ganhos
    .map(l => Math.floor((new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / MS_PER_DAY))
    .filter(d => d >= 1)
  const ciclo_medio_dias = ciclos.length
    ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length)
    : null

  // Win rate
  const fechados = ganhos.length + perdas.length
  const win_rate = fechados > 0 ? Math.round((ganhos.length / fechados) * 100) : 0

  // ICP fit medio — reusa Phase 1
  const servicoIds = servicosConfig.map(s => s.id)
  const observados = calcularIcpDinamico(leads, periodo, servicoIds)
  const ctx = buildIcpFitContext(observados, servicosConfig)
  const fitCount = leadsPerfil.filter(l => isLeadIcpFit(l, ctx)).length
  const icp_fit_medio = leadsPerfil.length > 0
    ? Math.round((fitCount / leadsPerfil.length) * 100)
    : null

  // Tarefas concluidas no periodo
  const tarefasPerfil = tarefas.filter(
    t => t.atribuido_a_id === perfilId
      && t.status === 'concluida'
      && t.data_conclusao
      && isInRange(t.data_conclusao, range),
  )

  // NPS medio — clientes do perfil derivados via contratos.responsavel_id (OQ-1 / Pitfall 6).
  const clienteIdsDoPerfil = new Set(
    contratos
      .filter(c => c.responsavel_id === perfilId)
      .map(c => c.cliente_id),
  )
  const clientesDoPerfil = clientes.filter(
    cli => clienteIdsDoPerfil.has(cli.id) && typeof cli.nps_score === 'number',
  )
  const nps_medio = clientesDoPerfil.length > 0
    ? Math.round((clientesDoPerfil.reduce((s, c) => s + (c.nps_score as number), 0) / clientesDoPerfil.length) * 10) / 10
    : null

  return {
    perfilId,
    perfilNome,
    periodo,
    leads_criados: leadsPerfil.length,
    convertidos: ganhos.length,
    perdidos: perdas.length,
    ciclo_medio_dias,
    win_rate,
    icp_fit_medio,
    tarefas_concluidas: tarefasPerfil.length,
    nps_medio,
  }
}
