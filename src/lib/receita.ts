// Helpers puros de cálculo financeiro para a página /receita (Phase 4).
//
// Fórmulas trancadas em .planning/phases/04-revenue-dashboard/04-CONTEXT.md:
//   D-01 — MRR pro-rata (valor_mensal + valor_total/duração)
//   D-01 — Row 2: Receita pontual no período (valor_total de consultorias com data_inicio no range)
//   D-03 — Forecast = MRR_atual + entradas - saídas (contratos sem data_fim NÃO entram em saídas)
//   D-05 — Renovações em 4 buckets (ate30 / de31a60 / de61a90 / semDataFim); só status='ativo'
//
// Provisão de risco (campo na tabela) NÃO contribui ao MRR (D-01).
//
// Padrão: funções puras com `today` injetável (mesma forma de src/lib/projecao.ts)
// para testabilidade determinística.

import {
  differenceInDays,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isWithinInterval,
} from 'date-fns'
import type { Contrato } from '@/types'
import { getDaysUntilExpiry } from '@/lib/utils'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type Urgencia = 'vencido' | 'critico' | 'alto' | 'medio' | 'baixo'

export interface MrrBreakdown {
  total: number
  assessoria: number
  consultoriaProRata: number
}

export interface MrrHistoryPoint {
  monthKey: string   // 'YYYY-MM'
  monthLabel: string // 'jan/26'
  mrr: number
}

export interface ForecastPoint {
  monthKey: string
  monthLabel: string
  baseline: number
}

export interface RenovacoesBuckets {
  ate30: (Contrato & { daysLeft: number })[]
  de31a60: (Contrato & { daysLeft: number })[]
  de61a90: (Contrato & { daysLeft: number })[]
  semDataFim: Contrato[]
}

export interface MrrOptions {
  defaultPontualMonths?: number // default 12 — usado quando valor_total sem data_fim
  today?: Date // se fornecido, contratos com data_inicio > today são excluídos do MRR atual
}

interface HistoryOptions extends MrrOptions {
  today?: Date
  months?: number // default 6
}

interface ForecastOptions extends MrrOptions {
  today?: Date
  months?: number // default 3
}

const ACTIVE = 'ativo'
const DEFAULT_PONTUAL_MONTHS = 12

// ─── helpers privados ────────────────────────────────────────────────────────

/**
 * Parseia uma string de data ('YYYY-MM-DD' ou ISO) como data LOCAL — evita o
 * pitfall de `new Date('2026-01-01')` ser interpretado como UTC midnight (que
 * em fusos negativos vira "31/12/2025 21:00 local") e bagunçar comparações
 * de mês.
 */
function parseDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

