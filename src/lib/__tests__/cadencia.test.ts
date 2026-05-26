import { describe, it, expect } from 'vitest'
import { getNextCadenciaPoint, CADENCIA_DIAS } from '@/lib/cadencia'
import type { InteracaoLead } from '@/types'

// Helper: returns an ISO date string N days ago from today (local midnight).
// Uses local midnight to match daysBetween() which truncates to local date.
function makeDate(daysAgo: number): string {
  const d = new Date()
  // Truncate to local midnight
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

// Helper: build a minimal lead object
function makeLead(status: string, createdDaysAgo: number) {
  return {
    id: 'test-lead',
    status,
    created_at: makeDate(createdDaysAgo),
  }
}

// Helper: build a single interacao
function makeInteracao(daysAgo: number): InteracaoLead {
  return {
    id: 'i1',
    lead_id: 'test-lead',
    canal: 'whatsapp',
    enviada_em: makeDate(daysAgo),
    stage: 'primeiro_contato',
    variacao: 0,
    created_at: makeDate(daysAgo),
    mensagem: null,
    perfil_id: null,
    status_apos: null,
  } as InteracaoLead
}

describe('getNextCadenciaPoint', () => {
  // ── Terminal stages → null ───────────────────────────────────────────────────

  it('returns null for ganho_assessoria', () => {
    const lead = makeLead('ganho_assessoria', 5)
    expect(getNextCadenciaPoint(lead, [])).toBeNull()
  })

  it('returns null for ganho_consultoria', () => {
    const lead = makeLead('ganho_consultoria', 5)
    expect(getNextCadenciaPoint(lead, [])).toBeNull()
  })

  it('returns null for perdido', () => {
    const lead = makeLead('perdido', 5)
    expect(getNextCadenciaPoint(lead, [])).toBeNull()
  })

  it('returns null for cancelado', () => {
    const lead = makeLead('cancelado', 5)
    expect(getNextCadenciaPoint(lead, [])).toBeNull()
  })

  // ── No interactions (D1 logic) ───────────────────────────────────────────────

  it('no interação, criado há 0d → D1 daysUntil=1', () => {
    const lead = makeLead('classificacao', 0)
    const result = getNextCadenciaPoint(lead, [])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(1)
    expect(result!.daysUntil).toBe(1)
  })

  it('no interação, criado há 1d → D1 daysUntil=0 (due today)', () => {
    const lead = makeLead('classificacao', 1)
    const result = getNextCadenciaPoint(lead, [])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(1)
    expect(result!.daysUntil).toBe(0)
  })

  it('no interação, criado há 2d → null (D1 expired)', () => {
    const lead = makeLead('classificacao', 2)
    const result = getNextCadenciaPoint(lead, [])
    expect(result).toBeNull()
  })

  // ── With interactions ────────────────────────────────────────────────────────

  it('última interação há 3d → D3 daysUntil=0', () => {
    const lead = makeLead('educar_lead', 10)
    const result = getNextCadenciaPoint(lead, [makeInteracao(3)])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(3)
    expect(result!.daysUntil).toBe(0)
  })

  it('última interação há 4d → D5 daysUntil=1', () => {
    const lead = makeLead('educar_lead', 10)
    const result = getNextCadenciaPoint(lead, [makeInteracao(4)])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(5)
    expect(result!.daysUntil).toBe(1)
  })

  it('última interação há 2d → D3 daysUntil=1', () => {
    const lead = makeLead('educar_lead', 10)
    const result = getNextCadenciaPoint(lead, [makeInteracao(2)])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(3)
    expect(result!.daysUntil).toBe(1)
  })

  it('última interação há 10d → D10 daysUntil=0', () => {
    const lead = makeLead('educar_lead', 20)
    const result = getNextCadenciaPoint(lead, [makeInteracao(10)])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(10)
    expect(result!.daysUntil).toBe(0)
  })

  it('última interação há 11d → null (cadência encerrada após D10)', () => {
    const lead = makeLead('educar_lead', 20)
    const result = getNextCadenciaPoint(lead, [makeInteracao(11)])
    expect(result).toBeNull()
  })

  it('última interação há 9d → D10 daysUntil=1', () => {
    const lead = makeLead('educar_lead', 20)
    const result = getNextCadenciaPoint(lead, [makeInteracao(9)])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(10)
    expect(result!.daysUntil).toBe(1)
  })

  // ── CADENCIA_DIAS sanity ──────────────────────────────────────────────────────

  it('CADENCIA_DIAS has 5 points: D1, D3, D5, D7, D10', () => {
    expect(CADENCIA_DIAS.map(p => p.dia)).toEqual([1, 3, 5, 7, 10])
  })
})
