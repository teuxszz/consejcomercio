import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PeriodSelector } from '../shared/PeriodSelector'
import type { PeriodValue } from '@/lib/periods'

const value: PeriodValue = { year: 2025, granularity: 'total' }

describe('PeriodSelector', () => {
  it('renderiza sem crash e mostra o ano selecionado', () => {
    render(<PeriodSelector value={value} onChange={vi.fn()} years={[2025, 2024, 2023]} />)
    expect(screen.getByText('2025')).toBeInTheDocument()
  })

  it('mostra o rótulo da granularidade selecionada', () => {
    render(<PeriodSelector value={value} onChange={vi.fn()} years={[2025]} />)
    // granularidade 'total' → label "Ano"
    expect(screen.getByText('Ano')).toBeInTheDocument()
  })

  it('renderiza os 2 selects (ano + granularidade)', () => {
    render(<PeriodSelector value={value} onChange={vi.fn()} years={[2025]} />)
    const combos = screen.getAllByRole('combobox')
    expect(combos).toHaveLength(2)
  })
})
