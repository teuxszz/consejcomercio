import { describe, it, expect } from 'vitest'
import {
  calcularMrr,
  calcularReceitaPontualPeriodo,
  calcularMrrHistorico,
  calcularForecast,
  classificarRenovacoes,
  classifyUrgency,
} from '../receita'
import type { Contrato } from '@/types'

// Data fixa de referência: 15 de janeiro de 2026.
const TODAY = new Date(2026, 0, 15)

let nextId = 1
function contratoAtivo(overrides: Partial<Contrato> = {}): Contrato {
  const id = `c-${nextId++}`
  return {
    id,
    cliente_id: `cli-${id}`,
    tipo: 'assessoria',
    modelo_precificacao: 'mensal',
    areas_direito: [],
    status: 'ativo',
    rm_status: 'em_dia',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─── calcularMrr ─────────────────────────────────────────────────────────────

describe('calcularMrr', () => {
  it('lista vazia → tudo zero', () => {
    expect(calcularMrr([])).toEqual({ total: 0, assessoria: 0, consultoriaProRata: 0 })
  })

  it('soma valor_mensal direto para contratos assessoria ativos', () => {
    const contratos = [
      contratoAtivo({ tipo: 'assessoria', valor_mensal: 3000 }),
      contratoAtivo({ tipo: 'assessoria', valor_mensal: 2000 }),
    ]
    const r = calcularMrr(contratos)
    expect(r.assessoria).toBe(5000)
    expect(r.total).toBe(5000)
  })

  it('pro-rata: consultoria valor_total=12000 cobrindo 6 meses → contribui 2000', () => {
    const contratos = [
      contratoAtivo({
        tipo: 'consultoria',
        valor_total: 12000,
        data_inicio: '2026-01-01',
        data_fim: '2026-07-01', // ~182 dias → ceil(182/30) = 7? Vamos checar com 180 dias
      }),
    ]
    // Ajuste: 6 meses = 180 dias exatos → ceil(180/30) = 6
    contratos[0].data_fim = '2026-06-30' // 180 dias até 06-30
    const r = calcularMrr(contratos)
    expect(r.consultoriaProRata).toBe(2000)
    expect(r.total).toBe(2000)
  })

  it('default 12m: contrato com valor_total=12000 sem data_fim → contribui 1000', () => {
    const contratos = [
      contratoAtivo({ tipo: 'consultoria', valor_total: 12000, data_inicio: '2025-01-01', data_fim: null }),
    ]
    const r = calcularMrr(contratos)
    expect(r.consultoriaProRata).toBe(1000)
  })

  it('ignora contratos com status != ativo', () => {
    const contratos = [
      contratoAtivo({ tipo: 'assessoria', valor_mensal: 5000, status: 'encerrado' }),
      contratoAtivo({ tipo: 'assessoria', valor_mensal: 5000, status: 'suspenso' }),
    ]
    expect(calcularMrr(contratos).total).toBe(0)
  })

  it('breakdown por tipo: separa assessoria vs consultoriaProRata corretamente', () => {
    const contratos = [
      contratoAtivo({ tipo: 'assessoria', valor_mensal: 3000 }),
      contratoAtivo({
        tipo: 'consultoria',
        valor_total: 6000,
        data_inicio: '2026-01-01',
        data_fim: '2026-06-30', // 180 dias → 6 meses → 1000/mês
      }),
    ]
    const r = calcularMrr(contratos)
    expect(r.assessoria).toBe(3000)
    expect(r.consultoriaProRata).toBe(1000)
    expect(r.total).toBe(4000)
  })

  it('valor_protegido nao entra: contrato só com valor_protegido contribui 0', () => {
    const contratos = [
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: null,
        valor_total: null,
        valor_protegido: 99999,
      }),
    ]
    const r = calcularMrr(contratos)
    expect(r.total).toBe(0)
    expect(r.assessoria).toBe(0)
  })

  it('divisão por zero: data_inicio == data_fim NÃO retorna Infinity/NaN', () => {
    const contratos = [
      contratoAtivo({
        tipo: 'consultoria',
        valor_total: 6000,
        data_inicio: '2026-01-01',
        data_fim: '2026-01-01', // 0 dias → Math.max(1, ceil(0/30)) = 1
      }),
    ]
    const r = calcularMrr(contratos)
    expect(Number.isFinite(r.total)).toBe(true)
    expect(r.consultoriaProRata).toBe(6000) // dividido por 1 mês mínimo
  })
})

