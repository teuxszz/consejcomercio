import { describe, it, expect } from 'vitest'
import { calcularIcpDinamico } from '../icp-dinamico'
import type { PeriodValue } from '../periods'

const PERIODO_2025: PeriodValue = { year: 2025, granularity: 'total' }

function ganho(segmento: string, investimento: string, servicos: string[] = []) {
  return {
    status: 'ganho_assessoria',
    updated_at: '2025-06-15T12:00:00Z',
    segmento,
    investimento_estimado: investimento,
    servicos_interesse: servicos,
  }
}

describe('calcularIcpDinamico', () => {
  it('lista vazia → serviço com total 0 e convicção insuficiente', () => {
    const r = calcularIcpDinamico([], PERIODO_2025, ['assessoria_societaria'])
    expect(r).toHaveLength(1)
    expect(r[0].total).toBe(0)
    expect(r[0].conviccao).toBe('insuficiente')
    expect(r[0].segmentos).toEqual([])
  })

  it('ignora leads fora do período', () => {
    const leads = [{ ...ganho('startup', '2k_5k'), updated_at: '2024-06-15T12:00:00Z' }]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].total).toBe(0)
  })

  it('ignora leads com status não-ganho', () => {
    const leads = [{ ...ganho('startup', '2k_5k'), status: 'perdido' }]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].total).toBe(0)
  })

  it('convicção: alta com >= 10 ganhos', () => {
    const leads = Array.from({ length: 10 }, () => ganho('startup', '2k_5k'))
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    expect(r[0].total).toBe(10)
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

  it('distribuição de segmentos: só inclui os com count >= 2 e percentual correto', () => {
    const leads = [
      ganho('startup', '2k_5k'),
      ganho('startup', '2k_5k'),
      ganho('startup', '2k_5k'),
      ganho('startup', '2k_5k'),
      ganho('empresa_junior', '500_2k'), // count 1 — não entra no topN (minCount 2)
    ]
    const r = calcularIcpDinamico(leads, PERIODO_2025, ['assessoria_societaria'])
    const seg = r[0].segmentos
    expect(seg.find(s => s.value === 'startup')?.count).toBe(4)
    expect(seg.find(s => s.value === 'empresa_junior')).toBeUndefined()
    // 4 de 5 ganhos = 80%
    expect(seg.find(s => s.value === 'startup')?.pct).toBe(80)
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
