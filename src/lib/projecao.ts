// Projeção de fechamento mensal — cenários pessimista/realista/otimista.
//
// V1 (atual): média móvel dos últimos N meses × multiplicadores 0,7 / 1,0 / 1,3.
// V2 (futuro): win_rate por estágio × leads no estágio, distribuído por lead-time.
//
// Os multiplicadores foram escolhidos pra dar uma banda de ±30% sobre a média
// histórica — confortável o suficiente pra refletir incerteza sem exagerar.

import { differenceInCalendarMonths, startOfMonth } from 'date-fns'

export interface ProjecaoMensal {
  pessimista: number      // cenário ruim
  realista:   number      // média histórica
  otimista:   number      // cenário bom
  baseHistorica: number   // ganhos/mês médio nos últimos N meses
  mesesUsados:   number   // quantos meses tinham dado (>=1 ganho); pode ser 0
  cenarioAtual:  number   // ganhos já confirmados no mês corrente
}

interface LeadGanho {
  status: string
  updated_at: string
}

interface Options {
  lookbackMonths?: number  // default 3
  today?: Date             // override para testes
}

const WON_STATUSES = ['ganho_assessoria', 'ganho_consultoria']

const MULT_PESSIMISTA = 0.7
const MULT_OTIMISTA   = 1.3

export function calcularProjecaoMensal(
  leads: LeadGanho[],
  options: Options = {}
): ProjecaoMensal {
  const today = options.today ?? new Date()
  const lookback = options.lookbackMonths ?? 3

  const ganhos = leads.filter(l => WON_STATUSES.includes(l.status))

  const inicioMesAtual = startOfMonth(today)

  // Ganhos confirmados no mês atual (não entram na base histórica — são o "já realizado")
  const cenarioAtual = ganhos.filter(l => {
    const d = new Date(l.updated_at)
    return d >= inicioMesAtual
  }).length

  // Buckets dos últimos N meses fechados (excluindo o mês atual)
  const buckets: number[] = new Array(lookback).fill(0)
  for (const l of ganhos) {
    const d = new Date(l.updated_at)
    if (d >= inicioMesAtual) continue  // ignora mês atual
    const diff = differenceInCalendarMonths(inicioMesAtual, startOfMonth(d))
    if (diff >= 1 && diff <= lookback) {
      buckets[diff - 1]++
    }
  }

  const mesesUsados = buckets.filter(c => c > 0).length
  const baseHistorica = mesesUsados > 0
    ? buckets.reduce((s, c) => s + c, 0) / lookback  // média sobre N meses (mesmo zerados)
    : 0

  return {
    pessimista: Math.round(baseHistorica * MULT_PESSIMISTA),
    realista:   Math.round(baseHistorica),
    otimista:   Math.round(baseHistorica * MULT_OTIMISTA),
    baseHistorica,
    mesesUsados,
    cenarioAtual,
  }
}