// ─── calcularReceitaPontualPeriodo ───────────────────────────────────────────

describe('calcularReceitaPontualPeriodo', () => {
  const Q1 = { start: new Date(2026, 0, 1), end: new Date(2026, 2, 31) }

  it('Caso 1 — dentro do range: consultoria valor_total=15000 data_inicio=2026-02-10 → 15000', () => {
    const contratos = [
      contratoAtivo({ tipo: 'consultoria', valor_total: 15000, data_inicio: '2026-02-10' }),
    ]
    expect(calcularReceitaPontualPeriodo(contratos, Q1)).toBe(15000)
  })

  it('Caso 2 — fora do range: mesmo contrato em 2026-05-10 → 0', () => {
    const contratos = [
      contratoAtivo({ tipo: 'consultoria', valor_total: 15000, data_inicio: '2026-05-10' }),
    ]
    expect(calcularReceitaPontualPeriodo(contratos, Q1)).toBe(0)
  })

  it('Caso 3 — misto: um dentro (15000) + um fora (8000) no Q1 → 15000', () => {
    const contratos = [
      contratoAtivo({ tipo: 'consultoria', valor_total: 15000, data_inicio: '2026-02-10' }),
      contratoAtivo({ tipo: 'consultoria', valor_total: 8000, data_inicio: '2026-05-10' }),
    ]
    expect(calcularReceitaPontualPeriodo(contratos, Q1)).toBe(15000)
  })

  it('ignora contratos tipo=assessoria mesmo se data_inicio está no range', () => {
    const contratos = [
      contratoAtivo({ tipo: 'assessoria', valor_total: 9999, data_inicio: '2026-02-10' }),
    ]
    expect(calcularReceitaPontualPeriodo(contratos, Q1)).toBe(0)
  })

  it('ignora status != ativo mesmo se for consultoria no range', () => {
    const contratos = [
      contratoAtivo({ tipo: 'consultoria', valor_total: 9999, data_inicio: '2026-02-10', status: 'encerrado' }),
    ]
    expect(calcularReceitaPontualPeriodo(contratos, Q1)).toBe(0)
  })

  it('lista vazia → 0', () => {
    expect(calcularReceitaPontualPeriodo([], Q1)).toBe(0)
  })

  it('ignora contratos sem data_inicio (defensive — evita NaN)', () => {
    const contratos = [
      contratoAtivo({ tipo: 'consultoria', valor_total: 5000, data_inicio: null }),
    ]
    expect(calcularReceitaPontualPeriodo(contratos, Q1)).toBe(0)
  })
})

// ─── calcularMrrHistorico ────────────────────────────────────────────────────

