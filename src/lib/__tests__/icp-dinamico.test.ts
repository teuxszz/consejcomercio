import { describe, it, expect } from 'vitest'
import {
  calcularIcpDinamico,
  buildIcpFitContext,
  isLeadIcpFit,
  type IcpObservadoServico,
} from '../icp-dinamico'
import type { PeriodValue } from '../periods'

const PERIODO_2025: PeriodValue = { year: 2025, granularity: 'total' }

function lead(
  status: string,
  segmento: string,
  investimento: string,
  servicos: string[] = [],
  updated_at = '2025-06-15T12:00:00Z',
) {
  return { status, updated_at, segmento, investimento_estimado: investimento, servicos_interesse: servicos }
}

const ganho = (seg: string, inv: string, servicos: string[] = []) =>
  lead('ganho_assessoria', seg, inv, servicos)
const perda = (seg: string, inv: string, servicos: string[] = []) =>
  lead('perdido', seg, inv, servicos)

describe('calcularIcpDinamico', () => {
  it('lista vazia → serviço com total 0 e convicção insuficiente', () => {
    const r = calcularIcpDinamico([], PERIODO_2025, ['assessoria_societaria'])
    expect(r).toHaveLength(1)
    expect(r[0].total).toBe(0)
    expect(r[0].total_funil).toBe(0)
    expect(r[0].conviccao).toBe('insuficiente')
    expect(r[0].segmentos).toEqual([])
    expect(r[0].segmentos_full).toEqual([])
  })

  it('ignora leads fora do período', () => {
    const leads = [{ ...ganho('startup', '2k_5k'), updated_at: '2024-06-15T12:00:00Z' }]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].total).toBe(0)
  })

  it('inclui perdidos no denominador (terminais), mas não no numerador (ganhos)', () => {
    const leads = [
      ganho('startup', '2k_5k'),
      perda('startup', '2k_5k'),
      perda('startup', '2k_5k'),
    ]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].total).toBe(1)
    expect(r[0].total_funil).toBe(3)
    // startup: 1 ganho de 3 terminais = 33%
    const startup = r[0].segmentos_full.find(s => s.value === 'startup')
    expect(startup?.taxa_conversao).toBe(33)
    expect(startup?.count).toBe(1)
  })

  it('ignora leads em andamento (não terminais)', () => {
    const leads = [
      ganho('startup', '2k_5k'),
      lead('classificacao',   'startup', '2k_5k'),
      lead('proposta_comercial','startup', '2k_5k'),
    ]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].total).toBe(1)
    expect(r[0].total_funil).toBe(1)
  })

  it('convicção: alta com >= 10 ganhos', () => {
    const leads = Array.from({ length: 10 }, () => ganho('startup', '2k_5k'))
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].conviccao).toBe('alta')
  })

  it('convicção: preliminar entre 3 e 9', () => {
    const leads = Array.from({ length: 5 }, () => ganho('startup', '2k_5k'))
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].conviccao).toBe('preliminar')
  })

  it('convicção: insuficiente com < 3', () => {
    const leads = [ganho('startup', '2k_5k'), ganho('startup', '2k_5k')]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].conviccao).toBe('insuficiente')
  })

  it('topN segmentos: só inclui count>=2; pct calculado sobre ganhos', () => {
    const leads = [
      ganho('startup', '2k_5k'),
      ganho('startup', '2k_5k'),
      ganho('startup', '2k_5k'),
      ganho('startup', '2k_5k'),
      ganho('empresa_junior', '500_2k'), // count 1 → fora do topN (minCount 2)
    ]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    const top = r[0].segmentos
    expect(top.find(s => s.value === 'startup')?.count).toBe(4)
    expect(top.find(s => s.value === 'empresa_junior')).toBeUndefined()
    expect(top.find(s => s.value === 'startup')?.pct).toBe(80) // 4 de 5 ganhos
    // full inclui empresa_junior também
    expect(r[0].segmentos_full.find(s => s.value === 'empresa_junior')?.count).toBe(1)
  })

  it('segmentos_full inclui perfis terminais que nunca ganharam (count=0)', () => {
    const leads = [
      ganho('startup', '2k_5k'),
      ganho('startup', '2k_5k'),
      perda('empresa_design', '500_2k'),
    ]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    const design = r[0].segmentos_full.find(s => s.value === 'empresa_design')
    expect(design?.count).toBe(0)
    expect(design?.total_funil).toBe(1)
    expect(design?.taxa_conversao).toBe(0)
  })

  it('lead sem servicos_interesse entra em qualquer serviço', () => {
    const leads = Array.from({ length: 3 }, () => ganho('startup', '2k_5k', []))
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['servico_a', 'servico_b'])
    expect(r[0].total).toBe(3)
    expect(r[1].total).toBe(3)
  })

  it('lead com servicos_interesse só conta no serviço correspondente', () => {
    const leads = Array.from({ length: 3 }, () => ganho('startup', '2k_5k', ['servico_a']))
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['servico_a', 'servico_b'])
    expect(r.find(x => x.servicoId === 'servico_a')?.total).toBe(3)
    expect(r.find(x => x.servicoId === 'servico_b')?.total).toBe(0)
  })
})

