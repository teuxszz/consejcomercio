// Relógio do SLA de follow-up — helper puro que espelha a fórmula do trigger
// SQL upsert_lead_sla (migration 041). NUNCA usa leads.updated_at (é tocado
// por qualquer edição) — o relógio é entered_at, gravado na tabela dedicada
// lead_sla (D-02, Phase 999.1 CONTEXT).
//
// Fases em SLA_EXCLUDED_STAGES não têm SLA: terminal (ganho/perdido/
// cancelado) ou stand_by (relógio pausado por decisão humana).

import type { MetasConfig } from '@/types'

export const SLA_EXCLUDED_STAGES = [
  'ganho_assessoria',
  'ganho_consultoria',
  'perdido',
  'cancelado',
  'stand_by',
] as const

export type SlaExcludedStage = typeof SLA_EXCLUDED_STAGES[number]

export interface SlaFollowupConfig {
  porStage: Record<string, number>
  default: number
}

const HORAS_DEFAULT_FALLBACK = 24

/**
 * Calcula o deadline do SLA de follow-up para um lead que entrou em `stage`
 * em `enteredAt`. Retorna null se a fase está em SLA_EXCLUDED_STAGES (sem
 * SLA — relógio pausado ou fase terminal).
 *
 * horas = config.porStage[stage] ?? config.default ?? 24 (defesa em
 * profundidade — mesma fórmula do COALESCE no SQL).
 */
export function calcularDeadlineSla(
  stage: string,
  enteredAt: Date,
  config: SlaFollowupConfig,
): Date | null {
  if ((SLA_EXCLUDED_STAGES as readonly string[]).includes(stage)) return null

  const horas = config.porStage[stage] ?? config.default ?? HORAS_DEFAULT_FALLBACK
  return new Date(enteredAt.getTime() + horas * 3600 * 1000)
}

/**
 * Extrai a config de SLA de MetasConfig (configuracoes.metas), com defaults
 * seguros quando as chaves ainda não existem (Plan 06 é quem grava os
 * valores reais nas configurações).
 */
export function slaConfigFromMetas(
  metas: Pick<MetasConfig, 'sla_followup_horas_por_stage' | 'sla_followup_horas_default'>,
): SlaFollowupConfig {
  return {
    porStage: metas.sla_followup_horas_por_stage ?? {},
    default: metas.sla_followup_horas_default ?? HORAS_DEFAULT_FALLBACK,
  }
}