describe('calcularMrrHistorico', () => {
  it('retorna 6 pontos por default; cada ponto = { monthKey, monthLabel, mrr }', () => {
    const pts = calcularMrrHistorico([], { today: TODAY })
    expect(pts).toHaveLength(6)
    for (const p of pts) {
      expect(typeof p.monthKey).toBe('string')
      expect(typeof p.monthLabel).toBe('string')
      expect(typeof p.mrr).toBe('number')
    }
  })

  it('pontos em ordem cronológica crescente (mais antigo → mais novo)', () => {
    const pts = calcularMrrHistorico([], { today: TODAY })
    const keys = pts.map(p => p.monthKey)
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
    // último é o mês corrente
    expect(pts[pts.length - 1].monthKey).toBe('2026-01')
  })

  it('contrato que iniciou após o mês N → não conta em N', () => {
    const contratos = [
      contratoAtivo({ tipo: 'assessoria', valor_mensal: 5000, data_inicio: '2026-01-01' }),
    ]
    const pts = calcularMrrHistorico(contratos, { today: TODAY })
    // Os 5 primeiros meses (2025-08..2025-12) NÃO contam — só janeiro/2026
    expect(pts[0].mrr).toBe(0)
    expect(pts[4].mrr).toBe(0)
    expect(pts[5].mrr).toBe(5000)
  })

  it('contrato encerrado antes do mês N → não conta em N', () => {
    const contratos = [
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 4000,
        data_inicio: '2025-01-01',
        data_fim: '2025-09-30', // termina em setembro
      }),
    ]
    const pts = calcularMrrHistorico(contratos, { today: TODAY })
    // historicamente: agosto (4000), setembro (4000), outubro→janeiro (0)
    expect(pts[0].mrr).toBe(4000) // ago
    expect(pts[1].mrr).toBe(4000) // set
    expect(pts[2].mrr).toBe(0) // out
    expect(pts[5].mrr).toBe(0) // jan
  })

  it('contrato com data_fim=null ativo desde antes → conta em todos os meses', () => {
    const contratos = [
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 2500,
        data_inicio: '2024-01-01',
        data_fim: null,
      }),
    ]
    const pts = calcularMrrHistorico(contratos, { today: TODAY })
    for (const p of pts) expect(p.mrr).toBe(2500)
  })
})

// ─── calcularForecast ────────────────────────────────────────────────────────

describe('calcularForecast', () => {
  it('retorna 3 pontos por default; ponto = { monthKey, monthLabel, baseline }', () => {
    const pts = calcularForecast([], { today: TODAY })
    expect(pts).toHaveLength(3)
    for (const p of pts) {
      expect(typeof p.monthKey).toBe('string')
      expect(typeof p.monthLabel).toBe('string')
      expect(typeof p.baseline).toBe('number')
    }
  })

  it('baseline mês 1 = MRR_atual + entradas - saídas para esse mês', () => {
    const contratos = [
      // MRR atual: 5000
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 5000,
        data_inicio: '2025-01-01',
        data_fim: null,
      }),
      // Entrada em fevereiro (mês 1 do forecast): +1000
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 1000,
        data_inicio: '2026-02-15',
        data_fim: null,
      }),
    ]
    const pts = calcularForecast(contratos, { today: TODAY, months: 1 })
    expect(pts[0].baseline).toBe(6000)
  })

  it('"null data_fim": contratos sem data_fim NUNCA aparecem como saída', () => {
    const contratos = [
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 10000,
        data_inicio: '2025-01-01',
        data_fim: null, // open-ended
      }),
    ]
    const pts = calcularForecast(contratos, { today: TODAY, months: 3 })
    // baseline deve permanecer 10000 em todos os meses (sem subtração)
    expect(pts[0].baseline).toBe(10000)
    expect(pts[1].baseline).toBe(10000)
    expect(pts[2].baseline).toBe(10000)
  })

  it('acumulativo: baseline[N] usa runningMrr de [N-1]', () => {
    const contratos = [
      // MRR atual 5000
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 5000,
        data_inicio: '2025-01-01',
        data_fim: null,
      }),
      // Saída em fevereiro: contrato encerra
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 5000,
        data_inicio: '2025-01-01',
        data_fim: '2026-02-15',
      }),
      // Entrada em março
      contratoAtivo({
        tipo: 'assessoria',
        valor_mensal: 2000,
        data_inicio: '2026-03-10',
        data_fim: null,
      }),
    ]
    const pts = calcularForecast(contratos, { today: TODAY, months: 3 })
    // MRR atual = 5000 + 5000 = 10000
    // Fev (mês 1): -5000 → 5000
    // Mar (mês 2): +2000 → 7000
    // Abr (mês 3): sem mudança → 7000
    expect(pts[0].baseline).toBe(5000)
    expect(pts[1].baseline).toBe(7000)
    expect(pts[2].baseline).toBe(7000)
  })
})