describe('buildIcpFitContext + isLeadIcpFit', () => {
  function mkObs(over: Partial<IcpObservadoServico>): IcpObservadoServico {
    return {
      servicoId: 'svc',
      total: 0,
      total_funil: 0,
      conviccao: 'insuficiente',
      segmentos: [],
      investimentos: [],
      segmentos_full: [],
      investimentos_full: [],
      ...over,
    }
  }

  it('usa observado quando convicção >= preliminar', () => {
    const obs = [mkObs({
      conviccao: 'preliminar',
      segmentos: [{ value: 'startup', count: 5, pct: 100, total_funil: 5, taxa_conversao: 100 }],
      investimentos: [{ value: '5k_10k', count: 5, pct: 100, total_funil: 5, taxa_conversao: 100 }],
    })]
    const ctx = buildIcpFitContext(obs, [
      { id: 'svc', segmentos_icp: ['empresa_junior'], investimento_icp: ['500_2k'] }, // ignorado
    ])
    expect(isLeadIcpFit({ segmento: 'startup', investimento_estimado: '5k_10k' }, ctx)).toBe(true)
    expect(isLeadIcpFit({ segmento: 'empresa_junior', investimento_estimado: '500_2k' }, ctx)).toBe(false)
  })

  it('cai pro configurado quando convicção é insuficiente', () => {
    const obs = [mkObs({
      conviccao: 'insuficiente',
      segmentos: [], investimentos: [],
    })]
    const ctx = buildIcpFitContext(obs, [
      { id: 'svc', segmentos_icp: ['empresa_junior'], investimento_icp: ['500_2k'] },
    ])
    expect(isLeadIcpFit({ segmento: 'empresa_junior', investimento_estimado: '500_2k' }, ctx)).toBe(true)
    expect(isLeadIcpFit({ segmento: 'startup', investimento_estimado: '5k_10k' }, ctx)).toBe(false)
  })

  it('lead com segmento ou investimento nulo nunca é fit', () => {
    const ctx = buildIcpFitContext(
      [mkObs({ conviccao: 'insuficiente' })],
      [{ id: 'svc', segmentos_icp: ['startup'], investimento_icp: ['2k_5k'] }],
    )
    expect(isLeadIcpFit({ segmento: 'startup', investimento_estimado: null }, ctx)).toBe(false)
    expect(isLeadIcpFit({ segmento: null, investimento_estimado: '2k_5k' }, ctx)).toBe(false)
  })

  it('união entre serviços: cada serviço contribui com seu próprio par seg×inv', () => {
    const obs: IcpObservadoServico[] = [
      mkObs({ servicoId: 'a', conviccao: 'preliminar',
        segmentos:     [{ value: 'startup',        count: 3, pct: 100, total_funil: 3, taxa_conversao: 100 }],
        investimentos: [{ value: '5k_10k',         count: 3, pct: 100, total_funil: 3, taxa_conversao: 100 }],
      }),
      mkObs({ servicoId: 'b', conviccao: 'preliminar',
        segmentos:     [{ value: 'empresa_junior', count: 3, pct: 100, total_funil: 3, taxa_conversao: 100 }],
        investimentos: [{ value: '500_2k',         count: 3, pct: 100, total_funil: 3, taxa_conversao: 100 }],
      }),
    ]
    const ctx = buildIcpFitContext(obs, [
      { id: 'a', segmentos_icp: [], investimento_icp: [] },
      { id: 'b', segmentos_icp: [], investimento_icp: [] },
    ])
    // Pares fit (um por serviço): startup×5k_10k e ej×500_2k.
    expect(isLeadIcpFit({ segmento: 'startup',        investimento_estimado: '5k_10k' }, ctx)).toBe(true)
    expect(isLeadIcpFit({ segmento: 'empresa_junior', investimento_estimado: '500_2k' }, ctx)).toBe(true)
    // Cruzamentos entre serviços NÃO formam fit.
    expect(isLeadIcpFit({ segmento: 'startup',        investimento_estimado: '500_2k' }, ctx)).toBe(false)
    expect(isLeadIcpFit({ segmento: 'empresa_junior', investimento_estimado: '5k_10k' }, ctx)).toBe(false)
  })
})
