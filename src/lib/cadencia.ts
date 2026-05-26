// Cadência CONSEJ: Dias 1, 3, 5, 7, 10 após a primeira interação.
// Cada ponto da cadência tem um stage de mensagem associado.

import type { Stage } from '@/pages/MensagensPage'
import type { InteracaoLead, Lead } from '@/types'
import { TERMINAL_STAGES } from './constants'

export interface CadenciaPoint {
  dia: number
  stage: Stage
  label: string
  descricao: string
}

export const CADENCIA_DIAS: CadenciaPoint[] = [
  { dia: 1,  stage: 'primeiro_contato', label: 'Dia 1',  descricao: 'Primeiro contato' },
  { dia: 3,  stage: 'followup',         label: 'Dia 3',  descricao: 'Reforço' },
  { dia: 5,  stage: 'followup',         label: 'Dia 5',  descricao: 'Educativo' },
  { dia: 7,  stage: 'followup',         label: 'Dia 7',  descricao: 'Descontraído' },
  { dia: 10, stage: 'followup',         label: 'Dia 10', descricao: 'Encerramento' },
]

// Tolerância em dias (±) para considerar uma cadência "devida hoje".
export const CADENCIA_TOLERANCIA = 0

function daysBetween(from: Date, to: Date): number {
  const MS = 1000 * 60 * 60 * 24
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / MS)
}

/**
 * Retorna o ponto da cadência que está "devido hoje" para o lead, ou null.
 *
 * Lógica:
 *  - Se o lead está em estágio terminal (ganho/perdido/cancelado), retorna null.
 *  - Se o lead nunca recebeu interação: ponto do Dia 1 se o lead foi criado hoje ou ontem.
 *  - Caso contrário: conta dias desde a ÚLTIMA interação e bate contra o mapa.
 *    Retorna o ponto cujo `dia` corresponde exatamente ao nº de dias desde a última msg.
 */
export function getCadenciaDueToday(
  lead: Pick<Lead, 'id' | 'status' | 'created_at'>,
  interacoesDoLead: InteracaoLead[],
  today: Date = new Date(),
): CadenciaPoint | null {
  if ((TERMINAL_STAGES as readonly string[]).includes(lead.status)) return null

  const ultima = interacoesDoLead[0]  // lista já vem ordenada desc por enviada_em

  if (!ultima) {
    const diasDesdeCriacao = daysBetween(new Date(lead.created_at), today)
    if (diasDesdeCriacao === 0 || diasDesdeCriacao === 1) {
      return CADENCIA_DIAS[0]  // Dia 1 — primeiro contato
    }
    return null
  }

  const diasDesdeUltima = daysBetween(new Date(ultima.enviada_em), today)
  // Buscar o ponto exato
  const match = CADENCIA_DIAS.find(p => p.dia === diasDesdeUltima)
  return match ?? null
}

// ─── Next cadência point ───────────────────────────────────────────────────────

export interface NextCadenciaResult {
  point: CadenciaPoint
  /** 0 = due today, negative = overdue, positive = days remaining */
  daysUntil: number
}

/**
 * Retorna o próximo ponto da cadência com quantos dias faltam,
 * independente de ser hoje ou futuro.
 *
 * Diferença de getCadenciaDueToday():
 *  - getCadenciaDueToday retorna apenas quando daysUntil === 0 (exact match)
 *  - getNextCadenciaPoint retorna QUALQUER ponto ativo, com daysUntil
 *
 * Retorna null se:
 *  - lead em estágio terminal (ganho/perdido/cancelado)
 *  - cadência concluída (última interação > dia 10)
 *  - nenhuma interação e lead criado há > 1 dia (D1 expirado)
 */
export function getNextCadenciaPoint(
  lead: Pick<Lead, 'id' | 'status' | 'created_at'>,
  interacoesDoLead: InteracaoLead[],
  today: Date = new Date(),
): NextCadenciaResult | null {
  if ((TERMINAL_STAGES as readonly string[]).includes(lead.status)) return null

  const ultima = interacoesDoLead[0]  // array já ordenado desc por enviada_em

  if (!ultima) {
    // Sem interações: D1 ativo apenas se criado há 0 ou 1 dias
    const diasDesdeCriacao = daysBetween(new Date(lead.created_at), today)
    const point = CADENCIA_DIAS[0]  // Dia 1
    if (diasDesdeCriacao <= 1) {
      return { point, daysUntil: point.dia - diasDesdeCriacao }
    }
    return null  // D1 expirou (criado há > 1d sem interação)
  }

  const diasDesdeUltima = daysBetween(new Date(ultima.enviada_em), today)

  // Encontrar o próximo ponto cujo dia >= diasDesdeUltima
  const proximo = CADENCIA_DIAS.find(p => p.dia >= diasDesdeUltima)
  if (!proximo) return null  // cadência encerrada (passado dia 10)

  return { point: proximo, daysUntil: proximo.dia - diasDesdeUltima }
}

// ─── Days since last touch ─────────────────────────────────────────────────────

/**
 * Para um lead sem interações, retorna quantos dias desde a criação.
 * Para um lead com interações, retorna dias desde a última.
 */
export function daysSinceLastTouch(
  lead: Pick<Lead, 'created_at'>,
  interacoesDoLead: InteracaoLead[],
  today: Date = new Date(),
): number {
  const ref = interacoesDoLead[0]
    ? new Date(interacoesDoLead[0].enviada_em)
    : new Date(lead.created_at)
  return daysBetween(ref, today)
}
