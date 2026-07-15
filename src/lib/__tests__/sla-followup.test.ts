import { describe, it, expect } from 'vitest'
import { SLA_EXCLUDED_STAGES, calcularDeadlineSla, slaConfigFromMetas, type SlaFollowupConfig } from '../sla-followup'

// Helper puro que espelha a fórmula do SQL (upsert_lead_sla, migration 041).
// Relógio de SLA usa entered_at — NUNCA leads.updated_at (D-02).

describe('calcularDeadlineSla', () => {
  const enteredAt = new Date('2026-07-15T10:00:00.000Z')

  it('fase ativa com override específico usa horas da fase', () => {
    const config: SlaFollowupConfig = { porStage: { classificacao: 4 }, default: 24 }
    const deadline = calcularDeadlineSla('classificacao', enteredAt, config)
    expect(deadline).toEqual(new Date('2026-07-15T14:00:00.000Z'))
  })

  it('fase ativa sem override usa o default global', () => {
    const config: SlaFollowupConfig = { porStage: { classificacao: 4 }, default: 48 }
    const deadline = calcularDeadlineSla('negociacao', enteredAt, config)
    expect(deadline).toEqual(new Date('2026-07-17T10:00:00.000Z'))
  })

  it('default global ausente cai em 24h (defesa em profundidade)', () => {
    // @ts-expect-error — default omitido de propósito para testar o fallback
    const config: SlaFollowupConfig = { porStage: {} }
    const deadline = calcularDeadlineSla('proposta_comercial', enteredAt, config)
    expect(deadline).toEqual(new Date('2026-07-16T10:00:00.000Z'))
  })

  it.each(SLA_EXCLUDED_STAGES)('fase excluída "%s" retorna null (relógio pausado)', (stage) => {
    const config: SlaFollowupConfig = { porStage: { [stage]: 4 }, default: 24 }
    expect(calcularDeadlineSla(stage, enteredAt, config)).toBeNull()
  })

  it('SLA_EXCLUDED_STAGES tem exatamente as 5 fases sem SLA', () => {
    expect([...SLA_EXCLUDED_STAGES].sort()).toEqual(
      ['ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado', 'stand_by'].sort()
    )
  })
})

describe('slaConfigFromMetas', () => {
  it('extrai porStage e default de MetasConfig', () => {
    const metas = { sla_followup_horas_por_stage: { classificacao: 4 }, sla_followup_horas_default: 48 }
    expect(slaConfigFromMetas(metas)).toEqual({ porStage: { classificacao: 4 }, default: 48 })
  })

  it('usa defaults seguros quando as chaves de metas estão ausentes', () => {
    expect(slaConfigFromMetas({})).toEqual({ porStage: {}, default: 24 })
  })
})
