import { describe, it, expect } from 'vitest'
import { getNextCadenciaPoint, CADENCIA_DIAS } from '@/lib/cadencia'
import { TERMINAL_STAGES } from '@/lib/constants'
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

// ─── Resumo diário — elegibilidade NOTIF-02/NOTIF-03 ──────────────────────────
//
// Estes testes documentam em TypeScript a regra que a função PL/pgSQL
// `cron_resumo_diario()` (migration 034) deve replicar.
//
// Para o cron SQL, "elegível para DM" equivale a `daysUntil === 0` no contrato TS.
// Cada teste espelha um branch ou filtro da query UNION ALL da migration 034.

describe('resumo diário — elegibilidade NOTIF-02/NOTIF-03', () => {
  // ── Test A: lead COM interação há exatamente 3 dias → D3 devido hoje ─────────
  // Espelha o Branch 1 da query SQL: HAVING (CURRENT_DATE - MAX(enviada_em)::date) IN (1,3,5,7,10)

  it('Test A: interação há 3d → D3 daysUntil=0 (elegível para DM)', () => {
    const lead = makeLead('qualificado', 30)
    const result = getNextCadenciaPoint(lead, [makeInteracao(3)])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(3)
    expect(result!.daysUntil).toBe(0)
  })

  // ── Test B: lead SEM interação, criado HOJE → D1 ainda não devido ────────────
  // Assimetria TS vs SQL: getNextCadenciaPoint retorna daysUntil=1 (D1 não é hoje),
  // mas o cron SQL trata D1 quando (CURRENT_DATE - created_at::date) IN (0, 1),
  // ou seja, tanto "criado hoje" quanto "criado ontem" são marcados como D1 pelo cron.
  // Esta assimetria existe porque o SQL usa IN (0,1) para capturar ambos os casos,
  // enquanto a função TS calcula daysUntil = point.dia - diasDesdeCriacao = 1-0 = 1.

  it('Test B: sem interação, criado hoje → D1 daysUntil=1 (não elegível via TS; cron SQL captura via IN (0,1))', () => {
    const lead = makeLead('novo', 0)
    const result = getNextCadenciaPoint(lead, [])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(1)
    // daysUntil=1 → não é "devido hoje" pela lógica TS, mas o cron SQL cobre via IN (0,1)
    expect(result!.daysUntil).toBe(1)
  })

  // ── Test C: lead SEM interação, criado ONTEM → D1 devido hoje ────────────────
  // Espelha o Branch 2 da query SQL: (CURRENT_DATE - l.created_at::date) IN (0,1)
  // daysUntil=0 → elegível para DM

  it('Test C: sem interação, criado ontem → D1 daysUntil=0 (elegível para DM)', () => {
    const lead = makeLead('classificacao', 1)
    const result = getNextCadenciaPoint(lead, [])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(1)
    expect(result!.daysUntil).toBe(0)
  })

  // ── Test D: lead SEM interação, criado há 2 dias → D1 expirado (null) ────────
  // Espelha a exclusão implícita do Branch 2: apenas (0,1) é elegível; criado há 2d → null

  it('Test D: sem interação, criado há 2d → null (D1 expirado, não elegível)', () => {
    const lead = makeLead('classificacao', 2)
    const result = getNextCadenciaPoint(lead, [])
    expect(result).toBeNull()
  })

  // ── Test E: estágios terminais → null (não elegível) ─────────────────────────
  // Espelha o filtro WHERE l.status NOT IN (...) da migration 034 (ambos os branches).
  // Itera todos os TERMINAL_STAGES para cobrir ganho_assessoria, ganho_consultoria,
  // perdido, cancelado.

  it.each([...TERMINAL_STAGES])(
    'Test E: status=%s (terminal) com interação há 3d → null',
    (stage) => {
      const lead = makeLead(stage, 10)
      const result = getNextCadenciaPoint(lead, [makeInteracao(3)])
      expect(result).toBeNull()
    }
  )

  // ── Test F: D-point futuro (não atingido) → daysUntil > 0 (não elegível) ─────
  // Lead com última interação há 2 dias → próximo D-point é D3 com daysUntil=1.
  // O cron SQL NÃO dispara para este caso (apenas daysUntil===0 é elegível).
  // O teste confirma que getNextCadenciaPoint calcula corretamente o "próximo ponto".

  it('Test F: interação há 2d → D3 daysUntil=1 (não elegível; cron só dispara quando daysUntil===0)', () => {
    const lead = makeLead('educar_lead', 10)
    const result = getNextCadenciaPoint(lead, [makeInteracao(2)])
    expect(result).not.toBeNull()
    expect(result!.point.dia).toBe(3)
    expect(result!.daysUntil).toBe(1)
  })

  // ── Test G: D-points exatos em todos os marcos → daysUntil=0 ─────────────────
  // Para cada dia em [1, 3, 5, 7, 10], lead com última interação há exatamente
  // `dia` dias → D-point exato, daysUntil=0 (elegível para DM).
  // Confirma que apenas os dias da cadência disparam o cron (IN (1,3,5,7,10)).

  it.each([1, 3, 5, 7, 10])(
    'Test G: interação há exatamente %d dias → D%d daysUntil=0 (elegível para DM)',
    (dia) => {
      const lead = makeLead('educar_lead', 30)
      const result = getNextCadenciaPoint(lead, [makeInteracao(dia)])
      expect(result).not.toBeNull()
      expect(result!.point.dia).toBe(dia)
      expect(result!.daysUntil).toBe(0)
    }
  )
})
