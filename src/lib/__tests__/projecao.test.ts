import { describe, it, expect } from 'vitest'
import { calcularProjecaoMensal } from '../projecao'

// Data fixa de referência: 15 de junho de 2025.
const TODAY = new Date(2025, 5, 15)

function ganho(updatedAt: string, tipo: 'assessoria' | 'consultoria' = 'assessoria') {
  return { status: `ganho_${tipo}`, updated_at: updatedAt }
}

describe('calcularProjecaoMensal', () => {
  it('lista vazia → tudo zero, sem quebrar', () => {
    const p = calcularProjecaoMensal([], { today: TODAY })
    expect(p.pessimista).toBe(0)
    expect(p.realista).toBe(0)
    expect(p.otimista).toBe(0)
    expect(p.baseHistorica).toBe(0)
    expect(p.mesesUsados).toBe(0)
    expect(p.cenarioAtual).toBe(0)
  })

  it('ignora leads com status não-ganho', () => {
    const p = calcularProjecaoMensal(
      [
        { status: 'classificacao', updated_at: '2025-04-10T12:00:00Z' },
        { status: 'perdido', updated_at: '2025-04-10T12:00:00Z' },
      ],
      { today: TODAY }
    )
    expect(p.baseHistorica).toBe(0)
    expect(p.cenarioAtual).toBe(0)
  })

  it('conta ganhos do mês corrente em cenarioAtual, fora da base histórica', () => {
    const p = calcularProjecaoMensal(
      [ganho('2025-06-05T12:00:00Z'), ganho('2025-06-10T12:00:00Z')],
      { today: TODAY }
    )
    expect(p.cenarioAtual).toBe(2)
    expect(p.baseHistorica).toBe(0) // nada nos meses fechados
  })

  it('média móvel: 3 ganhos em 3 meses fechados → base 1/mês', () => {
    const p = calcularProjecaoMensal(
      [
        ganho('2025-05-10T12:00:00Z'),
        ganho('2025-04-10T12:00:00Z'),
        ganho('2025-03-10T12:00:00Z'),
      ],
      { today: TODAY, lookbackMonths: 3 }
    )
    expect(p.mesesUsados).toBe(3)
    expect(p.baseHistorica).toBe(1)
    expect(p.realista).toBe(1)
  })

  it('aplica multiplicadores 0,7 / 1,0 / 1,3 sobre a base', () => {
    // 30 ganhos distribuídos: 10/mês nos 3 meses fechados → base 10
    const leads = [
      ...Array.from({ length: 10 }, () => ganho('2025-05-10T12:00:00Z')),
      ...Array.from({ length: 10 }, () => ganho('2025-04-10T12:00:00Z')),
      ...Array.from({ length: 10 }, () => ganho('2025-03-10T12:00:00Z')),
    ]
    const p = calcularProjecaoMensal(leads, { today: TODAY, lookbackMonths: 3 })
    expect(p.baseHistorica).toBe(10)
    expect(p.pessimista).toBe(7)
    expect(p.realista).toBe(10)
    expect(p.otimista).toBe(13)
  })

  it('considera ganhos de consultoria além de assessoria', () => {
    const p = calcularProjecaoMensal(
      [ganho('2025-05-10T12:00:00Z', 'consultoria')],
      { today: TODAY, lookbackMonths: 3 }
    )
    expect(p.mesesUsados).toBe(1)
  })

  it('ignora ganhos mais antigos que a janela de lookback', () => {
    const p = calcularProjecaoMensal(
      [ganho('2024-01-10T12:00:00Z')], // muito antigo
      { today: TODAY, lookbackMonths: 3 }
    )
    expect(p.mesesUsados).toBe(0)
    expect(p.baseHistorica).toBe(0)
  })
})
