import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  GRANULARITY_LABELS,
  availableYears,
  getCurrentYear,
  type Granularity,
  type PeriodValue,
} from '@/lib/periods'

const GRANULARITY_ORDER: Granularity[] = ['total', 'q1', 'q2', 'q3', 'q4', 's1', 's2']

interface Props {
  value: PeriodValue
  onChange: (next: PeriodValue) => void
  years?: number[]
  // Conjunto de dados de onde derivar os anos disponíveis (alternativa a years).
  derivedYearsFrom?: { created_at?: string | null }[]
}

export function PeriodSelector({ value, onChange, years, derivedYearsFrom }: Props) {
  const yearList = years
    ?? (derivedYearsFrom ? availableYears(derivedYearsFrom) : [getCurrentYear(), getCurrentYear() - 1, getCurrentYear() - 2])

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={String(value.year)}
        onValueChange={(v) => onChange({ ...value, year: Number(v) })}
      >
        <SelectTrigger className="h-8 text-xs w-[88px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {yearList.map(y => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.granularity}
        onValueChange={(v) => onChange({ ...value, granularity: v as Granularity })}
      >
        <SelectTrigger className="h-8 text-xs w-[148px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GRANULARITY_ORDER.map(g => (
            <SelectItem key={g} value={g}>{GRANULARITY_LABELS[g]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
