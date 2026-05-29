// Phase 8 (D-06) — Persistencia do PeriodValue selecionado em /me/desempenho.
// Usa localStorage com guarda contra tampering (T-08-07): valida typeof
// antes de aceitar o JSON parseado e cai para o default em qualquer falha.

import { getCurrentYear, type PeriodValue } from './periods'

const KEY = 'consej_desempenho_period'

function defaultPeriod(): PeriodValue {
  return { year: getCurrentYear(), granularity: 'total' }
}

export function loadPeriod(): PeriodValue {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultPeriod()
    const parsed = JSON.parse(raw) as Partial<PeriodValue>
    if (
      typeof parsed.year === 'number'
      && typeof parsed.granularity === 'string'
    ) {
      return { year: parsed.year, granularity: parsed.granularity as PeriodValue['granularity'] }
    }
  } catch {
    /* fall through */
  }
  return defaultPeriod()
}

export function savePeriod(v: PeriodValue): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ignore quota errors */
  }
}