// ─── classificarRenovacoes ───────────────────────────────────────────────────

describe('classificarRenovacoes', () => {
  function diasAFrente(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  it('4 buckets retornados (ate30, de31a60, de61a90, semDataFim)', () => {
    const r = classificarRenovacoes([])
    expect(r).toEqual({ ate30: [], de31a60: [], de61a90: [], semDataFim: [] })
  })

  it('status != ativo → ignorado em todos os buckets', () => {
    const contratos = [
      contratoAtivo({ status: 'encerrado', data_fim: diasAFrente(15) }),
      contratoAtivo({ status: 'suspenso', data_fim: diasAFrente(45) }),
    ]
    const r = classificarRenovacoes(contratos)
    expect(r.ate30).toHaveLength(0)
    expect(r.de31a60).toHaveLength(0)
    expect(r.de61a90).toHaveLength(0)
    expect(r.semDataFim).toHaveLength(0)
  })

  it('data_fim=null + status ativo → vai para semDataFim', () => {
    const contratos = [contratoAtivo({ data_fim: null })]
    const r = classificarRenovacoes(contratos)
    expect(r.semDataFim).toHaveLength(1)
    expect(r.ate30).toHaveLength(0)
  })

  it('data_fim vencido (daysLeft < 0) → ignorado', () => {
    const contratos = [contratoAtivo({ data_fim: diasAFrente(-5) })]
    const r = classificarRenovacoes(contratos)
    expect(r.ate30).toHaveLength(0)
    expect(r.semDataFim).toHaveLength(0)
  })

  it('data_fim em 95d → ignorado (>90d)', () => {
    const contratos = [contratoAtivo({ data_fim: diasAFrente(95) })]
    const r = classificarRenovacoes(contratos)
    expect(r.ate30).toHaveLength(0)
    expect(r.de31a60).toHaveLength(0)
    expect(r.de61a90).toHaveLength(0)
  })

  it('classifica em buckets corretos: 15d→ate30, 45d→de31a60, 75d→de61a90', () => {
    const contratos = [
      contratoAtivo({ data_fim: diasAFrente(15) }),
      contratoAtivo({ data_fim: diasAFrente(45) }),
      contratoAtivo({ data_fim: diasAFrente(75) }),
    ]
    const r = classificarRenovacoes(contratos)
    expect(r.ate30).toHaveLength(1)
    expect(r.de31a60).toHaveLength(1)
    expect(r.de61a90).toHaveLength(1)
  })

  it('ordenação dentro de cada bucket: daysLeft asc (mais urgente primeiro)', () => {
    const contratos = [
      contratoAtivo({ data_fim: diasAFrente(28) }),
      contratoAtivo({ data_fim: diasAFrente(5) }),
      contratoAtivo({ data_fim: diasAFrente(15) }),
    ]
    const r = classificarRenovacoes(contratos)
    expect(r.ate30.map(c => c.daysLeft)).toEqual([5, 15, 28])
  })
})

// ─── classifyUrgency ─────────────────────────────────────────────────────────

describe('classifyUrgency', () => {
  it('-1 → vencido', () => {
    expect(classifyUrgency(-1)).toBe('vencido')
  })

  it('0 e 30 → critico', () => {
    expect(classifyUrgency(0)).toBe('critico')
    expect(classifyUrgency(30)).toBe('critico')
  })

  it('31 e 60 → alto', () => {
    expect(classifyUrgency(31)).toBe('alto')
    expect(classifyUrgency(60)).toBe('alto')
  })

  it('61 e 90 → medio', () => {
    expect(classifyUrgency(61)).toBe('medio')
    expect(classifyUrgency(90)).toBe('medio')
  })

  it('91 → baixo', () => {
    expect(classifyUrgency(91)).toBe('baixo')
  })
})
