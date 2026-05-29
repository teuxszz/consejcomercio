import { describe, it, expect, beforeEach } from 'vitest'
import { calcularDesempenho } from '../desempenho'
import { loadPeriod, savePeriod } from '../desempenho-period'
import type { PeriodValue } from '../periods'
import { getCurrentYear } from '../periods'
import type { Lead, Tarefa, Cliente, Contrato } from '@/types'

// ─── Fixtures builders ─────────────────────────────────────────────────────

const PERFIL_ID = 'p1'
const PERFIL_NOME = 'Gabriel Araujo'
const PERIODO_2026: PeriodValue = { year: 2026, granularity: 'total' }

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
    responsavel_id: PERFIL_ID,
    ...overrides,
  }
}

function tarefaFix(overrides: Partial<Tarefa> = {}): Tarefa {
  return {
    id: overrides.id ?? `tarefa-${Math.random().toString(36).slice(2, 8)}`,
    titulo: 'Tarefa Teste',
    tipo: 'generica',
    prioridade: 'media',
    status: 'concluida',
    atribuido_a_id: PERFIL_ID,
    data_conclusao: '2026-03-15T10:00:00Z',
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    ...overrides,
  }
}

function clienteFix(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: overrides.id ?? `cli-${Math.random().toString(36).slice(2, 8)}`,
    nome: 'Cliente Teste',
    empresa: 'Empresa Cliente',
    segmento: 'startup',
    status: 'ativo',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function contratoFix(overrides: Partial<Contrato> = {}): Contrato {
  return {
    id: overrides.id ?? `ctr-${Math.random().toString(36).slice(2, 8)}`,
    cliente_id: 'cli-1',
    tipo: 'assessoria',
    modelo_precificacao: 'assessoria_12m',
    areas_direito: [],
    status: 'ativo',
    rm_status: 'nao_aplicavel',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    responsavel_id: PERFIL_ID,
    ...overrides,
  }
}

function baseInput(overrides: {
  leads?: Lead[]
  tarefas?: Tarefa[]
  clientes?: Cliente[]
  contratos?: Contrato[]
} = {}) {
  return {
    leads: overrides.leads ?? [],
    tarefas: overrides.tarefas ?? [],
    clientes: overrides.clientes ?? [],
    contratos: overrides.contratos ?? [],
    perfilId: PERFIL_ID,
    perfilNome: PERFIL_NOME,
    periodo: PERIODO_2026,
    servicosConfig: [],
  }
}

// ─── calcularDesempenho ────────────────────────────────────────────────────

describe('calcularDesempenho', () => {
  it('lista vazia → metricas zero/null', () => {
    const r = calcularDesempenho(baseInput())
    expect(r.leads_criados).toBe(0)
    expect(r.convertidos).toBe(0)
    expect(r.perdidos).toBe(0)
    expect(r.win_rate).toBe(0)
    expect(r.tarefas_concluidas).toBe(0)
    expect(r.ciclo_medio_dias).toBeNull()
    expect(r.icp_fit_medio).toBeNull()
    expect(r.nps_medio).toBeNull()
    expect(r.perfilId).toBe(PERFIL_ID)
    expect(r.perfilNome).toBe(PERFIL_NOME)
  })

  it('filtra por responsavel_id — leads de outro perfil sao ignorados', () => {
    const r = calcularDesempenho(baseInput({
      leads: [
        leadFix({ responsavel_id: PERFIL_ID }),
        leadFix({ responsavel_id: 'p2' }),
        leadFix({ responsavel_id: 'p3' }),
      ],
    }))
    expect(r.leads_criados).toBe(1)
  })

  it('filtra por periodo — leads fora do range ignorados', () => {
    const r = calcularDesempenho(baseInput({
      leads: [
        leadFix({ created_at: '2026-06-15T10:00:00Z' }),     // dentro
        leadFix({ created_at: '2025-12-15T10:00:00Z' }),     // ano anterior
        leadFix({ created_at: '2027-01-15T10:00:00Z' }),     // ano posterior
      ],
    }))
    expect(r.leads_criados).toBe(1)
  })

  it('win_rate = round((ganhos / (ganhos + perdidos)) * 100) — 3 ganhos + 1 perdido = 75', () => {
    const r = calcularDesempenho(baseInput({
      leads: [
        leadFix({ status: 'ganho_assessoria' }),
        leadFix({ status: 'ganho_assessoria' }),
        leadFix({ status: 'ganho_consultoria' }),
        leadFix({ status: 'perdido' }),
      ],
    }))
    expect(r.convertidos).toBe(3)
    expect(r.perdidos).toBe(1)
    expect(r.win_rate).toBe(75)
  })

  it('ciclo_medio_dias = AVG dias (updated_at - created_at) somente ganhos; sem ganhos → null', () => {
    const r1 = calcularDesempenho(baseInput({
      leads: [
        leadFix({
          status: 'ganho_assessoria',
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-11T00:00:00Z',  // 10 dias
        }),
        leadFix({
          status: 'ganho_consultoria',
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-21T00:00:00Z',  // 20 dias
        }),
      ],
    }))
    expect(r1.ciclo_medio_dias).toBe(15)

    const r2 = calcularDesempenho(baseInput({
      leads: [leadFix({ status: 'perdido' })],
    }))
    expect(r2.ciclo_medio_dias).toBeNull()
  })

  it('nps_medio agrega clientes via contratos.responsavel_id (Pitfall 6)', () => {
    const r = calcularDesempenho(baseInput({
      clientes: [
        clienteFix({ id: 'cli-1', nps_score: 9 }),
        clienteFix({ id: 'cli-2', nps_score: 7 }),
        clienteFix({ id: 'cli-3', nps_score: 10 }),  // NAO esta nos contratos
        clienteFix({ id: 'cli-4', nps_score: null }), // sem NPS
      ],
      contratos: [
        contratoFix({ cliente_id: 'cli-1', responsavel_id: PERFIL_ID }),
        contratoFix({ cliente_id: 'cli-2', responsavel_id: PERFIL_ID }),
        contratoFix({ cliente_id: 'cli-4', responsavel_id: PERFIL_ID }),
        contratoFix({ cliente_id: 'cli-3', responsavel_id: 'p2' }),  // outro perfil
      ],
    }))
    // cli-1=9, cli-2=7 → media 8.0
    expect(r.nps_medio).toBe(8.0)

    // sem clientes com NPS → null
    const r2 = calcularDesempenho(baseInput())
    expect(r2.nps_medio).toBeNull()
  })

  it('tarefas_concluidas conta status=concluida + atribuido_a_id + data_conclusao IN range', () => {
    const r = calcularDesempenho(baseInput({
      tarefas: [
        tarefaFix({ status: 'concluida', data_conclusao: '2026-03-15T10:00:00Z' }),  // OK
        tarefaFix({ status: 'concluida', data_conclusao: '2026-04-20T10:00:00Z' }),  // OK
        tarefaFix({ status: 'aberta',    data_conclusao: '2026-03-15T10:00:00Z' }),  // status != concluida
        tarefaFix({ status: 'concluida', atribuido_a_id: 'p2', data_conclusao: '2026-03-15T10:00:00Z' }), // outro perfil
        tarefaFix({ status: 'concluida', data_conclusao: '2025-12-15T10:00:00Z' }),  // fora periodo
        tarefaFix({ status: 'concluida', data_conclusao: null }),                     // sem data
      ],
    }))
    expect(r.tarefas_concluidas).toBe(2)
  })

  it('icp_fit_medio retorna null quando perfil nao tem leads no periodo', () => {
    const r = calcularDesempenho(baseInput({
      leads: [leadFix({ responsavel_id: 'p2' })],  // perfil nao tem leads
    }))
    expect(r.icp_fit_medio).toBeNull()
  })
})

// ─── desempenho-period (loadPeriod / savePeriod) ───────────────────────────

describe('desempenho-period', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loadPeriod() retorna default { year: currentYear, granularity: total } quando localStorage vazio', () => {
    const r = loadPeriod()
    expect(r.year).toBe(getCurrentYear())
    expect(r.granularity).toBe('total')
  })

  it('savePeriod() persiste e loadPeriod() recupera', () => {
    const v: PeriodValue = { year: 2025, granularity: 'q2' }
    savePeriod(v)
    expect(loadPeriod()).toEqual(v)
  })

  it('loadPeriod() retorna default quando JSON invalido (T-08-07 tampering)', () => {
    localStorage.setItem('consej_desempenho_period', '{"year":"not-a-number","granularity":42}')
    const r = loadPeriod()
    expect(r.year).toBe(getCurrentYear())
    expect(r.granularity).toBe('total')

    // garbage tambem cai pro default
    localStorage.setItem('consej_desempenho_period', 'this-is-not-json')
    const r2 = loadPeriod()
    expect(r2.year).toBe(getCurrentYear())
    expect(r2.granularity).toBe('total')
  })
})
