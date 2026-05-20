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
//
// Taxa de conversão (win rate) por perfil:
//   numerador  = ganhos do perfil no período
//   denominador = leads do mesmo perfil que fecharam (ganho/perdido/cancelado)
//                 no período — leads em andamento ainda não contam, pois ainda
//                 podem virar ganho.

import type { PeriodValue } from './periods'
import { getPeriodRange, isInRange } from './periods'

const WON_STATUSES      = ['ganho_assessoria', 'ganho_consultoria']
const TERMINAL_STATUSES = [...WON_STATUSES, 'perdido', 'cancelado']

export type Conviccao = 'alta' | 'preliminar' | 'insuficiente'

export interface IcpDistribItem {
  value: string
  count: number            // ganhos deste valor
  pct: number              // % dentro do conjunto de ganhos do serviço
  total_funil: number      // leads do mesmo valor que fecharam (terminal) no período
  taxa_conversao: number   // count / total_funil em %
}

export interface IcpObservadoServico {
  servicoId: string
  total: number                       // # ganhos
  total_funil: number                 // # terminais (denominador do win rate)
  conviccao: Conviccao
  segmentos: IcpDistribItem[]         // topN (UI principal)
  investimentos: IcpDistribItem[]     // topN
  segmentos_full: IcpDistribItem[]    // distribuição completa — usada para anotar o ICP configurado
  investimentos_full: IcpDistribItem[]
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

function distribComTaxa<T extends LeadLike>(
  ganhos: T[],
  terminais: T[],
  pick: (l: T) => string | null | undefined,
): IcpDistribItem[] {
  const ganhosPorValor    = new Map<string, number>()
  const terminaisPorValor = new Map<string, number>()

  for (const l of ganhos) {
    const v = pick(l); if (!v) continue
    ganhosPorValor.set(v, (ganhosPorValor.get(v) ?? 0) + 1)
  }
  for (const l of terminais) {
    const v = pick(l); if (!v) continue
    terminaisPorValor.set(v, (terminaisPorValor.get(v) ?? 0) + 1)
  }

  const totalGanhos = ganhos.length
  const items: IcpDistribItem[] = []

  // Itera sobre todos os valores que apareceram em terminais (engloba os que aparecem
  // em ganhos, pois ganhos ⊆ terminais). Inclui perfis com 0 ganhos (count=0) — útil
  // para sinalizar itens do ICP configurado que nunca convertem.
  for (const [value, total_funil] of terminaisPorValor) {
    const count = ganhosPorValor.get(value) ?? 0
    items.push({
      value,
      count,
      pct: pct(count, totalGanhos),
      total_funil,
      taxa_conversao: pct(count, total_funil),
    })
  }

  return items.sort((a, b) => b.count - a.count || b.taxa_conversao - a.taxa_conversao)
}

function topN(items: IcpDistribItem[], n: number, minCount: number): IcpDistribItem[] {
  return items.filter(i => i.count >= minCount).slice(0, n)
}

function classificarConviccao(n: number): Conviccao {
  if (n >= 10) return 'alta'
  if (n >= 3)  return 'preliminar'
  return 'insuficiente'
}

function leadCasaServico(servicoId: string, interesse: string[] | null | undefined): boolean {
  const list = interesse ?? []
  return list.length === 0 || list.includes(servicoId)
}

export function calcularIcpDinamico(
  leads: LeadLike[],
  period: PeriodValue,
  servicoIds: string[],
): IcpObservadoServico[] {
  const range = getPeriodRange(period)

  // Universo terminal: leads que fecharam (ganho/perdido/cancelado) no período.
  // Win rate = ganhos / terminais — leads ainda abertos não entram em nenhum lado.
  const terminaisGlobal = leads.filter(
    l => TERMINAL_STATUSES.includes(l.status) && isInRange(l.updated_at, range)
  )

  return servicoIds.map(servicoId => {
    const terminais = terminaisGlobal.filter(l => leadCasaServico(servicoId, l.servicos_interesse))
    const ganhos    = terminais.filter(l => WON_STATUSES.includes(l.status))

    const segmentosAll = distribComTaxa(ganhos, terminais, l => l.segmento)
    const investAll    = distribComTaxa(ganhos, terminais, l => l.investimento_estimado)

    return {
      servicoId,
      total: ganhos.length,
      total_funil: terminais.length,
      conviccao: classificarConviccao(ganhos.length),
      segmentos:     topN(segmentosAll, 5, 2),
      investimentos: topN(investAll,    3, 2),
      segmentos_full:     segmentosAll,
      investimentos_full: investAll,
    }
  })
}

// ─── ICP fit (uso em LeadCard / Prospecção) ──────────────────────────────────

export interface IcpFitContext {
  /** Pares "segmento|investimento" considerados ICP-fit. Inclui pares vindos de
   *  qualquer serviço com convicção observada >= preliminar OU do ICP estático
   *  como fallback quando o observado é insuficiente. */
  fitSet: Set<string>
}

function pairKey(seg: string | null | undefined, inv: string | null | undefined): string | null {
  if (!seg || !inv) return null
  return `${seg}|${inv}`
}

/**
 * Constrói o contexto de ICP-fit a partir dos observados por serviço e do ICP
 * configurado. Para cada serviço:
 *   - convicção >= preliminar → usa os top segmentos × investimentos observados
 *   - insuficiente            → usa o ICP estático (segmentos_icp × investimento_icp)
 *
 * Resultado: Set de pares "seg|inv" — checagem O(1) por lead no card.
 */
export function buildIcpFitContext(
  observados: IcpObservadoServico[],
  servicosConfig: Array<{ id: string; segmentos_icp?: string[]; investimento_icp?: string[] }>,
): IcpFitContext {
  const fitSet = new Set<string>()

  for (const obs of observados) {
    const cfg = servicosConfig.find(s => s.id === obs.servicoId)
    if (!cfg) continue

    const useObservado = obs.conviccao !== 'insuficiente'
    const segs = useObservado
      ? obs.segmentos.map(s => s.value)
      : (cfg.segmentos_icp ?? [])
    const invs = useObservado
      ? obs.investimentos.map(i => i.value)
      : (cfg.investimento_icp ?? [])

    for (const s of segs) {
      for (const i of invs) {
        const k = pairKey(s, i); if (k) fitSet.add(k)
      }
    }
  }

  return { fitSet }
}

/** True se o (segmento, investimento) do lead bate em algum ICP fit do contexto. */
export function isLeadIcpFit(
  lead: { segmento?: string | null; investimento_estimado?: string | null },
  ctx: IcpFitContext,
): boolean {
  const k = pairKey(lead.segmento, lead.investimento_estimado)
  return k !== null && ctx.fitSet.has(k)
}