function mesesContrato(c: Contrato, defaultPontual: number): number {
  if (c.data_inicio && c.data_fim) {
    const days = differenceInDays(parseDate(c.data_fim), parseDate(c.data_inicio))
    // Pitfall 4: data_inicio == data_fim → days = 0 → garantir mínimo 1 mês
    return Math.max(1, Math.ceil(days / 30))
  }
  return defaultPontual
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabelOf(d: Date): string {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

// ─── contribuicaoMensal (exportada para reuso isolado em Plan 03) ────────────

export function contribuicaoMensal(c: Contrato, opt: MrrOptions = {}): number {
  const defaultPontual = opt.defaultPontualMonths ?? DEFAULT_PONTUAL_MONTHS
  if (c.valor_mensal && c.valor_mensal > 0) return c.valor_mensal
  if (c.valor_total && c.valor_total > 0) {
    return c.valor_total / mesesContrato(c, defaultPontual)
  }
  return 0
}

// ─── calcularMrr (D-01) ──────────────────────────────────────────────────────

export function calcularMrr(contratos: Contrato[], opt: MrrOptions = {}): MrrBreakdown {
  const today = opt.today
  const ativos = contratos.filter(c => {
    if (c.status !== ACTIVE) return false
    // Se `today` foi fornecido, excluir contratos que ainda não começaram
    // (evita double-counting com `calcularForecast.entradas`).
    if (today && c.data_inicio) {
      const inicio = parseDate(c.data_inicio)
      if (inicio > today) return false
    }
    return true
  })
  let assessoria = 0
  let consultoria = 0
  for (const c of ativos) {
    const v = contribuicaoMensal(c, opt)
    if (c.tipo === 'assessoria') assessoria += v
    else consultoria += v
  }
  return {
    total: assessoria + consultoria,
    assessoria,
    consultoriaProRata: consultoria,
  }
}

// ─── calcularReceitaPontualPeriodo (D-01 Row 2 + Open Q2 RESOLVED) ───────────

/**
 * Soma `valor_total` dos contratos `tipo='consultoria'` `status='ativo'` cujo
 * `data_inicio` cai dentro do range. Helper desacoplado de `PeriodValue` —
 * caller (Plan 03) converte `PeriodValue → { start, end }` via `getPeriodRange`.
 */
export function calcularReceitaPontualPeriodo(
  contratos: Contrato[],
  range: { start: Date; end: Date },
): number {
  let total = 0
  for (const c of contratos) {
    if (c.status !== ACTIVE) continue
    if (c.tipo !== 'consultoria') continue
    if (!c.data_inicio) continue
    const inicio = parseDate(c.data_inicio)
    if (isWithinInterval(inicio, { start: range.start, end: range.end })) {
      total += c.valor_total ?? 0
    }
  }
  return total
}

// ─── calcularMrrHistorico ────────────────────────────────────────────────────

/**
 * Reconstrói o MRR retroativo: para cada mês N do histórico, soma
 * `contribuicaoMensal` dos contratos cujo `data_inicio <= fim_do_mes_N` E
 * (`data_fim == null` OU `data_fim >= inicio_do_mes_N`).
 *
 * Retorna pontos em ordem cronológica crescente (mais antigo → mais novo).
 */
export function calcularMrrHistorico(
  contratos: Contrato[],
  opt: HistoryOptions = {},
): MrrHistoryPoint[] {
  const today = opt.today ?? new Date()
  const months = opt.months ?? 6
  const points: MrrHistoryPoint[] = []
  for (let i = months - 1; i >= 0; i--) {
    const target = subMonths(startOfMonth(today), i)
    const targetStart = target
    const targetEnd = endOfMonth(target)
    const ativosNoMes = contratos.filter(c => {
      if (c.status !== ACTIVE) return false
      if (!c.data_inicio) return false
      const inicio = parseDate(c.data_inicio)
      const fim = c.data_fim ? parseDate(c.data_fim) : null
      return inicio <= targetEnd && (fim === null || fim >= targetStart)
    })
    const mrr = ativosNoMes.reduce((s, c) => s + contribuicaoMensal(c, opt), 0)
    points.push({
      monthKey: monthKeyOf(target),
      monthLabel: monthLabelOf(target),
      mrr,
    })
  }
  return points
}

// ─── calcularForecast (D-03) ─────────────────────────────────────────────────

/**
 * Forecast próximos N meses (default 3). Modelo realista:
 *   baseline[N] = runningMrr[N-1] + entradas[N] - saídas[N]
 *
 * Contratos sem `data_fim` NUNCA entram em saídas (Pitfall 3).
 */
export function calcularForecast(
  contratos: Contrato[],
  opt: ForecastOptions = {},
): ForecastPoint[] {
  const today = opt.today ?? new Date()
  const months = opt.months ?? 3
  const mrrAtual = calcularMrr(contratos, { ...opt, today }).total
  const points: ForecastPoint[] = []
  let runningMrr = mrrAtual

  for (let i = 1; i <= months; i++) {
    const target = addMonths(startOfMonth(today), i)
    const targetStart = target
    const targetEnd = endOfMonth(target)

    // Entradas: contratos ativos com data_inicio neste mês
    const entradas = contratos
      .filter(c => c.status === ACTIVE && c.data_inicio)
      .filter(c =>
        isWithinInterval(parseDate(c.data_inicio as string), {
          start: targetStart,
          end: targetEnd,
        }),
      )
      .reduce((s, c) => s + contribuicaoMensal(c, opt), 0)

    // Saídas: contratos ativos com data_fim caindo neste mês (ignora null)
    const saidas = contratos
      .filter(c => c.status === ACTIVE && c.data_fim != null)
      .filter(c =>
        isWithinInterval(parseDate(c.data_fim as string), {
          start: targetStart,
          end: targetEnd,
        }),
      )
      .reduce((s, c) => s + contribuicaoMensal(c, opt), 0)

    runningMrr = runningMrr + entradas - saidas
    points.push({
      monthKey: monthKeyOf(target),
      monthLabel: monthLabelOf(target),
      baseline: runningMrr,
    })
  }
  return points
}

// ─── classifyUrgency (extraído de RenovacoesPage — DRY) ──────────────────────

export function classifyUrgency(daysLeft: number): Urgencia {
  if (daysLeft < 0) return 'vencido'
  if (daysLeft <= 30) return 'critico'
  if (daysLeft <= 60) return 'alto'
  if (daysLeft <= 90) return 'medio'
  return 'baixo'
}

// ─── classificarRenovacoes (D-05) ────────────────────────────────────────────

export function classificarRenovacoes(contratos: Contrato[]): RenovacoesBuckets {
  const result: RenovacoesBuckets = {
    ate30: [],
    de31a60: [],
    de61a90: [],
    semDataFim: [],
  }
  for (const c of contratos) {
    if (c.status !== ACTIVE) continue
    if (!c.data_fim) {
      result.semDataFim.push(c)
      continue
    }
    const d = getDaysUntilExpiry(c.data_fim)
    if (d === null) continue
    if (d < 0 || d > 90) continue
    const item = { ...c, daysLeft: d }
    if (d <= 30) result.ate30.push(item)
    else if (d <= 60) result.de31a60.push(item)
    else result.de61a90.push(item)
  }
  // Ordenar cada bucket por daysLeft asc (mais urgente primeiro)
  result.ate30.sort((a, b) => a.daysLeft - b.daysLeft)
  result.de31a60.sort((a, b) => a.daysLeft - b.daysLeft)
  result.de61a90.sort((a, b) => a.daysLeft - b.daysLeft)
  return result
}
