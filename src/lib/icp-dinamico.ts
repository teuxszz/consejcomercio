// ICP dinâmico — calcula o perfil ideal de cliente observado a partir dos leads
// efetivamente convertidos no período, agrupado por serviço.
//
// O resultado é comparável com o ICP estático configurado em DEFAULT_SERVICOS
// (segmentos_icp / investimento_icp) — para a CONSEJ ver se a teoria bate com
// a prática naquele ciclo.
//
// Convicção:
//   - alta:        n >= 10 ganhos no período
//   - preliminar:  3 <= n < 10
//   - insuficiente: n < 3 (UI deve mostrar fallback ao ICP estático)

import type { PeriodValue } from './periods'
import { getPeriodRange, isInRange } from './periods'

const WON_STATUSES = ['ganho_assessoria', 'ganho_consultoria']

export type Conviccao = 'alta' | 'preliminar' | 'insuficiente'

export interface IcpDistribItem {
  value: string
  count: number
  pct: number
}

export interface IcpObservadoServico {
  servicoId: string
  total: number
  conviccao: Conviccao
  segmentos: IcpDistribItem[]
  investimentos: IcpDistribItem[]
}

interface LeadLike {
  status: string
  updated_at: string
  segmento?: string | null
  investimento_estimado?: string | null
  servicos_interesse?: string[] | null
}

function pct(num: number, den: number): number {
  return den ? Math.round((num / den) * 100) : 0
}

function distrib<T extends LeadLike>(leads: T[], pick: (l: T) => string | null | undefined): IcpDistribItem[] {
  const map = new Map<string, number>()
  for (const l of leads) {
    const v = pick(l)
    if (!v) continue
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  const total = leads.length
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count)
}

function topN(items: IcpDistribItem[], n: number, minCount: number): IcpDistribItem[] {
  return items.filter(i => i.count >= minCount).slice(0, n)
}

function classificarConviccao(n: number): Conviccao {
  if (n >= 10) return 'alta'
  if (n >= 3)  return 'preliminar'
  return 'insuficiente'
}

export function calcularIcpDinamico(
  leads: LeadLike[],
  period: PeriodValue,
  servicoIds: string[],
): IcpObservadoServico[] {
  const range = getPeriodRange(period)

  // Universo: leads ganhos no período (filtro por updated_at — quando a conversão aconteceu)
  const ganhos = leads.filter(
    l => WON_STATUSES.includes(l.status) && isInRange(l.updated_at, range)
  )

  // Se um lead não tem servicos_interesse, ele é incluído em TODOS os serviços
  // para não distorcer com viés de cobertura — vira "atribuível a qualquer serviço".
  // Decisão alternativa: ignorar leads sem servicos_interesse. Optei por incluir
  // porque conversões sem tag de serviço ainda são sinal sobre segmento/investimento.
  return servicoIds.map(servicoId => {
    const matched = ganhos.filter(l => {
      const interesse = l.servicos_interesse ?? []
      return interesse.length === 0 || interesse.includes(servicoId)
    })

    const segmentosAll = distrib(matched, l => l.segmento)
    const investAll    = distrib(matched, l => l.investimento_estimado)

    return {
      servicoId,
      total: matched.length,
      conviccao: classificarConviccao(matched.length),
      segmentos:     topN(segmentosAll, 5, 2),
      investimentos: topN(investAll,    3, 2),
    }
  })
}
