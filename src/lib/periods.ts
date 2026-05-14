// Periodização CONSEJ: ano civil (jan→dez), granularidades trimestral/semestral.
// Usado por Dashboard, Analytics e Kanban para filtrar dados por período.

export type Granularity = 'total' | 'q1' | 'q2' | 'q3' | 'q4' | 's1' | 's2'

export interface PeriodValue {
  year: number
  granularity: Granularity
}

export interface DateRange {
  from: Date
  to: Date
}

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  total: 'Ano',
  q1:    'T1 (jan-mar)',
  q2:    'T2 (abr-jun)',
  q3:    'T3 (jul-set)',
  q4:    'T4 (out-dez)',
  s1:    'S1 (jan-jun)',
  s2:    'S2 (jul-dez)',
}

export const GRANULARITY_SHORT: Record<Granularity, string> = {
  total: 'Total',
  q1: 'T1', q2: 'T2', q3: 'T3', q4: 'T4',
  s1: 'S1', s2: 'S2',
}

export function getCurrentYear(): number {
  return new Date().getFullYear()
}

export function getYearRange(year: number): DateRange {
  return {
    from: new Date(year, 0, 1, 0, 0, 0, 0),
    to:   new Date(year, 11, 31, 23, 59, 59, 999),
  }
}

export function getQuarterRange(year: number, q: 1 | 2 | 3 | 4): DateRange {
  const startMonth = (q - 1) * 3
  return {
    from: new Date(year, startMonth, 1, 0, 0, 0, 0),
    to:   new Date(year, startMonth + 3, 0, 23, 59, 59, 999), // day=0 of next month = last day of this
  }
}

export function getSemesterRange(year: number, s: 1 | 2): DateRange {
  const startMonth = (s - 1) * 6
  return {
    from: new Date(year, startMonth, 1, 0, 0, 0, 0),
    to:   new Date(year, startMonth + 6, 0, 23, 59, 59, 999),
  }
}

export function getPeriodRange(value: PeriodValue): DateRange {
  const { year, granularity } = value
  switch (granularity) {
    case 'total': return getYearRange(year)
    case 'q1':    return getQuarterRange(year, 1)
    case 'q2':    return getQuarterRange(year, 2)
    case 'q3':    return getQuarterRange(year, 3)
    case 'q4':    return getQuarterRange(year, 4)
    case 's1':    return getSemesterRange(year, 1)
    case 's2':    return getSemesterRange(year, 2)
  }
}

// Mesmo período do ano anterior — usado para comparação delta %.
export function getPreviousPeriodRange(value: PeriodValue): DateRange {
  return getPeriodRange({ year: value.year - 1, granularity: value.granularity })
}

// Verifica se uma data ISO/Date cai dentro do range.
export function isInRange(dateLike: string | Date | null | undefined, range: DateRange): boolean {
  if (!dateLike) return false
  const d = typeof dateLike === 'string' ? new Date(dateLike) : dateLike
  const t = d.getTime()
  return t >= range.from.getTime() && t <= range.to.getTime()
}

// Extrai os anos distintos presentes nos dados (a partir de created_at) para
// alimentar o seletor de anos. Sempre inclui o ano corrente, mesmo sem dados.
export function availableYears<T extends { created_at?: string | null }>(items: T[]): number[] {
  const set = new Set<number>()
  set.add(getCurrentYear())
  for (const item of items) {
    if (item.created_at) {
      const y = new Date(item.created_at).getFullYear()
      if (!Number.isNaN(y)) set.add(y)
    }
  }
  return Array.from(set).sort((a, b) => b - a)
}

export function isCurrentCycle(value: PeriodValue): boolean {
  return value.year === getCurrentYear()
}

export function formatPeriodLabel(value: PeriodValue): string {
  if (value.granularity === 'total') return String(value.year)
  return `${GRANULARITY_SHORT[value.granularity]} ${value.year}`
}
