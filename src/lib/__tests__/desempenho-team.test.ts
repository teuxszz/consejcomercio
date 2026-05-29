// Phase 8 Plan 04 Task 1 — Tests for desempenho-team helpers (D-07).
//
// 7 behaviors:
//   1. filtrarConsultoresAtivos: role='consultor' + lead no periodo -> incluido
//   2. role='consultor' sem leads -> excluido
//   3. role='coordenador' (mesmo com leads) -> excluido (D-07)
//   4. perfil sem role -> excluido
//   5. rankConsultores ordena por convertidos desc (empate mantem ordem original)
//   6. calcularDesempenhoEquipe agrega totais (sums + averages) e itera consultores
//   7. equipe vazia -> consultores=[] e totais zerados/nulls

import { describe, it, expect } from 'vitest'
import {
  filtrarConsultoresAtivos,
  rankConsultores,
  calcularDesempenhoEquipe,
} from '../desempenho-team'
import type { PeriodValue } from '../periods'
import type { Lead, Tarefa, Cliente, Contrato, DesempenhoConsultorTeam } from '@/types'
import type { Perfil } from '@/hooks/usePerfis'

const PERIODO_2026: PeriodValue = { year: 2026, granularity: 'total' }

// ─── Builders ──────────────────────────────────────────────────────────────

function perfilFix(overrides: Partial<Perfil> = {}): Perfil {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
    nome: 'Perfil Teste',
    role: 'consultor',
    tipo: 'interno',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function leadFix(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id ?? `lead-${Math.random().toString(36).slice(2, 8)}`,
    nome: 'Lead Teste',
    empresa: 'Empresa Teste',
    segmento: 'startup',
    telefone: '11999999999',
    origem: 'site',
    status: 'classificacao',
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    responsavel_id: 'p1',
    ...overrides,
  }
}

// ─── filtrarConsultoresAtivos ──────────────────────────────────────────────

describe('filtrarConsultoresAtivos', () => {
  it('inclui perfil role=consultor com >=1 lead no periodo (D-07)', () => {
    const p1 = perfilFix({ id: 'p1', role: 'consultor' })
    const leads = [leadFix({ responsavel_id: 'p1', created_at: '2026-04-10T10:00:00Z' })]
    expect(filtrarConsultoresAtivos([p1], leads, PERIODO_2026)).toHaveLength(1)
  })

  it('exclui perfil role=consultor SEM leads no periodo', () => {
    const p1 = perfilFix({ id: 'p1', role: 'consultor' })
    expect(filtrarConsultoresAtivos([p1], [], PERIODO_2026)).toHaveLength(0)

    // tambem exclui se leads estao fora do range
    const leads = [leadFix({ responsavel_id: 'p1', created_at: '2025-04-10T10:00:00Z' })]
    expect(filtrarConsultoresAtivos([p1], leads, PERIODO_2026)).toHaveLength(0)
  })

  it('exclui perfil role=coordenador mesmo com leads (D-07 so consultor)', () => {
    const p1 = perfilFix({ id: 'p1', role: 'coordenador' })
    const leads = [leadFix({ responsavel_id: 'p1' })]
    expect(filtrarConsultoresAtivos([p1], leads, PERIODO_2026)).toHaveLength(0)
  })

  it('exclui perfil sem role definido', () => {
    const p1 = perfilFix({ id: 'p1', role: null })
    const leads = [leadFix({ responsavel_id: 'p1' })]
    expect(filtrarConsultoresAtivos([p1], leads, PERIODO_2026)).toHaveLength(0)
  })
})

// ─── rankConsultores ───────────────────────────────────────────────────────

describe('rankConsultores', () => {
  it('ordena por convertidos desc; empate mantem ordem original', () => {
    const mk = (id: string, conv: number): DesempenhoConsultorTeam => ({
      perfilId: id,
      perfilNome: id,
      metricas: {
        perfilId: id,
        perfilNome: id,
        periodo: PERIODO_2026,
        leads_criados: 0,
        convertidos: conv,
        perdidos: 0,
        ciclo_medio_dias: null,
        win_rate: 0,
        icp_fit_medio: null,
        tarefas_concluidas: 0,
        nps_medio: null,
      },
    })
    const ranked = rankConsultores([mk('a', 3), mk('b', 5), mk('c', 5), mk('d', 1)])
    expect(ranked.map(r => r.perfilId)).toEqual(['b', 'c', 'a', 'd'])
  })
})

// ─── calcularDesempenhoEquipe ──────────────────────────────────────────────

describe('calcularDesempenhoEquipe', () => {
  it('agrega totais (sums + media ponderada) e itera consultores ativos', () => {
    const p1 = perfilFix({ id: 'p1', nome: 'Alice', role: 'consultor' })
    const p2 = perfilFix({ id: 'p2', nome: 'Beto', role: 'consultor' })
    const leads: Lead[] = [
      leadFix({ responsavel_id: 'p1', status: 'ganho_assessoria', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-11T00:00:00Z' }),
      leadFix({ responsavel_id: 'p1', status: 'perdido', created_at: '2026-03-15T10:00:00Z' }),
      leadFix({ responsavel_id: 'p2', status: 'ganho_consultoria', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-21T00:00:00Z' }),
    ]
    const tarefas: Tarefa[] = []
    const clientes: Cliente[] = []
    const contratos: Contrato[] = []

    const result = calcularDesempenhoEquipe({
      perfis: [p1, p2],
      leads,
      tarefas,
      clientes,
      contratos,
      periodo: PERIODO_2026,
      servicosConfig: [],
    })

    expect(result.consultores).toHaveLength(2)
    expect(result.totais.leads_criados).toBe(3)
    expect(result.totais.convertidos).toBe(2)
    expect(result.totais.perdidos).toBe(1)
    // win_rate = round(2 / (2 + 1) * 100) = 67
    expect(result.totais.win_rate).toBe(67)
    // ciclo_medio_dias media ponderada por convertidos: (10*1 + 20*1)/(1+1) = 15
    expect(result.totais.ciclo_medio_dias).toBe(15)
    expect(result.totais.perfilNome).toBe('Equipe CONSEJ')
  })

  it('equipe vazia -> consultores=[] + totais com zeros e nulls', () => {
    const result = calcularDesempenhoEquipe({
      perfis: [],
      leads: [],
      tarefas: [],
      clientes: [],
      contratos: [],
      periodo: PERIODO_2026,
      servicosConfig: [],
    })
    expect(result.consultores).toEqual([])
    expect(result.totais.leads_criados).toBe(0)
    expect(result.totais.convertidos).toBe(0)
    expect(result.totais.perdidos).toBe(0)
    expect(result.totais.win_rate).toBe(0)
    expect(result.totais.ciclo_medio_dias).toBeNull()
    expect(result.totais.icp_fit_medio).toBeNull()
    expect(result.totais.nps_medio).toBeNull()
  })

  it('perfilId "_equipe_" nos totais para identificacao', () => {
    const result = calcularDesempenhoEquipe({
      perfis: [],
      leads: [],
      tarefas: [],
      clientes: [],
      contratos: [],
      periodo: PERIODO_2026,
      servicosConfig: [],
    })
    expect(result.totais.perfilId).toBe('_equipe_')
  })
})
