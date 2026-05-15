import { describe, it, expect } from 'vitest'
import {
  getYearRange,
  getQuarterRange,
  getSemesterRange,
  getPeriodRange,
  getPreviousPeriodRange,
  isInRange,
  availableYears,
  isCurrentCycle,
  formatPeriodLabel,
  getCurrentYear,
} from '../periods'

describe('getYearRange', () => {
  it('cobre o ano civil inteiro (jan 1 → dez 31)', () => {
    const r = getYearRange(2025)
    expect(r.from.getFullYear()).toBe(2025)
    expect(r.from.getMonth()).toBe(0)
    expect(r.from.getDate()).toBe(1)
    expect(r.to.getFullYear()).toBe(2025)
    expect(r.to.getMonth()).toBe(11)
    expect(r.to.getDate()).toBe(31)
  })
})

describe('getQuarterRange', () => {
  it('T1 = jan-mar', () => {
    const r = getQuarterRange(2025, 1)
    expect(r.from.getMonth()).toBe(0)
    expect(r.to.getMonth()).toBe(2)
    expect(r.to.getDate()).toBe(31)
  })
  it('T2 = abr-jun (junho tem 30 dias)', () => {
    const r = getQuarterRange(2025, 2)
    expect(r.from.getMonth()).toBe(3)
    expect(r.to.getMonth()).toBe(5)
    expect(r.to.getDate()).toBe(30)
  })
  it('T4 = out-dez', () => {
    const r = getQuarterRange(2025, 4)
    expect(r.from.getMonth()).toBe(9)
    expect(r.to.getMonth()).toBe(11)
    expect(r.to.getDate()).toBe(31)
  })
})

describe('getSemesterRange', () => {
  it('S1 = jan-jun', () => {
    const r = getSemesterRange(2025, 1)
    expect(r.from.getMonth()).toBe(0)
    expect(r.to.getMonth()).toBe(5)
  })
  it('S2 = jul-dez', () => {
    const r = getSemesterRange(2025, 2)
    expect(r.from.getMonth()).toBe(6)
    expect(r.to.getMonth()).toBe(11)
  })
})

describe('getPeriodRange', () => {
  it('granularidade total devolve o ano inteiro', () => {
    const r = getPeriodRange({ year: 2024, granularity: 'total' })
    expect(r.from.getMonth()).toBe(0)
    expect(r.to.getMonth()).toBe(11)
  })
  it('granularidade q3 devolve jul-set', () => {
    const r = getPeriodRange({ year: 2024, granularity: 'q3' })
    expect(r.from.getMonth()).toBe(6)
    expect(r.to.getMonth()).toBe(8)
  })
})

describe('getPreviousPeriodRange', () => {
  it('devolve o mesmo período do ano anterior', () => {
    const r = getPreviousPeriodRange({ year: 2025, granularity: 'q2' })
    expect(r.from.getFullYear()).toBe(2024)
    expect(r.from.getMonth()).toBe(3)
  })
})

describe('isInRange', () => {
  const range = getYearRange(2025)
  it('aceita data dentro do intervalo', () => {
    expect(isInRange('2025-06-15T12:00:00Z', range)).toBe(true)
  })
  it('rejeita data fora do intervalo', () => {
    expect(isInRange('2024-12-31T12:00:00Z', range)).toBe(false)
    expect(isInRange('2026-01-01T12:00:00Z', range)).toBe(false)
  })
  it('rejeita null/undefined sem lançar erro', () => {
    expect(isInRange(null, range)).toBe(false)
    expect(isInRange(undefined, range)).toBe(false)
  })
  it('aceita objeto Date direto', () => {
    expect(isInRange(new Date('2025-03-01'), range)).toBe(true)
  })
})

describe('availableYears', () => {
  it('sempre inclui o ano corrente, mesmo sem dados', () => {
    expect(availableYears([])).toContain(getCurrentYear())
  })
  it('extrai anos distintos de created_at e ordena desc', () => {
    const anos = availableYears([
      { created_at: '2023-05-01T12:00:00+00:00' },
      { created_at: '2025-06-01T12:00:00+00:00' },
      { created_at: '2023-11-01T12:00:00+00:00' },
    ])
    expect(anos[0]).toBeGreaterThanOrEqual(anos[anos.length - 1])
    expect(anos).toContain(2023)
    expect(anos).toContain(2025)
  })
  it('ignora created_at ausente sem quebrar', () => {
    const anos = availableYears([{ created_at: null }, { created_at: undefined }])
    expect(anos).toContain(getCurrentYear())
  })
})

describe('isCurrentCycle', () => {
  it('true para o ano corrente', () => {
    expect(isCurrentCycle({ year: getCurrentYear(), granularity: 'total' })).toBe(true)
  })
  it('false para ano passado', () => {
    expect(isCurrentCycle({ year: getCurrentYear() - 1, granularity: 'total' })).toBe(false)
  })
})

describe('formatPeriodLabel', () => {
  it('total mostra só o ano', () => {
    expect(formatPeriodLabel({ year: 2025, granularity: 'total' })).toBe('2025')
  })
  it('granularidade mostra sigla + ano', () => {
    expect(formatPeriodLabel({ year: 2025, granularity: 'q2' })).toBe('T2 2025')
    expect(formatPeriodLabel({ year: 2025, granularity: 's1' })).toBe('S1 2025')
  })
})
